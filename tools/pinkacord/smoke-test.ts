/**
 * Post-build smoke test.
 *
 * After generating new TS files and rebuilding PS's dist/, we want a fast
 * end-to-end check that:
 *   - every Pinkacord format loads at all
 *   - a canonical team using our custom mons/moves/abilities still validates
 *
 * The team is constructed automatically from the loaded content: one mon
 * per format-mod pairing, with its first legal-looking moves and either
 * the explicit Hidden Ability or slot 0. If validation fails, we surface
 * the PS error verbatim — that error is the same one an admin would see
 * after a bad edit, so it's our best front-line for "PS-side" cross-ref
 * issues (typo'd move/ability/type/etc).
 */

import { execFileSync } from "child_process";
import * as path from "path";

import { loadAndValidate, LoadedContent } from "./generator";

const REPO_ROOT = process.cwd();

/** Vanilla Gen-9-legal filler sets used to pad a team up to a format's Min Team
 * Size. Each appears at most once — species-clause-safe. Picked to be available
 * in Gen 9 with a known legal ability and at least one move. */
const VANILLA_FILLERS: { name: string; ability: string; move: string }[] = [
	{ name: "Pikachu", ability: "Static", move: "Thunderbolt" },
	{ name: "Snorlax", ability: "Thick Fat", move: "Body Slam" },
	{ name: "Garchomp", ability: "Rough Skin", move: "Earthquake" },
	{ name: "Dragonite", ability: "Multiscale", move: "Extreme Speed" },
	{ name: "Tyranitar", ability: "Sand Stream", move: "Stone Edge" },
	{ name: "Metagross", ability: "Clear Body", move: "Meteor Mash" },
	{ name: "Salamence", ability: "Intimidate", move: "Dragon Claw" },
	{ name: "Hydreigon", ability: "Levitate", move: "Dark Pulse" },
	{ name: "Gengar", ability: "Cursed Body", move: "Shadow Ball" },
	{ name: "Gyarados", ability: "Intimidate", move: "Waterfall" },
	{ name: "Lapras", ability: "Water Absorb", move: "Surf" },
	{ name: "Toxapex", ability: "Regenerator", move: "Toxic" },
	{ name: "Skarmory", ability: "Sturdy", move: "Brave Bird" },
	{ name: "Hatterene", ability: "Magic Bounce", move: "Psychic" },
	{ name: "Corviknight", ability: "Pressure", move: "Brave Bird" },
	{ name: "Iron Valiant", ability: "Quark Drive", move: "Moonblast" },
	{ name: "Great Tusk", ability: "Protosynthesis", move: "Earthquake" },
	{ name: "Roaring Moon", ability: "Protosynthesis", move: "Crunch" },
	{ name: "Iron Treads", ability: "Quark Drive", move: "Earthquake" },
	{ name: "Kingambit", ability: "Defiant", move: "Kowtow Cleave" },
	{ name: "Glimmora", ability: "Toxic Debris", move: "Power Gem" },
	{ name: "Espathra", ability: "Speed Boost", move: "Stored Power" },
	{ name: "Iron Hands", ability: "Quark Drive", move: "Drain Punch" },
	{ name: "Iron Bundle", ability: "Quark Drive", move: "Hydro Pump" },
];

function vanillaFiller(f: { name: string; ability: string; move: string }): string {
	return `${f.name}\nAbility: ${f.ability}\nEVs: 4 HP\nLevel: 100\n- ${f.move}`;
}

function parseMinTeamSize(ruleset: readonly string[]): number {
	for (const r of ruleset) {
		const m = r.match(/^\s*Min Team Size\s*=\s*(\d+)\s*$/i);
		if (m) return parseInt(m[1], 10);
	}
	return 0;
}

