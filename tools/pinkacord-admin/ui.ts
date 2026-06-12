/**
 * Pinkacord admin panel — UI bundle (v2 "Slate" redesign).
 *
 * The entire admin UI is one HTML page with inline CSS and JS, served by the
 * admin server as a static string. Dark dashboard layout: fixed sidebar nav,
 * full-page editors for Pokémon and Formats, slide-over drawers for the
 * smaller entity types, deploy status pinned to the sidebar footer.
 *
 * Architectural notes that have surfaced as bugs in past iterations:
 *   - Use a FUNCTION replacer in server.ts when injecting SCRIPT into HTML,
 *     otherwise $$ / $& / $' inside the script get mangled by String.replace's
 *     special-token interpretation.
 *   - The whole script is wrapped in an IIFE so my $/$$ helpers don't clash
 *     with browser extensions that inject jQuery globally.
 *   - render*() functions are NOT async — they construct the DOM synchronously
 *     and use .then() to lazy-fill data. Making them async returns a Promise
 *     to appendChild() and the page goes blank.
 *   - No backticks / "$ {" sequences inside SCRIPT — it lives in a template
 *     literal. String concatenation only.
 */

export const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Pinkacord Admin</title>
	<style>
		:root {
			--bg: #0d0f15;
			--panel: #151823;
			--panel-2: #1b1f2d;
			--panel-3: #232939;
			--border: #262c3d;
			--border-2: #343c54;
			--text: #e8ebf3;
			--dim: #99a1b6;
			--faint: #677089;
			--pink: #f25fa6;
			--pink-strong: #ff77b8;
			--pink-soft: rgba(242, 95, 166, .13);
			--green: #4ade80;
			--green-soft: rgba(74, 222, 128, .12);
			--red: #f87171;
			--red-soft: rgba(248, 113, 113, .12);
			--amber: #fbbf24;
			--amber-soft: rgba(251, 191, 36, .12);
			--blue: #7aa7ff;
			--radius: 10px;
			--radius-sm: 7px;
			--sidebar-w: 234px;
			--shadow: 0 8px 28px rgba(0, 0, 0, .45);
		}
		* { box-sizing: border-box; }
		html { color-scheme: dark; }
		body {
			margin: 0;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", sans-serif;
			font-size: 14px;
			line-height: 1.5;
			background: var(--bg);
			color: var(--text);
			min-height: 100vh;
			-webkit-font-smoothing: antialiased;
		}
		::selection { background: rgba(242, 95, 166, .35); }
		h1, h2, h3 { font-weight: 600; letter-spacing: -.01em; }
		a { color: var(--pink-strong); text-decoration: none; }
		a:hover { text-decoration: underline; }
		code { background: var(--panel-3); padding: .1rem .4rem; border-radius: 5px; font-size: .85em; color: var(--pink-strong); font-family: "SF Mono", ui-monospace, Consolas, monospace; }
		hr { border: none; border-top: 1px solid var(--border); margin: 1.1rem 0; }

		/* ── Scrollbars ─────────────────────────────────────────────── */
		* { scrollbar-width: thin; scrollbar-color: var(--border-2) transparent; }
		*::-webkit-scrollbar { width: 9px; height: 9px; }
		*::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 5px; }
		*::-webkit-scrollbar-track { background: transparent; }

		/* ── App shell ──────────────────────────────────────────────── */
		.app { display: flex; min-height: 100vh; }
		.sidebar {
			position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w);
			background: var(--panel);
			border-right: 1px solid var(--border);
			display: flex; flex-direction: column;
			z-index: 40;
		}
		.brand { display: flex; align-items: center; gap: .6rem; padding: 1.05rem 1.15rem .9rem; }
		.brand .dot { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, var(--pink), #b04ddb); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; font-size: 14px; flex: none; }
		.brand .name { font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
		.brand .name span { color: var(--pink-strong); }
		.brand .sub { font-size: 10.5px; color: var(--faint); margin-top: -2px; }
		.nav { padding: .35rem .6rem; display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
		.nav-label { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--faint); padding: .85rem .55rem .3rem; }
		.nav a {
			display: flex; align-items: center; gap: .6rem;
			padding: .45rem .55rem; border-radius: var(--radius-sm);
			color: var(--dim); font-weight: 500; font-size: 13.5px;
			text-decoration: none; transition: background .1s, color .1s;
		}
		.nav a:hover { background: var(--panel-2); color: var(--text); text-decoration: none; }
		.nav a.active { background: var(--pink-soft); color: var(--pink-strong); font-weight: 600; }
		.nav a .ic { opacity: .85; }
		.nav a .count { margin-left: auto; font-size: 11px; color: var(--faint); background: var(--panel-3); padding: 0 .45rem; border-radius: 8px; line-height: 1.5; }
		.nav a.active .count { background: rgba(242, 95, 166, .22); color: var(--pink-strong); }

		.side-foot { border-top: 1px solid var(--border); padding: .8rem; display: flex; flex-direction: column; gap: .6rem; }
		.deploy-box { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .65rem .7rem; }
		.deploy-box .row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: .45rem; }
		.deploy-box .mode { font-size: 10.5px; color: var(--faint); }
		.deploy-status { display: inline-flex; align-items: center; gap: .35rem; font-size: 11.5px; font-weight: 600; }
		.deploy-status .led { width: 7px; height: 7px; border-radius: 50%; }
		.deploy-status.live { color: var(--green); } .deploy-status.live .led { background: var(--green); }
		.deploy-status.pending { color: var(--amber); } .deploy-status.pending .led { background: var(--amber); box-shadow: 0 0 6px var(--amber); }
		.deploy-box .btn { width: 100%; justify-content: center; }
		.who-row { display: flex; align-items: center; gap: .5rem; padding: 0 .2rem; }
		.who-row .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--panel-3); border: 1px solid var(--border-2); display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 700; color: var(--pink-strong); flex: none; }
		.who-row .wname { font-size: 12.5px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.who-row .signout { background: none; border: none; color: var(--faint); cursor: pointer; padding: .25rem; border-radius: 6px; display: flex; }
		.who-row .signout:hover { color: var(--red); background: var(--red-soft); }

		.main { margin-left: var(--sidebar-w); flex: 1; min-width: 0; padding: 1.6rem 2.1rem 4rem; max-width: calc(var(--sidebar-w) + 1240px); }
		.page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; flex-wrap: wrap; }
		.page-head h1 { margin: 0; font-size: 20px; }
		.page-head .sub { color: var(--dim); font-size: 13px; margin-top: .1rem; }
		.page-head .actions { display: flex; gap: .5rem; align-items: center; }

		/* ── Buttons ────────────────────────────────────────────────── */
		.btn {
			display: inline-flex; align-items: center; gap: .42rem;
			font: inherit; font-size: 13px; font-weight: 600;
			padding: .42rem .85rem; border-radius: var(--radius-sm);
			border: 1px solid transparent; cursor: pointer;
			background: var(--panel-3); color: var(--text);
			transition: background .1s, border-color .1s, color .1s;
			white-space: nowrap;
		}
		.btn:hover { background: var(--border-2); }
		.btn:disabled { opacity: .45; cursor: not-allowed; }
		.btn-primary { background: var(--pink); color: #fff; }
		.btn-primary:hover { background: var(--pink-strong); }
		.btn-quiet { background: transparent; border-color: var(--border-2); color: var(--dim); }
		.btn-quiet:hover { background: var(--panel-3); color: var(--text); }
		.btn-ghost { background: transparent; color: var(--dim); }
		.btn-ghost:hover { background: var(--panel-3); color: var(--text); }
		.btn-danger { background: transparent; border-color: transparent; color: var(--red); }
		.btn-danger:hover { background: var(--red-soft); }
		.btn-lg { font-size: 14px; padding: .55rem 1.15rem; }
		.btn-sm { font-size: 12px; padding: .25rem .6rem; }
		.btn-icon { padding: .4rem; }

		/* ── Inputs ─────────────────────────────────────────────────── */
		input, select, textarea {
			font: inherit; font-size: 13.5px; color: var(--text);
			background: var(--panel-2); border: 1px solid var(--border-2);
			border-radius: var(--radius-sm); padding: .45rem .6rem; width: 100%;
		}
		input::placeholder, textarea::placeholder { color: var(--faint); }
		input:focus, select:focus, textarea:focus { outline: none; border-color: var(--pink); box-shadow: 0 0 0 3px rgba(242, 95, 166, .18); }
		input[type=checkbox], input[type=radio] { width: auto; accent-color: var(--pink); }
		input[type=range] { accent-color: var(--pink); padding: 0; background: transparent; border: none; box-shadow: none; }
		input[type=range]:focus { box-shadow: none; }
		input[type=file] { background: transparent; border: 1px dashed var(--border-2); padding: .6rem; color: var(--dim); }
		select { appearance: none; background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2399a1b6' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right .6rem center; padding-right: 1.7rem; }
		textarea { resize: vertical; min-height: 60px; }
		.field { margin-bottom: .9rem; min-width: 0; }
		.field label { display: flex; align-items: center; gap: .35rem; font-size: 12px; font-weight: 600; color: var(--dim); margin-bottom: .3rem; text-transform: uppercase; letter-spacing: .04em; }
		.field .hint { font-size: 12px; color: var(--faint); margin-top: .3rem; }
		.field-error { color: var(--red); font-size: 12.5px; margin-top: .25rem; font-weight: 500; }
		.field.is-invalid input, .field.is-invalid select, .field.is-invalid textarea { border-color: var(--red); }
		.help { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: var(--panel-3); color: var(--dim); font-size: 10px; cursor: help; font-weight: 700; }
		.help[title]:hover { background: var(--pink); color: #fff; }
		.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; }
		.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 1rem; }

		/* ── Cards / banners / chips ────────────────────────────────── */
		.card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.15rem 1.25rem; margin-bottom: 1rem; }
		.card h2 { margin: 0 0 .85rem; font-size: 15px; }
		.card.compact { padding: .9rem 1.1rem; }
		.banner { padding: .65rem .9rem; border-radius: var(--radius-sm); margin-bottom: .85rem; font-size: 13px; line-height: 1.5; border: 1px solid; }
		.banner.success { background: var(--green-soft); color: var(--green); border-color: rgba(74, 222, 128, .3); }
		.banner.error { background: var(--red-soft); color: var(--red); border-color: rgba(248, 113, 113, .3); }
		.banner.info { background: rgba(122, 167, 255, .1); color: var(--blue); border-color: rgba(122, 167, 255, .3); }
		.type-chip { display: inline-block; padding: .1rem .5rem; border-radius: 5px; font-size: 10px; color: #fff; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; text-shadow: 0 1px 1px rgba(0, 0, 0, .4); }
		.pill { display: inline-flex; align-items: center; gap: .3rem; padding: .12rem .55rem; border-radius: 999px; font-size: 11.5px; font-weight: 600; border: 1px solid var(--border-2); color: var(--dim); }
		.pill.ok { color: var(--green); border-color: rgba(74, 222, 128, .35); background: var(--green-soft); }
		.pill.warn { color: var(--amber); border-color: rgba(251, 191, 36, .35); background: var(--amber-soft); }
		.pill.accent { color: var(--pink-strong); border-color: rgba(242, 95, 166, .4); background: var(--pink-soft); }
		.empty { text-align: center; color: var(--faint); padding: 2.4rem 1rem; font-size: 13.5px; }
		.empty .big { margin-bottom: .6rem; opacity: .55; display: flex; justify-content: center; }

		/* ── Toolbar / lists ────────────────────────────────────────── */
		.list-toolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: 1rem; }
		.list-toolbar input[type=text] { max-width: 280px; }
		.list-toolbar select { width: auto; }
		.list-toolbar .grow { flex: 1; min-width: 160px; }
		.search-wrap { position: relative; flex: 1; min-width: 180px; max-width: 320px; }
		.search-wrap .ic { position: absolute; left: .6rem; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; display: flex; }
		.search-wrap input { padding-left: 2rem; max-width: none; }
		.row-list { display: flex; flex-direction: column; gap: .45rem; }
		.row {
			display: flex; align-items: center; gap: .85rem;
			padding: .65rem .9rem; background: var(--panel);
			border: 1px solid var(--border); border-radius: var(--radius-sm);
			cursor: pointer; transition: border-color .1s, background .1s;
		}
		.row:hover { border-color: var(--border-2); background: var(--panel-2); }
		.row .rname { font-weight: 600; font-size: 13.5px; }
		.row .rmeta { color: var(--dim); font-size: 12.5px; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
		.row .rbody { flex: 1; min-width: 0; }
		.row-actions { display: flex; gap: .15rem; align-items: center; opacity: 0; transition: opacity .12s; }
		.row:hover .row-actions { opacity: 1; }

		/* ── Pokémon grid ───────────────────────────────────────────── */
		.mon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: .8rem; }
		.mon-card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem .85rem .8rem; cursor: pointer; transition: border-color .12s, transform .12s; text-align: center; position: relative; }
		.mon-card:hover { border-color: var(--pink); transform: translateY(-2px); }
		.mon-card .sprite-box { width: 96px; height: 96px; margin: 0 auto .5rem; border-radius: var(--radius-sm); background: var(--panel-2); display: flex; align-items: center; justify-content: center; image-rendering: pixelated; overflow: hidden; }
		.mon-card .sprite-box img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
		.mon-card .name { font-weight: 600; font-size: 14px; margin-bottom: .3rem; }
		.mon-card .types { display: flex; justify-content: center; gap: .25rem; margin-bottom: .4rem; }
		.mon-card .meta { display: flex; justify-content: center; gap: .9rem; font-size: 12px; color: var(--dim); }
		.mon-card .quick { position: absolute; top: .5rem; right: .5rem; display: flex; gap: .1rem; opacity: 0; transition: opacity .12s; }
		.mon-card:hover .quick { opacity: 1; }
		.mon-card .nosprite-flag { position: absolute; top: .55rem; left: .55rem; }
		.mon-card.new { display: flex; align-items: center; justify-content: center; min-height: 208px; border-style: dashed; border-color: var(--border-2); color: var(--dim); font-weight: 600; background: transparent; gap: .4rem; }
		.mon-card.new:hover { border-color: var(--pink); color: var(--pink-strong); transform: none; }

		/* ── Dashboard ──────────────────────────────────────────────── */
		.stat-row-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .7rem; margin-bottom: 1rem; }
		.stat-tile { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: .85rem 1rem; cursor: pointer; transition: border-color .12s; }
		.stat-tile:hover { border-color: var(--pink); }
		.stat-tile .stat-val { font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
		.stat-tile .stat-label { font-size: 12px; color: var(--dim); display: flex; align-items: center; gap: .4rem; margin-top: .15rem; }
		.dash-cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; align-items: start; }
		.dash-cols > * { min-width: 0; }
		@media (max-width: 1000px) { .dash-cols { grid-template-columns: 1fr; } }
		.activity-row { display: flex; align-items: center; gap: .6rem; padding: .45rem 0; border-bottom: 1px solid var(--border); font-size: 13px; }
		.activity-row:last-child { border-bottom: none; }
		.act-icon { color: var(--faint); display: flex; flex: none; }
		.act-body { flex: 1; color: var(--dim); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.act-who { font-weight: 600; color: var(--text); }
		.act-id { color: var(--pink-strong); font-weight: 500; }
		.act-ts { font-size: 11.5px; color: var(--faint); white-space: nowrap; }
		.cmd-inline { background: #07080c; color: var(--pink-strong); padding: .2rem .6rem; border-radius: 6px; font-size: 12px; cursor: pointer; user-select: all; white-space: normal; overflow-wrap: anywhere; font-family: "SF Mono", ui-monospace, Consolas, monospace; border: 1px solid var(--border); }
		.cmd-inline:hover { border-color: var(--border-2); }

		/* ── Drawer (slide-over editor for moves/abilities/items) ───── */
		.modal-overlay { position: fixed; inset: 0; background: rgba(5, 6, 10, .62); z-index: 100; display: flex; justify-content: flex-end; backdrop-filter: blur(2px); }
		.modal { background: var(--panel); border-left: 1px solid var(--border-2); width: 620px; max-width: 96vw; height: 100%; display: flex; flex-direction: column; box-shadow: var(--shadow); animation: drawerIn .18s ease-out; }
		@keyframes drawerIn { from { transform: translateX(24px); opacity: .6; } to { transform: none; opacity: 1; } }
		.modal-head { padding: .9rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex: none; }
		.modal-head h2 { margin: 0; font-size: 15px; }
		.modal-head .x { background: transparent; border: none; cursor: pointer; color: var(--dim); padding: .3rem; border-radius: 6px; display: flex; }
		.modal-head .x:hover { color: var(--text); background: var(--panel-3); }
		.modal-body { padding: 1.15rem 1.25rem; overflow-y: auto; flex: 1; }
		.modal-foot { padding: .8rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: .65rem; flex: none; }
		.modal-foot .note { font-size: 12px; color: var(--faint); }

		/* ── Full-page editor (species & formats) ───────────────────── */
		.editor-head { display: flex; align-items: center; gap: .85rem; margin-bottom: 1.25rem; flex-wrap: wrap; position: sticky; top: 0; background: linear-gradient(var(--bg) 82%, transparent); padding: .85rem 0 .9rem; z-index: 30; }
		.editor-head .back { display: flex; align-items: center; gap: .3rem; }
		.editor-head h1 { margin: 0; font-size: 18px; flex: 1; min-width: 200px; }
		.editor-head h1 .muted { color: var(--faint); font-weight: 500; }
		.editor-layout { display: grid; grid-template-columns: 168px 1fr; gap: 1.5rem; align-items: start; }
		@media (max-width: 900px) { .editor-layout { grid-template-columns: 1fr; } .editor-toc { display: none; } }
		.editor-toc { position: sticky; top: 4.4rem; display: flex; flex-direction: column; gap: 2px; }
		.editor-toc a { padding: .35rem .6rem; border-radius: var(--radius-sm); color: var(--dim); font-size: 13px; font-weight: 500; }
		.editor-toc a:hover { background: var(--panel-2); color: var(--text); text-decoration: none; }
		.editor-toc a.active { background: var(--pink-soft); color: var(--pink-strong); font-weight: 600; }
		.editor-sections { min-width: 0; display: flex; flex-direction: column; gap: 1rem; }
		.esec { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.15rem 1.3rem; scroll-margin-top: 4.6rem; }
		.esec > h2 { margin: 0 0 .35rem; font-size: 15px; display: flex; align-items: center; gap: .5rem; }
		.esec > .sub { color: var(--faint); font-size: 12.5px; margin: 0 0 .9rem; }

		/* ── Type picker / stats (species editor) ───────────────────── */
		.type-pick { display: grid; grid-template-columns: repeat(7, 1fr); gap: .3rem; }
		.type-pick button { padding: .4rem .2rem; border-radius: 6px; color: #fff; border: 1px solid transparent; cursor: pointer; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; opacity: .38; transition: opacity .1s, box-shadow .1s; text-shadow: 0 1px 1px rgba(0, 0, 0, .4); font-family: inherit; filter: saturate(.85); }
		.type-pick button:hover { opacity: .75; }
		.type-pick button.selected, .type-pick button.selected-2 { opacity: 1; filter: none; box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--pink); }
		.type-pick button.selected-2 { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--blue); }
		.stat-row { display: grid; grid-template-columns: 46px 1fr 64px; gap: .7rem; align-items: center; margin-bottom: .45rem; }
		.stat-row .stat-name { font-weight: 600; font-size: 12.5px; color: var(--dim); }
		.stat-row .stat-bar { position: relative; height: 22px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
		.stat-row .stat-bar input[type=range] { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: grab; z-index: 2; margin: 0; }
		.stat-row .stat-bar .fill { position: absolute; left: 0; top: 0; bottom: 0; transition: width .08s; opacity: .9; }
		.stat-row .stat-bar .label { position: absolute; right: 8px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 11.5px; font-weight: 700; z-index: 1; pointer-events: none; text-shadow: 0 1px 2px rgba(0, 0, 0, .7); }
		.stat-row .stat-num input { text-align: center; padding: .3rem; font-weight: 600; }
		.bst-display { display: flex; justify-content: space-between; align-items: center; padding: .6rem .9rem; background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-top: .6rem; }
		.bst-display .bst-num { font-size: 20px; font-weight: 700; color: var(--pink-strong); }
		.bst-display .bst-tag { font-size: 12.5px; color: var(--dim); }

		/* ── Sprite uploader ────────────────────────────────────────── */
		.sprite-uploader { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .9rem; }
		.sprite-uploader .preview { display: flex; align-items: center; gap: .9rem; margin-bottom: .7rem; }
		.sprite-uploader .preview-box { width: 96px; height: 96px; border-radius: var(--radius-sm); background: var(--panel); border: 1px solid var(--border-2); display: flex; align-items: center; justify-content: center; image-rendering: pixelated; overflow: hidden; flex: none; }
		.sprite-uploader .preview-box img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
		.sprite-uploader .preview-info { flex: 1; font-size: 12.5px; color: var(--dim); line-height: 1.5; }

		/* ── Learnset two-pane (Moves section of species editor) ────── */
		.ls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; }
		@media (max-width: 1100px) { .ls-grid { grid-template-columns: 1fr; } }
		.ls-pane { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); display: flex; flex-direction: column; min-width: 0; }
		.ls-pane-head { padding: .6rem .8rem; border-bottom: 1px solid var(--border); }
		.ls-pane-title { font-weight: 600; font-size: 13px; }
		.ls-pane-sub { font-size: 11.5px; color: var(--faint); margin-top: .1rem; }
		.ls-pane-filters { padding: .5rem .65rem; border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 2fr 1fr 1fr; gap: .35rem; }
		.ls-pane-filters input, .ls-pane-filters select { padding: .3rem .45rem; font-size: 12px; }
		.ls-list { padding: .45rem; overflow-y: auto; max-height: 430px; flex: 1; display: grid; grid-template-columns: 1fr; gap: .3rem; align-content: start; }
		.ls-zone { background: var(--panel-2); border: 1px solid rgba(74, 222, 128, .35); border-radius: var(--radius-sm); display: flex; flex-direction: column; min-width: 0; }
		.ls-zone.wk-drag-over { border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
		.ls-zone-head { padding: .6rem .8rem; border-bottom: 1px solid var(--border); }
		.ls-zone-title { font-weight: 600; font-size: 13px; color: var(--green); }
		.ls-zone-sub { font-size: 11.5px; color: var(--faint); margin-top: .1rem; }
		.ls-zone input[type=text] { margin: 0 .65rem .65rem; width: calc(100% - 1.3rem); padding: .35rem .55rem; font-size: 12.5px; }
		.ls-move { background: var(--panel); border: 1px solid var(--border); padding: .4rem .6rem; border-radius: 6px; cursor: grab; display: grid; grid-template-columns: 1fr auto; gap: .15rem .5rem; align-items: center; }
		.ls-move:hover:not(.ls-already) { border-color: var(--pink); }
		.ls-move:active { cursor: grabbing; }
		.ls-move.ls-already { opacity: .45; cursor: default; }
		.ls-move.ls-known { border-color: rgba(74, 222, 128, .3); cursor: default; }
		.ls-move-name { font-weight: 600; font-size: 12.5px; }
		.ls-move-warn { color: var(--amber); cursor: help; }
		.ls-move-meta { grid-column: 1 / -1; display: flex; gap: .3rem; align-items: center; flex-wrap: wrap; font-size: 11px; color: var(--dim); }
		.ls-move-meta .type-chip { padding: .03rem .35rem; font-size: 9px; }
		.ls-cat { padding: .03rem .4rem; font-size: 9.5px; border-radius: 4px; font-weight: 700; color: #fff; text-shadow: 0 1px 1px rgba(0, 0, 0, .4); }
		.ls-cat-physical { background: #c2553b; }
		.ls-cat-special { background: #4f76c4; }
		.ls-cat-status { background: #5d6678; }
		.ls-bp { background: var(--panel-3); padding: .03rem .4rem; border-radius: 4px; font-weight: 600; }
		.ls-add-btn { background: var(--green-soft); border: 1px solid rgba(74, 222, 128, .35); color: var(--green); padding: .15rem .5rem; font-size: 11px; font-weight: 700; cursor: pointer; border-radius: 5px; font-family: inherit; }
		.ls-add-btn:hover { background: rgba(74, 222, 128, .22); }
		.ls-already-tag { font-size: 11px; color: var(--green); font-weight: 600; }
		.wk-chip-x { background: transparent; border: none; color: var(--faint); font-size: 15px; line-height: 1; padding: 0 .25rem; cursor: pointer; font-weight: 700; font-family: inherit; }
		.wk-chip-x:hover { color: var(--red); }
		.ls-starting-pick { background: var(--panel-2); border: 1px dashed var(--border-2); border-radius: var(--radius-sm); padding: .85rem 1rem; }
		.ls-starting-title { font-size: 13px; font-weight: 600; margin-bottom: .55rem; }
		.ls-starting-tiles { display: grid; grid-template-columns: 1fr 2fr; gap: .65rem; }
		@media (max-width: 700px) { .ls-starting-tiles { grid-template-columns: 1fr; } }
		.ls-starting-tile { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .75rem .85rem; cursor: pointer; text-align: left; font-family: inherit; transition: border-color .12s; display: flex; flex-direction: column; gap: .25rem; color: var(--text); }
		.ls-starting-tile:hover { border-color: var(--pink); }
		.ls-tile-inherit { cursor: default; }
		.ls-tile-title { font-weight: 600; font-size: 13.5px; }
		.ls-tile-desc { font-size: 12px; color: var(--faint); line-height: 1.45; }
		.ls-tile-inherit input[type="text"] { width: 100%; padding: .35rem .55rem; font-size: 12.5px; margin-top: .45rem; }
		.ls-inherit-results { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; max-height: 170px; overflow-y: auto; padding: .15rem; }
		.ls-inherit-pick { background: var(--panel-3); border: 1px solid var(--border-2); border-radius: 999px; padding: .15rem .6rem; font-size: 12px; cursor: pointer; font-family: inherit; color: var(--text); }
		.ls-inherit-pick:hover { border-color: var(--pink); color: var(--pink-strong); }
		.ls-starting-summary { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .55rem .85rem; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .85rem; }

		/* ── Format editor ──────────────────────────────────────────── */
		.fc-editor { display: flex; flex-direction: column; gap: .75rem; }
		.fc-sticky { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: .8rem 1rem; display: flex; gap: 1.1rem; align-items: center; flex-wrap: wrap; }
		.fc-sticky-left { flex: 1; min-width: 230px; display: flex; flex-direction: column; gap: .2rem; }
		.fc-sticky-label { font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; }
		.fc-name-input { padding: .4rem .6rem; font-size: 15px; font-weight: 600; }
		.fc-sticky-id { font-size: 11.5px; color: var(--faint); }
		.fc-preview-slot { flex-basis: 100%; }
		.fc-pill { display: inline-flex; gap: .45rem; align-items: center; background: var(--panel-2); border: 1px solid var(--border); border-radius: 999px; padding: .3rem .8rem; font-size: 12.5px; flex-wrap: wrap; }
		.fc-pill-sect { color: var(--faint); font-size: 10.5px; text-transform: uppercase; font-weight: 600; letter-spacing: .04em; }
		.fc-pill-sep { color: var(--faint); }
		.fc-pill-name { font-weight: 600; }
		.fc-pill-tag { font-size: 10px; padding: .05rem .45rem; border-radius: 999px; background: var(--pink-soft); color: var(--pink-strong); font-weight: 700; }
		.fc-pill-hidden { background: var(--red-soft); color: var(--red); }
		.fc-stack { display: flex; flex-direction: column; gap: .6rem; }
		.fc-card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
		.fc-card[data-collapsed="true"] .fc-body { display: none; }
		.fc-title-row { display: flex; align-items: center; gap: .55rem; padding: .7rem 1rem; cursor: pointer; user-select: none; }
		.fc-title-row:hover { background: var(--panel-2); }
		.fc-chev { color: var(--faint); width: 1rem; display: flex; align-items: center; transition: transform .12s; }
		.fc-card[data-collapsed="false"] .fc-chev { transform: rotate(90deg); }
		.fc-title { font-weight: 600; font-size: 13.5px; flex: 0 0 auto; }
		.fc-summary { font-size: 12px; color: var(--faint); flex: 1; text-align: right; padding-left: .5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.fc-body { padding: .35rem 1.1rem 1.1rem; border-top: 1px solid var(--border); }
		.fmt-section { margin-top: .9rem; }
		.fmt-section h3 { margin: 0 0 .35rem; font-size: 13px; }
		.fmt-section p.sub, .sub { margin: 0 0 .55rem; font-size: 12px; color: var(--faint); }
		.fmt-tile-grid { display: grid; gap: .5rem; }
		.fmt-tile-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
		.fmt-tile-grid.cols-3 { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
		.fmt-tile-grid.cols-4 { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
		.fmt-tile { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .6rem .7rem; cursor: pointer; transition: border-color .1s; }
		.fmt-tile:hover { border-color: var(--border-2); }
		.fmt-tile.selected { border-color: var(--pink); background: var(--pink-soft); }
		.fmt-tile .ico { margin-bottom: .15rem; color: var(--dim); display: flex; }
		.fmt-tile .title { font-weight: 600; font-size: 13px; }
		.fmt-tile .desc { font-size: 11.5px; color: var(--faint); margin-top: .1rem; line-height: 1.4; }
		.fmt-preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: .5rem; margin-bottom: .5rem; }
		.fmt-preset { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .6rem .7rem; cursor: pointer; transition: border-color .1s; }
		.fmt-preset:hover { border-color: var(--pink); }
		.fmt-preset .title { font-weight: 600; font-size: 13px; }
		.fmt-preset .desc { font-size: 11.5px; color: var(--faint); line-height: 1.4; margin-top: .15rem; }
		.fmt-slider-row { display: grid; grid-template-columns: 1fr 64px; gap: .55rem; align-items: center; padding: .15rem 0; }
		.fmt-slider-row .val { font-weight: 600; color: var(--pink-strong); text-align: right; font-size: 13px; }
		.fmt-slider { width: 100%; }
		.fmt-toggle { display: flex; align-items: flex-start; gap: .55rem; padding: .55rem .75rem; background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; margin-bottom: .35rem; }
		.fmt-toggle.on { border-color: rgba(242, 95, 166, .45); background: var(--pink-soft); }
		.fmt-toggle input { margin-top: 3px; width: auto; }
		.fmt-toggle .t-title { font-weight: 600; font-size: 13px; }
		.fmt-toggle .t-desc { font-size: 11.5px; color: var(--faint); line-height: 1.4; margin-top: .1rem; }
		.fmt-pool-tabs { display: flex; gap: .15rem; margin: .75rem 0 .65rem; border-bottom: 1px solid var(--border); }
		.fmt-pool-tabs button { background: transparent; border: none; padding: .45rem .85rem; font-size: 13px; font-weight: 600; color: var(--dim); cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit; margin-bottom: -1px; }
		.fmt-pool-tabs button:hover { color: var(--text); }
		.fmt-pool-tabs button.active { color: var(--pink-strong); border-bottom-color: var(--pink); }
		.fmt-pool-tabs button .badge { display: inline-block; margin-left: .35rem; background: var(--pink-soft); color: var(--pink-strong); font-size: 10.5px; padding: 0 .4rem; border-radius: 8px; }
		.fmt-pool-item { display: flex; justify-content: space-between; align-items: center; padding: .35rem .6rem; background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 13px; }
		.fmt-pool-item:hover { border-color: var(--border-2); }
		.fmt-pool-item.banned { border-color: rgba(248, 113, 113, .4); background: var(--red-soft); }
		.fmt-pool-item.unbanned { border-color: rgba(74, 222, 128, .4); background: var(--green-soft); }
		.fmt-pool-item .pi-name { font-weight: 600; flex: 1; }
		.fmt-pool-item .pi-meta { font-size: 11.5px; color: var(--faint); margin-left: .4rem; }
		.fmt-pool-item .pi-tag { font-size: 9.5px; padding: .05rem .4rem; border-radius: 4px; font-weight: 700; margin-left: .35rem; }
		.fmt-pool-item .pi-tag.ban { background: var(--red); color: #1b0c0c; }
		.fmt-pool-item .pi-tag.unban { background: var(--green); color: #0c1b10; }
		.fc-chip-row { display: flex; flex-wrap: wrap; gap: .3rem; }
		.fc-chip { display: inline-flex; align-items: center; gap: .25rem; padding: .12rem .55rem; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid; }
		.fc-chip-ban { background: var(--red-soft); color: var(--red); border-color: rgba(248, 113, 113, .35); }
		.fc-chip-unban { background: var(--green-soft); color: var(--green); border-color: rgba(74, 222, 128, .35); }
		.fc-chip-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 0 0 .15rem; font-weight: 700; }
		.fc-search-results { margin-top: .55rem; max-height: 440px; overflow-y: auto; }
		.fc-tier-head { font-size: 11px; font-weight: 700; color: var(--pink-strong); text-transform: uppercase; letter-spacing: .05em; padding: .5rem .25rem .2rem; border-top: 1px solid var(--border); margin-top: .2rem; }
		.fc-tier-head:first-child { border-top: none; margin-top: 0; }
		.fc-result-list { display: grid; gap: .25rem; padding: .25rem 0; }
		.fc-mon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: .3rem; padding: .25rem 0; }
		.fc-mon-grid-tight { } /* kept for ported markup */
		.fc-mon-tile { background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px; padding: .25rem; text-align: center; cursor: pointer; transition: border-color .1s; display: flex; flex-direction: column; align-items: center; gap: .1rem; }
		.fc-mon-tile:hover { border-color: var(--pink); }
		.fc-mon-tile.custom { border-color: rgba(242, 95, 166, .45); }
		.fc-mon-tile.banned { background: var(--red-soft); border-color: rgba(248, 113, 113, .5); }
		.fc-mon-tile.unbanned { background: var(--green-soft); border-color: rgba(74, 222, 128, .5); }
		.fc-mon-sprite { width: 52px; height: 52px; object-fit: contain; image-rendering: pixelated; }
		.fc-mon-name { font-size: 10.5px; font-weight: 600; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
		.fc-json { background: #07080c; color: var(--dim); padding: .7rem .9rem; border-radius: var(--radius-sm); font-size: 11.5px; max-height: 320px; overflow: auto; white-space: pre-wrap; margin: 0; font-family: "SF Mono", ui-monospace, Consolas, monospace; border: 1px solid var(--border); }
		.fmt-summary-box { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .75rem 1rem; font-size: 13px; line-height: 1.6; }
		.wk-presets { display: flex; flex-wrap: wrap; gap: .3rem; }

		/* ── Effects builder (abilities/items) ──────────────────────── */
		.effect-block { background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .8rem .9rem; margin-bottom: .5rem; }
		.effect-block .ehead { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
		.effect-block .ehead strong { font-size: 12.5px; color: var(--dim); }
		.nl-box { background: linear-gradient(135deg, rgba(242, 95, 166, .09), rgba(122, 92, 220, .09)); border: 1px solid rgba(242, 95, 166, .25); border-radius: var(--radius-sm); padding: .9rem 1rem; margin: .9rem 0; }
		.nl-box .nl-title { font-weight: 600; font-size: 13.5px; margin-bottom: .2rem; display: flex; align-items: center; gap: .45rem; }
		.nl-box p { color: var(--dim); font-size: 12.5px; line-height: 1.45; margin: 0 0 .65rem; }
		.code-block { background: #07080c; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .75rem; margin-bottom: .5rem; }
		.code-block textarea { font-family: "SF Mono", ui-monospace, Consolas, monospace; font-size: 12px; background: transparent; border: none; color: #f0c7de; white-space: pre; box-shadow: none; }
		.code-block textarea:focus { box-shadow: none; }
		.code-block .chead { color: var(--dim); font-weight: 600; font-size: 12px; margin-bottom: .4rem; display: flex; justify-content: space-between; align-items: center; }

		/* ── Audit ──────────────────────────────────────────────────── */
		.audit-entry { display: flex; gap: .8rem; padding: .65rem 0; border-bottom: 1px solid var(--border); }
		.audit-entry:last-child { border-bottom: none; }
		.audit-entry .icon { width: 30px; height: 30px; border-radius: 8px; background: var(--panel-2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; flex: none; color: var(--dim); }
		.audit-entry .body { flex: 1; min-width: 0; }
		.audit-entry .top { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; }
		.audit-entry .who { font-weight: 600; font-size: 13px; }
		.audit-entry .ts { font-size: 11.5px; color: var(--faint); white-space: nowrap; }

		/* ── Login ──────────────────────────────────────────────────── */
		.login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; background: radial-gradient(1100px 500px at 50% -10%, rgba(242, 95, 166, .14), transparent), var(--bg); }
		.login-card { background: var(--panel); border: 1px solid var(--border); padding: 2.1rem; border-radius: 14px; box-shadow: var(--shadow); width: 100%; max-width: 380px; }
		.login-card .logo { display: flex; justify-content: center; margin-bottom: .8rem; }
		.login-card .logo .dot { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, var(--pink), #b04ddb); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; font-size: 22px; }
		.login-card h1 { margin: 0 0 .3rem; font-size: 19px; text-align: center; }
		.login-card p { margin: 0 0 1.4rem; color: var(--dim); text-align: center; font-size: 13px; }

		/* ── Toast ──────────────────────────────────────────────────── */
		.toast { position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%); background: var(--panel-2); border: 1px solid var(--border-2); border-radius: var(--radius-sm); padding: .7rem 1.1rem; box-shadow: var(--shadow); z-index: 200; max-width: min(620px, 90vw); font-size: 13px; }
		.toast.success { border-left: 3px solid var(--green); }
		.toast.error { border-left: 3px solid var(--red); }
		.toast.info { border-left: 3px solid var(--pink); }

		pre.cmd-block { background: #07080c; color: var(--pink-strong); padding: .7rem .9rem; border-radius: var(--radius-sm); font-size: 12.5px; border: 1px solid var(--border); font-family: "SF Mono", ui-monospace, Consolas, monospace; white-space: pre; margin: 0; user-select: all; }

		@media (max-width: 860px) {
			.sidebar { position: static; width: 100%; inset: auto; flex-direction: row; flex-wrap: wrap; align-items: center; border-right: none; border-bottom: 1px solid var(--border); }
			.app { flex-direction: column; }
			.nav { flex-direction: row; flex-wrap: wrap; }
			.nav-label { display: none; }
			.side-foot { flex-direction: row; align-items: center; border-top: none; margin-left: auto; }
			.main { margin-left: 0; padding: 1.1rem 1rem 3rem; }
			.grid-2, .grid-3 { grid-template-columns: 1fr; }
			.type-pick { grid-template-columns: repeat(4, 1fr); }
			.modal { width: 100vw; }
		}
	</style>
</head>
<body>
	<div id="root"></div>
	<script>
__SCRIPT_PLACEHOLDER__
	</script>
</body>
</html>`;

export const SCRIPT = String.raw`
// IIFE so our $/$$ helpers don't clash with browser extensions that inject
// jQuery globally. "use strict" applies within the IIFE.
(function() {
"use strict";

// ─── Tiny utilities ──────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs = {}, ...children) => {
	const e = document.createElement(tag);
	for (const k in attrs) {
		if (k === "on") for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
		else if (k === "style") Object.assign(e.style, attrs.style);
		else if (k === "class") e.className = attrs[k];
		else if (k === "list") e.setAttribute("list", attrs[k]); // .list is a read-only DOM property
		else if (k in e) e[k] = attrs[k];
		else e.setAttribute(k, attrs[k]);
	}
	for (const c of children.flat()) {
		if (c == null || c === false) continue;
		e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
	}
	return e;
};
const root = () => $("#root");
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }
function empty(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function debounce(fn, ms) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; }
function normSearch(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9\s]/g, ""); }
const ADMIN_BASE = location.pathname === "/admin" || location.pathname.startsWith("/admin/") ? "/admin" : "";
function adminApiPath(path) { return ADMIN_BASE + path; }

// ─── Icons (feather-style, 24px viewBox, stroked) ────────────────────────────
const ICON_PATHS = {
	home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
	mon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6"/><path d="M15 12h6"/><circle cx="12" cy="12" r="3"/>',
	zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
	sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
	bag: '<path d="M5 8h14l-1 13H6L5 8z"/><path d="M8 8a4 4 0 0 1 8 0"/>',
	trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4"/><path d="M8 21h8"/><path d="M9 18h6v3H9z"/>',
	scroll: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
	rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 13 4.5 8.5C7 4 12 3 19 3c0 7-1 12-5.5 14.5L9 13z"/><circle cx="14" cy="9" r="1.6"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
	x: '<path d="M18 6 6 18M6 6l12 12"/>',
	chev: '<path d="m9 6 6 6-6 6"/>',
	back: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
	edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m13.5 6.5 3 3"/>',
	copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
	trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
	image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 19 6-6 4 4 3-3 3 3"/>',
	check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
	warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.2v.3"/>',
	out: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v6H4V4h6"/>',
	logout: '<path d="M9 4H4v16h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>',
	wand: '<path d="m6 18 12-12"/><path d="M14 4l1.5 1.5M19 9l1 1M17 3l.5.5M20.5 6.5l.5.5"/>',
	key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 8-8"/><path d="m16 6 3 3"/>',
	user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
	book: '<path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-2V5z"/><path d="M20 17H6a2 2 0 0 0-2 2"/>',
	gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
};
function icon(name, size) {
	const s = size || 16;
	const span = el("span", { class: "ic", style: { display: "inline-flex", flexShrink: "0" } });
	span.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || "") + '</svg>';
	return span;
}

// ─── API client ──────────────────────────────────────────────────────────────
let _apiBusyCount = 0;
const _busyEl = el("div", { id: "busy-overlay", style: { display: "none", position: "fixed", inset: 0, zIndex: 99999, background: "rgba(7,8,12,.45)", alignItems: "center", justifyContent: "center", pointerEvents: "auto" } },
	el("div", { style: { display: "flex", alignItems: "center", gap: ".7rem", background: "#1b1f2d", border: "1px solid #343c54", padding: ".9rem 1.3rem", borderRadius: "10px", color: "#e8ebf3", fontSize: "13.5px", fontWeight: 600, boxShadow: "0 8px 28px rgba(0,0,0,.5)" } },
		el("span", { style: { display: "inline-block", width: 18, height: 18, border: "3px solid #f25fa6", borderTopColor: "transparent", borderRadius: "50%", animation: "spinner .6s linear infinite" } }),
		"Working…",
	),
);
document.head.appendChild(el("style", {}, "@keyframes spinner { to { transform: rotate(360deg); } }"));
document.body.appendChild(_busyEl);
function _apiBusy(on) {
	_apiBusyCount += on ? 1 : -1;
	_busyEl.style.display = _apiBusyCount > 0 ? "flex" : "none";
}

async function api(method, path, body) {
	_apiBusy(true);
	try {
		const opts = { method, headers: { "X-Pinkacord-Admin": "1" }, credentials: "same-origin" };
		if (body !== undefined) {
			opts.headers["Content-Type"] = "application/json";
			opts.body = JSON.stringify(body);
		}
		const r = await fetch(adminApiPath(path), opts);
		if (r.status === 401) {
			state.authed = false;
			state.displayName = null;
			location.hash = "";
			renderRouted();
			setToast("error", "Session expired. Please sign in again.", 8000);
			throw new Error("Session expired");
		}
		const json = r.status === 204 ? { ok: true } : await r.json().catch(() => ({ ok: false, code: "bad_response" }));
		if (!r.ok || !json.ok) {
			const err = new Error(json.message || r.statusText);
			err.code = json.code; err.fieldErrors = json.fieldErrors; err.status = r.status;
			throw err;
		}
		return json;
	} finally {
		_apiBusy(false);
	}
}

// ─── Canonical constants for the UI ──────────────────────────────────────────
const TYPES = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy", "Stellar"];
const TYPE_COLORS = { Normal: "#A8A77A", Fire: "#EE8130", Water: "#6390F0", Electric: "#F7D02C", Grass: "#7AC74C", Ice: "#96D9D6", Fighting: "#C22E28", Poison: "#A33EA1", Ground: "#E2BF65", Flying: "#A98FF3", Psychic: "#F95587", Bug: "#A6B91A", Rock: "#B6A136", Ghost: "#735797", Dragon: "#6F35FC", Dark: "#705746", Steel: "#B7B7CE", Fairy: "#D685AD", Stellar: "#40B5A5" };
const COLORS = ["Red", "Blue", "Yellow", "Green", "Black", "Brown", "Purple", "Gray", "White", "Pink"];
const EGG_GROUPS = ["Monster", "Water 1", "Water 2", "Water 3", "Bug", "Flying", "Field", "Fairy", "Grass", "Human-Like", "Mineral", "Amorphous", "Ditto", "Dragon", "Undiscovered"];
const TIERS = ["AG", "Uber", "OU", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU", "PUBL", "PU", "ZUBL", "ZU", "NFE", "LC", "Illegal", "Unreleased"];
const DOUBLES_TIERS = ["DUber", "DOU", "DBL", "DUU", "(DUU)", "NFE", "LC"];
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_NAMES = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
function statColor(v) {
	if (v < 50) return "#f87171";
	if (v < 80) return "#fb923c";
	if (v < 100) return "#fbbf24";
	if (v < 120) return "#a3e635";
	return "#4ade80";
}

// ─── Reusable UI bits ────────────────────────────────────────────────────────
function typeChip(typeName) {
	return el("span", { class: "type-chip", style: { background: TYPE_COLORS[typeName] || "#888" } }, typeName);
}
function helpIcon(text) {
	return el("span", { class: "help", title: text }, "?");
}
function field(label, control, hint, helpText) {
	const labelEl = label ? el("label", {},
		el("span", {}, label),
		helpText ? helpIcon(helpText) : null,
	) : null;
	const fieldKey = (label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return el("div", { class: "field", "data-field": fieldKey }, labelEl, control, hint ? el("div", { class: "hint" }, hint) : null);
}
function textInput(d, key, opts) {
	opts = opts || {};
	return el("input", { type: opts.type || "text", value: d[key] != null ? d[key] : "", placeholder: opts.placeholder || "", on: { input: (e) => {
		const v = e.target.value;
		d[key] = opts.type === "number" ? Number(v) : v;
		if (opts.onChange) opts.onChange(d[key]);
	} } });
}
function selectInput(d, key, options, opts) {
	opts = opts || {};
	return el("select", { on: { change: (e) => { d[key] = e.target.value; if (opts.onChange) opts.onChange(); } } },
		(opts.allowEmpty ? [el("option", { value: "" }, "—")] : []).concat(
			options.map((o) => el("option", { value: o, selected: d[key] === o }, o))
		),
	);
}
function searchBox(placeholder, oninput) {
	return el("div", { class: "search-wrap" },
		icon("search", 14),
		el("input", { type: "text", placeholder: placeholder, on: { input: oninput } }),
	);
}

// ─── App state ───────────────────────────────────────────────────────────────
const state = {
	authed: false,
	view: "home",
	editor: null,     // { type: "species"|"formats", data, rev, existingId } → full-page editor
	effects: [],
	displayName: null,
	botConfigured: false,
	hosted: false,
	publishConfigured: false,
	publishStatus: null,
	pendingChanges: 0, // bumped on every successful save; cleared on Apply
	psAbilities: [],
	psSpecies: [],
	psMoves: [],
	customSpecies: [],
	customAbilities: [],
	customMoves: [],
	customItems: [],
	customLearnsets: [],
	customFormats: [],
	_modSpecies: {},
	psUrl: "http://localhost:8000/",
};

function applyMe(me) {
	state.authed = !!me.authed;
	state.displayName = me.displayName;
	state.botConfigured = !!me.botConfigured;
	state.hosted = !!me.hosted;
	state.publishConfigured = !!me.publishConfigured;
}
function changedFileCount() {
	return state.publishStatus && Array.isArray(state.publishStatus.changed) ? state.publishStatus.changed.length : 0;
}
function pendingCount() {
	return Math.max(state.pendingChanges || 0, changedFileCount());
}
function markPendingChange() {
	state.pendingChanges++;
	state.publishStatus = null;
	refreshSidebarDeploy();
}
async function refreshPublishStatus() {
	if (!state.hosted) return;
	try {
		const r = await api("GET", "/api/publish/status");
		state.publishConfigured = !!r.configured;
		state.publishStatus = { changed: r.changed || [], headSha: r.headSha || null };
	} catch (err) {
		state.publishStatus = { changed: [], error: err.message || String(err) };
	}
	refreshSidebarDeploy();
}

function setToast(kind, text, durationMs) {
	const existing = $(".toast"); if (existing) existing.remove();
	const t = el("div", { class: "toast " + kind }, text);
	document.body.appendChild(t);
	setTimeout(() => { if (t.parentNode) t.remove(); }, durationMs || (kind === "error" ? 8000 : 4000));
}

async function prefetchAfterAuth() {
	try { const me = await api("GET", "/api/me"); applyMe(me); } catch {}
	try { const eff = await api("GET", "/api/effects"); state.effects = eff.effects; } catch {}
	try { const a = await api("GET", "/api/ps-dex/abilities"); state.psAbilities = a.items; } catch {}
	try { const s = await api("GET", "/api/ps-dex/species-detail"); state.psSpecies = s.items; } catch {}
	try { const m = await api("GET", "/api/ps-dex/moves-detail"); state.psMoves = m.items; } catch {}
	try { const c = await api("GET", "/api/species"); state.customSpecies = c.items || []; } catch {}
	try { const ca = await api("GET", "/api/abilities"); state.customAbilities = ca.items || []; } catch {}
	try { const cm = await api("GET", "/api/moves"); state.customMoves = cm.items || []; } catch {}
	try { const ci = await api("GET", "/api/items"); state.customItems = ci.items || []; } catch {}
	try { const cl = await api("GET", "/api/learnsets"); state.customLearnsets = cl.items || []; } catch {}
	try { const cf = await api("GET", "/api/formats"); state.customFormats = cf.items || []; } catch {}
	await refreshPublishStatus();
	// Heuristic for the PS server URL: if we're on host:port, PS is typically host:8000.
	try {
		if (state.hosted) state.psUrl = location.origin + "/";
		else {
			const host = location.hostname || "localhost";
			state.psUrl = location.protocol + "//" + host + ":8000/";
		}
	} catch {}
}

async function refreshEntityCache(type) {
	try {
		const r = await api("GET", "/api/" + type);
		if (type === "species") state.customSpecies = r.items || [];
		else if (type === "abilities") state.customAbilities = r.items || [];
		else if (type === "moves") state.customMoves = r.items || [];
		else if (type === "items") state.customItems = r.items || [];
		else if (type === "learnsets") state.customLearnsets = r.items || [];
		else if (type === "formats") state.customFormats = r.items || [];
	} catch {}
}

// ─── Boot / routing ──────────────────────────────────────────────────────────
window.addEventListener("hashchange", () => { renderRouted(); });
async function boot() {
	try {
		const me = await api("GET", "/api/me");
		applyMe(me);
	} catch { state.authed = false; }
	if (state.authed) {
		await prefetchAfterAuth();
	}
	renderRouted();
}
function renderRouted() {
	if (!state.authed) { state.view = "login"; state.editor = null; render(); return; }
	let hash = location.hash.replace(/^#/, "") || "home";
	// Legacy routes from the old layout
	if (hash === "sprites" || hash === "learnsets" || hash === "advanced") hash = "species";
	if (state.view !== hash) state.editor = null; // navigating away closes the editor page
	state.view = hash;
	render();
}
function render() {
	const r = root();
	empty(r);
	if (state.view === "login") return r.appendChild(renderLogin());
	r.appendChild(renderShell());
}

// ─── Login ───────────────────────────────────────────────────────────────────
function renderLogin() {
	let nameInput, pwInput, errorEl;
	const submit = async (e) => {
		e.preventDefault();
		errorEl.textContent = "";
		try {
			const r = await api("POST", "/api/login", { password: pwInput.value, displayName: nameInput.value });
			state.authed = true;
			state.displayName = r.displayName;
			await prefetchAfterAuth();
			location.hash = "home";
			renderRouted();
		} catch (err) { errorEl.textContent = err.message || "Sign-in failed"; }
	};
	return el("div", { class: "login-page" },
		el("form", { class: "login-card", on: { submit } },
			el("div", { class: "logo" }, el("div", { class: "dot" }, "P")),
			el("h1", {}, "Pinkacord Admin"),
			el("p", {}, "Manage your community's custom Pokémon, formats, and server."),
			el("div", { class: "field" },
				el("label", {}, "Your name"),
				nameInput = el("input", { type: "text", autofocus: true, required: true, autocomplete: "nickname", placeholder: "Riku, ash, …" }),
				el("div", { class: "hint" }, "Shows in the change log so everyone knows who changed what."),
			),
			el("div", { class: "field" },
				el("label", {}, "Admin password"),
				pwInput = el("input", { type: "password", required: true, autocomplete: "current-password" }),
			),
			errorEl = el("div", { class: "field-error" }),
			el("button", { type: "submit", class: "btn btn-primary btn-lg", style: { width: "100%", justifyContent: "center", marginTop: ".4rem" } }, "Sign in"),
		)
	);
}

// ─── Shell: sidebar + main ───────────────────────────────────────────────────
function renderShell() {
	return el("div", { class: "app" },
		renderSidebar(),
		el("main", { class: "main" }, renderContent()),
	);
}

const NAV_ITEMS = [
	{ id: "home", label: "Dashboard", icon: "home", group: null },
	{ id: "species", label: "Pokémon", icon: "mon", group: "Content", count: () => (state.customSpecies || []).length },
	{ id: "moves", label: "Moves", icon: "zap", group: "Content", count: () => (state.customMoves || []).length },
	{ id: "abilities", label: "Abilities", icon: "sparkle", group: "Content", count: () => (state.customAbilities || []).length },
	{ id: "items", label: "Items", icon: "bag", group: "Content", count: () => (state.customItems || []).length },
	{ id: "formats", label: "Formats", icon: "trophy", group: "Content", count: () => (state.customFormats || []).length },
	{ id: "audit", label: "Change log", icon: "scroll", group: "Server" },
];

function renderSidebar() {
	const nav = el("nav", { class: "nav" });
	let lastGroup = null;
	for (const item of NAV_ITEMS) {
		if (item.group && item.group !== lastGroup) {
			nav.appendChild(el("div", { class: "nav-label" }, item.group));
			lastGroup = item.group;
		}
		const cnt = item.count ? item.count() : null;
		nav.appendChild(el("a", { href: "#" + item.id, class: state.view === item.id ? "active" : "" },
			icon(item.icon, 16),
			item.label,
			cnt ? el("span", { class: "count" }, String(cnt)) : null,
		));
	}
	nav.appendChild(el("div", { class: "nav-label" }, ""));
	nav.appendChild(el("a", { href: state.psUrl || "http://localhost:8000/", target: "_blank", on: { click: (e) => { e.preventDefault(); window.open(state.psUrl || "http://localhost:8000/", "_blank"); } } },
		icon("out", 16), "Open PS server",
	));

	const initial = (state.displayName || "A").trim().charAt(0).toUpperCase();
	return el("div", { class: "sidebar" },
		el("div", { class: "brand" },
			el("div", { class: "dot" }, "P"),
			el("div", {},
				el("div", { class: "name" }, el("span", {}, "Pinkacord"), " Admin"),
				el("div", { class: "sub" }, "custom dex manager"),
			),
		),
		nav,
		el("div", { class: "side-foot" },
			renderDeployBox(),
			el("div", { class: "who-row" },
				el("div", { class: "avatar" }, initial),
				el("div", { class: "wname" }, state.displayName || "admin"),
				el("button", { class: "signout", title: "Sign out", on: { click: doLogout } }, icon("logout", 15)),
			),
		),
	);
}

function renderDeployBox() {
	const count = pendingCount();
	const mode = state.hosted ? "GitHub → Render" : state.botConfigured ? "Build + hotpatch" : "Build (manual hotpatch)";
	const box = el("div", { class: "deploy-box", id: "deploy-box" },
		el("div", { class: "row1" },
			el("span", { class: "deploy-status " + (count > 0 ? "pending" : "live") },
				el("span", { class: "led" }),
				count > 0 ? count + " pending change" + (count === 1 ? "" : "s") : "Everything live",
			),
		),
		el("button", { class: "btn " + (count > 0 ? "btn-primary" : "btn-quiet"), disabled: state.hosted ? (!state.publishConfigured || count === 0) : count === 0, on: { click: doBuildAndApply } },
			icon("rocket", 14),
			state.hosted ? "Publish" : "Deploy",
		),
		el("div", { class: "mode", style: { marginTop: ".4rem" } }, mode),
	);
	return box;
}
// Refresh just the sidebar deploy box without a full re-render (keeps focus).
function refreshSidebarDeploy() {
	const existing = $("#deploy-box");
	if (!existing) return;
	const fresh = renderDeployBox();
	existing.replaceWith(fresh);
}

function renderContent() {
	if (state.editor) {
		if (state.editor.type === "species") return renderSpeciesEditorPage();
		if (state.editor.type === "formats") return renderFormatEditorPage();
	}
	if (state.view === "home") return renderHome();
	if (state.view === "species") return renderSpeciesList();
	if (state.view === "moves") return renderEntityList("moves", "Moves", "zap", "Custom moves your Pokémon can learn.");
	if (state.view === "abilities") return renderEntityList("abilities", "Abilities", "sparkle", "Custom abilities — describe them in plain English or compose effects.");
	if (state.view === "items") return renderEntityList("items", "Items", "bag", "Custom held items.");
	if (state.view === "formats") return renderFormatsList();
	if (state.view === "audit") return renderAudit();
	return el("div", { class: "card empty" }, "Not found");
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function renderHome() {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "page-head" },
		el("div", {},
			el("h1", {}, "Welcome back" + (state.displayName ? ", " + state.displayName : "")),
			el("div", { class: "sub" }, "Everything you create here runs on your Pokémon Showdown server."),
		),
		el("div", { class: "actions" },
			el("button", { class: "btn btn-primary", on: { click: () => openSpeciesEditor(null) } }, icon("plus", 14), "New Pokémon"),
			el("button", { class: "btn", on: { click: () => openFormatEditor(null) } }, icon("plus", 14), "New format"),
		),
	));

	// Counts
	const statGrid = el("div", { class: "stat-row-grid" });
	const ENTITY_STATS = [
		["species", "mon", "Pokémon", (state.customSpecies || []).length],
		["moves", "zap", "Moves", (state.customMoves || []).length],
		["abilities", "sparkle", "Abilities", (state.customAbilities || []).length],
		["items", "bag", "Items", (state.customItems || []).length],
		["formats", "trophy", "Formats", (state.customFormats || []).length],
	];
	for (const [etype, ic, label, count] of ENTITY_STATS) {
		statGrid.appendChild(el("div", { class: "stat-tile", on: { click: () => { location.hash = etype; } } },
			el("div", { class: "stat-val" }, String(count)),
			el("div", { class: "stat-label" }, icon(ic, 13), label),
		));
	}
	wrap.appendChild(statGrid);

	const cols = el("div", { class: "dash-cols" });
	cols.appendChild(renderHomeActivity());
	cols.appendChild(renderDeployCard());
	wrap.appendChild(cols);
	return wrap;
}

function renderHomeActivity() {
	const card = el("div", { class: "card" }, el("h2", {}, "Recent activity"), el("div", { class: "empty" }, "Loading…"));
	api("GET", "/api/audit").then((r) => {
		empty(card);
		card.appendChild(el("h2", {}, "Recent activity"));
		const list = r.entries ? r.entries.slice(0, 10) : [];
		if (list.length === 0) {
			card.appendChild(el("div", { class: "empty", style: { padding: "1rem 0" } }, "No changes yet. Save your first creation and it'll show up here."));
			return;
		}
		for (const e of list) {
			card.appendChild(el("div", { class: "activity-row" },
				el("span", { class: "act-icon" }, icon(auditIconName(e.action), 14)),
				el("span", { class: "act-body" },
					el("span", { class: "act-who" }, e.actor),
					" " + e.action + " ",
					e.id ? el("span", { class: "act-id" }, e.id) : null,
				),
				el("span", { class: "act-ts" }, relativeTime(e.ts)),
			));
		}
		card.appendChild(el("button", { class: "btn btn-ghost btn-sm", style: { marginTop: ".5rem" }, on: { click: () => { location.hash = "audit"; } } }, "View full log"));
	}).catch(() => { empty(card); card.appendChild(el("h2", {}, "Recent activity")); card.appendChild(el("div", { class: "empty" }, "Couldn't load activity.")); });
	return card;
}
function auditIconName(action) {
	if (action.startsWith("auth")) return "key";
	if (action.startsWith("publish") || action.startsWith("hotpatch")) return "rocket";
	if (action.startsWith("build")) return "zap";
	if (action.startsWith("sprite")) return "image";
	if (action.includes("create")) return "plus";
	if (action.includes("update")) return "edit";
	if (action.includes("delete")) return "trash";
	return "scroll";
}
function relativeTime(ts) {
	const t = new Date(ts).getTime();
	if (!t) return "";
	const s = Math.floor((Date.now() - t) / 1000);
	if (s < 60) return "just now";
	if (s < 3600) return Math.floor(s / 60) + "m ago";
	if (s < 86400) return Math.floor(s / 3600) + "h ago";
	if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
	return new Date(ts).toLocaleDateString();
}

function renderDeployCard() {
	const card = el("div", { class: "card" });
	card.appendChild(el("h2", {}, "Deploy"));
	const count = pendingCount();
	const status = el("div", { style: { display: "flex", gap: ".4rem", alignItems: "center", flexWrap: "wrap", marginBottom: ".7rem" } });
	if (state.hosted) {
		status.appendChild(el("span", { class: "pill " + (state.publishConfigured ? "ok" : "warn") },
			state.publishConfigured ? "GitHub publish ready" : "GitHub publish not configured"));
	} else {
		status.appendChild(el("span", { class: "pill " + (state.botConfigured ? "ok" : "warn") },
			state.botConfigured ? "Auto-hotpatch via bot" : "Manual hotpatch"));
	}
	status.appendChild(el("span", { class: "pill " + (count > 0 ? "accent" : "ok") },
		count > 0 ? count + " pending" : "Live"));
	card.appendChild(status);
	if (state.hosted) {
		card.appendChild(el("p", { style: { margin: "0 0 .75rem", color: "var(--dim)", fontSize: "12.5px", lineHeight: "1.5" } },
			state.publishConfigured
				? "Publish commits saved content to GitHub. Render rebuilds and restarts the server automatically in a few minutes."
				: "Set PINKACORD_GITHUB_TOKEN and PINKACORD_GITHUB_REPO in Render to enable one-click publishing."));
		if (state.publishStatus && state.publishStatus.error) {
			card.appendChild(el("div", { class: "banner error" }, "Publish status check failed: " + state.publishStatus.error));
		}
		if (state.publishStatus && state.publishStatus.changed && state.publishStatus.changed.length) {
			card.appendChild(el("div", { style: { fontSize: "12px", color: "var(--faint)", marginBottom: ".6rem" } },
				"Changed files: " + state.publishStatus.changed.slice(0, 6).join(", ") + (state.publishStatus.changed.length > 6 ? " +" + (state.publishStatus.changed.length - 6) + " more" : "")));
		}
	}
	const row = el("div", { style: { display: "flex", gap: ".5rem", flexWrap: "wrap" } });
	row.appendChild(el("button", { class: "btn btn-primary", disabled: state.hosted ? (!state.publishConfigured || count === 0) : count === 0, on: { click: doBuildAndApply } },
		icon("rocket", 14), state.hosted ? "Publish & deploy" : (state.botConfigured ? "Build & deploy" : "Build")));
	if (state.hosted) {
		row.appendChild(el("button", { class: "btn btn-quiet", on: { click: async () => { await refreshPublishStatus(); render(); } } }, "Refresh status"));
	}
	card.appendChild(row);
	if (!state.hosted && !state.botConfigured) {
		const cmds = ["/hotpatch formats", "/hotpatch battles", "/hotpatch teamvalidator"];
		card.appendChild(el("div", { style: { fontSize: "12px", color: "var(--faint)", marginTop: ".7rem", display: "flex", gap: ".4rem", alignItems: "center", flexWrap: "wrap" } },
			el("span", {}, "After Build, paste in PS chat:"),
			el("code", { class: "cmd-inline", on: { click: () => navigator.clipboard.writeText(cmds.join("\n")).then(() => setToast("success", "Copied")).catch(() => {}) } }, cmds.join("  ")),
		));
	}
	return card;
}

// ─── Pokémon list ────────────────────────────────────────────────────────────
function renderSpeciesList() {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "page-head" },
		el("div", {},
			el("h1", {}, "Pokémon"),
			el("div", { class: "sub" }, "Your custom Pokédex — stats, abilities, moves, and sprites all live in one editor."),
		),
		el("div", { class: "actions" },
			el("button", { class: "btn btn-primary", on: { click: () => openSpeciesEditor(null) } }, icon("plus", 14), "New Pokémon"),
		),
	));
	const filter = { q: "", type: "", tier: "", sprite: "" };
	let all = [];
	const searchDebounce = debounce((fn) => fn(), 180);
	const toolbar = el("div", { class: "list-toolbar" },
		searchBox("Search by name or id…", (e) => { filter.q = e.target.value; searchDebounce(() => rebuild()); }),
		el("select", { on: { change: (e) => { filter.type = e.target.value; rebuild(); } } },
			...[""].concat(TYPES).map((t) => el("option", { value: t }, t || "All types"))),
		el("select", { on: { change: (e) => { filter.tier = e.target.value; rebuild(); } } },
			...[""].concat(TIERS).map((t) => el("option", { value: t }, t || "All tiers"))),
		el("select", { on: { change: (e) => { filter.sprite = e.target.value; rebuild(); } } },
			el("option", { value: "" }, "Sprite: any"),
			el("option", { value: "yes" }, "Has sprite"),
			el("option", { value: "no" }, "Missing sprite")),
	);
	wrap.appendChild(toolbar);
	const grid = el("div", { class: "mon-grid" });
	wrap.appendChild(grid);
	grid.appendChild(el("div", { class: "empty" }, "Loading…"));
	function rebuild() {
		empty(grid);
		grid.appendChild(el("div", { class: "mon-card new", on: { click: () => openSpeciesEditor(null) } },
			icon("plus", 16), "Add a Pokémon"));
		const q = filter.q.toLowerCase().trim();
		const items = all.filter((it) => {
			const d = it.data;
			if (q) {
				const blob = ((d.name || "") + " " + (d.id || "")).toLowerCase();
				if (blob.indexOf(q) < 0) return false;
			}
			if (filter.type && !(d.types || []).includes(filter.type)) return false;
			if (filter.tier && d.tier !== filter.tier) return false;
			if (filter.sprite === "yes" && !it._hasSprite) return false;
			if (filter.sprite === "no" && it._hasSprite) return false;
			return true;
		});
		for (const it of items) grid.appendChild(monCard(it));
		if (all.length === 0) {
			grid.appendChild(el("div", { class: "empty", style: { gridColumn: "1 / -1" } },
				el("div", { class: "big" }, icon("mon", 34)),
				el("div", {}, "Your Pokédex is empty. Create your first custom Pokémon to get started."),
			));
		} else if (items.length === 0) {
			grid.appendChild(el("div", { class: "empty", style: { gridColumn: "1 / -1" } }, "No Pokémon match those filters."));
		}
	}
	Promise.all([
		api("GET", "/api/species"),
		api("GET", "/api/sprites").catch(() => ({ items: [] })),
	]).then(([sr, spritesR]) => {
		const spriteMap = {};
		for (const s of (spritesR.items || [])) spriteMap[s.id] = !!s.hasSprite;
		all = (sr.items || []).map((it) => ({ ...it, _hasSprite: !!spriteMap[it.id] }));
		state.customSpecies = sr.items || [];
		rebuild();
	}).catch((err) => {
		empty(grid);
		grid.appendChild(el("div", { class: "banner error" }, err.message));
	});
	return wrap;
}
function monCard(it) {
	const d = it.data;
	const bst = STATS.reduce((s, k) => s + (d.baseStats[k] || 0), 0);
	const spriteBox = el("div", { class: "sprite-box" });
	if (it._hasSprite !== false) {
		const spriteImg = el("img", { src: adminApiPath("/api/species/" + encodeURIComponent(it.id) + "/sprite/preview?ts=" + Date.now()) });
		spriteImg.onerror = () => { spriteImg.style.display = "none"; spriteBox.appendChild(el("span", { style: { color: "var(--faint)" } }, icon("mon", 30))); };
		spriteBox.appendChild(spriteImg);
	} else {
		spriteBox.appendChild(el("span", { style: { color: "var(--faint)" } }, icon("mon", 30)));
	}
	return el("div", { class: "mon-card", on: { click: () => openSpeciesEditor(it) } },
		it._hasSprite === false ? el("span", { class: "pill warn nosprite-flag", title: "No sprite uploaded yet" }, "no sprite") : null,
		spriteBox,
		el("div", { class: "name" }, d.name),
		el("div", { class: "types" }, d.types.map(typeChip)),
		el("div", { class: "meta" },
			el("span", {}, "BST " + bst),
			el("span", {}, d.tier || "—"),
		),
		el("div", { class: "quick" },
			el("button", { class: "btn btn-ghost btn-icon", title: "Duplicate", on: { click: (e) => { e.stopPropagation(); duplicateSpecies(it); } } }, icon("copy", 14)),
			el("button", { class: "btn btn-danger btn-icon", title: "Delete", on: { click: (e) => { e.stopPropagation(); confirmDelete("species", it); } } }, icon("trash", 14)),
		),
	);
}
function duplicateSpecies(it) {
	const clone = deepClone(it.data);
	clone.name = (clone.name || "Mon") + " Copy";
	clone.id = "";
	clone.num = (Number(clone.num) || 10000) + 1;
	openSpeciesEditor({ id: "", _rev: null, data: clone });
}

// ─── Unified Pokémon editor (full page) ──────────────────────────────────────
// One page with everything: basics, stats, abilities, moves (the learnset,
// merged in — no separate Learnsets screen), sprite, extras.

function moveIdOf(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function moveNameOf(id) {
	const norm = moveIdOf(id);
	for (const m of state.customMoves || []) { if (m.data && moveIdOf(m.data.id) === norm) return m.data.name; }
	for (const m of state.psMoves || []) { if (m.id === norm) return m.name; }
	return id;
}

function openSpeciesEditor(existing) {
	// Duplicate flow passes { id: "", _rev: null, data: {...} } — treat as new w/ prefill.
	const looksLikeNewWithPrefill = existing && (!existing.id || !existing._rev) && existing.data;
	let prefill = null;
	if (looksLikeNewWithPrefill) { prefill = deepClone(existing.data); existing = null; }
	const data = existing ? deepClone(existing.data) : (prefill || {
		id: "", num: 10001, name: "", types: ["Normal"],
		baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
		abilities: { "0": "" }, heightm: 1, weightkg: 10, color: "Pink",
		eggGroups: ["Field"], tier: "OU", doublesTier: "DOU",
	});
	// Learnset: merged into this editor. Load the existing entry if any.
	let lsItem = null;
	if (existing) {
		lsItem = (state.customLearnsets || []).find((l) => l.data && l.data.species === existing.id) || null;
	}
	data._learnsetMoves = lsItem ? lsItem.data.moves.map(moveNameOf) : [];
	state.editor = {
		type: "species",
		data,
		rev: existing ? existing._rev : null,
		existingId: existing ? existing.id : null,
		learnsetItem: lsItem ? { id: lsItem.id, rev: lsItem._rev } : null,
		snapshot: JSON.stringify(data),
	};
	render();
	window.scrollTo(0, 0);
}

function closeEditor(force) {
	const ed = state.editor;
	if (!ed) return;
	if (!force && JSON.stringify(ed.data) !== ed.snapshot) {
		if (!confirm("Discard unsaved changes?")) return;
	}
	state.editor = null;
	render();
}

function renderSpeciesEditorPage() {
	const ed = state.editor;
	const d = ed.data;
	const isNew = !ed.existingId;
	const wrap = el("div", {});
	const errSlot = el("div", {});

	const titleEl = el("h1", {}, isNew ? "New Pokémon" : (d.name || ed.existingId));
	const head = el("div", { class: "editor-head" },
		el("button", { class: "btn btn-quiet back", on: { click: () => closeEditor(false) } }, icon("back", 14), "Pokémon"),
		titleEl,
		!isNew ? el("button", { class: "btn btn-danger", on: { click: () => confirmDelete("species", { id: ed.existingId, data: d }, () => { state.editor = null; render(); }) } }, icon("trash", 14), "Delete") : null,
		el("button", { class: "btn", on: { click: () => saveSpecies({}) } }, "Save"),
		el("button", { class: "btn btn-primary", on: { click: () => saveSpecies({ thenBuild: true }) } }, icon("rocket", 14), state.hosted ? "Save & publish" : "Save & deploy"),
	);
	wrap.appendChild(head);
	wrap.appendChild(errSlot);

	const SECTIONS = [
		["basics", "Basics", secSpeciesBasics],
		["stats", "Stats", secSpeciesStats],
		["abilities", "Abilities", secSpeciesAbilities],
		["moves", "Moves", secSpeciesMoves],
		["sprite", "Sprite", secSpeciesSprite],
		["extras", "Extras", secSpeciesExtras],
	];
	const toc = el("div", { class: "editor-toc" });
	const secHost = el("div", { class: "editor-sections" });
	const secEls = {};
	for (const [id, label, renderFn] of SECTIONS) {
		const sec = el("section", { class: "esec", id: "sec-" + id });
		sec.appendChild(el("h2", {}, label));
		sec.appendChild(renderFn(d, { titleEl }));
		secHost.appendChild(sec);
		secEls[id] = sec;
		toc.appendChild(el("a", { href: "javascript:void 0", "data-sec": id, class: id === "basics" ? "active" : "", on: { click: () => {
			sec.scrollIntoView({ behavior: "smooth", block: "start" });
		} } }, label));
	}
	// Scroll-spy for the TOC
	const spy = () => {
		let active = SECTIONS[0][0];
		for (const [id] of SECTIONS) {
			const r = secEls[id].getBoundingClientRect();
			if (r.top <= 130) active = id;
		}
		for (const a of toc.children) a.classList.toggle("active", a.dataset.sec === active);
	};
	window.addEventListener("scroll", spy, { passive: true });

	wrap.appendChild(el("div", { class: "editor-layout" }, toc, secHost));

	async function saveSpecies(opts) {
		empty(errSlot);
		secHost.querySelectorAll(".field.is-invalid").forEach((n) => n.classList.remove("is-invalid"));
		const body = deepClone(d);
		const stagedSprite = body._stagedSprite;
		const learnsetNames = body._learnsetMoves || [];
		delete body._stagedSprite;
		delete body._learnsetMoves;
		try {
			const url = "/api/species" + (ed.existingId ? "/" + encodeURIComponent(ed.existingId) : "");
			const method = ed.existingId ? "PUT" : "POST";
			if (ed.existingId && ed.rev) body.__rev = ed.rev;
			const headers = { "X-Pinkacord-Admin": "1", "Content-Type": "application/json" };
			if (ed.existingId && ed.rev) headers["If-Match"] = ed.rev;
			const r = await fetch(adminApiPath(url), { method, headers, credentials: "same-origin", body: JSON.stringify(body) });
			const json = await r.json().catch(() => ({ ok: false, message: "bad response" }));
			if (!r.ok || !json.ok) {
				errSlot.appendChild(el("div", { class: "banner error" }, json.message || r.statusText));
				if (json.fieldErrors) for (const fe of json.fieldErrors) errSlot.appendChild(el("div", { class: "field-error" }, "• " + fe));
				window.scrollTo({ top: 0, behavior: "smooth" });
				return false;
			}
			const savedId = (json.item && json.item.id) || body.id || moveIdOf(body.name);
			// 1) staged sprite
			if (stagedSprite) {
				try { await api("POST", "/api/species/" + encodeURIComponent(savedId) + "/sprite", { data: stagedSprite }); }
				catch (err) { setToast("error", "Saved, but sprite upload failed: " + (err.message || "unknown")); }
			}
			// 2) learnset upsert/delete (moves stored as lowercase ids)
			const moveIds = [];
			for (const n of learnsetNames) { const id = moveIdOf(n); if (id && !moveIds.includes(id)) moveIds.push(id); }
			try {
				if (moveIds.length) {
					if (ed.learnsetItem) {
						await api("PUT", "/api/learnsets/" + encodeURIComponent(ed.learnsetItem.id), { species: savedId, moves: moveIds, __rev: ed.learnsetItem.rev });
					} else {
						await api("POST", "/api/learnsets", { species: savedId, moves: moveIds });
					}
				} else if (ed.learnsetItem) {
					await api("DELETE", "/api/learnsets/" + encodeURIComponent(ed.learnsetItem.id));
				}
			} catch (err) {
				setToast("error", "Saved the Pokémon, but its move list failed to save: " + (err.message || "unknown"), 9000);
			}
			await refreshEntityCache("species");
			await refreshEntityCache("learnsets");
			markPendingChange();
			state.editor = null;
			render();
			if (opts && opts.thenBuild) { await doBuildAndApply(); return true; }
			setToast("success", "Saved " + (d.name || savedId) + ". Hit Deploy when you're ready to push it live.");
			return true;
		} catch (err) {
			errSlot.appendChild(el("div", { class: "banner error" }, err.message || String(err)));
			window.scrollTo({ top: 0, behavior: "smooth" });
			return false;
		}
	}

	return wrap;
}

// — Section: Basics —
function secSpeciesBasics(d, ctx) {
	const idDisplay = el("code", {}, d.id || "(auto from name)");
	const namePart = field("Name", textInput(d, "name", { placeholder: "Pinkachu", onChange: () => {
		d.id = moveIdOf(d.name);
		idDisplay.textContent = d.id || "(auto from name)";
		if (ctx && ctx.titleEl) ctx.titleEl.textContent = d.name || "New Pokémon";
	} }), "The public name shown in the teambuilder, lobby, and battle.");
	const numPart = field("Pokédex number", textInput(d, "num", { type: "number" }), "Any unused number ≥ 10001 works.");

	const t1Host = el("div", { class: "type-pick" });
	const t2Host = el("div", { class: "type-pick" });
	function paintType1() {
		empty(t1Host);
		for (const t of TYPES) {
			const sel = d.types[0] === t;
			t1Host.appendChild(el("button", { type: "button", class: sel ? "selected" : "", style: { background: TYPE_COLORS[t] }, on: { click: () => { d.types[0] = t; if (d.types[1] === t) d.types = [t]; paintType1(); paintType2(); } } }, t));
		}
	}
	function paintType2() {
		empty(t2Host);
		t2Host.appendChild(el("button", { type: "button", class: !d.types[1] ? "selected-2" : "", style: { background: "#5d6678" }, on: { click: () => { d.types = [d.types[0]]; paintType2(); } } }, "none"));
		for (const t of TYPES) {
			if (t === d.types[0]) continue;
			const sel = d.types[1] === t;
			t2Host.appendChild(el("button", { type: "button", class: sel ? "selected-2" : "", style: { background: TYPE_COLORS[t] }, on: { click: () => { d.types[1] = t; paintType2(); } } }, t));
		}
	}
	paintType1(); paintType2();
	return el("div", {},
		el("div", { class: "grid-2" }, namePart, numPart),
		el("div", { class: "field" }, el("label", {}, "Internal ID"), el("div", { style: { fontSize: "13px", color: "var(--dim)" } }, idDisplay), el("div", { class: "hint" }, "Generated from the name — used in URLs and team imports.")),
		field("Primary type", t1Host, "Determines STAB, weaknesses, and resistances."),
		field("Secondary type", t2Host, "Pick \"none\" for a single-type Pokémon."),
	);
}

// — Section: Stats —
function secSpeciesStats(d) {
	function bst() { return STATS.reduce((s, k) => s + (d.baseStats[k] || 0), 0); }
	const bstEl = el("span", { class: "bst-num" }, String(bst()));
	const bstTagEl = el("span", { class: "bst-tag" }, "");
	function updateBst() {
		const total = bst();
		bstEl.textContent = String(total);
		let tag;
		if (total >= 720) tag = "Legendary tier — likely banned in most formats";
		else if (total >= 600) tag = "Pseudo-legendary tier";
		else if (total >= 525) tag = "Strong (OU territory)";
		else if (total >= 450) tag = "Solid (UU / RU territory)";
		else if (total >= 350) tag = "Modest";
		else tag = "Frail";
		bstTagEl.textContent = tag;
	}
	updateBst();
	const rows = STATS.map((s) => {
		const fill = el("div", { class: "fill", style: { width: ((d.baseStats[s] || 0) / 255 * 100) + "%", background: statColor(d.baseStats[s] || 0) } });
		const labelEl = el("div", { class: "label" }, String(d.baseStats[s] || 0));
		const range = el("input", { type: "range", min: 1, max: 255, value: d.baseStats[s] || 80, on: { input: (e) => {
			d.baseStats[s] = Number(e.target.value);
			fill.style.width = (d.baseStats[s] / 255 * 100) + "%";
			fill.style.background = statColor(d.baseStats[s]);
			labelEl.textContent = String(d.baseStats[s]);
			numInput.value = d.baseStats[s];
			updateBst();
		} } });
		const numInput = el("input", { type: "number", min: 1, max: 255, value: d.baseStats[s] || 80, on: { input: (e) => {
			const v = Math.max(1, Math.min(255, Number(e.target.value)));
			d.baseStats[s] = v;
			range.value = v;
			fill.style.width = (v / 255 * 100) + "%";
			fill.style.background = statColor(v);
			labelEl.textContent = String(v);
			updateBst();
		} } });
		return el("div", { class: "stat-row" },
			el("div", { class: "stat-name" }, STAT_NAMES[s]),
			el("div", { class: "stat-bar" }, fill, labelEl, range),
			el("div", { class: "stat-num" }, numInput),
		);
	});
	return el("div", {},
		el("div", {}, rows),
		el("div", { class: "bst-display" },
			el("div", {}, el("div", { style: { fontSize: "11px", color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 } }, "Base stat total"), bstEl),
			bstTagEl,
		),
	);
}

// — Section: Abilities —
function secSpeciesAbilities(d) {
	const datalistId = "ps-abilities-datalist";
	function knownNames() {
		const out = new Set();
		for (const n of (state.psAbilities || [])) out.add(n);
		for (const a of (state.customAbilities || [])) {
			if (a && a.data && a.data.name) out.add(a.data.name);
		}
		return Array.from(out).sort();
	}
	(function rebuildDatalist() {
		const existing = document.getElementById(datalistId);
		if (existing) existing.remove();
		const dl = el("datalist", { id: datalistId });
		for (const name of knownNames()) dl.appendChild(el("option", { value: name }));
		document.body.appendChild(dl);
	})();
	function isKnown(name) {
		const id = moveIdOf(name);
		return knownNames().some((n) => moveIdOf(n) === id);
	}
	function ability(slotKey, label, hint) {
		const input = el("input", { type: "text", list: datalistId, value: d.abilities[slotKey] || "", placeholder: "Start typing — e.g. Static, Levitate, Regenerator", on: { input: (e) => {
			const v = e.target.value;
			if (v) d.abilities[slotKey] = v;
			else delete d.abilities[slotKey];
			validate();
		} } });
		const warn = el("div", { class: "field-error", style: { display: "none" } });
		function validate() {
			const v = d.abilities[slotKey];
			if (!v || isKnown(v)) { warn.style.display = "none"; return; }
			warn.textContent = "\"" + v + "\" isn't a known ability. Create it under Abilities first, or pick from the dropdown.";
			warn.style.display = "block";
		}
		validate();
		return el("div", { class: "field" },
			el("label", {}, label),
			input,
			warn,
			hint ? el("div", { class: "hint" }, hint) : null,
		);
	}
	return el("div", {},
		el("p", { class: "sub" },
			"Type any standard or custom ability — autocomplete will help. To invent a new one, create it under ",
			el("a", { href: "#abilities" }, "Abilities"), " and it will appear here automatically."),
		el("div", { class: "grid-2" },
			ability("0", "First ability", "What most of this species will have."),
			ability("1", "Second ability (optional)", "Some are born with this instead."),
			ability("H", "Hidden ability (optional)", "Rare ability from special encounters."),
			ability("S", "Special ability (optional)", "Event or special-form ability."),
		),
	);
}

// — Section: Moves (the learnset, merged into the Pokémon editor) —
function secSpeciesMoves(d) {
	d._learnsetMoves = d._learnsetMoves || [];
	const ui = { q: "", typeFilter: "", catFilter: "" };
	const wrap = el("div", {});
	wrap.appendChild(el("p", { class: "sub" }, "Which moves this Pokémon can learn. Saved together with the Pokémon — no separate learnset step."));

	function inheritSearchMons() {
		const out = [];
		for (const s of state.customSpecies || []) out.push({ id: s.data.id, name: s.data.name, custom: true });
		for (const s of state.psSpecies || []) out.push({ id: s.id || moveIdOf(s.name), name: s.name, custom: false });
		return out;
	}

	const startingHost = el("div", {});
	function paintStarting() {
		empty(startingHost);
		if (d._learnsetMoves.length > 0) {
			startingHost.appendChild(el("div", { class: "ls-starting-summary" },
				el("span", {}, d._learnsetMoves.length + " moves in this learnset."),
				el("button", { class: "btn btn-ghost btn-sm", on: { click: () => {
					if (d._learnsetMoves.length && !confirm("Clear the current move list and start over?")) return;
					d._learnsetMoves = [];
					paintStarting(); rebuildLeft(); rebuildRight();
				} } }, "Clear & restart"),
			));
			return;
		}
		const inheritSearch = el("input", { type: "text", placeholder: "Type any Pokémon name (Charizard, Pikachu, your custom mon…)" });
		const inheritResults = el("div", { class: "ls-inherit-results" });
		const lib = inheritSearchMons();
		function paintInheritResults() {
			empty(inheritResults);
			const q = inheritSearch.value.toLowerCase().trim();
			if (!q) { inheritResults.appendChild(el("p", { class: "sub", style: { margin: ".4rem 0 0" } }, "Type a name to copy a Pokémon's whole learnset.")); return; }
			const matches = lib.filter((m) => m.name.toLowerCase().indexOf(q) >= 0).slice(0, 40);
			if (!matches.length) { inheritResults.appendChild(el("div", { class: "empty", style: { padding: ".5rem" } }, "No matches.")); return; }
			for (const m of matches) {
				inheritResults.appendChild(el("button", { class: "ls-inherit-pick", on: { click: () => doInherit(m) } },
					m.custom ? el("span", { style: { color: "var(--pink-strong)", marginRight: ".25rem" } }, "●") : null,
					m.name,
				));
			}
		}
		async function doInherit(mon) {
			setToast("info", "Loading " + mon.name + "'s learnset…");
			try {
				let moves = [];
				if (mon.custom) {
					const cl = (state.customLearnsets || []).find((l) => l.data && l.data.species === mon.id);
					if (cl && Array.isArray(cl.data.moves)) moves = cl.data.moves.map(moveNameOf);
					else {
						const r = await api("GET", "/api/ps-dex/learnset/" + mon.id);
						moves = r.moves || [];
					}
				} else {
					const r = await api("GET", "/api/ps-dex/learnset/" + mon.id);
					moves = r.moves || [];
				}
				if (!moves.length) { setToast("info", "No moves found for " + mon.name + "."); return; }
				d._learnsetMoves = moves;
				paintStarting(); rebuildLeft(); rebuildRight();
				setToast("success", "Copied " + moves.length + " moves from " + mon.name + ".");
			} catch (err) {
				setToast("error", "Couldn't fetch learnset: " + (err.message || "unknown"));
			}
		}
		inheritSearch.addEventListener("input", debounce(() => paintInheritResults(), 160));
		startingHost.appendChild(el("div", { class: "ls-starting-pick", style: { marginBottom: ".85rem" } },
			el("div", { class: "ls-starting-title" }, "How do you want to start?"),
			el("div", { class: "ls-starting-tiles" },
				el("button", { class: "ls-starting-tile", type: "button", on: { click: () => {
					d._learnsetMoves = []; paintStarting(); rebuildLeft(); rebuildRight();
					setToast("info", "Blank learnset — add moves from the list below.");
				} } },
					el("div", { class: "ls-tile-title" }, "Blank slate"),
					el("div", { class: "ls-tile-desc" }, "Start with no moves and pick each one yourself."),
				),
				el("div", { class: "ls-starting-tile ls-tile-inherit" },
					el("div", { class: "ls-tile-title" }, "Copy from another Pokémon"),
					el("div", { class: "ls-tile-desc" }, "Inherit the entire learnset of any custom or vanilla mon."),
					inheritSearch,
					inheritResults,
				),
			),
		));
		paintInheritResults();
	}

	function moveCatalog() {
		const ps = (state.psMoves || []);
		const customRaw = (state.customMoves || []);
		const custom = customRaw.map((c) => ({
			name: c.data.name,
			id: c.data.id,
			type: c.data.type || "Normal",
			category: c.data.category || "Status",
			basePower: c.data.basePower || 0,
			custom: true,
		}));
		const seen = new Set(custom.map((c) => c.id));
		return custom.concat(ps.filter((m) => !seen.has(m.id)));
	}
	function knows(name) {
		const id = moveIdOf(name);
		return d._learnsetMoves.some((m) => moveIdOf(m) === id);
	}
	function addMove(name) { if (!knows(name)) d._learnsetMoves.push(name); }
	function removeMove(name) {
		const id = moveIdOf(name);
		d._learnsetMoves = d._learnsetMoves.filter((m) => moveIdOf(m) !== id);
	}

	const leftHost = el("div", { class: "ls-list" });
	const rightHost = el("div", { class: "ls-list" });

	function rebuildRight() {
		empty(rightHost);
		if (d._learnsetMoves.length === 0) {
			rightHost.appendChild(el("div", { class: "empty", style: { padding: "1rem .5rem" } }, "No moves yet. Add from the left."));
			return;
		}
		const detail = (name) => moveCatalog().find((m) => moveIdOf(m.name) === moveIdOf(name));
		for (const name of d._learnsetMoves) {
			const m = detail(name);
			rightHost.appendChild(el("div", { class: "ls-move ls-known" },
				el("div", { class: "ls-move-name" }, name, m ? null : el("span", { class: "ls-move-warn", title: "Not a known move — make sure this matches a custom move ID" }, " ?")),
				el("button", { class: "wk-chip-x", on: { click: () => { removeMove(name); rebuildRight(); rebuildLeft(); paintStarting(); } } }, "×"),
				m ? el("div", { class: "ls-move-meta" },
					el("span", { class: "type-chip", style: { background: TYPE_COLORS[m.type] || "#888" } }, m.type),
					el("span", { class: "ls-cat ls-cat-" + (m.category || "Status").toLowerCase() }, m.category),
					m.basePower ? el("span", { class: "ls-bp" }, "BP " + m.basePower) : null,
				) : null,
			));
		}
	}
	function rebuildLeft() {
		empty(leftHost);
		const q = ui.q.toLowerCase().trim();
		const list = moveCatalog().filter((m) => {
			if (q && m.name.toLowerCase().indexOf(q) < 0) return false;
			if (ui.typeFilter && m.type !== ui.typeFilter) return false;
			if (ui.catFilter && m.category !== ui.catFilter) return false;
			return true;
		}).slice(0, 300);
		if (list.length === 0) {
			leftHost.appendChild(el("div", { class: "empty", style: { padding: "1rem .5rem" } }, "No moves match."));
			return;
		}
		for (const m of list) {
			const has = knows(m.name);
			const card = el("div", { class: "ls-move" + (has ? " ls-already" : ""),
				draggable: !has,
				on: {
					dragstart: (e) => {
						e.dataTransfer.setData("text/pinkacord-move", m.name);
						e.dataTransfer.effectAllowed = "copy";
					},
					dblclick: () => { if (!has) { addMove(m.name); rebuildRight(); rebuildLeft(); paintStarting(); } },
				},
			},
				el("div", { class: "ls-move-name" }, m.custom ? el("span", { style: { color: "var(--pink-strong)", marginRight: ".25rem" } }, "●") : null, m.name),
				has ? el("div", { class: "ls-already-tag" }, "added") : el("button", { class: "ls-add-btn", on: { click: () => { addMove(m.name); rebuildRight(); rebuildLeft(); paintStarting(); } } }, "+ Add"),
				el("div", { class: "ls-move-meta" },
					el("span", { class: "type-chip", style: { background: TYPE_COLORS[m.type] || "#888" } }, m.type),
					el("span", { class: "ls-cat ls-cat-" + (m.category || "Status").toLowerCase() }, m.category),
					m.basePower ? el("span", { class: "ls-bp" }, "BP " + m.basePower) : null,
				),
			);
			leftHost.appendChild(card);
		}
	}

	const rightZone = el("div", { class: "ls-zone", on: {
		dragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; rightZone.classList.add("wk-drag-over"); },
		dragleave: () => { rightZone.classList.remove("wk-drag-over"); },
		drop: (e) => {
			e.preventDefault();
			rightZone.classList.remove("wk-drag-over");
			const name = e.dataTransfer.getData("text/pinkacord-move");
			if (!name) return;
			addMove(name);
			rebuildRight(); rebuildLeft(); paintStarting();
		},
	} },
		el("div", { class: "ls-zone-head" },
			el("div", { class: "ls-zone-title" }, "Learns these moves"),
			el("div", { class: "ls-zone-sub" }, "Drag from the left, double-click, or click + Add."),
		),
		rightHost,
		(() => {
			const inp = el("input", { type: "text", placeholder: "Add a custom move ID and press Enter (e.g. pinkbolt)" });
			inp.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					const v = inp.value.trim();
					if (!v) return;
					addMove(v);
					inp.value = "";
					rebuildRight(); rebuildLeft(); paintStarting();
				}
			});
			return inp;
		})(),
	);

	const searchDebounce = debounce((fn) => fn(), 180);
	const search = el("input", { type: "text", placeholder: "Search moves…", value: ui.q, on: { input: (e) => { ui.q = e.target.value; searchDebounce(() => rebuildLeft()); } } });
	const typeSel = el("select", { on: { change: (e) => { ui.typeFilter = e.target.value; rebuildLeft(); } } },
		...[""].concat(TYPES).map((t) => el("option", { value: t }, t || "All types")));
	const catSel = el("select", { on: { change: (e) => { ui.catFilter = e.target.value; rebuildLeft(); } } },
		...[["", "All categories"], ["Physical", "Physical"], ["Special", "Special"], ["Status", "Status"]].map(([v, l]) => el("option", { value: v }, l)));

	rebuildLeft();
	rebuildRight();
	paintStarting();

	wrap.appendChild(startingHost);
	wrap.appendChild(el("div", { class: "ls-grid" },
		el("div", { class: "ls-pane" },
			el("div", { class: "ls-pane-head" },
				el("div", { class: "ls-pane-title" }, "All moves"),
				el("div", { class: "ls-pane-sub" }, "Standard + your custom moves (marked ●)."),
			),
			el("div", { class: "ls-pane-filters" }, search, typeSel, catSel),
			leftHost,
		),
		rightZone,
	));
	return wrap;
}

// — Section: Sprite —
function secSpeciesSprite(d) {
	const wrap = el("div", {});
	const box = el("div", { class: "sprite-uploader" });
	function refresh() {
		empty(box);
		const previewBox = el("div", { class: "preview-box" });
		if (d._stagedSprite) {
			previewBox.appendChild(el("img", { src: "data:image/png;base64," + d._stagedSprite }));
		} else if (d.id) {
			const img = el("img", { src: adminApiPath("/api/species/" + encodeURIComponent(d.id) + "/sprite/preview?ts=" + Date.now()) });
			img.onerror = () => { img.style.display = "none"; previewBox.appendChild(el("span", { style: { color: "var(--faint)" } }, icon("image", 26))); };
			previewBox.appendChild(img);
		} else {
			previewBox.appendChild(el("span", { style: { color: "var(--faint)" } }, icon("image", 26)));
		}
		box.appendChild(el("div", { class: "preview" },
			previewBox,
			el("div", { class: "preview-info" },
				el("strong", {}, "Sprite preview"),
				el("div", {}, "Recommended: 96 × 96 pixel PNG or GIF, ≤ 250 KB."),
				d._stagedSprite ? el("div", { style: { color: "var(--amber)", fontWeight: 600, marginTop: ".25rem" } }, "Staged — uploads when you Save.") : null,
				d.id && !d._stagedSprite ? el("div", { style: { fontSize: "11.5px", marginTop: ".25rem" } }, "Served from ", el("code", {}, "/sprites/pinkacord/" + d.id + ".png")) : null,
			),
		));
		const fileInput = el("input", { type: "file", accept: "image/png,image/gif", on: { change: async (e) => {
			const file = e.target.files[0];
			if (!file) return;
			if (file.size > 250 * 1024) { setToast("error", "Sprite too large: " + (file.size / 1024).toFixed(0) + " KB (max 250 KB)"); return; }
			const reader = new FileReader();
			reader.onload = () => {
				const base64 = String(reader.result).split(",")[1];
				d._stagedSprite = base64;
				setToast("info", "Sprite staged — it uploads when you Save.");
				refresh();
			};
			reader.readAsDataURL(file);
		} } });
		box.appendChild(fileInput);
		const btnRow = el("div", { style: { marginTop: ".55rem", display: "flex", gap: ".4rem" } });
		if (d._stagedSprite) {
			btnRow.appendChild(el("button", { class: "btn btn-quiet btn-sm", on: { click: () => { delete d._stagedSprite; refresh(); } } }, "Clear staged sprite"));
		}
		if (d.id && state.editor && state.editor.existingId) {
			btnRow.appendChild(el("button", { class: "btn btn-danger btn-sm", on: { click: async () => {
				if (!confirm("Remove sprite for " + d.id + "?")) return;
				try {
					await api("DELETE", "/api/species/" + encodeURIComponent(d.id) + "/sprite");
					markPendingChange();
					setToast("success", "Sprite removed.");
					refresh();
				} catch (err) { setToast("error", "Delete failed: " + (err.message || "unknown")); }
			} } }, icon("trash", 13), "Remove sprite"));
		}
		box.appendChild(btnRow);
	}
	refresh();
	wrap.appendChild(box);
	return wrap;
}

// — Section: Extras —
function secSpeciesExtras(d) {
	const eggGroups = (idx) => el("select", { on: { change: (e) => { if (e.target.value === "—") d.eggGroups = d.eggGroups.filter((_, i) => i !== idx); else { d.eggGroups[idx] = e.target.value; } } } },
		el("option", { value: "—" }, "—"),
		...EGG_GROUPS.map((g) => el("option", { value: g, selected: d.eggGroups[idx] === g }, g)),
	);
	return el("div", {},
		el("div", { class: "grid-3" },
			field("Height (m)", textInput(d, "heightm", { type: "number" }), "Mostly flavor."),
			field("Weight (kg)", textInput(d, "weightkg", { type: "number" }), "Used by Heat Crash etc."),
			field("Color", selectInput(d, "color", COLORS), "Pokédex flavor."),
			field("Egg group 1", eggGroups(0), null, "Breeding compatibility."),
			field("Egg group 2 (optional)", eggGroups(1)),
			null,
			field("Singles tier", selectInput(d, "tier", TIERS), null, "Intended competitive bracket."),
			field("Doubles tier", selectInput(d, "doublesTier", DOUBLES_TIERS)),
		),
	);
}

// ─── Entity lists (moves / abilities / items) ────────────────────────────────
function entityTitle(type) {
	const t = { species: "Pokémon", moves: "Move", abilities: "Ability", items: "Item", formats: "Format" };
	return t[type] || type;
}
function defaultEntity(type) {
	if (type === "moves") return { id: "", num: 9001, name: "", type: "Normal", category: "Special", basePower: 80, accuracy: 100, pp: 15, priority: 0, target: "normal", shortDesc: "", flags: {} };
	if (type === "abilities") return { id: "", name: "", shortDesc: "", effects: [] };
	if (type === "items") return { id: "", num: 9001, name: "", shortDesc: "", effects: [] };
	if (type === "formats") return { id: "", name: "[Pinkacord] ", mod: "pinkacord", section: "Pinkacord", column: 1, desc: "", gameType: "singles", ruleset: ["Standard"], banlist: [], unbanlist: [], sharedPower: false, enabled: true };
	return {};
}

function renderEntityList(type, label, iconName, subtitle) {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "page-head" },
		el("div", {},
			el("h1", {}, label),
			el("div", { class: "sub" }, subtitle || ""),
		),
		el("div", { class: "actions" },
			el("button", { class: "btn btn-primary", on: { click: () => openDrawer(type, null) } }, icon("plus", 14), "New " + entityTitle(type).toLowerCase()),
		),
	));
	const filter = { q: "", extra: "" };
	let all = [];
	const searchDebounce = debounce((fn) => fn(), 180);
	const toolbar = el("div", { class: "list-toolbar" },
		searchBox("Search by name or id…", (e) => { filter.q = e.target.value; searchDebounce(() => rebuild()); }),
	);
	if (type === "moves") {
		toolbar.appendChild(el("select", { on: { change: (e) => { filter.extra = e.target.value; rebuild(); } } },
			...[""].concat(TYPES).map((t) => el("option", { value: t }, t || "All types"))));
	}
	wrap.appendChild(toolbar);
	const slot = el("div", {});
	wrap.appendChild(slot);
	function rebuild() {
		empty(slot);
		if (all.length === 0) {
			slot.appendChild(el("div", { class: "empty" },
				el("div", { class: "big" }, icon(iconName, 32)),
				el("div", {}, "No custom " + label.toLowerCase() + " yet."),
				el("div", { style: { marginTop: "1rem" } }, el("button", { class: "btn btn-primary", on: { click: () => openDrawer(type, null) } }, icon("plus", 14), "Create your first")),
			));
			return;
		}
		const q = filter.q.toLowerCase().trim();
		const items = all.filter((it) => {
			const d = it.data;
			if (q) {
				const blob = ((d.name || "") + " " + (d.id || "")).toLowerCase();
				if (blob.indexOf(q) < 0) return false;
			}
			if (filter.extra && type === "moves" && d.type !== filter.extra) return false;
			return true;
		});
		if (items.length === 0) {
			slot.appendChild(el("div", { class: "empty" }, "No " + label.toLowerCase() + " match those filters."));
			return;
		}
		const list = el("div", { class: "row-list" });
		for (const it of items) list.appendChild(entityRow(type, it));
		slot.appendChild(list);
	}
	slot.appendChild(el("div", { class: "empty" }, "Loading…"));
	api("GET", "/api/" + type).then((r) => {
		all = r.items || [];
		rebuild();
	}).catch((err) => {
		empty(slot);
		slot.appendChild(el("div", { class: "banner error" }, err.message));
	});
	return wrap;
}

function entityRow(type, it) {
	const d = it.data;
	const open = () => type === "formats" ? openFormatEditor(it) : openDrawer(type, it);
	const meta = el("div", { class: "rmeta" });
	if (type === "moves") {
		meta.appendChild(typeChip(d.type));
		meta.appendChild(el("span", {}, d.category + " · " + (d.basePower || 0) + " BP · " + (d.accuracy === true ? "—" : d.accuracy + "%") + " acc · " + (d.pp || 0) + " PP"));
	} else if (type === "abilities" || type === "items") {
		meta.appendChild(el("span", {}, d.shortDesc || "No description"));
		if (type === "abilities" && d.customHandlerCode) meta.appendChild(el("span", { class: "pill accent" }, "custom code"));
		if ((d.effects || []).length) meta.appendChild(el("span", { class: "pill" }, (d.effects || []).length + " effect" + ((d.effects || []).length === 1 ? "" : "s")));
	} else if (type === "formats") {
		meta.appendChild(el("span", {}, (d.section || "Pinkacord") + " · " + (d.mod || "?") + " · " + (d.gameType || "singles")));
		if (d.team) meta.appendChild(el("span", { class: "pill" }, d.team === "random" ? "random teams" : d.team));
		if (d.sharedPower) meta.appendChild(el("span", { class: "pill accent" }, "Shared Power"));
		if (d.enabled === false) meta.appendChild(el("span", { class: "pill warn" }, "hidden"));
	}
	return el("div", { class: "row", on: { click: open } },
		el("div", { class: "rbody" },
			el("div", { class: "rname" }, d.name || d.id),
			meta,
		),
		el("div", { class: "row-actions" },
			el("button", { class: "btn btn-ghost btn-icon", title: "Duplicate", on: { click: (e) => { e.stopPropagation(); duplicateEntity(type, it); } } }, icon("copy", 14)),
			el("button", { class: "btn btn-danger btn-icon", title: "Delete", on: { click: (e) => { e.stopPropagation(); confirmDelete(type, it); } } }, icon("trash", 14)),
		),
	);
}
function duplicateEntity(type, it) {
	const clone = deepClone(it.data);
	clone.name = (clone.name || "New") + " Copy";
	clone.id = "";
	if (typeof clone.num === "number") clone.num = clone.num + 1;
	const prefill = { id: "", _rev: null, data: clone };
	if (type === "formats") openFormatEditor(prefill);
	else openDrawer(type, prefill);
}

// ─── Drawer editor (moves / abilities / items) ───────────────────────────────
function openDrawer(type, existing) {
	const looksLikeNewWithPrefill = existing && (!existing.id || !existing._rev) && existing.data;
	let prefill = null;
	if (looksLikeNewWithPrefill) { prefill = deepClone(existing.data); existing = null; }
	const data = existing ? deepClone(existing.data) : (prefill || defaultEntity(type));
	const rev = existing ? existing._rev : null;
	const overlay = el("div", { class: "modal-overlay" });
	let isClosed = false;
	function close() {
		if (isClosed) return;
		isClosed = true;
		if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
		document.removeEventListener("keydown", onKey);
	}
	function onKey(e) {
		if (e.key === "Escape") { e.stopPropagation(); close(); return; }
		if (e.key === "Tab") {
			const focusable = overlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) { e.preventDefault(); last.focus(); }
			} else {
				if (document.activeElement === last) { e.preventDefault(); first.focus(); }
			}
		}
	}
	document.addEventListener("keydown", onKey);
	overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

	const errSlot = el("div", {});
	const bodySlot = el("div", { class: "modal-body" });
	bodySlot.appendChild(errSlot);
	bodySlot.appendChild(
		type === "moves" ? renderMoveForm(data) :
		type === "abilities" ? renderAbilityForm(data) :
		type === "items" ? renderItemForm(data) :
		el("div", {}, "Unknown entity type"),
	);

	function highlightFieldError(errorText) {
		bodySlot.querySelectorAll(".field.is-invalid").forEach((n) => n.classList.remove("is-invalid"));
		const key = errorText.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
		if (!key) return false;
		const candidates = bodySlot.querySelectorAll('[data-field="' + key + '"]');
		for (const n of candidates) {
			const f = n.closest(".field") || n;
			f.classList.add("is-invalid"); f.scrollIntoView({ behavior: "smooth", block: "center" });
			return true;
		}
		return false;
	}

	async function save(opts) {
		empty(errSlot);
		bodySlot.querySelectorAll(".field.is-invalid").forEach((n) => n.classList.remove("is-invalid"));
		try {
			const url = "/api/" + type + (existing ? "/" + encodeURIComponent(existing.id) : "");
			const method = existing ? "PUT" : "POST";
			const body = data;
			if (existing && rev) body.__rev = rev;
			const headers = { "X-Pinkacord-Admin": "1", "Content-Type": "application/json" };
			if (existing && rev) headers["If-Match"] = rev;
			const r = await fetch(adminApiPath(url), { method, headers, credentials: "same-origin", body: JSON.stringify(body) });
			const json = await r.json().catch(() => ({ ok: false, message: "bad response" }));
			if (!r.ok || !json.ok) {
				errSlot.appendChild(el("div", { class: "banner error" }, json.message || r.statusText));
				if (json.fieldErrors) {
					for (const fe of json.fieldErrors) {
						errSlot.appendChild(el("div", { class: "field-error" }, "• " + fe));
						highlightFieldError(fe);
					}
				}
				bodySlot.scrollTop = 0;
				return false;
			}
			await refreshEntityCache(type);
			markPendingChange();
			close();
			if (opts && opts.thenBuild) { render(); await doBuildAndApply(); return true; }
			setToast("success", "Saved " + (data.name || data.id) + ". Hit Deploy when you're ready to push it live.");
			render();
			return true;
		} catch (err) { errSlot.appendChild(el("div", { class: "banner error" }, err.message)); return false; }
	}

	const drawer = el("div", { class: "modal" },
		el("div", { class: "modal-head" },
			el("h2", {}, (existing ? "Edit " : "New ") + entityTitle(type).toLowerCase()),
			el("button", { class: "x", on: { click: close } }, icon("x", 16)),
		),
		bodySlot,
		el("div", { class: "modal-foot" },
			el("div", { class: "note" }, existing ? "Saved changes aren't live until you Deploy" : "Added on save — Deploy to push live"),
			el("div", { style: { display: "flex", gap: ".5rem" } },
				el("button", { class: "btn btn-quiet", on: { click: close } }, "Cancel"),
				el("button", { class: "btn", on: { click: () => save() } }, "Save"),
				el("button", { class: "btn btn-primary", on: { click: () => save({ thenBuild: true }) } }, icon("rocket", 14), state.hosted ? "Save & publish" : "Save & deploy"),
			),
		),
	);
	overlay.appendChild(drawer);
	document.body.appendChild(overlay);
	const firstInput = drawer.querySelector("input, textarea");
	if (firstInput) firstInput.focus();
}

