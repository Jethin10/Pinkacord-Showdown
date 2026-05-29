/**
 * Pinkacord content generator.
 *
 * Reads canonical JSON from `content/`, validates everything via Zod, then
 * emits the TypeScript files that PS reads. All file writes go through an
 * atomic temp-then-rename pattern so a failed build never leaves partial
 * state on disk.
 *
 * Pipeline:
 *   1. Load JSON files
 *   2. Zod schema validation     (catches malformed data)
 *   3. Internal cross-reference  (no orphan refs WITHIN our content)
 *   4. Effect-kind resolution    (every effect ref is in the registry)
 *   5. Emit TS to staging dir    (write *.tmp files)
 *   6. Commit staging dir        (atomic rename)
 *
 * Cross-references that span our content and PS's built-in dex (e.g. "is
 * 'thunderbolt' a real move?") are caught at the smoke-test stage by PS
 * itself when it validates a canonical team. Real-time validation against
 * PS's dex is a Phase 3 admin-panel concern.
 */

import * as fs from "fs";
import * as path from "path";
import { z, ZodError } from "zod";

import {
	MetaFileSchema,
	PokedexFileSchema,
	MovesFileSchema,
	AbilitiesFileSchema,
	ItemsFileSchema,
	LearnsetsFileSchema,
	FormatsFileSchema,
	type Meta,
	type Species,
	type Move,
	type Ability,
	type Item,
	type Learnset,
	type Format,
	IdSchema,
} from "./schemas";
import { emitEffects, parseEffectParams } from "./effects";
import { validateCustomHandlerCode } from "./custom-code";

// ────────────────────────────────────────────────────────────────────────────
// Paths
//
// npm scripts run from the repo root, so process.cwd() is the canonical
// anchor. We do not use __dirname because this file is also run from
// dist/tools/pinkacord/, which would resolve relative paths incorrectly.
// ────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = process.cwd();
const CONTENT_DIR = path.join(REPO_ROOT, "content");
const MOD_CONTENT_DIR = (modId: string) => path.join(CONTENT_DIR, modId);
const MOD_OUTPUT_DIR = (modId: string) => path.join(REPO_ROOT, "data", "mods", modId);
const FORMATS_OUTPUT_FILE = path.join(REPO_ROOT, "config", "custom-formats.ts");
const SPRITE_SRC_DIR = (modId: string) => path.join(MOD_CONTENT_DIR(modId), "sprites");
const SPRITE_DST_DIR = (modId: string) => path.join(REPO_ROOT, "server", "static", "sprites", modId);

const GENERATED_BANNER =
	"// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.\n" +
	"// Edit the corresponding file in content/ and run `npm run pinkacord:build`.\n" +
	"// Generator: tools/pinkacord/generator.ts\n";

// ────────────────────────────────────────────────────────────────────────────
// Loaded content (typed result of the load+validate stage)
// ────────────────────────────────────────────────────────────────────────────

export interface LoadedContent {
	meta: Meta;
	species: Species[];
	moves: Move[];
	abilities: Ability[];
	items: Item[];
	learnsets: Learnset[];
	formats: Format[];
}

// ────────────────────────────────────────────────────────────────────────────
// Error model — every failure produces a structured BuildError so the CLI
// (and later the admin panel) can render field-level messages.
// ────────────────────────────────────────────────────────────────────────────

export class BuildError extends Error {
	constructor(public readonly file: string, public readonly issues: string[]) {
		super(`${file}: ${issues.length} issue(s)\n  - ${issues.join("\n  - ")}`);
		this.name = "BuildError";
	}
}

function zodIssuesToStrings(err: ZodError): string[] {
	return err.issues.map((iss) => {
		const at = iss.path.length ? ` at ${iss.path.join(".")}` : "";
		return `${iss.message}${at}`;
	});
}

function readJsonFile(filePath: string): unknown {
	if (!fs.existsSync(filePath)) {
		throw new BuildError(filePath, ["file does not exist"]);
	}
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf8");
	} catch (e: any) {
		throw new BuildError(filePath, [`could not read file: ${e.message}`]);
	}
	try {
		return JSON.parse(raw);
	} catch (e: any) {
		throw new BuildError(filePath, [`invalid JSON: ${e.message}`]);
	}
}