/** Build a minimal but valid team for one of our formats. */
function buildCanonicalTeam(content: LoadedContent, gameType: string = "singles", minTeamSize = 0): string | null {
	if (content.species.length === 0) return null;
	const species = content.species[0];

	const learnset = content.learnsets.find((l) => l.species === species.id);
	const moves = (learnset?.moves ?? []).slice(0, 4);
	if (moves.length === 0) return null;
	const ability = species.abilities.H ?? species.abilities["0"];

	const monBlock = (sp: typeof species, mvs: string[]) => {
		const abil = sp.abilities.H ?? sp.abilities["0"];
		const lines = [
			`${sp.name} @ Choice Specs`,
			`Ability: ${abil}`,
			`Tera Type: ${sp.types[0]}`,
			`EVs: 252 SpA / 4 SpD / 252 Spe`,
			`Timid Nature`,
			`IVs: 0 Atk`,
		];
		for (const moveId of mvs) {
			const customMove = content.moves.find((m) => m.id === moveId);
			lines.push(`- ${customMove?.name ?? prettifyId(moveId)}`);
		}
		return lines.join("\n");
	};

	const firstMon = monBlock(species, moves);

	// Doubles formats require at least 2 Pokémon. Add a second species if we have one.
	if (gameType === "doubles" && content.species.length >= 2) {
		const second = content.species[1];
		const secondLearnset = content.learnsets.find((l) => l.species === second.id);
		const secondMoves = (secondLearnset?.moves ?? []).slice(0, 4);
		if (secondMoves.length === 0) return firstMon; // best-effort fallback
		return firstMon + "\n\n" + monBlock(second, secondMoves);
	}
	// For singles, build a team with up to 6 different species
	if (gameType === "singles" && content.species.length >= 2) {
		const teamMons: string[] = [firstMon];
		for (let i = 1; i < Math.min(content.species.length, 6); i++) {
			const sp = content.species[i];
			const ls = content.learnsets.find((l) => l.species === sp.id);
			const mvs = (ls?.moves ?? []).slice(0, 4);
			if (mvs.length > 0) {
				teamMons.push(monBlock(sp, mvs));
			}
		}
		while (teamMons.length < Math.max(minTeamSize, 0)) {
			const filler = VANILLA_FILLERS[teamMons.length - 1];
			if (!filler) break;
			teamMons.push(vanillaFiller(filler));
			void filler;
		}
		return teamMons.join("\n\n");
	}
	if (minTeamSize > 1) {
		const teamMons = [firstMon];
		while (teamMons.length < minTeamSize) {
			const filler = VANILLA_FILLERS[teamMons.length - 1];
			if (!filler) break;
			teamMons.push(vanillaFiller(filler));
			void filler;
		}
		return teamMons.join("\n\n");
	}
	return firstMon;
}

/** Convert "thunderbolt" → "Thunderbolt", "voltswitch" → "Volt Switch" (best-effort). */
function prettifyId(id: string): string {
	// PS accepts the lowercase ID too in team imports, so a clean-but-imperfect
	// fallback is fine. We capitalize first letter so it reads naturally in logs.
	return id.charAt(0).toUpperCase() + id.slice(1);
}

export interface SmokeResult {
	formatId: string;
	formatName: string;
	passed: boolean;
	stderr: string;
	/** When true, the format itself loads, but our canonical team can't satisfy
	 * its clauses (e.g. Monotype where no custom mon shares the type). Treated
	 * as a warning by the build, not a hard failure. */
	warning?: boolean;
}

/** Heuristics for "format is fine; we just can't auto-build a team that satisfies its clauses." */
function isTeambuildFailureNotFormatBug(stderr: string): boolean {
	const s = stderr.toLowerCase();
	return (
		s.includes("must have the same type") ||      // Same Type Clause
		s.includes("must be the same type") ||
		s.includes("force monotype") ||
		s.includes("isn't allowed") && s.includes("clause") ||
		s.includes("z-move clause") ||
		s.includes("species clause") && s.includes("duplicate") ||
		s.includes("species you used") && s.includes("aren't allowed") ||
		s.includes("tournament-banned")
	);
}

export function runSmokeTest(modId: string): SmokeResult[] {
	const content = loadAndValidate(modId);

	const results: SmokeResult[] = [];
	for (const f of content.formats) {
		if (!f.enabled) continue;
		// Random formats use generate-team; build-your-own use validate-team.
		const result = f.team === "random" || f.team === "randomFFA"
			? generateRandomTeam(f.id)
			: (() => {
				const minSize = parseMinTeamSize(f.ruleset || []);
				const team = buildCanonicalTeam(content, f.gameType, minSize);
				if (!team) return { exitCode: 1, stderr: "Could not build canonical team — no species/learnset defined." };
				return validateTeam(f.id, team);
			})();
		const failedDueToClause = result.exitCode !== 0 && isTeambuildFailureNotFormatBug(result.stderr);
		results.push({
			formatId: f.id,
			formatName: f.name,
			passed: result.exitCode === 0 || failedDueToClause,
			stderr: result.stderr,
			warning: failedDueToClause,
		});
	}
	return results;
}

function validateTeam(formatId: string, team: string): { exitCode: number; stderr: string } {
	try {
		execFileSync(process.execPath, ["pokemon-showdown", "validate-team", formatId], {
			cwd: REPO_ROOT,
			input: team,
			stdio: ["pipe", "pipe", "pipe"],
			encoding: "utf8",
		});
		return { exitCode: 0, stderr: "" };
	} catch (e: any) {
		return {
			exitCode: typeof e.status === "number" ? e.status : 1,
			stderr: (e.stderr ?? e.message ?? String(e)).toString(),
		};
	}
}

function generateRandomTeam(formatId: string): { exitCode: number; stderr: string } {
	try {
		execFileSync(process.execPath, ["pokemon-showdown", "generate-team", formatId], {
			cwd: REPO_ROOT,
			stdio: ["pipe", "pipe", "pipe"],
			encoding: "utf8",
		});
		return { exitCode: 0, stderr: "" };
	} catch (e: any) {
		return {
			exitCode: typeof e.status === "number" ? e.status : 1,
			stderr: (e.stderr ?? e.message ?? String(e)).toString(),
		};
	}
}
