'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

describe('Pinkacord Render image', () => {
	it('makes admin-publish generated output directories writable by node', () => {
		const dockerfile = fs.readFileSync(path.resolve(__dirname, '../..', 'Dockerfile'), 'utf8');
		const chownLine = dockerfile.split('\n').find(line => line.includes('chown -R node:node'));
		const chownedPaths = new Set((chownLine || '').split(/\s+/));

		assert(chownLine, 'Expected Dockerfile to chown runtime writable directories');
		assert(chownedPaths.has('/app/content'), 'content edits must be writable');
		assert(chownedPaths.has('/app/config'), 'generated custom-formats.ts must be writable');
		assert(chownedPaths.has('/app/data'), 'generated data/mods files must be writable');
		assert(chownedPaths.has('/app/server/static/sprites'), 'mirrored sprites must be writable');
	});
});
