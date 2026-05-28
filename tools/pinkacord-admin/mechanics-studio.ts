/**
 * Mechanic Studio — describe a game idea in plain English; get a ready-to-save
 * ability or format configuration without writing code.
 *
 * Pipeline:
 *   1. Famous presets (Shared Power format, etc.)
 *   2. Pattern-based ability parser (instant, free)
 *   3. LLM ability translator (optional, for anything else)
 */

import { parseAbilityDescription } from "./ability-nlp";
import { parseAbilityWithLLM, designFormatWithLLM, isLLMConfigured } from "./llm";
import type { AbilityLLMResult } from "./llm";

export type MechanicTarget = "ability" | "format";

export interface MechanicDesignResult {
	target: MechanicTarget;
	approach: string;
	/** ability fields to merge into the editor */
	ability?: {
		effects: { kind: string; params: Record<string, unknown> }[];
		customHandlerCode?: string | null;
		shortDescription?: string;
		explanation?: string;
	};
	/** format fields to merge into the editor */
	format?: {
		sharedPower?: boolean;
		suggestedName?: string;
		suggestedDesc?: string;
		gameType?: "singles" | "doubles" | "triples" | "multi" | "freeforall" | "rotation";
		team?: "random" | "randomFFA";
		bestOfDefault?: boolean;
		ruleset?: string[];
		banlist?: string[];
		unbanlist?: string[];
		explanation?: string;
		needsDev?: boolean;
		devNote?: string;
	};
	warnings: string[];
	matchedPatterns?: string[];
	llmAvailable: boolean;
	usedAI: boolean;
}

// ── Format pattern presets ────────────────────────────────────────────────────

const PS_TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];

