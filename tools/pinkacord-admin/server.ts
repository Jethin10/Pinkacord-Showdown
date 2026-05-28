/**
 * Pinkacord admin panel — HTTP server.
 *
 * Single-process Node `http` server. Routes:
 *
 *   GET  /                          → admin SPA HTML
 *   POST /api/login                 → { password } → session cookie
 *   POST /api/logout                → clear session
 *   GET  /api/me                    → { authed: bool }
 *   GET  /api/effects               → list effect kinds (for ability form)
 *   GET  /api/species, /moves, /abilities, /items, /learnsets, /formats
 *   POST /api/<type>                → create
 *   GET  /api/<type>/:id
 *   PUT  /api/<type>/:id            → update (with optional If-Match: <rev>)
 *   DELETE /api/<type>/:id
 *   POST /api/build                 → run generator + PS rebuild + smoke test
 *   GET  /api/hotpatch              → commands string to paste in PS chat
 *   GET  /api/audit                 → last 100 audit entries
 *
 * All mutating endpoints require a `X-Pinkacord-Admin: 1` header (CSRF).
 * All endpoints except /, /api/login, /api/logout, /api/me require auth.
 */

import * as http from "http";
import * as path from "path";
import { execFileSync } from "child_process";

import { build as runGenerator, BuildError } from "../pinkacord/generator";
import { runSmokeTest } from "../pinkacord/smoke-test";
import { describeEffectKinds } from "../pinkacord/effects";
import {
	listAll, getOne, create, update, remove, getMeta,
	StoreError, type EntityType,
} from "./store";
import { appendAudit, tailAudit } from "./audit";
import {
	initAdminPassword, verifyPassword,
	createSession, destroySession, touchSession,
	isRateLimited, recordLoginAttempt, parseCookies, SESSION_COOKIE,
} from "./auth";
import { runHotpatch, isBotConfigured } from "./hotpatch";
import { abilitiesAll, movesAll, speciesAll, itemsAll, speciesDetailAll, movesDetailAll, learnsetFor, speciesForMod } from "./psdex";
import { parseAbilityDescription } from "./ability-nlp";
import { parseAbilityWithLLM, isLLMConfigured } from "./llm";
import { designMechanic } from "./mechanics-studio";
import { writeSpriteFromBase64, deleteSprite, hasSprite, spriteExtFor, spriteUrlFor, SpriteError } from "./sprites";
import { HTML, SCRIPT } from "./ui";

const PORT = Number(process.env.PINKACORD_ADMIN_PORT || 8001);
const BIND = process.env.PINKACORD_ADMIN_BIND || "127.0.0.1";
const PASSWORD = process.env.PINKACORD_ADMIN_PASSWORD || "";
const REPO_ROOT = process.cwd();
const MOD_ID = "pinkacord";
const ENTITY_TYPES: EntityType[] = ["species", "moves", "abilities", "items", "learnsets", "formats"];

if (!PASSWORD) {
	console.error("FATAL: PINKACORD_ADMIN_PASSWORD env var is required.");
	console.error("Example (PowerShell): $env:PINKACORD_ADMIN_PASSWORD = 'changeme123'; npm run pinkacord-admin");
	process.exit(1);
}
initAdminPassword(PASSWORD);

