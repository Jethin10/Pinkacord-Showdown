/**
 * Effect-kind registry.
 *
 * Every custom ability and item is a *composition* of pre-vetted primitives
 * declared here. Admins pick an effect kind by ID and fill in its parameters;
 * we emit the corresponding PS handler code. This is the only mechanism by
 * which admin-edited content can produce executable TypeScript — there is no
 * "freeform code" field anywhere in the content schemas.
 *
 * Adding a new effect kind is a developer change to this file (a new entry in
 * EFFECT_KINDS plus tests). It is reviewed like any other code change.
 *
 * NOTE on the multiplier encoding:
 * PS represents multipliers as [num, 4096] tuples for engine-level accuracy
 * (avoiding floating-point drift over many calculations). We follow the same
 * convention.
 */

import { z } from "zod";
import { POKEMON_TYPES, STAT_IDS, STATUS_IDS } from "./schemas";

// ────────────────────────────────────────────────────────────────────────────
// Effect kind definition
// ────────────────────────────────────────────────────────────────────────────

export interface EffectKind<P extends z.ZodTypeAny> {
	id: string;
	/** Short human description, e.g. "Boost moves of a given type." */
	description: string;
	/** Zod schema validating params for this kind. */
	paramsSchema: P;
	/**
	 * Emit the TS handler snippet that goes inside the ability/item object.
	 * Should NOT include surrounding braces — just the property lines.
	 */
	emit: (params: z.infer<P>) => string;
}

function defineKind<P extends z.ZodTypeAny>(k: EffectKind<P>): EffectKind<P> {
	return k;
}

// Helper: convert a 1.x decimal multiplier into a PS [num, 4096] tuple.
function multiplierTuple(mult: number): string {
	const num = Math.round(mult * 4096);
	return `[${num}, 4096]`;
}

// ────────────────────────────────────────────────────────────────────────────
// Effect kinds
// ────────────────────────────────────────────────────────────────────────────

const boostMovePowerByType = defineKind({
	id: "boostMovePowerByType",
	description: "Multiply this Pokemon's outgoing damage of a given type.",
	paramsSchema: z.object({
		type: z.enum(POKEMON_TYPES),
		multiplier: z.number().positive().max(3),
	}),
	emit: ({ type, multiplier }) => `
	onBasePowerPriority: 23,
	onBasePower(basePower, attacker, defender, move) {
		if (move.type === '${type}') {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},`,
});

const boostMovePowerByCategory = defineKind({
	id: "boostMovePowerByCategory",
	description: "Multiply this Pokemon's outgoing damage of a given category (Physical/Special).",
	paramsSchema: z.object({
		category: z.enum(["Physical", "Special"]),
		multiplier: z.number().positive().max(3),
	}),
	emit: ({ category, multiplier }) => `
	onBasePowerPriority: 23,
	onBasePower(basePower, attacker, defender, move) {
		if (move.category === '${category}') {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},`,
});

const statusOnContact = defineKind({
	id: "statusOnContact",
	description: "Chance to inflict a status condition when hit by a contact move.",
	paramsSchema: z.object({
		status: z.enum(STATUS_IDS),
		chance: z.number().int().min(1).max(100),
	}),
	emit: ({ status, chance }) => `
	onDamagingHit(damage, target, source, move) {
		if (move.flags['contact']) {
			if (this.randomChance(${chance}, 100)) {
				source.trySetStatus('${status}', target);
			}
		}
	},`,
});

const boostStatOnEntry = defineKind({
	id: "boostStatOnEntry",
	description: "Raise one stat when this Pokemon switches in (e.g. Intrepid Sword style).",
	paramsSchema: z.object({
		stat: z.enum(STAT_IDS),
		amount: z.number().int().min(1).max(3),
	}),
	emit: ({ stat, amount }) => `
	onStart(pokemon) {
		this.boost({ ${stat}: ${amount} }, pokemon);
	},`,
});

