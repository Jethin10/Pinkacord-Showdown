/**
 * Pinkacord admin panel — auth.
 *
 * Single shared admin password. Hashed once at startup with scrypt. Sessions
 * are random 256-bit ids stored in memory and set as HttpOnly + SameSite=Strict
 * cookies. CSRF protection via a mandatory custom request header.
 */

import * as crypto from "crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SCRYPT_KEYLEN = 64;
// Cost 2^14 stays within Node's default 32MB scrypt memory budget while still
// being expensive (~50ms per attempt). Combined with the per-IP rate limit
// it's plenty for a single-admin tool.
const SCRYPT_COST = 2 ** 14;

interface Session {
	sid: string;
	displayName: string;
	createdAt: number;
	lastUsed: number;
}

const sessions = new Map<string, Session>();

let adminHash: Buffer | null = null;
let adminSalt: Buffer | null = null;

/** Set once at startup from PINKACORD_ADMIN_PASSWORD. */
export function initAdminPassword(password: string): void {
	if (!password || password.length < 8) {
		throw new Error("PINKACORD_ADMIN_PASSWORD must be set and >= 8 chars");
	}
	adminSalt = crypto.randomBytes(16);
	adminHash = crypto.scryptSync(password, adminSalt, SCRYPT_KEYLEN, { cost: SCRYPT_COST });
}

export function verifyPassword(attempt: string): boolean {
	if (!adminHash || !adminSalt) return false;
	const candidate = crypto.scryptSync(attempt, adminSalt, SCRYPT_KEYLEN, { cost: SCRYPT_COST });
	return crypto.timingSafeEqual(candidate, adminHash);
}

export function createSession(displayName: string): string {
	const sid = crypto.randomBytes(32).toString("base64url");
	const now = Date.now();
	sessions.set(sid, { sid, displayName, createdAt: now, lastUsed: now });
	return sid;
}

export function destroySession(sid: string | undefined): void {
	if (!sid) return;
	sessions.delete(sid);
}

export function touchSession(sid: string | undefined): Session | null {
	if (!sid) return null;
	const s = sessions.get(sid);
	if (!s) return null;
	const now = Date.now();
	if (now - s.lastUsed > SESSION_TTL_MS) {
		sessions.delete(sid);
		return null;
	}
	s.lastUsed = now;
	return s;
}

// ────────────────────────────────────────────────────────────────────────────
// Rate limit for login attempts
// ────────────────────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const loginAttempts = new Map<string, number[]>();

export function isRateLimited(ipKey: string): boolean {
	const now = Date.now();
	const arr = (loginAttempts.get(ipKey) || []).filter((t) => now - t < RATE_WINDOW_MS);
	loginAttempts.set(ipKey, arr);
	return arr.length >= RATE_MAX;
}

export function recordLoginAttempt(ipKey: string): void {
	const now = Date.now();
	const arr = (loginAttempts.get(ipKey) || []).filter((t) => now - t < RATE_WINDOW_MS);
	arr.push(now);
	loginAttempts.set(ipKey, arr);
}

// ────────────────────────────────────────────────────────────────────────────
// Cookie helpers
// ────────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "pinkacord_session";

export function parseCookies(header: string | undefined): Record<string, string> {
	if (!header) return {};
	const out: Record<string, string> = {};
	for (const pair of header.split(/;\s*/)) {
		const i = pair.indexOf("=");
		if (i < 0) continue;
		out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
	}
	return out;
}