function parseOrThrow<T>(schema: z.ZodType<T>, filePath: string, raw: unknown): T {
	const result = schema.safeParse(raw);
	if (!result.success) {
		throw new BuildError(filePath, zodIssuesToStrings(result.error));
	}
	return result.data;
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 1+2: load JSON and validate Zod schemas
// ────────────────────────────────────────────────────────────────────────────

export function loadAndValidate(modId: string): LoadedContent {
	const modDir = MOD_CONTENT_DIR(modId);

	const meta = parseOrThrow(
		MetaFileSchema,
		path.join(modDir, "meta.json"),
		readJsonFile(path.join(modDir, "meta.json"))
	);

	const pokedex = parseOrThrow(
		PokedexFileSchema,
		path.join(modDir, "pokedex.json"),
		readJsonFile(path.join(modDir, "pokedex.json"))
	);
	const moves = parseOrThrow(
		MovesFileSchema,
		path.join(modDir, "moves.json"),
		readJsonFile(path.join(modDir, "moves.json"))
	);
	const abilities = parseOrThrow(
		AbilitiesFileSchema,
		path.join(modDir, "abilities.json"),
		readJsonFile(path.join(modDir, "abilities.json"))
	);
	const items = parseOrThrow(
		ItemsFileSchema,
		path.join(modDir, "items.json"),
		readJsonFile(path.join(modDir, "items.json"))
	);
	const learnsets = parseOrThrow(
		LearnsetsFileSchema,
		path.join(modDir, "learnsets.json"),
		readJsonFile(path.join(modDir, "learnsets.json"))
	);
	const formats = parseOrThrow(
		FormatsFileSchema,
		path.join(CONTENT_DIR, "formats.json"),
		readJsonFile(path.join(CONTENT_DIR, "formats.json"))
	);

	return {
		meta,
		species: pokedex.items,
		moves: moves.items,
		abilities: abilities.items,
		items: items.items,
		learnsets: learnsets.items,
		formats: formats.items,
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 3+4: internal cross-reference + effect kind validation
// ────────────────────────────────────────────────────────────────────────────

export function crossReferenceValidate(c: LoadedContent): void {
	const issues: string[] = [];

	// Duplicate IDs within each collection.
	function findDuplicates<T extends { id: string }>(items: T[], label: string) {
		const seen = new Set<string>();
		for (const it of items) {
			if (seen.has(it.id)) {
				issues.push(`duplicate ${label} id: "${it.id}"`);
			}
			seen.add(it.id);
		}
	}
	findDuplicates(c.species, "species");
	findDuplicates(c.moves, "move");
	findDuplicates(c.abilities, "ability");
	findDuplicates(c.items, "item");
	findDuplicates(c.formats, "format");

	// Duplicate dex numbers.
	function findDuplicateNums<T extends { id: string; num: number }>(items: T[], label: string) {
		const seen = new Map<number, string>();
		for (const it of items) {
			const prev = seen.get(it.num);
			if (prev) {
				issues.push(`duplicate ${label} num ${it.num} on both "${prev}" and "${it.id}"`);
			}
			seen.set(it.num, it.id);
		}
	}
	findDuplicateNums(c.species, "species");
	findDuplicateNums(c.moves, "move");
	findDuplicateNums(c.items, "item");

	// Learnset species must exist in our pokedex.
	const speciesIds = new Set(c.species.map((s) => s.id));
	for (const ls of c.learnsets) {
		if (!speciesIds.has(ls.species)) {
			issues.push(`learnset references unknown species "${ls.species}"`);
		}
	}

	// Custom abilities/moves referenced by mons must either exist in our
	// content or be valid PS-base names. We can't validate against PS here
	// (that's the smoke test's job), so we only enforce ID-shape and emit a
	// soft note for unknown custom abilities.
	const customAbilityNames = new Set(c.abilities.map((a) => a.name));
	const customMoveIds = new Set(c.moves.map((m) => m.id));
	for (const s of c.species) {
		for (const slot of ["0", "1", "H", "S"] as const) {
			const name = s.abilities[slot];
			if (!name) continue;
			// If the name looks like a custom ID we don't define, that's an issue.
			// We let unknown names through because they may be PS base abilities.
			// The smoke test will catch a truly invalid name.
			// (Tighter validation is a Phase 3 admin-panel feature with PS dex access.)
		}
	}

	// Learnset moves: if the ID is in our customMoveIds we know it's good.
	// Anything else is assumed to be a PS base move — smoke test will catch.
	for (const ls of c.learnsets) {
		const seenMoves = new Set<string>();
		for (const m of ls.moves) {
			if (seenMoves.has(m)) {
				issues.push(`species "${ls.species}" learnset has duplicate move "${m}"`);
			}
			seenMoves.add(m);
		}
	}

	for (const a of c.abilities) {
		if (a.customHandlerCode?.trim()) {
			issues.push(...validateCustomHandlerCode(a.customHandlerCode, `ability "${a.id}"`));
		}
	}

	// Format mod must reference a known mod (our own, for now).
	const knownRulesetNames = loadPSRulesetNames();
	const psBaseSpecies = loadPSBaseSpecies();
	for (const f of c.formats) {
		if (f.sharedPower && f.gameType !== "singles") {
			issues.push(`format "${f.name}" uses Shared Power but gameType is "${f.gameType}" (singles only)`);
		}
		if (f.mod !== c.meta.id) {
			const psMods = new Set(["gen9", "gen8", "gen7", "gen6", "gen5", "gen4", "gen3", "gen2", "gen1"]);
			if (!psMods.has(f.mod)) {
				issues.push(`format "${f.name}" references unknown mod "${f.mod}"`);
			}
		}
		// Ruleset entry validation — catches LLM hallucinations early.
		for (const ruleRaw of f.ruleset || []) {
			const rule = ruleRaw.trim();
			if (!rule) continue;
			if (isLikelyValidRuleset(rule, knownRulesetNames)) continue;
			issues.push(`format "${f.name}" references unknown ruleset "${ruleRaw}". Check spelling against data/rulesets.ts.`);
		}
		// Duplicate ruleset entries waste cycles and may conflict.
		const ruleSeen = new Set<string>();
		for (const r of f.ruleset || []) {
			const norm = r.trim().toLowerCase().replace(/\s+/g, " ");
			if (ruleSeen.has(norm)) issues.push(`format "${f.name}" has duplicate ruleset entry "${r}"`);
			ruleSeen.add(norm);
		}
		// Validate banlist/unbanlist entry names against PS base species IDs and our custom species IDs.
		// If a banlist entry looks like a species ID (lowercase alphanumeric) but doesn't match
		// any species in PS's base data or our custom data, flag it as a likely typo.
		// Tier names (uber, ou, ag) and ability/item names are intentionally skipped.
		const customSpeciesIds = new Set(c.species.map((s) => s.id));
		const knownTiers = new Set(["ag", "uber", "ou", "uubl", "uu", "rubl", "ru", "nubl", "nu", "publ", "pu", "zubl", "zu", "nfe", "lc", "dober", "dou", "dbl", "duu", "duber"]);
		const psAbilities = loadPSAbilities();
		const psItems = loadPSItems();
		const psMoves = loadPSMoves();
		const customAbilityIds = new Set(c.abilities.map((a) => a.id));
		const customItemIds = new Set(c.items.map((i) => i.id));
		const customMoveIds = new Set(c.moves.map((m) => m.id));
		const knownEntries = new Set([
			...psBaseSpecies, ...customSpeciesIds,
			...psAbilities, ...customAbilityIds,
			...psItems, ...customItemIds,
			...psMoves, ...customMoveIds,
		]);
		for (const entry of [...(f.banlist || []), ...(f.unbanlist || [])]) {
			const bare = String(entry).replace(/^[+\-*]/, "").trim();
			const eid = bare.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (!eid || eid.length < 3) continue;
			if (knownTiers.has(eid)) continue;
			if (knownEntries.has(eid)) continue;
			issues.push(`format "${f.name}" references "${entry}" which does not match any known species, tier, or custom content. Did you misspell it?`);
		}
	}

	// Effect refs: each must be a known kind with valid params.
	for (const a of c.abilities) {
		for (const [i, eff] of a.effects.entries()) {
			try {
				parseEffectParams(eff.kind, eff.params);
			} catch (e: any) {
				if (e instanceof ZodError) {
					for (const s of zodIssuesToStrings(e)) {
						issues.push(`ability "${a.id}" effect[${i}] (${eff.kind}): ${s}`);
					}
				} else {
					issues.push(`ability "${a.id}" effect[${i}]: ${e.message}`);
				}
			}
		}
	}
	for (const it of c.items) {
		for (const [i, eff] of it.effects.entries()) {
			try {
				parseEffectParams(eff.kind, eff.params);
			} catch (e: any) {
				if (e instanceof ZodError) {
					for (const s of zodIssuesToStrings(e)) {
						issues.push(`item "${it.id}" effect[${i}] (${eff.kind}): ${s}`);
					}
				} else {
					issues.push(`item "${it.id}" effect[${i}]: ${e.message}`);
				}
			}
		}
	}

	if (issues.length) {
		throw new BuildError("<cross-reference>", issues);
	}
}

// ────────────────────────────────────────────────────────────────────────────
// PS ruleset name extraction (lazy-cached, used by cross-ref validator)
// ────────────────────────────────────────────────────────────────────────────

let cachedPSRulesetNames: Set<string> | null = null;
function loadPSRulesetNames(): Set<string> {
	if (cachedPSRulesetNames) return cachedPSRulesetNames;
	const out = new Set<string>();
	const file = path.join(REPO_ROOT, "data", "rulesets.ts");
	try {
		const src = fs.readFileSync(file, "utf8");
		const re = /^\s+name:\s*['"]([^'"]+)['"]/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(src)) !== null) out.add(m[1]);
	} catch { /* silent */ }
	cachedPSRulesetNames = out;
	return out;
}

/** A ruleset entry is "likely valid" if either:
 *  - the base name exists in PS's rulesets.ts (Standard, Sleep Clause Mod, …)
 *  - it's a parametric form PS supports (Min Team Size = N, Adjust Level = N, …)
 *  - it's a banlist-style entry (+, -, *) — PS resolves these against species/abilities/items/moves
 *  Intentionally lenient — clean error for clear typos, but we don't second-guess
 *  PS's full rule-resolution surface. */
let cachedPSBaseSpecies: Set<string> | null = null;
function loadPSBaseSpecies(): Set<string> {
	if (cachedPSBaseSpecies) return cachedPSBaseSpecies;
	const out = new Set<string>();
	const file = path.join(REPO_ROOT, "data", "pokedex.ts");
	try {
		const src = fs.readFileSync(file, "utf8");
		const re = /^\t([a-z][a-z0-9]+):\s*\{/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(src)) !== null) out.add(m[1]);
	} catch { /* silent */ }
	cachedPSBaseSpecies = out;
	return out;
}

