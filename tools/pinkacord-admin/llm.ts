/**
 * Pinkacord admin — natural-language ability translator (free LLM backend).
 *
 * Opt-in. Activates only when LLM_API_KEY (or LLM_API_URL pointing at a local
 * model) is configured in the environment. Falls back to pure pattern matching
 * otherwise — see `ability-nlp.ts`.
 *
 * What it does:
 *   Takes a plain-English description of a Pokemon ability and returns either:
 *     - approach="composed": a list of effect-kind references that map to our
 *       safe, code-reviewed effect registry (preferred for security)
 *     - approach="custom": a raw TypeScript snippet that goes inside an Ability
 *       object (for novel abilities the registry doesn't cover)
 *     - approach="mixed": both — partial composition + custom code
 *
 * Why a free backend:
 *   This is a small admin tool for a Discord community — running paid Claude
 *   API calls per ability is overkill. We use the OpenAI-compatible chat
 *   completions API so the same code works against:
 *     - Groq (default — free tier, no card, fast Llama 3.3 70B)
 *     - Ollama (set LLM_API_URL=http://localhost:11434/v1 for fully offline)
 *     - OpenRouter (some free models)
 *     - Any other OpenAI-compatible endpoint
 *
 * Default endpoint + model:
 *   LLM_API_URL=https://api.groq.com/openai/v1
 *   LLM_MODEL=llama-3.3-70b-versatile
 *
 * Setup:
 *   1. Get a free API key at https://console.groq.com/keys
 *   2. Add LLM_API_KEY=gsk_... to your .env
 *   3. Restart the launcher
 *
 * Security boundary:
 *   The admin sees the generated code in the UI BEFORE save (preview). It
 *   passes through the same TS compile + smoke test as any other ability.
 *   We never auto-deploy LLM output. Only authenticated admins can call this.
 */

import { z } from "zod";
import { EFFECT_KINDS } from "../pinkacord/effects";

// ────────────────────────────────────────────────────────────────────────────
// Output schema
// ────────────────────────────────────────────────────────────────────────────

const EffectRefSchema = z.object({
	kind: z.string(),
	params: z.record(z.string(), z.unknown()),
});

export const AbilityLLMResultSchema = z.object({
	approach: z.enum(["composed", "custom", "mixed"]),
	effects: z.array(EffectRefSchema).default([]),
	customHandlerCode: z.string().nullable().default(null),
	shortDescription: z.string(),
	explanation: z.string(),
});

export type AbilityLLMResult = z.infer<typeof AbilityLLMResultSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function getConfig() {
	return {
		apiUrl: (process.env.LLM_API_URL || DEFAULT_API_URL).replace(/\/+$/, ""),
		apiKey: process.env.LLM_API_KEY || "",
		model: process.env.LLM_MODEL || DEFAULT_MODEL,
	};
}

export function isLLMConfigured(): boolean {
	const cfg = getConfig();
	// Local Ollama doesn't need a key — accept "no key" if URL points at localhost.
	const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)\b/.test(cfg.apiUrl);
	return isLocal || !!cfg.apiKey.trim();
}

// ────────────────────────────────────────────────────────────────────────────
// System prompt — describes the effect registry + few-shot examples
// ────────────────────────────────────────────────────────────────────────────

function describeEffectKindsForPrompt(): string {
	const lines: string[] = [];
	for (const [id, kind] of Object.entries(EFFECT_KINDS)) {
		const shape = kind.paramsSchema as any;
		let params = "(no params)";
		try {
			const flat = shape?._def?.shape ?? shape?.shape;
			if (flat) {
				const fn = typeof flat === "function" ? flat() : flat;
				params = Object.keys(fn).join(", ");
			}
		} catch { /* fall through */ }
		lines.push(`- ${id} { ${params} }: ${kind.description}`);
	}
	return lines.join("\n");
}

