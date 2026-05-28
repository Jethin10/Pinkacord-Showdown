/**
 * Pinkacord canonical content schemas.
 *
 * Authoritative shape of every entity (Pokemon, move, ability, item, learnset,
 * format) that lives in `content/`. The generator validates content against
 * these schemas before producing any output, so an invalid content file can
 * never reach the running PS server.
 *
 * Why Zod, not bare TypeScript types: TS types vanish at runtime. The
 * generator and (later) the admin panel need *runtime* validation with
 * field-level error messages — that's what Zod gives us. Types are derived
 * via z.infer so we still get full editor support.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// PS-canonical enumerations
// ────────────────────────────────────────────────────────────────────────────

export const POKEMON_TYPES = [
	"Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison",
	"Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark",
	"Steel", "Fairy", "Stellar",
] as const;

export const STAT_IDS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

export const STATUS_IDS = ["brn", "par", "slp", "frz", "psn", "tox"] as const;

export const MOVE_CATEGORIES = ["Physical", "Special", "Status"] as const;

export const MOVE_TARGETS = [
	"normal", "self", "adjacentAlly", "adjacentAllyOrSelf", "adjacentFoe",
	"allAdjacent", "allAdjacentFoes", "allies", "allySide", "allyTeam",
	"any", "foeSide", "scripted", "randomNormal", "all", "allSides",
] as const;

export const EGG_GROUPS = [
	"Monster", "Water 1", "Water 2", "Water 3", "Bug", "Flying", "Field",
	"Fairy", "Grass", "Human-Like", "Mineral", "Amorphous", "Ditto", "Dragon",
	"Undiscovered",
] as const;

export const COLORS = [
	"Red", "Blue", "Yellow", "Green", "Black", "Brown", "Purple", "Gray",
	"White", "Pink",
] as const;

export const TIERS = [
	"AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU", "PUBL", "PU",
	"ZUBL", "ZU", "NFE", "LC", "Illegal", "Unreleased",
] as const;

export const DOUBLES_TIERS = ["DUber", "DOU", "DBL", "DUU", "(DUU)", "NFE", "LC"] as const;

// ────────────────────────────────────────────────────────────────────────────
// Reusable primitive schemas
// ────────────────────────────────────────────────────────────────────────────

/** Lowercased alphanumeric identifier, e.g. "pinkachu", "pinkbolt". */
export const IdSchema = z.string()
	.regex(/^[a-z0-9]+$/, "must be lowercase alphanumeric, no spaces/hyphens")
	.min(2).max(40);

/** Human-readable display name, e.g. "Pinkachu", "Pink Bolt". */
export const DisplayNameSchema = z.string().min(1).max(40);

const StatBlockSchema = z.object({
	hp: z.number().int().min(1).max(255),
	atk: z.number().int().min(1).max(255),
	def: z.number().int().min(1).max(255),
	spa: z.number().int().min(1).max(255),
	spd: z.number().int().min(1).max(255),
	spe: z.number().int().min(1).max(255),
});
export type StatBlock = z.infer<typeof StatBlockSchema>;

const TypeSchema = z.enum(POKEMON_TYPES);
const StatusSchema = z.enum(STATUS_IDS);

// ────────────────────────────────────────────────────────────────────────────
// Pokemon (pokedex + formats-data combined)
// ────────────────────────────────────────────────────────────────────────────

export const SpeciesSchema = z.object({
	id: IdSchema,
	/** Dex number. Custom mons must be >= 10001 to avoid collision with PS base species. */
	num: z.number().int().min(10001).max(99999),
	name: DisplayNameSchema,
	types: z.array(TypeSchema).min(1).max(2),
	genderRatio: z.object({
		M: z.number().min(0).max(1),
		F: z.number().min(0).max(1),
	}).optional(),
	/** If genderRatio is omitted, gender can be set to "N" for genderless, "M"/"F" for fixed. */
	gender: z.enum(["M", "F", "N"]).optional(),
	baseStats: StatBlockSchema,
	abilities: z.object({
		"0": DisplayNameSchema,
		"1": DisplayNameSchema.optional(),
		"H": DisplayNameSchema.optional(),
		"S": DisplayNameSchema.optional(),
	}),
	heightm: z.number().positive().max(100),
	weightkg: z.number().positive().max(10000),
	color: z.enum(COLORS),
	eggGroups: z.array(z.enum(EGG_GROUPS)).min(1).max(2),
	prevo: DisplayNameSchema.optional(),
	evos: z.array(DisplayNameSchema).optional(),
	evoLevel: z.number().int().positive().optional(),
	tier: z.enum(TIERS).default("OU"),
	doublesTier: z.enum(DOUBLES_TIERS).default("DOU"),
	natDexTier: z.enum(TIERS).optional(),
});
export type Species = z.infer<typeof SpeciesSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Move
// ────────────────────────────────────────────────────────────────────────────

