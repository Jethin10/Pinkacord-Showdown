'use strict';

const assert = require('../assert');
const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

function extractFunction(script, name, nextName) {
	const start = script.indexOf(`function ${name}(`);
	assert.notEqual(start, -1, `missing function ${name}`);
	const end = script.indexOf(`function ${nextName}(`, start);
	assert.notEqual(end, -1, `missing function ${nextName}`);
	return script.slice(start, end);
}

function extractBlock(script, startText, endText) {
	const start = script.indexOf(startText);
	assert.notEqual(start, -1, `missing block start ${startText}`);
	const end = script.indexOf(endText, start);
	assert.notEqual(end, -1, `missing block end ${endText}`);
	return script.slice(start, end);
}

describe('Pinkacord admin UI defaults', () => {
	const { SCRIPT } = require('../../dist/tools/pinkacord-admin/ui');

	it('initializes new Pokemon with real savable defaults', () => {
		const sandbox = {
			state: { customLearnsets: [], editor: null },
			deepClone: value => JSON.parse(JSON.stringify(value)),
			render() { },
			window: { scrollTo() { } },
		};
		vm.createContext(sandbox);
		vm.runInContext(
			[
				extractFunction(SCRIPT, 'moveIdOf', 'moveNameOf'),
				extractBlock(SCRIPT, 'function uniqueDraftName', 'function openSpeciesEditor'),
				extractFunction(SCRIPT, 'openSpeciesEditor', 'closeEditor'),
				'openSpeciesEditor(null);',
			].join('\n'),
			sandbox
		);

		const data = sandbox.state.editor.data;
		assert(data.name, 'new Pokemon name should be prefilled');
		assert(data.id, 'new Pokemon id should be prefilled');
		assert(data.abilities['0'], 'new Pokemon first ability should be prefilled');
	});

	it('initializes drawer and format entities with real savable identities', () => {
		const sandbox = {
			state: { customMoves: [], customAbilities: [], customItems: [], customFormats: [] },
		};
		vm.createContext(sandbox);
		vm.runInContext([
			extractFunction(SCRIPT, 'moveIdOf', 'moveNameOf'),
			extractBlock(SCRIPT, 'function uniqueDraftName', 'function openSpeciesEditor'),
			extractFunction(SCRIPT, 'defaultEntity', 'renderEntityList'),
		].join('\n'), sandbox);

		for (const type of ['moves', 'abilities', 'items', 'formats']) {
			const data = sandbox.defaultEntity(type);
			assert(data.name, `${type} name should be prefilled`);
			assert(data.id, `${type} id should be prefilled`);
		}
	});

	it('exposes every supported move mechanic in the move editor', () => {
		const source = extractFunction(SCRIPT, 'renderMoveFormAdvanced', 'effectParamControl');
		const haystack = source + SCRIPT;
		for (const label of [
			'Target', 'Contest type', 'Long description', 'Secondary effect',
			'Drain', 'Recoil', 'Self boosts', 'Multihit', 'Crit ratio',
			'recharge', 'snatch', 'gravity', 'defrost', 'metronome', 'wind',
		]) {
			assert(haystack.includes(label), `move editor should expose ${label}`);
		}
	});

	it('uses typed controls for effect parameters', () => {
		const source = extractBlock(SCRIPT, 'function effectParamControl', 'function renderAbilityForm');
		for (const text of ['type', 'status', 'weather', 'terrain', 'stat', 'category', 'fraction', 'multiplier']) {
			assert(source.includes(text), `effect parameter controls should recognize ${text}`);
		}
	});
});