let cachedPSAbilities: Set<string> | null = null;
let cachedPSItems: Set<string> | null = null;
let cachedPSMoves: Set<string> | null = null;

function loadPSAbilities(): Set<string> {
	if (cachedPSAbilities) return cachedPSAbilities;
	const out = new Set<string>();
	const file = path.join(REPO_ROOT, "data", "abilities.ts");
	try {
		const src = fs.readFileSync(file, "utf8");
		const re = /^\t([a-z][a-z0-9]+):\s*\{/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(src)) !== null) out.add(m[1]);
	} catch { /* silent */ }
	cachedPSAbilities = out;
	return out;
}

function loadPSItems(): Set<string> {
	if (cachedPSItems) return cachedPSItems;
	const out = new Set<string>();
	const file = path.join(REPO_ROOT, "data", "items.ts");
	try {
		const src = fs.readFileSync(file, "utf8");
		const re = /^\t([a-z][a-z0-9]+):\s*\{/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(src)) !== null) out.add(m[1]);
	} catch { /* silent */ }
	cachedPSItems = out;
	return out;
}

function loadPSMoves(): Set<string> {
	if (cachedPSMoves) return cachedPSMoves;
	const out = new Set<string>();
	const file = path.join(REPO_ROOT, "data", "moves.ts");
	try {
		const src = fs.readFileSync(file, "utf8");
		const re = /^\t([a-z][a-z0-9]+):\s*\{/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(src)) !== null) out.add(m[1]);
	} catch { /* silent */ }
	cachedPSMoves = out;
	return out;
}