let cachedSystem: string | null = null;
function buildSystemPrompt(): string {
	if (cachedSystem) return cachedSystem;
	cachedSystem = `You are an expert Pokemon Showdown ability translator. You convert plain-English ability descriptions into structured JSON that an admin panel can save and compile.

You MUST respond with ONLY a JSON object. No prose before or after. No markdown fences.

==== TWO WAYS TO EXPRESS AN ABILITY ====

1) COMPOSITION (preferred — safe, fully reviewed)
Compose the ability from these pre-built effect kinds (each emits a vetted PS handler):

${describeEffectKindsForPrompt()}

When the ability fits these kinds, use them. Set approach="composed", fill effects[], leave customHandlerCode=null.

2) CUSTOM TS HANDLER (for novel mechanics not in the registry)
Return raw TypeScript that lives INSIDE an Ability object literal. PS battle hooks you can use:
- onStart(pokemon), onSwitchIn, onSwitchOut(pokemon)
- onDamagingHit(damage, target, source, move)
- onAfterMoveSelf, onAfterMove, onBeforeMove
- onResidual(pokemon), onResidualOrder: number, onResidualSubOrder: number
- onModifyAtk(atk, attacker, defender, move), onModifySpA, onModifyDef, onModifySpD, onModifySpe
- onBasePower(basePower, attacker, defender, move), onBasePowerPriority: number
- onSourceModifyDamage(damage, source, target, move)
- onTryHit(target, source, move), onUpdate(pokemon)
- onSetStatus(status, target, source, effect), onAccuracy, onModifyCritRatio
Available 'this' methods: this.chainModify([num, 4096]), this.add('-message', target), this.damage(n), this.heal(n), this.boost({stat:N}), this.field.setWeather(id), this.randomChance(n, 100)
Output only the body (no surrounding braces). Use \\n for newlines inside the JSON string.
Set approach="custom", leave effects=[].

3) MIXED — both composed effects AND a custom snippet. approach="mixed".

==== OUTPUT JSON SHAPE ====
{
  "approach": "composed" | "custom" | "mixed",
  "effects": [{ "kind": "<one of the registry IDs>", "params": { ... } }],
  "customHandlerCode": "<TS body string or null>",
  "shortDescription": "<one-sentence tooltip>",
  "explanation": "<one or two sentences on what you did>"
}

==== FEW-SHOT EXAMPLES ====

Input: "30% chance to paralyze on contact"
Output: {"approach":"composed","effects":[{"kind":"statusOnContact","params":{"status":"par","chance":30}}],"customHandlerCode":null,"shortDescription":"30% chance to paralyze attackers on contact.","explanation":"Direct match for statusOnContact."}

Input: "Switch out after taking damage from a move that hits for at least 33% of max HP"
Output: {"approach":"custom","effects":[],"customHandlerCode":"onDamagingHit(damage, target, source, move) {\\n  if (damage >= target.baseMaxhp / 3) {\\n    target.switchFlag = true;\\n    this.add('-activate', target, 'ability: ' + target.getAbility().name);\\n  }\\n},","shortDescription":"Switches out when hit by an attack dealing 33%+ of max HP.","explanation":"Emergency Exit / Wimp Out style. No registry kind for switch-out-on-threshold, so we emit a custom onDamagingHit handler."}

Input: "Fairy moves 1.5x and heals 1/3 on switch out"
Output: {"approach":"composed","effects":[{"kind":"boostMovePowerByType","params":{"type":"Fairy","multiplier":1.5}},{"kind":"healOnSwitchOut","params":{"fraction":0.3333}}],"customHandlerCode":null,"shortDescription":"Fairy moves are 1.5x stronger; heals 1/3 HP on switch out.","explanation":"Two registry kinds combined."}

Input: "Doubles defense in sand, summons sand on entry"
Output: {"approach":"mixed","effects":[{"kind":"setWeatherOnEntry","params":{"weather":"sandstorm"}}],"customHandlerCode":"onModifyDefPriority: 5,\\nonModifyDef(def, pokemon) {\\n  if (this.field.isWeather('sandstorm')) {\\n  return this.chainModify(2);\\n  }\\n},","shortDescription":"Summons sandstorm on switch-in; Defense is doubled during sandstorm.","explanation":"Sand-summon is a registry kind; the conditional 2x Defense isn't, so we add a custom onModifyDef handler."}

Input: "All allies share this Pokemon's ability, like Shared Power on one mon"
Output: {"approach":"composed","effects":[{"kind":"shareAbilityWithAllies","params":{"onSwitchIn":true}}],"customHandlerCode":null,"shortDescription":"Allies gain this Pokemon's ability as an innate.","explanation":"Use shareAbilityWithAllies — do not emit custom code for standard ability-sharing."}

Always validate effect params (multiplier <= 3, chance in [1,100], type must be one of the 19 PS types). Prefer composition over custom code.`;
	return cachedSystem;
}

