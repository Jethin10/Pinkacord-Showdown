#!/usr/bin/env node
'use strict';

/**
 * Build client data files for Pinkacord.
 *
 * Generates the data/*.js files that the PS client loads in the browser.
 * Merges base PS data with Pinkacord mod data (custom mons, moves, etc.)
 *
 * Usage: node tools/build-client.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

const clientDataDir = 'client/play.pokemonshowdown.com/data';

function es3stringify(obj) {
	const buf = JSON.stringify(obj);
	return buf.replace(/"([A-Za-z][A-Za-z0-9]*)":/g, (fullMatch, key) => (
		['return', 'new', 'delete'].includes(key) ? fullMatch : `${key}:`
	));
}

function requireNoCache(pathSpec) {
	delete require.cache[require.resolve(pathSpec)];
	return require(pathSpec);
}

// Load base Dex and pinkacord mod
console.log('Loading data...');
const { Dex } = require('../dist/sim/dex');
const modDex = Dex.mod('pinkacord');
console.log(`  Base Pokedex: ${Object.keys(Dex.data.Pokedex).length} entries`);
console.log(`  Mod Pokedex:  ${Object.keys(modDex.data.Pokedex).length} entries`);

fs.mkdirSync(clientDataDir, { recursive: true });

/*********************************************************
 * Build pokedex.js
 *********************************************************/

process.stdout.write('Building `data/pokedex.js`... ');