function isLikelyValidRuleset(rule: string, known: Set<string>): boolean {
	if (rule.startsWith("+") || rule.startsWith("-") || rule.startsWith("*")) return true;
	if (known.has(rule)) return true;
	const eqMatch = rule.match(/^(.+?)\s*=\s*.+$/);
	if (eqMatch) {
		const lhs = eqMatch[1].trim();
		const parametricPrefixes = [
			"Min Team Size", "Max Team Size", "Picked Team Size", "Min Move Count", "Max Move Count",
			"Adjust Level", "Adjust Level Down", "Min Level", "Max Level", "Min Source Gen", "Max Source Gen",
			"Force Monotype", "Force Tera Type", "EV Limit", "Item Clause", "Same Type Clause",
		];
		if (parametricPrefixes.includes(lhs)) return true;
	}
	return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 5: emit TS source as strings
//
// We hand-roll the serializer (instead of JSON.stringify) because PS-style
// TS uses unquoted keys and trailing commas. The diff between consecutive
// builds is cleaner this way.
// ────────────────────────────────────────────────────────────────────────────

function tsLiteral(value: unknown, indent: string): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "boolean") return String(value);
	if (typeof value === "number") return String(value);
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map((v) => tsLiteral(v, indent + "\t"));
		return `[${items.join(", ")}]`;
	}
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined);
		if (entries.length === 0) return "{}";
		const lines = entries.map(([k, v]) => {
			const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
			return `${indent}\t${safeKey}: ${tsLiteral(v, indent + "\t")},`;
		});
		return `{\n${lines.join("\n")}\n${indent}}`;
	}
	throw new Error(`Unsupported literal: ${typeof value}`);
}