// ─── Move form ───────────────────────────────────────────────────────────────
function accuracyControl(d) {
	const isAlwaysHit = d.accuracy === true;
	const numInput = el("input", { type: "number", value: isAlwaysHit ? "" : (d.accuracy != null ? d.accuracy : 100), min: 1, max: 100, disabled: isAlwaysHit, on: { input: (e) => { d.accuracy = Number(e.target.value); } } });
	const cb = el("input", { type: "checkbox", checked: isAlwaysHit, style: { width: "auto" }, on: { change: (e) => {
		if (e.target.checked) { d.accuracy = true; numInput.disabled = true; numInput.value = ""; }
		else { d.accuracy = 100; numInput.disabled = false; numInput.value = "100"; }
	} } });
	return el("div", { style: { display: "flex", gap: ".75rem", alignItems: "center" } },
		numInput,
		el("label", { style: { display: "inline-flex", gap: ".3rem", fontWeight: "normal", alignItems: "center", whiteSpace: "nowrap", fontSize: "13px", color: "var(--dim)" } }, cb, "Always hits"),
	);
}
function renderMoveForm(d) {
	d.flags = d.flags || {};
	function autoId() {
		if (d.name) d.id = moveIdOf(d.name);
		const idEl = $(".js-move-id"); if (idEl) idEl.value = d.id || "";
	}
	const flagChips = ["contact", "protect", "mirror", "sound", "punch", "bite", "slicing", "bullet", "powder", "heal"].map((f) => {
		const cb = el("input", { type: "checkbox", checked: d.flags[f] === 1, style: { width: "auto" }, on: { change: (e) => { if (e.target.checked) d.flags[f] = 1; else delete d.flags[f]; } } });
		return el("label", { style: { display: "inline-flex", gap: ".3rem", marginRight: ".75rem", marginBottom: ".3rem", fontWeight: "normal", alignItems: "center", fontSize: "13px", color: "var(--dim)" } }, cb, f);
	});
	return el("div", {},
		el("div", { class: "grid-2" },
			field("Name", textInput(d, "name", { placeholder: "Pink Bolt", onChange: autoId }), "Public move name."),
			field("ID", el("input", { type: "text", class: "js-move-id", value: d.id || "", on: { input: (e) => { d.id = e.target.value; } } }), "Lowercase, no spaces. Auto-fills from name."),
			field("Move number", textInput(d, "num", { type: "number" }), "Unique, must be ≥ 9001."),
			field("Type", selectInput(d, "type", TYPES)),
			field("Category", selectInput(d, "category", ["Physical", "Special", "Status"]), "Physical = Atk/Def · Special = SpA/SpD · Status = no damage."),
			field("Base power", textInput(d, "basePower", { type: "number" }), "0 for Status moves."),
			field("Accuracy", accuracyControl(d)),
			field("PP", textInput(d, "pp", { type: "number" }), "Typical range 5–40."),
			field("Priority", textInput(d, "priority", { type: "number" }), "0 normal, +1 Quick Attack style."),
		),
		field("Short description", textInput(d, "shortDesc"), "Shown in /dt and tooltips."),
		field("Flags", el("div", {}, flagChips), "What this move can be blocked or boosted by."),
	);
}

