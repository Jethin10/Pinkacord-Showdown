/**
 * Pinkacord admin — bot-account hotpatch client.
 *
 * Optional. When PINKACORD_BOT_USERNAME and PINKACORD_BOT_PASSWORD are set,
 * the admin panel opens a short-lived WebSocket to the PS server, logs in as
 * the configured bot, and issues:
 *   /hotpatch formats
 *   /hotpatch battles
 *   /hotpatch teamvalidator
 *
 * Then disconnects. The bot account must already be:
 *   - registered on the configured login server (play.pokemonshowdown.com by default), AND
 *   - listed as Administrator (~) in config/usergroups.csv on the PS server
 *
 * If the env vars aren't set, runHotpatch() short-circuits with a "not
 * configured" result that the API surfaces to the UI so it can show the
 * manual paste fallback.
 *
 * Zero new deps — uses Node 22+ built-in WebSocket and fetch globals.
 *
 * Protocol summary (PS chat protocol over raw WebSocket):
 *   ← |challstr|4|<long random string>
 *   →  POST <login server>/api/login   {name, pass, challstr}  →  {assertion}
 *   → |/trn USERNAME,0,ASSERTION
 *   ← |updateuser| ... (confirms login)
 *   → |/hotpatch formats
 *   ← responses include "Hotpatched" or error
 *   → |/hotpatch battles
 *   → |/hotpatch teamvalidator
 */

const PS_WS_HOST = process.env.PINKACORD_PS_HOST || "127.0.0.1";
const PS_WS_PORT = process.env.PINKACORD_PS_PORT || "8000";
const LOGIN_URL = process.env.PINKACORD_LOGIN_URL || "https://play.pokemonshowdown.com/api/login";
const BOT_USER = process.env.PINKACORD_BOT_USERNAME || "";
const BOT_PASS = process.env.PINKACORD_BOT_PASSWORD || "";
const TIMEOUT_MS = Number(process.env.PINKACORD_HOTPATCH_TIMEOUT_MS || 15_000);

const HOTPATCH_COMMANDS = ["formats", "battles", "teamvalidator"] as const;

export interface HotpatchResult {
	mode: "auto" | "manual" | "error";
	applied: string[];      // commands successfully acked by PS
	errors: string[];       // commands rejected / failed
	rawResponses: string[]; // raw lines from PS for debugging
	message: string;        // human-readable summary for UI
}

const MANUAL_INSTRUCTIONS =
	"Bot account not configured. After build, paste these into your PS server " +
	"to apply: /hotpatch formats && /hotpatch battles && /hotpatch teamvalidator";

export function isBotConfigured(): boolean {
	return !!(BOT_USER && BOT_PASS);
}

