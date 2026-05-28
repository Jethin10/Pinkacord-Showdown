#!/usr/bin/env node
/**
 * Pinkacord launcher.
 *
 * Spawns the PS server and the admin panel as child processes, prefixes
 * their stdout/stderr with [ps] / [admin], and shuts both down cleanly on
 * SIGINT / SIGTERM. This is what runs as the container ENTRYPOINT in
 * production deployments — Docker / Fly.io / Render see this as PID 1.
 *
 * Why a tiny custom launcher instead of pm2/supervisord: zero new
 * dependencies, < 100 lines we own, predictable signal handling, and we
 * don't need most of what process managers offer (we don't have many
 * processes, we don't need clustering, we don't need a remote control
 * socket).
 *
 * Plain CommonJS so it runs from `node tools/launcher.js` without any
 * build step.
 */

"use strict";

const child_process = require("child_process");
const path = require("path");
const fs = require("fs");

const REPO_ROOT = process.cwd();
const NODE = process.execPath;

// ────────────────────────────────────────────────────────────────────────────
// .env loader (no dotenv dep)
// ────────────────────────────────────────────────────────────────────────────

(function loadEnv() {
	const envPath = path.join(REPO_ROOT, ".env");
	if (!fs.existsSync(envPath)) return;
	for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const i = trimmed.indexOf("=");
		if (i < 0) continue;
		const key = trimmed.slice(0, i).trim();
		let val = trimmed.slice(i + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		if (process.env[key] === undefined) process.env[key] = val;
	}
})();

// ────────────────────────────────────────────────────────────────────────────
// Required state checks before we spawn anything
// ────────────────────────────────────────────────────────────────────────────

if (!process.env.PINKACORD_ADMIN_PASSWORD) {
	console.error("[launcher] FATAL: PINKACORD_ADMIN_PASSWORD is required.");
	console.error("[launcher] Set it in your environment or a .env file (see .env.example).");
	process.exit(1);
}

// Ensure dist/ exists — needed for both processes.
if (!fs.existsSync(path.join(REPO_ROOT, "dist"))) {
	console.log("[launcher] dist/ missing; running node build force ...");
	child_process.execFileSync(NODE, ["build", "force"], { cwd: REPO_ROOT, stdio: "inherit" });
}

const ADMIN_ENTRY = path.join(REPO_ROOT, "dist", "tools", "pinkacord-admin", "server.js");
if (!fs.existsSync(ADMIN_ENTRY)) {
	console.error("[launcher] FATAL: admin server bundle missing at " + ADMIN_ENTRY);
	console.error("[launcher] Run `node build force` first.");
	process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Spawning helpers
// ────────────────────────────────────────────────────────────────────────────

function spawnChild(label, command, args) {
	const child = child_process.spawn(command, args, {
		cwd: REPO_ROOT,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const prefix = "[" + label + "] ";
	const pipe = (stream, sink) => {
		let buf = "";
		stream.setEncoding("utf8");
		stream.on("data", (chunk) => {
			buf += chunk;
			const lines = buf.split("\n");
			buf = lines.pop() ?? "";
			for (const line of lines) sink.write(prefix + line + "\n");
		});
		stream.on("end", () => { if (buf) sink.write(prefix + buf + "\n"); });
	};
	pipe(child.stdout, process.stdout);
	pipe(child.stderr, process.stderr);
	return child;
}

// ────────────────────────────────────────────────────────────────────────────
// Start the two services
// ────────────────────────────────────────────────────────────────────────────

// Render sets PORT=10000 and routes external traffic there.
// Use PORT if set (Render), otherwise fall back to PINKACORD_PS_PORT or 8000.
const psPort = process.env.PORT || process.env.PINKACORD_PS_PORT || "8000";
const adminPort = process.env.PINKACORD_ADMIN_PORT || "8001";

let shuttingDown = false;
const children = new Set();

function wireExit(label, child) {
	children.add(child);
	child.on("exit", (code, signal) => {
		console.log("[launcher] " + label + " exited (code=" + code + ", signal=" + signal + ")");
		children.delete(child);
		if (!shuttingDown) {
			// If a critical child dies during normal operation, we tear down
			// the rest. A naive auto-restart would mask underlying problems.
			shutdown(1);
		}
	});
	child.on("error", (err) => {
		console.error("[launcher] " + label + " spawn error:", err.message);
		shutdown(1);
	});
}

function shutdown(code) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log("[launcher] shutting down (" + children.size + " child processes)");
	for (const c of children) {
		try { c.kill("SIGTERM"); } catch { /* already dead */ }
	}
	// Give them 5 seconds to exit cleanly, then force-kill.
	setTimeout(() => {
		for (const c of children) {
			try { c.kill("SIGKILL"); } catch { /* already dead */ }
		}
		process.exit(code);
	}, 5000).unref();
}

console.log("[launcher] starting PS server on " + psPort + " and admin panel on " + adminPort);
const ps = spawnChild("ps", NODE, ["pokemon-showdown", psPort]);
wireExit("ps", ps);
// Give PS a brief head start so the admin's first health-check sees it up.
setTimeout(() => {
	const admin = spawnChild("admin", NODE, [ADMIN_ENTRY]);
	wireExit("admin", admin);
}, 1500);

process.on("SIGINT", () => { console.log("\n[launcher] SIGINT"); shutdown(0); });
process.on("SIGTERM", () => { console.log("\n[launcher] SIGTERM"); shutdown(0); });