// ────────────────────────────────────────────────────────────────────────────
// Response helpers
// ────────────────────────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, body: object): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(body));
}
function sendHtml(res: http.ServerResponse, status: number, html: string): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "no-referrer");
	res.end(html);
}
function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		req.on("data", (c: Buffer) => {
			total += c.length;
			if (total > 1_000_000) { reject(new Error("body too large")); req.destroy(); return; }
			chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
function clientIp(req: http.IncomingMessage): string {
	const xf = req.headers["x-forwarded-for"];
	if (typeof xf === "string") return xf.split(",")[0].trim();
	return req.socket.remoteAddress || "?";
}
function requireAuth(req: http.IncomingMessage): { sid: string; displayName: string } | null {
	const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
	const sess = touchSession(sid);
	return sess ? { sid: sess.sid, displayName: sess.displayName } : null;
}
function requireCsrf(req: http.IncomingMessage): boolean {
	return req.headers["x-pinkacord-admin"] === "1";
}
function makeSetCookie(sid: string | ""): string {
	if (sid === "") return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
	return `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`;
}

// ────────────────────────────────────────────────────────────────────────────
// Route handlers
// ────────────────────────────────────────────────────────────────────────────

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
	const url = new URL(req.url || "/", "http://x");
	const method = (req.method || "GET").toUpperCase();
	const pathname = url.pathname;

	// Static / index
	if (method === "GET" && pathname === "/") {
		// Use a function replacer so $$ / $& / $` / $' in SCRIPT aren't
		// interpreted as String.prototype.replace special tokens — they'd
		// otherwise be mangled in the served HTML.
		return sendHtml(res, 200, HTML.replace("__SCRIPT_PLACEHOLDER__", () => SCRIPT));
	}

	// Browsers auto-request /favicon.ico on every page; respond 204 so it
	// doesn't pollute the console with 401s from the auth check below.
	if (method === "GET" && pathname === "/favicon.ico") {
		res.statusCode = 204;
		res.setHeader("Cache-Control", "public, max-age=86400");
		res.end();
		return;
	}

	if (method === "GET" && pathname === "/api/me") {
		const sess = requireAuth(req);
		return sendJson(res, 200, { ok: true, authed: !!sess, displayName: sess?.displayName ?? null, botConfigured: isBotConfigured() });
	}

	// Health endpoint — no auth, used by orchestrators (Fly.io, Docker, etc.)
	if (method === "GET" && (pathname === "/api/health" || pathname === "/health")) {
		const uptimeSec = Math.round(process.uptime());
		return sendJson(res, 200, { ok: true, uptimeSec, botConfigured: isBotConfigured() });
	}

	if (method === "POST" && pathname === "/api/login") {
		if (!requireCsrf(req)) return sendJson(res, 403, { ok: false, code: "csrf", message: "missing CSRF header" });
		const ip = clientIp(req);
		// Check rate limit (only counts previous failed attempts)
		if (isRateLimited(ip)) return sendJson(res, 429, { ok: false, code: "rate_limited", message: "Too many failed attempts. Wait a minute." });
		let body: any;
		try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, code: "bad_json", message: "invalid JSON" }); }
		if (!body || typeof body.password !== "string") return sendJson(res, 400, { ok: false, code: "bad_body", message: "password required" });
		if (!verifyPassword(body.password)) {
			recordLoginAttempt(ip);
			return sendJson(res, 401, { ok: false, code: "bad_credentials", message: "Wrong password." });
		}
		const displayName = (typeof body.displayName === "string" && body.displayName.trim()) ? body.displayName.trim().slice(0, 40) : "admin";
		const sid = createSession(displayName);
		res.setHeader("Set-Cookie", makeSetCookie(sid));
		appendAudit({ actor: displayName, action: "auth.login", meta: { ip } });
		return sendJson(res, 200, { ok: true, displayName });
	}

	if (method === "POST" && pathname === "/api/logout") {
		const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
		destroySession(sid);
		res.setHeader("Set-Cookie", makeSetCookie(""));
		return sendJson(res, 200, { ok: true });
	}

	// All routes beyond this point require auth + CSRF (for mutations).
	const sess = requireAuth(req);
	if (!sess) return sendJson(res, 401, { ok: false, code: "unauthenticated", message: "Sign in first." });
	if (method !== "GET" && !requireCsrf(req)) return sendJson(res, 403, { ok: false, code: "csrf", message: "missing CSRF header" });
	const actor = sess.displayName;

	// PS dex lookups (cached after first call). Used for autocomplete +
	// validation on the client. Read-only, auth-required so we don't leak
	// the list publicly but no body validation needed.
	if (method === "GET" && pathname === "/api/ps-dex/abilities") return sendJson(res, 200, { ok: true, items: abilitiesAll() });
	if (method === "GET" && pathname === "/api/ps-dex/moves") return sendJson(res, 200, { ok: true, items: movesAll() });
	if (method === "GET" && pathname === "/api/ps-dex/species") return sendJson(res, 200, { ok: true, items: speciesAll() });
	if (method === "GET" && pathname === "/api/ps-dex/items") return sendJson(res, 200, { ok: true, items: itemsAll() });
	if (method === "GET" && pathname === "/api/ps-dex/species-detail") return sendJson(res, 200, { ok: true, items: speciesDetailAll() });
	if (method === "GET" && pathname.startsWith("/api/ps-dex/species-by-mod/")) {
		const mod = decodeURIComponent(pathname.slice("/api/ps-dex/species-by-mod/".length));
		return sendJson(res, 200, { ok: true, items: speciesForMod(mod) });
	}
	if (method === "GET" && pathname === "/api/ps-dex/moves-detail") return sendJson(res, 200, { ok: true, items: movesDetailAll() });
	{
		const lm = pathname.match(/^\/api\/ps-dex\/learnset\/([a-z0-9-]+)$/i);
		if (method === "GET" && lm) return sendJson(res, 200, { ok: true, moves: learnsetFor(lm[1]) });
	}

	// NL ability parsing — pattern matcher (fast, free, instant, deterministic).
	if (method === "POST" && pathname === "/api/abilities/parse") {
		try {
			const body = JSON.parse(await readBody(req));
			if (typeof body.text !== "string") return sendJson(res, 400, { ok: false, code: "bad_body", message: "text is required" });
			const result = parseAbilityDescription(body.text);
			return sendJson(res, 200, { ok: true, ...result, llmAvailable: isLLMConfigured() });
		} catch (e: any) {
			return sendJson(res, 400, { ok: false, code: "bad_body", message: e.message ?? String(e) });
		}
	}

	// LLM ability parsing — handles arbitrary phrasing + novel abilities by
	// emitting raw handler code when no registry kind matches. Opt-in via
	// LLM_API_KEY env var (Groq is the default free provider).
	// Mechanic Studio — presets → patterns → AI (one-shot, no code for admins).
	if (method === "POST" && pathname === "/api/mechanics/design") {
		try {
			const body = JSON.parse(await readBody(req));
			if (typeof body.text !== "string") return sendJson(res, 400, { ok: false, code: "bad_body", message: "text is required" });
			const result = await designMechanic(body.text);
			return sendJson(res, 200, { ok: true, ...result });
		} catch (e: any) {
			return sendJson(res, 400, { ok: false, code: "bad_body", message: e.message ?? String(e) });
		}
	}

	if (method === "POST" && pathname === "/api/abilities/parse-ai") {
		try {
			const body = JSON.parse(await readBody(req));
			if (typeof body.text !== "string") return sendJson(res, 400, { ok: false, code: "bad_body", message: "text is required" });
			const outcome = await parseAbilityWithLLM(body.text);
			if (!outcome.ok) {
				const status = outcome.code === "not_configured" ? 400 : outcome.code === "rate_limited" ? 429 : outcome.code === "auth" ? 401 : 500;
				return sendJson(res, status, { ok: false, code: outcome.code, message: outcome.error });
			}
			return sendJson(res, 200, { ok: true, ...outcome.result, usage: outcome.usage });
		} catch (e: any) {
			return sendJson(res, 400, { ok: false, code: "bad_body", message: e.message ?? String(e) });
		}
	}

	if (method === "GET" && pathname === "/api/effects") {
		// Reshape effect descriptions for the UI — strip the Zod schema (not
		// JSON-serializable) and emit a flat list of param-field names instead.
		const effects = describeEffectKinds().map((e) => ({
			id: e.id,
			description: e.description,
			paramFields: paramFieldNames(e.paramsSchema),
		}));
		return sendJson(res, 200, { ok: true, effects });
	}

	if (method === "GET" && pathname === "/api/meta") {
		return sendJson(res, 200, { ok: true, meta: getMeta() });
	}

	// Sprite endpoints: /api/species/:id/sprite (POST, DELETE) and ./preview (GET binary)
	const spritePreviewMatch = pathname.match(/^\/api\/species\/([^/]+)\/sprite\/preview$/);
	if (spritePreviewMatch && method === "GET") {
		const speciesId = decodeURIComponent(spritePreviewMatch[1]);
		return handleSpritePreview(res, speciesId);
	}
	// Sprite gallery: /api/sprites — returns { id, name, hasSprite, ext } for every custom species
	if (method === "GET" && pathname === "/api/sprites") {
		try {
			const species = listAll("species");
			const items = species.map((s: any) => ({
				id: s.id,
				name: s.data && s.data.name,
				types: (s.data && s.data.types) || [],
				hasSprite: hasSprite(s.id),
				ext: spriteExtFor(s.id),
			}));
			return sendJson(res, 200, { ok: true, items });
		} catch (err) {
			return sendJson(res, 500, { ok: false, message: (err as Error).message });
		}
	}
	const spriteMatch = pathname.match(/^\/api\/species\/([^/]+)\/sprite$/);
	if (spriteMatch) {
		const speciesId = decodeURIComponent(spriteMatch[1]);
		return handleSprite(req, res, speciesId, method, actor);
	}

	// Entity CRUD: /api/{type} and /api/{type}/:id
	const entityMatch = pathname.match(/^\/api\/(species|moves|abilities|items|learnsets|formats)(?:\/(.+))?$/);
	if (entityMatch) {
		const type = entityMatch[1] as EntityType;
		const id = entityMatch[2] ? decodeURIComponent(entityMatch[2]) : null;
		return handleEntity(req, res, type, id, method, actor);
	}

	if (method === "POST" && pathname === "/api/build") return handleBuild(req, res, actor);
	if (method === "POST" && pathname === "/api/hotpatch") return handleHotpatch(req, res, actor);
	if (method === "GET" && pathname === "/api/hotpatch") {
		return sendJson(res, 200, {
			ok: true,
			botConfigured: isBotConfigured(),
			commands: ["/hotpatch formats", "/hotpatch battles", "/hotpatch teamvalidator"],
		});
	}
	if (method === "GET" && pathname === "/api/audit") {
		return sendJson(res, 200, { ok: true, entries: tailAudit(100) });
	}

	// Bulk export — single JSON dump of every content file. Useful for backup,
	// sharing a dex with another community, or migrating between deployments.
	// Read-only, so no CSRF concerns; auth still required.
	if (method === "GET" && pathname === "/api/export") {
		try {
			const fs = require("fs");
			const path = require("path");
			const root = path.join(REPO_ROOT, "content");
			const files = ["formats.json", "pinkacord-client.json"];
			const modFiles = ["meta.json", "pokedex.json", "moves.json", "abilities.json", "items.json", "learnsets.json"];
			const dump: any = { exportedAt: new Date().toISOString(), exportedBy: actor, formats: null, clientOverrides: null, mods: {} };
			for (const f of files) {
				const p = path.join(root, f);
				if (fs.existsSync(p)) {
					const data = JSON.parse(fs.readFileSync(p, "utf8"));
					if (f === "formats.json") dump.formats = data;
					else if (f === "pinkacord-client.json") dump.clientOverrides = data;
				}
			}
			const modDir = path.join(root, MOD_ID);
			if (fs.existsSync(modDir)) {
				dump.mods[MOD_ID] = {};
				for (const f of modFiles) {
					const p = path.join(modDir, f);
					if (fs.existsSync(p)) dump.mods[MOD_ID][f.replace(".json", "")] = JSON.parse(fs.readFileSync(p, "utf8"));
				}
			}
			res.setHeader("Content-Disposition", `attachment; filename="pinkacord-export-${new Date().toISOString().slice(0, 10)}.json"`);
			return sendJson(res, 200, { ok: true, ...dump });
		} catch (e: any) {
			return sendJson(res, 500, { ok: false, code: "internal", message: e.message ?? String(e) });
		}
	}

	return sendJson(res, 404, { ok: false, code: "not_found", message: pathname });
}