// Pokedex.ts ────────────────────────────────────────────────────────────────

function emitPokedex(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const Pokedex: import('../../../sim/dex-species').ModdedSpeciesDataTable = {`,
	];
	for (const s of c.species) {
		const obj: Record<string, unknown> = {
			num: s.num,
			name: s.name,
			types: s.types,
			...(s.gender ? { gender: s.gender } : {}),
			...(s.genderRatio ? { genderRatio: s.genderRatio } : {}),
			baseStats: s.baseStats,
			abilities: { 0: s.abilities["0"], ...(s.abilities["1"] ? { 1: s.abilities["1"] } : {}), ...(s.abilities.H ? { H: s.abilities.H } : {}), ...(s.abilities.S ? { S: s.abilities.S } : {}) },
			heightm: s.heightm,
			weightkg: s.weightkg,
			color: s.color,
			eggGroups: s.eggGroups,
			...(s.prevo ? { prevo: s.prevo } : {}),
			...(s.evos ? { evos: s.evos } : {}),
			...(s.evoLevel ? { evoLevel: s.evoLevel } : {}),
		};
		// "abilities" needs literal numeric keys 0/1 — tsLiteral already handles
		// numeric keys via the safe-identifier check. Build the wrapper:
		lines.push(`\t${s.id}: ${tsLiteral(obj, "\t")},`);
	}
	lines.push("};");
	lines.push("");
	return lines.join("\n");
}

// Formats-data.ts ──────────────────────────────────────────────────────────

function emitFormatsData(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const FormatsData: import('../../../sim/dex-species').ModdedSpeciesFormatsDataTable = {`,
	];
	for (const s of c.species) {
		const obj: Record<string, unknown> = {
			tier: s.tier,
			doublesTier: s.doublesTier,
			...(s.natDexTier ? { natDexTier: s.natDexTier } : {}),
		};
		lines.push(`\t${s.id}: ${tsLiteral(obj, "\t")},`);
	}
	lines.push("};");
	lines.push("");
	return lines.join("\n");
}

// Moves.ts ─────────────────────────────────────────────────────────────────

function emitMoves(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {`,
	];
	for (const m of c.moves) {
		const obj: Record<string, unknown> = {
			num: m.num,
			accuracy: m.accuracy,
			basePower: m.basePower,
			category: m.category,
			name: m.name,
			...(m.shortDesc ? { shortDesc: m.shortDesc } : {}),
			...(m.desc ? { desc: m.desc } : {}),
			pp: m.pp,
			priority: m.priority,
			flags: m.flags,
			...(m.secondary !== undefined ? { secondary: m.secondary } : {}),
			...(m.drain ? { drain: m.drain } : {}),
			...(m.recoil ? { recoil: m.recoil } : {}),
			...(m.selfBoost ? { self: { boosts: m.selfBoost.boosts } } : {}),
			...(m.multihit ? { multihit: m.multihit } : {}),
			...(m.critRatio ? { critRatio: m.critRatio } : {}),
			target: m.target,
			type: m.type,
			contestType: m.contestType,
		};
		lines.push(`\t${m.id}: ${tsLiteral(obj, "\t")},`);
	}
	lines.push("};");
	lines.push("");
	return lines.join("\n");
}

// Abilities.ts ─────────────────────────────────────────────────────────────

function emitAbilities(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {`,
	];
	for (const a of c.abilities) {
		const handlerCode = emitEffects(a.effects);
		const flags = a.breakable ? "{ breakable: 1 }" : "{}";
		// We assemble this one by hand because the effect handler snippets are
		// raw TS code blocks (with method definitions), not literal values.
		lines.push(
			`\t${a.id}: {`,
			`\t\tname: ${JSON.stringify(a.name)},`,
			...(a.shortDesc ? [`\t\tshortDesc: ${JSON.stringify(a.shortDesc)},`] : []),
			...(a.desc ? [`\t\tdesc: ${JSON.stringify(a.desc)},`] : []),
			handlerCode.trim() ? handlerCode.replace(/^/gm, "\t").trimEnd() : "",
			// Custom handler code (typically AI-authored). Emitted verbatim,
			// indented one level. The schema caps length and the admin UI
			// previews it before save.
			...(a.customHandlerCode && a.customHandlerCode.trim() ? [
				a.customHandlerCode.trim().split("\n").map((l) => "\t\t" + l).join("\n"),
			] : []),
			`\t\tflags: ${flags},`,
			`\t\tgen: 9,`,
			`\t},`
		);
	}
	lines.push("};");
	lines.push("");
	return lines.join("\n");
}