const immuneToType = defineKind({
	id: "immuneToType",
	description: "Grant immunity to a specific damage type (e.g. Levitate, Volt Absorb-style).",
	paramsSchema: z.object({
		type: z.enum(POKEMON_TYPES),
		/** If true, also heal 25% HP when hit by that type (Volt Absorb style). */
		absorbsHeal: z.boolean().default(false),
	}),
	emit: ({ type, absorbsHeal }) => absorbsHeal ? `
	onTryHit(target, source, move) {
		if (target !== source && move.type === '${type}') {
			if (!this.heal(target.baseMaxhp / 4)) {
				this.add('-immune', target, '[from] ability: ' + target.getAbility().name);
			}
			return null;
		}
	},` : `
	onTryHit(target, source, move) {
		if (target !== source && move.type === '${type}') {
			this.add('-immune', target, '[from] ability: ' + target.getAbility().name);
			return null;
		}
	},`,
});

const weatherSpeedBoost = defineKind({
	id: "weatherSpeedBoost",
	description: "Multiply Speed in a specific weather (Chlorophyll/Swift Swim style).",
	paramsSchema: z.object({
		weather: z.enum(["sunnyday", "raindance", "sandstorm", "snow", "hail"]),
		multiplier: z.number().positive().max(3).default(2),
	}),
	emit: ({ weather, multiplier }) => `
	onModifySpe(spe, pokemon) {
		if (this.field.isWeather('${weather}')) {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},`,
});

const setWeatherOnEntry = defineKind({
	id: "setWeatherOnEntry",
	description: "Summon weather when this Pokemon switches in (Drought, Drizzle, Sand Stream, Snow Warning).",
	paramsSchema: z.object({
		weather: z.enum(["sunnyday", "raindance", "sandstorm", "snow"]),
	}),
	emit: ({ weather }) => `
	onStart(source) {
		this.field.setWeather('${weather}');
	},`,
});

const boostMovePowerWhenLowHp = defineKind({
	id: "boostMovePowerWhenLowHp",
	description: "Boost moves of a given type when this Pokemon is at or below a HP threshold (Blaze/Torrent/Overgrow style).",
	paramsSchema: z.object({
		type: z.enum(POKEMON_TYPES),
		hpFraction: z.number().positive().max(1).default(1 / 3),
		multiplier: z.number().positive().max(3).default(1.5),
	}),
	emit: ({ type, hpFraction, multiplier }) => {
		const denominator = Math.round(1 / hpFraction);
		return `
	onModifyAtkPriority: 5,
	onModifyAtk(atk, attacker, defender, move) {
		if (move.type === '${type}' && attacker.hp <= attacker.maxhp / ${denominator}) {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},
	onModifySpAPriority: 5,
	onModifySpA(spa, attacker, defender, move) {
		if (move.type === '${type}' && attacker.hp <= attacker.maxhp / ${denominator}) {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},`;
	},
});

const statusImmunity = defineKind({
	id: "statusImmunity",
	description: "Immune to a specific status condition (Limber, Insomnia, Magma Armor, etc.).",
	paramsSchema: z.object({
		status: z.enum(STATUS_IDS),
	}),
	emit: ({ status }) => `
	onUpdate(pokemon) {
		if (pokemon.status === '${status}') {
			this.add('-activate', pokemon, 'ability: ' + pokemon.getAbility().name);
			pokemon.cureStatus();
		}
	},
	onSetStatus(status, target, source, effect) {
		if (status.id !== '${status}') return;
		if ((effect as any)?.status) {
			this.add('-immune', target, '[from] ability: ' + target.getAbility().name);
		}
		return false;
	},`,
});

const healOnSwitchOut = defineKind({
	id: "healOnSwitchOut",
	description: "Heal a fraction of HP when this Pokemon switches out (Regenerator style).",
	paramsSchema: z.object({
		fraction: z.number().positive().max(1).default(1 / 3),
	}),
	emit: ({ fraction }) => {
		const denom = Math.round(1 / fraction);
		return `
	onSwitchOut(pokemon) {
		pokemon.heal(pokemon.baseMaxhp / ${denom});
	},`;
	},
});