// ─── Ability form (effects registry + AI designer) ───────────────────────────
function effectsBuilder(d, filterPrefix) {
	const effectsHost = el("div", {});
	function rebuildEffects() {
		empty(effectsHost);
		d.effects = d.effects || [];
		const kinds = (state.effects || []).filter((k) => !filterPrefix || k.id.startsWith(filterPrefix));
		if (d.effects.length === 0) {
			effectsHost.appendChild(el("div", { style: { color: "var(--faint)", fontSize: "12.5px", padding: ".4rem 0" } }, "No effects yet."));
		}
		d.effects.forEach((ef, idx) => {
			const kindSel = el("select", { on: { change: (e) => { ef.kind = e.target.value; ef.params = {}; rebuildEffects(); } } },
				el("option", { value: "" }, "Pick what this does…"),
				...kinds.map((k) => el("option", { value: k.id, selected: ef.kind === k.id }, k.id + " — " + k.description)),
			);
			const paramHost = el("div", { class: "grid-2", style: { marginTop: ".5rem" } });
			const kindDef = (state.effects || []).find((k) => k.id === ef.kind);
			if (kindDef && kindDef.paramFields) {
				for (const fname of kindDef.paramFields) {
					paramHost.appendChild(field(fname, el("input", { type: "text", value: ef.params[fname] != null ? ef.params[fname] : "", on: { input: (e) => { const v = e.target.value; const n = Number(v); ef.params[fname] = isNaN(n) || v === "" ? v : n; } } })));
				}
			}
			effectsHost.appendChild(el("div", { class: "effect-block" },
				el("div", { class: "ehead" },
					el("strong", {}, "EFFECT " + (idx + 1)),
					el("button", { class: "btn btn-danger btn-sm", on: { click: () => { d.effects.splice(idx, 1); rebuildEffects(); } } }, "Remove"),
				),
				kindSel,
				paramHost,
			));
		});
		effectsHost.appendChild(el("button", { class: "btn btn-quiet btn-sm", on: { click: () => { d.effects.push({ kind: "", params: {} }); rebuildEffects(); } } }, icon("plus", 13), "Add effect manually"));
	}
	rebuildEffects();
	return { host: effectsHost, rebuild: rebuildEffects };
}

