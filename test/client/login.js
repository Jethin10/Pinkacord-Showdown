/**
 * Tests for client login assertion handling.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

function loadFinishRename(clientPath) {
	const source = fs.readFileSync(
		path.resolve(__dirname, '../..', clientPath), 'utf8'
	);
	const start = source.indexOf('finishRename: function (name, assertion) {');
	if (start < 0) throw new Error("Could not find finishRename in client.js");
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
	if (depth) throw new Error("Could not parse finishRename in client.js");
	const app = {
		addPopupMessage() {},
		trigger() {},
		send() {},
	};
	return new Function('app', `return function (name, assertion) {${source.slice(bodyStart, bodyEnd)}\n};`)(app);
}

for (const clientPath of [
	'client/play.pokemonshowdown.com/js/client.js',
	'server/static/js/client.js',
]) {
	describe(`Client login (${clientPath})`, () => {
		it('should ask for a password when the login server reports Unknown as unavailable', () => {
			const finishRename = loadFinishRename(clientPath);
			const calls = [];
			const user = {
				trigger: (...args) => calls.push(args),
				setPersistentName: () => calls.push(['setPersistentName']),
			};

			finishRename.call(user, 'Unknown', ';;Your username is no longer available.');

			assert.deepEqual(calls, [['login:authrequired', 'Unknown']]);
		});

		it('should keep other invalid-name assertions as name errors', () => {
			const finishRename = loadFinishRename(clientPath);
			const calls = [];
			const user = {
				trigger: (...args) => calls.push(args),
				setPersistentName: (...args) => calls.push(['setPersistentName', ...args]),
			};

			finishRename.call(user, 'BadName', ';;This username is banned.');

			assert.deepEqual(calls, [
				['setPersistentName', null],
				['login:invalidname', 'BadName', 'This username is banned.'],
			]);
		});
	});
}