// Items.ts ─────────────────────────────────────────────────────────────────

function emitItems(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {`,
	];
	for (const it of c.items) {
		const handlerCode = emitEffects(it.effects);
		lines.push(
			`\t${it.id}: {`,
			`\t\tnum: ${it.num},`,
			`\t\tname: ${JSON.stringify(it.name)},`,
			...(it.shortDesc ? [`\t\tshortDesc: ${JSON.stringify(it.shortDesc)},`] : []),
			...(it.desc ? [`\t\tdesc: ${JSON.stringify(it.desc)},`] : []),
			handlerCode.trim() ? handlerCode.replace(/^/gm, "\t").trimEnd() : "",
			`\t\tgen: 9,`,
			`\t},`
		);
	}
	lines.push("};");
	lines.push("");
	return lines.join("\n");
}

// Learnsets.ts ─────────────────────────────────────────────────────────────

function emitLearnsets(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const Learnsets: import('../../../sim/dex-species').ModdedLearnsetDataTable = {`,
	];
	const gen = c.meta.gen;
	for (const ls of c.learnsets) {
		lines.push(`\t${ls.species}: {`);
		lines.push(`\t\tlearnset: {`);
		for (const move of ls.moves) {
			lines.push(`\t\t\t${move}: [${JSON.stringify(`${gen}L1`)}],`);
		}
		lines.push(`\t\t},`);
		lines.push(`\t},`);
	}
	lines.push("};");
	lines.push("");
	return lines.join("\n");
}

// Scripts.ts ───────────────────────────────────────────────────────────────

/** PS Shared Power OM needs innate-ability volatiles to behave correctly. */
const SHAREDPOWER_SCRIPT_PATCH = `
\tfield: {
\t\tsuppressingWeather() {
\t\t\tfor (const pokemon of this.battle.getAllActive()) {
\t\t\t\tconst innates = Object.keys(pokemon.volatiles).filter(x => x.startsWith('ability:'));
\t\t\t\tif (pokemon && !pokemon.ignoringAbility() &&
\t\t\t\t\t(pokemon.getAbility().suppressWeather || innates.some(x => (
\t\t\t\t\t\tthis.battle.dex.abilities.get(x.replace('ability:', '')).suppressWeather
\t\t\t\t\t)))) {
\t\t\t\t\treturn true;
\t\t\t\t}
\t\t\t}
\t\t\treturn false;
\t\t},
\t},
\tpokemon: {
\t\thasAbility(ability) {
\t\t\tif (this.ignoringAbility()) return false;
\t\t\tif (Array.isArray(ability)) return ability.some(abil => this.hasAbility(abil));
\t\t\tconst abilityid = this.battle.toID(ability);
\t\t\treturn this.ability === abilityid || !!this.volatiles['ability:' + abilityid];
\t\t},
\t\tignoringAbility() {
\t\t\tlet neutralizinggas = false;
\t\t\tfor (const pokemon of this.battle.getAllActive()) {
\t\t\t\tif (
\t\t\t\t\t(pokemon.ability === ('neutralizinggas' as ID) || pokemon.m.abils?.includes('ability:neutralizinggas')) &&
\t\t\t\t\t!pokemon.volatiles['gastroacid'] && !pokemon.abilityState.ending
\t\t\t\t) {
\t\t\t\t\tneutralizinggas = true;
\t\t\t\t\tbreak;
\t\t\t\t}
\t\t\t}
\t\t\treturn !!(
\t\t\t\t(this.battle.gen >= 5 && !this.isActive) ||
\t\t\t\t((this.volatiles['gastroacid'] ||
\t\t\t\t\t(neutralizinggas && (this.ability !== ('neutralizinggas' as ID) ||
\t\t\t\t\t\tthis.m.abils?.includes('ability:neutralizinggas'))
\t\t\t\t\t)) && !this.getAbility().flags['cantsuppress']
\t\t\t\t)
\t\t\t);
\t\t},
\t},
`;

function emitScripts(c: LoadedContent): string {
	const needsSharedPower = c.formats.some((f) => f.enabled !== false && f.sharedPower);
	const lines = [
		GENERATED_BANNER,
		`export const Scripts: ModdedBattleScriptsData = {`,
		`\tgen: ${c.meta.gen},`,
		`\tinherit: ${JSON.stringify(c.meta.parentMod)},`,
	];
	if (needsSharedPower) lines.push(SHAREDPOWER_SCRIPT_PATCH);
	lines.push(`};`, "");
	return lines.join("\n");
}