function renderAbilityForm(d) {
	function autoId() {
		if (d.name) d.id = moveIdOf(d.name);
		const idEl = $(".js-ability-id"); if (idEl) idEl.value = d.id || "";
	}
	const effects = effectsBuilder(d, null);
	const nlText = el("textarea", { rows: 3, placeholder: "Describe ANYTHING — e.g. \"30% chance to paralyze on contact\", \"Switch out when hit for 33% HP\", \"Doubles defense in sand\". AI can invent abilities that don't exist yet." });
	const nlOut = el("div", {});
	const customCodeHost = el("div", {});

	function renderCustomCode() {
		empty(customCodeHost);
		if (!d.customHandlerCode) return;
		const wrap = el("div", { class: "code-block" });
		wrap.appendChild(el("div", { class: "chead" },
			el("span", {}, "Custom handler code (AI-generated — review before saving)"),
			el("button", { class: "btn btn-ghost btn-sm", on: { click: () => { d.customHandlerCode = ""; renderCustomCode(); } } }, "Remove"),
		));
		const ta = el("textarea", { rows: Math.min(14, Math.max(4, d.customHandlerCode.split("\n").length + 1)), value: d.customHandlerCode, on: { input: (e) => { d.customHandlerCode = e.target.value; } } });
		wrap.appendChild(ta);
		wrap.appendChild(el("div", { style: { color: "var(--faint)", fontSize: "11.5px", marginTop: ".4rem" } }, "Goes verbatim into the generated ability. The smoke test catches syntax errors, not logic bugs."));
		customCodeHost.appendChild(wrap);
	}

	function renderParseResult(result) {
		empty(nlOut);
		if (result.shortDescription) {
			nlOut.appendChild(el("div", { class: "banner success", style: { marginTop: ".6rem", marginBottom: ".4rem" } },
				el("div", { style: { fontWeight: 600, marginBottom: ".15rem" } }, (result.approach === "custom" ? "Wrote a custom handler" : result.approach === "mixed" ? "Combined effects + custom code" : "Composed from safe building blocks")),
				el("div", {}, result.shortDescription),
				result.explanation ? el("div", { style: { opacity: .8, fontStyle: "italic", marginTop: ".15rem" } }, result.explanation) : null,
			));
		}
		if (result.matchedPatterns && result.matchedPatterns.length) {
			nlOut.appendChild(el("div", { class: "banner success", style: { marginBottom: ".4rem" } },
				el("div", { style: { fontWeight: 600 } }, "Parsed " + result.matchedPatterns.length + " effect(s):"),
				el("ul", { style: { margin: ".2rem 0 0", paddingLeft: "1.25rem" } },
					result.matchedPatterns.map((m) => el("li", {}, m))),
			));
		}
		if (result.warnings && result.warnings.length) {
			nlOut.appendChild(el("div", { class: "banner info", style: { marginBottom: ".4rem" } },
				el("strong", {}, "Couldn't translate everything:"),
				el("ul", { style: { margin: ".25rem 0 0", paddingLeft: "1.25rem" } },
					result.warnings.map((w) => el("li", {}, w))),
				result.llmAvailable === false ? el("div", { style: { marginTop: ".4rem" } }, "Tip: enable the AI translator by setting ", el("code", {}, "LLM_API_KEY"), " (free key at console.groq.com).") : null,
			));
		}
	}

	function applyAbilityDesign(r) {
		renderParseResult(r);
		if (r.effects && r.effects.length) {
			d.effects = (d.effects || []).concat(r.effects);
			effects.rebuild();
		}
		if (r.customHandlerCode) {
			d.customHandlerCode = (d.customHandlerCode ? d.customHandlerCode.trim() + "\n" : "") + r.customHandlerCode;
			renderCustomCode();
		}
		if (r.shortDescription && !d.shortDesc) {
			d.shortDesc = r.shortDescription;
			const sd = $(".js-ability-shortdesc"); if (sd) sd.value = d.shortDesc;
		}
	}

	async function doAutoCreate() {
		const txt = nlText.value.trim();
		if (!txt) { setToast("info", "Type your idea first — e.g. \"30% paralyze on contact\"."); return; }
		setToast("info", "Designing the ability…");
		try {
			const r = await api("POST", "/api/mechanics/design", { text: txt });
			if (r.target === "format") {
				setToast("info", "That sounds like a format rule. Open Formats → create a format and use the AI box there.", 10000);
				return;
			}
			applyAbilityDesign(r);
			setToast("success", r.usedAI ? "Built with AI — review below, then Save." : "Built from your description — review below, then Save.");
		} catch (err) {
			setToast("error", "Designer failed: " + (err.message || "unknown"));
		}
	}
	async function doParse(useAI) {
		const txt = nlText.value.trim();
		if (!txt) { setToast("info", "Type a description first."); return; }
		const url = useAI ? "/api/abilities/parse-ai" : "/api/abilities/parse";
		setToast("info", useAI ? "AI is thinking…" : "Translating…");
		try {
			const r = await api("POST", url, { text: txt });
			applyAbilityDesign(r);
		} catch (err) {
			if (err.code === "not_configured") {
				setToast("error", "AI not set up. Get a free key at console.groq.com → add LLM_API_KEY → restart the launcher.", 12000);
			} else {
				setToast("error", (useAI ? "AI" : "Pattern") + " parser failed: " + (err.message || "unknown"));
			}
		}
	}

	renderCustomCode();

	return el("div", {},
		el("div", { class: "grid-2" },
			field("Name", textInput(d, "name", { placeholder: "Rose Aura", onChange: autoId }), "Public ability name."),
			field("ID", el("input", { type: "text", class: "js-ability-id", value: d.id || "", on: { input: (e) => { d.id = e.target.value; } } }), "Auto-fills from the name."),
		),
		field("Short description", el("input", { type: "text", class: "js-ability-shortdesc", value: d.shortDesc || "", placeholder: "Shown in /dt and tooltips", on: { input: (e) => { d.shortDesc = e.target.value; } } })),
		el("div", { class: "nl-box" },
			el("div", { class: "nl-title" }, icon("wand", 15), "Describe what this ability does"),
			el("p", {}, "Plain English in, working ability out. Instant patterns are tried first, then AI for wild ideas."),
			nlText,
			el("div", { style: { display: "flex", gap: ".5rem", marginTop: ".55rem", flexWrap: "wrap", alignItems: "center" } },
				el("button", { class: "btn btn-primary", on: { click: () => doAutoCreate() } }, icon("wand", 14), "Generate"),
				el("button", { class: "btn btn-ghost btn-sm", title: "Instant pattern matcher only — no AI call", on: { click: () => doParse(false) } }, "Patterns only"),
				el("button", { class: "btn btn-ghost btn-sm", title: "Send straight to the AI", on: { click: () => doParse(true) } }, "AI only"),
			),
			nlOut,
		),
		field("Effects", effects.host, "What was generated (or added manually). Edit or remove freely."),
		customCodeHost,
	);
}

