// Minimal format list for low-memory deployments.
// Only essential formats are kept. The Pinkacord formats are in custom-formats.ts.
export const Formats: import('../sim/dex-formats').FormatList = [
	// ── Gen 9 Singles ─────────────────────────────────────────────────────
	{ section: "Gen 9" },
	{
		name: "[Gen 9] OU",
		mod: 'gen9',
		ruleset: ['Standard'],
		banlist: ['Uber', 'AG', 'Moody', 'Shadow Tag', 'Arena Trap', 'King\'s Rock', 'Razor Fang', 'Baton Pass'],
	},
	{
		name: "[Gen 9] Ubers",
		mod: 'gen9',
		ruleset: ['Standard'],
		banlist: ['AG', 'Moody', 'Shadow Tag', 'Baton Pass'],
	},
	{
		name: "[Gen 9] Anything Goes",
		mod: 'gen9',
		ruleset: ['Standard'],
		banlist: [],
	},
	{
		name: "[Gen 9] Random Battle",
		mod: 'gen9',
		team: 'random',
		bestOfDefault: true,
		ruleset: ['PotD', 'Obtainable', 'Species Clause', 'HP Percentage Mod', 'Cancel Mod', 'Sleep Clause Mod', 'Illusion Level Mod'],
	},
	// ── Gen 9 Doubles ────────────────────────────────────────────────────
	{ section: "Gen 9 Doubles", column: 1 },
	{
		name: "[Gen 9] Doubles OU",
		mod: 'gen9',
		gameType: 'doubles',
		ruleset: ['Standard Doubles'],
		banlist: ['DUber', 'Moody', 'Power Construct', 'Shadow Tag', 'Swagger'],
	},
	// ── Custom Game (needed for mod compatibility) ────────────────────────
	{ section: "Custom" },
	{
		name: "[Gen 9] Custom Game",
		mod: 'gen9',
		searchShow: false,
		debug: true,
		battle: { trunc: Math.trunc },
		ruleset: ['HP Percentage Mod', 'Cancel Mod', 'Max Team Size = 24', 'Max Move Count = 24', 'Max Level = 9999', 'Default Level = 100'],
	},
];
