// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.
// Edit the corresponding file in content/ and run `npm run pinkacord:build`.
// Generator: tools/pinkacord/generator.ts

export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	pinkberry: {
		num: 9001,
		name: "Pink Berry",
		shortDesc: "Heals 25% HP and cures any status when HP drops below 50%.",
	
		onUpdate(pokemon) {
			if (pokemon.status === 'frz' || pokemon.status === 'brn' || pokemon.status === 'par' || pokemon.status === 'psn' || pokemon.status === 'tox' || pokemon.status === 'slp') {
				pokemon.cureStatus();
				this.heal(pokemon.baseMaxhp / 4, pokemon);
			}
		},
		gen: 9,
	},
	lifefragment: {
		num: 9002,
		name: "Life Fragment",
		shortDesc: "Boosts all moves by 1.3x but takes 10% recoil.",
	
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			return this.chainModify([5325, 4096]);
		},
		onAfterMoveSecondarySelf(source, target, move) {
			if (move.category !== 'Status' && source && source.hp) {
				this.damage(source.baseMaxhp * 0.1, source, source, this.dex.items.get('lifeorb'));
			}
		},
		gen: 9,
	},
	leftoversclone: {
		num: 9003,
		name: "Leftovers Clone",
		shortDesc: "Heals 1/16 of max HP at the end of each turn.",
	
		onResidualOrder: 5,
		onResidualSubOrder: 4,
		onResidual(pokemon) {
			if (pokemon.hp < pokemon.maxhp) {
				this.heal(pokemon.baseMaxhp / 16, pokemon);
			}
		},
		gen: 9,
	},
	vestofmight: {
		num: 9004,
		name: "Vest of Might",
		shortDesc: "Takes half damage from Special moves but can't use Status moves.",
	
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
		},
		gen: 9,
	},
	orbofaura: {
		num: 9005,
		name: "Orb of Aura",
		shortDesc: "When hit by contact, attacker takes 1/6 max HP damage.",
	
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				this.damage(this.clampIntRange(Math.floor(source.maxhp / 6), 1), source, target);
			}
		},
		gen: 9,
	},
};