const speedBoostEachTurn = defineKind({
	id: "speedBoostEachTurn",
	description: "Raise Speed by 1 stage at the end of each turn (Speed Boost ability).",
	paramsSchema: z.object({}),
	emit: () => `
	onResidualOrder: 28,
	onResidualSubOrder: 2,
	onResidual(pokemon) {
		if (pokemon.activeTurns) {
			this.boost({ spe: 1 });
		}
	},`,
});

const damageReductionByType = defineKind({
	id: "damageReductionByType",
	description: "Take less damage from a specific damage type (Filter / Solid Rock / Heatproof style).",
	paramsSchema: z.object({
		type: z.enum(POKEMON_TYPES),
		multiplier: z.number().positive().max(1).default(0.5),
	}),
	emit: ({ type, multiplier }) => `
	onSourceModifyDamage(damage, source, target, move) {
		if (move.type === '${type}') {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},`,
});

const critRateBoost = defineKind({
	id: "critRateBoost",
	description: "Boost critical-hit chance on outgoing moves (Super Luck style).",
	paramsSchema: z.object({
		bonusStages: z.number().int().min(1).max(3).default(1),
	}),
	emit: ({ bonusStages }) => `
	onModifyCritRatio(critRatio) {
		return critRatio + ${bonusStages};
	},`,
});

const statusOnAnyDamagingHit = defineKind({
	id: "statusOnAnyDamagingHit",
	description: "Chance to inflict a status when hit by any damaging move (not just contact).",
	paramsSchema: z.object({
		status: z.enum(STATUS_IDS),
		chance: z.number().int().min(1).max(100),
	}),
	emit: ({ status, chance }) => `
	onDamagingHit(damage, target, source, move) {
		if (this.randomChance(${chance}, 100)) {
			source.trySetStatus('${status}', target);
		}
	},`,
});

const boostStatOnHit = defineKind({
	id: "boostStatOnHit",
	description: "Raise a stat by N stages when hit by a move of a given category (Justified/Defiant/Stamina style).",
	paramsSchema: z.object({
		category: z.enum(["Physical", "Special", "Status", "any"]).default("any"),
		stat: z.enum(STAT_IDS),
		amount: z.number().int().min(1).max(3).default(1),
	}),
	emit: ({ category, stat, amount }) => {
		const condition = category === "any"
			? "move.category !== 'Status'"
			: `move.category === '${category}'`;
		return `
	onDamagingHit(damage, target, source, move) {
		if (${condition}) {
			this.boost({ ${stat}: ${amount} }, target);
		}
	},`;
	},
});

const setTerrainOnEntry = defineKind({
	id: "setTerrainOnEntry",
	description: "Summon a terrain when this Pokemon switches in (Electric Surge / Misty Surge / Grassy Surge / Psychic Surge style).",
	paramsSchema: z.object({
		terrain: z.enum(["electricterrain", "grassyterrain", "mistyterrain", "psychicterrain"]),
	}),
	emit: ({ terrain }) => `
	onStart(source) {
		this.field.setTerrain('${terrain}');
	},`,
});

const priorityBoostByType = defineKind({
	id: "priorityBoostByType",
	description: "Give a priority bonus to this Pokemon's moves of a given type (Gale Wings style) or category (Prankster style — use category 'Status').",
	paramsSchema: z.object({
		filter: z.enum(["type", "category"]),
		value: z.string().describe("Type name (e.g. 'Flying') or category ('Physical'/'Special'/'Status')"),
		bonus: z.number().int().min(1).max(3).default(1),
	}),
	emit: ({ filter, value, bonus }) => {
		const cond = filter === "type" ? `move.type === '${value}'` : `move.category === '${value}'`;
		return `
	onModifyPriority(priority, pokemon, target, move) {
		if (${cond}) {
			return priority + ${bonus};
		}
	},`;
	},
});

