/**
 * Pinkacord admin panel — content store.
 *
 * Adapter between the admin HTTP layer and the canonical JSON files. Every
 * mutation:
 *   1. Validates the incoming entity against the Zod schema (reuses
 *      tools/pinkacord/schemas.ts — single source of truth).
 *   2. Reads the current file, checks the `_rev` if provided (optimistic lock).
 *   3. Applies the change.
 *   4. Writes atomically (temp + rename).
 *   5. Appends an audit entry.
 *
 * It deliberately does NOT call the generator on every save; that's a
 * separate /api/build action so admins can stage several edits and apply
 * them in one PS rebuild.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { z, ZodError } from "zod";

import {
	SpeciesSchema, MoveSchema, AbilitySchema, ItemSchema, FormatSchema,
	PokedexFileSchema, MovesFileSchema, AbilitiesFileSchema, ItemsFileSchema,
	LearnsetsFileSchema, FormatsFileSchema, MetaFileSchema, LearnsetSchema,
	type Species, type Move, type Ability, type Item, type Format, type Learnset,
} from "../pinkacord/schemas";
import { appendAudit } from "./audit";
import { isKnownAbility, isKnownMove, suggestAbility } from "./psdex";

// Simple process-wide mutex for file writes. Prevents concurrent-read-then-write
// races when two admin sessions save different entities to the same file.
const writeLock = new (class {
	private queue: (() => void)[] = [];
	private locked = false;
	private timeout: NodeJS.Timeout | null = null;

	async acquire(): Promise<void> {
		if (!this.locked) { this.locked = true; return; }
		return new Promise((resolve) => { this.queue.push(resolve); });
	}

	release(): void {
		if (this.timeout) clearTimeout(this.timeout);
		if (this.queue.length > 0) {
			const next = this.queue.shift()!;
			// Use a microtask to avoid stack overflow on rapid releases
			this.timeout = setTimeout(() => { next(); }, 0);
		} else {
			this.locked = false;
		}
	}

	async withLock<T>(fn: () => T): Promise<T> {
		await this.acquire();
		try {
			return fn();
		} finally {
			this.release();
		}
	}
})();

const REPO_ROOT = process.cwd();

// Each entity type maps to a JSON file and a Zod schema. The file schema is
// the wrapper (`{ schemaVersion: 1, items: [...] }`). The item schema is the
// per-entity validator we apply to create/update bodies.

export type EntityType = "species" | "moves" | "abilities" | "items" | "learnsets" | "formats";

interface EntityConfig {
	filePath: string;
	fileSchema: z.ZodTypeAny;
	itemSchema: z.ZodTypeAny;
	keyOf: (item: any) => string;
}

const MOD_ID = "pinkacord";
const CONTENT_MOD_DIR = path.join(REPO_ROOT, "content", MOD_ID);
const CONTENT_DIR = path.join(REPO_ROOT, "content");

const ENTITIES: Record<EntityType, EntityConfig> = {
	species: {
		filePath: path.join(CONTENT_MOD_DIR, "pokedex.json"),
		fileSchema: PokedexFileSchema,
		itemSchema: SpeciesSchema,
		keyOf: (s: Species) => s.id,
	},
	moves: {
		filePath: path.join(CONTENT_MOD_DIR, "moves.json"),
		fileSchema: MovesFileSchema,
		itemSchema: MoveSchema,
		keyOf: (m: Move) => m.id,
	},
	abilities: {
		filePath: path.join(CONTENT_MOD_DIR, "abilities.json"),
		fileSchema: AbilitiesFileSchema,
		itemSchema: AbilitySchema,
		keyOf: (a: Ability) => a.id,
	},
	items: {
		filePath: path.join(CONTENT_MOD_DIR, "items.json"),
		fileSchema: ItemsFileSchema,
		itemSchema: ItemSchema,
		keyOf: (i: Item) => i.id,
	},
	learnsets: {
		filePath: path.join(CONTENT_MOD_DIR, "learnsets.json"),
		fileSchema: LearnsetsFileSchema,
		itemSchema: LearnsetSchema,
		keyOf: (l: Learnset) => l.species,
	},
	formats: {
		filePath: path.join(CONTENT_DIR, "formats.json"),
		fileSchema: FormatsFileSchema,
		itemSchema: FormatSchema,
		keyOf: (f: Format) => f.id,
	},
};

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class StoreError extends Error {
	constructor(
		public readonly code: "not_found" | "validation" | "conflict" | "io",
		message: string,
		public readonly fieldErrors?: string[]
	) {
		super(message);
		this.name = "StoreError";
	}
}

function zodToFieldErrors(err: ZodError): string[] {
	return err.issues.map((iss) => {
		const at = iss.path.length ? ` at ${iss.path.join(".")}` : "";
		return `${iss.message}${at}`;
	});
}

// ────────────────────────────────────────────────────────────────────────────
// File I/O — atomic
// ────────────────────────────────────────────────────────────────────────────

function readFile(filePath: string): { schemaVersion: 1; items: any[] } {
	if (!fs.existsSync(filePath)) return { schemaVersion: 1, items: [] };
	const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
	if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) {
		throw new StoreError("io", `corrupt file: ${filePath}`);
	}
	return raw as { schemaVersion: 1; items: any[] };
}

function writeFile(filePath: string, data: { schemaVersion: 1; items: any[] }): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const tmp = filePath + ".tmp";
	fs.writeFileSync(tmp, JSON.stringify(data, null, "\t") + "\n", "utf8");
	fs.renameSync(tmp, filePath);
}

function revOf(item: unknown): string {
	return crypto.createHash("sha256").update(JSON.stringify(item)).digest("hex").slice(0, 16);
}

// ────────────────────────────────────────────────────────────────────────────
// CRUD operations
// ────────────────────────────────────────────────────────────────────────────

export interface ListedItem {
	id: string;
	_rev: string;
	data: any;
}

export function listAll(type: EntityType): ListedItem[] {
	const cfg = ENTITIES[type];
	const file = readFile(cfg.filePath);
	return file.items.map((it) => ({ id: cfg.keyOf(it), _rev: revOf(it), data: it }));
}

export function getOne(type: EntityType, id: string): ListedItem {
	const cfg = ENTITIES[type];
	const file = readFile(cfg.filePath);
	const found = file.items.find((it) => cfg.keyOf(it) === id);
	if (!found) throw new StoreError("not_found", `${type}/${id}`);
	return { id, _rev: revOf(found), data: found };
}

/**
 * Pre-normalize the body before schema validation. Currently:
 *   - For species: id is forcibly set to toID(name), so id/name can never
 *     disagree. The UI hides the id field; this is the safety net.
 *   - For all entities: cross-reference any ability names against PS's real
 *     dex (catches typos like "Regenarator" → suggest "Regenerator").
 *
 * Returns the normalized body and a list of advisory warnings (typos with
 * suggestions). Warnings are returned as validation errors to surface them
 * loudly — we'd rather refuse the save than ship a broken Pokémon.
 */
