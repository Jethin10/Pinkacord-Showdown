// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.
// Edit the corresponding file in content/ and run `npm run pinkacord:build`.
// Generator: tools/pinkacord/generator.ts

export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	roseaura: {
		name: "Rose Aura",
		shortDesc: "This Pokemon's Fairy-type moves have 1.33x power.",
	
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Fairy') {
				return this.chainModify([5448, 4096]);
			}
		},
		flags: {},
		gen: 9,
	},
};
