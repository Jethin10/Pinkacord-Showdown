/**
 * Pinkacord admin — GitHub publish client (hosted mode).
 *
 * On free-tier hosts there is no shared/persistent disk: the admin panel and
 * the PS server each run from an image built off the GitHub repo, and any
 * file written at runtime evaporates on restart. So "publishing" a content
 * change means committing it back to GitHub — Render then auto-builds and
 * deploys the new image, and the change becomes permanent and live.
 *
 * Uses the Git Data API (blobs → tree → commit → ref) so a publish with many
 * changed files is ONE atomic commit. Only files under content/ are touched;
 * everything else in the tree is inherited via base_tree.
 *
 * Env:
 *   PINKACORD_GITHUB_TOKEN (or GITHUB_TOKEN) — token with repo write access
 *   PINKACORD_GITHUB_REPO   — "owner/name", e.g. Jethin10/Pinkacord-Showdown
 *   PINKACORD_GITHUB_BRANCH — deploy branch (default "main")
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const TOKEN = process.env.PINKACORD_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const REPO = process.env.PINKACORD_GITHUB_REPO || "";
const BRANCH = process.env.PINKACORD_GITHUB_BRANCH || "main";
const API = "https://api.github.com";
const CONTENT_PREFIX = "content/";

export function isPublishConfigured(): boolean {
	return !!(TOKEN && REPO);
}

export interface DriftFile {
	path: string;
	status: "added" | "modified" | "deleted";
}
export interface Drift {
	headSha: string;
	changed: DriftFile[];
}
export interface PublishResult {
	sha: string;
	url: string;
	changed: DriftFile[];
}

export class PublishError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

async function gh(method: string, apiPath: string, body?: object): Promise<any> {
	const res = await fetch(API + apiPath, {
		method,
		headers: {
			"authorization": `Bearer ${TOKEN}`,
			"accept": "application/vnd.github+json",
			"user-agent": "pinkacord-admin",
			...(body ? { "content-type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new PublishError(
			res.status === 401 || res.status === 403 ? "github_auth" : "github_api",
			`GitHub ${method} ${apiPath} → ${res.status}: ${text.slice(0, 300)}`
		);
	}
	return res.status === 204 ? null : res.json();
}

/** git blob sha1: sha1("blob <len>\0" + bytes) — lets us diff without uploading. */
function gitBlobSha(buf: Buffer): string {
	const h = crypto.createHash("sha1");
	h.update(`blob ${buf.length}\0`);
	h.update(buf);
	return h.digest("hex");
}

function listLocalContentFiles(repoRoot: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const f of fs.readdirSync(dir)) {
			const full = path.join(dir, f);
			if (fs.statSync(full).isDirectory()) walk(full);
			else out.push(path.relative(repoRoot, full).split(path.sep).join("/"));
		}
	};
	const contentDir = path.join(repoRoot, "content");
	if (fs.existsSync(contentDir)) walk(contentDir);
	return out;
}

async function fetchRemoteState(): Promise<{ headSha: string; treeSha: string; contentShas: Map<string, string> }> {
	const branch = await gh("GET", `/repos/${REPO}/branches/${encodeURIComponent(BRANCH)}`);
	const headSha = branch.commit.sha as string;
	const treeSha = branch.commit.commit.tree.sha as string;
	const tree = await gh("GET", `/repos/${REPO}/git/trees/${treeSha}?recursive=1`);
	const contentShas = new Map<string, string>();
	for (const entry of tree.tree as Array<{ path: string; type: string; sha: string }>) {
		if (entry.type === "blob" && entry.path.startsWith(CONTENT_PREFIX)) {
			contentShas.set(entry.path, entry.sha);
		}
	}
	return { headSha, treeSha, contentShas };
}

/** What differs between local content/ and the deploy branch. */
export async function computeDrift(repoRoot: string): Promise<Drift> {
	if (!isPublishConfigured()) throw new PublishError("not_configured", "GitHub publish is not configured");
	const remote = await fetchRemoteState();
	const localFiles = listLocalContentFiles(repoRoot);
	const changed: DriftFile[] = [];
	const localSet = new Set(localFiles);
	for (const rel of localFiles) {
		const buf = fs.readFileSync(path.join(repoRoot, rel));
		const remoteSha = remote.contentShas.get(rel);
		if (!remoteSha) changed.push({ path: rel, status: "added" });
		else if (remoteSha !== gitBlobSha(buf)) changed.push({ path: rel, status: "modified" });
	}
	for (const remotePath of remote.contentShas.keys()) {
		if (!localSet.has(remotePath)) changed.push({ path: remotePath, status: "deleted" });
	}
	return { headSha: remote.headSha, changed };
}

/**
 * Commit every drifted content/ file to the deploy branch as one commit.
 * Returns the new commit sha (Render auto-deploys it).
 */
export async function publishContent(repoRoot: string, actor: string, summary?: string): Promise<PublishResult> {
	if (!isPublishConfigured()) throw new PublishError("not_configured", "GitHub publish is not configured");

	const remote = await fetchRemoteState();
	const localFiles = listLocalContentFiles(repoRoot);
	const localSet = new Set(localFiles);

	const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
	const changed: DriftFile[] = [];

	for (const rel of localFiles) {
		const buf = fs.readFileSync(path.join(repoRoot, rel));
		const localSha = gitBlobSha(buf);
		const remoteSha = remote.contentShas.get(rel);
		if (remoteSha === localSha) continue;
		// Upload blob (base64 handles binary sprites and text alike).
		const blob = await gh("POST", `/repos/${REPO}/git/blobs`, {
			content: buf.toString("base64"),
			encoding: "base64",
		});
		treeEntries.push({ path: rel, mode: "100644", type: "blob", sha: blob.sha });
		changed.push({ path: rel, status: remoteSha ? "modified" : "added" });
	}
	for (const remotePath of remote.contentShas.keys()) {
		if (!localSet.has(remotePath)) {
			treeEntries.push({ path: remotePath, mode: "100644", type: "blob", sha: null });
			changed.push({ path: remotePath, status: "deleted" });
		}
	}

	if (!treeEntries.length) {
		throw new PublishError("no_changes", "Nothing to publish — the live server already matches.");
	}

	const newTree = await gh("POST", `/repos/${REPO}/git/trees`, {
		base_tree: remote.treeSha,
		tree: treeEntries,
	});
	const message = `Pinkacord content update by ${actor}${summary ? `: ${summary}` : ""}\n\n` +
		changed.map(c => `${c.status}: ${c.path}`).join("\n") +
		`\n\nPublished via Pinkacord admin panel`;
	const commit = await gh("POST", `/repos/${REPO}/git/commits`, {
		message,
		tree: newTree.sha,
		parents: [remote.headSha],
	});
	// Fast-forward the branch. If someone pushed between our read and now,
	// GitHub rejects this (422) — surface a retryable error.
	try {
		await gh("PATCH", `/repos/${REPO}/git/refs/heads/${encodeURIComponent(BRANCH)}`, { sha: commit.sha });
	} catch (e: any) {
		throw new PublishError("ref_conflict", "The repo changed while publishing. Try again — your changes are still saved here.");
	}

	return { sha: commit.sha, url: `https://github.com/${REPO}/commit/${commit.sha}`, changed };
}
