'use strict';

const assert = require('./../assert');

describe('Pinkacord client teambuilder data', () => {
	it('serves custom Mega data in a NatDex-style Pinkacord teambuilder table', () => {
		const { BattlePokedex } = require('../../client/play.pokemonshowdown.com/data/pokedex');
		const { BattleItems } = require('../../client/play.pokemonshowdown.com/data/items');
		const { BattleFormatsData } = require('../../client/play.pokemonshowdown.com/data/formats-data');
		const { BattleTeambuilderTable } = require('../../client/play.pokemonshowdown.com/data/teambuilder-tables');

		assert(BattlePokedex.laprasmega, 'client Pokedex should include Lapras-Mega');
		assert.equal(BattlePokedex.laprasmega.requiredItem, 'Customite');
		assert(BattleItems.customite, 'client items should include Customite');
		assert.equal(BattleItems.customite.megaStone.Lapras, 'Lapras-Mega');
		assert(BattleItems.customite.itemUser.includes('Lapras'));
		assert.equal(BattleFormatsData.laprasmega.tier, 'Illegal');
		assert.equal(BattleFormatsData.laprasmega.natDexTier, 'OU');

		const natDexRows = JSON.stringify(BattleTeambuilderTable.pinkacordnatdex.tiers);
		assert(natDexRows.includes('venusaurmega'), 'Pinkacord NatDex should include normal NatDex megas');
		assert(natDexRows.includes('laprasmega'), 'Pinkacord NatDex should include custom megas');
	});

	it('routes Pinkacord NatDex searches through Pinkacord NatDex tables', () => {
		const fs = require('fs');
		const path = require('path');
		const source = fs.readFileSync(
			path.join(__dirname, '../../client/play.pokemonshowdown.com/src/battle-dex-search.ts'), 'utf8'
		);
		assert(source.includes("'pinkacordnatdex' | null"));
		assert(source.includes("this.formatType === 'pinkacordnatdex'"));
		assert(source.includes("table = table['pinkacordnatdex']"));

		const servedBundle = fs.readFileSync(
			path.join(__dirname, '../../server/static/js/battle-dex-search.js'),
			'utf8'
		);
		assert(servedBundle.includes('pinkacordnatdex'));
		assert(servedBundle.includes("table['pinkacordnatdex']"));
	});
});
