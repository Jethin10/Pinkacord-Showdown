/**
 * Natural-language ability parser.
 *
 * Takes a plain-English description of an ability and produces a list of
 * effect-references that map into the curated effect-kind registry in
 * `tools/pinkacord/effects.ts`.
 *
 * This is pattern-based, not LLM-based — it covers the common idioms used in
 * Smogon-style descriptions. When a phrase doesn't match any pattern we
 * surface a `warnings[]` entry telling the user what we couldn't translate;
 * they can either rephrase, or add the effect manually with the chip editor.
 *
 * Why not an LLM: zero new deps, no API key, deterministic, fast, free. We
 * cover ~80% of community ability requests with this. The other 20% can fall
 * back to manual composition.
 */

const TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy", "Stellar"];
const STATUS_WORDS: Record<string, string> = {
	burn: "brn", burned: "brn",
	paralyze: "par", paralyse: "par", paralyzed: "par", paralysis: "par",
	poison: "psn", poisoned: "psn",
	"badly poison": "tox", "badly poisoned": "tox", toxic: "tox",
	freeze: "frz", frozen: "frz",
	sleep: "slp", asleep: "slp",
};
const STATS: Record<string, string> = {
	hp: "hp",
	attack: "atk", atk: "atk",
	defense: "def", defence: "def", def: "def",
	"special attack": "spa", spa: "spa", "sp atk": "spa", "sp. atk": "spa",
	"special defense": "spd", spd: "spd", "sp def": "spd", "sp. def": "spd",
	speed: "spe", spe: "spe",
};
const WEATHERS: Record<string, string> = {
	"sun": "sunnyday", "sunny": "sunnyday", "harsh sunlight": "sunnyday",
	"rain": "raindance", "rainy": "raindance",
	"sandstorm": "sandstorm", "sand": "sandstorm",
	"snow": "snow", "hail": "snow", "snowy": "snow",
};

export interface ParsedAbility {
	effects: { kind: string; params: any }[];
	warnings: string[];
	matchedPatterns: string[];
}

function findType(text: string): string | null {
	for (const t of TYPES) {
		if (new RegExp(`\\b${t.toLowerCase()}\\b`, "i").test(text)) return t;
	}
	return null;
}
function findStat(text: string): string | null {
	const sorted = Object.keys(STATS).sort((a, b) => b.length - a.length);
	for (const k of sorted) {
		if (new RegExp(`\\b${k.replace(/\./g, "\\.")}\\b`, "i").test(text)) return STATS[k];
	}
	return null;
}
function findStatus(text: string): string | null {
	const sorted = Object.keys(STATUS_WORDS).sort((a, b) => b.length - a.length);
	for (const k of sorted) {
		if (new RegExp(`\\b${k}\\b`, "i").test(text)) return STATUS_WORDS[k];
	}
	return null;
}
function findWeather(text: string): string | null {
	const sorted = Object.keys(WEATHERS).sort((a, b) => b.length - a.length);
	for (const k of sorted) {
		if (new RegExp(`\\b${k}\\b`, "i").test(text)) return WEATHERS[k];
	}
	return null;
}

/** Parse a multiplier like "1.5x", "50%", "double", "1.33x" → number. */
function parseMultiplier(s: string): number | null {
	if (!s) return null;
	const lower = s.toLowerCase();
	if (/\bdoubl(e|es|ed)\b/.test(lower)) return 2;
	if (/\btripl(e|es|ed)\b/.test(lower)) return 3;
	if (/\bhalv(e|es|ed)\b/.test(lower)) return 0.5;
	const xMatch = lower.match(/(\d+(?:\.\d+)?)\s*[x×]/);
	if (xMatch) return parseFloat(xMatch[1]);
	const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
	if (pctMatch) {
		const pct = parseFloat(pctMatch[1]);
		// "boost X by 50%" → 1.5x; "50% chance" handled separately
		return 1 + pct / 100;
	}
	return null;
}