describe('Pinkacord admin store writes', () => {
	let oldCwd;
	let tmpDir;

	beforeEach(() => {
		oldCwd = process.cwd();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinkacord-admin-store-'));
		fs.cpSync(path.join(oldCwd, 'content'), path.join(tmpDir, 'content'), { recursive: true });
		process.chdir(tmpDir);
		delete require.cache[require.resolve('../../dist/tools/pinkacord-admin/store')];
	});

	afterEach(() => {
		process.chdir(oldCwd);
		fs.rmSync(tmpDir, { recursive: true, force: true });
		delete require.cache[require.resolve('../../dist/tools/pinkacord-admin/store')];
	});

	it('returns an awaitable create result after the file write is complete', async () => {
		const store = require('../../dist/tools/pinkacord-admin/store');
		const result = store.create('items', {
			id: 'awaiteditem',
			num: 9997,
			name: 'Awaited Item',
			shortDesc: 'Confirms admin writes finish before responses.',
			effects: [],
		}, 'test');
		assert.equal(typeof result?.then, 'function', 'create should return a Promise');

		await result;
		const file = JSON.parse(fs.readFileSync(path.join(tmpDir, 'content/pinkacord/items.json'), 'utf8'));
		assert(file.items.some(item => item.id === 'awaiteditem'));
	});

	it('saves advanced move mechanics without dropping fields', async () => {
		const store = require('../../dist/tools/pinkacord-admin/store');
		await store.create('moves', {
			id: 'advancedstrike',
			num: 9998,
			name: 'Advanced Strike',
			type: 'Fairy',
			category: 'Physical',
			basePower: 90,
			accuracy: 95,
			pp: 10,
			priority: 1,
			target: 'adjacentFoe',
			shortDesc: 'Exercises every advanced move editor field.',
			desc: 'Has drain, recoil, a secondary effect, self boosts, multihit, and advanced flags.',
			flags: { contact: 1, protect: 1, recharge: 1, wind: 1 },
			secondary: { chance: 30, status: 'par', boosts: { def: -1 } },
			drain: [1, 2],
			recoil: [1, 3],
			selfBoost: { boosts: { atk: 1 } },
			multihit: [2, 5],
			critRatio: 2,
			contestType: 'Cool',
		}, 'test');

		const file = JSON.parse(fs.readFileSync(path.join(tmpDir, 'content/pinkacord/moves.json'), 'utf8'));
		const saved = file.items.find(move => move.id === 'advancedstrike');
		assert(saved, 'advanced move should be written');
		assert.deepEqual(saved.secondary, { chance: 30, status: 'par', boosts: { def: -1 } });
		assert.deepEqual(saved.drain, [1, 2]);
		assert.deepEqual(saved.recoil, [1, 3]);
		assert.deepEqual(saved.selfBoost, { boosts: { atk: 1 } });
		assert.deepEqual(saved.multihit, [2, 5]);
		assert.equal(saved.target, 'adjacentFoe');
		assert.equal(saved.contestType, 'Cool');
		assert.equal(saved.flags.recharge, 1);
		assert.equal(saved.flags.wind, 1);
	});
});