const SecondaryEffectSchema = z.object({
	chance: z.number().int().min(1).max(100),
	status: StatusSchema.optional(),
	volatileStatus: z.enum(["confusion", "flinch"]).optional(),
	boosts: z.record(z.enum(STAT_IDS), z.number().int().min(-6).max(6)).optional(),
}).refine(
	(s) => s.status || s.volatileStatus || s.boosts,
	{ message: "secondary effect must specify status, volatileStatus, or boosts" },
);

export const MoveSchema = z.object({
	id: IdSchema,
	/** Move number, >= 9001 to avoid collision with PS base moves (currently up to ~990). */
	num: z.number().int().min(9001).max(99999),
	name: DisplayNameSchema,
	type: TypeSchema,
	category: z.enum(MOVE_CATEGORIES),
	basePower: z.number().int().min(0).max(255),
	/** Accuracy: 0-100 or `true` for always-hits. */
	accuracy: z.union([z.number().int().min(1).max(100), z.literal(true)]),
	pp: z.number().int().min(1).max(64),
	priority: z.number().int().min(-7).max(7).default(0),
	target: z.enum(MOVE_TARGETS).default("normal"),
	shortDesc: z.string().max(200).default(""),
	desc: z.string().max(1000).optional(),
	/** Move flags — only safe, well-known ones permitted. */
	flags: z.object({
		contact: z.literal(1).optional(),
		protect: z.literal(1).optional(),
		mirror: z.literal(1).optional(),
		sound: z.literal(1).optional(),
		punch: z.literal(1).optional(),
		bite: z.literal(1).optional(),
		slicing: z.literal(1).optional(),
		bullet: z.literal(1).optional(),
		powder: z.literal(1).optional(),
		heal: z.literal(1).optional(),
		recharge: z.literal(1).optional(),
		snatch: z.literal(1).optional(),
		gravity: z.literal(1).optional(),
		defrost: z.literal(1).optional(),
		metronome: z.literal(1).optional(),
		wind: z.literal(1).optional(),
	}).default({}),
	secondary: SecondaryEffectSchema.nullable().optional(),
	/** Drain HP from damage dealt, e.g. [1, 2] = 50%. */
	drain: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
	/** Recoil, same shape as drain. */
	recoil: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
	/** Boost user's own stats after using the move. */
	selfBoost: z.object({
		boosts: z.record(z.enum(STAT_IDS), z.number().int().min(-6).max(6)),
	}).optional(),
	multihit: z.union([
		z.number().int().min(2).max(10),
		z.tuple([z.number().int().min(2), z.number().int().max(10)]),
	]).optional(),
	critRatio: z.number().int().min(1).max(6).optional(),
	contestType: z.enum(["Cool", "Beautiful", "Cute", "Clever", "Tough"]).default("Cute"),
});
export type Move = z.infer<typeof MoveSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Ability
//
// Custom abilities don't carry arbitrary code. They declare *effect kinds*
// from tools/pinkacord/effects.ts, each of which expands into a vetted PS
// handler snippet. This is the security boundary that lets non-coders manage
// abilities without ever writing TypeScript.
// ────────────────────────────────────────────────────────────────────────────

export const AbilityEffectRefSchema = z.object({
	kind: z.string().min(1), // validated against the effect registry separately
	/** Free-form parameters; each effect kind validates its own params. */
	params: z.record(z.string(), z.unknown()).default({}),
});
export type AbilityEffectRef = z.infer<typeof AbilityEffectRefSchema>;