function detectFormatPreset(text: string): MechanicDesignResult["format"] | null {
	const lower = text.toLowerCase();

	// "bring 12 pick 6" / "pick 6 from 12" / "team of 12 select 6"
	const pickFrom = lower.match(/(?:bring|team of|select from|out of)\s*(\d+).*?(?:pick|select|choose|use)\s*(\d+)/) ||
		lower.match(/(?:pick|select|choose|use)\s*(\d+).*?(?:from|of|out of)\s*(\d+)/);
	if (pickFrom) {
		const a = parseInt(pickFrom[1], 10), b = parseInt(pickFrom[2], 10);
		// figure out which is the bring and which is the pick
		const big = Math.max(a, b), small = Math.min(a, b);
		if (big >= 2 && big <= 24 && small >= 1 && small <= big) {
			const gameType: "singles" | "doubles" = /doubles?/.test(lower) ? "doubles" : "singles";
			return {
				suggestedName: `[Pinkacord] Bring ${big} Pick ${small}`,
				suggestedDesc: `Bring ${big} Pokémon. Pick ${small} at team preview.`,
				gameType,
				ruleset: [gameType === "doubles" ? "Standard Doubles" : "Standard", `Min Team Size = ${big}`, `Max Team Size = ${big}`, `Picked Team Size = ${small}`],
				banlist: ["Uber", "AG", "Moody", "King's Rock", "Baton Pass"],
				unbanlist: [],
				explanation: `Forced team size = ${big}, picked team size = ${small}. Standard banlist.`,
				needsDev: false,
			};
		}
	}

	// Monotype X
	const monoMatch = lower.match(/mono(?:type)?\s+(\w+)/);
	if (monoMatch) {
		const typeRaw = monoMatch[1];
		const type = PS_TYPES.find(t => t.toLowerCase() === typeRaw.toLowerCase());
		if (type) {
			return {
				suggestedName: `[Pinkacord] Monotype ${type}`,
				suggestedDesc: `All Pokémon must share the ${type} type.`,
				gameType: "singles",
				ruleset: ["Standard", "Same Type Clause"],
				banlist: ["Uber", "AG", "Moody", "King's Rock"],
				unbanlist: [],
				explanation: `Same Type Clause locks the team to one shared type. ${type} suggested by the description.`,
				needsDev: false,
			};
		}
	}
	if (/\bmono\s*type\b/.test(lower) || /\bmonotype\b/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Monotype",
			suggestedDesc: "All Pokémon must share a single type. Player picks the type.",
			gameType: "singles",
			ruleset: ["Standard", "Same Type Clause"],
			banlist: ["Uber", "AG", "Moody", "King's Rock"],
			unbanlist: [],
			explanation: "Same Type Clause is PS's native monotype rule.",
			needsDev: false,
		};
	}

	// Inverse battle
	if (/\binverse\b/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Inverse",
			suggestedDesc: "The type chart is flipped — super-effective becomes not very effective and vice versa.",
			gameType: "singles",
			ruleset: ["Standard", "Inverse Mod"],
			banlist: ["Uber", "AG", "Moody"],
			unbanlist: [],
			explanation: "Inverse Mod is a native PS ruleset that flips the type chart.",
			needsDev: false,
		};
	}

	// Scalemons
	if (/scalemon|scale\s*mons|600\s*bst|bst.*600/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Scalemons",
			suggestedDesc: "Each Pokémon's stats are scaled so their BST equals 600.",
			gameType: "singles",
			ruleset: ["Standard", "Scalemons Mod"],
			banlist: ["Uber", "AG", "Moody"],
			unbanlist: [],
			explanation: "Scalemons Mod is a native PS ruleset.",
			needsDev: false,
		};
	}

	// Level cap
	const lvlMatch = lower.match(/(?:level|lvl)\s*(?:cap|capped at|set to|=)?\s*(\d{1,3})/);
	if (lvlMatch) {
		const lv = parseInt(lvlMatch[1], 10);
		if (lv >= 1 && lv <= 100) {
			return {
				suggestedName: `[Pinkacord] Level ${lv}`,
				suggestedDesc: `Every Pokémon is set to level ${lv}.`,
				gameType: "singles",
				ruleset: ["Standard", `Adjust Level = ${lv}`],
				banlist: ["Uber", "AG", "Moody"],
				unbanlist: [],
				explanation: `Adjust Level = ${lv} forces all mons to that level.`,
				needsDev: false,
			};
		}
	}

	// AAA — Almost Any Ability
	if (/almost\s+any\s+abilit|\baaa\b/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] AAA",
			suggestedDesc: "Almost Any Ability — most abilities are available on most Pokémon.",
			gameType: "singles",
			ruleset: ["Standard", "!Obtainable Abilities", "-Ability: Arena Trap", "-Ability: Comatose", "-Ability: Contrary", "-Ability: Fur Coat", "-Ability: Good as Gold", "-Ability: Huge Power", "-Ability: Ice Scales", "-Ability: Imposter", "-Ability: Innards Out", "-Ability: Magnet Pull", "-Ability: Moody", "-Ability: Parental Bond", "-Ability: Poison Heal", "-Ability: Pure Power", "-Ability: Shadow Tag", "-Ability: Simple", "-Ability: Speed Boost", "-Ability: Stakeout", "-Ability: Triage", "-Ability: Water Bubble", "-Ability: Wonder Guard"],
			banlist: ["Uber", "AG"],
			unbanlist: [],
			explanation: "Toggles off Obtainable Abilities so any non-broken ability can be used by any Pokémon.",
			needsDev: false,
		};
	}

	// Camomons
	if (/camomons/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Camomons",
			suggestedDesc: "A Pokémon's typing equals the types of its first two moves.",
			gameType: "singles",
			ruleset: ["Standard", "Camomons Mod"],
			banlist: ["Uber", "AG", "Moody"],
			unbanlist: [],
			explanation: "Camomons Mod redefines typing from the first two move slots.",
			needsDev: false,
		};
	}

	// Tier Shift
	if (/tier\s*shift/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Tier Shift",
			suggestedDesc: "Pokémon get stat boosts based on how low their tier is — the lower the tier, the bigger the buff.",
			gameType: "singles",
			ruleset: ["Standard", "Tier Shift Mod"],
			banlist: ["Uber", "AG", "Moody"],
			unbanlist: [],
			explanation: "Tier Shift Mod automatically scales lower-tier mons.",
			needsDev: false,
		};
	}

	// Balanced Hackmons
	if (/balanced\s*hack|\bbh\b/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Balanced Hackmons",
			suggestedDesc: "Anything goes for abilities, items and moves — except a small list of broken ones.",
			gameType: "singles",
			ruleset: ["-Nonexistent", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "Dynamax Clause", "CFZ Clause", "Forme Clause", "Species Clause"],
			banlist: ["AG", "Moody", "Shadow Tag", "Comatose + Sleep Talk", "Imposter", "Arena Trap", "Magnet Pull"],
			unbanlist: [],
			explanation: "BH disables Obtainable so any move/ability/item is available; only the most broken combos are banned.",
			needsDev: false,
		};
	}

	// Free-for-all
	if (/free.?for.?all|\bffa\b/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Free-For-All",
			suggestedDesc: "Four players, last one standing wins.",
			gameType: "freeforall",
			ruleset: ["Standard"],
			banlist: ["Uber", "AG", "Moody", "Final Gambit", "Perish Song"],
			unbanlist: [],
			explanation: "PS supports freeforall gameType natively for 4-player chaos.",
			needsDev: false,
		};
	}

	// Doubles base format
	if (/^doubles?\s*ou\b|doubles?\s+standard/.test(lower)) {
		return {
			suggestedName: "[Pinkacord] Doubles OU",
			suggestedDesc: "Pinkacord doubles. Standard gen 9 doubles rules plus the Pinkacord dex.",
			gameType: "doubles",
			ruleset: ["Standard Doubles"],
			banlist: ["DUber", "Moody", "Power Construct", "Shadow Tag", "Final Gambit", "Perish Song", "Swagger"],
			unbanlist: [],
			explanation: "Native PS Standard Doubles ruleset.",
			needsDev: false,
		};
	}

	return null;
}