const lowerStatOnEntry = defineKind({
	id: "lowerStatOnEntry",
	description: "Lower a stat on each opposing Pokemon when this one switches in (Intimidate style).",
	paramsSchema: z.object({
		stat: z.enum(STAT_IDS),
		amount: z.number().int().min(1).max(3).default(1),
	}),
	emit: ({ stat, amount }) => `
	onStart(pokemon) {
		for (const target of pokemon.adjacentFoes()) {
			if (!target.volatiles['substitute']) {
				this.boost({ ${stat}: -${amount} }, target, pokemon);
			}
		}
	},`,
});

const shareAbilityWithAllies = defineKind({
	id: "shareAbilityWithAllies",
	description: "Allies on the field gain this Pokemon's ability as an innate (one-mon Shared Power style).",
	paramsSchema: z.object({
		/** Also apply when this Pokemon switches in mid-battle (not only on battle start). */
		onSwitchIn: z.boolean().default(true),
	}),
	emit: ({ onSwitchIn }) => {
		const body = `
		const abilityid = pokemon.ability;
		if (!abilityid || abilityid === 'noability') return;
		for (const ally of pokemon.side.pokemon) {
			if (ally === pokemon || ally.fainted) continue;
			const effect = 'ability:' + abilityid;
			if (!ally.volatiles[effect]) {
				ally.volatiles[effect] = this.initEffectState({ id: effect, target: ally });
				if (!ally.m.abils) ally.m.abils = [];
				if (!ally.m.abils.includes(effect)) ally.m.abils.push(effect);
			}
		}`;
		return (
			`
	onStart(pokemon) {${body}
	},` +
			(onSwitchIn
				? `
	onSwitchIn(pokemon) {${body}
	},`
				: "")
		);
	},
});

const boostStatOnKO = defineKind({
	id: "boostStatOnKO",
	description: "Raise a stat by N stages when this Pokemon knocks out an opponent (Moxie/Beast Boost style).",
	paramsSchema: z.object({
		stat: z.enum(STAT_IDS),
		amount: z.number().int().min(1).max(3).default(1),
	}),
	emit: ({ stat, amount }) => `
	onSourceAfterFaint(length, target, source, effect) {
		if (effect && effect.effectType === 'Move') {
			this.boost({ ${stat}: ${amount} * length }, source);
		}
	},`,
});

// ────────────────────────────────────────────────────────────────────────────
// ITEM EFFECT KINDS
// ────────────────────────────────────────────────────────────────────────────

const itemHealPerTurn = defineKind({
	id: "itemHealPerTurn",
	description: "Heal a fraction of max HP at the end of each turn (Leftovers style).",
	paramsSchema: z.object({
		fraction: z.number().positive().max(1).default(1 / 16),
	}),
	emit: ({ fraction }) => {
		const denom = Math.round(1 / fraction);
		return `
	onResidualOrder: 5,
	onResidualSubOrder: 4,
	onResidual(pokemon) {
		if (pokemon.hp < pokemon.maxhp) {
			this.heal(pokemon.baseMaxhp / ${denom}, pokemon);
		}
	},`;
	},
});

const itemBoostStatLockMove = defineKind({
	id: "itemBoostStatLockMove",
	description: "Boost a stat by 1.5x but lock user into one move (Choice Band/Specs/Scarf style).",
	paramsSchema: z.object({
		stat: z.enum(STAT_IDS),
		speedBoost: z.number().positive().max(2).default(1),
	}),
	emit: ({ stat, speedBoost }) => `
	onModifyAtkPriority: 1,
	onModifyAtk(atk, pokemon) {
		if ('${stat}' === 'atk') return this.chainModify([6144, 4096]);
		return atk;
	},
	onModifyDefPriority: 1,
	onModifyDef(def, pokemon) {
		if ('${stat}' === 'def') return this.chainModify([6144, 4096]);
		return def;
	},
	onModifySpAPriority: 1,
	onModifySpA(spa, pokemon) {
		if ('${stat}' === 'spa') return this.chainModify([6144, 4096]);
		return spa;
	},
	onModifySpDPriority: 1,
	onModifySpD(spd, pokemon) {
		if ('${stat}' === 'spd') return this.chainModify([6144, 4096]);
		return spd;
	},
	onModifySpePriority: 1,
	onModifySpe(spe, pokemon) {
		if ('${stat}' === 'spe') return this.chainModify(${speedBoost === 2 ? '[6144, 4096]' : '[5324, 4096]'});
		return spe;
	},
	onDisableMove(pokemon) {
		if (pokemon.lastMove && pokemon.lastMove.id !== 'struggle') {
			pokemon.disableMove(pokemon.lastMove.id);
		}
	},`,
});

