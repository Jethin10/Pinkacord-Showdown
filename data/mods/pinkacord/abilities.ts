// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.
// Edit the corresponding file in content/ and run `npm run pinkacord:build`.
// Generator: tools/pinkacord/generator.ts

export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	arcticafterglow: {
		name: "Arctic Afterglow",
		shortDesc: "On switch-in, sets Aurora Veil on the user's side for 4 turns.",
	onStart(pokemon) {
			if (!pokemon.side.addSideCondition('auroraveil', pokemon, this.effect)) {
				const state = pokemon.side.sideConditions['auroraveil'];
				if (state) state.duration = 4;
				return;
			}
			pokemon.side.sideConditions['auroraveil'].duration = 4;
		},
		flags: {},
		gen: 9,
	},
	supercompute: {
		name: "Supercompute",
		shortDesc: "Raise Special Attack by 1 on entry",
	onStart(pokemon) {
			this.boost({ spa: 1 }, pokemon);
		},
		flags: {},
		gen: 9,
	},
};
