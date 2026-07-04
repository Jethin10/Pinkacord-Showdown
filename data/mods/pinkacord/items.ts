// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.
// Edit the corresponding file in content/ and run `npm run pinkacord:build`.
// Generator: tools/pinkacord/generator.ts

export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	testingobject: {
		num: 10300,
		name: "testing object",
		shortDesc: "A custom held item.f",
	
		onResidualOrder: 5,
		onResidualSubOrder: 4,
		onResidual(pokemon) {
			if (pokemon.hp < pokemon.maxhp) {
				this.heal(pokemon.baseMaxhp / 4, pokemon);
			}
		},
		gen: 9,
	},
	codexe2everifyitem: {
		num: 10998,
		name: "Codex E2E Verify Item",
		shortDesc: "Temporary admin publish verification item.",

		gen: 9,
	},
};
