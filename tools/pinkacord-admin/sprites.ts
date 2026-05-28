/**
 * Pinkacord admin panel — sprite storage.
 *
 * Sprites live at content/pinkacord/sprites/<id>.png as binary files (not in
 * JSON). The build step mirrors them to server/static/sprites/pinkacord/ so
 * PS can serve them as static assets to the browser client.
 *
 * Why a separate file instead of base64-in-JSON: keeps JSON git diffs tiny,
 * binary diffs go through git LFS or stay binary, and the file path is the
 * URL — no encoding layer in the serving hot path.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = process.cwd();
const MOD_ID = "pinkacord";
export const SPRITE_DIR = path.join(REPO_ROOT, "content", MOD_ID, "sprites");
export const SPRITE_PUBLIC_DIR = path.join(REPO_ROOT, "server", "static", "sprites", MOD_ID);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF_MAGIC_87 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
const GIF_MAGIC_89 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a

const MAX_SPRITE_BYTES = 250 * 1024; // 250 KB — sprites should be small

export class SpriteError extends Error {
	constructor(public readonly code: "too_large" | "wrong_type" | "not_found" | "io", message: string) {
		super(message);
		this.name = "SpriteError";
	}
}

/** Returns the on-disk extension (".png" or ".gif") if a sprite exists for this id, else null. */
export function spriteExtFor(id: string): string | null {
	for (const ext of [".png", ".gif"]) {
		if (fs.existsSync(path.join(SPRITE_DIR, id + ext))) return ext;
	}
	return null;
}

export function hasSprite(id: string): boolean {
	return spriteExtFor(id) !== null;
}

/**
 * Write a sprite from a base64-encoded payload. Validates magic bytes (PNG or
 * GIF only), enforces a size ceiling, and writes atomically.
 *
 * @returns the on-disk path (relative to repo root) and the URL the client
 *   should fetch (assuming PS server serves /sprites/pinkacord/).
 */
export function writeSpriteFromBase64(id: string, base64: string): { path: string; url: string } {
	let buf: Buffer;
	try {
		// Strip a "data:image/png;base64," prefix if present.
		const m = base64.match(/^data:[^;]+;base64,(.*)$/);
		buf = Buffer.from(m ? m[1] : base64, "base64");
	} catch (e: any) {
		throw new SpriteError("wrong_type", "invalid base64");
	}
	if (buf.length === 0) throw new SpriteError("wrong_type", "empty payload");
	if (buf.length > MAX_SPRITE_BYTES) {
		throw new SpriteError("too_large", `sprite is ${buf.length} bytes; max is ${MAX_SPRITE_BYTES}`);
	}

	let ext: string;
	if (buf.subarray(0, 8).equals(PNG_MAGIC)) ext = ".png";
	else if (buf.subarray(0, 6).equals(GIF_MAGIC_87) || buf.subarray(0, 6).equals(GIF_MAGIC_89)) ext = ".gif";
	else throw new SpriteError("wrong_type", "only PNG and GIF are accepted");

	// If an existing sprite uses the other extension, remove it first so we
	// don't end up with both .png and .gif for the same id.
	const existing = spriteExtFor(id);
	if (existing && existing !== ext) {
		try { fs.unlinkSync(path.join(SPRITE_DIR, id + existing)); } catch { /* best effort */ }
	}

	fs.mkdirSync(SPRITE_DIR, { recursive: true });
	const outPath = path.join(SPRITE_DIR, id + ext);
	const tmp = outPath + ".tmp";
	fs.writeFileSync(tmp, buf);
	fs.renameSync(tmp, outPath);

	return {
		path: path.relative(REPO_ROOT, outPath),
		url: `/sprites/${MOD_ID}/${id}${ext}`,
	};
}

export function deleteSprite(id: string): boolean {
	const ext = spriteExtFor(id);
	if (!ext) return false;
	try { fs.unlinkSync(path.join(SPRITE_DIR, id + ext)); } catch { /* best effort */ }
	// Mirror the delete to server/static if it was copied there.
	const mirror = path.join(SPRITE_PUBLIC_DIR, id + ext);
	if (fs.existsSync(mirror)) {
		try { fs.unlinkSync(mirror); } catch { /* best effort */ }
	}
	return true;
}

/**
 * Mirror content/pinkacord/sprites/ into server/static/sprites/pinkacord/.
 * Called from the main generator after content has been emitted. Idempotent.
 */
export function mirrorSpritesToStatic(): { copied: number } {
	if (!fs.existsSync(SPRITE_DIR)) return { copied: 0 };
	fs.mkdirSync(SPRITE_PUBLIC_DIR, { recursive: true });
	let copied = 0;
	for (const entry of fs.readdirSync(SPRITE_DIR)) {
		if (!/\.(png|gif)$/i.test(entry)) continue;
		const src = path.join(SPRITE_DIR, entry);
		const dst = path.join(SPRITE_PUBLIC_DIR, entry);
		fs.copyFileSync(src, dst);
		copied++;
	}
	return { copied };
}

/** Public URL path for a sprite, if it exists. */
export function spriteUrlFor(id: string): string | null {
	const ext = spriteExtFor(id);
	return ext ? `/sprites/${MOD_ID}/${id}${ext}` : null;
}
