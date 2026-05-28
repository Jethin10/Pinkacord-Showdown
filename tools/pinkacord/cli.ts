#!/usr/bin/env node
/**
 * Pinkacord content CLI.
 *
 * Subcommands:
 *   build       — JSON → TS + rebuild PS dist + smoke-test (default mod: pinkacord)
 *   check       — schema + cross-ref only, no file writes
 *   smoke-test  — assume content already built, just run smoke test
 *   effects     — list available effect kinds (for the future admin panel UI)
 *
 * Exit codes:
 *   0  success
 *   1  validation / build / smoke-test failure
 *   2  CLI usage error
 */

import { execFileSync } from "child_process";
import * as path from "path";

import { build, loadAndValidate, crossReferenceValidate, BuildError } from "./generator";
import { runSmokeTest } from "./smoke-test";
import { describeEffectKinds } from "./effects";

const REPO_ROOT = process.cwd();

function fail(msg: string, code = 1): never {
	console.error(`pinkacord: ${msg}`);
	process.exit(code);
}

function usage(): never {
	console.error("Usage:");
	console.error("  pinkacord build [modId]       Generate TS files, rebuild PS, run smoke test.");
	console.error("  pinkacord check [modId]       Validate content only (no writes, no PS rebuild).");
	console.error("  pinkacord smoke-test [modId]  Run smoke test against existing built state.");
	console.error("  pinkacord effects             List available effect kinds.");
	process.exit(2);
}

function rebuildPs(): void {
	console.log("  → rebuilding PS (esbuild → dist/) ...");
	execFileSync(process.execPath, ["build", "force"], {
		cwd: REPO_ROOT,
		stdio: "inherit",
	});
}

function cmdBuild(modId: string): void {
	console.log(`pinkacord build: mod="${modId}"`);
	try {
		const result = build(modId);
		console.log(`  ✓ validated content`);
		console.log(`  ✓ wrote ${result.written.length} files atomically:`);
		for (const w of result.written) console.log(`      - ${w}`);
		console.log(`  Stats: ${JSON.stringify(result.stats)}`);

		rebuildPs();

		console.log("  → running smoke test ...");
		const results = runSmokeTest(modId);
		const failed = results.filter((r) => !r.passed);
		for (const r of results) {
			const mark = r.warning ? "⚠" : (r.passed ? "✓" : "✗");
			console.log(`      ${mark} ${r.formatName} (${r.formatId})${r.warning ? " — format loads but canonical team can't satisfy its clauses" : ""}`);
			if (!r.passed || r.warning) console.log(`        ${r.stderr.split("\n").join("\n        ")}`);
		}
		if (failed.length > 0) {
			fail(`smoke test failed for ${failed.length} format(s): ${failed.map((r) => r.formatId).join(", ")}`);
		}
		console.log("\npinkacord: BUILD OK — content is live in data/mods/ + config/. To apply to a running server: /hotpatch formats && /hotpatch battles && /hotpatch teamvalidator");
	} catch (e: any) {
		if (e instanceof BuildError) {
			console.error(`\npinkacord: BUILD FAILED in ${e.file}`);
			for (const iss of e.issues) console.error(`  - ${iss}`);
			process.exit(1);
		}
		fail(e.message ?? String(e));
	}
}

function cmdCheck(modId: string): void {
	console.log(`pinkacord check: mod="${modId}"`);
	try {
		const content = loadAndValidate(modId);
		crossReferenceValidate(content);
		console.log(`  ✓ ${content.species.length} species, ${content.moves.length} moves, ${content.abilities.length} abilities, ${content.items.length} items, ${content.learnsets.length} learnsets, ${content.formats.length} formats`);
		console.log("pinkacord: CHECK OK");
	} catch (e: any) {
		if (e instanceof BuildError) {
			console.error(`\npinkacord: CHECK FAILED in ${e.file}`);
			for (const iss of e.issues) console.error(`  - ${iss}`);
			process.exit(1);
		}
		fail(e.message ?? String(e));
	}
}

function cmdSmokeTest(modId: string): void {
	console.log(`pinkacord smoke-test: mod="${modId}"`);
	const results = runSmokeTest(modId);
	const failed = results.filter((r) => !r.passed);
	for (const r of results) {
		const mark = r.warning ? "⚠" : (r.passed ? "✓" : "✗");
		console.log(`  ${mark} ${r.formatName} (${r.formatId})${r.warning ? " — clauses unsatisfiable by canonical team" : ""}`);
		if (!r.passed || r.warning) console.log(`      ${r.stderr.split("\n").join("\n      ")}`);
	}
	if (failed.length > 0) fail(`smoke test failed for ${failed.length} format(s)`);
	console.log("pinkacord: SMOKE TEST OK");
}

function cmdEffects(): void {
	console.log("Available effect kinds:\n");
	for (const e of describeEffectKinds()) {
		console.log(`  ${e.id}`);
		console.log(`    ${e.description}`);
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Argv dispatch
// ────────────────────────────────────────────────────────────────────────────

const [, , subcommand, ...rest] = process.argv;
const modId = rest[0] || "pinkacord";

switch (subcommand) {
	case "build": cmdBuild(modId); break;
	case "check": cmdCheck(modId); break;
	case "smoke-test": cmdSmokeTest(modId); break;
	case "effects": cmdEffects(); break;
	default: usage();
}
