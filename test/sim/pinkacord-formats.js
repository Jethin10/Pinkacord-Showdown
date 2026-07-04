'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

describe('Pinkacord formats content', () => {
	it('defines Lowering powercreep with its requested rules and bans', () => {
		const file = path.resolve(__dirname, '../..', 'content/formats.json');
		const formats = JSON.parse(fs.readFileSync(file, 'utf8')).items;
		const format = formats.find(f => f.id === 'pinkacordloweringpowercreep');

		assert(format, 'Expected pinkacordloweringpowercreep in content/formats.json');
		assert.equal(format.name, '[Pinkacord] Lowering powercreep');
		assert.equal(format.mod, 'gen9');
		assert.equal(format.section, 'Pinkacord');
		assert.equal(format.column, 1);
		assert.equal(format.desc, 'Banning mons');
		assert.equal(format.gameType, 'singles');
		assert.deepEqual(format.ruleset, ['Standard', 'Evasion Clause']);
		assert.deepEqual(format.banlist, [
			'Uber',
			'AG',
			'Moody',
			'Shadow Tag',
			'Arena Trap',
			'King\'s Rock',
			'Razor Fang',
			'Baton Pass',
			'Last Respects',
			'Shed Tail',
			'Tera Blast',
			'Ogerpon-Wellspring',
			'Kyurem',
			'Ceruledge',
		]);
		assert.deepEqual(format.unbanlist, []);
		assert.equal(format.sharedPower, false);
		assert.equal(format.enabled, true);
	});
});