const itemBoostDamageWithRecoil = defineKind({
	id: "itemBoostDamageWithRecoil",
	description: "Boost all move power by 1.3x but take 10% recoil damage (Life Orb style).",
	paramsSchema: z.object({
		multiplier: z.number().positive().max(2).default(1.3),
		recoilFraction: z.number().positive().max(0.5).default(0.1),
	}),
	emit: ({ multiplier, recoilFraction }) => `
	onBasePowerPriority: 15,
	onBasePower(basePower, user, target, move) {
		return this.chainModify(${multiplierTuple(multiplier)});
	},
	onAfterMoveSecondarySelf(source, target, move) {
		if (move.category !== 'Status' && source && source.hp) {
			this.damage(source.baseMaxhp * ${recoilFraction}, source, source, this.dex.items.get('lifeorb'));
		}
	},`,
});

const itemReduceSpecialDamage = defineKind({
	id: "itemReduceSpecialDamage",
	description: "Take 0.5x damage from Special moves but can't use status moves (Assault Vest style).",
	paramsSchema: z.object({}),
	emit: () => `
	onSourceModifyDamage(damage, source, target, move) {
		if (move.category === 'Special') {
			return this.chainModify([2048, 4096]);
		}
	},
	onDisableMove(pokemon) {
		for (const moveSlot of pokemon.moveSlots) {
			if (this.dex.moves.get(moveSlot.id).category === 'Status') {
				pokemon.disableMove(moveSlot.id);
			}
		}
	},`,
});

const itemRecoilOnContactHit = defineKind({
	id: "itemRecoilOnContactHit",
	description: "When hit by a contact move, the attacker takes damage equal to a fraction of their max HP (Rocky Helmet style).",
	paramsSchema: z.object({
		fraction: z.number().positive().max(0.25).default(1 / 6),
	}),
	emit: ({ fraction }) => {
		const num = Math.round(fraction * 4369); // 1/6 in 4096-scale
		return `
	onDamagingHit(damage, target, source, move) {
		if (move.flags['contact']) {
			this.damage(this.clampIntRange(Math.floor(source.maxhp / 6), 1), source, target);
		}
	},`;
	},
});

const itemCureStatus = defineKind({
	id: "itemCureStatus",
	description: "Cures any status condition once when inflicted (Lum Berry style).",
	paramsSchema: z.object({
		healFraction: z.number().positive().max(0.5).default(1 / 4),
	}),
	emit: ({ healFraction }) => {
		const denom = Math.round(1 / healFraction);
		return `
	onUpdate(pokemon) {
		if (pokemon.status === 'frz' || pokemon.status === 'brn' || pokemon.status === 'par' || pokemon.status === 'psn' || pokemon.status === 'tox' || pokemon.status === 'slp') {
			pokemon.cureStatus();
			this.heal(pokemon.baseMaxhp / ${denom}, pokemon);
		}
	},`;
	},
});

const itemEjectAfterDamage = defineKind({
	id: "itemEjectAfterDamage",
	description: "After being damaged by a move, switch out (Eject Button style).",
	paramsSchema: z.object({}),
	emit: () => `
	onAfterMoveSecondary(target, source, move) {
		if (source && source !== target && move && move.category !== 'Status' && target.hp) {
			if (!source.isActive || !this.canSwitch(target.side)) return;
			if (target.volatiles['substitute'] && !move.infiltrates) return;
			this.add('-activate', target, 'item: Eject Button');
			target.switchFlag = true;
		}
	},`,
});