async function handleEntity(req: http.IncomingMessage, res: http.ServerResponse, type: EntityType, id: string | null, method: string, actor: string) {
	try {
		if (method === "GET" && id == null) {
			return sendJson(res, 200, { ok: true, items: listAll(type) });
		}
		if (method === "GET" && id != null) {
			return sendJson(res, 200, { ok: true, item: getOne(type, id) });
		}
		if (method === "POST" && id == null) {
			const body = JSON.parse(await readBody(req));
			delete body.__rev;
			const created = create(type, body, actor);
			return sendJson(res, 201, { ok: true, item: created });
		}
		if (method === "PUT" && id != null) {
			const body = JSON.parse(await readBody(req));
			const ifMatch = (req.headers["if-match"] as string | undefined) || body.__rev;
			delete body.__rev;
			const updated = update(type, id, body, ifMatch, actor);
			return sendJson(res, 200, { ok: true, item: updated });
		}
		if (method === "DELETE" && id != null) {
			const ifMatch = req.headers["if-match"] as string | undefined;
			remove(type, id, ifMatch, actor);
			return sendJson(res, 200, { ok: true });
		}
		return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: method });
	} catch (e: any) {
		if (e instanceof StoreError) {
			const status = e.code === "not_found" ? 404 : e.code === "validation" ? 400 : e.code === "conflict" ? 409 : 500;
			return sendJson(res, status, { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors });
		}
		return sendJson(res, 400, { ok: false, code: "bad_request", message: e.message ?? String(e) });
	}
}