// ─── Item form ───────────────────────────────────────────────────────────────
function renderItemForm(d) {
	function autoId() {
		if (d.name) d.id = moveIdOf(d.name);
		const idEl = $(".js-item-id"); if (idEl) idEl.value = d.id || "";
	}
	const effects = effectsBuilder(d, "item");
	return el("div", {},
		el("div", { class: "grid-2" },
			field("Name", textInput(d, "name", { placeholder: "Pink Berry", onChange: autoId }), "Public item name."),
			field("ID", el("input", { type: "text", class: "js-item-id", value: d.id || "", on: { input: (e) => { d.id = e.target.value; } } }), "Lowercase, no spaces."),
		),
		field("Number", textInput(d, "num", { type: "number" }), "Unique, must be ≥ 9001."),
		field("Short description", textInput(d, "shortDesc", { placeholder: "What this item does in battle." })),
		field("Effects", effects.host, "Define what this item does using approved effect templates."),
	);
}

// ─── Formats list ────────────────────────────────────────────────────────────
function renderFormatsList() {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "page-head" },
		el("div", {},
			el("h1", {}, "Formats"),
			el("div", { class: "sub" }, "The battle formats your server offers — rules, bans, clauses, and special mechanics."),
		),
		el("div", { class: "actions" },
			el("button", { class: "btn btn-primary", on: { click: () => openFormatEditor(null) } }, icon("plus", 14), "New format"),
		),
	));
	const filter = { q: "", extra: "" };
	let all = [];
	const searchDebounce = debounce((fn) => fn(), 180);
	const toolbar = el("div", { class: "list-toolbar" },
		searchBox("Search formats…", (e) => { filter.q = e.target.value; searchDebounce(() => rebuild()); }),
		el("select", { on: { change: (e) => { filter.extra = e.target.value; rebuild(); } } },
			el("option", { value: "" }, "All dexes"),
			...["pinkacord", "gen9", "gen8", "gen7", "gen6", "gen5", "gen4", "gen3", "gen2", "gen1"].map((m) => el("option", { value: m }, m))),
	);
	wrap.appendChild(toolbar);
	const slot = el("div", {});
	wrap.appendChild(slot);
	function rebuild() {
		empty(slot);
		if (all.length === 0) {
			slot.appendChild(el("div", { class: "empty" },
				el("div", { class: "big" }, icon("trophy", 32)),
				el("div", {}, "No custom formats yet."),
				el("div", { style: { marginTop: "1rem" } }, el("button", { class: "btn btn-primary", on: { click: () => openFormatEditor(null) } }, icon("plus", 14), "Create your first format")),
			));
			return;
		}
		const q = filter.q.toLowerCase().trim();
		const items = all.filter((it) => {
			const d = it.data;
			if (q && ((d.name || "") + " " + (d.id || "")).toLowerCase().indexOf(q) < 0) return false;
			if (filter.extra && d.mod !== filter.extra) return false;
			return true;
		});
		if (items.length === 0) {
			slot.appendChild(el("div", { class: "empty" }, "No formats match those filters."));
			return;
		}
		const list = el("div", { class: "row-list" });
		for (const it of items) list.appendChild(entityRow("formats", it));
		slot.appendChild(list);
	}
	slot.appendChild(el("div", { class: "empty" }, "Loading…"));
	api("GET", "/api/formats").then((r) => {
		all = r.items || [];
		state.customFormats = all;
		rebuild();
	}).catch((err) => {
		empty(slot);
		slot.appendChild(el("div", { class: "banner error" }, err.message));
	});
	return wrap;
}