const itemPinchBoostByType = defineKind({
	id: "itemPinchBoostByType",
	description: "Boosts a move type by 1.2x when holding, only in pinch (type berries like Liechi/Ganlon style).",
	paramsSchema: z.object({
		type: z.enum(POKEMON_TYPES),
		multiplier: z.number().positive().max(2).default(1.2),
		trigger: z.enum(["hp", "pinch"]).default("pinch"),
	}),
	emit: ({ type, multiplier, trigger }) => {
		const cond = trigger === "pinch"
			? "pokemon.hp <= pokemon.maxhp / 4"
			: "pokemon.hp <= pokemon.maxhp / 2";
		return `
	onUpdate(pokemon) {
		if (${cond} && !pokemon.volatiles['confusion']) {
			pokemon.eatItem();
		}
	},
	onEat(pokemon) {
		this.add('-useitem', pokemon, this.effect, '[from] item: ' + pokemon.getItem().name);
	},
	onBasePowerPriority: 15,
	onBasePower(basePower, user, target, move) {
		if (move.type === '${type}' && (user.hp <= user.maxhp / 2)) {
			return this.chainModify(${multiplierTuple(multiplier)});
		}
	},`;
	},
});

// ────────────────────────────────────────────────────────────────────────────
// Registry (lookup by id)
// ────────────────────────────────────────────────────────────────────────────

export const EFFECT_KINDS = {
	// Ability effects
	boostMovePowerByType,
	boostMovePowerByCategory,
	statusOnContact,
	statusOnAnyDamagingHit,
	boostStatOnEntry,
	lowerStatOnEntry,
	boostStatOnHit,
	boostStatOnKO,
	immuneToType,
	weatherSpeedBoost,
	setWeatherOnEntry,
	setTerrainOnEntry,
	priorityBoostByType,
	boostMovePowerWhenLowHp,
	statusImmunity,
	healOnSwitchOut,
	speedBoostEachTurn,
	damageReductionByType,
	critRateBoost,
	shareAbilityWithAllies,
	// Item effects
	itemHealPerTurn,
	itemBoostStatLockMove,
	itemBoostDamageWithRecoil,
	itemReduceSpecialDamage,
	itemRecoilOnContactHit,
	itemCureStatus,
	itemEjectAfterDamage,
	itemPinchBoostByType,
} as const;

export type EffectKindId = keyof typeof EFFECT_KINDS;

export function isKnownEffectKind(id: string): id is EffectKindId {
	return id in EFFECT_KINDS;
}

/**
 * Validate an effect reference end-to-end: known kind + valid params.
 * Returns parsed (typed) params on success or throws a ZodError on failure.
 */
export function parseEffectParams(kind: string, params: unknown): unknown {
	if (!isKnownEffectKind(kind)) {
		throw new Error(`Unknown effect kind: "${kind}". Known kinds: ${Object.keys(EFFECT_KINDS).join(", ")}`);
	}
	return EFFECT_KINDS[kind].paramsSchema.parse(params);
}

/**
 * Emit the merged snippet for an ordered list of effect references.
 * Caller must have already validated each ref via parseEffectParams.
 */
export function emitEffects(effects: { kind: string; params: unknown }[]): string {
	const out: string[] = [];
	for (const ref of effects) {
		if (!isKnownEffectKind(ref.kind)) throw new Error(`Unknown effect kind: ${ref.kind}`);
		const kind = EFFECT_KINDS[ref.kind] as EffectKind<z.ZodTypeAny>;
		out.push(kind.emit(ref.params));
	}
	return out.join("");
}

/** For the admin panel's "which effect kinds can I pick?" UI. */
export function describeEffectKinds() {
	return Object.values(EFFECT_KINDS).map((k) => ({
		id: k.id,
		description: k.description,
		paramsSchema: k.paramsSchema,
	}));
}