// ────────────────────────────────────────────────────────────────────────────
// Outcome type
// ────────────────────────────────────────────────────────────────────────────

export type AbilityLLMOutcome =
	| { ok: true; result: AbilityLLMResult; usage: { promptTokens?: number; completionTokens?: number } }
	| { ok: false; error: string; code: "not_configured" | "rate_limited" | "auth" | "bad_output" | "api_error" | "unknown" };

// ────────────────────────────────────────────────────────────────────────────
// Call the LLM
// ────────────────────────────────────────────────────────────────────────────

export async function parseAbilityWithLLM(description: string): Promise<AbilityLLMOutcome> {
	if (!isLLMConfigured()) {
		return {
			ok: false,
			code: "not_configured",
			error: "AI parsing isn't configured. Add LLM_API_KEY to your .env (free key at https://console.groq.com/keys) or set LLM_API_URL to point at a local Ollama.",
		};
	}
	if (!description || !description.trim()) {
		return { ok: false, code: "bad_output", error: "Empty description." };
	}

	const cfg = getConfig();

	let response: Response;
	try {
		response = await fetch(`${cfg.apiUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
			},
			body: JSON.stringify({
				model: cfg.model,
				// JSON mode — providers that support it (Groq, OpenAI, Together, etc.)
				// will hard-constrain the output to a valid JSON object.
				response_format: { type: "json_object" },
				temperature: 0.2,
				max_tokens: 2048,
				messages: [
					{ role: "system", content: buildSystemPrompt() },
					{ role: "user", content: description },
				],
			}),
		});
	} catch (err: any) {
		return { ok: false, code: "api_error", error: `Network error reaching ${cfg.apiUrl}: ${err.message ?? err}` };
	}

	if (response.status === 401 || response.status === 403) {
		return { ok: false, code: "auth", error: `Auth failed (HTTP ${response.status}). Check LLM_API_KEY.` };
	}
	if (response.status === 429) {
		return { ok: false, code: "rate_limited", error: "Rate limited by the LLM provider. Wait a moment and retry." };
	}
	if (response.status === 402) {
		return { ok: false, code: "rate_limited", error: "LLM provider returned 402 (usage limit). Check your API quota at console.groq.com or try again later." };
	}
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		return { ok: false, code: "api_error", error: `LLM API returned ${response.status}: ${body.slice(0, 240)}` };
	}

	let payload: any;
	try {
		payload = await response.json();
	} catch {
		return { ok: false, code: "bad_output", error: "LLM response wasn't valid JSON." };
	}

	const content: string = payload?.choices?.[0]?.message?.content ?? "";
	if (!content) {
		return { ok: false, code: "bad_output", error: "LLM returned an empty completion." };
	}

	// Tolerate occasional code-fence wrapping even with JSON mode.
	const cleaned = stripCodeFences(content);

	let raw: unknown;
	try {
		raw = JSON.parse(cleaned);
	} catch {
		return { ok: false, code: "bad_output", error: "LLM output wasn't parseable JSON. Try rephrasing the description." };
	}

	const parsed = AbilityLLMResultSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
		return { ok: false, code: "bad_output", error: `LLM output didn't match expected shape: ${issues}` };
	}

	// Cross-check: every claimed effect kind must exist in our registry.
	const knownKinds = new Set(Object.keys(EFFECT_KINDS));
	for (const ef of parsed.data.effects) {
		if (!knownKinds.has(ef.kind)) {
			return { ok: false, code: "bad_output", error: `LLM referenced unknown effect kind "${ef.kind}". Try rephrasing or use the manual editor.` };
		}
	}

	return {
		ok: true,
		result: parsed.data,
		usage: {
			promptTokens: payload?.usage?.prompt_tokens,
			completionTokens: payload?.usage?.completion_tokens,
		},
	};
}

function stripCodeFences(s: string): string {
	const trimmed = s.trim();
	const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
	return fence ? fence[1].trim() : trimmed;
}

// ────────────────────────────────────────────────────────────────────────────
// Format design — plain-English → FormatSchema-compatible JSON
// ────────────────────────────────────────────────────────────────────────────

export const FormatLLMResultSchema = z.object({
	suggestedName: z.string().min(1),
	suggestedDesc: z.string().default(""),
	gameType: z.enum(["singles", "doubles", "triples", "multi", "freeforall", "rotation"]).default("singles"),
	team: z.enum(["random", "randomFFA"]).optional(),
	ruleset: z.array(z.string().min(1)).default(["Standard"]),
	banlist: z.array(z.string().min(1)).default([]),
	unbanlist: z.array(z.string().min(1)).default([]),
	sharedPower: z.boolean().default(false),
	bestOfDefault: z.boolean().optional(),
	explanation: z.string().default(""),
	needsDev: z.boolean().default(false),
	devNote: z.string().default(""),
});
export type FormatLLMResult = z.infer<typeof FormatLLMResultSchema>;

export type FormatLLMOutcome =
	| { ok: true; result: FormatLLMResult; usage: { promptTokens?: number; completionTokens?: number } }
	| { ok: false; error: string; code: "not_configured" | "rate_limited" | "auth" | "bad_output" | "api_error" | "unknown" };

const FORMAT_SYSTEM_PROMPT = `You are an expert Pokemon Showdown format designer. You convert plain-English format ideas into a structured JSON the admin panel can save and compile into a real, playable Pokemon Showdown format.

You MUST respond with ONLY a JSON object. No prose. No markdown fences.

==== PS NATIVE RULE PRIMITIVES (use these — most ideas need NO code) ====

Team-size rules:
- "Picked Team Size = N"        — battle uses N mons picked from team (e.g. "bring 12 pick 6" → Min Team Size = 12 + Picked Team Size = 6)
- "Min Team Size = N"           — team must have at least N mons
- "Max Team Size = N"           — team can have at most N mons
- "Adjust Level = N"            — all mons set to level N
- "Adjust Level Down = N"       — caps level at N

Clauses (very common — combine with "Standard"):
- "Species Clause"              — no duplicate species
- "Nickname Clause"             — no duplicate nicknames
- "Item Clause"                 — no duplicate items
- "Sleep Clause Mod"            — only 1 mon asleep per side
- "Endless Battle Clause"
- "Evasion Clause"              — bans evasion-boosting moves
- "OHKO Clause"
- "Moody Clause", "Baton Pass Clause", "Z-Move Clause", "Dynamax Clause"
- "Same Type Clause"            — monotype! all 6 mons share a type
- "Inverse Mod"                 — flips the type chart (super-effective <-> not very effective)
- "Scalemons Mod"               — scales BSTs to 600
- "Camomons"                    — mon's typing equals its first two moves' types
- "Tier Shift"                  — buffs lower tiers
- "350 Cup", "Convergence", "Camomons", "Fortemons", "Frantic Fusions"
- "Team Preview"                — toggles team preview on
- "PotD"                        — Pokemon of the Day mod (random battles)
- "Obtainable"                  — only legally obtainable mons/abilities/moves
- "Cancel Mod"
- "HP Percentage Mod"

Game types:
- gameType "singles" | "doubles" | "triples" | "freeforall" | "multi"

Ban / unban entries (used in banlist / unbanlist arrays):
- A full species name: "Mewtwo", "Calyrex-Shadow"
- A tier tag: "Uber", "AG", "OU", "NU", "PU", "ZU"
- An ability: "Moody", "Drizzle"
- An item: "King's Rock", "Heavy-Duty Boots"
- A move: "Baton Pass"
- A typing tag: "Steel" (bans all steel-types)
- Use "-" prefix to ban, "+" prefix to unban inside ruleset

Shared Power OM (one mon switches in → its ability shared with whole team):
- Set "sharedPower": true (this triggers our generator to wire the hooks; gameType must be "singles").

Random battle:
- Set "team": "random" and use ruleset ["PotD", "Obtainable", "Species Clause", "HP Percentage Mod", "Cancel Mod", "Sleep Clause Mod", "Illusion Level Mod"].

==== HOW TO PICK A NAME ====

Always start with "[Pinkacord] " prefix. Examples: "[Pinkacord] Monotype", "[Pinkacord] Bring 12 Pick 6".

==== OUTPUT JSON SHAPE ====

{
  "suggestedName": "[Pinkacord] ...",
  "suggestedDesc": "<one-sentence describes what the format does>",
  "gameType": "singles" | "doubles" | "triples" | "multi" | "freeforall" | "rotation",
  "team": "random" | "randomFFA",          // OMIT for build-your-own-team formats
  "ruleset": ["Standard", "Species Clause", ...],
  "banlist": ["Uber", "Moody", ...],
  "unbanlist": [],
  "sharedPower": false,
  "bestOfDefault": false,
  "explanation": "<one or two sentences on what you did and why>",
  "needsDev": false,                       // true ONLY if the idea genuinely needs new engine code
  "devNote": ""                            // when needsDev=true, describe what the developer must build
}

==== FEW-SHOT EXAMPLES ====

Input: "Bring 12 pokemon and pick 6 at team preview"
Output: {"suggestedName":"[Pinkacord] Bring 12 Pick 6","suggestedDesc":"Bring 12 Pokémon. Pick 6 at team preview.","gameType":"singles","ruleset":["Standard","Team Preview","Min Team Size = 12","Max Team Size = 12","Picked Team Size = 6"],"banlist":["Uber","AG","Moody","King's Rock","Baton Pass"],"unbanlist":[],"sharedPower":false,"explanation":"Min/Max Team Size = 12 forces a 12-mon team; Picked Team Size = 6 lets the player pick 6 at preview. Standard banlist on top.","needsDev":false,"devNote":""}

Input: "Shared power but for our pinkacord dex"
Output: {"suggestedName":"[Pinkacord] Shared Power","suggestedDesc":"Once a Pokémon switches in, its ability is shared with the rest of the team.","gameType":"singles","ruleset":["Standard"],"banlist":["Uber","AG","Moody"],"unbanlist":[],"sharedPower":true,"explanation":"Set sharedPower:true; the generator wires the Smogon Shared Power hooks automatically.","needsDev":false,"devNote":""}

Input: "Monotype dragon"
Output: {"suggestedName":"[Pinkacord] Monotype Dragon","suggestedDesc":"All Pokémon must be Dragon-type. Standard clauses.","gameType":"singles","ruleset":["Standard","Same Type Clause"],"banlist":["Uber","AG","-All Pokemon","+Dragon"],"unbanlist":[],"sharedPower":false,"explanation":"Same Type Clause enforces shared typing; the banlist trick is one common way to lock to one type, but Same Type Clause alone is enough — leave the player to pick which type. For locked-Dragon, see needsDev.","needsDev":false,"devNote":""}

Input: "Scalemons but doubles"
Output: {"suggestedName":"[Pinkacord] Scalemons Doubles","suggestedDesc":"Each Pokémon's stats are scaled so the total BST equals 600. Doubles.","gameType":"doubles","ruleset":["Standard Doubles","Scalemons Mod"],"banlist":["DUber","Moody","Power Construct","Shadow Tag"],"unbanlist":[],"sharedPower":false,"explanation":"Scalemons Mod is a native PS ruleset. Combined with doubles defaults.","needsDev":false,"devNote":""}

Input: "Every pokemon gets two abilities at once"
Output: {"suggestedName":"[Pinkacord] Dual Abilities","suggestedDesc":"Every Pokémon runs two abilities at once.","gameType":"singles","ruleset":["Standard"],"banlist":["Uber","AG","Moody"],"unbanlist":[],"sharedPower":false,"explanation":"No PS native primitive exposes a 'two abilities' rule. This needs an engine extension.","needsDev":true,"devNote":"Add a new effect kind / clause that, on switch-in, applies a second ability from the Pokemon's species data. Probably similar to Shared Power's mechanism but per-mon. Needs a UI field for which ability to pick (use second slot of pokedex hiddenAbility?)."}

Always prefer PS native primitives. Only set needsDev=true if NO combination of native rulesets can express the idea.`;

export async function designFormatWithLLM(description: string): Promise<FormatLLMOutcome> {
	if (!isLLMConfigured()) {
		return {
			ok: false,
			code: "not_configured",
			error: "AI format design isn't configured. Add LLM_API_KEY to your .env (free key at https://console.groq.com/keys).",
		};
	}
	if (!description || !description.trim()) {
		return { ok: false, code: "bad_output", error: "Empty description." };
	}

	const cfg = getConfig();
	let response: Response;
	try {
		response = await fetch(`${cfg.apiUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
			},
			body: JSON.stringify({
				model: cfg.model,
				response_format: { type: "json_object" },
				temperature: 0.2,
				max_tokens: 1600,
				messages: [
					{ role: "system", content: FORMAT_SYSTEM_PROMPT },
					{ role: "user", content: description },
				],
			}),
		});
	} catch (err: any) {
		return { ok: false, code: "api_error", error: `Network error reaching ${cfg.apiUrl}: ${err.message ?? err}` };
	}
	if (response.status === 401 || response.status === 403) return { ok: false, code: "auth", error: `Auth failed (HTTP ${response.status}). Check LLM_API_KEY.` };
	if (response.status === 429) return { ok: false, code: "rate_limited", error: "Rate limited by the LLM provider." };
	if (response.status === 402) return { ok: false, code: "rate_limited", error: "LLM provider returned 402 (usage limit). Check your API quota at console.groq.com." };
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		return { ok: false, code: "api_error", error: `LLM API returned ${response.status}: ${body.slice(0, 240)}` };
	}

	let payload: any;
	try { payload = await response.json(); } catch { return { ok: false, code: "bad_output", error: "LLM response wasn't valid JSON." }; }

	const content: string = payload?.choices?.[0]?.message?.content ?? "";
	if (!content) return { ok: false, code: "bad_output", error: "LLM returned an empty completion." };

	let raw: unknown;
	try { raw = JSON.parse(stripCodeFences(content)); } catch { return { ok: false, code: "bad_output", error: "LLM output wasn't parseable JSON." }; }

	const parsed = FormatLLMResultSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
		return { ok: false, code: "bad_output", error: `LLM format output didn't match expected shape: ${issues}` };
	}
	return {
		ok: true,
		result: parsed.data,
		usage: {
			promptTokens: payload?.usage?.prompt_tokens,
			completionTokens: payload?.usage?.completion_tokens,
		},
	};
}