// ─── Format editor — registry of clauses, tier presets, common bans ─────────
const KNOWN_CLAUSES = [
	{ id: "Standard", label: "Standard ruleset", desc: "Pulls in the basic competitive rules. Almost every format starts with this — leave it on.", required: true },
	{ id: "Sleep Clause Mod", label: "Sleep Clause", desc: "Only one of the opponent's Pokémon can be put to sleep at a time. Prevents Spore-spam strategies." },
	{ id: "Species Clause", label: "Species Clause", desc: "Players can't use two Pokémon of the same species in their team." },
	{ id: "Item Clause", label: "Item Clause", desc: "No two Pokémon on a team can hold the same item." },
	{ id: "OHKO Clause", label: "OHKO Clause", desc: "Bans one-hit-KO moves like Sheer Cold, Horn Drill, Fissure, Guillotine." },
	{ id: "Evasion Items Clause", label: "Evasion Items Clause", desc: "Bans items that boost evasion (Bright Powder, Lax Incense)." },
	{ id: "Evasion Moves Clause", label: "Evasion Moves Clause", desc: "Bans moves that boost evasion (Double Team, Minimize)." },
	{ id: "Evasion Abilities Clause", label: "Evasion Abilities Clause", desc: "Bans abilities that boost evasion (Sand Veil, Snow Cloak)." },
	{ id: "Endless Battle Clause", label: "Endless Battle Clause", desc: "Prevents infinite stalling (e.g. PP-recover loops)." },
	{ id: "HP Percentage Mod", label: "HP shown as %", desc: "Show enemy HP as a percentage instead of leaving it hidden." },
	{ id: "Cancel Mod", label: "Move cancel", desc: "Players can change their move choice until the timer runs out." },
	{ id: "Sleep Moves Clause", label: "Sleep Moves Clause", desc: "Bans sleep-inducing moves entirely (instead of Sleep Clause Mod)." },
	{ id: "Z-Move Clause", label: "Z-Move Clause", desc: "Bans Z-Moves outright (gen 7-only mechanic)." },
	{ id: "Dynamax Clause", label: "Dynamax Clause", desc: "Bans Dynamax / Gigantamax (gen 8 mechanic)." },
	{ id: "Mega Rayquaza Clause", label: "Mega Rayquaza Clause", desc: "Prevents Rayquaza from Mega Evolving (knowing Dragon Ascent)." },
	{ id: "Force Open Team Sheet", label: "Open Team Sheet", desc: "Both players see each other's teams (no Pokémon, items, or moves are hidden)." },
];

const TIER_PRESETS = {
	OU: { banlist: ["Uber", "AG", "Moody", "Shadow Tag", "Arena Trap", "King's Rock", "Razor Fang", "Baton Pass", "Last Respects", "Shed Tail", "Tera Blast"], note: "Standard OverUsed gen 9 banlist." },
	Ubers: { banlist: ["AG", "Moody", "King's Rock", "Razor Fang", "Baton Pass", "Last Respects"], note: "Ubers — anything but Anything Goes." },
	UU: { banlist: ["OU", "UUBL"], note: "Inherits OU + bans OU mons." },
	RU: { banlist: ["UU", "RUBL", "Light Clay"], note: "Inherits UU + bans UU mons." },
	NU: { banlist: ["RU", "NUBL", "Drought", "Quick Claw"], note: "Inherits RU + bans RU mons." },
	PU: { banlist: ["NU", "PUBL", "Damp Rock"], note: "Inherits NU + bans NU mons." },
	LC: { banlist: ["Moody", "Heat Rock", "Baton Pass", "Sticky Web"], note: "Little Cup — only NFE Pokémon at level 5. Set ruleset to Little Cup separately." },
	AG: { banlist: [], note: "Anything Goes — no Pokémon, item, ability, or move is banned." },
};

// ── Parametric-rule helpers (PS "LHS = N" rules in d.ruleset[]) ─────────────
function fmtGetParam(d, lhs) {
	d.ruleset = d.ruleset || [];
	const pre = lhs + " = ";
	for (const r of d.ruleset) if (r.startsWith(pre)) return r.slice(pre.length).trim();
	return null;
}
function fmtSetParam(d, lhs, value) {
	d.ruleset = d.ruleset || [];
	const pre = lhs + " = ";
	d.ruleset = d.ruleset.filter((r) => !r.startsWith(pre));
	if (value !== null && value !== "" && value !== undefined) d.ruleset.push(lhs + " = " + String(value));
}
function fmtHasRule(d, rule) { return (d.ruleset || []).includes(rule); }
function fmtToggleRule(d, rule, on) {
	d.ruleset = d.ruleset || [];
	if (on) { if (!d.ruleset.includes(rule)) d.ruleset.push(rule); }
	else { d.ruleset = d.ruleset.filter((r) => r !== rule); }
}
function normalizeName(s) { return String(s).replace(/^[+\-*]/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }

// banlist[]/unbanlist[] are flat strings — categorize by dex lookup so the UI
// can show separate panes for Pokémon / Items / Moves / Abilities.
function categorizePoolEntry(entry) {
	const bare = String(entry).replace(/^[+\-*]/, "").trim();
	const bid = bare.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (!bid) return "unknown";
	const inDex = (arr) => (arr || []).some((x) => {
		const n = typeof x === "string" ? x : (x && x.name) || "";
		return n.toLowerCase().replace(/[^a-z0-9]/g, "") === bid;
	});
	if (inDex((state.customSpecies || []).map((s) => s.data && s.data.name))) return "species";
	if (inDex(state.psSpecies)) return "species";
	if (inDex((state.customMoves || []).map((m) => m.data && m.data.name))) return "moves";
	if (inDex(state.psMoves)) return "moves";
	if (inDex((state.customAbilities || []).map((a) => a.data && a.data.name))) return "abilities";
	if (inDex(state.psAbilities)) return "abilities";
	const tiers = ["AG", "Uber", "Ubers", "OU", "UU", "UUBL", "RU", "RUBL", "NU", "NUBL", "PU", "PUBL", "ZU", "ZUBL", "NFE", "LC"];
	if (tiers.some((t) => t.toLowerCase() === bare.toLowerCase())) return "species";
	return "other";
}

// ── Format presets ──────────────────────────────────────────────────────────
const FORMAT_PRESETS = [
	{ id: "ou", title: "OU (Standard)", desc: "Smogon OverUsed — the most popular competitive ruleset.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Moody", "Shadow Tag", "Arena Trap", "King's Rock", "Razor Fang", "Baton Pass", "Last Respects", "Shed Tail"]; d.unbanlist = []; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] OU"; if (!d.desc) d.desc = "OU rules on the Pinkacord dex."; } },
	{ id: "ubers", title: "Ubers", desc: "Anything except AG and a few broken combos.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["AG", "Moody", "King's Rock", "Razor Fang", "Baton Pass", "Last Respects"]; d.unbanlist = []; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Ubers"; } },
	{ id: "ag", title: "Anything Goes", desc: "No bans. Mostly for testing & jank.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = []; d.unbanlist = []; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] AG"; } },
	{ id: "random", title: "Random Battle", desc: "Server generates teams each battle.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.team = "random"; d.ruleset = ["[Gen 9] Random Battle"]; d.banlist = []; d.unbanlist = []; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Random Battle"; } },
	{ id: "doubles", title: "Doubles OU", desc: "2v2 active. Team play, fast pace.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "doubles"; d.ruleset = ["Standard Doubles", "Sleep Moves Clause", "Species Clause", "OHKO Clause", "Evasion Moves Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["DUber", "Moody", "Swagger", "Last Respects"]; d.unbanlist = []; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Doubles OU"; } },
	{ id: "ffa", title: "Free-for-all", desc: "4-player free-for-all chaos.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "freeforall"; d.ruleset = ["Standard FFA", "Species Clause", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Baton Pass"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] FFA"; } },
	{ id: "monotype", title: "Monotype", desc: "Whole team must share a type.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Same Type Clause", "Species Clause", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Monotype"; } },
	{ id: "inverse", title: "Inverse", desc: "Type chart is inverted — Fire beats Water.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Inverse Mod", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["AG", "Moody"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Inverse"; } },
	{ id: "scalemons", title: "Scalemons", desc: "Every mon's BST is scaled to 600.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Scalemons Mod", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Scalemons"; } },
	{ id: "aaa", title: "Almost Any Ability", desc: "Most mons can run almost any ability.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "!Obtainable Abilities", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Arena Trap", "Comatose", "Contrary", "Fur Coat", "Huge Power", "Imposter", "Innards Out", "Magic Bounce", "Magnet Pull", "Moody", "Neutralizing Gas", "Parental Bond", "Poison Heal", "Pure Power", "Shadow Tag", "Simple", "Speed Boost", "Stakeout", "Triage", "Unburden", "Water Bubble", "Wonder Guard"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] AAA"; } },
	{ id: "bh", title: "Balanced Hackmons", desc: "Any move/ability/item. Few bans.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["-Nonexistent", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod", "Forme Clause"]; d.banlist = ["Arceus", "Calyrex-Shadow", "Eternatus-Eternamax", "Groudon-Primal", "Kyogre-Primal", "Magearna", "Mewtwo", "Necrozma-Ultra", "Rayquaza", "Zacian-Crowned"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] BH"; } },
	{ id: "bring6pick3", title: "Bring 6, Pick 3", desc: "Build 6 mons, choose 3 at preview. Tournament-style.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod", "Min Team Size = 6", "Max Team Size = 6", "Picked Team Size = 3"]; d.banlist = ["Uber", "AG", "Moody", "Baton Pass", "Last Respects"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Bring 6 Pick 3"; } },
	{ id: "pinkacord_ou", title: "Pinkacord OU", desc: "Custom dex + OU rules. Your community's home format.",
		apply: (d) => { d.mod = "pinkacord"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Moody", "Baton Pass"]; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] OU"; } },
	{ id: "shared_power", title: "Shared Power", desc: "Active mons share each switched-in ability.",
		apply: (d) => { d.mod = "pinkacord"; d.gameType = "singles"; d.sharedPower = true; d.ruleset = ["Standard", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Shared Power"; } },
	{ id: "blank", title: "Blank", desc: "Empty form. Build from scratch.",
		apply: (d) => { /* leave defaults */ } },
];

const DEX_OPTIONS_V3 = [
	{ id: "pinkacord", label: "Pinkacord", desc: "Custom dex + Gen 9 base." },
	{ id: "gen9", label: "Gen 9", desc: "Scarlet & Violet." },
	{ id: "gen8", label: "Gen 8", desc: "Sword & Shield." },
	{ id: "gen7", label: "Gen 7", desc: "Sun & Moon." },
	{ id: "gen6", label: "Gen 6", desc: "X & Y / ORAS." },
	{ id: "gen5", label: "Gen 5", desc: "Black & White." },
	{ id: "gen4", label: "Gen 4", desc: "DPP / HGSS." },
	{ id: "gen3", label: "Gen 3", desc: "RSE / FRLG." },
	{ id: "gen2", label: "Gen 2", desc: "GSC." },
	{ id: "gen1", label: "Gen 1", desc: "RBY." },
];
const GAME_TYPES_V3 = [
	{ id: "singles", label: "Singles", desc: "1v1 active." },
	{ id: "doubles", label: "Doubles", desc: "2v2 active." },
	{ id: "triples", label: "Triples", desc: "3v3 active." },
	{ id: "multi", label: "Multi", desc: "2v2, two players per side." },
	{ id: "freeforall", label: "Free-for-all", desc: "4 players, every mon for itself." },
	{ id: "rotation", label: "Rotation", desc: "Triples with rotation." },
];
const TEAM_SOURCES_V3 = [
	{ id: "", label: "Players bring their own", desc: "Standard — players build & bring." },
	{ id: "random", label: "Random teams", desc: "Server generates each team." },
	{ id: "randomFFA", label: "Random + FFA", desc: "Random teams in free-for-all." },
];
const MECHANICS_V3 = [
	{ id: "shared", label: "Shared Power", desc: "Active mons share each switched-in ability (Smogon OM).",
		isOn: (d) => d.sharedPower === true,
		set: (d, on) => { d.sharedPower = on; if (on) d.gameType = "singles"; },
		disabled: (d) => d.gameType !== "singles",
		disabledReason: "singles only" },
	{ id: "inverse", label: "Inverse Battle", desc: "Type chart inverted.",
		isOn: (d) => fmtHasRule(d, "Inverse Mod"),
		set: (d, on) => fmtToggleRule(d, "Inverse Mod", on) },
	{ id: "scalemons", label: "Scalemons", desc: "Stats scaled to BST 600.",
		isOn: (d) => fmtHasRule(d, "Scalemons Mod"),
		set: (d, on) => fmtToggleRule(d, "Scalemons Mod", on) },
	{ id: "camomons", label: "Camomons", desc: "Typing = first two moves' types.",
		isOn: (d) => fmtHasRule(d, "Camomons Mod"),
		set: (d, on) => fmtToggleRule(d, "Camomons Mod", on) },
	{ id: "tiershift", label: "Tier Shift", desc: "Lower-tier mons get stat boosts.",
		isOn: (d) => fmtHasRule(d, "Tier Shift Mod"),
		set: (d, on) => fmtToggleRule(d, "Tier Shift Mod", on) },
	{ id: "aaa", label: "Almost Any Ability", desc: "Most mons can run almost any ability.",
		isOn: (d) => fmtHasRule(d, "!Obtainable Abilities"),
		set: (d, on) => fmtToggleRule(d, "!Obtainable Abilities", on) },
	{ id: "openteamsheet", label: "Open Team Sheet", desc: "Both players see full teams at preview.",
		isOn: (d) => fmtHasRule(d, "Force Open Team Sheet"),
		set: (d, on) => fmtToggleRule(d, "Force Open Team Sheet", on) },
];
const MANAGED_PARAMS_V3 = ["Min Team Size", "Max Team Size", "Picked Team Size", "Adjust Level", "Min Level", "Max Level", "EV Limit", "Min Source Gen", "Max Source Gen", "Force Monotype", "Force Tera Type"];
const MANAGED_MECH_RULES_V3 = ["Inverse Mod", "Scalemons Mod", "Camomons Mod", "Tier Shift Mod", "!Obtainable Abilities", "Force Open Team Sheet"];

function autoIdFromName(d) {
	if (d.name) {
		const id = d.name.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (id) d.id = id;
	}
}

function buildPreviewPill(d) {
	const sect = d.section || "Pinkacord";
	const name = d.name || "(unnamed)";
	const tag = d.team === "random" ? "Random" : d.team === "randomFFA" ? "Rand FFA" : null;
	return el("div", { class: "fc-pill" },
		el("span", { class: "fc-pill-sect" }, sect),
		el("span", { class: "fc-pill-sep" }, "›"),
		el("span", { class: "fc-pill-name" }, name),
		tag ? el("span", { class: "fc-pill-tag" }, tag) : null,
		d.bestOfDefault ? el("span", { class: "fc-pill-tag" }, "BO3") : null,
		d.sharedPower ? el("span", { class: "fc-pill-tag" }, "Shared Pwr") : null,
		d.enabled === false ? el("span", { class: "fc-pill-tag fc-pill-hidden" }, "hidden") : null,
	);
}

function buildCardV3(id, title, defaultExpanded, renderBody, d, ctrl) {
	const card = {};
	const bodyHost = el("div", { class: "fc-body" });
	const summaryEl = el("div", { class: "fc-summary" });
	const chevEl = el("span", { class: "fc-chev" }, icon("chev", 14));
	const titleRow = el("div", { class: "fc-title-row" },
		chevEl,
		el("span", { class: "fc-title" }, title),
		summaryEl,
	);
	let isOpen = defaultExpanded;
	function applyOpen() {
		card.node.dataset.collapsed = String(!isOpen);
	}
	titleRow.addEventListener("click", () => { isOpen = !isOpen; applyOpen(); });
	card.node = el("div", { class: "fc-card", "data-card": id }, titleRow, bodyHost);
	applyOpen();
	card.id = id;
	card.setSummary = (text) => { summaryEl.textContent = text || ""; };
	card.refresh = () => {
		if (card._syncOnly && typeof card._syncFromData === "function") { card._syncFromData(); return; }
		empty(bodyHost);
		renderBody(d, bodyHost, ctrl, card);
	};
	card.refresh();
	return card;
}

// ─── Full-page format editor ─────────────────────────────────────────────────
function openFormatEditor(existing) {
	const looksLikeNewWithPrefill = existing && (!existing.id || !existing._rev) && existing.data;
	let prefill = null;
	if (looksLikeNewWithPrefill) { prefill = deepClone(existing.data); existing = null; }
	const data = existing ? deepClone(existing.data) : (prefill || defaultEntity("formats"));
	state.editor = {
		type: "formats",
		data,
		rev: existing ? existing._rev : null,
		existingId: existing ? existing.id : null,
		snapshot: JSON.stringify(data),
	};
	render();
	window.scrollTo(0, 0);
}

function renderFormatEditorPage() {
	const ed = state.editor;
	const d = ed.data;
	const isNew = !ed.existingId;
	const wrap = el("div", {});
	const errSlot = el("div", {});

	const head = el("div", { class: "editor-head" },
		el("button", { class: "btn btn-quiet back", on: { click: () => closeEditor(false) } }, icon("back", 14), "Formats"),
		el("h1", {}, isNew ? "New format" : (d.name || ed.existingId)),
		!isNew ? el("button", { class: "btn btn-danger", on: { click: () => confirmDelete("formats", { id: ed.existingId, data: d }, () => { state.editor = null; render(); }) } }, icon("trash", 14), "Delete") : null,
		el("button", { class: "btn", on: { click: () => saveFormat({}) } }, "Save"),
		el("button", { class: "btn btn-primary", on: { click: () => saveFormat({ thenBuild: true }) } }, icon("rocket", 14), state.hosted ? "Save & publish" : "Save & deploy"),
	);
	wrap.appendChild(head);
	wrap.appendChild(errSlot);
	wrap.appendChild(renderFormatEditor(d, isNew));

	async function saveFormat(opts) {
		empty(errSlot);
		const body = deepClone(d);
		delete body._startedFrom; delete body._banPane; delete body._banBrowse;
		try {
			const url = "/api/formats" + (ed.existingId ? "/" + encodeURIComponent(ed.existingId) : "");
			const method = ed.existingId ? "PUT" : "POST";
			if (ed.existingId && ed.rev) body.__rev = ed.rev;
			const headers = { "X-Pinkacord-Admin": "1", "Content-Type": "application/json" };
			if (ed.existingId && ed.rev) headers["If-Match"] = ed.rev;
			const r = await fetch(adminApiPath(url), { method, headers, credentials: "same-origin", body: JSON.stringify(body) });
			const json = await r.json().catch(() => ({ ok: false, message: "bad response" }));
			if (!r.ok || !json.ok) {
				errSlot.appendChild(el("div", { class: "banner error" }, json.message || r.statusText));
				if (json.fieldErrors) for (const fe of json.fieldErrors) errSlot.appendChild(el("div", { class: "field-error" }, "• " + fe));
				window.scrollTo({ top: 0, behavior: "smooth" });
				return false;
			}
			await refreshEntityCache("formats");
			markPendingChange();
			state.editor = null;
			render();
			if (opts && opts.thenBuild) { await doBuildAndApply(); return true; }
			setToast("success", "Saved " + (d.name || d.id) + ". Hit Deploy when you're ready to push it live.");
			return true;
		} catch (err) {
			errSlot.appendChild(el("div", { class: "banner error" }, err.message || String(err)));
			window.scrollTo({ top: 0, behavior: "smooth" });
			return false;
		}
	}
	return wrap;
}

function renderFormatEditor(d, isNew) {
	d.ruleset = d.ruleset || ["Standard"];
	d.banlist = d.banlist || [];
	d.unbanlist = d.unbanlist || [];
	d.gameType = d.gameType || "singles";
	d.mod = d.mod || "pinkacord";
	d.section = d.section || "Pinkacord";
	d.column = d.column || 1;
	if (d.enabled === undefined) d.enabled = true;

	const wrap = el("div", { class: "fc-editor" });

	// Sticky header — outside the card host so the name input keeps focus.
	const previewSlot = el("div", { class: "fc-preview-slot" });
	function rebuildPreview() { empty(previewSlot); previewSlot.appendChild(buildPreviewPill(d)); }
	const idDisplay = el("code", {}, d.id || "(auto)");
	const nameInput = el("input", { type: "text", class: "fc-name-input", value: d.name || "", placeholder: "[Pinkacord] OU",
		on: { input: (e) => {
			d.name = e.target.value;
			autoIdFromName(d);
			idDisplay.textContent = d.id || "(auto)";
			ctrl.refreshAll();
		} } });
	const header = el("div", { class: "fc-sticky", "data-field": "name" },
		el("div", { class: "fc-sticky-left" },
			el("label", { class: "fc-sticky-label" }, "Format name"),
			nameInput,
			el("div", { class: "fc-sticky-id" }, "ID: ", idDisplay),
		),
		previewSlot,
	);
	rebuildPreview();
	wrap.appendChild(header);

	const cardHost = el("div", { class: "fc-stack" });
	wrap.appendChild(cardHost);

	const ctrl = {
		cards: [],
		rebuildPreview: rebuildPreview,
		refreshAll(except) {
			rebuildPreview();
			for (const c of this.cards) {
				if (c === except) continue;
				if (c.id === "power" && typeof c._syncFromData === "function") {
					c._syncFromData();
				} else {
					c.refresh();
				}
			}
		},
	};

	ctrl.cards = [
		buildCardV3("starting", "Starting point", !!isNew && !d._startedFrom, renderStartingBodyV3, d, ctrl),
		buildCardV3("identity", "Identity", true, renderIdentityBodyV3, d, ctrl),
		buildCardV3("battle", "Battle shape", true, renderBattleBodyV3, d, ctrl),
		buildCardV3("bans", "Bans & unbans", false, renderBansBodyV3, d, ctrl),
		buildCardV3("clauses", "Clauses", false, renderClausesBodyV3, d, ctrl),
		buildCardV3("mechanics", "Special mechanics", false, renderMechanicsBodyV3, d, ctrl),
		buildCardV3("power", "Power tools", false, renderPowerBodyV3, d, ctrl),
	];
	for (const c of ctrl.cards) cardHost.appendChild(c.node);
	return wrap;
}

// ── Card body: Starting point ──────────────────────────────────────────────
function renderStartingBodyV3(d, host, ctrl, card) {
	if (d._startedFrom) {
		card.setSummary("Started from: " + d._startedFrom);
		host.appendChild(el("div", { class: "fmt-section" },
			el("p", { class: "sub" }, "Started from ", el("strong", {}, d._startedFrom), ". You can switch — current edits will be replaced."),
			el("button", { class: "btn btn-quiet btn-sm", on: { click: () => { delete d._startedFrom; ctrl.refreshAll(); } } }, "Switch starting point"),
		));
		return;
	}
	card.setSummary("Preset · AI · Clone");

	const grid = el("div", { class: "fmt-preset-grid" });
	for (const p of FORMAT_PRESETS) {
		grid.appendChild(el("div", { class: "fmt-preset", on: { click: () => {
			p.apply(d);
			d._startedFrom = p.title;
			ctrl.refreshAll();
			setToast("success", "Started from " + p.title + ".");
		} } },
			el("div", { class: "title" }, p.title),
			el("div", { class: "desc" }, p.desc),
		));
	}
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Pick a preset"),
		el("p", { class: "sub" }, "Templates that fill in a working format. Tweak after picking."),
		grid,
	));

	const aiText = el("textarea", { rows: 2, placeholder: 'Describe a format — e.g. "Shared Power for the custom dex, best of 3" or "Gen 4 OU but no Stealth Rock"' });
	async function doAuto() {
		const txt = aiText.value.trim();
		if (!txt) { setToast("info", "Describe the format idea first."); return; }
		setToast("info", "Designing a format…");
		try {
			const r = await api("POST", "/api/mechanics/design", { text: txt });
			if (r.target === "format" && r.format) {
				const f = r.format;
				if (f.sharedPower) d.sharedPower = true;
				if (f.gameType) d.gameType = f.gameType;
				if (f.team) d.team = f.team;
				if (typeof f.bestOfDefault === "boolean") d.bestOfDefault = f.bestOfDefault;
				if (Array.isArray(f.ruleset)) d.ruleset = f.ruleset.slice();
				if (Array.isArray(f.banlist)) d.banlist = f.banlist.slice();
				if (Array.isArray(f.unbanlist)) d.unbanlist = f.unbanlist.slice();
				if (f.suggestedName && (!d.name || d.name === "[Pinkacord] ")) d.name = f.suggestedName;
				if (f.suggestedDesc && !d.desc) d.desc = f.suggestedDesc;
				d._startedFrom = "AI design";
				ctrl.refreshAll();
				const msg = f.needsDev ? "AI designed a partial format. Dev work: " + (f.devNote || "") : "Format designed!";
				setToast(f.needsDev ? "info" : "success", msg, 10000);
			} else {
				setToast("info", "Couldn't design a format from that. Try being more specific.", 8000);
			}
		} catch (err) {
			const msg = (err.message || "").toLowerCase();
			if (msg.includes("402") || msg.includes("usage limit") || msg.includes("rate limit")) {
				setToast("info", "AI design is rate-limited. You can still build formats manually. " + (err.message || ""), 10000);
			} else {
				setToast("error", "AI design failed: " + (err.message || "unknown"), 8000);
			}
		}
	}
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Describe with AI"),
		el("p", { class: "sub" }, "Plain English → full format config."),
		aiText,
		el("button", { class: "btn btn-primary", style: { marginTop: ".5rem" }, on: { click: doAuto } }, icon("wand", 14), "Auto-create"),
	));

	const customFormats = state.customFormats || [];
	if (customFormats.length) {
		const sel = el("select", {},
			el("option", { value: "" }, "— pick a format to clone —"),
			...customFormats.map((f) => el("option", { value: f.id }, (f.data && f.data.name) || f.id)),
		);
		const cloneBtn = el("button", { class: "btn btn-quiet", on: { click: () => {
			const id = sel.value; if (!id) { setToast("info", "Pick one first."); return; }
			const src = customFormats.find((f) => f.id === id); if (!src) return;
			const copy = deepClone(src.data);
			copy.id = "";
			if (copy.name && !/copy/i.test(copy.name)) copy.name = copy.name + " Copy";
			Object.assign(d, copy);
			d._startedFrom = "Clone of " + (src.data && src.data.name);
			ctrl.refreshAll();
			setToast("success", "Cloned " + (src.data && src.data.name));
		} } }, "Clone");
		host.appendChild(el("div", { class: "fmt-section" },
			el("h3", {}, "Clone an existing format"),
			el("p", { class: "sub" }, "Copy one of your custom formats and tweak it."),
			el("div", { style: { display: "flex", gap: ".5rem" } }, sel, cloneBtn),
		));
	}
}

// ── Card body: Identity ────────────────────────────────────────────────────
function renderIdentityBodyV3(d, host, ctrl, card) {
	card.setSummary((d.section || "Pinkacord") + " · col " + (d.column || 1) + (d.enabled === false ? " · hidden" : ""));

	const descInput = el("textarea", { rows: 2, value: d.desc || "", placeholder: "What makes this format unique?",
		on: { input: (e) => { d.desc = e.target.value; } } });
	const sectionInput = el("input", { type: "text", value: d.section || "Pinkacord",
		on: { input: (e) => { d.section = e.target.value; ctrl.refreshAll(card); } } });
	const columnSel = el("select", { on: { change: (e) => { d.column = Number(e.target.value); ctrl.refreshAll(card); } } },
		[1, 2, 3].map((n) => el("option", { value: String(n), selected: d.column === n }, "Column " + n)));
	const enabledToggle = el("label", { class: "fmt-toggle " + (d.enabled !== false ? "on" : "") },
		el("input", { type: "checkbox", checked: d.enabled !== false, on: { change: (e) => { d.enabled = e.target.checked; ctrl.refreshAll(); } } }),
		el("div", {},
			el("div", { class: "t-title" }, "Visible in the PS lobby"),
			el("div", { class: "t-desc" }, "Uncheck to keep saved but hide from the lobby."),
		),
	);
	const modHost = el("div", { class: "fmt-tile-grid cols-4" });
	function paintMod() {
		empty(modHost);
		for (const o of DEX_OPTIONS_V3) {
			const sel = d.mod === o.id;
			modHost.appendChild(el("div", { class: "fmt-tile" + (sel ? " selected" : ""), on: { click: () => {
				d.mod = o.id;
				paintMod();
				if (ctrl.rebuildPreview) ctrl.rebuildPreview();
				card.setSummary((d.section || "Pinkacord") + " · col " + (d.column || 1) + (d.enabled === false ? " · hidden" : ""));
				const bansCard = ctrl.cards.find((c) => c.id === "bans");
				if (bansCard) bansCard.refresh();
			} } },
				el("div", { class: "title" }, o.label),
				el("div", { class: "desc" }, o.desc),
			));
		}
	}
	paintMod();
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Description"),
		field("", descInput, "Shown in the format tooltip."),
	));
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Which Pokémon pool?"),
		modHost,
	));
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Lobby placement & visibility"),
		el("div", { class: "grid-2", style: { marginTop: ".5rem" } },
			field("Section", sectionInput, "Heading the format appears under."),
			field("Column", columnSel, "Which lobby column."),
		),
		enabledToggle,
	));
}

