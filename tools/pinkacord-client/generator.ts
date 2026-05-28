/**
 * Pinkacord client-overlay generator.
 *
 * Reads the same server-side content/pinkacord/*.json files PLUS
 * content/pinkacord-client.json for browser-only fields, and emits a single
 * dist/pinkacord-overlay.js that the forked client loads after its standard
 * dex data.
 *
 * Pipeline (parallels tools/pinkacord/generator.ts):
 *   1. Load server content (reuses loadAndValidate from tools/pinkacord)
 *   2. Load client overrides
 *   3. Merge: each custom mon/move/ability gets its display fields combined
 *   4. Emit a single self-contained .js IIFE
 *   5. Atomic temp-rename
 */

import * as fs from "fs";
import * as path from "path";

import { loadAndValidate as loadServerContent, BuildError } from "../pinkacord/generator";
import { ClientFileSchema, type ClientFile } from "./schemas";

const REPO_ROOT = process.cwd();
const CLIENT_OVERRIDES_FILE = path.join(REPO_ROOT, "content", "pinkacord-client.json");
const OUTPUT_FILE = path.join(REPO_ROOT, "dist", "pinkacord-overlay.js");
const SPRITE_DIR = path.join(REPO_ROOT, "content", "pinkacord", "sprites");

const OVERLAY_VERSION = "1";

/** Returns the URL for a custom sprite if one exists for this species id. */
function customSpriteUrl(id: string): string | null {
	for (const ext of [".png", ".gif"]) {
		if (fs.existsSync(path.join(SPRITE_DIR, id + ext))) return `/sprites/pinkacord/${id}${ext}`;
	}
	return null;
}

// ────────────────────────────────────────────────────────────────────────────

function loadClientOverrides(): ClientFile {
	if (!fs.existsSync(CLIENT_OVERRIDES_FILE)) {
		// Empty overrides are allowed — most fields can be derived from server content.
		return { schemaVersion: 1, species: [], moves: [], abilities: [] };
	}
	const raw = JSON.parse(fs.readFileSync(CLIENT_OVERRIDES_FILE, "utf8"));
	const result = ClientFileSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues.map((iss) => {
			const at = iss.path.length ? ` at ${iss.path.join(".")}` : "";
			return `${iss.message}${at}`;
		});
		throw new BuildError(CLIENT_OVERRIDES_FILE, issues);
	}
	return result.data;
}

// ────────────────────────────────────────────────────────────────────────────
// Merge server content with client overrides into the shape each global
// expects. The result is plain serializable data — no functions, no
// references — so a JSON.stringify gives us the exact bytes we want.
// ────────────────────────────────────────────────────────────────────────────

interface OverlayShape {
	pokedex: Record<string, unknown>;
	moves: Record<string, unknown>;
	abilities: Record<string, unknown>;
	items: Record<string, unknown>;
	formatsData: Record<string, unknown>;
}

function buildOverlay(modId: string): OverlayShape {
	const server = loadServerContent(modId);
	const client = loadClientOverrides();
	const clientSpecies = new Map(client.species.map((s) => [s.id, s] as const));
	const clientMoves = new Map(client.moves.map((m) => [m.id, m] as const));
	const clientAbilities = new Map(client.abilities.map((a) => [a.id, a] as const));

	const pokedex: Record<string, unknown> = {};
	for (const s of server.species) {
		const co = clientSpecies.get(s.id);
		const spriteUrl = customSpriteUrl(s.id);
		pokedex[s.id] = {
			num: s.num,
			name: s.name,
			types: s.types,
			baseStats: s.baseStats,
			abilities: { 0: s.abilities["0"], 1: s.abilities["1"], H: s.abilities.H, S: s.abilities.S },
			heightm: s.heightm,
			weightkg: s.weightkg,
			color: s.color,
			eggGroups: s.eggGroups,
			// spriteid: name of the sprite to use from PS's built-in sprite atlas
			//   (fallback when we don't ship a custom sprite for this mon).
			spriteid: co?.spriteid ?? s.id,
			// spriteurl: explicit URL to our custom sprite, if one is on disk.
			//   The forked client should prefer this when present.
			...(spriteUrl ? { spriteurl: spriteUrl } : {}),
			tier: s.tier,
		};
	}

	const moves: Record<string, unknown> = {};
	for (const m of server.moves) {
		const co = clientMoves.get(m.id);
		moves[m.id] = {
			num: m.num,
			name: m.name,
			type: m.type,
			category: m.category,
			basePower: m.basePower,
			accuracy: m.accuracy,
			pp: m.pp,
			priority: m.priority,
			target: m.target,
			shortDesc: m.shortDesc,
			desc: m.desc,
			...(co?.animationOf ? { animationOf: co.animationOf } : {}),
		};
	}

	const abilities: Record<string, unknown> = {};
	for (const a of server.abilities) {
		const co = clientAbilities.get(a.id);
		abilities[a.id] = {
			name: a.name,
			shortDesc: a.shortDesc,
			desc: co?.longDesc ?? a.desc ?? a.shortDesc,
		};
	}

	const items: Record<string, unknown> = {};
	for (const it of server.items) {
		items[it.id] = {
			num: it.num,
			name: it.name,
			shortDesc: it.shortDesc,
			desc: it.desc ?? it.shortDesc,
		};
	}

	const formatsData: Record<string, unknown> = {};
	for (const s of server.species) {
		formatsData[s.id] = {
			tier: s.tier,
			doublesTier: s.doublesTier ?? s.tier,
		};
	}

	return { pokedex, moves, abilities, items, formatsData };
}

