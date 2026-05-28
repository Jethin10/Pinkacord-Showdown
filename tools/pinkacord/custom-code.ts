/**
 * Lightweight guardrails for AI-authored ability handler snippets.
 * Not a full sandbox — the smoke test still catches syntax errors — but
 * blocks obvious footguns before they reach generated mod files.
 */

const FORBIDDEN_PATTERNS: { re: RegExp; message: string }[] = [
	{ re: /\brequire\s*\(/, message: "require() is not allowed" },
	{ re: /\bimport\s*\(/, message: "dynamic import() is not allowed" },
	{ re: /\bprocess\b/, message: "process access is not allowed" },
	{ re: /\bchild_process\b/, message: "child_process is not allowed" },
	{ re: /\bfs\b/, message: "filesystem access is not allowed" },
	{ re: /\beval\s*\(/, message: "eval() is not allowed" },
	{ re: /\bFunction\s*\(/, message: "Function constructor is not allowed" },
	{ re: /\bglobalThis\b/, message: "globalThis access is not allowed" },
];

export function validateCustomHandlerCode(code: string, context = "ability"): string[] {
	const trimmed = (code || "").trim();
	if (!trimmed) return [];

	const errors: string[] = [];
	for (const { re, message } of FORBIDDEN_PATTERNS) {
		if (re.test(trimmed)) errors.push(`${context} custom code: ${message}`);
	}
	if (trimmed.length > 8000) {
		errors.push(`${context} custom code exceeds 8000 characters`);
	}
	return errors;
}