// ── Card body: Battle shape ────────────────────────────────────────────────
function renderBattleBodyV3(d, host, ctrl, card) {
	const bits = [d.gameType || "singles"];
	if (d.team === "random") bits.push("random teams");
	if (d.bestOfDefault) bits.push("BO3");
	const minT = fmtGetParam(d, "Picked Team Size"); if (minT) bits.push("pick " + minT);
	card.setSummary(bits.join(" · "));

	function tileGrid(opts, currentId, onPick) {
		const grid = el("div", { class: "fmt-tile-grid cols-3" });
		for (const o of opts) {
			const sel = currentId === o.id;
			grid.appendChild(el("div", { class: "fmt-tile" + (sel ? " selected" : ""), on: { click: () => onPick(o.id) } },
				el("div", { class: "title" }, o.label),
				el("div", { class: "desc" }, o.desc),
			));
		}
		return grid;
	}

	const gameHost = tileGrid(GAME_TYPES_V3, d.gameType || "singles", (id) => { d.gameType = id; ctrl.refreshAll(); });
	const teamHost = tileGrid(TEAM_SOURCES_V3, d.team || "", (id) => { if (id) d.team = id; else delete d.team; ctrl.refreshAll(); });

	const bestOf = el("label", { class: "fmt-toggle " + (d.bestOfDefault ? "on" : "") },
		el("input", { type: "checkbox", checked: !!d.bestOfDefault, on: { change: (e) => { d.bestOfDefault = e.target.checked; ctrl.refreshAll(); } } }),
		el("div", {},
			el("div", { class: "t-title" }, "Best-of-3 by default"),
			el("div", { class: "t-desc" }, "Recommended for tournaments."),
		),
	);

	function paramSlider(lhs, label, hint, min, max, defaultVal, suffix) {
		const cur = fmtGetParam(d, lhs);
		const v = cur != null ? Number(cur) : defaultVal;
		const on = cur != null;
		const valEl = el("div", { class: "val" }, on ? String(v) + (suffix || "") : "off");
		const slider = el("input", { type: "range", class: "fmt-slider", min, max, value: v, disabled: !on,
			on: { input: (e) => { fmtSetParam(d, lhs, Number(e.target.value)); valEl.textContent = e.target.value + (suffix || ""); ctrl.refreshAll(card); } } });
		const cb = el("input", { type: "checkbox", checked: on, style: { width: "auto" },
			on: { change: (e) => {
				if (e.target.checked) { fmtSetParam(d, lhs, defaultVal); slider.disabled = false; slider.value = defaultVal; valEl.textContent = defaultVal + (suffix || ""); }
				else { fmtSetParam(d, lhs, null); slider.disabled = true; valEl.textContent = "off"; }
				ctrl.refreshAll(card);
			} } });
		return el("div", { style: { marginBottom: ".5rem" } },
			el("div", { style: { display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".15rem" } },
				cb, el("div", { style: { fontWeight: 600, fontSize: "13px", flex: 1 } }, label),
			),
			hint ? el("div", { style: { fontSize: "11.5px", color: "var(--faint)", marginBottom: ".2rem" } }, hint) : null,
			el("div", { class: "fmt-slider-row" }, slider, valEl),
		);
	}

	const teamSizesBox = el("div", {},
		paramSlider("Min Team Size", "Min team size", "Smallest team allowed.", 1, 6, 1),
		paramSlider("Max Team Size", "Max team size", "Largest team allowed. Default 6.", 1, 6, 6),
		paramSlider("Picked Team Size", "Picked team size (Bring N, Pick M)", "Players pick this many at preview.", 1, 6, 3),
	);
	const levelBox = el("div", {},
		paramSlider("Adjust Level", "Force every mon to this level", "Default 100. Use 50 for VGC, 5 for Little Cup.", 1, 100, 100),
		paramSlider("Min Level", "Min level", "Floor — lower mons bumped up.", 1, 100, 1),
		paramSlider("Max Level", "Max level", "Ceiling — higher mons bumped down.", 1, 100, 100),
	);
	const evBox = paramSlider("EV Limit", "EV budget", "Total EVs. Default 510.", 0, 510, 510);

	const minG = fmtGetParam(d, "Min Source Gen"), maxG = fmtGetParam(d, "Max Source Gen");
	const genLabel = el("div", { style: { fontWeight: 600, fontSize: "12.5px", marginBottom: ".35rem", color: "var(--dim)" } },
		"Allowed gens: " + (minG || maxG ? "gen " + (minG || 1) + " – gen " + (maxG || 9) : "every gen (no filter)"));
	const genBox = el("div", {},
		genLabel,
		paramSlider("Min Source Gen", "Earliest gen", "Minimum source gen.", 1, 9, 1),
		paramSlider("Max Source Gen", "Latest gen", "Maximum source gen.", 1, 9, 9),
	);

	const TYPE_OPTS = [""].concat(TYPES);
	const monoSel = el("select", { on: { change: (e) => { fmtSetParam(d, "Force Monotype", e.target.value || null); ctrl.refreshAll(card); } } },
		...TYPE_OPTS.map((t) => el("option", { value: t, selected: (fmtGetParam(d, "Force Monotype") || "") === t }, t || "(no monotype)")));
	const teraSel = el("select", { on: { change: (e) => { fmtSetParam(d, "Force Tera Type", e.target.value || null); ctrl.refreshAll(card); } } },
		...TYPE_OPTS.map((t) => el("option", { value: t, selected: (fmtGetParam(d, "Force Tera Type") || "") === t }, t || "(no forced tera)")));

	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Game type"), gameHost));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Team source"), teamHost));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Match length"), bestOf));
	host.appendChild(el("div", { class: "fmt-section grid-2", style: { gap: "0 1.5rem" } },
		el("div", {}, el("h3", {}, "Team size"), teamSizesBox),
		el("div", {}, el("h3", {}, "Level cap"), levelBox),
		el("div", {}, el("h3", {}, "EV limit"), evBox),
		el("div", {}, el("h3", {}, "Gen filter"), genBox),
	));
	host.appendChild(el("div", { class: "fmt-section" },
		el("div", { class: "grid-2" },
			field("Force Monotype", monoSel, "Whole team must share this type."),
			field("Force Tera Type", teraSel, "All mons forced to this Tera type."),
		),
	));
}