describe('Pinkacord admin HTTP', () => {
	let oldCwd;
	let tmpDir;
	let child;
	let baseUrl;

	beforeEach(async function () {
		this.timeout(10000);
		oldCwd = process.cwd();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinkacord-admin-http-'));
		fs.cpSync(path.join(oldCwd, 'content'), path.join(tmpDir, 'content'), { recursive: true });
		const port = 19000 + Math.floor(Math.random() * 1000);
		baseUrl = `http://127.0.0.1:${port}`;
		child = child_process.spawn(process.execPath, [path.join(oldCwd, 'dist/tools/pinkacord-admin/server.js')], {
			cwd: tmpDir,
			env: {
				...process.env,
				PINKACORD_ADMIN_PASSWORD: 'testpass123',
				PINKACORD_ADMIN_PORT: String(port),
				PINKACORD_ADMIN_BIND: '127.0.0.1',
			},
			stdio: 'ignore',
		});
		for (let i = 0; i < 50; i++) {
			try {
				const res = await fetch(`${baseUrl}/health`);
				if (res.ok) return;
			} catch {}
			await new Promise(resolve => {
				setTimeout(resolve, 100);
			});
		}
		throw new Error('admin server did not start');
	});

	afterEach(async () => {
		if (child && !child.killed) {
			const exited = new Promise(resolve => {
				child.once('exit', resolve);
			});
			child.kill();
			await exited;
		}
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('does not return a console-noisy 404 for missing sprite previews', async () => {
		const login = await fetch(`${baseUrl}/api/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Pinkacord-Admin': '1' },
			body: JSON.stringify({ password: 'testpass123', displayName: 'test' }),
		});
		assert.equal(login.status, 200);
		const cookie = login.headers.get('set-cookie');

		const preview = await fetch(`${baseUrl}/api/species/nope/sprite/preview`, {
			headers: { 'X-Pinkacord-Admin': '1', Cookie: cookie },
		});
		assert.equal(preview.status, 204);
	});
});

describe('Pinkacord hosted publish pipeline', () => {
	it('hotpatches the live server before publishing content drift', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/pinkacord-admin/server.ts'), 'utf8');
		const publishRoute = source.slice(source.indexOf('pathname === "/api/publish"'), source.indexOf('if (method === "POST" && pathname === "/api/build")'));
		assert(publishRoute.includes('runHotpatch()'), 'hosted publish should hotpatch the running PS server');
		assert(
			publishRoute.indexOf('runHotpatch()') < publishRoute.indexOf('publishContent('),
			'live hotpatch should happen before the GitHub publish step'
		);
		assert(publishRoute.includes('hotpatch'), 'publish response should include the hotpatch result for the UI');
	});

	it('publishes generated server files alongside admin content', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/pinkacord-admin/github.ts'), 'utf8');
		assert(source.includes('"content"'), 'admin publish should include editable content files');
		assert(source.includes('"config/custom-formats.ts"'), 'admin publish should include the generated format registry');
		assert(source.includes('"data/mods/pinkacord"'), 'admin publish should include generated Pinkacord mod files');
		assert(source.includes('"server/static/sprites/pinkacord"'), 'admin publish should include mirrored Pinkacord sprites');
	});

	it('rebuilds browser data during hosted Docker deploys', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../Dockerfile'), 'utf8');
		const pinkacordBuild = source.indexOf('node dist/tools/pinkacord/cli.js build');
		const clientBuild = source.indexOf('node tools/build-client.js');
		const clientCopy = source.indexOf('node tools/copy-client.js');
		assert(pinkacordBuild >= 0, 'Dockerfile should build generated Pinkacord server data');
		assert(clientBuild > pinkacordBuild, 'Dockerfile should rebuild browser data after Pinkacord server data');
		assert(clientCopy > clientBuild, 'Dockerfile should copy rebuilt browser data into server/static');
	});

	it('keeps the Pinkacord homepage shell when copying rebuilt client assets', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/copy-client.js'), 'utf8');
		assert(!source.includes("'index.html'"), 'client asset copy must not overwrite server/static/index.html');
	});

	it('keeps the Pinkacord hosted client config when copying rebuilt client assets', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/copy-client.js'), 'utf8');
		assert(
			!source.includes("copyRecursive(path.join(clientDir, 'config')"),
			'client asset copy must not overwrite server/static/config/config.js'
		);
	});

	it('generates browser format data instead of copying stale upstream formats', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/build-client.js'), 'utf8');
		assert(source.includes('Building `data/formats.js`'), 'client build should generate formats.js from the merged server format list');
		assert(!source.includes('C:/pokemon-showdown-pinkacord-client'), 'client build should not depend on a local Windows-only client checkout');
	});

	it('builds Teambuilder search data in the shape the browser client expects', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/build-client.js'), 'utf8');
		assert(!source.includes("x + ' pokemon'"), 'search-index rows must be arrays, not "id type" strings');
		assert(source.includes('items: buildItemRows'), 'Teambuilder table must include item rows');
		assert(source.includes('learnsets: compactLearnsets'), 'Teambuilder table must include compact learnsets');
		assert(source.includes('Building `data/formats-data.js`'), 'formats-data.js must be rebuilt from current Pinkacord data');
	});

	it('uses the Pinkacord dex for the Pinkacord lobby format', () => {
		const formats = JSON.parse(fs.readFileSync(path.join(__dirname, '../../content/formats.json'), 'utf8')).items;
		const format = formats.find(f => f.id === 'pinkacordloweringpowercreep');
		assert(format, 'expected the Pinkacord lowering powercreep format to exist');
		assert.equal(format.mod, 'pinkacord', 'Pinkacord formats must use the custom dex so admin-added content is legal');
	});

	it('lets Pinkacord smoke tests fall back to inherited Gen 9 content', () => {
		const source = fs.readFileSync(path.join(__dirname, '../../tools/pinkacord/smoke-test.ts'), 'utf8');
		assert(
			source.includes('if (!team) return validateTeam(f.id, buildVanillaTeam(f.gameType, minSize));'),
			'Pinkacord formats without custom species should smoke-test with inherited Gen 9 filler teams'
		);
	});
});