function looksLikeFormatRequest(text: string): boolean {
	const lower = text.toLowerCase();
	// explicit "format" / "tier" / "OM" / "tournament" / a quantity-pick pattern
	return /format|tier|metagame|\bom\b|tournament|team\s+of\s+\d|bring\s+\d|pick\s+\d|monotype|mono\s*type|inverse|scalemons|level\s*\d{1,3}|doubles?|triples?|free.?for.?all|sleep\s+clause/.test(lower);
}

function looksLikeFormatSharedPower(text: string): boolean {
	const lower = text.toLowerCase();
	if (!/shared\s*power|share\s+(everyone'?s?|all|team)\s+abilit/i.test(lower)) return false;
	// "this pokemon's ability" → single-mon ability, not full OM
	if (/\b(this|its|holder'?s?)\s+pokemon\b/i.test(lower) && !/format|lobby|everyone|whole\s+team/i.test(lower)) {
		return false;
	}
	return /\bformat|om\b|everyone|whole\s+team|all\s+pokemon|once\s+.*switch/i.test(lower)
		|| !/\b(this|holder|single)\b/i.test(lower);
}

function looksLikeAbilityShare(text: string): boolean {
	return /shared\s*power|share\s+(my|this|its)\s+abilit|allies?\s+(gain|get|have|share)/i.test(text);
}

export async function designMechanic(description: string): Promise<MechanicDesignResult> {
	const text = (description || "").trim();
	const base = { warnings: [] as string[], llmAvailable: isLLMConfigured(), usedAI: false };

	if (!text) {
		return { ...base, target: "ability", approach: "empty", warnings: ["Describe your mechanic in plain English first."] };
	}

	// ── Pattern presets for common formats (no LLM needed) ──────────────────
	const preset = detectFormatPreset(text);
	if (preset) {
		return {
			...base,
			target: "format",
			approach: "preset:format",
			format: preset,
			matchedPatterns: [preset.explanation || "Matched a built-in format preset."],
		};
	}

	// ── Preset: Shared Power format (Smogon OM) ─────────────────────────────
	if (looksLikeFormatSharedPower(text)) {
		return {
			...base,
			target: "format",
			approach: "preset:sharedPowerFormat",
			format: {
				sharedPower: true,
				suggestedName: "[Pinkacord] Shared Power",
				suggestedDesc: "Once a Pokémon switches in, its ability is shared with the rest of the team.",
				gameType: "singles",
			},
			matchedPatterns: ['Recognized Smogon "Shared Power" — teammates inherit abilities from switched-in Pokémon.'],
		};
	}

	// ── Preset: one-mon shares ability with allies ──────────────────────────
	if (looksLikeAbilityShare(text)) {
		return {
			...base,
			target: "ability",
			approach: "preset:shareAbilityWithAllies",
			ability: {
				effects: [{ kind: "shareAbilityWithAllies", params: { onSwitchIn: true } }],
				shortDescription: "Allies gain this Pokémon's ability.",
				explanation: "Uses the safe shareAbilityWithAllies effect — no custom code needed.",
			},
			matchedPatterns: ["Allies share this Pokémon's ability (innate volatiles)."],
		};
	}

	// ── LLM format design (if the text reads like a format idea) ────────────
	if (looksLikeFormatRequest(text) && isLLMConfigured()) {
		const fmt = await designFormatWithLLM(text);
		if (fmt.ok) {
			const r = fmt.result;
			const warnings: string[] = [];
			if (r.needsDev) warnings.push(`This idea needs developer work: ${r.devNote}`);
			return {
				...base,
				target: "format",
				approach: r.needsDev ? "llm:format:needs-dev" : "llm:format",
				usedAI: true,
				format: {
					suggestedName: r.suggestedName,
					suggestedDesc: r.suggestedDesc,
					gameType: r.gameType,
					team: r.team,
					bestOfDefault: r.bestOfDefault,
					ruleset: r.ruleset,
					banlist: r.banlist,
					unbanlist: r.unbanlist,
					sharedPower: r.sharedPower,
					explanation: r.explanation,
					needsDev: r.needsDev,
					devNote: r.devNote,
				},
				warnings,
				matchedPatterns: [r.explanation || "AI designed this format from your description."],
			};
		}
		// Fall through to ability parsing if format design failed
	}

	// ── Fast pattern parser ─────────────────────────────────────────────────
	const parsed = parseAbilityDescription(text);
	if (parsed.effects.length > 0 && parsed.warnings.length === 0) {
		return {
			...base,
			target: "ability",
			approach: "pattern",
			ability: {
				effects: parsed.effects,
				shortDescription: text.slice(0, 200),
			},
			matchedPatterns: parsed.matchedPatterns,
			warnings: [],
		};
	}

	// ── LLM fallback (autonomous) ───────────────────────────────────────────
	if (isLLMConfigured()) {
		const outcome = await parseAbilityWithLLM(text);
		if (outcome.ok) {
			const r: AbilityLLMResult = outcome.result;
			return {
				...base,
				target: "ability",
				approach: r.approach,
				usedAI: true,
				ability: {
					effects: r.effects,
					customHandlerCode: r.customHandlerCode,
					shortDescription: r.shortDescription,
					explanation: r.explanation,
				},
				warnings: parsed.warnings,
				matchedPatterns: parsed.matchedPatterns,
			};
		}
		return {
			...base,
			target: "ability",
			approach: "failed",
			warnings: [outcome.error, ...parsed.warnings],
			matchedPatterns: parsed.matchedPatterns,
		};
	}

	return {
		...base,
		target: "ability",
		approach: "partial",
		ability: parsed.effects.length ? { effects: parsed.effects } : undefined,
		warnings: [
			...parsed.warnings,
			"Couldn't fully translate this. Add LLM_API_KEY for AI inventing (free Groq key), or rephrase using simpler phrases.",
		],
		matchedPatterns: parsed.matchedPatterns,
	};
}