// ────────────────────────────────────────────────────────────────────────────
// Emit the overlay JS — an IIFE that defers itself until the globals are
// available, then merges our entries in. Idempotent on repeat loads.
// ────────────────────────────────────────────────────────────────────────────

function emitOverlay(modId: string, overlay: OverlayShape): string {
	const lines = [
		`/* Pinkacord client overlay v${OVERLAY_VERSION} for mod "${modId}".`,
		` * GENERATED — do not edit by hand. Edit content/ + content/pinkacord-client.json`,
		` * and run \`npm run pinkacord-client:build\`. */`,
		`(function() {`,
		`	"use strict";`,
		`	var PINKACORD_OVERLAY_VERSION = "${OVERLAY_VERSION}";`,
		`	var pokedex = ${JSON.stringify(overlay.pokedex, null, 2)};`,
		`	var moves = ${JSON.stringify(overlay.moves, null, 2)};`,
		`	var abilities = ${JSON.stringify(overlay.abilities, null, 2)};`,
		`	var items = ${JSON.stringify(overlay.items, null, 2)};`,
		`	var formatsData = ${JSON.stringify(overlay.formatsData, null, 2)};`,
		`	function apply() {`,
		`		if (typeof window === "undefined") return;`,
		`		window.BattlePokedex = window.BattlePokedex || {};`,
		`		Object.assign(window.BattlePokedex, pokedex);`,
		`		window.BattleMovedex = window.BattleMovedex || {};`,
		`		Object.assign(window.BattleMovedex, moves);`,
		`		window.BattleAbilities = window.BattleAbilities || {};`,
		`		Object.assign(window.BattleAbilities, abilities);`,
		`		window.BattleItems = window.BattleItems || {};`,
		`		Object.assign(window.BattleItems, items);`,
		`		window.BattleFormatsData = window.BattleFormatsData || {};`,
		`		Object.assign(window.BattleFormatsData, formatsData);`,
		`		window.PinkacordOverlay = { version: PINKACORD_OVERLAY_VERSION, modId: ${JSON.stringify(modId)} };`,
		`	}`,
		`	if (typeof window !== "undefined" && window.BattlePokedex) {`,
		`		apply();`,
		`	} else if (typeof window !== "undefined") {`,
		`		// Defer until standard dex data has loaded. Most pages load it synchronously`,
		`		// but the teambuilder can lazy-load; retry on a short interval up to 5s.`,
		`		var attempts = 0;`,
		`		var timer = setInterval(function() {`,
		`			attempts++;`,
		`			if (window.BattlePokedex || attempts > 50) {`,
		`				clearInterval(timer);`,
		`				apply();`,
		`			}`,
		`		}, 100);`,
		`	}`,
		`})();`,
		``,
	];
	return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export interface ClientBuildResult {
	modId: string;
	outputPath: string;
	bytes: number;
	stats: { species: number; moves: number; abilities: number; items: number };
}

export function build(modId: string): ClientBuildResult {
	const overlay = buildOverlay(modId);
	const js = emitOverlay(modId, overlay);

	fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
	const tmp = OUTPUT_FILE + ".tmp";
	fs.writeFileSync(tmp, js, "utf8");
	fs.renameSync(tmp, OUTPUT_FILE);

	// Also copy to server/static so the PS server can serve it
	const staticDir = path.join(REPO_ROOT, "server", "static");
	fs.mkdirSync(staticDir, { recursive: true });
	fs.copyFileSync(OUTPUT_FILE, path.join(staticDir, "pinkacord-overlay.js"));

	return {
		modId,
		outputPath: path.relative(REPO_ROOT, OUTPUT_FILE),
		bytes: Buffer.byteLength(js, "utf8"),
		stats: {
			species: Object.keys(overlay.pokedex).length,
			moves: Object.keys(overlay.moves).length,
			abilities: Object.keys(overlay.abilities).length,
			items: Object.keys(overlay.items).length,
		},
	};
}
