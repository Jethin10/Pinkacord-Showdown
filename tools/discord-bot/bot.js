#!/usr/bin/env node
/**
 * Pinkacord — Discord bridge bot.
 *
 * A standalone, opt-in companion to the PS server. Connects to PS as a
 * registered user (must have at least Voice rank in any rooms it watches),
 * listens for tournament protocol messages, and forwards a tidy summary to
 * a Discord channel via a webhook.
 *
 * Zero new deps — Node 22+ provides WebSocket and fetch as globals.
 *
 * What it forwards (configurable in CONFIG below):
 *   - Tournament created
 *   - Tournament started
 *   - Round X battles
 *   - Tournament winner
 *
 * What it does NOT do (deferred to future polish):
 *   - Two-way chat bridge (Discord messages → PS chat)
 *   - Replay link enrichment
 *   - Slash-command tournament creation from Discord
 *
 * Run as: `node tools/discord-bot/bot.js`
 * Configure via env vars (see README in this directory).
 */

"use strict";

const REPO_ROOT = process.cwd();

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const CONFIG = {
	psHost: process.env.PINKACORD_PS_HOST || "127.0.0.1",
	psPort: process.env.PINKACORD_PS_PORT || "8000",
	loginUrl: process.env.PINKACORD_LOGIN_URL || "https://play.pokemonshowdown.com/api/login",
	botUser: process.env.PINKACORD_BOT_USERNAME || "",
	botPass: process.env.PINKACORD_BOT_PASSWORD || "",
	// Rooms (PS roomids) the bot should join + forward events from. Comma-separated.
	watchRooms: (process.env.PINKACORD_BOT_WATCH_ROOMS || "lobby").split(",").map((s) => s.trim()).filter(Boolean),
	discordWebhook: process.env.DISCORD_WEBHOOK_URL || "",
	// Backoff caps: min 1s, exponential to 60s.
	backoffMinMs: 1000,
	backoffMaxMs: 60_000,
};

if (!CONFIG.botUser || !CONFIG.botPass) {
	console.error("[bot] FATAL: PINKACORD_BOT_USERNAME and PINKACORD_BOT_PASSWORD are required.");
	console.error("[bot] See tools/discord-bot/README.md for setup.");
	process.exit(1);
}
if (!CONFIG.discordWebhook) {
	console.error("[bot] FATAL: DISCORD_WEBHOOK_URL is required.");
	process.exit(1);
}
if (typeof WebSocket === "undefined") {
	console.error("[bot] FATAL: Node 22+ required (no global WebSocket).");
	process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Discord forwarder
// ────────────────────────────────────────────────────────────────────────────

const recentByKey = new Map(); // simple dedupe — same key fired twice in 5s is squashed

async function sendDiscord(content) {
	try {
		const r = await fetch(CONFIG.discordWebhook, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content }),
		});
		if (!r.ok) console.warn("[bot] discord webhook " + r.status + ": " + (await r.text()).slice(0, 200));
	} catch (e) {
		console.warn("[bot] discord webhook error:", e.message);
	}
}

function maybeForward(key, message) {
	const now = Date.now();
	const last = recentByKey.get(key) || 0;
	if (now - last < 5000) return;
	recentByKey.set(key, now);
	// Garbage-collect old entries opportunistically.
	if (recentByKey.size > 100) {
		for (const [k, t] of recentByKey) if (now - t > 60_000) recentByKey.delete(k);
	}
	sendDiscord(message);
}

// ────────────────────────────────────────────────────────────────────────────
// PS protocol — tournament line parser
//
// PS lines for tournaments look roughly like:
//   |tournament|create|gen9ou|Elimination|32
//   |tournament|update|{json}
//   |tournament|start
//   |tournament|end|{json}
// We translate the actionable ones into Discord pings.
// ────────────────────────────────────────────────────────────────────────────

