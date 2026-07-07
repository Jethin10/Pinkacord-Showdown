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
	publishkey: {
		num: 10303,
		name: "Publish key",
		shortDesc: "A custom held item.",
	onAfterMoveSecondary(target, source, move) {
			if (source && source !== target && move && move.category !== 'Status' && target.hp) {
				if (!source.isActive || !this.canSwitch(target.side)) return;
				if (target.volatiles['substitute'] && !move.infiltrates) return;
				this.add('-activate', target, 'item: Eject Button');
				target.switchFlag = true;
			}
		},
		gen: 9,
	},
	customite: {
		num: 10304,
		name: "Customite",
		shortDesc: "Allows a custom Pinkacord Mega forme to Mega Evolve.",
		megaStone: {
			Lapras: "Lapras-Mega",
		},
		itemUser: ["Lapras"],
	onTakeItem(item, source) {
			return !this.actions.canMegaEvo(source);
		},
		gen: 9,
	},
};
