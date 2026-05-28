#!/usr/bin/env node
/**
 * Pinkacord client-overlay CLI. Parallels tools/pinkacord/cli.ts.
 */

import { build } from "./generator";
import { BuildError } from "../pinkacord/generator";

function fail(msg: string, code = 1): never {
	console.error(`pinkacord-client: ${msg}`);
	process.exit(code);
}

function usage(): never {
	console.error("Usage: pinkacord-client build [modId]");
	process.exit(2);
}

const [, , subcommand, ...rest] = process.argv;
const modId = rest[0] || "pinkacord";

if (subcommand === "build") {
	console.log(`pinkacord-client build: mod="${modId}"`);
	try {
		const result = build(modId);
		console.log(`  ✓ wrote ${result.outputPath} (${result.bytes} bytes)`);
		console.log(`  Stats: ${JSON.stringify(result.stats)}`);
		console.log(`  ✓ copied to server/static/pinkacord-overlay.js`);
		console.log("\nThe overlay is now served at /pinkacord-overlay.js from your PS server.");
		console.log("Load it in your client HTML with: <script src=\"/pinkacord-overlay.js\"></script>");
	} catch (e: any) {
		if (e instanceof BuildError) {
			console.error(`\npinkacord-client: BUILD FAILED in ${e.file}`);
			for (const iss of e.issues) console.error(`  - ${iss}`);
			process.exit(1);
		}
		fail(e.message ?? String(e));
	}
} else {
	usage();
}