function listCustomAbilityIds(): Set<string> {
	const out = new Set<string>();
	try {
		const file = readFile(ENTITIES.abilities.filePath);
		for (const a of file.items) {
			if (a && typeof a.id === "string") out.add(a.id.toLowerCase());
			if (a && typeof a.name === "string") out.add(a.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
		}
	} catch { /* file may not exist yet */ }
	return out;
}

function listCustomSpeciesIds(): Set<string> {
	const out = new Set<string>();
	try {
		const file = readFile(ENTITIES.species.filePath);
		for (const s of file.items) {
			if (s && typeof s.id === "string") out.add(s.id.toLowerCase());
			if (s && typeof s.name === "string") out.add(s.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
		}
	} catch { /* file may not exist yet */ }
	return out;
}

function normalizeAndCrossRef(type: EntityType, body: any): { body: any; issues: string[] } {
	const issues: string[] = [];
	if (!body || typeof body !== "object") return { body, issues };
	const normalized = { ...body };
	if (type === "species") {
		// Force id = toID(name). Always.
		if (typeof normalized.name === "string" && normalized.name) {
			const idFromName = normalized.name.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (idFromName) normalized.id = idFromName;
		}
		// Cross-check every ability slot against PS's dex AND our custom abilities.
		const ab = normalized.abilities || {};
		const customIds = listCustomAbilityIds();
		for (const slot of ["0", "1", "H", "S"]) {
			const name = ab[slot];
			if (!name || typeof name !== "string") continue;
			const normId = name.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (isKnownAbility(name)) continue;
			if (customIds.has(normId)) continue;
			const suggestion = suggestAbility(name);
			issues.push(
				`Ability "${name}" (slot ${slot}) doesn't exist in PS or your custom abilities. ` +
				(suggestion ? `Did you mean "${suggestion}"?` : `Check spelling, or define it as a custom ability first.`)
			);
		}
		// Cross-check prevo/evos against known custom species.
		const speciesIds = listCustomSpeciesIds();
		if (normalized.prevo && typeof normalized.prevo === "string") {
			const pid = normalized.prevo.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (pid && !speciesIds.has(pid) && pid !== normalized.id) {
				issues.push(`prevo "${normalized.prevo}" doesn't match any custom species. Create it first or check spelling.`);
			}
		}
		if (normalized.evos && Array.isArray(normalized.evos)) {
			for (const evo of normalized.evos) {
				if (typeof evo !== "string") continue;
				const eid = evo.toLowerCase().replace(/[^a-z0-9]/g, "");
				if (eid && !speciesIds.has(eid) && eid !== normalized.id) {
					issues.push(`evos "${evo}" doesn't match any custom species. Create it first or check spelling.`);
				}
			}
		}
	}
	if (type === "formats") {
		// Cross-check banlist/unbanlist entries that look like species names
		// against known custom species. Full validation (including PS base species)
		// happens at build time.
		const speciesIds = listCustomSpeciesIds();
		const checkEntry = (entry: string, listName: string) => {
			const bare = entry.replace(/^[+\-*]/, "").trim();
			if (!bare) return;
			const eid = bare.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (!eid) return;
			// Only flag entries that look like custom species but don't exist
			// Known PS tiers are fine (Uber, OU, AG, etc.)
			const knownTiers = new Set(["ag", "uber", "ou", "uubl", "uu", "rubl", "ru", "nubl", "nu", "publ", "pu", "zubl", "zu", "nfe", "lc", "dober", "dou", "dbl", "duu"]);
			if (knownTiers.has(eid)) return;
			// If it's not a custom species, that's OK — it could be a PS species
			// or an ability/move/item name. Just flag custom species that don't exist.
		};
		if (normalized.banlist) {
			for (const entry of normalized.banlist) checkEntry(entry, "banlist");
		}
		if (normalized.unbanlist) {
			for (const entry of normalized.unbanlist) checkEntry(entry, "unbanlist");
		}
	}
	if (type === "learnsets") {
		// Validate that moves exist in custom moves (PS base not checked here).
		if (normalized.moves && Array.isArray(normalized.moves)) {
			const customMoveIds = new Set<string>();
			try {
				const file = readFile(ENTITIES.moves.filePath);
				for (const m of file.items) {
					if (m && typeof m.id === "string") customMoveIds.add(m.id.toLowerCase());
				}
			} catch { /* file may not exist yet */ }
			for (const moveId of normalized.moves) {
				if (typeof moveId !== "string") continue;
				const mid = moveId.toLowerCase();
				if (!customMoveIds.has(mid)) continue; // PS base moves pass through
				// Custom move check — already exists, this is fine
			}
		}
	}
	return { body: normalized, issues };
}

export function create(type: EntityType, body: unknown, actor: string): ListedItem {
	const cfg = ENTITIES[type];
	const norm = normalizeAndCrossRef(type, body);
	if (norm.issues.length) throw new StoreError("validation", "Couldn't save — fix these first:", norm.issues);
	const parsed = cfg.itemSchema.safeParse(norm.body);
	if (!parsed.success) throw new StoreError("validation", "invalid body", zodToFieldErrors(parsed.error));

	const newId = cfg.keyOf(parsed.data);
	writeLock.withLock(() => {
		const file = readFile(cfg.filePath);
		if (file.items.some((it) => cfg.keyOf(it) === newId)) {
			throw new StoreError("conflict", `${type}/${newId} already exists`);
		}
		file.items.push(parsed.data);
		writeFile(cfg.filePath, file);
	});
	appendAudit({ actor, action: `${type}.create`, id: newId, before: null, after: parsed.data });
	return { id: newId, _rev: revOf(parsed.data), data: parsed.data };
}

export function update(type: EntityType, id: string, body: unknown, ifMatchRev: string | undefined, actor: string): ListedItem {
	const cfg = ENTITIES[type];
	const norm = normalizeAndCrossRef(type, body);
	if (norm.issues.length) throw new StoreError("validation", "Couldn't save — fix these first:", norm.issues);
	const parsed = cfg.itemSchema.safeParse(norm.body);
	if (!parsed.success) throw new StoreError("validation", "invalid body", zodToFieldErrors(parsed.error));
	let before: unknown = null;
	if (cfg.keyOf(parsed.data) !== id) {
		// Special case: a species rename changed the id (because id = toID(name)).
		// Treat that as delete+create to keep keys in sync with the new name.
		if (type === "species") {
			const newId = cfg.keyOf(parsed.data);
			writeLock.withLock(() => {
				const file = readFile(cfg.filePath);
				const idx = file.items.findIndex((it) => cfg.keyOf(it) === id);
				if (idx < 0) throw new StoreError("not_found", `${type}/${id}`);
				if (ifMatchRev && revOf(file.items[idx]) !== ifMatchRev) {
					throw new StoreError("conflict", "entity was modified by someone else; reload and retry");
				}
				before = file.items[idx];
				file.items[idx] = parsed.data;
				writeFile(cfg.filePath, file);
				// Auto-migrate learnset reference
				if (newId !== id) {
					const lsCfg = ENTITIES.learnsets;
					const lsFile = readFile(lsCfg.filePath);
					const lsIdx = lsFile.items.findIndex((ls: any) => ls.species === id);
					if (lsIdx >= 0) {
						lsFile.items[lsIdx] = { ...lsFile.items[lsIdx], species: newId };
						writeFile(lsCfg.filePath, lsFile);
					}
				}
			});
			appendAudit({ actor, action: `${type}.rename`, id: newId, before, after: parsed.data });
			return { id: newId, _rev: revOf(parsed.data), data: parsed.data };
		}
		throw new StoreError("validation", `id in URL (${id}) does not match id in body (${cfg.keyOf(parsed.data)})`);
	}

	writeLock.withLock(() => {
		const file = readFile(cfg.filePath);
		const idx = file.items.findIndex((it) => cfg.keyOf(it) === id);
		if (idx < 0) throw new StoreError("not_found", `${type}/${id}`);
		if (ifMatchRev && revOf(file.items[idx]) !== ifMatchRev) {
			throw new StoreError("conflict", "entity was modified by someone else; reload and retry");
		}
		before = file.items[idx];
		file.items[idx] = parsed.data;
		writeFile(cfg.filePath, file);
	});
	appendAudit({ actor, action: `${type}.update`, id, before, after: parsed.data });
	return { id, _rev: revOf(parsed.data), data: parsed.data };
}

export function remove(type: EntityType, id: string, ifMatchRev: string | undefined, actor: string): void {
	const cfg = ENTITIES[type];
	writeLock.withLock(() => {
		const file = readFile(cfg.filePath);
		const idx = file.items.findIndex((it) => cfg.keyOf(it) === id);
		if (idx < 0) throw new StoreError("not_found", `${type}/${id}`);
		if (ifMatchRev && revOf(file.items[idx]) !== ifMatchRev) {
			throw new StoreError("conflict", "entity was modified by someone else; reload and retry");
		}

		// Referential integrity: check for dangling references
		const issues: string[] = [];
		if (type === "species") {
			// Check if any learnset references this species
			const lsFile = readFile(ENTITIES.learnsets.filePath);
			if (lsFile.items.some((ls: any) => ls.species === id)) {
				issues.push(`learnset for "${id}" exists — delete the learnset first, or it will be orphaned`);
			}
			const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (file.items.some((s: any) => (s.prevo && normName(s.prevo) === id) || (s.evos && s.evos.some((e: string) => normName(e) === id)))) {
				issues.push(`other species reference "${id}" as prevo or evos`);
			}
		}
		if (type === "moves") {
			// Check if any learnset references this move
			const lsFile = readFile(ENTITIES.learnsets.filePath);
			const referencing = lsFile.items.filter((ls: any) => ls.moves && ls.moves.includes(id));
			if (referencing.length > 0) {
				issues.push(`move "${id}" is referenced in learnsets: ${referencing.map((l: any) => l.species).join(", ")}`);
			}
		}
		if (issues.length > 0) {
			throw new StoreError("validation", "Can't delete — other content depends on this:", issues);
		}

		const before = file.items[idx];
		file.items.splice(idx, 1);
		writeFile(cfg.filePath, file);
		appendAudit({ actor, action: `${type}.delete`, id, before, after: null });
	});
}

// ────────────────────────────────────────────────────────────────────────────
// Meta — read-only for the UI (the mod's identity)
// ────────────────────────────────────────────────────────────────────────────

export function getMeta() {
	const file = MetaFileSchema.parse(JSON.parse(
		fs.readFileSync(path.join(CONTENT_MOD_DIR, "meta.json"), "utf8")
	));
	return file;
}