function handleTournamentLine(room, parts) {
	const verb = parts[2];
	switch (verb) {
		case "create": {
			const [, , , format, type, size] = parts;
			maybeForward(room + ":create", "🏆 Tournament started in **" + room + "** — format: `" + format + "`, type: " + type + ", size: " + (size || "?"));
			return;
		}
		case "start":
			maybeForward(room + ":start", "▶️ Tournament in **" + room + "** is starting now.");
			return;
		case "end": {
			let payload = null;
			try { payload = JSON.parse(parts.slice(3).join("|") || "null"); } catch { /* ignore */ }
			const winner = payload && payload.results && payload.results[0] && payload.results[0][0];
			maybeForward(room + ":end", "🥇 Tournament in **" + room + "** has ended" + (winner ? ". Winner: **" + winner + "**" : "."));
			return;
		}
		case "battlestart": {
			const [, , , p1, p2, battleroom] = parts;
			if (p1 && p2 && battleroom) {
				maybeForward(room + ":battle:" + battleroom, "⚔️ " + p1 + " vs " + p2 + " — <https://play.pokemonshowdown.com/" + battleroom + ">");
			}
			return;
		}
	}
}

// ────────────────────────────────────────────────────────────────────────────
// WS client with reconnect/backoff
// ────────────────────────────────────────────────────────────────────────────

let backoff = CONFIG.backoffMinMs;
let stopping = false;

async function loginForAssertion(challstr) {
	const body = new URLSearchParams({ act: "login", name: CONFIG.botUser, pass: CONFIG.botPass, challstr });
	const res = await fetch(CONFIG.loginUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	if (!res.ok) throw new Error("login server " + res.status);
	let text = await res.text();
	if (text.startsWith("]")) text = text.slice(1);
	const json = JSON.parse(text);
	if (!json.assertion) throw new Error("login failed: " + (json.error || "unknown"));
	return json.assertion;
}

function connect() {
	if (stopping) return;
	const url = "ws://" + CONFIG.psHost + ":" + CONFIG.psPort + "/showdown/websocket";
	console.log("[bot] connecting to " + url + " ...");
	const ws = new WebSocket(url);
	let currentRoom = ""; // PS prefixes room-scoped lines with ">roomid"; we track it

	ws.onopen = () => { console.log("[bot] ws open"); };
	ws.onerror = (e) => { console.warn("[bot] ws error:", (e && e.message) || "?"); };
	ws.onclose = () => {
		console.log("[bot] ws closed; reconnecting in " + Math.round(backoff / 1000) + "s");
		if (stopping) return;
		setTimeout(connect, backoff);
		backoff = Math.min(backoff * 2, CONFIG.backoffMaxMs);
	};

	ws.onmessage = async (event) => {
		const text = typeof event.data === "string" ? event.data : event.data.toString();
		for (const rawLine of text.split("\n")) {
			if (!rawLine) continue;
			// Room scope marker like ">tournaments"
			if (rawLine.startsWith(">")) { currentRoom = rawLine.slice(1); continue; }
			const parts = rawLine.split("|");
			// Connection challenge — log in.
			if (parts[1] === "challstr") {
				try {
					const assertion = await loginForAssertion(parts[2]);
					ws.send("|/trn " + CONFIG.botUser + ",0," + assertion);
				} catch (e) {
					console.error("[bot] login error:", e.message);
					ws.close();
				}
				continue;
			}
			// |updateuser|*name|1|... = registered login confirmed.
			if (parts[1] === "updateuser" && parts[3] === "1") {
				backoff = CONFIG.backoffMinMs;
				console.log("[bot] logged in as " + parts[2]);
				for (const room of CONFIG.watchRooms) ws.send("|/join " + room);
				sendDiscord("✅ Pinkacord bot connected and watching: " + CONFIG.watchRooms.join(", "));
				continue;
			}
			if (parts[1] === "tournament") {
				handleTournamentLine(currentRoom || "(no-room)", parts);
				continue;
			}
		}
	};
}

connect();

process.on("SIGINT", () => { stopping = true; console.log("\n[bot] shutting down"); process.exit(0); });
process.on("SIGTERM", () => { stopping = true; console.log("\n[bot] SIGTERM"); process.exit(0); });