async function handleBuild(_req: http.IncomingMessage, res: http.ServerResponse, actor: string) {
	try {
		const result = runGenerator(MOD_ID);
		// Rebuild PS so dist/ reflects the new generated TS files.
		execFileSync(process.execPath, ["build", "force"], { cwd: REPO_ROOT, stdio: "ignore" });
		const smoke = runSmokeTest(MOD_ID);
		const failed = smoke.filter((r) => !r.passed);
		appendAudit({ actor, action: "build", meta: { stats: result.stats, smokePassed: smoke.length - failed.length, smokeFailed: failed.length } });
		if (failed.length) {
			return sendJson(res, 500, { ok: false, code: "smoke_failed", message: "Smoke test failed", fieldErrors: failed.map((f) => `${f.formatName}: ${f.stderr}`) });
		}
		return sendJson(res, 200, { ok: true, stats: result.stats, smoke: smoke.map((s) => ({ id: s.formatId, passed: s.passed })), botConfigured: isBotConfigured() });
	} catch (e: any) {
		if (e instanceof BuildError) {
			return sendJson(res, 400, { ok: false, code: "build_failed", message: `${e.file}`, fieldErrors: e.issues });
		}
		return sendJson(res, 500, { ok: false, code: "internal", message: e.message ?? String(e) });
	}
}