/** Parse a probability like "30%" or "30 percent" → number (1..100). */
function parsePercent(s: string): number | null {
	const m = s.match(/(\d+)\s*(?:%|percent\b)/i);
	if (!m) return null;
	const n = parseInt(m[1], 10);
	if (n < 1 || n > 100) return null;
	return n;
}

/** Parse an HP fraction like "1/3", "33%", "half" → fraction (0..1). */
function parseHpFraction(s: string): number | null {
	const lower = s.toLowerCase();
	if (/\bhalf\b/.test(lower)) return 0.5;
	const frac = lower.match(/(\d+)\s*\/\s*(\d+)/);
	if (frac) {
		const num = parseInt(frac[1], 10);
		const den = parseInt(frac[2], 10);
		if (den > 0) return num / den;
	}
	const pct = lower.match(/(\d+)\s*%/);
	if (pct) return parseInt(pct[1], 10) / 100;
	return null;
}

// ────────────────────────────────────────────────────────────────────────────
// The parser
// ────────────────────────────────────────────────────────────────────────────

export function parseAbilityDescription(input: string): ParsedAbility {
	const text = (input || "").trim();
	const effects: { kind: string; params: any }[] = [];
	const warnings: string[] = [];
	const matched: string[] = [];

	if (!text) {
		warnings.push("(empty description)");
		return { effects, warnings, matchedPatterns: matched };
	}

	// Split into sentences/phrases so each can be parsed independently.
	// Use punctuation-followed-by-whitespace so decimals like "1.5x" survive.
	const phrases = text.split(/(?:[.;]\s+|\n+|\s+and\s+)/i).map((s) => s.trim().replace(/[.;]+$/, "")).filter(Boolean);

	for (const phrase of phrases) {
		const lower = phrase.toLowerCase();
		let phraseMatched = false;

		// ── Pattern: "X% chance to <status> on contact"
		if (/\bcontact\b/i.test(phrase) && /\bchance\b|\d+\s*%/i.test(phrase)) {
			const chance = parsePercent(phrase);
			const status = findStatus(phrase);
			if (chance && status) {
				effects.push({ kind: "statusOnContact", params: { status, chance } });
				matched.push(`"${phrase}" → ${chance}% ${status} on contact`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "boost <type> moves by X% / Xx"
		// or "<type> moves do/deal Xx damage" etc.
		{
			const t = findType(phrase);
			if (t && /\bmoves?\b/i.test(phrase)) {
				const mult = parseMultiplier(phrase);
				if (mult && mult > 1 && mult <= 3) {
					// Check for HP threshold
					const hpFrac = (/\bbelow\b|\bunder\b|\bwhen.*low.*hp\b/i.test(lower)) ? parseHpFraction(phrase) : null;
					if (hpFrac) {
						effects.push({ kind: "boostMovePowerWhenLowHp", params: { type: t, hpFraction: hpFrac, multiplier: mult } });
						matched.push(`"${phrase}" → ${t} moves ×${mult} below ${(hpFrac * 100).toFixed(0)}% HP`);
					} else {
						effects.push({ kind: "boostMovePowerByType", params: { type: t, multiplier: mult } });
						matched.push(`"${phrase}" → ${t} moves ×${mult}`);
					}
					phraseMatched = true;
					continue;
				}
			}
		}

		// ── Pattern: "boost physical/special moves by ..."
		{
			const cat = /\bphysical\b/i.test(phrase) ? "Physical" : /\bspecial\b/i.test(phrase) ? "Special" : null;
			if (cat && /\bmoves?\b/i.test(phrase)) {
				const mult = parseMultiplier(phrase);
				if (mult && mult > 1 && mult <= 3) {
					effects.push({ kind: "boostMovePowerByCategory", params: { category: cat, multiplier: mult } });
					matched.push(`"${phrase}" → ${cat} moves ×${mult}`);
					phraseMatched = true;
					continue;
				}
			}
		}

		// ── Pattern: "raises/boosts <stat> by N when entering"
		if (/(?:on\s+entry|switch[-\s]?in|switches?\s+in|on\s+switch|enter|enters\s+battle)/i.test(phrase)) {
			const stat = findStat(phrase);
			const amountM = phrase.match(/by\s+(\d+)|\+\s*(\d+)/i);
			if (stat && amountM) {
				const amount = parseInt(amountM[1] || amountM[2] || "1", 10);
				if (amount >= 1 && amount <= 3) {
					effects.push({ kind: "boostStatOnEntry", params: { stat, amount } });
					matched.push(`"${phrase}" → +${amount} ${stat} on switch-in`);
					phraseMatched = true;
					continue;
				}
			}
		}

		// ── Pattern: "immune to <type>" / "absorbs <type>"
		if (/\bimmune\s+to\b|\babsorb(s|ed)?\b/i.test(phrase)) {
			const t = findType(phrase);
			if (t) {
				const absorbs = /\babsorb|heal/i.test(phrase);
				effects.push({ kind: "immuneToType", params: { type: t, absorbsHeal: absorbs } });
				matched.push(`"${phrase}" → immune to ${t}${absorbs ? " (heals 25%)" : ""}`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "Nx speed in <weather>" / "Speed doubled in rain"
		if (/\bspeed\b/i.test(phrase)) {
			const w = findWeather(phrase);
			const m = parseMultiplier(phrase);
			if (w && m && m > 1) {
				effects.push({ kind: "weatherSpeedBoost", params: { weather: w, multiplier: m } });
				matched.push(`"${phrase}" → Speed ×${m} in ${w}`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "summons <weather>" / "sets up <weather>" on entry
		if (/\b(summons?|sets?\s+up|starts?|brings?)\b/i.test(phrase)) {
			const w = findWeather(phrase);
			if (w) {
				effects.push({ kind: "setWeatherOnEntry", params: { weather: w } });
				matched.push(`"${phrase}" → summons ${w} on switch-in`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "immune to <status>" / "cannot be <status>"
		if (/\bimmune\b|\bcannot\s+be\b|\bcan't\s+be\b|\bprotect(s|ed)\s+from\b/i.test(phrase)) {
			const s = findStatus(phrase);
			if (s) {
				effects.push({ kind: "statusImmunity", params: { status: s } });
				matched.push(`"${phrase}" → immune to ${s} status`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "heals X on switch out" / "regenerator-style"
		if (/\bregenerat|\bswitch(es|ing)?\s+out|\bswitches?\s+away/i.test(phrase)) {
			const frac = parseHpFraction(phrase) || (1 / 3);
			effects.push({ kind: "healOnSwitchOut", params: { fraction: frac } });
			matched.push(`"${phrase}" → heals ${(frac * 100).toFixed(0)}% on switch out`);
			phraseMatched = true;
			continue;
		}

		// ── Pattern: "speed boost each turn"
		if (/\bspeed\s+boost\b|\bspeed\s+rises?\s+(each|every)\s+turn\b/i.test(phrase)) {
			effects.push({ kind: "speedBoostEachTurn", params: {} });
			matched.push(`"${phrase}" → Speed +1 each turn`);
			phraseMatched = true;
			continue;
		}

		// ── Pattern: "takes half damage from <type>" / "<type> damage reduced"
		if (/\b(?:half|reduced?|less)\b.*\bdamage\b|\bresists?\b/i.test(phrase)) {
			const t = findType(phrase);
			if (t) {
				let mult = 0.5;
				const m = parseMultiplier(phrase);
				if (m && m < 1) mult = m;
				effects.push({ kind: "damageReductionByType", params: { type: t, multiplier: mult } });
				matched.push(`"${phrase}" → takes ×${mult} damage from ${t}`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "lowers foe <stat> on entry" / "intimidate"
		if (/(?:lowers?|reduces?|drops?)\s+(?:foe|enemy|opponent)/i.test(phrase) && /\b(on\s+entry|switch[-\s]?in|enters?)\b/i.test(phrase)) {
			const stat = findStat(phrase);
			const amountM = phrase.match(/by\s+(\d+)|\+\s*(\d+)/i);
			if (stat) {
				const amount = parseInt(amountM?.[1] || amountM?.[2] || "1", 10);
				effects.push({ kind: "lowerStatOnEntry", params: { stat, amount: Math.min(3, Math.max(1, amount)) } });
				matched.push(`"${phrase}" → Lower foe ${stat} by ${amount} on switch-in`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "raises <stat> when KOing" / "moxie"
		if (/(?:when|after)\s+(?:KO|knockout|faint)/i.test(phrase) || /\bdefeat/i.test(phrase)) {
			const stat = findStat(phrase);
			const amountM = phrase.match(/by\s+(\d+)/i);
			if (stat) {
				const amount = parseInt(amountM?.[1] || "1", 10);
				effects.push({ kind: "boostStatOnKO", params: { stat, amount: Math.min(3, Math.max(1, amount)) } });
				matched.push(`"${phrase}" → +${amount} ${stat} on KO`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "raises <stat> when hit" / "justified" / "stamina" / "defiant"
		if (/when\s+hit\s+by/i.test(phrase)) {
			const cat = /\bphysical\b/i.test(phrase) ? "Physical" : /\bspecial\b/i.test(phrase) ? "Special" : "any";
			const stat = findStat(phrase);
			if (stat) {
				effects.push({ kind: "boostStatOnHit", params: { category: cat, stat, amount: 1 } });
				matched.push(`"${phrase}" → +1 ${stat} when hit by ${cat} move`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: "summons terrain" / "sets up terrain"
		if (/\b(summons?|sets?\s+up|starts?|creates?)\b/i.test(phrase) && /\bterrain\b/i.test(phrase)) {
			const terrainMap: Record<string, string> = { "electric": "electricterrain", "grassy": "grassyterrain", "misty": "mistyterrain", "psychic": "psychicterrain" };
			for (const [key, val] of Object.entries(terrainMap)) {
				if (phrase.toLowerCase().includes(key)) {
					effects.push({ kind: "setTerrainOnEntry", params: { terrain: val } });
					matched.push(`"${phrase}" → Summons ${val} on switch-in`);
					phraseMatched = true;
					break;
				}
			}
			if (phraseMatched) continue;
		}

		// ── Pattern: "gives priority to" / "gale wings" / "prankster"
		if (/\bpriority\b/i.test(phrase) && /\b(gives?|grants?|moves?)\b/i.test(phrase)) {
			const t = findType(phrase);
			if (t) {
				effects.push({ kind: "priorityBoostByType", params: { filter: "type", value: t, bonus: 1 } });
				matched.push(`"${phrase}" → +1 priority to ${t} moves`);
				phraseMatched = true;
				continue;
			}
			if (/\bstatus\b/i.test(phrase)) {
				effects.push({ kind: "priorityBoostByType", params: { filter: "category", value: "Status", bonus: 1 } });
				matched.push(`"${phrase}" → +1 priority to Status moves (Prankster)`);
				phraseMatched = true;
				continue;
			}
		}

		// ── Pattern: Shared Power / allies share this ability
		if (/\bshared\s*power\b|\bshare(s|d)?\s+(my|this|its)\s+abilit|\ballies?\s+(gain|get|have|share)\b/i.test(phrase)) {
			effects.push({ kind: "shareAbilityWithAllies", params: { onSwitchIn: true } });
			matched.push(`"${phrase}" → allies gain this Pokémon's ability`);
			phraseMatched = true;
			continue;
		}

		if (!phraseMatched) warnings.push(`Couldn't translate: "${phrase}". Add it manually below, or rephrase.`);
	}

	if (effects.length === 0 && warnings.length === 0) {
		warnings.push("No effects detected. Try phrasings like \"Boost Fairy moves by 50%\" or \"30% chance to paralyze on contact\".");
	}
	return { effects, warnings, matchedPatterns: matched };
}
