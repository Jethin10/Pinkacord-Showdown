// THIS FILE IS GENERATED FROM content/. DO NOT EDIT BY HAND.
// Edit the corresponding file in content/ and run `npm run pinkacord:build`.
// Generator: tools/pinkacord/generator.ts

export const Scripts: ModdedBattleScriptsData = {
	gen: 9,
	inherit: "gen9",

	actions: {
		canMegaEvo(pokemon) {
			const species = pokemon.baseSpecies;
			const item = pokemon.getItem();
			if (item.id === 'customite') {
				const megaSpecies = this.dex.species.get(species.baseSpecies + '-Mega');
				if (
					megaSpecies.exists &&
					megaSpecies.isMega &&
					megaSpecies.baseSpecies === species.baseSpecies &&
					megaSpecies.requiredItem === item.name &&
					this.dex.data.Pokedex[megaSpecies.id]?.num >= 10001
				) {
					return megaSpecies.name;
				}
			}
			const altForme = species.otherFormes && this.dex.species.get(species.otherFormes[0]);
			if ((this.battle.gen <= 7 || this.battle.ruleTable.has('+pokemontag:past') ||
				this.battle.ruleTable.has('+pokemontag:future')) &&
				altForme?.isMega && altForme?.requiredMove &&
				pokemon.baseMoves.includes(this.battle.toID(altForme.requiredMove)) && !item.zMove) {
				return altForme.name;
			}
			if (!item.megaStone) return null;
			let megaEvolution = item.megaStone[species.name];
			if (megaEvolution && this.dex.species.get(megaEvolution).gen >= 9) return megaEvolution;
			megaEvolution = item.megaStone[species.baseSpecies];
			return megaEvolution && megaEvolution !== species.name ? megaEvolution : null;
		},
	},

};