export async function runHotpatch(): Promise<HotpatchResult> {
	if (!isBotConfigured()) {
		return { mode: "manual", applied: [], errors: [], rawResponses: [], message: MANUAL_INSTRUCTIONS };
	}

	try {
		const result = await runWithTimeout(doHotpatch(), TIMEOUT_MS);
		return result;
	} catch (e: any) {
		return {
			mode: "error",
			applied: [],
			errors: [e.message ?? String(e)],
			rawResponses: [],
			message: `Bot hotpatch failed: ${e.message ?? String(e)}. Falling back to manual: ${MANUAL_INSTRUCTIONS}`,
		};
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────────────

async function doHotpatch(): Promise<HotpatchResult> {
	const wsUrl = `ws://${PS_WS_HOST}:${PS_WS_PORT}/showdown/websocket`;
	// Node 22+ has WebSocket as a global. If not available we fail fast with a
	// readable error.
	if (typeof (globalThis as any).WebSocket === "undefined") {
		throw new Error("Node 22+ required (no global WebSocket available)");
	}
	const WS = (globalThis as any).WebSocket as typeof WebSocket;
	const ws = new WS(wsUrl);

	const responses: string[] = [];
	const applied: string[] = [];
	const errors: string[] = [];

	// Collected to settle promises below.
	let resolveChallstr: ((s: string) => void) | null = null;
	const challstrPromise = new Promise<string>((res) => { resolveChallstr = res; });

	let resolveLoggedIn: (() => void) | null = null;
	const loggedInPromise = new Promise<void>((res) => { resolveLoggedIn = res; });

	ws.onmessage = (event: any) => {
		const text: string = typeof event.data === "string" ? event.data : event.data.toString();
		// PS sends multiple messages joined by \n.
		for (const rawLine of text.split("\n")) {
			if (!rawLine) continue;
			responses.push(rawLine);
			// |challstr|<challstr>
			const challMatch = rawLine.match(/^\|challstr\|(.+)$/);
			if (challMatch && resolveChallstr) {
				resolveChallstr(challMatch[1]);
				resolveChallstr = null;
				continue;
			}
			// |updateuser|*username|1|... means we are now logged in (the *1* = registered)
			if (rawLine.startsWith("|updateuser|") && resolveLoggedIn) {
				const parts = rawLine.split("|");
				const named = parts[3];
				if (named === "1") {
					resolveLoggedIn();
					resolveLoggedIn = null;
				}
				continue;
			}
			// Error responses to /hotpatch usually start with "|raw|" or appear as room messages.
			// We surface them in rawResponses; failure detection happens after we send all commands.
		}
	};

	ws.onerror = (e: any) => {
		errors.push(`WS error: ${e.message ?? "unknown"}`);
	};

	// Wait for ws open.
	await new Promise<void>((resolve, reject) => {
		ws.onopen = () => resolve();
		// onerror also handled above; add a one-shot rejection.
		const failNow = (e: any) => reject(new Error(`ws connect failed: ${e?.message ?? e ?? "unknown"}`));
		ws.addEventListener("error", failNow, { once: true });
	});

	// Receive challstr.
	const challstr = await challstrPromise;

	// POST to login server.
	const assertion = await loginForAssertion(BOT_USER, BOT_PASS, challstr);

	// Send /trn to identify.
	ws.send(`|/trn ${BOT_USER},0,${assertion}`);
	await loggedInPromise;

	// Issue hotpatch commands. PS replies asynchronously; we wait briefly after
	// each to collect responses before sending the next.
	for (const which of HOTPATCH_COMMANDS) {
		const before = responses.length;
		ws.send(`|/hotpatch ${which}`);
		await sleep(500);
		const newLines = responses.slice(before);
		// PS's hotpatch confirmations look like:
		//   "<symbol>... Hotpatched ..."  or  raw success lines
		// Errors include "/hotpatch was unsuccessful" or "Access denied".
		const denied = newLines.some((l) => /access denied|requires|need.*rank|cannot/i.test(l));
		const failed = newLines.some((l) => /unsuccessful|error|failed/i.test(l)) && !newLines.some((l) => /hotpatch/i.test(l));
		if (denied) {
			errors.push(`/hotpatch ${which}: access denied (is the bot an Administrator in usergroups.csv?)`);
		} else if (failed) {
			errors.push(`/hotpatch ${which}: rejected by PS`);
		} else {
			applied.push(which);
		}
	}

	try { ws.close(); } catch { /* best effort */ }

	const ok = applied.length === HOTPATCH_COMMANDS.length && errors.length === 0;
	return {
		mode: ok ? "auto" : "error",
		applied,
		errors,
		rawResponses: responses,
		message: ok
			? `Auto-applied: ${applied.join(", ")}`
			: `Applied ${applied.length}/${HOTPATCH_COMMANDS.length} commands; ${errors.length} error(s)`,
	};
}

async function loginForAssertion(name: string, pass: string, challstr: string): Promise<string> {
	const body = new URLSearchParams({
		act: "login",
		name,
		pass,
		challstr,
	});
	const res = await fetch(LOGIN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	if (!res.ok) throw new Error(`login server ${res.status}`);
	let text = await res.text();
	// PS prefixes its JSON responses with `]` to prevent JSON hijacking via <script>.
	if (text.startsWith("]")) text = text.slice(1);
	let json: any;
	try { json = JSON.parse(text); } catch { throw new Error(`login server returned non-JSON: ${text.slice(0, 100)}`); }
	if (!json.assertion) {
		const reason = json.error || json.actionerror || "unknown";
		throw new Error(`login failed: ${reason}`);
	}
	return json.assertion;
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function runWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`hotpatch timed out after ${ms}ms`)), ms);
		p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
	});
}