{
	// Load base pokedex, then merge pinkacord on top
	const basePokedex = requireNoCache('../dist/data/pokedex.js').Pokedex;
	const modPokedex = requireNoCache('../dist/data/mods/pinkacord/pokedex.js').Pokedex;
	const Pokedex = { ...basePokedex, ...modPokedex };

	// Enrich with tier data from FormatsData
	const FormatsData = modDex.data.FormatsData;
	for (const id in Pokedex) {
		const entry = Pokedex[id];
		if (FormatsData[id]) {
			const fEntry = FormatsData[id];
			if (fEntry.tier) entry.tier = fEntry.tier;
			if (fEntry.isNonstandard) entry.isNonstandard = fEntry.isNonstandard;
			if (fEntry.unreleasedHidden) entry.unreleasedHidden = fEntry.unreleasedHidden;
		}
	}

	const buf = 'exports.BattlePokedex = ' + es3stringify(Pokedex) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'pokedex.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build moves.js
 *********************************************************/

process.stdout.write('Building `data/moves.js`... ');

{
	const baseMoves = requireNoCache('../dist/data/moves.js').Moves;
	const modMoves = requireNoCache('../dist/data/mods/pinkacord/moves.js').Moves;
	const Moves = { ...baseMoves, ...modMoves };

	// Enrich with desc from Dex.moves
	for (const id in Moves) {
		const move = modDex.moves.get(Moves[id].name);
		if (move.exists) {
			if (move.desc) Moves[id].desc = move.desc;
			if (move.shortDesc) Moves[id].shortDesc = move.shortDesc;
		}
	}

	const buf = 'exports.BattleMovedex = ' + es3stringify(Moves) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'moves.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build items.js
 *********************************************************/

process.stdout.write('Building `data/items.js`... ');

{
	const baseItems = requireNoCache('../dist/data/items.js').Items;
	const modItems = requireNoCache('../dist/data/mods/pinkacord/items.js').Items;
	const Items = { ...baseItems, ...modItems };

	for (const id in Items) {
		const item = modDex.items.get(Items[id].name);
		if (item.exists) {
			if (item.desc) Items[id].desc = item.desc;
			if (item.shortDesc) Items[id].shortDesc = item.shortDesc;
		}
	}

	const buf = 'exports.BattleItems = ' + es3stringify(Items) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'items.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build abilities.js
 *********************************************************/

process.stdout.write('Building `data/abilities.js`... ');

{
	const baseAbilities = requireNoCache('../dist/data/abilities.js').Abilities;
	const modAbilities = requireNoCache('../dist/data/mods/pinkacord/abilities.js').Abilities;
	const Abilities = { ...baseAbilities, ...modAbilities };

	for (const id in Abilities) {
		const ability = modDex.abilities.get(Abilities[id].name);
		if (ability.exists) {
			if (ability.desc) Abilities[id].desc = ability.desc;
			if (ability.shortDesc) Abilities[id].shortDesc = ability.shortDesc;
		}
	}

	const buf = 'exports.BattleAbilities = ' + es3stringify(Abilities) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'abilities.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build typechart.js
 *********************************************************/

process.stdout.write('Building `data/typechart.js`... ');

{
	const baseTypeChart = requireNoCache('../dist/data/typechart.js').TypeChart;
	let modTypeChart = {};
	try {
		modTypeChart = requireNoCache('../dist/data/mods/pinkacord/typechart.js').TypeChart || {};
	} catch {}
	const TypeChart = { ...baseTypeChart, ...modTypeChart };

	const buf = 'exports.BattleTypeChart = ' + es3stringify(TypeChart) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'typechart.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build learnsets.js
 *********************************************************/

process.stdout.write('Building `data/learnsets.js`... ');

{
	const baseLearnsets = requireNoCache('../dist/data/learnsets.js').Learnsets;
	let modLearnsets = {};
	try {
		modLearnsets = requireNoCache('../dist/data/mods/pinkacord/learnsets.js').Learnsets || {};
	} catch {}
	const Learnsets = { ...baseLearnsets, ...modLearnsets };

	const buf = 'exports.BattleLearnsets = ' + es3stringify(Learnsets) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'learnsets.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build search-index.js
 *********************************************************/

process.stdout.write('Building `data/search-index.js`... ');

{
	const Pokedex = modDex.data.Pokedex;
	const Moves = modDex.data.Moves;
	const Items = modDex.data.Items;
	const Abilities = modDex.data.Abilities;
	const TypeChart = modDex.data.TypeChart;
	const toID = Dex.toID;

	let index = [];
	index = index.concat(Object.keys(Pokedex).map(x => x + ' pokemon'));
	index = index.concat(Object.keys(Moves).map(x => x + ' move'));
	index = index.concat(Object.keys(Items).map(x => x + ' item'));
	index = index.concat(Object.keys(Abilities).map(x => x + ' ability'));
	index = index.concat(Object.keys(TypeChart).map(x => toID(x) + ' type'));

	let BattleSearchIndex = [];
	let BattleSearchIndexOffset = [];
	let BattleSearchCountIndex = [];

	// Simple search index: just sort and join
	index.sort();
	BattleSearchIndex = index;

	const buf = 'exports.BattleSearchIndex = ' + JSON.stringify(BattleSearchIndex) + ';\n' +
		'exports.BattleSearchIndexOffset = ' + JSON.stringify(BattleSearchIndexOffset) + ';\n' +
		'exports.BattleSearchCountIndex = ' + JSON.stringify(BattleSearchCountIndex) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'search-index.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build teambuilder-tables.js
 *********************************************************/

process.stdout.write('Building `data/teambuilder-tables.js`... ');

{
	// Build tier lists for the teambuilder
	const Pokedex = modDex.data.Pokedex;
	const FormatsData = modDex.data.FormatsData;
	const BattleTeambuilderTable = { tiers: [] };

	const tierMap = {};
	for (const id in FormatsData) {
		const entry = FormatsData[id];
		const tier = entry.tier || 'Illegal';
		if (!tierMap[tier]) tierMap[tier] = [];
		tierMap[tier].push(id);
	}

	for (const tier of ['AG', 'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU', 'NFE', 'LC', 'CAP', 'Unreleased']) {
		if (tierMap[tier]) {
			BattleTeambuilderTable.tiers.push(...tierMap[tier]);
		}
	}

	const buf = `exports.BattleTeambuilderTable = JSON.parse('${JSON.stringify(BattleTeambuilderTable).replace(/['\\]/g, "\\$&")}');\n`;
	fs.writeFileSync(path.join(clientDataDir, 'teambuilder-tables.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Copy static data files that don't need regeneration
 *********************************************************/

process.stdout.write('Copying static data files... ');

const staticFiles = [
	'aliases.js',
	'commands.js',
	'formats.js',
	'formats-data.js',
	'graphics.js',
	'text.js',
	'text-afd.js',
	'pokedex-mini.js',
];

for (const file of staticFiles) {
	const src = path.join('C:/pokemon-showdown-pinkacord-client/play.pokemonshowdown.com/data', file);
	const dest = path.join(clientDataDir, file);
	if (fs.existsSync(src)) {
		fs.copyFileSync(src, dest);
	} else {
		console.log(`  (skipped ${file} — not found in source)`);
	}
}
console.log(' DONE');

console.log('\nAll data files built successfully!');