export const AbilitySchema = z.object({
	id: IdSchema,
	name: DisplayNameSchema,
	shortDesc: z.string().max(200).default(""),
	desc: z.string().max(1000).optional(),
	/** Combined effects — the generator concatenates the snippets they emit. */
	effects: z.array(AbilityEffectRefSchema).default([]),
	/**
	 * Raw TypeScript that goes inside the generated Ability object literal.
	 * Used when an admin saves a novel ability that the effect-kind registry
	 * doesn't cover (typically authored via the AI translator). The string is
	 * emitted verbatim by the generator after composed effects. Empty when the
	 * ability is fully expressible via effects.
	 *
	 * SECURITY: this field accepts arbitrary code, so saves that populate it
	 * must go through admin review. The store-level auth + audit log + smoke
	 * test gate this surface. UI must show a preview before save.
	 */
	customHandlerCode: z.string().max(8000).optional(),
	/** Whether this ability can be ignored by Mold Breaker, etc. */
	breakable: z.boolean().default(false),
});
export type Ability = z.infer<typeof AbilitySchema>;

// ────────────────────────────────────────────────────────────────────────────
// Item
// ────────────────────────────────────────────────────────────────────────────

export const ItemSchema = z.object({
	id: IdSchema,
	num: z.number().int().min(9001).max(99999),
	name: DisplayNameSchema,
	shortDesc: z.string().max(200).default(""),
	desc: z.string().max(1000).optional(),
	/** Items use the same effect-registry model as abilities. */
	effects: z.array(AbilityEffectRefSchema).default([]),
});
export type Item = z.infer<typeof ItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Learnset
//
// PS learnsets use codes like "9L1" (gen 9, learned at level 1), "9M" (TM),
// "9T" (tutor). For Pinkacord we standardize on "9L1" — every move usable from
// level 1. The admin panel can choose to expose richer learn methods later.
// ────────────────────────────────────────────────────────────────────────────

export const LearnsetSchema = z.object({
	species: IdSchema,
	moves: z.array(IdSchema).min(1),
});
export type Learnset = z.infer<typeof LearnsetSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Format
// ────────────────────────────────────────────────────────────────────────────

const FormatGameTypeSchema = z.enum(["singles", "doubles", "triples", "multi", "freeforall", "rotation"]);

export const FormatSchema = z.object({
	id: IdSchema,
	name: DisplayNameSchema,
	mod: IdSchema,
	section: DisplayNameSchema.default("Pinkacord"),
	column: z.number().int().min(1).max(3).default(1),
	desc: z.string().max(500).default(""),
	gameType: FormatGameTypeSchema.default("singles"),
	team: z.enum(["random", "randomFFA"]).optional(),
	bestOfDefault: z.boolean().optional(),
	ruleset: z.array(z.string().min(1)).default(["Standard"]),
	banlist: z.array(z.string().min(1)).default([]),
	unbanlist: z.array(z.string().min(1)).default([]),
	sharedPower: z.boolean().default(false),
	enabled: z.boolean().default(true),
	// Tournament settings (optional — used by Discord bot for tour creation)
	tourBracket: z.enum(["single", "double", "roundRobin", "swiss"]).optional(),
	tourTimer: z.number().int().min(1).max(180).optional(),
	tourJoinMethod: z.enum(["challenge", "ladder", "signups"]).optional(),
	tourAutoStart: z.boolean().optional(),
	tourMaxPlayers: z.number().int().min(2).max(1024).optional(),
});
export type Format = z.infer<typeof FormatSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Top-level file schemas
// ────────────────────────────────────────────────────────────────────────────

const FileSchemaWrapper = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
	schemaVersion: z.literal(1),
	items: z.array(itemSchema),
});

export const MetaFileSchema = z.object({
	schemaVersion: z.literal(1),
	id: IdSchema,
	name: DisplayNameSchema,
	description: z.string().max(500).default(""),
	parentMod: z.enum(["gen9", "gen8", "gen7", "gen6", "gen5", "gen4", "gen3", "gen2", "gen1"]).default("gen9"),
	gen: z.number().int().min(1).max(9).default(9),
});
export type Meta = z.infer<typeof MetaFileSchema>;

export const PokedexFileSchema = FileSchemaWrapper(SpeciesSchema);
export const MovesFileSchema = FileSchemaWrapper(MoveSchema);
export const AbilitiesFileSchema = FileSchemaWrapper(AbilitySchema);
export const ItemsFileSchema = FileSchemaWrapper(ItemSchema);
export const LearnsetsFileSchema = FileSchemaWrapper(LearnsetSchema);
export const FormatsFileSchema = FileSchemaWrapper(FormatSchema);
