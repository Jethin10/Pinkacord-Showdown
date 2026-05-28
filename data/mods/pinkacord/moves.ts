// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.
// Edit the corresponding file in content/ and run `npm run pinkacord:build`.
// Generator: tools/pinkacord/generator.ts

export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
	pinkbolt: {
		num: 9001,
		accuracy: 100,
		basePower: 90,
		category: "Special",
		name: "Pink Bolt",
		shortDesc: "30% chance to paralyze the target.",
		pp: 15,
		priority: 0,
		flags: {
			protect: 1,
			mirror: 1,
		},
		secondary: {
			chance: 30,
			status: "par",
		},
		target: "normal",
		type: "Electric",
		contestType: "Cute",
	},
};
