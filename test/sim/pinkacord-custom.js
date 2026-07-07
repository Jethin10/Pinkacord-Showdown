'use strict';

const assert = require('./../assert');
const common = require('./../common');

let battle;

describe('Pinkacord custom mechanics', () => {
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	it('sets Aurora Veil for 4 turns when Arctic Afterglow switches in', () => {
		battle = common.createBattle({ formatid: 'pinkacordnatdex' }, [[
			{ species: 'Lapras', ability: 'arcticafterglow', moves: ['sleeptalk'] },
		], [
			{ species: 'Pikachu', moves: ['sleeptalk'] },
		]]);

		battle.makeChoices('team 1', 'team 1');

		const veil = battle.p1.sideConditions.auroraveil;
		assert(veil, 'Aurora Entrance should set Aurora Veil on switch-in');
		assert.equal(veil.duration, 4);
	});

	it('lets Customite Mega Evolve into a Pinkacord custom Mega forme', () => {
		battle = common.createBattle({ formatid: 'pinkacordnatdex' }, [[
			{ species: 'Lapras', item: 'customite', moves: ['sleeptalk'] },
		], [
			{ species: 'Pikachu', moves: ['sleeptalk'] },
		]]);

		battle.makeChoices('team 1', 'team 1');
		battle.makeChoices('move sleeptalk mega', 'move sleeptalk');

		assert.equal(battle.p1.active[0].species.name, 'Lapras-Mega');
	});
});
