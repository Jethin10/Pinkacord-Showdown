/**
 * Pinkacord admin panel — audit log.
 *
 * Append-only JSONL at logs/pinkacord/audit.jsonl. One line per admin action.
 * The store calls appendAudit on every successful mutation.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = process.cwd();
const LOG_DIR = path.join(REPO_ROOT, "logs", "pinkacord");
const LOG_FILE = path.join(LOG_DIR, "audit.jsonl");

export interface AuditEntry {
	ts: string;
	actor: string;
	action: string; // e.g. "species.create", "species.update", "build"
	id?: string;
	/** Field-level diff for updates; before=null for create, after=null for delete. */
	before?: unknown;
	after?: unknown;
	/** Free-form metadata, e.g. build stats. */
	meta?: Record<string, unknown>;
}

export function appendAudit(entry: Omit<AuditEntry, "ts">): void {
	fs.mkdirSync(LOG_DIR, { recursive: true });
	const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
	fs.appendFileSync(LOG_FILE, line, "utf8");
}

/** Read the last N lines of the audit log (newest first). */
export function tailAudit(n: number): AuditEntry[] {
	if (!fs.existsSync(LOG_FILE)) return [];
	// Simple read-all-then-slice. Audit volume is tiny for our scale (a few
	// edits per day). If this ever grows past 10MB we'll switch to a reverse
	// streaming reader; not worth the complexity today.
	const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
	const tail = lines.slice(-n).reverse();
	const result: AuditEntry[] = [];
	for (const line of tail) {
		try { result.push(JSON.parse(line) as AuditEntry); } catch { /* skip malformed */ }
	}
	return result;
}