async function handleHotpatch(_req: http.IncomingMessage, res: http.ServerResponse, actor: string) {
	const result = await runHotpatch();
	appendAudit({ actor, action: "hotpatch", meta: { mode: result.mode, applied: result.applied, errors: result.errors } });
	return sendJson(res, result.mode === "error" ? 500 : 200, { ok: result.mode !== "error", ...result });
}

async function handleSprite(req: http.IncomingMessage, res: http.ServerResponse, speciesId: string, method: string, actor: string) {
	// Confirm the species exists before letting an admin upload a sprite for it.
	try {
		getOne("species", speciesId);
	} catch {
		return sendJson(res, 404, { ok: false, code: "not_found", message: `species/${speciesId} does not exist` });
	}

	try {
		if (method === "GET") {
			return sendJson(res, 200, { ok: true, hasSprite: hasSprite(speciesId), url: spriteUrlFor(speciesId) });
		}
		if (method === "POST") {
			const body = JSON.parse(await readBody(req));
			if (typeof body.data !== "string") return sendJson(res, 400, { ok: false, code: "bad_body", message: "missing data (base64 string)" });
			const result = writeSpriteFromBase64(speciesId, body.data);
			appendAudit({ actor, action: "sprite.upload", id: speciesId, meta: { url: result.url } });
			return sendJson(res, 200, { ok: true, ...result });
		}
		if (method === "DELETE") {
			const removed = deleteSprite(speciesId);
			if (removed) appendAudit({ actor, action: "sprite.delete", id: speciesId });
			return sendJson(res, removed ? 200 : 404, { ok: removed, removed });
		}
		return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: method });
	} catch (e: any) {
		if (e instanceof SpriteError) {
			const status = e.code === "not_found" ? 404 : e.code === "too_large" ? 413 : 400;
			return sendJson(res, status, { ok: false, code: e.code, message: e.message });
		}
		return sendJson(res, 500, { ok: false, code: "internal", message: e.message ?? String(e) });
	}
}

/** Serves the sprite binary for the admin UI preview. Uses content/ as the source. */
function handleSpritePreview(res: http.ServerResponse, speciesId: string) {
	const fs = require("fs");
	const path = require("path");
	const dir = path.join(REPO_ROOT, "content", MOD_ID, "sprites");
	for (const ext of [".png", ".gif"]) {
		const file = path.join(dir, speciesId + ext);
		if (fs.existsSync(file)) {
			res.statusCode = 200;
			res.setHeader("Content-Type", ext === ".gif" ? "image/gif" : "image/png");
			res.setHeader("Cache-Control", "no-store");
			fs.createReadStream(file).pipe(res);
			return;
		}
	}
	res.statusCode = 404;
	res.end();
}

// Best-effort: walk a Zod schema and return its top-level param field names.
// We don't try to derive richer metadata — the form just renders each as a
// text input. Phase 3.5 will pipe richer hints through.
function paramFieldNames(schema: any): string[] {
	try {
		const shape = schema?._def?.shape ?? schema?.shape;
		if (shape && typeof shape === "object") {
			const s = typeof shape === "function" ? shape() : shape;
			return Object.keys(s);
		}
	} catch { /* fallthrough */ }
	return [];
}

// ────────────────────────────────────────────────────────────────────────────
// Boot
// ────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
	handle(req, res).catch((e) => {
		console.error("admin: unhandled", e);
		try { sendJson(res, 500, { ok: false, code: "internal", message: "internal error" }); } catch {}
	});
});

server.listen(PORT, BIND, () => {
	console.log(`pinkacord-admin: listening on http://${BIND}:${PORT}/`);
	console.log(`  entity types: ${ENTITY_TYPES.join(", ")}`);
	console.log(`  bind is localhost-only by default; put behind a firewall/VPN before exposing.`);
});

process.on("SIGINT", () => { console.log("\npinkacord-admin: shutting down"); server.close(() => process.exit(0)); });