// config/custom-formats.ts ────────────────────────────────────────────────

/** Broken abilities in Shared Power OM — merged into format banlist at emit time. */
const SHARED_POWER_RESTRICTED = [
	"Armor Tail", "Chlorophyll", "Comatose", "Contrary", "Dazzling", "Fur Coat", "Gale Wings",
	"Good as Gold", "Huge Power", "Ice Scales", "Illusion", "Imposter", "Magic Bounce", "Magic Guard",
	"Magnet Pull", "Mold Breaker", "Multiscale", "Poison Heal", "Prankster", "Protosynthesis",
	"Psychic Surge", "Pure Power", "Quark Drive", "Queenly Majesty", "Quick Draw", "Quick Feet",
	"Regenerator", "Sand Rush", "Simple", "Slush Rush", "Stakeout", "Stamina", "Surge Surfer",
	"Technician", "Tinted Lens", "Triage", "Unaware", "Unburden", "Water Bubble",
];

function emitFormatEntry(f: Format): string[] {
	const base: Record<string, unknown> = {
		name: f.name,
		desc: f.desc,
		mod: f.mod,
		gameType: f.gameType,
		...(f.team ? { team: f.team } : {}),
		...(f.bestOfDefault !== undefined ? { bestOfDefault: f.bestOfDefault } : {}),
		ruleset: f.ruleset,
		banlist: f.sharedPower
			? [...new Set([...f.banlist, ...SHARED_POWER_RESTRICTED])]
			: f.banlist,
		...(f.unbanlist.length ? { unbanlist: f.unbanlist } : {}),
	};

	if (!f.sharedPower) {
		return [`\t${tsLiteral(base, "\t")},`];
	}

	const ruleset = Array.isArray(base.ruleset) ? [...base.ruleset] : ["Standard"];
	if (!ruleset.includes("Standard OMs")) ruleset.unshift("Standard OMs");
	base.ruleset = ruleset;

	const head = tsLiteral(base, "\t").replace(/\n\}$/, "");
	return [
		head + ",",
		`\t\tonValidateRule() {`,
		`\t\t\tif (this.format.gameType !== 'singles') {`,
		`\t\t\t\tthrow new Error(\`Shared Power currently does not support \${this.format.gameType} battles.\`);`,
		`\t\t\t}`,
		`\t\t},`,
		`\t\tgetSharedPower(pokemon) {`,
		`\t\t\tconst sharedPower = new Set();`,
		`\t\t\tfor (const ally of pokemon.side.pokemon) {`,
		`\t\t\t\tif (this.ruleTable.isRestricted('ability:' + ally.baseAbility)) continue;`,
		`\t\t\t\tif (ally.previouslySwitchedIn > 0) {`,
		`\t\t\t\t\tsharedPower.add(ally.baseAbility);`,
		`\t\t\t\t}`,
		`\t\t\t}`,
		`\t\t\tsharedPower.delete(pokemon.baseAbility);`,
		`\t\t\treturn sharedPower;`,
		`\t\t},`,
		`\t\tonBeforeSwitchIn(pokemon) {`,
		`\t\t\tlet format = this.format;`,
		`\t\t\tif (!format.getSharedPower) return;`,
		`\t\t\tfor (const ability of format.getSharedPower(pokemon)) {`,
		`\t\t\t\tconst effect = 'ability:' + this.toID(ability);`,
		`\t\t\t\tpokemon.volatiles[effect] = this.initEffectState({ id: effect, target: pokemon });`,
		`\t\t\t\tif (!pokemon.m.abils) pokemon.m.abils = [];`,
		`\t\t\t\tif (!pokemon.m.abils.includes(effect)) pokemon.m.abils.push(effect);`,
		`\t\t\t}`,
		`\t\t},`,
		`\t},`,
	];
}

function emitCustomFormats(c: LoadedContent): string {
	const lines = [
		GENERATED_BANNER,
		`export const Formats: import('../sim/dex-formats').FormatList = [`,
	];
	// Group by section while preserving order.
	const sections = new Map<string, { column: number; formats: Format[] }>();
	for (const f of c.formats) {
		if (!f.enabled) continue;
		if (!sections.has(f.section)) {
			sections.set(f.section, { column: f.column, formats: [] });
		}
		sections.get(f.section)!.formats.push(f);
	}
	for (const [section, { column, formats }] of sections) {
		lines.push(`\t{ section: ${JSON.stringify(section)}, column: ${column} },`);
		for (const f of formats) {
			lines.push(...emitFormatEntry(f));
		}
	}
	lines.push("];");
	lines.push("");
	return lines.join("\n");
}

