/**
 * Tests for client format-list handling.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

function toID(text) {
	if (text && text.id) {
		text = text.id;
	} else if (text && text.userid) {
		text = text.userid;
	}
	if (typeof text !== 'string' && typeof text !== 'number') return '';
	return `${text}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function readClientSource(clientPath) {
	return fs.readFileSync(path.resolve(__dirname, '../..', clientPath), 'utf8');
}

function extractFunctionBody(source, marker) {
	const start = source.indexOf(marker);
	if (start < 0) throw new Error(`Could not find ${marker}`);
	const bodyStart = source.indexOf('{', start) + 1;
	let depth = 1;
	let bodyEnd = bodyStart;
	for (; bodyEnd < source.length; bodyEnd++) {
		if (source[bodyEnd] === '{') {
			depth++;
		} else if (source[bodyEnd] === '}') {
			depth--;
			if (!depth) break;
		}
	}
	if (depth) throw new Error(`Could not parse ${marker}`);
	return source.slice(bodyStart, bodyEnd);
}

function loadLegacyParseFormats(clientPath) {
	const source = readClientSource(clientPath);
	const body = extractFunctionBody(source, 'parseFormats: function (formatsList) {');
	return new Function(`return function (formatsList) {${body}\n};`)();
}

function loadPanelParseFormats(clientPath) {
	const source = readClientSource(clientPath);
	const body = extractFunctionBody(source, 'parseFormats=function parseFormats(formatsList){');
	return new Function(`return function (formatsList) {${body}\n};`)();
}

function withClientGlobals(callback) {
	const previous = {
		window: global.window,
		Dex: global.Dex,
		app: global.app,
		$: global.$,
		PS: global.PS,
		toID: global.toID,
		BattleFormats: global.BattleFormats,
		NonBattleGames: global.NonBattleGames,
	};
	try {
		global.window = global;
		global.Dex = { gen: 9 };
		global.app = { localLadder: false, supports: {}, trigger() {} };
		global.$ = { trim: str => str.trim() };
		global.PS = { teams: { update() {}, usesLocalLadder: false } };
		global.toID = toID;
		global.BattleFormats = undefined;
		global.NonBattleGames = undefined;
		return callback();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) {
				delete global[key];
			} else {
				global[key] = value;
			}
		}
	}
}

const FORMAT_LIST = [
	'formats',
	',LL',
	',1',
	'Pinkacord',
	'[Pinkacord] OU,e',
	'[Pinkacord] Random Battle,f',
];

for (const clientPath of [
	'client/play.pokemonshowdown.com/js/client.js',
	'server/static/js/client.js',
]) {
	describe(`Legacy client formats (${clientPath})`, () => {
		it('should map Pinkacord teambuilder formats to the current generation', () => {
			const parseFormats = loadLegacyParseFormats(clientPath);
			const formats = withClientGlobals(() => {
				parseFormats.call({ trigger() {} }, FORMAT_LIST);
				return global.BattleFormats;
			});

			assert.equal(formats.pinkacordou.teambuilderFormat, 'gen9pinkacordou');
			assert.equal(formats.pinkacordrandombattle.team, 'preset');
		});
	});
}

for (const clientPath of [
	'client/play.pokemonshowdown.com/js/panel-mainmenu.js',
	'server/static/js/panel-mainmenu.js',
]) {
	describe(`Panel client formats (${clientPath})`, () => {
		it('should map Pinkacord teambuilder formats to the current generation', () => {
			const parseFormats = loadPanelParseFormats(clientPath);
			const formats = withClientGlobals(() => {
				parseFormats.call({}, FORMAT_LIST);
				return global.BattleFormats;
			});

			assert.equal(formats.pinkacordou.teambuilderFormat, 'gen9pinkacordou');
			assert.equal(formats.pinkacordrandombattle.team, 'preset');
		});
	});
}
