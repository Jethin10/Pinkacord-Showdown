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