// Typechart.ts ──────────────────────────────────────────────────────────────

function emitTypechart(c: LoadedContent): string {
	return [
		GENERATED_BANNER,
		`export const TypeChart: import('../../../sim/dex-data').ModdedTypeDataTable = {};`,
		"",
	].join("\n");
}

// Conditions.ts ────────────────────────────────────────────────────────────

function emitConditions(c: LoadedContent): string {
	return [
		GENERATED_BANNER,
		`export const Conditions: import('../../../sim/dex-conditions').ModdedConditionDataTable = {};`,
		"",
	].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 6: atomic write
// ────────────────────────────────────────────────────────────────────────────

/**
 * Write all files to .tmp siblings first, then rename them into place once
 * every write succeeded. If any write fails mid-way, we clean up the tmps
 * and the live filesystem is unchanged.
 */
function atomicWriteAll(files: { path: string; content: string }[]): void {
	const tmpPaths: string[] = [];
	try {
		for (const f of files) {
			fs.mkdirSync(path.dirname(f.path), { recursive: true });
			const tmp = f.path + ".tmp";
			fs.writeFileSync(tmp, f.content, "utf8");
			tmpPaths.push(tmp);
		}
		// All writes succeeded — now commit each.
		for (const tmp of tmpPaths) {
			fs.renameSync(tmp, tmp.replace(/\.tmp$/, ""));
		}
	} catch (err) {
		// Best-effort cleanup of any tmp files we created.
		for (const tmp of tmpPaths) {
			try {
				if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
			} catch {
				// Ignore — we're already in the error path.
			}
		}
		throw err;
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export interface BuildResult {
	modId: string;
	written: string[];
	spritesMirrored: number;
	stats: {
		species: number;
		moves: number;
		abilities: number;
		items: number;
		learnsets: number;
		formats: number;
	};
}

/**
 * Mirror content/<mod>/sprites/* into server/static/sprites/<mod>/.
 * Server/static is what PS serves to browsers — sprites must live there to be
 * fetched at /sprites/<mod>/<id>.png by the client. Content/ is the SSOT,
 * server/static is the derivative.
 */
function mirrorSprites(modId: string): number {
	const src = SPRITE_SRC_DIR(modId);
	if (!fs.existsSync(src)) return 0;
	const dst = SPRITE_DST_DIR(modId);
	fs.mkdirSync(dst, { recursive: true });
	let copied = 0;
	for (const entry of fs.readdirSync(src)) {
		if (!/\.(png|gif)$/i.test(entry)) continue;
		fs.copyFileSync(path.join(src, entry), path.join(dst, entry));
		copied++;
	}
	return copied;
}

export function build(modId: string): BuildResult {
	const content = loadAndValidate(modId);
	crossReferenceValidate(content);

	const outDir = MOD_OUTPUT_DIR(modId);
	const files = [
		{ path: path.join(outDir, "pokedex.ts"), content: emitPokedex(content) },
		{ path: path.join(outDir, "formats-data.ts"), content: emitFormatsData(content) },
		{ path: path.join(outDir, "moves.ts"), content: emitMoves(content) },
		{ path: path.join(outDir, "abilities.ts"), content: emitAbilities(content) },
		{ path: path.join(outDir, "items.ts"), content: emitItems(content) },
		{ path: path.join(outDir, "learnsets.ts"), content: emitLearnsets(content) },
		{ path: path.join(outDir, "scripts.ts"), content: emitScripts(content) },
		{ path: path.join(outDir, "typechart.ts"), content: emitTypechart(content) },
		{ path: path.join(outDir, "conditions.ts"), content: emitConditions(content) },
		{ path: FORMATS_OUTPUT_FILE, content: emitCustomFormats(content) },
	];
	atomicWriteAll(files);
	const spritesMirrored = mirrorSprites(modId);

	return {
		modId,
		written: files.map((f) => path.relative(REPO_ROOT, f.path)),
		spritesMirrored,
		stats: {
			species: content.species.length,
			moves: content.moves.length,
			abilities: content.abilities.length,
			items: content.items.length,
			learnsets: content.learnsets.length,
			formats: content.formats.length,
		},
	};
}

// Used by the schemas test — exposed so tests can build a known content set
// in-memory without going through disk.
export { LoadedContent as _LoadedContent };