// ── Card body: Bans & unbans ───────────────────────────────────────────────
const TIER_ORDER_V3 = ["AG", "Uber", "Ubers", "OU", "OUBL", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU", "PUBL", "PU", "ZUBL", "ZU", "NFE", "LC", "Custom", "—"];
function tierRank(t) {
	const i = TIER_ORDER_V3.indexOf(t || "—");
	return i < 0 ? TIER_ORDER_V3.length : i;
}
function renderBansBodyV3(d, host, ctrl, card) {
	d.banlist = d.banlist || [];
	d.unbanlist = d.unbanlist || [];

	const totalBan = (d.banlist || []).length;
	const totalUnban = (d.unbanlist || []).length;
	card.setSummary(totalBan + " banned" + (totalUnban ? ", " + totalUnban + " unbanned" : ""));

	d._banPane = d._banPane || "species";
	d._banBrowse = d._banBrowse || false;

	const PANES = [
		{ id: "species", label: "Pokémon" },
		{ id: "items", label: "Items" },
		{ id: "moves", label: "Moves" },
		{ id: "abilities", label: "Abilities" },
	];
	function paneCount(p) {
		let b = 0, u = 0;
		for (const e of d.banlist) if (categorizePoolEntry(e) === p) b++;
		for (const e of d.unbanlist) if (categorizePoolEntry(e) === p) u++;
		return { b, u };
	}

	const tabBar = el("div", { class: "fmt-pool-tabs" });
	for (const p of PANES) {
		const { b, u } = paneCount(p.id);
		tabBar.appendChild(el("button", { class: d._banPane === p.id ? "active" : "",
			on: { click: () => { d._banPane = p.id; d._banBrowse = false; card.refresh(); } } },
			p.label, (b + u) ? el("span", { class: "badge" }, String(b + u)) : null));
	}
	host.appendChild(tabBar);

	const paneSlot = el("div", {});
	host.appendChild(paneSlot);
	renderBanPane(d, paneSlot, ctrl, card);
}

function renderBanPane(d, paneSlot, ctrl, card) {
	empty(paneSlot);
	const pane = d._banPane;
	const sectLabel = { species: "Pokémon", items: "items", moves: "moves", abilities: "abilities" }[pane];

	if (pane === "species") {
		const presetRow = el("div", { class: "wk-presets" });
		for (const name of Object.keys(TIER_PRESETS)) {
			presetRow.appendChild(el("button", { class: "btn btn-quiet btn-sm", on: { click: () => {
				const p = TIER_PRESETS[name];
				if (!confirm("Replace banlist with " + name + " preset?\n\n" + p.note)) return;
				d.banlist = p.banlist.slice();
				ctrl.refreshAll();
				setToast("success", "Applied " + name + " preset.");
			} } }, name));
		}
		paneSlot.appendChild(el("div", { class: "fmt-section" },
			el("p", { class: "sub", style: { marginBottom: ".35rem" } }, "Tier presets — replaces the current ban list:"),
			presetRow));
	}

	if (pane === "items" && !state._psItemsLite) {
		api("GET", "/api/ps-dex/items").then((r) => { state._psItemsLite = r.items || []; renderBanPane(d, paneSlot, ctrl, card); }).catch(() => {});
	}

	const chips = el("div", { class: "fc-chip-row" });
	let chipCount = 0;
	for (const e of d.banlist || []) {
		const cat = categorizePoolEntry(e);
		if (pane === "species" ? (cat !== "species" && cat !== "other") : cat !== pane) continue;
		chipCount++;
		chips.appendChild(el("span", { class: "fc-chip fc-chip-ban" }, e,
			el("button", { class: "fc-chip-x", title: "Remove", on: { click: () => {
				d.banlist = (d.banlist || []).filter((x) => normalizeName(x) !== normalizeName(e));
				ctrl.refreshAll();
			} } }, "×"),
		));
	}
	for (const e of d.unbanlist || []) {
		const cat = categorizePoolEntry(e);
		if (pane === "species" ? (cat !== "species" && cat !== "other") : cat !== pane) continue;
		chipCount++;
		chips.appendChild(el("span", { class: "fc-chip fc-chip-unban" }, e,
			el("button", { class: "fc-chip-x", title: "Remove", on: { click: () => {
				d.unbanlist = (d.unbanlist || []).filter((x) => normalizeName(x) !== normalizeName(e));
				ctrl.refreshAll();
			} } }, "×"),
		));
	}
	paneSlot.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Currently set"),
		chipCount ? chips : el("p", { class: "sub", style: { margin: 0 } }, "Nothing banned or unbanned yet."),
	));

	const search = el("input", { type: "text", placeholder: "Search " + sectLabel + " — type a name, Enter to ban", style: { flex: "1", minWidth: "180px" } });
	const resultBox = el("div", { class: "fc-search-results" });

	const modFilter = (pane === "species" && d.mod && d.mod !== "pinkacord") ? d.mod : null;
	if (modFilter && !state._modSpecies[modFilter]) {
		state._modSpecies = state._modSpecies || {};
		state._modSpecies[modFilter] = "loading";
		api("GET", "/api/ps-dex/species-by-mod/" + encodeURIComponent(modFilter)).then((r) => {
			state._modSpecies[modFilter] = r.items || [];
			card.refresh();
		}).catch(() => { state._modSpecies[modFilter] = []; card.refresh(); });
	}
	function library() {
		if (pane === "species") {
			const out = [];
			for (const s of state.customSpecies || []) out.push({ name: s.data.name, tier: s.data.tier || "Custom", custom: true });
			const speciesPool = modFilter ? (state._modSpecies && state._modSpecies[modFilter]) : null;
			if (speciesPool && Array.isArray(speciesPool)) {
				const poolSet = {};
				for (const n of speciesPool) poolSet[normalizeName(n)] = true;
				for (const s of state.psSpecies || []) {
					if (poolSet[normalizeName(s.name)]) out.push({ name: s.name, tier: s.tier || "—", custom: false });
				}
			} else {
				for (const s of state.psSpecies || []) out.push({ name: s.name, tier: s.tier || "—", custom: false });
			}
			return out;
		}
		if (pane === "items") return (state._psItemsLite || []).map((n) => ({ name: n, tier: "", custom: false }));
		if (pane === "moves") {
			const out = [];
			for (const m of state.customMoves || []) out.push({ name: m.data.name, tier: m.data.type, custom: true });
			for (const m of state.psMoves || []) out.push({ name: m.name, tier: m.type, custom: false });
			return out;
		}
		if (pane === "abilities") {
			const out = [];
			for (const a of state.customAbilities || []) out.push({ name: a.data.name, tier: "", custom: true });
			for (const n of state.psAbilities || []) out.push({ name: n, tier: "", custom: false });
			return out;
		}
		return [];
	}
	const lib = library();
	if (pane === "species") lib.sort((a, b) => (tierRank(a.tier) - tierRank(b.tier)) || a.name.localeCompare(b.name));
	else lib.sort((a, b) => a.name.localeCompare(b.name));

	function entryStatus(name) {
		const norm = normalizeName(name);
		if ((d.banlist || []).some((x) => normalizeName(x) === norm)) return "banned";
		if ((d.unbanlist || []).some((x) => normalizeName(x) === norm)) return "unbanned";
		return "neutral";
	}
	function cycle(name) {
		const cur = entryStatus(name);
		const purge = (arr) => arr.filter((x) => normalizeName(x) !== normalizeName(name));
		if (cur === "neutral") { d.banlist = (d.banlist || []).concat([name]); d.unbanlist = purge(d.unbanlist || []); }
		else if (cur === "banned") { d.banlist = purge(d.banlist || []); d.unbanlist = (d.unbanlist || []).concat([name]); }
		else { d.banlist = purge(d.banlist || []); d.unbanlist = purge(d.unbanlist || []); }
		ctrl.refreshAll();
	}

	const browseBtn = el("button", { class: "btn btn-quiet btn-sm", on: { click: () => { d._banBrowse = !d._banBrowse; renderBanPane(d, paneSlot, ctrl, card); } } }, d._banBrowse ? "Hide all" : "Browse all");
	const banBtn = el("button", { class: "btn btn-sm", style: { color: "var(--red)" }, title: "Ban what's typed (Enter)", on: { click: () => commitTyped("ban") } }, "Ban");
	const allowBtn = el("button", { class: "btn btn-sm", style: { color: "var(--green)" }, title: "Add to unban list", on: { click: () => commitTyped("unban") } }, "Allow");
	function commitTyped(mode) {
		const v = search.value.trim(); if (!v) { setToast("info", "Type a name first."); return; }
		const exact = lib.find((it) => it.name.toLowerCase() === v.toLowerCase());
		if (!exact && pane === "species" && modFilter) {
			setToast("error", '"' + v + '" isn\'t in the ' + modFilter.toUpperCase() + " dex. Pick from the suggestions or switch the dex on the Identity card.", 7000);
			return;
		}
		if (!exact && pane === "species") {
			setToast("error", '"' + v + '" isn\'t a known Pokémon. Pick from suggestions.', 7000);
			return;
		}
		const name = exact ? exact.name : v;
		const norm = normalizeName(name);
		const purge = (arr) => arr.filter((x) => normalizeName(x) !== norm);
		if (mode === "ban") { d.banlist = (d.banlist || []).concat([name]); d.unbanlist = purge(d.unbanlist || []); setToast("success", "Banned " + name); }
		else { d.unbanlist = (d.unbanlist || []).concat([name]); d.banlist = purge(d.banlist || []); setToast("success", "Allowed " + name); }
		search.value = "";
		ctrl.refreshAll();
	}

	function renderResults() {
		empty(resultBox);
		const q = search.value.toLowerCase().trim();
		const showBrowse = d._banBrowse;
		if (pane === "items" && !state._psItemsLite) {
			resultBox.appendChild(el("p", { class: "sub", style: { margin: ".5rem 0 0" } }, "Loading items…"));
			return;
		}
		if (!q && !showBrowse) {
			resultBox.appendChild(el("p", { class: "sub", style: { margin: ".5rem 0 0" } },
				"Type above to find a " + sectLabel.replace(/s$/, "") + ", then hit ",
				el("strong", {}, "Ban"), " or ", el("strong", {}, "Allow"), ". Or click ",
				el("strong", {}, "Browse all"), " to scroll the full list."));
			return;
		}
		let shown = 0, total = 0;
		let lastTier = null;
		const group = el("div", { class: pane === "species" ? "fc-mon-grid fc-mon-grid-tight" : "fc-result-list" });
		for (const it of lib) {
			if (q && it.name.toLowerCase().indexOf(q) < 0) continue;
			total++;
			if (shown >= (pane === "species" ? 180 : 250)) continue;
			shown++;
			if (pane === "species" && !q && showBrowse && it.tier !== lastTier) {
				lastTier = it.tier;
				resultBox.appendChild(el("div", { class: "fc-tier-head" }, it.tier || "Other"));
				const g = el("div", { class: "fc-mon-grid fc-mon-grid-tight" });
				resultBox.appendChild(g);
			}
			const target = pane === "species" && !q && showBrowse ? resultBox.lastChild : group;
			const status = entryStatus(it.name);
			if (pane === "species") {
				const sprite = it.custom
					? adminApiPath("/api/species/" + normalizeName(it.name) + "/sprite/preview")
					: ("https://play.pokemonshowdown.com/sprites/gen5/" + normalizeName(it.name) + ".png");
				const fallbackSprite = "https://play.pokemonshowdown.com/sprites/dex/" + normalizeName(it.name) + ".png";
				const imgEl = el("img", { src: sprite, loading: "lazy", class: "fc-mon-sprite", alt: "" });
				let triedFallback = false;
				imgEl.addEventListener("error", () => {
					if (!triedFallback && !it.custom) { triedFallback = true; imgEl.src = fallbackSprite; }
					else { imgEl.style.visibility = "hidden"; }
				});
				target.appendChild(el("div", { class: "fc-mon-tile" + (status === "banned" ? " banned" : status === "unbanned" ? " unbanned" : "") + (it.custom ? " custom" : ""),
					title: it.name + " · " + (it.tier || "?"),
					on: { click: () => cycle(it.name) } },
					imgEl,
					el("div", { class: "fc-mon-name" }, it.name),
				));
			} else {
				target.appendChild(el("div", { class: "fmt-pool-item" + (status === "banned" ? " banned" : status === "unbanned" ? " unbanned" : ""),
					on: { click: () => cycle(it.name) } },
					el("div", { class: "pi-name" }, it.custom ? el("span", { style: { color: "var(--pink-strong)", marginRight: ".25rem" } }, "●") : null, it.name),
					it.tier ? el("span", { class: "pi-meta" }, it.tier) : null,
					status === "banned" ? el("span", { class: "pi-tag ban" }, "BAN") : status === "unbanned" ? el("span", { class: "pi-tag unban" }, "UNBAN") : null,
				));
			}
		}
		if (q || !(pane === "species" && showBrowse)) resultBox.appendChild(group);
		if (!shown) resultBox.appendChild(el("div", { class: "empty", style: { padding: ".75rem" } }, "No matches."));
		else if (total > shown) resultBox.appendChild(el("div", { class: "empty", style: { padding: ".4rem", fontSize: "12px" } }, "Showing " + shown + " of " + total + " — refine search."));
	}
	search.addEventListener("input", debounce(() => renderResults(), 160));
	search.addEventListener("keydown", (e) => {
		if (e.key === "Enter") { e.preventDefault(); commitTyped("ban"); }
	});

	paneSlot.appendChild(el("div", { class: "fmt-section" },
		el("div", { style: { display: "flex", gap: ".4rem", alignItems: "center", flexWrap: "wrap" } }, search, banBtn, allowBtn, browseBtn),
		el("div", { class: "sub", style: { margin: ".3rem 0 0" } }, "Enter = ban. Click a result to cycle neutral → ban → unban → neutral."),
		resultBox,
	));
	renderResults();
}

// ── Card body: Clauses ─────────────────────────────────────────────────────
function renderClausesBodyV3(d, host, ctrl, card) {
	const active = KNOWN_CLAUSES.filter((c) => (d.ruleset || []).includes(c.id));
	card.setSummary(active.length + " active");

	const list = el("div", { style: { display: "grid", gap: ".4rem", gridTemplateColumns: "1fr 1fr" } });
	for (const c of KNOWN_CLAUSES) {
		const checked = (d.ruleset || []).includes(c.id);
		const cb = el("input", { type: "checkbox", checked, disabled: c.required, style: { width: "auto", marginTop: "3px" },
			on: { change: () => { fmtToggleRule(d, c.id, !checked); ctrl.refreshAll(); } } });
		list.appendChild(el("label", { class: "fmt-toggle " + (checked ? "on" : ""), style: { cursor: c.required ? "default" : "pointer", marginBottom: 0 } },
			cb,
			el("div", {},
				el("div", { class: "t-title" }, c.label, c.required ? el("span", { style: { fontSize: "10.5px", color: "var(--faint)", marginLeft: ".4rem", fontWeight: "normal" } }, "(required)") : null),
				el("div", { class: "t-desc" }, c.desc),
			),
		));
	}
	host.appendChild(el("div", { class: "fmt-section" },
		el("p", { class: "sub" }, "The competitive rules. ", el("strong", {}, "Standard"), " bundles the common ones."),
		list,
	));
}

// ── Card body: Special mechanics ───────────────────────────────────────────
function renderMechanicsBodyV3(d, host, ctrl, card) {
	const onCount = MECHANICS_V3.filter((m) => m.isOn(d)).length;
	card.setSummary(onCount ? onCount + " active" : "none");

	const list = el("div", { style: { display: "grid", gap: ".4rem", gridTemplateColumns: "1fr 1fr" } });
	for (const m of MECHANICS_V3) {
		const on = m.isOn(d);
		const disabled = m.disabled ? m.disabled(d) : false;
		const cb = el("input", { type: "checkbox", checked: on, disabled,
			on: { change: (e) => { m.set(d, e.target.checked); ctrl.refreshAll(); } } });
		list.appendChild(el("label", { class: "fmt-toggle " + (on ? "on" : ""), style: { opacity: disabled ? .55 : 1, cursor: disabled ? "not-allowed" : "pointer", marginBottom: 0 } },
			cb,
			el("div", {},
				el("div", { class: "t-title" }, m.label),
				el("div", { class: "t-desc" }, m.desc, disabled ? el("span", { style: { color: "var(--red)", marginLeft: ".4rem" } }, "(" + m.disabledReason + ")") : null),
			),
		));
	}
	host.appendChild(el("div", { class: "fmt-section" },
		el("p", { class: "sub" }, "Popular Smogon \"Other Metagame\" mechanics."),
		list,
	));
}

// ── Card body: Power tools ─────────────────────────────────────────────────
function renderPowerBodyV3(d, host, ctrl, card) {
	card.setSummary("Raw ruleset · banlist · JSON");

	function customRulesText() {
		const known = new Set(KNOWN_CLAUSES.map((c) => c.id));
		return (d.ruleset || []).filter((r) => {
			if (known.has(r)) return false;
			if (MANAGED_MECH_RULES_V3.includes(r)) return false;
			const eq = r.match(/^(.+?)\s*=/);
			if (eq && MANAGED_PARAMS_V3.includes(eq[1].trim())) return false;
			return true;
		}).join("\n");
	}
	function setCustomRulesText(text) {
		const known = new Set(KNOWN_CLAUSES.map((c) => c.id));
		const kept = (d.ruleset || []).filter((r) => {
			if (known.has(r)) return true;
			if (MANAGED_MECH_RULES_V3.includes(r)) return true;
			const eq = r.match(/^(.+?)\s*=/);
			if (eq && MANAGED_PARAMS_V3.includes(eq[1].trim())) return true;
			return false;
		});
		const extras = text.split("\n").map((s) => s.trim()).filter(Boolean);
		d.ruleset = kept.concat(extras);
	}

	const rawRules = el("textarea", { rows: 4, value: customRulesText(), placeholder: "Min Move Count = 2\nEV Limit = 252" });
	const rawBan = el("textarea", { rows: 4, value: (d.banlist || []).join("\n"), placeholder: "Mewtwo\nChoice Scarf" });
	const rawUnban = el("textarea", { rows: 3, value: (d.unbanlist || []).join("\n"), placeholder: "Latios" });
	const jsonView = el("pre", { class: "fc-json" }, JSON.stringify(d, null, 2));
	const showJsonCb = el("input", { type: "checkbox", style: { width: "auto" } });
	const jsonBox = el("div", { style: { display: "none", marginTop: ".5rem" } }, jsonView);
	showJsonCb.addEventListener("change", () => { jsonBox.style.display = showJsonCb.checked ? "" : "none"; });

	const refreshPeers = debounce(() => ctrl.refreshAll(card), 250);
	rawRules.addEventListener("input", () => { setCustomRulesText(rawRules.value); refreshPeers(); });
	rawBan.addEventListener("input", () => { d.banlist = rawBan.value.split("\n").map((s) => s.trim()).filter(Boolean); refreshPeers(); });
	rawUnban.addEventListener("input", () => { d.unbanlist = rawUnban.value.split("\n").map((s) => s.trim()).filter(Boolean); refreshPeers(); });

	card._syncFromData = () => {
		if (document.activeElement !== rawRules) rawRules.value = customRulesText();
		if (document.activeElement !== rawBan) rawBan.value = (d.banlist || []).join("\n");
		if (document.activeElement !== rawUnban) rawUnban.value = (d.unbanlist || []).join("\n");
		jsonView.textContent = JSON.stringify(d, null, 2);
	};

	host.appendChild(el("div", { class: "fmt-section" },
		el("p", { class: "sub" }, "Direct edit. These textareas are the source of truth for ", el("code", {}, "ruleset"), " / ", el("code", {}, "banlist"), " / ", el("code", {}, "unbanlist"), " — edits flow into the other cards."),
		field("Extra rules (one per line)", rawRules, "Anything PS knows but isn't surfaced as a control above."),
		el("div", { class: "grid-2" },
			field("Banlist (one per line)", rawBan, "Free-text bans."),
			field("Unbanlist (one per line)", rawUnban, "Allow entries the rules would normally ban."),
		),
		el("label", { style: { display: "inline-flex", alignItems: "center", gap: ".35rem", marginTop: ".4rem", fontSize: "13px", color: "var(--dim)" } }, showJsonCb, "Show raw JSON (debug)"),
		jsonBox,
		el("hr", {}),
		el("h3", {}, "Summary"),
		renderFormatPreviewSummary(d),
	));
}

function renderFormatPreviewSummary(d) {
	d.ruleset = d.ruleset || [];
	d.banlist = d.banlist || [];
	d.unbanlist = d.unbanlist || [];
	const lines = [];
	const GLABELS = { singles: "Singles (1v1)", doubles: "Doubles (2v2)", triples: "Triples (3v3)", multi: "Multi", freeforall: "Free-for-all", rotation: "Rotation" };
	lines.push(GLABELS[d.gameType] || d.gameType);
	lines.push(d.team === "random" ? "Random teams" : d.team === "randomFFA" ? "Random FFA" : "Players bring their own teams");
	if (d.bestOfDefault) lines.push("Best-of-3 by default");
	const MODL = { pinkacord: "Pinkacord", gen9: "Gen 9", gen8: "Gen 8", gen7: "Gen 7", gen6: "Gen 6", gen5: "Gen 5", gen4: "Gen 4", gen3: "Gen 3", gen2: "Gen 2", gen1: "Gen 1" };
	lines.push("Dex: " + (MODL[d.mod] || d.mod));
	const mn = fmtGetParam(d, "Min Source Gen"), mx = fmtGetParam(d, "Max Source Gen");
	if (mn || mx) lines.push("Gens " + (mn || 1) + "–" + (mx || 9));
	const cats = { species: 0, items: 0, moves: 0, abilities: 0 };
	for (const e of d.banlist) cats[categorizePoolEntry(e)] = (cats[categorizePoolEntry(e)] || 0) + 1;
	const bp = [];
	if (cats.species) bp.push(cats.species + " Pokémon");
	if (cats.items) bp.push(cats.items + " items");
	if (cats.moves) bp.push(cats.moves + " moves");
	if (cats.abilities) bp.push(cats.abilities + " abilities");
	if (bp.length) lines.push("Banned: " + bp.join(", "));
	if (d.unbanlist.length) lines.push(d.unbanlist.length + " unbans");
	const builtIn = d.ruleset.includes("Standard") || d.ruleset.includes("Standard Doubles");
	lines.push("Rules: " + (builtIn ? "Standard" : d.ruleset.slice(0, 5).join(", ") + (d.ruleset.length > 5 ? " +" + (d.ruleset.length - 5) + " more" : "")));
	function copySummary() {
		const text = (d.name || "(format)") + "\n" + lines.map((l) => "• " + l).join("\n");
		navigator.clipboard.writeText(text).then(() => setToast("success", "Summary copied.")).catch(() => setToast("error", "Couldn't copy."));
	}
	return el("div", {},
		el("div", { class: "fmt-summary-box" },
			el("strong", {}, d.name || "(unnamed)"),
			d.desc ? el("div", { style: { color: "var(--faint)", fontStyle: "italic", margin: ".15rem 0 .4rem", fontSize: "12px" } }, d.desc) : null,
			el("ul", { style: { margin: ".3rem 0 0", paddingLeft: "1.2rem", color: "var(--dim)" } }, ...lines.map((l) => el("li", {}, l))),
		),
		el("button", { class: "btn btn-quiet btn-sm", style: { marginTop: ".5rem" }, on: { click: copySummary } }, icon("copy", 13), "Copy summary"),
	);
}

// ─── Audit / change log ──────────────────────────────────────────────────────
function renderAudit() {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "page-head" },
		el("div", {},
			el("h1", {}, "Change log"),
			el("div", { class: "sub" }, "Every save, delete, build, and deploy — who did what, when."),
		),
	));
	const card = el("div", { class: "card" });
	const slot = el("div", {}, el("div", { class: "empty" }, "Loading…"));
	card.appendChild(slot);
	wrap.appendChild(card);
	api("GET", "/api/audit").then((r) => {
		empty(slot);
		if (!r.entries || r.entries.length === 0) {
			slot.appendChild(el("div", { class: "empty" },
				el("div", { class: "big" }, icon("scroll", 32)),
				el("div", {}, "No changes yet. Once you save something, it'll show up here."),
			));
			return;
		}
		for (const e of r.entries) {
			slot.appendChild(el("div", { class: "audit-entry" },
				el("div", { class: "icon" }, icon(auditIconName(e.action), 15)),
				el("div", { class: "body" },
					el("div", { class: "top" },
						el("div", {},
							el("span", { class: "who" }, e.actor),
							el("span", { style: { color: "var(--dim)", marginLeft: ".4rem" } }, e.action),
							e.id ? el("span", { class: "act-id", style: { marginLeft: ".4rem" } }, e.id) : null,
						),
						el("div", { class: "ts", title: new Date(e.ts).toLocaleString() }, relativeTime(e.ts)),
					),
				),
			));
		}
	}).catch((err) => { empty(slot); slot.appendChild(el("div", { class: "banner error" }, err.message)); });
	return wrap;
}

// ─── Actions ────────────────────────────────────────────────────────────────
async function doBuildAndApply() {
	if (state.hosted) return doPublishAndDeploy();
	if (!confirm("Build and apply all pending changes to the live PS server?\n\nSaved changes will be compiled and hotpatched.")) return;
	setToast("info", "Building…");
	let buildResult;
	try {
		buildResult = await api("POST", "/api/build");
	} catch (err) {
		const detail = err.fieldErrors && err.fieldErrors.length ? "\n• " + err.fieldErrors.slice(0, 5).join("\n• ") : "";
		setToast("error", "Build failed: " + (err.message || "unknown error") + detail, 12000);
		return;
	}
	const summary = " " + buildResult.stats.species + " Pokémon, " + buildResult.stats.moves + " moves, " + buildResult.stats.abilities + " abilities, " + buildResult.stats.formats + " formats.";
	if (!state.botConfigured) {
		state.pendingChanges = 0;
		render();
		if (state.view !== "home") location.hash = "home";
		setToast("success", "Built." + summary + " Open the Deploy card on the Dashboard and copy the /hotpatch commands into PS chat to push live.", 14000);
		return;
	}
	setToast("info", "Build OK." + summary + " Hot-patching live server…");
	try {
		const hp = await api("POST", "/api/hotpatch");
		state.pendingChanges = 0;
		render();
		setToast("success", "Live!" + summary + " " + (hp.message || ""), 10000);
	} catch (err) {
		setToast("error", "Build OK but hotpatch failed: " + (err.message || "unknown") + ". Open the Dashboard Deploy card and paste the manual commands.", 12000);
	}
}
async function doPublishAndDeploy() {
	if (!state.publishConfigured) {
		setToast("error", "GitHub publish is not configured on the server. Add the GitHub env vars in Render first.", 10000);
		return;
	}
	if (!confirm("Publish saved changes to GitHub?\n\nRender will rebuild and restart the server automatically. Battles in progress may end during the restart.")) return;
	setToast("info", "Publishing to GitHub…");
	try {
		const result = await api("POST", "/api/publish", { summary: "admin panel update" });
		state.pendingChanges = 0;
		state.publishStatus = { changed: [], headSha: result.sha };
		await refreshPublishStatus();
		render();
		setToast("success", "Published " + result.changed.length + " file(s). Render is redeploying now; changes should be live in a few minutes.", 12000);
	} catch (err) {
		const detail = err.fieldErrors && err.fieldErrors.length ? "\n• " + err.fieldErrors.slice(0, 5).join("\n• ") : "";
		if (err.code === "no_changes") {
			state.pendingChanges = 0;
			await refreshPublishStatus();
			render();
		}
		setToast("error", "Publish failed: " + (err.message || "unknown error") + detail, 12000);
	}
}
async function doLogout() {
	try { await api("POST", "/api/logout"); } catch {}
	state.authed = false; state.displayName = null; state.editor = null; location.hash = ""; renderRouted();
}
async function confirmDelete(type, item, afterDelete) {
	const name = item.data.name || item.data.species || item.id;
	if (!confirm("Delete \"" + name + "\"?\n\nYou'll need to Deploy afterwards to push the deletion to the live server. The change is recorded in the change log.")) return;
	try {
		await api("DELETE", "/api/" + type + "/" + encodeURIComponent(item.id));
		// Deleting a species also orphans its learnset entry — clean it up.
		if (type === "species") {
			const ls = (state.customLearnsets || []).find((l) => l.data && l.data.species === item.id);
			if (ls) { try { await api("DELETE", "/api/learnsets/" + encodeURIComponent(ls.id)); } catch {} }
			await refreshEntityCache("learnsets");
		}
		await refreshEntityCache(type);
		markPendingChange();
		setToast("success", "Deleted " + name + ". Hit Deploy when you're ready to push to live.");
		if (afterDelete) afterDelete();
		else render();
	} catch (err) {
		const detail = err.fieldErrors && err.fieldErrors.length ? "\n\n" + err.fieldErrors.join("\n") : "";
		setToast("error", (err.message || "delete failed") + detail, 9000);
	}
}

boot();

})();
`;
