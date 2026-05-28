/**
 * Pinkacord admin — read-only PS dex lookups.
 *
 * Loads PS's own dex (compiled, from dist/sim/dex.js) and exposes the lists
 * the admin panel needs for autocomplete + cross-reference validation:
 *
 *   - all known ability names
 *   - all known move names
 *   - all known species names
 *   - all known item names
 *
 * Used by GET /api/ps-dex/* endpoints. The lists are cached after first read.
 */

const REPO_ROOT = process.cwd();

let cache: {
	abilities: string[];
	moves: string[];
	species: string[];
	items: string[];
	speciesDetail: { name: string; id: string; num: number; types: string[]; tier: string; baseStats: any }[];
	movesDetail: { name: string; id: string; type: string; category: string; basePower: number; accuracy: number | true; pp: number }[];
} | null = null;

/** Lazy-load PS dex via the compiled dist build. */
function loadCache(): NonNullable<typeof cache> {
	if (cache) return cache;
	// Use require so we read from dist/ at runtime — avoids pulling all of PS
	// into the admin server's transpilation graph at build time.
	const { Dex } = require(`${REPO_ROOT}/dist/sim/dex.js`);
	const gen9 = Dex.mod("gen9");
	gen9.includeData(); // force-load everything
	const data = gen9.data;
	const sortFor = (table: Record<string, any>, nameKey = "name") =>
		Object.values(table)
			.filter((v: any) => v && v[nameKey] && v.isNonstandard !== "Past" && v.isNonstandard !== "Future")
			.map((v: any) => v[nameKey] as string)
			.sort();
	const speciesDetail = Object.values(data.Pokedex)
		.filter((v: any) => v && v.name && v.isNonstandard !== "Past" && v.isNonstandard !== "Future")
		.map((v: any) => ({
			name: v.name,
			id: (v.name as string).toLowerCase().replace(/[^a-z0-9]/g, ""),
			num: v.num || 0,
			types: v.types || [],
			tier: v.tier || "Untiered",
			baseStats: v.baseStats || {},
		}))
		.sort((a, b) => a.num - b.num);
	const movesDetail = Object.values(data.Moves)
		.filter((v: any) => v && v.name && v.isNonstandard !== "Past" && v.isNonstandard !== "Future")
		.map((v: any) => ({
			name: v.name,
			id: (v.name as string).toLowerCase().replace(/[^a-z0-9]/g, ""),
			type: v.type || "Normal",
			category: v.category || "Status",
			basePower: v.basePower || 0,
			accuracy: v.accuracy === true ? true as const : (v.accuracy || 100),
			pp: v.pp || 0,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	cache = {
		abilities: sortFor(data.Abilities),
		moves: sortFor(data.Moves),
		species: sortFor(data.Pokedex),
		items: sortFor(data.Items),
		speciesDetail,
		movesDetail,
	};
	return cache;
}

export function abilitiesAll(): string[] { return loadCache().abilities; }
export function movesAll(): string[] { return loadCache().moves; }
export function speciesAll(): string[] { return loadCache().species; }
export function itemsAll(): string[] { return loadCache().items; }
export function speciesDetailAll() { return loadCache().speciesDetail; }
export function movesDetailAll() { return loadCache().movesDetail; }

const modSpeciesCache = new Map<string, string[]>();
export function speciesForMod(modId: string): string[] {
	if (modSpeciesCache.has(modId)) return modSpeciesCache.get(modId)!;
	const { Dex } = require(`${REPO_ROOT}/dist/sim/dex.js`);
	try {
		const d = Dex.mod(modId);
		d.includeData();
		const names = Object.values(d.data.Pokedex)
			.filter((v: any) => v && v.name && v.isNonstandard !== "Past" && v.isNonstandard !== "Future")
			.map((v: any) => v.name as string)
			.sort();
		modSpeciesCache.set(modId, names);
		return names;
	} catch {
		modSpeciesCache.set(modId, []);
		return [];
	}
}

/** Resolve a PS Pokémon's learnset by id. Returns sorted move display names. */
export function learnsetFor(speciesId: string): string[] {
	if (!speciesId) return [];
	const { Dex } = require(`${REPO_ROOT}/dist/sim/dex.js`);
	const gen9 = Dex.mod("gen9");
	gen9.includeData();
	const id = speciesId.toLowerCase().replace(/[^a-z0-9]/g, "");
	const ls = gen9.data.Learnsets && gen9.data.Learnsets[id];
	if (!ls || !ls.learnset) return [];
	const moveIds = Object.keys(ls.learnset);
	const names: string[] = [];
	for (const mid of moveIds) {
		const m = gen9.data.Moves[mid];
		if (m && m.name) names.push(m.name);
	}
	return names.sort();
}

/** Case-insensitive exact match against PS abilities. */
export function isKnownAbility(name: string): boolean {
	if (!name) return false;
	const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
	return loadCache().abilities.some((a) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === id);
}
export function isKnownMove(name: string): boolean {
	if (!name) return false;
	const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
	return loadCache().moves.some((m) => m.toLowerCase().replace(/[^a-z0-9]/g, "") === id);
}

/** Suggest the closest ability name to the given input (for typo fixes). */
export function suggestAbility(input: string): string | null {
	const target = input.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (!target) return null;
	let best: string | null = null;
	let bestDist = Infinity;
	for (const candidate of loadCache().abilities) {
		const cid = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
		const d = levenshtein(target, cid);
		if (d < bestDist) { bestDist = d; best = candidate; }
	}
	return bestDist <= 3 ? best : null;
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const m: number[][] = [];
	for (let i = 0; i <= a.length; i++) m[i] = [i];
	for (let j = 0; j <= b.length; j++) m[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
		}
	}
	return m[a.length][b.length];
}
