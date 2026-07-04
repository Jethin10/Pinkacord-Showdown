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
const staticDataSource = process.env.PINKACORD_CLIENT_DATA_SOURCE ?
	path.resolve(process.env.PINKACORD_CLIENT_DATA_SOURCE) :
	path.resolve(clientDataDir);

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

function writeJSONParseExport(filePath, exportName, data) {
	const json = JSON.stringify(data).replace(/['\\]/g, "\\$&");
	fs.writeFileSync(filePath, `exports.${exportName} = JSON.parse('${json}');\n`);
}

function loadMergedData(file, exportName) {
	const base = requireNoCache(`../dist/data/${file}.js`)[exportName];
	let mod = {};
	try {
		mod = requireNoCache(`../dist/data/mods/pinkacord/${file}.js`)[exportName] || {};
	} catch {}
	return { ...base, ...mod };
}

function compactLearnsetEntry(sources) {
	const codes = new Set();
	for (const source of sources) {
		const gen = source.charAt(0);
		if (!/[1-9]/.test(gen)) continue;
		codes.add(gen);
		if (gen === '6') codes.add('p');
		if (gen === '7') codes.add('q');
		if (gen === '8') codes.add('g');
		if (gen === '9') codes.add('a');
		if (source.includes('E')) codes.add('e');
	}
	return '123456789pqgae'.split('').filter(code => codes.has(code)).join('');
}

function compactLearnsets(rawLearnsets) {
	const learnsets = {};
	for (const id in rawLearnsets) {
		const raw = rawLearnsets[id].learnset || rawLearnsets[id];
		const compact = {};
		for (const moveid in raw) {
			if (!Array.isArray(raw[moveid]) && typeof raw[moveid] !== 'string') continue;
			if (Array.isArray(raw[moveid])) {
				const sources = raw[moveid].filter(source => typeof source === 'string');
				if (!sources.length) continue;
				compact[moveid] = compactLearnsetEntry(sources);
			} else {
				compact[moveid] = raw[moveid];
			}
		}
		learnsets[id] = compact;
	}
	return learnsets;
}

function addSearchRows(rows, table, type) {
	for (const id of Object.keys(table)) {
		rows.push([id, type]);
	}
}

function sortSearchRows(rows) {
	rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
	return rows;
}

function buildItemRows(Items) {
	const rows = [['header', 'Items']];
	for (const id of Object.keys(Items).sort()) {
		const item = Items[id];
		if (item.isNonstandard === 'Past' || item.isNonstandard === 'LGPE') continue;
		rows.push(id);
	}
	return rows;
}

function buildTierRows(Pokedex, FormatsData) {
	const tierOrder = [
		'AG', 'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL',
		'PU', 'ZUBL', 'ZU', 'NFE', 'LC', 'CAP', 'Unreleased', 'Illegal',
	];
	const buckets = {};
	for (const id in Pokedex) {
		const species = Pokedex[id];
		if (species.isNonstandard === 'Past' || species.isNonstandard === 'CAP' && species.tier !== 'CAP') continue;
		const tier = FormatsData[id]?.tier || species.tier || 'Illegal';
		if (!buckets[tier]) buckets[tier] = [];
		buckets[tier].push(id);
	}
	const rows = [];
	for (const tier of tierOrder) {
		const bucket = buckets[tier];
		if (!bucket?.length) continue;
		rows.push(['header', tier]);
		rows.push(...bucket.sort((a, b) => {
			const speciesA = Pokedex[a];
			const speciesB = Pokedex[b];
			const numA = speciesA.num || 0;
			const numB = speciesB.num || 0;
			return numA - numB || (speciesA.name || a).localeCompare(speciesB.name || b);
		}));
	}
	return rows;
}

function buildFormatSlices(tiers) {
	const slices = {};
	for (let i = 0; i < tiers.length; i++) {
		const row = tiers[i];
		if (Array.isArray(row) && row[0] === 'header') slices[row[1]] = i;
	}
	return slices;
}

// Load base Dex and pinkacord mod
console.log('Loading data...');
const { Dex } = require('../dist/sim/dex');
const modDex = Dex.mod('pinkacord');
console.log(`  Base Pokedex: ${Object.keys(Dex.data.Pokedex).length} entries`);
console.log(`  Mod Pokedex:  ${Object.keys(modDex.data.Pokedex).length} entries`);

fs.mkdirSync(clientDataDir, { recursive: true });

/*********************************************************
 * Build formats.js
 *********************************************************/

process.stdout.write('Building `data/formats.js`... ');

{
	Dex.includeFormats();
	const clientKeys = [
		'section', 'column', 'name', 'desc', 'threads', 'mod', 'team', 'gameType',
		'searchShow', 'challengeShow', 'tournamentShow', 'rated', 'bestOfDefault',
		'ruleset', 'banlist', 'unbanlist', 'restricted', 'battle', 'debug',
		'teraPreviewDefault',
	];
	const Formats = Dex.formats.all().map(format => {
		const out = {};
		for (const key of clientKeys) {
			if (format[key] !== undefined) out[key] = format[key];
		}
		return out;
	});

	const buf = 'exports.Formats = ' + es3stringify(Formats) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'formats.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build pokedex.js
 *********************************************************/

process.stdout.write('Building `data/pokedex.js`... ');

{
	// Load base pokedex, then merge pinkacord on top
	const Pokedex = loadMergedData('pokedex', 'Pokedex');

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
 * Build formats-data.js
 *********************************************************/

process.stdout.write('Building `data/formats-data.js`... ');

{
	const FormatsData = loadMergedData('formats-data', 'FormatsData');
	const buf = 'exports.BattleFormatsData = ' + es3stringify(FormatsData) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'formats-data.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build moves.js
 *********************************************************/

process.stdout.write('Building `data/moves.js`... ');

{
	const Moves = loadMergedData('moves', 'Moves');

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
	const Items = loadMergedData('items', 'Items');

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
	const Abilities = loadMergedData('abilities', 'Abilities');

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
	const TypeChart = loadMergedData('typechart', 'TypeChart');

	const buf = 'exports.BattleTypeChart = ' + es3stringify(TypeChart) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'typechart.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build learnsets.js
 *********************************************************/

process.stdout.write('Building `data/learnsets.js`... ');

{
	const Learnsets = loadMergedData('learnsets', 'Learnsets');

	const buf = 'exports.BattleLearnsets = ' + es3stringify(Learnsets) + ';\n';
	fs.writeFileSync(path.join(clientDataDir, 'learnsets.js'), buf);
}
console.log(' DONE');

/*********************************************************
 * Build search-index.js
 *********************************************************/

process.stdout.write('Building `data/search-index.js`... ');

{
	const Pokedex = loadMergedData('pokedex', 'Pokedex');
	const Moves = loadMergedData('moves', 'Moves');
	const Items = loadMergedData('items', 'Items');
	const Abilities = loadMergedData('abilities', 'Abilities');
	const TypeChart = loadMergedData('typechart', 'TypeChart');
	const toID = Dex.toID;

	const BattleSearchIndex = [];
	addSearchRows(BattleSearchIndex, Pokedex, 'pokemon');
	addSearchRows(BattleSearchIndex, Moves, 'move');
	addSearchRows(BattleSearchIndex, Items, 'item');
	addSearchRows(BattleSearchIndex, Abilities, 'ability');
	for (const typeName of Object.keys(TypeChart)) {
		BattleSearchIndex.push([toID(typeName), 'type']);
	}
	sortSearchRows(BattleSearchIndex);

	const BattleSearchIndexOffset = BattleSearchIndex.map(() => '');
	let BattleSearchCountIndex = [];

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
	const Pokedex = loadMergedData('pokedex', 'Pokedex');
	const FormatsData = loadMergedData('formats-data', 'FormatsData');
	const Items = loadMergedData('items', 'Items');
	const Learnsets = loadMergedData('learnsets', 'Learnsets');

	const BattleTeambuilderTable = {
		tiers: buildTierRows(Pokedex, FormatsData),
		items: buildItemRows(Items),
		learnsets: compactLearnsets(Learnsets),
		overrideTier: {},
		formatSlices: {},
		overrideMoveData: {},
		overrideItemData: {},
		overrideAbilityData: {},
		overrideSpeciesData: {},
		overrideTypeChart: {},
		removeType: {},
	};

	for (const id in Pokedex) {
		const tier = FormatsData[id]?.tier || Pokedex[id].tier;
		if (tier) BattleTeambuilderTable.overrideTier[id] = tier;
	}
	BattleTeambuilderTable.formatSlices = buildFormatSlices(BattleTeambuilderTable.tiers);
	BattleTeambuilderTable.pinkacord = {
		tiers: BattleTeambuilderTable.tiers,
		items: BattleTeambuilderTable.items,
		learnsets: BattleTeambuilderTable.learnsets,
		overrideTier: BattleTeambuilderTable.overrideTier,
		formatSlices: BattleTeambuilderTable.formatSlices,
		overrideMoveData: {},
		overrideItemData: {},
		overrideAbilityData: {},
		overrideSpeciesData: {},
		overrideTypeChart: {},
		removeType: {},
	};

	writeJSONParseExport(path.join(clientDataDir, 'teambuilder-tables.js'), 'BattleTeambuilderTable', BattleTeambuilderTable);
}
console.log(' DONE');

/*********************************************************
 * Copy static data files that don't need regeneration
 *********************************************************/

process.stdout.write('Copying static data files... ');

const staticFiles = [
	'aliases.js',
	'commands.js',
	'graphics.js',
	'text.js',
	'text-afd.js',
	'pokedex-mini.js',
];

for (const file of staticFiles) {
	const src = path.join(staticDataSource, file);
	const dest = path.join(clientDataDir, file);
	if (fs.existsSync(src)) {
		if (path.resolve(src) !== path.resolve(dest)) fs.copyFileSync(src, dest);
	} else {
		console.log(`  (skipped ${file} — not found in source)`);
	}
}
console.log(' DONE');

console.log('\nAll data files built successfully!');
