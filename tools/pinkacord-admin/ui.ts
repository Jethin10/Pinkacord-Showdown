/**
 * Pinkacord admin panel — UI bundle.
 *
 * The entire admin UI is one HTML page with inline CSS and JS, served by the
 * admin server as a static string. This rewrite focuses on being approachable
 * for non-developer admins: visual type chips, stat sliders, tabbed editor,
 * inline help, friendly defaults.
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
 */

export const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Pinkacord Admin</title>
	<style>
		* { box-sizing: border-box; }
		body { margin: 0; font-family: Verdana, Helvetica, Arial, sans-serif; font-size: 11pt; background: #2d3a52; color: #2a2a2a; min-height: 100vh; }
		body::before { content: ""; position: fixed; inset: 0; background: linear-gradient(180deg, #344b6c 0%, #2a3a55 100%); z-index: -1; }
		header { background: linear-gradient(180deg, #4a3a5e 0%, #36283f 100%); color: #fce0f0; padding: .55rem 1.25rem; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 0 #1f1428, 0 4px 10px rgba(0,0,0,.35); position: sticky; top: 0; z-index: 50; border-bottom: 1px solid #1f1428; }
		header h1 { margin: 0; font-size: 13pt; font-weight: 700; letter-spacing: .5px; color: #ffd1ee; text-shadow: 0 1px 0 #1f1428; }
		header h1 .pink { color: #ff8fcb; }
		header .right { display: flex; gap: .5rem; align-items: center; font-size: 10pt; }
		header .who { opacity: .95; font-size: 9.5pt; padding: .25rem .55rem; background: rgba(0,0,0,.25); border-radius: 3px; border: 1px solid rgba(255,255,255,.1); color: #fce0f0; }
		header button { background: linear-gradient(180deg, #6b5478 0%, #4a3a5e 100%); color: #fce0f0; border: 1px solid #1f1428; padding: .3rem .8rem; border-radius: 3px; cursor: pointer; font-size: 9.5pt; font-weight: 700; font-family: inherit; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 1px 0 #1f1428; }
		header button:hover { background: linear-gradient(180deg, #7c6489 0%, #5a4a6e 100%); }
		header button:active { background: linear-gradient(180deg, #4a3a5e 0%, #6b5478 100%); box-shadow: inset 0 1px 2px rgba(0,0,0,.25); }
		nav { background: linear-gradient(180deg, #d8cfe5 0%, #b8a8c8 100%); padding: 0 1.25rem; display: flex; gap: 0; border-bottom: 2px solid #1f1428; box-shadow: 0 2px 4px rgba(0,0,0,.2); position: sticky; top: 41px; z-index: 49; }
		nav a { padding: .5rem .95rem; color: #2a1a3a; text-decoration: none; border-bottom: 3px solid transparent; font-size: 10pt; font-weight: 700; transition: background .12s; display: flex; align-items: center; }
		nav a:hover { background: rgba(255,255,255,.35); color: #ff5cb6; }
		nav a.active { color: #b8246b; border-bottom-color: #ff5cb6; background: rgba(255,255,255,.55); }
		main { max-width: 1180px; margin: 1.25rem auto; padding: 0 1.25rem 5rem 1.25rem; }
		.card { background: #f7f3fa; border: 1px solid #1f1428; border-radius: 4px; padding: 1.1rem 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,.25), inset 0 1px 0 #fff; margin-bottom: 1rem; }
		.card h2 { margin: 0 0 .85rem 0; font-size: 12pt; color: #2a1a3a; font-weight: 700; padding-bottom: .4rem; border-bottom: 1px solid #d8cfe5; }
		.card.compact { padding: .85rem 1.1rem; }
		.hero { background: linear-gradient(180deg, #fff8fc 0%, #f0e0f5 100%); border-color: #b8a8c8; }
		.hero h2 { font-size: 14pt; margin-bottom: .5rem; color: #2a1a3a; border-bottom: none; }
		.hero p { margin: 0 0 1.1rem 0; color: #4a3a5e; font-size: 10pt; line-height: 1.55; }
		.banner { padding: .7rem .95rem; border-radius: 3px; margin-bottom: .9rem; font-size: 10pt; line-height: 1.5; border: 1px solid; }
		.banner.success { background: #e0f5d8; color: #1a4a1a; border-color: #98c098; }
		.banner.error { background: #f8d8d8; color: #800; border-color: #d09898; }
		.banner.info { background: #d8e8f8; color: #1f3a73; border-color: #98b0d0; }
		button { font-family: inherit; }
		button.primary { background: linear-gradient(180deg, #ff9ed4 0%, #e85aa8 100%); color: white; border: 1px solid #a8246b; padding: .5rem 1.1rem; border-radius: 3px; cursor: pointer; font-size: 10pt; font-weight: 700; box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 1px 0 #a8246b; text-shadow: 0 -1px 0 rgba(0,0,0,.15); font-family: inherit; }
		button.primary:hover { background: linear-gradient(180deg, #ffaad9 0%, #f06ab2 100%); }
		button.primary:active { background: linear-gradient(180deg, #e85aa8 0%, #ff9ed4 100%); box-shadow: inset 0 2px 3px rgba(0,0,0,.25); }
		button.primary:disabled { background: #c8b8d0; border-color: #8a7a9a; cursor: not-allowed; box-shadow: none; color: #f0e8f0; text-shadow: none; }
		button.primary.huge { font-size: 11pt; padding: .75rem 1.5rem; }
		button.secondary { background: linear-gradient(180deg, #fafafa 0%, #d8cfe5 100%); color: #2a1a3a; border: 1px solid #8a7a9a; padding: .4rem .9rem; border-radius: 3px; cursor: pointer; font-size: 9.5pt; font-weight: 700; box-shadow: inset 0 1px 0 #fff, 0 1px 0 #8a7a9a; font-family: inherit; }
		button.secondary:hover { background: linear-gradient(180deg, #ffffff 0%, #e8dff0 100%); border-color: #6a3aa6; color: #6a3aa6; }
		button.secondary:active { background: linear-gradient(180deg, #d8cfe5 0%, #fafafa 100%); box-shadow: inset 0 2px 3px rgba(0,0,0,.15); }
		button.danger { background: linear-gradient(180deg, #fafafa 0%, #f0d8d8 100%); color: #a02020; border: 1px solid #c08080; padding: .35rem .8rem; border-radius: 3px; cursor: pointer; font-size: 9pt; font-weight: 700; box-shadow: inset 0 1px 0 #fff, 0 1px 0 #c08080; font-family: inherit; }
		button.danger:hover { background: linear-gradient(180deg, #fff 0%, #f8e0e0 100%); border-color: #a02020; }
		button.ghost { background: transparent; color: #6a3aa6; border: 1px solid transparent; padding: .35rem .75rem; cursor: pointer; font-size: 9.5pt; font-weight: 700; font-family: inherit; border-radius: 3px; }
		button.ghost:hover { background: rgba(106, 58, 166, .1); border-color: #6a3aa6; }
		input, select, textarea { font-family: Verdana, Helvetica, Arial, sans-serif; font-size: 10pt; padding: .4rem .55rem; border: 1px solid #8a7a9a; border-radius: 3px; width: 100%; background: #fff; box-shadow: inset 0 1px 2px rgba(0,0,0,.08); }
		input:focus, select:focus, textarea:focus { outline: none; border-color: #6a3aa6; box-shadow: inset 0 1px 2px rgba(0,0,0,.08), 0 0 0 2px rgba(255, 92, 182, .25); }
		input[type=number] { -moz-appearance: textfield; }
		.field { margin-bottom: .9rem; }
		.field label { display: flex; align-items: center; gap: .35rem; font-size: 9.5pt; font-weight: 700; color: #2a1a3a; margin-bottom: .3rem; }
		.field .hint { font-size: 9pt; color: #6a5a7a; margin-top: .25rem; font-style: italic; }
		.field-error { color: #a02020; font-size: 9pt; margin-top: .2rem; font-weight: 700; }
		.help { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: #b8a8c8; color: #2a1a3a; font-size: 10px; cursor: help; font-weight: 700; }
		.help[title]:hover { background: #ff5cb6; color: white; }
		.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: .9rem; }
		.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: .9rem; }
		.mon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .85rem; }
		.mon-card { background: #fff; border: 1px solid #8a7a9a; border-radius: 4px; padding: .85rem; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.15), inset 0 1px 0 #fff; transition: transform .1s, box-shadow .12s; }
		.mon-card:hover { transform: translateY(-2px); border-color: #ff5cb6; box-shadow: 0 3px 8px rgba(0,0,0,.2); }
		.mon-card .sprite-box { width: 96px; height: 96px; margin: 0 auto .4rem auto; border-radius: 3px; background: #f0e8f5; display: flex; align-items: center; justify-content: center; image-rendering: pixelated; overflow: hidden; border: 1px solid #d8cfe5; }
		.mon-card .sprite-box img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
		.mon-card .name { text-align: center; font-weight: 700; font-size: 10.5pt; color: #2a1a3a; margin-bottom: .25rem; }
		.mon-card .types { display: flex; justify-content: center; gap: .25rem; margin-bottom: .4rem; }
		.mon-card .meta { display: flex; justify-content: center; gap: 1rem; font-size: 9pt; color: #6a5a7a; }
		.mon-card.new { display: flex; align-items: center; justify-content: center; min-height: 200px; border: 2px dashed #b8a8c8; color: #6a3aa6; font-weight: 700; background: rgba(255,255,255,.6); }
		.mon-card.new:hover { background: #fff; border-style: solid; border-color: #ff5cb6; color: #ff5cb6; }
		.type-chip { display: inline-block; padding: .15rem .5rem; border-radius: 2px; font-size: 8.5pt; color: white; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; text-shadow: 0 -1px 0 rgba(0,0,0,.3); border: 1px solid rgba(0,0,0,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.25); }
		.type-pick { display: grid; grid-template-columns: repeat(6, 1fr); gap: .3rem; }
		.type-pick button { padding: .45rem .25rem; border-radius: 3px; color: white; border: 2px solid rgba(0,0,0,.25); cursor: pointer; font-size: 9pt; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; opacity: .55; transition: opacity .1s; text-shadow: 0 -1px 0 rgba(0,0,0,.3); box-shadow: inset 0 1px 0 rgba(255,255,255,.25); font-family: inherit; }
		.type-pick button:hover { opacity: .85; }
		.type-pick button.selected { opacity: 1; border-color: #fff; box-shadow: 0 0 0 2px #ff5cb6, 0 2px 4px rgba(0,0,0,.3); }
		.type-pick button.selected-2 { opacity: 1; border-color: #fff; box-shadow: 0 0 0 2px #b58cff, 0 2px 4px rgba(0,0,0,.3); }
		.stat-row { display: grid; grid-template-columns: 60px 1fr 60px; gap: .7rem; align-items: center; margin-bottom: .45rem; }
		.stat-row .stat-name { font-weight: 700; font-size: 9.5pt; color: #2a1a3a; }
		.stat-row .stat-bar { position: relative; height: 22px; background: #e0d5e8; border: 1px solid #8a7a9a; border-radius: 2px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,.2); }
		.stat-row .stat-bar input[type=range] { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: grab; z-index: 2; }
		.stat-row .stat-bar .fill { position: absolute; left: 0; top: 0; bottom: 0; box-shadow: inset 0 1px 0 rgba(255,255,255,.35); transition: width .1s; }
		.stat-row .stat-bar .label { position: absolute; right: 6px; top: 0; bottom: 0; display: flex; align-items: center; font-size: 9pt; font-weight: 700; color: #2a1a3a; z-index: 1; pointer-events: none; text-shadow: 0 1px 0 rgba(255,255,255,.4); }
		.stat-row .stat-num input { text-align: center; padding: .3rem; font-weight: 700; }
		.bst-display { display: flex; justify-content: space-between; align-items: center; padding: .6rem .9rem; background: linear-gradient(180deg, #fff8fc, #f0e0f5); border: 1px solid #b8a8c8; border-radius: 3px; margin-top: .5rem; }
		.bst-display .bst-num { font-size: 14pt; font-weight: 700; color: #b8246b; }
		.bst-display .bst-tag { font-size: 9.5pt; color: #6a5a7a; }
		.tabs { display: flex; gap: .15rem; border-bottom: 2px solid #8a7a9a; margin-bottom: 1.1rem; padding-bottom: 0; }
		.tabs button { background: linear-gradient(180deg, #e8dff0 0%, #c8bcd5 100%); border: 1px solid #8a7a9a; border-bottom: none; padding: .5rem .9rem; cursor: pointer; font-size: 9.5pt; font-weight: 700; color: #4a3a5e; border-radius: 3px 3px 0 0; transition: background .1s; font-family: inherit; margin-bottom: -1px; }
		.tabs button:hover { background: linear-gradient(180deg, #f0e8f5 0%, #d8cfe5 100%); color: #6a3aa6; }
		.tabs button.active { background: #f7f3fa; color: #b8246b; border-bottom: 2px solid #f7f3fa; padding-bottom: calc(.5rem + 1px); }
		.modal-overlay { position: fixed; inset: 0; background: rgba(20, 12, 30, .65); display: flex; align-items: center; justify-content: center; z-index: 100; }
		.modal { background: #f7f3fa; border: 1px solid #1f1428; border-radius: 4px; min-width: 600px; max-width: 760px; width: 90vw; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
		.modal-head { padding: .85rem 1.25rem; border-bottom: 1px solid #b8a8c8; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(180deg, #d8cfe5 0%, #b8a8c8 100%); border-radius: 3px 3px 0 0; }
		.modal-head h2 { margin: 0; font-size: 12pt; color: #2a1a3a; border-bottom: none; padding: 0; }
		.modal-head .x { background: transparent; border: none; cursor: pointer; color: #2a1a3a; font-size: 14pt; padding: 0 .4rem; font-weight: 700; }
		.modal-head .x:hover { color: #b8246b; }
		.modal-body { padding: 1.1rem 1.25rem; overflow-y: auto; flex: 1; }
		.modal-foot { padding: .8rem 1.25rem; border-top: 1px solid #b8a8c8; display: flex; justify-content: space-between; align-items: center; gap: .65rem; background: #e8dff0; border-radius: 0 0 3px 3px; }
		.fab { position: fixed; bottom: 1.25rem; right: 1.25rem; z-index: 90; }
		.fab button { padding: .7rem 1.3rem; border-radius: 3px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-size: 10.5pt; }
		.empty { text-align: center; color: #6a5a7a; padding: 2.5rem 1rem; font-size: 10.5pt; }
		.empty .big { font-size: 2.5rem; margin-bottom: .85rem; opacity: .4; }
		.sprite-uploader { background: #f0e8f5; border: 1px solid #b8a8c8; border-radius: 3px; padding: .85rem; }
		.sprite-uploader .preview { display: flex; align-items: center; gap: .85rem; margin-bottom: .65rem; }
		.sprite-uploader .preview-box { width: 96px; height: 96px; border-radius: 3px; background: #fff; border: 1px solid #8a7a9a; display: flex; align-items: center; justify-content: center; image-rendering: pixelated; overflow: hidden; }
		.sprite-uploader .preview-box img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
		.sprite-uploader .preview-info { flex: 1; font-size: 9.5pt; color: #4a3a5e; line-height: 1.45; }
		.audit-timeline { padding: .15rem 0; }
		.audit-entry { display: flex; gap: .85rem; padding: .7rem 0; border-bottom: 1px solid #d8cfe5; }
		.audit-entry:last-child { border-bottom: none; }
		.audit-entry .icon { width: 32px; height: 32px; border-radius: 3px; background: #e8dff0; border: 1px solid #b8a8c8; display: flex; align-items: center; justify-content: center; font-size: 10pt; flex-shrink: 0; font-weight: 700; color: #6a3aa6; }
		.audit-entry .body { flex: 1; }
		.audit-entry .body .top { display: flex; justify-content: space-between; align-items: baseline; }
		.audit-entry .body .who { font-weight: 700; color: #2a1a3a; font-size: 10pt; }
		.audit-entry .body .ts { font-size: 9pt; color: #8a7a9a; }
		.audit-entry .body .what { color: #4a3a5e; font-size: 9.5pt; margin-top: .15rem; }
		.audit-entry pre { font-size: 9pt; background: #fff; border: 1px solid #d8cfe5; padding: .45rem; border-radius: 2px; max-height: 6rem; overflow: auto; margin-top: .3rem; font-family: Consolas, "Courier New", monospace; }
		code { background: #f0e8f5; padding: .1rem .3rem; border-radius: 2px; font-size: 9.5pt; color: #6a3aa6; font-family: Consolas, "Courier New", monospace; }
		pre.commands { background: #2d1b3d; color: #ffd1ee; padding: .85rem; border-radius: 3px; font-size: 9.5pt; border: 1px solid #1f1428; font-family: Consolas, "Courier New", monospace; }
		pre.cmd-block { background: #1f1428; color: #ffd1ee; padding: .65rem .85rem; border-radius: 3px; font-size: 9.5pt; border: 1px solid #1f1428; font-family: Consolas, "Courier New", monospace; white-space: pre; margin: 0; user-select: all; }
		.deploy-pill { display: inline-flex; align-items: center; padding: .25rem .6rem; border-radius: 12px; font-size: 9pt; font-weight: 700; border: 1px solid; }
		.deploy-pill.ok { background: #e0f5d8; color: #1a4a1a; border-color: #98c098; }
		.deploy-pill.warn { background: #fff3cd; color: #7a5c00; border-color: #e0c878; }
		.deploy-pill.pending { background: #ffe4f0; color: #8a1c5a; border-color: #ff8fcb; }
		.deploy-pill.clean { background: #e0f5d8; color: #1a4a1a; border-color: #98c098; }
		.list-toolbar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: .85rem; }
		.list-toolbar input[type=text], .list-toolbar select { padding: .35rem .55rem; font-size: 9.5pt; }
		.list-toolbar .grow { flex: 1; min-width: 180px; }
		.row-actions { display: flex; gap: .3rem; align-items: center; }
		/* Format editor v2 — tour organizer */
		.fmt-section { margin-bottom: 1.1rem; }
		.fmt-section h3 { margin: 0 0 .4rem 0; font-size: 10.5pt; color: #2a1a3a; font-weight: 700; }
		.fmt-section p.sub { margin: 0 0 .55rem 0; font-size: 9pt; color: #6a5a7a; }
		.fmt-tile-grid { display: grid; gap: .55rem; }
		.fmt-tile-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
		.fmt-tile-grid.cols-3 { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
		.fmt-tile-grid.cols-4 { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
		.fmt-tile { background: #fff; border: 2px solid #ece2f0; border-radius: 6px; padding: .65rem .75rem; cursor: pointer; transition: border-color .1s, background .1s; }
		.fmt-tile:hover { border-color: #ff8fcb; background: #fff8fc; }
		.fmt-tile.selected { border-color: #b8246b; background: #ffe4f0; }
		.fmt-tile .ico { font-size: 1.3rem; margin-bottom: .25rem; }
		.fmt-tile .title { font-weight: 700; color: #2a1a3a; font-size: 10pt; }
		.fmt-tile .desc { font-size: 8.5pt; color: #6a5a7a; margin-top: .15rem; line-height: 1.35; }
		.fmt-slider-row { display: grid; grid-template-columns: 1fr 64px; gap: .55rem; align-items: center; padding: .35rem 0; }
		.fmt-slider-row .lbl { font-size: 9.5pt; font-weight: 700; color: #2a1a3a; }
		.fmt-slider-row .val { font-weight: 700; color: #b8246b; text-align: right; font-size: 10pt; }
		.fmt-slider { width: 100%; }
		.fmt-toggle { display: flex; align-items: flex-start; gap: .55rem; padding: .55rem .75rem; background: #fafafa; border: 1px solid #e8dff0; border-radius: 4px; cursor: pointer; margin-bottom: .35rem; }
		.fmt-toggle.on { background: #fff0f8; border-color: #ff8fcb; }
		.fmt-toggle input { margin-top: 2px; width: auto; }
		.fmt-toggle .t-title { font-weight: 700; color: #2a1a3a; font-size: 9.5pt; }
		.fmt-toggle .t-desc { font-size: 8.5pt; color: #6a5a7a; line-height: 1.4; margin-top: .15rem; }
		.fmt-pool-tabs { display: flex; gap: .15rem; margin-bottom: .65rem; border-bottom: 1px solid #d8cfe5; }
		.fmt-pool-tabs button { background: transparent; border: none; padding: .45rem .85rem; font-size: 9.5pt; font-weight: 700; color: #6a5a7a; cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit; }
		.fmt-pool-tabs button.active { color: #b8246b; border-bottom-color: #b8246b; }
		.fmt-pool-tabs button .badge { display: inline-block; margin-left: .35rem; background: #ffe4f0; color: #b8246b; font-size: 8pt; padding: 0 .35rem; border-radius: 8px; border: 1px solid #ff8fcb; }
		.fmt-pool-pane { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; }
		.fmt-pool-list { background: #fff; border: 1px solid #b8a8c8; border-radius: 4px; max-height: 360px; display: flex; flex-direction: column; }
		.fmt-pool-list .head { padding: .5rem .7rem; background: linear-gradient(180deg, #e8dff0 0%, #d8cfe5 100%); border-bottom: 1px solid #b8a8c8; font-weight: 700; font-size: 9.5pt; color: #2a1a3a; display: flex; justify-content: space-between; align-items: center; }
		.fmt-pool-list .filters { padding: .4rem .55rem; border-bottom: 1px solid #d8cfe5; display: grid; gap: .3rem; }
		.fmt-pool-list .filters input, .fmt-pool-list .filters select { padding: .3rem .45rem; font-size: 9pt; }
		.fmt-pool-list .items { padding: .35rem; overflow-y: auto; flex: 1; display: grid; gap: .2rem; }
		.fmt-pool-item { display: flex; justify-content: space-between; align-items: center; padding: .3rem .55rem; background: #fafafa; border: 1px solid #ece2f0; border-radius: 3px; cursor: pointer; font-size: 9.5pt; }
		.fmt-pool-item:hover { background: #fff0f8; border-color: #ff8fcb; }
		.fmt-pool-item.banned { background: #f8d8d8; border-color: #d09898; opacity: .75; }
		.fmt-pool-item.unbanned { background: #e0f5d8; border-color: #98c098; }
		.fmt-pool-item .pi-name { font-weight: 700; color: #2a1a3a; flex: 1; }
		.fmt-pool-item .pi-meta { font-size: 8.5pt; color: #6a5a7a; margin-left: .4rem; }
		.fmt-pool-item .pi-tag { font-size: 8pt; padding: .05rem .35rem; border-radius: 2px; font-weight: 700; margin-left: .3rem; }
		.fmt-pool-item .pi-tag.ban { background: #a02020; color: white; }
		.fmt-pool-item .pi-tag.unban { background: #2a7a2a; color: white; }
		.fmt-summary { background: linear-gradient(180deg, #fff8fc 0%, #f0e0f5 100%); border: 1px solid #b8a8c8; border-radius: 4px; padding: .9rem 1.1rem; font-size: 10pt; line-height: 1.6; }
		.fmt-summary .name { font-weight: 700; font-size: 12pt; color: #2a1a3a; margin-bottom: .35rem; }
		.fmt-summary ul { margin: .3rem 0 0 0; padding-left: 1.2rem; }
		.fmt-summary li { margin-bottom: .15rem; color: #4a3a5e; }
		.fmt-summary .empty { color: #888; font-style: italic; }
		.fmt-preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .55rem; margin-bottom: 1rem; }
		.fmt-preset { background: #fff; border: 2px solid #e8dff0; border-radius: 6px; padding: .65rem .75rem; cursor: pointer; transition: all .1s; }
		.fmt-preset:hover { border-color: #ff5cb6; background: #fff8fc; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.08); }
		.fmt-preset .ico { font-size: 1.4rem; }
		.fmt-preset .title { font-weight: 700; color: #2a1a3a; font-size: 10pt; margin-top: .2rem; }
		.fmt-preset .desc { font-size: 8.5pt; color: #6a5a7a; line-height: 1.4; margin-top: .2rem; }
		/* Format editor v3 — Card-Stack workflow */
		.fc-editor { display: flex; flex-direction: column; gap: .65rem; }
		.fc-sticky { position: sticky; top: 0; background: linear-gradient(180deg, #fff8fc 0%, #f7f0fa 100%); border: 1px solid #b8a8c8; border-radius: 4px; padding: .65rem .9rem; display: flex; gap: 1rem; align-items: center; z-index: 5; box-shadow: 0 1px 3px rgba(0,0,0,.04); flex-wrap: wrap; }
		.fc-sticky-left { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: .2rem; }
		.fc-sticky-label { font-size: 8.5pt; font-weight: 700; color: #6a5a7a; text-transform: uppercase; letter-spacing: .03em; }
		.fc-name-input { padding: .35rem .55rem; font-size: 11pt; font-weight: 700; color: #2a1a3a; border: 1px solid #b8a8c8; border-radius: 3px; background: #fff; width: 100%; }
		.fc-sticky-id { font-size: 8.5pt; color: #6a5a7a; }
		.fc-sticky-id code { background: #f0e8f5; padding: .05rem .35rem; border-radius: 2px; color: #b8246b; font-family: monospace; }
		.fc-preview-slot { flex-basis: 100%; }
		.fc-pill { display: inline-flex; gap: .4rem; align-items: center; background: #fff; border: 1px solid #ece2f0; border-radius: 6px; padding: .35rem .7rem; font-size: 9.5pt; }
		.fc-pill-sect { color: #888; font-size: 8pt; text-transform: uppercase; font-weight: 700; }
		.fc-pill-sep { color: #b8a8c8; }
		.fc-pill-name { color: #3a2a4a; font-weight: 700; }
		.fc-pill-tag { font-size: 7.5pt; padding: .05rem .35rem; border-radius: 8px; background: #ffe4f0; color: #b8246b; font-weight: 700; border: 1px solid #ff8fcb; }
		.fc-pill-hidden { background: #fce0e0; color: #a02020; border-color: #d09898; }
		.fc-stack { display: flex; flex-direction: column; gap: .5rem; }
		.fc-card { background: #fff; border: 1px solid #d8cfe5; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.02); }
		.fc-card[data-collapsed="true"] .fc-body { display: none; }
		.fc-title-row { display: flex; align-items: center; gap: .55rem; padding: .55rem .85rem; cursor: pointer; user-select: none; background: linear-gradient(180deg, #f7f0fa 0%, #ece2f0 100%); border-bottom: 1px solid #d8cfe5; border-radius: 4px 4px 0 0; }
		.fc-card[data-collapsed="true"] .fc-title-row { border-bottom-color: transparent; border-radius: 4px; }
		.fc-title-row:hover { background: linear-gradient(180deg, #fff0f8 0%, #ffe4f0 100%); }
		.fc-chev { font-size: .85rem; color: #b8246b; width: 1rem; text-align: center; }
		.fc-title { font-weight: 700; color: #2a1a3a; font-size: 10.5pt; flex: 0 0 auto; }
		.fc-summary { font-size: 8.5pt; color: #6a5a7a; font-style: italic; flex: 1; text-align: right; padding-left: .5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.fc-body { padding: .85rem 1rem; }
		.fc-chip-row { display: flex; flex-wrap: wrap; gap: .25rem; }
		.fc-chip { display: inline-flex; align-items: center; gap: .3rem; padding: .15rem .5rem; border-radius: 10px; font-size: 8.5pt; font-weight: 700; }
		.fc-chip-ban { background: #fce0e0; color: #a02020; border: 1px solid #d09898; }
		.fc-chip-unban { background: #e0f5d8; color: #2a7a2a; border: 1px solid #98c098; }
		.fc-chip-x { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 11pt; line-height: 1; padding: 0 0 0 .2rem; font-weight: 700; }
		.fc-mon-filters { display: flex; gap: .45rem; align-items: center; margin-bottom: .55rem; flex-wrap: wrap; }
		.fc-mon-filters input, .fc-mon-filters select { padding: .3rem .45rem; font-size: 9pt; }
		.fc-mon-count { font-size: 8.5pt; color: #6a5a7a; margin-left: auto; }
		.fc-mon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: .35rem; max-height: 460px; overflow-y: auto; padding: .35rem; background: #fafafa; border: 1px solid #ece2f0; border-radius: 3px; }
		.fc-mon-grid-tight { max-height: none; padding: .25rem; background: transparent; border: none; gap: .25rem; }
		.fc-search-results { margin-top: .55rem; max-height: 460px; overflow-y: auto; }
		.fc-tier-head { font-size: 9pt; font-weight: 700; color: #b8246b; text-transform: uppercase; letter-spacing: .03em; padding: .45rem .25rem .15rem; border-top: 1px solid #ece2f0; margin-top: .15rem; }
		.fc-tier-head:first-child { border-top: none; margin-top: 0; padding-top: .15rem; }
		.fc-result-list { display: grid; gap: .2rem; padding: .25rem 0; }
		.fc-mon-tile { background: #fff; border: 1.5px solid #ece2f0; border-radius: 4px; padding: .2rem .25rem; text-align: center; cursor: pointer; transition: all .1s; display: flex; flex-direction: column; align-items: center; gap: .1rem; }
		.fc-mon-tile:hover { border-color: #ff5cb6; background: #fff8fc; transform: translateY(-1px); }
		.fc-mon-tile.custom { border-color: #ff8fcb; }
		.fc-mon-tile.banned { background: #fce0e0; border-color: #c08080; opacity: .7; }
		.fc-mon-tile.unbanned { background: #e0f5d8; border-color: #6a9a4a; }
		.fc-mon-tile.flash-banned { animation: fcFlash 800ms ease-out; }
		@keyframes fcFlash { 0% { background: #ff5cb6; transform: scale(1.08); } 100% { background: inherit; transform: scale(1); } }
		.fc-mon-sprite { width: 56px; height: 56px; object-fit: contain; image-rendering: pixelated; }
		.fc-mon-name { font-size: 8pt; font-weight: 700; color: #2a1a3a; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
		.fc-json { background: #1f1428; color: #ffd0e8; padding: .65rem .85rem; border-radius: 3px; font-size: 8.5pt; max-height: 320px; overflow: auto; white-space: pre-wrap; margin: 0; font-family: monospace; }
		.login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
		.login-card { background: #f7f3fa; border: 1px solid #1f1428; padding: 2rem; border-radius: 4px; box-shadow: 0 8px 30px rgba(0,0,0,.5); width: 100%; max-width: 380px; }
		.login-card .logo { font-size: 2rem; text-align: center; margin-bottom: .25rem; color: #ff5cb6; font-weight: 700; }
		.login-card h1 { margin: 0 0 .4rem 0; font-size: 14pt; color: #2a1a3a; text-align: center; }
		.login-card p { margin: 0 0 1.25rem 0; color: #6a5a7a; text-align: center; font-size: 9.5pt; }
		.toast { position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%); background: #f7f3fa; border: 1px solid #1f1428; border-radius: 3px; padding: .7rem 1.2rem; box-shadow: 0 4px 16px rgba(0,0,0,.4); z-index: 200; max-width: 90vw; font-size: 10pt; }
		.toast.success { border-left: 4px solid #28a745; }
		.toast.error { border-left: 4px solid #c33; }
		.toast.info { border-left: 4px solid #ff5cb6; }
		@media (max-width: 720px) {
			.modal { min-width: 0; }
			.type-pick { grid-template-columns: repeat(3, 1fr); }
			.grid-2, .grid-3 { grid-template-columns: 1fr; }
		}
		/* Format Workshop — drag-and-drop game-builder */
		.wk-root { display: flex; flex-direction: column; gap: .85rem; }
		.wk-intro { font-size: 9.5pt; color: #4a3a5e; background: #f0e8f5; border: 1px solid #b8a8c8; padding: .55rem .8rem; border-radius: 3px; line-height: 1.5; }
		.wk-preset-row-wrap { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; }
		.wk-preset-label { font-size: 9.5pt; font-weight: 700; color: #2a1a3a; }
		.wk-presets { display: flex; flex-wrap: wrap; gap: .3rem; }
		.wk-presets button { font-size: 9pt; padding: .25rem .6rem; }
		.wk-grid { display: grid; grid-template-columns: 280px 1fr; gap: .9rem; min-height: 500px; }
		.wk-library { background: #fff; border: 1px solid #8a7a9a; border-radius: 3px; display: flex; flex-direction: column; box-shadow: inset 0 1px 0 #fff; }
		.wk-library-head { padding: .6rem .75rem; border-bottom: 1px solid #d8cfe5; background: linear-gradient(180deg, #e8dff0 0%, #d8cfe5 100%); border-radius: 3px 3px 0 0; }
		.wk-library-title { font-weight: 700; font-size: 10pt; color: #2a1a3a; }
		.wk-library-hint { font-size: 8.5pt; color: #6a5a7a; margin-top: .1rem; font-style: italic; }
		.wk-library-filters { padding: .5rem .65rem; border-bottom: 1px solid #d8cfe5; display: grid; gap: .35rem; }
		.wk-library-filters input, .wk-library-filters select { padding: .3rem .45rem; font-size: 9pt; }
		.wk-library-list { padding: .4rem; overflow-y: auto; max-height: 480px; flex: 1; display: grid; grid-template-columns: 1fr; gap: .25rem; }
		.wk-mon { background: linear-gradient(180deg, #fafafa 0%, #efe9f5 100%); border: 1px solid #b8a8c8; padding: .35rem .55rem; border-radius: 3px; cursor: grab; box-shadow: inset 0 1px 0 #fff; transition: background .1s, border-color .1s; }
		.wk-mon:hover { background: linear-gradient(180deg, #fff 0%, #f0e0f5 100%); border-color: #ff5cb6; }
		.wk-mon:active { cursor: grabbing; }
		.wk-mon.custom { background: linear-gradient(180deg, #fff8fc 0%, #ffe0f0 100%); border-color: #ff8fcb; }
		.wk-mon.banned { opacity: .55; background: linear-gradient(180deg, #f8d8d8 0%, #efb8b8 100%); border-color: #c08080; }
		.wk-mon.unbanned { background: linear-gradient(180deg, #e0f5d8 0%, #b8e0a8 100%); border-color: #6a9a4a; opacity: 1; }
		.wk-mon-name { font-weight: 700; font-size: 9.5pt; color: #2a1a3a; display: flex; align-items: center; gap: .3rem; }
		.wk-custom-dot { color: #ff5cb6; font-size: 11pt; line-height: 1; }
		.wk-mon-types { display: flex; gap: .2rem; margin-top: .15rem; flex-wrap: wrap; }
		.wk-mon .type-chip { padding: .05rem .35rem; font-size: 8pt; }
		.wk-state { font-size: 8pt; font-weight: 700; margin-top: .2rem; padding: .05rem .35rem; border-radius: 2px; display: inline-block; }
		.wk-state.banned { background: #a02020; color: white; }
		.wk-state.unbanned { background: #2a7a2a; color: white; }
		.wk-zones { display: grid; grid-template-rows: auto auto auto; gap: .65rem; min-width: 0; }
		.wk-zone { background: #fff; border: 1px solid #8a7a9a; border-radius: 3px; padding: .65rem .75rem; box-shadow: inset 0 1px 0 #fff; transition: border-color .12s, background .12s; }
		.wk-zone.wk-drag-over { border-color: #ff5cb6; border-width: 2px; padding: calc(.65rem - 1px) calc(.75rem - 1px); background: #fff8fc; }
		.wk-zone.wk-zone-allowed { background: linear-gradient(180deg, #fff 0%, #f0f8e8 100%); border-color: #6a9a4a; }
		.wk-zone.wk-zone-banned { background: linear-gradient(180deg, #fff 0%, #fff0f0 100%); border-color: #c08080; }
		.wk-zone.wk-zone-unban { background: linear-gradient(180deg, #fff 0%, #fcfae0 100%); border-color: #c0a040; }
		.wk-zone-head { display: flex; align-items: baseline; gap: .65rem; margin-bottom: .4rem; flex-wrap: wrap; }
		.wk-zone-title { font-weight: 700; font-size: 11pt; color: #2a1a3a; }
		.wk-zone-sub { font-size: 9pt; color: #6a5a7a; font-style: italic; flex: 1; }
		.wk-zone-count { font-size: 8.5pt; color: #6a3aa6; background: #f0e8f5; padding: .1rem .4rem; border-radius: 2px; border: 1px solid #b8a8c8; font-weight: 700; }
		.wk-zone-list { display: flex; flex-wrap: wrap; gap: .25rem; min-height: 36px; padding: .4rem; background: #faf8fc; border: 1px dashed #b8a8c8; border-radius: 2px; margin-bottom: .4rem; }
		.wk-zone-empty { color: #8a7a9a; font-size: 9pt; font-style: italic; padding: .3rem .5rem; }
		.wk-chip { display: inline-flex; align-items: center; gap: .25rem; padding: .2rem .15rem .2rem .55rem; background: linear-gradient(180deg, #e8dff0 0%, #c8bcd5 100%); color: #2a1a3a; border: 1px solid #8a7a9a; border-radius: 2px; font-size: 9pt; font-weight: 700; box-shadow: inset 0 1px 0 #fff; }
		.wk-chip-static { padding: .2rem .55rem; }
		.wk-chip-custom { background: linear-gradient(180deg, #ffe8f4 0%, #ff8fcb 100%); border-color: #b8246b; color: #fff; }
		.wk-chip-x { background: transparent; border: none; color: #6a5a7a; font-size: 11pt; line-height: 1; padding: 0 .25rem; cursor: pointer; font-weight: 700; font-family: inherit; }
		.wk-chip-x:hover { color: #a02020; }
		.wk-zone input[type=text] { padding: .3rem .5rem; font-size: 9pt; }
		.wk-allowed-list { background: #fff; }
		@media (max-width: 980px) {
			.wk-grid { grid-template-columns: 1fr; }
			.wk-library-list { max-height: 240px; }
		}
		/* Learnset editor — two-column drag/drop */
		.ls-root { display: flex; flex-direction: column; gap: .85rem; }
		.ls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; min-height: 500px; }
		.ls-pane { background: #fff; border: 1px solid #8a7a9a; border-radius: 3px; display: flex; flex-direction: column; box-shadow: inset 0 1px 0 #fff; }
		.ls-pane-head { padding: .6rem .75rem; background: linear-gradient(180deg, #e8dff0 0%, #d8cfe5 100%); border-bottom: 1px solid #d8cfe5; border-radius: 3px 3px 0 0; }
		.ls-pane-title { font-weight: 700; font-size: 10pt; color: #2a1a3a; }
		.ls-pane-sub { font-size: 8.5pt; color: #6a5a7a; margin-top: .1rem; font-style: italic; }
		.ls-pane-filters { padding: .5rem .65rem; border-bottom: 1px solid #d8cfe5; display: grid; grid-template-columns: 2fr 1fr 1fr; gap: .35rem; }
		.ls-pane-filters input, .ls-pane-filters select { padding: .3rem .45rem; font-size: 9pt; }
		.ls-list { padding: .4rem; overflow-y: auto; max-height: 480px; flex: 1; display: grid; grid-template-columns: 1fr; gap: .3rem; }
		.ls-zone { background: linear-gradient(180deg, #fff 0%, #f0f8e8 100%); border: 1px solid #6a9a4a; border-radius: 3px; display: flex; flex-direction: column; box-shadow: inset 0 1px 0 #fff; }
		.ls-zone.wk-drag-over { border-width: 2px; }
		.ls-zone-head { padding: .6rem .75rem; background: linear-gradient(180deg, #d8e8c8 0%, #b8d0a0 100%); border-bottom: 1px solid #6a9a4a; border-radius: 3px 3px 0 0; }
		.ls-zone-title { font-weight: 700; font-size: 10pt; color: #2a4a1a; }
		.ls-zone-sub { font-size: 8.5pt; color: #4a6a2a; margin-top: .1rem; font-style: italic; }
		.ls-zone input[type=text] { margin: 0 .65rem .65rem .65rem; width: calc(100% - 1.3rem); padding: .35rem .55rem; font-size: 9pt; }
		.ls-zone .ls-list { background: #fafff0; }
		.ls-move { background: linear-gradient(180deg, #fafafa 0%, #efe9f5 100%); border: 1px solid #b8a8c8; padding: .35rem .55rem; border-radius: 3px; cursor: grab; box-shadow: inset 0 1px 0 #fff; display: grid; grid-template-columns: 1fr auto; gap: .25rem .5rem; align-items: center; }
		.ls-move:hover:not(.ls-already) { border-color: #ff5cb6; background: linear-gradient(180deg, #fff 0%, #f0e0f5 100%); }
		.ls-move:active { cursor: grabbing; }
		.ls-move.ls-already { opacity: .55; background: linear-gradient(180deg, #e8efe0 0%, #d8e0c8 100%); cursor: default; }
		.ls-move.ls-known { background: linear-gradient(180deg, #fff 0%, #e8f5d8 100%); border-color: #6a9a4a; cursor: default; }
		.ls-move-name { font-weight: 700; font-size: 9.5pt; color: #2a1a3a; }
		.ls-move-warn { color: #c08020; cursor: help; }
		.ls-move-meta { grid-column: 1 / -1; display: flex; gap: .25rem; align-items: center; flex-wrap: wrap; font-size: 8.5pt; color: #4a3a5e; }
		.ls-move-meta .type-chip { padding: .05rem .35rem; font-size: 8pt; }
		.ls-cat { padding: .05rem .4rem; font-size: 8pt; border-radius: 2px; font-weight: 700; color: white; text-shadow: 0 -1px 0 rgba(0,0,0,.3); border: 1px solid rgba(0,0,0,.2); }
		.ls-cat-physical { background: #b85020; }
		.ls-cat-special { background: #4070b8; }
		.ls-cat-status { background: #707070; }
		.ls-bp { background: #f0e8f5; border: 1px solid #b8a8c8; padding: .05rem .35rem; border-radius: 2px; font-weight: 700; }
		.ls-add-btn { background: linear-gradient(180deg, #d8e8c8 0%, #a0c878 100%); border: 1px solid #6a9a4a; color: #2a4a1a; padding: .15rem .5rem; font-size: 8.5pt; font-weight: 700; cursor: pointer; border-radius: 2px; font-family: inherit; box-shadow: inset 0 1px 0 rgba(255,255,255,.4); }
		.ls-add-btn:hover { background: linear-gradient(180deg, #e8f5d8 0%, #b8d888 100%); }
		.ls-already-tag { font-size: 8.5pt; color: #6a9a4a; font-weight: 700; }
		@media (max-width: 980px) { .ls-grid { grid-template-columns: 1fr; } }
		.ls-header { background: linear-gradient(180deg, #fff8fc 0%, #f7f0fa 100%); border: 1px solid #b8a8c8; border-radius: 4px; padding: .65rem .85rem; display: flex; align-items: center; gap: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
		.ls-header-label { font-size: 8.5pt; font-weight: 700; color: #6a5a7a; text-transform: uppercase; letter-spacing: .03em; margin-bottom: .25rem; }
		.ls-header-row { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; }
		.ls-header-row select { padding: .35rem .55rem; font-size: 10.5pt; font-weight: 700; min-width: 240px; }
		.ls-mon-info { display: inline-flex; align-items: center; gap: .35rem; }
		.ls-mon-info-name { font-weight: 700; color: #2a1a3a; font-size: 10pt; }
		.ls-starting { /* container only */ }
		.ls-starting-summary { background: #f0e8f5; border: 1px solid #b8a8c8; border-radius: 4px; padding: .55rem .85rem; font-size: 9.5pt; color: #2a1a3a; display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
		.ls-starting-pick { background: #fff8fc; border: 1.5px dashed #ff8fcb; border-radius: 6px; padding: .85rem 1rem; }
		.ls-starting-title { font-size: 10pt; font-weight: 700; color: #2a1a3a; margin-bottom: .55rem; }
		.ls-starting-tiles { display: grid; grid-template-columns: 1fr 2fr; gap: .65rem; }
		@media (max-width: 700px) { .ls-starting-tiles { grid-template-columns: 1fr; } }
		.ls-starting-tile { background: #fff; border: 2px solid #ece2f0; border-radius: 6px; padding: .75rem .85rem; cursor: pointer; text-align: left; font-family: inherit; transition: all .12s; display: flex; flex-direction: column; gap: .25rem; }
		.ls-starting-tile:hover { border-color: #ff5cb6; background: #fff8fc; transform: translateY(-1px); }
		.ls-tile-inherit { cursor: default; }
		.ls-tile-inherit:hover { transform: none; }
		.ls-tile-icon { font-size: 1.5rem; }
		.ls-tile-title { font-weight: 700; font-size: 10.5pt; color: #2a1a3a; }
		.ls-tile-desc { font-size: 9pt; color: #6a5a7a; line-height: 1.4; }
		.ls-tile-inherit input[type="text"] { width: 100%; padding: .35rem .55rem; font-size: 9.5pt; margin-top: .45rem; }
		.ls-inherit-results { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .35rem; max-height: 180px; overflow-y: auto; padding: .15rem; }
		.ls-inherit-pick { background: #fafafa; border: 1px solid #ece2f0; border-radius: 14px; padding: .2rem .6rem; font-size: 9pt; cursor: pointer; font-family: inherit; color: #2a1a3a; }
		.ls-inherit-pick:hover { background: #ffe4f0; border-color: #ff5cb6; }
		/* Home dashboard — stat tiles */
		.stat-tile { background: #fff; border: 1px solid #8a7a9a; border-radius: 4px; padding: .65rem .85rem; cursor: pointer; text-align: center; transition: transform .1s, box-shadow .12s; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
		.stat-tile:hover { transform: translateY(-2px); border-color: #ff5cb6; box-shadow: 0 3px 8px rgba(0,0,0,.15); }
		.stat-val { font-size: 1.8rem; font-weight: 700; color: #2a1a3a; line-height: 1.3; }
		.stat-label { font-size: .85rem; color: #6a5a7a; margin-top: .15rem; }
		/* Workflow steps */
		.workflow-step { background: #fff; border: 1px solid #8a7a9a; border-radius: 4px; padding: .8rem; flex: 1; min-width: 180px; display: flex; gap: .65rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
		.ws-badge { font-size: 1rem; font-weight: 700; color: #ff5cb6; min-width: 22px; text-align: center; line-height: 1.5; }
		.ws-body { flex: 1; }
		.ws-title { font-weight: 700; font-size: .9rem; color: #2a1a3a; }
		.ws-desc { font-size: .78rem; color: #6a5a7a; margin-top: .15rem; line-height: 1.4; }
		/* Activity feed */
		.activity-row { display: flex; align-items: center; gap: .5rem; padding: .35rem 0; border-bottom: 1px solid #e8dff0; font-size: .85rem; }
		.activity-row:last-child { border-bottom: none; }
		.act-icon { font-size: 1rem; min-width: 22px; text-align: center; }
		.act-body { flex: 1; color: #4a3a5e; }
		.act-who { font-weight: 700; color: #2a1a3a; }
		.act-id { color: #7a5aaa; font-weight: 600; }
		.act-ts { font-size: .75rem; color: #888; white-space: nowrap; }
		/* Inline command pill */
		.cmd-inline { background: #1f1428; color: #ffd1ee; padding: .15rem .55rem; border-radius: 3px; font-size: .75rem; cursor: pointer; user-select: all; white-space: nowrap; }
		.cmd-inline:hover { background: #3a2a4a; }
		/* Inline validation */
		.field.is-invalid { border-left: 3px solid #c33; padding-left: calc(1.25rem - 3px); background: #fff8f8; }
		.field.is-invalid input, .field.is-invalid select, .field.is-invalid textarea { border-color: #c33; }
		.field-error { color: #a02020; font-size: 9pt; margin-top: .2rem; font-weight: 700; }
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

// ─── API client ──────────────────────────────────────────────────────────────
let _apiBusyCount = 0;
const _busyEl = el("div", { id: "busy-overlay", style: { display: "none", position: "fixed", inset: 0, zIndex: 99999, background: "rgba(31,20,40,.4)", alignItems: "center", justifyContent: "center", pointerEvents: "auto" } },
	el("div", { style: { display: "flex", alignItems: "center", gap: ".75rem", background: "#2a1a3a", padding: "1rem 1.5rem", borderRadius: 8, color: "#ffd1ee", fontSize: "11pt", fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,.4)" } },
		el("span", { style: { display: "inline-block", width: 20, height: 20, border: "3px solid #ff5cb6", borderTopColor: "transparent", borderRadius: "50%", animation: "spinner .6s linear infinite" } }),
		"Loading…",
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
		const r = await fetch(path, opts);
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
const STATUSES = ["brn", "par", "slp", "frz", "psn", "tox"];
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_NAMES = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
function statColor(v) {
	if (v < 50) return "#dc3545";
	if (v < 80) return "#fd7e14";
	if (v < 100) return "#f0b400";
	if (v < 120) return "#82c91e";
	return "#198754";
}

// ─── Reusable UI bits ────────────────────────────────────────────────────────
function typeChip(typeName) {
	return el("span", { class: "type-chip", style: { background: TYPE_COLORS[typeName] || "#888" } }, typeName);
}
function helpIcon(text) {
	return el("span", { class: "help", title: text }, "?");
}
function field(label, control, hint, helpText) {
	const labelEl = el("label", {},
		el("span", {}, label),
		helpText ? helpIcon(helpText) : null,
	);
	const fieldKey = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

// ─── App state ───────────────────────────────────────────────────────────────
const state = {
	authed: false,
	view: "home",
	effects: [],
	displayName: null,
	botConfigured: false,
	pendingChanges: 0, // bumped on every successful save; cleared on Apply
	psAbilities: [],  // lazy-loaded from /api/ps-dex/abilities for autocomplete
	psSpecies: [],    // lazy-loaded from /api/ps-dex/species for the Format Workshop
	psMoves: [],      // lazy-loaded from /api/ps-dex/moves for the Learnset editor
	customSpecies: [], // lazy-loaded from /api/species for the Format Workshop
	customAbilities: [], // lazy-loaded from /api/abilities so the species editor can pick them
	customMoves: [],     // lazy-loaded from /api/moves for the learnset editor
	_modSpecies: {},     // lazy-loaded { modId: speciesName[] } for gen-aware banlist filtering
	psUrl: "http://localhost:8000/", // best-effort link to the PS server (heuristic from current host)
};

function setToast(kind, text, durationMs) {
	const existing = $(".toast"); if (existing) existing.remove();
	const t = el("div", { class: "toast " + kind }, text);
	document.body.appendChild(t);
	setTimeout(() => { if (t.parentNode) t.remove(); }, durationMs || (kind === "error" ? 8000 : 4000));
}

async function prefetchAfterAuth() {
	try { const me = await api("GET", "/api/me"); state.botConfigured = !!me.botConfigured; } catch {}
	try { const eff = await api("GET", "/api/effects"); state.effects = eff.effects; } catch {}
	try { const a = await api("GET", "/api/ps-dex/abilities"); state.psAbilities = a.items; } catch {}
	try { const s = await api("GET", "/api/ps-dex/species-detail"); state.psSpecies = s.items; } catch {}
	try { const m = await api("GET", "/api/ps-dex/moves-detail"); state.psMoves = m.items; } catch {}
	try { const c = await api("GET", "/api/species"); state.customSpecies = c.items || []; } catch {}
	try { const ca = await api("GET", "/api/abilities"); state.customAbilities = ca.items || []; } catch {}
	try { const cm = await api("GET", "/api/moves"); state.customMoves = cm.items || []; } catch {}
	try { const cl = await api("GET", "/api/learnsets"); state.customLearnsets = cl.items || []; } catch {}
	try { const cf = await api("GET", "/api/formats"); state.customFormats = cf.items || []; } catch {}
	// Heuristic for the PS server URL: if we're on host:port, PS is typically host:8000.
	// Override via env-driven server response later if needed.
	try {
		const host = location.hostname || "localhost";
		state.psUrl = location.protocol + "//" + host + ":8000/";
	} catch {}
}

// ─── Boot ────────────────────────────────────────────────────────────────────
window.addEventListener("hashchange", () => { renderRouted(); });
async function boot() {
	try {
		const me = await api("GET", "/api/me");
		state.authed = me.authed;
		state.displayName = me.displayName;
		state.botConfigured = !!me.botConfigured;
	} catch { state.authed = false; }
	if (state.authed) {
		await prefetchAfterAuth();
	}
	renderRouted();
}
function renderRouted() {
	if (!state.authed) { state.view = "login"; render(); return; }
	const hash = location.hash.replace(/^#/, "") || "home";
	state.view = hash;
	render();
}
function render() {
	const r = root();
	empty(r);
	if (state.view === "login") return r.appendChild(renderLogin());
	r.appendChild(renderShell());
	maybeRenderFab();
}

function maybeRenderFab() {
	const existing = $(".fab"); if (existing) existing.remove();
	if (state.pendingChanges <= 0) return;
	const label = state.botConfigured
		? "⚡ Save changes — Build & push live"
		: "⚡ Build now (then paste /hotpatch)";
	const fab = el("div", { class: "fab" },
		el("button", { class: "primary", on: { click: doBuildAndApply } }, label),
	);
	document.body.appendChild(fab);
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
			el("div", { class: "logo" }, "Pinkacord"),
			el("h1", {}, "Admin"),
			el("p", {}, "Sign in to build custom Pokémon and run your community server."),
			el("div", { class: "field" },
				el("label", {}, "Your name"),
				nameInput = el("input", { type: "text", autofocus: true, required: true, autocomplete: "nickname", placeholder: "Riku, ash, etc." }),
				el("div", { class: "hint" }, "Shows up in the change log so we know who made what."),
			),
			el("div", { class: "field" },
				el("label", {}, "Admin password"),
				pwInput = el("input", { type: "password", required: true, autocomplete: "current-password" }),
			),
			errorEl = el("div", { class: "field-error" }),
			el("button", { type: "submit", class: "primary huge", style: { width: "100%" } }, "Sign in"),
		)
	);
}

// ─── Shell ───────────────────────────────────────────────────────────────────
function renderShell() {
	return el("div", {},
		renderHeader(),
		renderNav(),
		el("main", {}, renderContent()),
	);
}
function renderHeader() {
	return el("header", {},
		el("h1", {}, el("span", { class: "pink" }, "Pinkacord"), " Admin"),
		el("div", { class: "right" },
			state.displayName ? el("span", { class: "who" }, "Hi, " + state.displayName) : null,
			el("button", { on: { click: doLogout } }, "Sign out"),
		),
	);
}
function renderNav() {
	const link = (id, label) => el("a", { href: "#" + id, class: state.view === id ? "active" : "" }, label);
	return el("nav", {},
		link("home", "Home"),
		link("species", "Pokémon"),
		link("moves", "Moves"),
		link("abilities", "Abilities"),
		link("items", "Items"),
		link("learnsets", "Learnsets"),
		link("formats", "Format Workshop"),
		link("sprites", "Sprites"),
		link("audit", "Change log"),
	);
}
function renderContent() {
	if (state.view === "home") return renderHome();
	if (state.view === "species") return renderSpeciesList();
	if (state.view === "moves") return renderEntityList("moves", "Moves", "⚡");
	if (state.view === "abilities") return renderEntityList("abilities", "Abilities", "🔮");
	if (state.view === "items") return renderEntityList("items", "Items", "🧪");
	if (state.view === "learnsets") return renderEntityList("learnsets", "Learnsets", "📖");
	if (state.view === "formats") return renderEntityList("formats", "Formats", "🏆");
	if (state.view === "sprites") return renderSpritesGallery();
	if (state.view === "advanced") return renderAdvanced();
	if (state.view === "audit") return renderAudit();
	return el("div", { class: "card empty" }, "Not found");
}

// ─── Home / Dashboard ─────────────────────────────────────────────────────────
function renderHome() {
	const wrap = el("div", {});
	const hero = el("div", { class: "card hero" },
		el("h2", {}, "🌸 Welcome back" + (state.displayName ? ", " + state.displayName : "")),
		el("p", {}, "Build custom Pokémon, invent abilities and formats — no coding required. Everything you create here runs on your Pokémon Showdown server."),
		el("div", { style: { display: "flex", gap: ".75rem", flexWrap: "wrap" } },
			el("button", { class: "primary huge", on: { click: () => openEditor("species", null) } }, "+  New Pokémon"),
			el("button", { class: "secondary", on: { click: () => openEditor("moves", null) } }, "+  New move"),
			el("button", { class: "secondary", on: { click: () => openEditor("abilities", null) } }, "+  New ability"),
			el("button", { class: "secondary", on: { click: () => openEditor("formats", null) } }, "+  New format"),
			el("button", { class: "ghost", on: { click: () => { window.open(state.psUrl || "http://localhost:8000/", "_blank"); } } }, "🌐 Open PS server"),
		),
	);
	wrap.appendChild(hero);

	// Stats card — live counts of everything
	const statsCard = el("div", { class: "card compact" }, el("h2", {}, "📊 Overview"));
	const statGrid = el("div", { class: "grid-3" });
	const ENTITY_STATS = [
		["species", "✨", "Pokémon", state.customSpecies ? state.customSpecies.length : "…"],
		["moves", "⚡", "Custom moves", state.customMoves ? state.customMoves.length : "…"],
		["abilities", "🔮", "Abilities", state.customAbilities ? state.customAbilities.length : "…"],
		["items", "🧪", "Items", state.customItems ? state.customItems.length : "…"],
		["formats", "🏆", "Formats", state.customFormats ? state.customFormats.length : "…"],
		["learnsets", "📖", "Learnsets", state.customLearnsets ? state.customLearnsets.length : "…"],
	];
	for (const [etype, emoji, label, count] of ENTITY_STATS) {
		statGrid.appendChild(el("div", { class: "stat-tile", on: { click: () => { location.hash = etype; } } },
			el("div", { class: "stat-val" }, String(count)),
			el("div", { class: "stat-label" }, emoji + "  " + label),
		));
	}
	statsCard.appendChild(statGrid);
	wrap.appendChild(statsCard);

	// Workflow — guided path for new users
	const workflow = el("div", { class: "card compact" }, el("h2", {}, "🎯 Quick-start — make your first format"));
	const steps = [
		{ emoji: "1", label: "Create a Pokémon", desc: "Add a custom species with name, type, stats, and sprite.", action: () => openEditor("species", null), btn: "+  Add Pokémon" },
		{ emoji: "2", label: "Add a move", desc: "Create a signature move for your Pokémon — or let AI write it.", action: () => openEditor("moves", null), btn: "+  Add move" },
		{ emoji: "3", label: "Create a format", desc: "Build a format that uses your custom dex. Pick gens, rules, and bans.", action: () => openEditor("formats", null), btn: "+  New format" },
		{ emoji: "4", label: "Build & deploy", desc: "Push everything to the live server. Your custom content is ready to battle!", action: doBuildAndApply, btn: "⚡  Build now" },
	];
	const stepRow = el("div", { style: { display: "flex", gap: ".5rem", flexWrap: "wrap" } });
	for (const s of steps) {
		stepRow.appendChild(el("div", { class: "workflow-step" },
			el("div", { class: "ws-badge" }, s.emoji),
			el("div", { class: "ws-body" },
				el("div", { class: "ws-title" }, s.label),
				el("div", { class: "ws-desc" }, s.desc),
				el("button", { class: "secondary", style: { marginTop: ".35rem", fontSize: ".8rem" }, on: { click: s.action } }, s.btn),
			),
		));
	}
	workflow.appendChild(stepRow);
	wrap.appendChild(workflow);

	// Deploy status
	wrap.appendChild(renderDeployCard());

	// Recent activity — last 5 audit entries
	wrap.appendChild(renderHomeActivity());

	return wrap;
}
function renderHomeActivity() {
	const card = el("div", { class: "card compact" }, el("h2", {}, "📜 Recent activity"), el("div", { class: "empty" }, "Loading…"));
	api("GET", "/api/audit").then((r) => {
		empty(card);
		card.appendChild(el("h2", {}, "📜 Recent activity"));
		const list = r.entries ? r.entries.slice(0, 8) : [];
		if (list.length === 0) {
			card.appendChild(el("div", { class: "empty", style: { padding: "1rem 0" } }, "No changes yet. Save your first creation and it'll show up here."));
			return;
		}
		for (const e of list) {
			const icons = { create: "✨", update: "✏️", delete: "🗑️", build: "⚡", hotpatch: "🚀", auth: "🔑" };
			const icon = Object.entries(icons).find(([k]) => e.action.includes(k))?.[1] || "•";
			card.appendChild(el("div", { class: "activity-row" },
				el("span", { class: "act-icon" }, icon),
				el("span", { class: "act-body" },
					el("span", { class: "act-who" }, e.actor),
					" ", e.action,
					e.id ? el("span", { class: "act-id" }, " " + e.id) : null,
				),
				el("span", { class: "act-ts" }, new Date(e.ts).toLocaleString()),
			));
		}
		if (r.entries && r.entries.length > 8) {
			card.appendChild(el("button", { class: "ghost", style: { marginTop: ".4rem" }, on: { click: () => { location.hash = "audit"; } } }, "View all →"));
		}
	}).catch(() => { empty(card); card.appendChild(el("h2", {}, "📜 Recent activity")); card.appendChild(el("div", { class: "empty" }, "Couldn't load activity.")); });
	return card;
}
// Deploy card
function renderDeployCard() {
	const card = el("div", { class: "card compact" });
	card.appendChild(el("h2", {}, "🚀 Build & Deploy"));
	const status = el("div", { style: { display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap", marginBottom: ".4rem" } });
	status.appendChild(el("span", { class: "deploy-pill " + (state.botConfigured ? "ok" : "warn") },
		state.botConfigured ? "🤖 Auto-hotpatch" : "📋 Manual deploy"));
	if (state.pendingChanges > 0) {
		status.appendChild(el("span", { class: "deploy-pill pending" }, "● " + state.pendingChanges + " unsaved"));
	} else {
		status.appendChild(el("span", { class: "deploy-pill clean" }, "✓ Live"));
	}
	card.appendChild(status);
	const row = el("div", { style: { display: "flex", gap: ".5rem", flexWrap: "wrap" } });
	row.appendChild(el("button", { class: "primary", disabled: state.pendingChanges === 0, on: { click: doBuildAndApply } }, state.botConfigured ? "⚡ Build & deploy" : "⚡ Build"));
	row.appendChild(el("button", { class: "ghost", on: { click: () => { window.open(state.psUrl || "http://localhost:8000/", "_blank"); } } }, "🌐 Open PS"));
	row.appendChild(el("button", { class: "ghost", on: { click: () => { location.hash = "audit"; } } }, "📜 Log"));
	card.appendChild(row);
	if (!state.botConfigured && state.pendingChanges === 0) {
		const cmds = ["/hotpatch formats", "/hotpatch battles", "/hotpatch teamvalidator"];
		card.appendChild(el("div", { style: { fontSize: ".75rem", color: "#5a4a6a", marginTop: ".5rem", display: "flex", gap: ".4rem", alignItems: "center" } },
			el("span", {}, "After Build, paste in PS chat:"),
			el("code", { class: "cmd-inline", on: { click: () => navigator.clipboard.writeText(cmds.join("\n")).then(() => setToast("success", "Copied")).catch(() => {}) } }, cmds.join(" ")),
		));
	}
	return card;
}

// ─── Species list ────────────────────────────────────────────────────────────
function renderSpeciesList() {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "card compact" },
		el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
			el("h2", { style: { margin: 0 } }, "✨ Your custom Pokédex"),
			el("button", { class: "primary", on: { click: () => openEditor("species", null) } }, "+  New Pokémon"),
		),
	));
	const card = el("div", { class: "card" });
	wrap.appendChild(card);
	const filter = { q: "", type: "", tier: "", sprite: "" };
	let all = [];
	const searchDebounce = debounce((fn) => fn(), 180);
	const toolbar = el("div", { class: "list-toolbar" },
		el("input", { type: "text", class: "grow", placeholder: "Search by name or id…", on: { input: (e) => { filter.q = e.target.value; searchDebounce(() => rebuild()); } } }),
		el("select", { on: { change: (e) => { filter.type = e.target.value; rebuild(); } } },
			...[""].concat(TYPES).map((t) => el("option", { value: t }, t || "All types"))),
		el("select", { on: { change: (e) => { filter.tier = e.target.value; rebuild(); } } },
			...[""].concat(TIERS).map((t) => el("option", { value: t }, t || "All tiers"))),
		el("select", { on: { change: (e) => { filter.sprite = e.target.value; rebuild(); } } },
			el("option", { value: "" }, "Sprite: any"),
			el("option", { value: "yes" }, "Has sprite"),
			el("option", { value: "no" }, "Missing sprite")),
		el("button", { class: "ghost", on: { click: () => { card.querySelectorAll("input,select").forEach((n, i) => { if (i === 0) n.value = ""; else n.selectedIndex = 0; }); filter.q = ""; filter.type = ""; filter.tier = ""; filter.sprite = ""; rebuild(); } } }, "Clear"),
	);
	card.appendChild(toolbar);
	const grid = el("div", { class: "mon-grid" });
	card.appendChild(grid);
	grid.appendChild(el("div", { class: "empty" }, "Loading…"));
	function rebuild() {
		empty(grid);
		grid.appendChild(el("div", { class: "mon-card new", on: { click: () => openEditor("species", null) } },
			el("div", {}, "+  Add another Pokémon")));
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
				el("div", { class: "big" }, "✨"),
				el("div", {}, "Your Pokédex is empty. Click "), el("strong", {}, "+  Add another Pokémon"), el("div", {}, " to start."),
			));
		} else if (items.length === 0) {
			grid.appendChild(el("div", { class: "empty", style: { gridColumn: "1 / -1" } }, "No Pokémon match those filters."));
		}
	}
	// Load both species and sprite-status so the "Missing sprite" filter works.
	Promise.all([
		api("GET", "/api/species"),
		api("GET", "/api/sprites").catch(() => ({ items: [] })),
	]).then(([sr, spritesR]) => {
		const spriteMap = {};
		for (const s of (spritesR.items || [])) spriteMap[s.id] = !!s.hasSprite;
		all = (sr.items || []).map((it) => ({ ...it, _hasSprite: !!spriteMap[it.id] }));
		state.customSpecies = sr.items || []; // refresh the global cache too
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
		// Cache-buster by id+name change so we refresh after rename or upload
		const spriteImg = el("img", { src: "/api/species/" + encodeURIComponent(it.id) + "/sprite/preview?ts=" + Date.now() });
		spriteImg.onerror = () => { spriteImg.style.display = "none"; spriteBox.appendChild(el("div", { style: { fontSize: "2.5rem", opacity: ".3" } }, "✨")); };
		spriteBox.appendChild(spriteImg);
	} else {
		spriteBox.appendChild(el("div", { style: { fontSize: "2.5rem", opacity: ".3" } }, "✨"));
	}
	return el("div", { class: "mon-card", on: { click: () => openEditor("species", it) } },
		spriteBox,
		el("div", { class: "name" }, d.name),
		el("div", { class: "types" }, d.types.map(typeChip)),
		el("div", { class: "meta" },
			el("span", {}, "BST " + bst),
			el("span", {}, d.tier || "—"),
		),
		el("div", { style: { display: "flex", gap: ".25rem", marginTop: ".5rem", justifyContent: "center" } },
			el("button", { class: "ghost", title: "Duplicate", on: { click: (e) => { e.stopPropagation(); duplicateSpecies(it); } } }, "📄"),
			el("button", { class: "ghost", title: "Delete", on: { click: (e) => { e.stopPropagation(); confirmDelete("species", it); } } }, "🗑"),
		),
	);
}
function duplicateSpecies(it) {
	const clone = deepClone(it.data);
	clone.name = (clone.name || "Mon") + " Copy";
	clone.id = "";
	clone.num = (Number(clone.num) || 10000) + 1;
	openEditor("species", { id: "", _rev: null, data: clone });
}

// ─── Editor (used for all entity types) ──────────────────────────────────────
function openEditor(type, existing) { return openEditorOnTab(type, existing, null); }
function openEditorOnTab(type, existing, initialTab) {
	// Duplicate flow passes { id: "", _rev: null, data: {...} } — treat that as a
	// "new entity prefilled with these fields" rather than an existing record.
	const looksLikeNewWithPrefill = existing && (!existing.id || !existing._rev) && existing.data;
	let prefill = null;
	if (looksLikeNewWithPrefill) {
		prefill = deepClone(existing.data);
		existing = null;
	}
	const data = existing ? deepClone(existing.data) : (prefill || defaultEntity(type));
	const rev = existing ? existing._rev : null;
	// Per-type tab config. If a type isn't here, it uses the legacy single-form layout.
	const TAB_CONFIG = {
		species: [
			["basics", "Basics", renderSpeciesBasics],
			["stats", "Stats", renderSpeciesStats],
			["abilities", "Abilities", renderSpeciesAbilities],
			["sprite", "Sprite", renderSpeciesSprite],
			["extra", "Extras", renderSpeciesExtra],
		],
		// formats now use the Card-Stack editor (renderFormatEditor) — dispatched from renderForm
	};
	const tabsFor = TAB_CONFIG[type];
	let activeTab = tabsFor ? (initialTab && tabsFor.some((t) => t[0] === initialTab) ? initialTab : tabsFor[0][0]) : null;
	const overlay = el("div", { class: "modal-overlay" });
	let isClosed = false;
	function close() {
		if (isClosed) return;
		isClosed = true;
		if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
		document.removeEventListener("keydown", onKey);
	}
	function onKey(e) {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
			return;
		}
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
	overlay.addEventListener("click", (e) => {
		// Click on the dimmed background (not the modal) closes the editor.
		if (e.target === overlay) close();
	});
	function bodyForTab() {
		if (!tabsFor) return renderForm(type, data);
		const tab = tabsFor.find((t) => t[0] === activeTab);
		return tab ? tab[2](data) : el("div", {});
	}
	const errSlot = el("div", {});
	const bodySlot = el("div", { class: "modal-body" });
	function rebuildBody() {
		empty(bodySlot);
		if (tabsFor) {
			const tabsBar = el("div", { class: "tabs" });
			for (const [id, label] of tabsFor) tabsBar.appendChild(tabBtn(id, label));
			bodySlot.appendChild(tabsBar);
		}
		bodySlot.appendChild(errSlot);
		bodySlot.appendChild(bodyForTab());
	}
	function tabBtn(id, label) {
		return el("button", { class: activeTab === id ? "active" : "", on: { click: () => { activeTab = id; rebuildBody(); } } }, label);
	}
	function highlightFieldError(errorText) {
		bodySlot.querySelectorAll(".field.is-invalid").forEach((el) => el.classList.remove("is-invalid"));
		const key = errorText.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
		if (!key) return false;
		const candidates = bodySlot.querySelectorAll('[data-field="' + key + '"], [name="' + key + '"]');
		for (const el of candidates) {
			const field = el.closest(".field");
			if (field) { field.classList.add("is-invalid"); field.scrollIntoView({ behavior: "smooth", block: "center" }); return true; }
		}
		return false;
	}
	async function save(opts) {
		empty(errSlot);
		bodySlot.querySelectorAll(".field.is-invalid").forEach((el) => el.classList.remove("is-invalid"));
		try {
			const stagedSprite = data._stagedSprite;
			if (stagedSprite) delete data._stagedSprite;
			const url = "/api/" + type + (existing ? "/" + existing.id : "");
			const method = existing ? "PUT" : "POST";
			const body = data;
			if (existing && rev) body.__rev = rev;
			const headers = { "X-Pinkacord-Admin": "1", "Content-Type": "application/json" };
			if (existing && rev) headers["If-Match"] = rev;
			const r = await fetch(url, { method, headers, credentials: "same-origin", body: JSON.stringify(body) });
			const json = await r.json().catch(() => ({ ok: false, message: "bad response" }));
			if (!r.ok || !json.ok) {
				if (stagedSprite) data._stagedSprite = stagedSprite;
				errSlot.appendChild(el("div", { class: "banner error" },
					json.message || r.statusText));
				if (json.fieldErrors) {
					for (const fe of json.fieldErrors) {
						errSlot.appendChild(el("div", { class: "field-error" }, "• " + fe));
						highlightFieldError(fe);
					}
				}
				return false;
			}
			// Upload staged sprite now that the species exists.
			if (stagedSprite && type === "species") {
				try {
					await api("POST", "/api/species/" + encodeURIComponent(data.id) + "/sprite", { data: stagedSprite });
				} catch (err) {
					setToast("error", "Saved species but sprite upload failed: " + (err.message || "unknown"));
				}
			}
			// Refresh caches so dropdowns / search reflect the new state immediately.
			if (type === "species") {
				try { const c = await api("GET", "/api/species"); state.customSpecies = c.items || []; } catch {}
			} else if (type === "abilities") {
				try { const ca = await api("GET", "/api/abilities"); state.customAbilities = ca.items || []; } catch {}
			} else if (type === "moves") {
				try { const cm = await api("GET", "/api/moves"); state.customMoves = cm.items || []; } catch {}
			}
			state.pendingChanges++;
			if (opts && opts.thenBuild) {
				setToast("info", "Saved. Building & applying…");
				try {
					const br = await api("POST", "/api/build");
					if (!br || br.ok === false) {
						errSlot.appendChild(el("div", { class: "banner error" }, (br && br.message) || "Build failed."));
						if (br && br.fieldErrors) for (const fe of br.fieldErrors) errSlot.appendChild(el("div", { class: "field-error" }, "• " + fe));
						return false;
					}
				} catch (err) {
					errSlot.appendChild(el("div", { class: "banner error" }, "Build failed: " + (err.message || err)));
					return false;
				}
				close();
				setToast("success", "Saved + built + applied: " + (data.name || data.id));
				render();
				return true;
			}
			close();
			setToast("success", "Saved " + (data.name || data.id) + ". Click ⚡ Apply to make it live.");
			render();
			return true;
		} catch (err) { errSlot.appendChild(el("div", { class: "banner error" }, err.message)); return false; }
	}
	const modal = el("div", { class: "modal" },
		el("div", { class: "modal-head" },
			el("h2", {}, (existing ? "Edit " : "New ") + entityTitle(type)),
			el("button", { class: "x", on: { click: close } }, "×"),
		),
		bodySlot,
		el("div", { class: "modal-foot" },
			el("div", { style: { fontSize: ".8rem", color: "#888" } }, existing ? "Editing • saved → not yet applied" : "Will be added when you save"),
			el("div", {},
				el("button", { class: "secondary", on: { click: close } }, "Cancel"),
				" ",
				el("button", { class: "secondary", on: { click: () => save() } }, "💾 Save"),
				" ",
				el("button", { class: "primary", on: { click: () => save({ thenBuild: true }) } }, "⚡ Save & Apply"),
			),
		),
	);
	overlay.appendChild(modal);
	rebuildBody();
	document.body.appendChild(overlay);
}
function entityTitle(type) {
	const t = { species: "Pokémon", moves: "Move", abilities: "Ability", items: "Item", learnsets: "Learnset", formats: "Format" };
	return t[type] || type;
}

// ─── Default-entity factories ────────────────────────────────────────────────
function defaultEntity(type) {
	if (type === "species") return { id: "", num: 10001, name: "", types: ["Normal"], baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 }, abilities: { "0": "" }, heightm: 1, weightkg: 10, color: "Pink", eggGroups: ["Field"], tier: "OU", doublesTier: "DOU" };
	if (type === "moves") return { id: "", num: 9001, name: "", type: "Normal", category: "Special", basePower: 80, accuracy: 100, pp: 15, priority: 0, target: "normal", shortDesc: "", flags: {} };
	if (type === "abilities") return { id: "", name: "", shortDesc: "", effects: [] };
	if (type === "items") return { id: "", num: 9001, name: "", shortDesc: "", effects: [] };
	if (type === "learnsets") return { species: "", moves: [] };
	if (type === "formats") return { id: "", name: "[Pinkacord] ", mod: "pinkacord", section: "Pinkacord", column: 1, desc: "", gameType: "singles", ruleset: ["Standard"], banlist: [], unbanlist: [], sharedPower: false, enabled: true };
	return {};
}

// ─── Species editor: Basics tab ──────────────────────────────────────────────
function renderSpeciesBasics(d) {
	function autoId() {
		if (!d.id && d.name) d.id = d.name.toLowerCase().replace(/[^a-z0-9]/g, "");
		const idEl = $(".js-species-id"); if (idEl) idEl.value = d.id || "";
	}
	const namePart = field("Name", textInput(d, "name", { placeholder: "Pinkachu", onChange: autoId }),
		"The public name shown in the teambuilder, lobby, and battle.");
	const idInput = el("input", { type: "text", class: "js-species-id", value: d.id || "", on: { input: (e) => { d.id = e.target.value; } } });
	const idPart = field("ID", idInput, "Lowercase, no spaces. Used internally. Auto-generated from name.", "This is used in URLs and battle imports — it's like a username for the Pokémon.");
	const numPart = field("Pokédex number", textInput(d, "num", { type: "number" }), "Must be ≥ 10001 to avoid clashing with existing Pokémon.", "Internal number used by the game engine. Any unused number works.");

	const t1Host = el("div", { class: "type-pick" });
	for (const t of TYPES) {
		const sel = d.types[0] === t;
		t1Host.appendChild(el("button", { type: "button", class: sel ? "selected" : "", style: { background: TYPE_COLORS[t] }, on: { click: () => { d.types[0] = t; rebuildTypes(); } } }, t));
	}
	const t2Host = el("div", { class: "type-pick" });
	function paintType2() {
		empty(t2Host);
		t2Host.appendChild(el("button", { type: "button", class: !d.types[1] ? "selected-2" : "", style: { background: "#aaa" }, on: { click: () => { d.types = [d.types[0]]; rebuildTypes(); } } }, "none"));
		for (const t of TYPES) {
			if (t === d.types[0]) continue;
			const sel = d.types[1] === t;
			t2Host.appendChild(el("button", { type: "button", class: sel ? "selected-2" : "", style: { background: TYPE_COLORS[t] }, on: { click: () => { d.types[1] = t; rebuildTypes(); } } }, t));
		}
	}
	function rebuildTypes() {
		empty(t1Host);
		for (const t of TYPES) {
			const sel = d.types[0] === t;
			t1Host.appendChild(el("button", { type: "button", class: sel ? "selected" : "", style: { background: TYPE_COLORS[t] }, on: { click: () => { d.types[0] = t; if (d.types[1] === t) d.types = [t]; rebuildTypes(); } } }, t));
		}
		paintType2();
	}
	paintType2();
	return el("div", {},
		el("div", { class: "grid-2" }, namePart, idPart),
		numPart,
		field("Primary type", t1Host, "Determines STAB, weaknesses, and resistances."),
		field("Secondary type", t2Host, "Pick \"none\" for a single-type Pokémon."),
	);
}

// ─── Species editor: Stats tab ───────────────────────────────────────────────
function renderSpeciesStats(d) {
	function bst() { return STATS.reduce((s, k) => s + (d.baseStats[k] || 0), 0); }
	const bstEl = el("span", { class: "bst-num" }, String(bst()));
	const bstTagEl = el("span", { class: "bst-tag" }, "");
	function updateBst() {
		const total = bst();
		bstEl.textContent = String(total);
		let tag = "frail";
		if (total >= 720) tag = "🚨 legendary tier — likely banned in most formats";
		else if (total >= 600) tag = "🌟 pseudo-legendary tier";
		else if (total >= 525) tag = "💪 strong (OU territory)";
		else if (total >= 450) tag = "👍 solid (UU / RU territory)";
		else if (total >= 350) tag = "🌱 modest";
		else tag = "🍃 frail";
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
		field("Base stats", el("div", {}, rows), "Drag each slider. Green = strong, orange = average, red = weak. Total ≤ 720 is standard."),
		el("div", { class: "bst-display" },
			el("div", {}, el("div", { style: { fontSize: ".8rem", color: "#888" } }, "Total stats (BST)"), bstEl),
			bstTagEl,
		),
	);
}

// ─── Species editor: Abilities tab ───────────────────────────────────────────
function renderSpeciesAbilities(d) {
	// Build a single shared datalist for all three ability slots — autocomplete
	// over the full PS ability dex + any custom abilities the admin defined.
	const datalistId = "ps-abilities-datalist";
	function knownNames() {
		const out = new Set();
		for (const n of (state.psAbilities || [])) out.add(n);
		for (const a of (state.customAbilities || [])) {
			if (a && a.data && a.data.name) out.add(a.data.name);
		}
		return Array.from(out).sort();
	}
	function rebuildDatalist() {
		const existing = document.getElementById(datalistId);
		if (existing) existing.remove();
		const dl = el("datalist", { id: datalistId });
		for (const name of knownNames()) dl.appendChild(el("option", { value: name }));
		document.body.appendChild(dl);
	}
	rebuildDatalist();
	function isKnown(name) {
		const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
		return knownNames().some((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "") === id);
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
			if (!v) { warn.style.display = "none"; return; }
			if (isKnown(v)) { warn.style.display = "none"; }
			else {
				warn.textContent = "⚠ \"" + v + "\" isn't a known ability. Create it under 🔮 Abilities first, or pick from the dropdown.";
				warn.style.display = "block";
			}
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
		el("p", { style: { color: "#666", fontSize: ".9rem", lineHeight: "1.5", marginBottom: "1rem" } },
			"Type any PS or custom ability — autocomplete will help. To invent a new one, open ", el("strong", {}, "🔮 Abilities"), " and create it first; it will appear here automatically."),
		ability("0", "First ability (most common)", "What most Pokémon of this species will have."),
		ability("1", "Second ability (alternate)", "Optional — some are born with this instead."),
		ability("H", "Hidden ability (rare)", "Optional — rare ability from special encounters."),
		ability("S", "Special ability", "Optional — event or special form ability."),
	);
}

// ─── Species editor: Sprite tab ──────────────────────────────────────────────
function renderSpeciesSprite(d) {
	const wrap = el("div", {});
	const box = el("div", { class: "sprite-uploader" });

	function refresh() {
		empty(box);
		const previewBox = el("div", { class: "preview-box" });
		// If a staged base64 is present, show that. Otherwise hit the API.
		if (d._stagedSprite) {
			previewBox.appendChild(el("img", { src: "data:image/png;base64," + d._stagedSprite }));
		} else if (d.id) {
			const img = el("img", { src: "/api/species/" + encodeURIComponent(d.id) + "/sprite/preview?ts=" + Date.now() });
			img.onerror = () => { img.style.display = "none"; previewBox.appendChild(el("div", { style: { fontSize: "2rem", opacity: ".3" } }, "✨")); };
			previewBox.appendChild(img);
		} else {
			previewBox.appendChild(el("div", { style: { fontSize: "2rem", opacity: ".3" } }, "✨"));
		}
		box.appendChild(el("div", { class: "preview" },
			previewBox,
			el("div", { class: "preview-info" },
				el("strong", {}, "Sprite preview"),
				el("div", {}, "Recommended: 96 × 96 pixel PNG, ≤ 250 KB."),
				d._stagedSprite ? el("div", { style: { color: "#a02020", fontWeight: 700, marginTop: ".25rem" } }, "⏳ Staged — will upload when you Save.") : null,
				d.id ? el("div", { style: { color: "#6a5a7a", fontSize: "8.5pt", marginTop: ".25rem" } }, "Saved at ", el("code", {}, "/sprites/pinkacord/" + d.id + ".png"), ".") : null,
			),
		));
		const fileInput = el("input", { type: "file", accept: "image/png,image/gif", on: { change: async (e) => {
			const file = e.target.files[0];
			if (!file) return;
			if (file.size > 250 * 1024) { setToast("error", "Sprite too large: " + (file.size / 1024).toFixed(0) + " KB (max 250 KB)"); return; }
			const reader = new FileReader();
			reader.onload = async () => {
				const dataUrl = reader.result;
				const base64 = String(dataUrl).split(",")[1];
				// If species not saved yet (no ID committed server-side), stage in memory.
				if (!d.id) {
					d._stagedSprite = base64;
					setToast("info", "Sprite staged. It'll upload when you click Save.");
					refresh();
					return;
				}
				try {
					await api("POST", "/api/species/" + encodeURIComponent(d.id) + "/sprite", { data: base64 });
					state.pendingChanges++;
					setToast("success", "Sprite uploaded. Click ⚡ Apply to deploy it.");
					refresh();
					render();
				} catch (err) { setToast("error", "Upload failed: " + (err.message || "unknown")); }
			};
			reader.readAsDataURL(file);
		} } });
		box.appendChild(fileInput);
		const btnRow = el("div", { style: { marginTop: ".5rem", display: "flex", gap: ".4rem" } });
		if (d._stagedSprite) {
			btnRow.appendChild(el("button", { class: "secondary", on: { click: () => { delete d._stagedSprite; refresh(); } } }, "Clear staged sprite"));
		}
		if (d.id) {
			btnRow.appendChild(el("button", { class: "danger", on: { click: async () => {
				if (!confirm("Remove sprite for " + d.id + "?")) return;
				try {
					await api("DELETE", "/api/species/" + encodeURIComponent(d.id) + "/sprite");
					state.pendingChanges++;
					setToast("success", "Sprite removed.");
					refresh(); render();
				} catch (err) { setToast("error", "Delete failed: " + (err.message || "unknown")); }
			} } }, "Remove sprite"));
		}
		box.appendChild(btnRow);
	}
	refresh();
	wrap.appendChild(box);
	return wrap;
}

// ─── Species editor: Extras tab ──────────────────────────────────────────────
function renderSpeciesExtra(d) {
	const eggGroups = (idx) => el("select", { on: { change: (e) => { if (e.target.value === "—") d.eggGroups = d.eggGroups.filter((_, i) => i !== idx); else { d.eggGroups[idx] = e.target.value; } } } },
		el("option", { value: "—" }, "—"),
		...EGG_GROUPS.map((g) => el("option", { value: g, selected: d.eggGroups[idx] === g }, g)),
	);
	return el("div", {},
		el("div", { class: "grid-3" },
			field("Height (m)", textInput(d, "heightm", { type: "number" }), "Mostly flavor."),
			field("Weight (kg)", textInput(d, "weightkg", { type: "number" }), "Used by some moves (Heat Crash, etc)."),
			field("Color", selectInput(d, "color", COLORS), "Pokédex flavor text."),

			field("Egg group 1", eggGroups(0), null, "Used for breeding compatibility."),
			field("Egg group 2 (optional)", eggGroups(1), null, "Optional second egg group for cross-breeding."),

			field("Singles tier", selectInput(d, "tier", TIERS), null, "Which competitive bracket this Pokémon is intended for."),
			field("Doubles tier", selectInput(d, "doublesTier", DOUBLES_TIERS), null, "The doubles-format tier for this Pokémon."),
		),
	);
}

// ─── Generic entity list (moves, abilities, items, formats) ──────────────────
function renderEntityList(type, label, emoji) {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "card compact" },
		el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
			el("h2", { style: { margin: 0 } }, emoji + "  " + label),
			el("button", { class: "primary", on: { click: () => openEditor(type, null) } }, "+  New " + entityTitle(type)),
		),
	));
	const card = el("div", { class: "card" });
	wrap.appendChild(card);
	const filter = { q: "", extra: "" };
	let all = [];
	const searchDebounce = debounce((fn) => fn(), 180);
	const searchInput = el("input", { type: "text", class: "grow", placeholder: "Search by name or id…", on: { input: (e) => { filter.q = e.target.value; searchDebounce(() => rebuild()); } } });
	const toolbar = el("div", { class: "list-toolbar" }, searchInput);
	if (type === "moves") {
		const typeSel = el("select", { on: { change: (e) => { filter.extra = e.target.value; rebuild(); } } },
			...[""].concat(TYPES).map((t) => el("option", { value: t }, t || "All types")));
		toolbar.appendChild(typeSel);
	} else if (type === "formats") {
		const modSel = el("select", { on: { change: (e) => { filter.extra = e.target.value; rebuild(); } } },
			el("option", { value: "" }, "All mods"),
			...["pinkacord", "gen9", "gen8", "gen7", "gen6", "gen5", "gen4", "gen3", "gen2", "gen1"].map((m) => el("option", { value: m }, m)));
		toolbar.appendChild(modSel);
	}
	toolbar.appendChild(el("button", { class: "ghost", on: { click: () => { searchInput.value = ""; filter.q = ""; filter.extra = ""; const sels = toolbar.querySelectorAll("select"); sels.forEach((s) => s.selectedIndex = 0); rebuild(); } } }, "Clear"));
	card.appendChild(toolbar);
	const slot = el("div", {});
	card.appendChild(slot);
	function rebuild() {
		empty(slot);
		if (all.length === 0) {
			slot.appendChild(el("div", { class: "empty" },
				el("div", { class: "big" }, emoji),
				el("div", {}, "No custom " + label.toLowerCase() + " yet."),
				el("div", { style: { marginTop: "1rem" } }, el("button", { class: "primary", on: { click: () => openEditor(type, null) } }, "+  Create your first")),
			));
			return;
		}
		const q = filter.q.toLowerCase().trim();
		const items = all.filter((it) => {
			const d = it.data;
			if (q) {
				const blob = ((d.name || "") + " " + (d.id || "") + " " + (d.species || "")).toLowerCase();
				if (blob.indexOf(q) < 0) return false;
			}
			if (filter.extra) {
				if (type === "moves" && d.type !== filter.extra) return false;
				if (type === "formats" && d.mod !== filter.extra) return false;
			}
			return true;
		});
		if (items.length === 0) {
			slot.appendChild(el("div", { class: "empty" }, "No " + label.toLowerCase() + " match those filters."));
			return;
		}
		const list = el("div", { style: { display: "grid", gap: ".5rem" } });
		for (const it of items) list.appendChild(genericRow(type, it));
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
function genericRow(type, it) {
	const d = it.data;
	const summary = type === "moves"
		? el("div", { style: { display: "flex", gap: ".5rem", alignItems: "center" } }, typeChip(d.type), el("span", { style: { color: "#666" } }, d.category + " • " + d.basePower + " BP • " + d.accuracy + "% acc"))
		: type === "abilities" ? el("span", { style: { color: "#666", fontSize: ".85rem" } }, d.shortDesc || "—")
		: type === "items" ? el("span", { style: { color: "#666", fontSize: ".85rem" } }, d.shortDesc || "—")
		: type === "formats" ? el("span", { style: { color: "#666", fontSize: ".85rem" } }, "mod: " + d.mod + (d.team ? " · " + d.team : "") + (d.sharedPower ? " · Shared Power" : "") + (d.enabled === false ? " · (hidden)" : ""))
		: type === "learnsets" ? el("span", { style: { color: "#666", fontSize: ".85rem" } }, (d.moves || []).length + " moves")
		: null;
	return el("div", { style: { padding: ".75rem 1rem", background: "#faf6ff", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: "1px solid #e8dff0" }, on: { click: () => openEditor(type, it) } },
		el("div", {}, el("div", { style: { fontWeight: 600, color: "#3a2a4a" } }, d.name || d.id || d.species), summary),
		el("div", { class: "row-actions" },
			el("button", { class: "secondary", on: { click: (e) => { e.stopPropagation(); openEditor(type, it); } } }, "Edit"),
			el("button", { class: "ghost", title: "Duplicate", on: { click: (e) => { e.stopPropagation(); duplicateEntity(type, it); } } }, "📄"),
			el("button", { class: "danger", on: { click: (e) => { e.stopPropagation(); confirmDelete(type, it); } } }, "Delete"),
		),
	);
}
function duplicateEntity(type, it) {
	const clone = deepClone(it.data);
	if (type === "learnsets") {
		clone.species = "";
	} else {
		clone.name = (clone.name || "New") + " Copy";
		clone.id = "";
		if (typeof clone.num === "number") clone.num = clone.num + 1;
	}
	openEditor(type, { id: "", _rev: null, data: clone });
}

// ─── Generic forms (moves, abilities, items, formats, learnsets) ────────────
function renderForm(type, d) {
	if (type === "moves") return renderMoveForm(d);
	if (type === "abilities") return renderAbilityForm(d);
	if (type === "items") return renderItemForm(d);
	if (type === "learnsets") return renderLearnsetForm(d);
	if (type === "formats") return renderFormatEditor(d);
	return el("div", {}, "Unknown entity type");
}

function accuracyControl(d) {
	const isAlwaysHit = d.accuracy === true;
	const numInput = el("input", { type: "number", value: isAlwaysHit ? "" : (d.accuracy ?? 100), min: 1, max: 100, disabled: isAlwaysHit, on: { input: (e) => { d.accuracy = Number(e.target.value); } } });
	const cb = el("input", { type: "checkbox", checked: isAlwaysHit, style: { width: "auto" }, on: { change: (e) => {
		if (e.target.checked) { d.accuracy = true; numInput.disabled = true; numInput.value = ""; }
		else { d.accuracy = 100; numInput.disabled = false; numInput.value = "100"; }
	} } });
	return el("div", { style: { display: "flex", gap: ".75rem", alignItems: "center" } },
		numInput,
		el("label", { style: { display: "inline-flex", gap: ".3rem", fontWeight: "normal", alignItems: "center", whiteSpace: "nowrap" } }, cb, "Always hits"),
	);
}
function renderMoveForm(d) {
	d.flags = d.flags || {};
	const flagChips = ["contact", "protect", "mirror", "sound", "punch", "bite", "slicing", "bullet", "powder", "heal"].map((f) => {
		const cb = el("input", { type: "checkbox", checked: d.flags[f] === 1, style: { width: "auto" }, on: { change: (e) => { if (e.target.checked) d.flags[f] = 1; else delete d.flags[f]; } } });
		return el("label", { style: { display: "inline-flex", gap: ".3rem", marginRight: ".75rem", fontWeight: "normal", alignItems: "center" } }, cb, f);
	});
	return el("div", {},
		el("div", { class: "grid-2" },
			field("Name", textInput(d, "name", { placeholder: "Pink Bolt" }), "The public move name shown in-game."),
			field("ID", textInput(d, "id"), "Lowercase, no spaces"),

			field("Move number (≥ 9001)", textInput(d, "num", { type: "number" }), "Unique ID. Must be ≥ 9001 to avoid conflicting with standard moves."),
			field("Type", selectInput(d, "type", TYPES), "Determines STAB and type effectiveness."),

			field("Category", selectInput(d, "category", ["Physical", "Special", "Status"]), "Physical = uses Atk/Def. Special = uses SpA/SpD. Status = no damage."),
			field("Base power", textInput(d, "basePower", { type: "number" }), "0 for Status moves"),
			field("Accuracy", accuracyControl(d), "1–100, or check 'Always hits'"),
		),
		el("div", { class: "grid-2" },
			field("PP", textInput(d, "pp", { type: "number" }), "How many times the move can be used. Typical range: 5-40."),
			field("Priority", textInput(d, "priority", { type: "number" }), "0 is normal. +1 for Quick Attack style."),
		),
		field("Short description", textInput(d, "shortDesc"), "Appears in /dt and tooltips. 1-2 sentences."),
		field("Flags", el("div", {}, flagChips), "What this move can be blocked or boosted by."),
	);
}
function renderAbilityForm(d) {
	// Auto-id from name if empty.
	function autoId() {
		if (!d.id && d.name) d.id = d.name.toLowerCase().replace(/[^a-z0-9]/g, "");
		const idEl = $(".js-ability-id"); if (idEl) idEl.value = d.id || "";
	}

	const effectsHost = el("div", {});
	function rebuildEffects() {
		empty(effectsHost);
		d.effects = d.effects || [];
		if (d.effects.length === 0) {
			effectsHost.appendChild(el("div", { style: { color: "#888", fontSize: ".85rem", fontStyle: "italic", padding: ".5rem 0" } }, "No effects yet. Describe the ability above, or click \"+ Add effect\"."));
		}
		d.effects.forEach((ef, idx) => {
			const kindSel = el("select", { on: { change: (e) => { ef.kind = e.target.value; ef.params = {}; rebuildEffects(); } } },
				el("option", { value: "" }, "Pick what this ability does…"),
				...state.effects.map((k) => el("option", { value: k.id, selected: ef.kind === k.id }, k.id + " — " + k.description)),
			);
			const paramHost = el("div", { class: "grid-2", style: { marginTop: ".5rem" } });
			const kindDef = state.effects.find((k) => k.id === ef.kind);
			if (kindDef && kindDef.paramFields) {
				for (const fname of kindDef.paramFields) {
					paramHost.appendChild(field(fname, el("input", { type: "text", value: ef.params[fname] != null ? ef.params[fname] : "", on: { input: (e) => { const v = e.target.value; const n = Number(v); ef.params[fname] = isNaN(n) || v === "" ? v : n; } } })));
				}
			}
			effectsHost.appendChild(el("div", { style: { background: "#faf6ff", padding: "1rem", borderRadius: "8px", marginBottom: ".5rem" } },
				el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" } },
					el("strong", {}, "Effect " + (idx + 1)),
					el("button", { class: "danger", on: { click: () => { d.effects.splice(idx, 1); rebuildEffects(); } } }, "Remove"),
				),
				kindSel,
				paramHost,
			));
		});
		effectsHost.appendChild(el("button", { class: "secondary", on: { click: () => { d.effects.push({ kind: "", params: {} }); rebuildEffects(); } } }, "+  Add effect manually"));
	}
	rebuildEffects();

	// Natural-language box.
	const nlText = el("textarea", { rows: 3, placeholder: "Describe ANYTHING — e.g. \"30% chance to paralyze on contact\", \"Switch out when hit for 33% HP\", \"Doubles defense in sand, summons sand on entry\". The AI can invent abilities that don't exist yet.", value: "" });
	const nlOut = el("div", {});
	const customCodeHost = el("div", {});

	function renderCustomCode() {
		empty(customCodeHost);
		if (!d.customHandlerCode) return;
		const wrap = el("div", { style: { background: "#2d1b3d", borderRadius: "8px", padding: ".75rem", marginBottom: ".5rem" } });
		wrap.appendChild(el("div", { style: { color: "#ffd1ee", fontWeight: 600, fontSize: ".85rem", marginBottom: ".4rem", display: "flex", justifyContent: "space-between", alignItems: "center" } },
			el("span", {}, "⚡ Custom handler code (AI-generated)"),
			el("button", { class: "ghost", style: { color: "#ffb0d6", fontSize: ".75rem" }, on: { click: () => { d.customHandlerCode = ""; renderCustomCode(); } } }, "Remove"),
		));
		const ta = el("textarea", { rows: Math.min(14, Math.max(4, d.customHandlerCode.split("\n").length + 1)), value: d.customHandlerCode, style: { fontFamily: "monospace", fontSize: ".8rem", background: "#1a0e26", color: "#ffd1ee", border: "1px solid #4a2a5a", whiteSpace: "pre" }, on: { input: (e) => { d.customHandlerCode = e.target.value; } } });
		wrap.appendChild(ta);
		wrap.appendChild(el("div", { style: { color: "#c8a8d8", fontSize: ".75rem", marginTop: ".4rem" } }, "This code goes verbatim into the generated ability. Review it carefully — the smoke test will catch syntax errors but not logic bugs."));
		customCodeHost.appendChild(wrap);
	}

	function renderParseResult(result) {
		empty(nlOut);
		if (result.shortDescription) {
			nlOut.appendChild(el("div", { style: { padding: ".75rem", background: "#e8fce8", border: "1px solid #b8e0b8", borderRadius: "8px", marginBottom: ".5rem" } },
				el("div", { style: { fontWeight: 600, color: "#1a5c1a", marginBottom: ".25rem", fontSize: ".9rem" } }, "✓ " + (result.approach === "custom" ? "Wrote a custom handler" : result.approach === "mixed" ? "Combined effects + custom code" : "Composed from registry")),
				el("div", { style: { fontSize: ".85rem", color: "#1a5c1a", marginBottom: ".25rem" } }, result.shortDescription),
				result.explanation ? el("div", { style: { fontSize: ".8rem", color: "#3a7a3a", fontStyle: "italic" } }, result.explanation) : null,
			));
		}
		if (result.matchedPatterns && result.matchedPatterns.length) {
			nlOut.appendChild(el("div", { style: { padding: ".75rem", background: "#e8fce8", border: "1px solid #b8e0b8", borderRadius: "8px", marginBottom: ".5rem" } },
				el("div", { style: { fontWeight: 600, color: "#1a5c1a", marginBottom: ".25rem", fontSize: ".9rem" } }, "✓ Parsed " + result.matchedPatterns.length + " effect(s):"),
				el("ul", { style: { margin: 0, paddingLeft: "1.25rem", fontSize: ".85rem" } },
					result.matchedPatterns.map((m) => el("li", {}, m))),
			));
		}
		if (result.warnings && result.warnings.length) {
			nlOut.appendChild(el("div", { style: { padding: ".75rem", background: "#fff3cd", border: "1px solid #ffe69c", borderRadius: "8px", marginBottom: ".5rem", fontSize: ".85rem", color: "#664d03" } },
				el("strong", {}, "Couldn't translate everything:"),
				el("ul", { style: { margin: ".25rem 0 0 0", paddingLeft: "1.25rem" } },
					result.warnings.map((w) => el("li", {}, w))),
				result.llmAvailable === false ? el("div", { style: { marginTop: ".4rem" } }, "💡 Tip: enable the AI translator by setting ", el("code", {}, "LLM_API_KEY"), " (free key at console.groq.com).") : null,
			));
		}
	}

	function applyAbilityDesign(r) {
		renderParseResult(r);
		if (r.effects && r.effects.length) {
			d.effects = (d.effects || []).concat(r.effects);
			rebuildEffects();
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
		if (!txt) { setToast("info", "Type your idea first — e.g. \"Shared Power for the whole team\" or \"30% paralyze on contact\"."); return; }
		setToast("info", "Mechanic Studio is working…");
		try {
			const r = await api("POST", "/api/mechanics/design", { text: txt });
			if (r.target === "format") {
				setToast("info", "That sounds like a format rule (e.g. Shared Power OM). Open Formats → create a format and use Auto-create there.", 10000);
				return;
			}
			applyAbilityDesign(r);
			setToast("success", r.usedAI ? "Built with AI + safety checks — review below, then Save." : "Built from your description — review below, then Save.");
		} catch (err) {
			setToast("error", "Mechanic Studio failed: " + (err.message || "unknown"));
		}
	}

	async function doParse(useAI) {
		const txt = nlText.value.trim();
		if (!txt) { setToast("info", "Type a description first."); return; }
		const url = useAI ? "/api/abilities/parse-ai" : "/api/abilities/parse";
		setToast("info", useAI ? "🤖 AI is thinking…" : "Translating…");
		try {
			const r = await api("POST", url, { text: txt });
			applyAbilityDesign(r);
		} catch (err) {
			if (err.code === "not_configured") {
				setToast("error", "AI not set up yet. Get a free key at console.groq.com → add LLM_API_KEY to your .env → restart the launcher.", 12000);
			} else {
				setToast("error", (useAI ? "AI" : "Pattern") + " parser failed: " + (err.message || "unknown"));
			}
		}
	}

	renderCustomCode();

	const idInput = el("input", { type: "text", class: "js-ability-id", value: d.id || "", on: { input: (e) => { d.id = e.target.value; } } });

	return el("div", {},
		el("div", { class: "grid-2" },
			field("Name", textInput(d, "name", { placeholder: "Rose Aura", onChange: autoId }), "The public ability name shown in-game and in tooltips."),
			field("ID", idInput, "Auto-fills from the name.", "Internal id. Lowercase, no spaces."),
		),
		field("Short description", el("input", { type: "text", class: "js-ability-shortdesc", value: d.shortDesc || "", placeholder: "Shown in /dt and tooltips", on: { input: (e) => { d.shortDesc = e.target.value; } } }), "Briefly explains what the ability does."),

		el("div", { class: "card", style: { background: "linear-gradient(120deg, #fff0f8, #ede0ff)", padding: "1rem", marginTop: "1rem", marginBottom: "1rem" } },
			el("div", { style: { fontWeight: 700, color: "#3a2a4a", marginBottom: ".25rem" } }, "✨ Describe what this ability does"),
			el("p", { style: { color: "#5a4a6a", fontSize: ".85rem", lineHeight: "1.4", margin: "0 0 .75rem 0" } },
				"Describe any ability — even brand-new ideas. ", el("strong", {}, "Auto-create"), " tries instant patterns first, then AI if needed (set LLM_API_KEY for wild ideas). No TypeScript required."),
			nlText,
			el("div", { style: { display: "flex", gap: ".5rem", marginTop: ".5rem", flexWrap: "wrap", alignItems: "center" } },
				el("button", { class: "primary", on: { click: () => doAutoCreate() } }, "✨ Auto-create"),
				el("button", { class: "secondary", on: { click: () => doParse(false) } }, "⚡ Fast only"),
				el("button", { class: "secondary", on: { click: () => doParse(true) } }, "🤖 AI only"),
			),
			nlOut,
		),

		field("Effects", effectsHost, "What was inferred (or that you added manually). Edit, reorder, or remove."),
		customCodeHost,
	);
}
function renderItemForm(d) {
	function autoId() {
		if (!d.id && d.name) d.id = d.name.toLowerCase().replace(/[^a-z0-9]/g, "");
		const idEl = $(".js-item-id"); if (idEl) idEl.value = d.id || "";
	}

	const effectsHost = el("div", {});
	function rebuildEffects() {
		empty(effectsHost);
		d.effects = d.effects || [];
		// Only show item effects (those starting with "item")
		const itemEffects = (state.effects || []).filter((k) => k.id.startsWith("item"));
		if (d.effects.length === 0) {
			effectsHost.appendChild(el("div", { style: { color: "#888", fontSize: ".85rem", fontStyle: "italic", padding: ".5rem 0" } }, "No effects yet. Click \"+ Add effect\" to define what this item does."));
		}
		d.effects.forEach((ef, idx) => {
			const kindSel = el("select", { on: { change: (e) => { ef.kind = e.target.value; ef.params = {}; rebuildEffects(); } } },
				el("option", { value: "" }, "Pick what this item does…"),
				...itemEffects.map((k) => el("option", { value: k.id, selected: ef.kind === k.id }, k.id + " — " + k.description)),
			);
			const paramHost = el("div", { class: "grid-2", style: { marginTop: ".5rem" } });
			const kindDef = (state.effects || []).find((k) => k.id === ef.kind);
			if (kindDef && kindDef.paramFields) {
				for (const fname of kindDef.paramFields) {
					paramHost.appendChild(field(fname, el("input", { type: "text", value: ef.params[fname] != null ? ef.params[fname] : "", on: { input: (e) => { const v = e.target.value; const n = Number(v); ef.params[fname] = isNaN(n) || v === "" ? v : n; } } })));
				}
			}
			effectsHost.appendChild(el("div", { style: { background: "#faf6ff", padding: "1rem", borderRadius: "8px", marginBottom: ".5rem" } },
				el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" } },
					el("strong", {}, "Effect " + (idx + 1)),
					el("button", { class: "danger", on: { click: () => { d.effects.splice(idx, 1); rebuildEffects(); } } }, "Remove"),
				),
				kindSel,
				paramHost,
			));
		});
		effectsHost.appendChild(el("button", { class: "secondary", on: { click: () => { d.effects.push({ kind: "", params: {} }); rebuildEffects(); } } }, "+  Add effect"));
	}
	rebuildEffects();

	return el("div", {},
		el("div", { class: "grid-2" },
			field("Name", textInput(d, "name", { placeholder: "Pink Berry", onChange: autoId }), "The public item name shown in-game."),
			field("ID", el("input", { type: "text", class: "js-item-id", value: d.id || "", on: { input: (e) => { d.id = e.target.value; } } }), "Lowercase, no spaces"),
		),
		field("Number (≥ 9001)", textInput(d, "num", { type: "number" }), "Unique item ID. Must be ≥ 9001."),
		field("Short description", textInput(d, "shortDesc", { placeholder: "What this item does in battle." })),
		field("Effects", effectsHost, "Define what this item does using approved effect templates."),
	);
}
function renderLearnsetForm(d) {
	d.moves = d.moves || [];

	const ui = { q: "", typeFilter: "", catFilter: "" };

	// Species picker — must match a custom mon
	const customMonOpts = [{ id: "", label: "— pick a custom Pokémon —" }]
		.concat((state.customSpecies || []).map((s) => ({ id: s.data.id, label: s.data.name + " (" + s.data.id + ")" })));
	const speciesSel = el("select", { on: { change: (e) => { d.species = e.target.value; updateMonInfo(); } } },
		...customMonOpts.map((o) => el("option", { value: o.id, selected: d.species === o.id }, o.label)),
	);
	if (d.species && !customMonOpts.some((o) => o.id === d.species)) {
		speciesSel.appendChild(el("option", { value: d.species, selected: true }, d.species + " (custom)"));
	}

	// Show selected mon's types/tier next to picker
	const monInfo = el("span", { class: "ls-mon-info" });
	function updateMonInfo() {
		empty(monInfo);
		const s = (state.customSpecies || []).find((x) => x.data.id === d.species);
		if (!s) return;
		monInfo.appendChild(el("span", { class: "ls-mon-info-name" }, s.data.name));
		for (const t of (s.data.types || [])) {
			monInfo.appendChild(el("span", { class: "type-chip", style: { background: TYPE_COLORS[t] || "#888", marginLeft: ".25rem" } }, t));
		}
	}
	updateMonInfo();

	// — Starting Point card (collapsible) — Blank OR Inherit from any mon
	function inheritSearchMons() {
		const out = [];
		for (const s of state.customSpecies || []) out.push({ id: s.data.id, name: s.data.name, custom: true });
		for (const s of state.psSpecies || []) out.push({ id: s.id || (s.name.toLowerCase().replace(/[^a-z0-9]/g, "")), name: s.name, custom: false });
		return out;
	}

	const startingHost = el("div", { class: "ls-starting" });
	function paintStarting() {
		empty(startingHost);
		if (d.moves.length > 0) {
			startingHost.appendChild(el("div", { class: "ls-starting-summary" },
				el("span", {}, "📚 " + d.moves.length + " moves added."),
				el("button", { class: "ghost", on: { click: () => {
					if (d.moves.length && !confirm("Clear the current move list and start over?")) return;
					d.moves = [];
					paintStarting(); rebuildLeft(); rebuildRight();
				} } }, "Clear & restart"),
			));
			return;
		}
		// Empty — show pick a starting point
		const inheritSearch = el("input", { type: "text", placeholder: "Type any Pokémon name (e.g. Charizard, Pikachu, your custom mon)…", style: { width: "100%" } });
		const inheritResults = el("div", { class: "ls-inherit-results" });
		const lib = inheritSearchMons();
		function paintInheritResults() {
			empty(inheritResults);
			const q = inheritSearch.value.toLowerCase().trim();
			if (!q) { inheritResults.appendChild(el("p", { class: "sub", style: { margin: ".4rem 0 0 0", fontSize: "8.5pt" } }, "Type a name to find a Pokémon to copy its learnset from.")); return; }
			const matches = lib.filter((m) => m.name.toLowerCase().indexOf(q) >= 0).slice(0, 40);
			if (!matches.length) { inheritResults.appendChild(el("div", { class: "empty", style: { padding: ".5rem" } }, "No matches.")); return; }
			for (const m of matches) {
				inheritResults.appendChild(el("button", { class: "ls-inherit-pick", on: { click: () => doInherit(m) } },
					m.custom ? el("span", { style: { color: "#ff5cb6", marginRight: ".25rem" } }, "●") : null,
					m.name,
				));
			}
		}
		async function doInherit(mon) {
			setToast("info", "Loading " + mon.name + "'s learnset…");
			try {
				let moves = [];
				if (mon.custom) {
					// Custom mons may have their own learnset entry
					const cl = (state.customLearnsets || []).find((l) => l.data && l.data.species === mon.id);
					if (cl && Array.isArray(cl.data.moves)) moves = cl.data.moves.slice();
					else {
						// Custom mon without a stored learnset → try PS learnset under same id (rare)
						const r = await api("GET", "/api/ps-dex/learnset/" + mon.id);
						moves = r.moves || [];
					}
				} else {
					const r = await api("GET", "/api/ps-dex/learnset/" + mon.id);
					moves = r.moves || [];
				}
				if (!moves.length) { setToast("info", "No moves found for " + mon.name + "."); return; }
				d.moves = moves;
				paintStarting(); rebuildLeft(); rebuildRight();
				setToast("success", "Copied " + moves.length + " moves from " + mon.name + ".");
			} catch (err) {
				setToast("error", "Couldn't fetch learnset: " + (err.message || "unknown"));
			}
		}
		inheritSearch.addEventListener("input", debounce(() => paintInheritResults(), 160));

		startingHost.appendChild(el("div", { class: "ls-starting-pick" },
			el("div", { class: "ls-starting-title" }, "How do you want to start?"),
			el("div", { class: "ls-starting-tiles" },
				el("button", { class: "ls-starting-tile", on: { click: () => {
					d.moves = []; paintStarting(); rebuildLeft(); rebuildRight();
					setToast("info", "Blank learnset — add moves from the list below.");
				} } },
					el("div", { class: "ls-tile-icon" }, "✨"),
					el("div", { class: "ls-tile-title" }, "Blank slate"),
					el("div", { class: "ls-tile-desc" }, "Start with no moves and pick each one yourself."),
				),
				el("div", { class: "ls-starting-tile ls-tile-inherit" },
					el("div", { class: "ls-tile-icon" }, "📋"),
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
		// Combine PS moves with any Pinkacord custom moves the admin has defined.
		// Custom ones are tagged so the UI shows them as such.
		const ps = (state.psMoves || []);
		const customRaw = (state.customMoves || []);
		const custom = customRaw.map((c) => ({
			name: c.data.name,
			id: c.data.id,
			type: c.data.type || "Normal",
			category: c.data.category || "Status",
			basePower: c.data.basePower || 0,
			accuracy: c.data.accuracy ?? 100,
			pp: c.data.pp || 0,
			custom: true,
		}));
		// Custom moves first, then PS moves; dedupe by id (custom wins).
		const seen = new Set(custom.map((c) => c.id));
		return custom.concat(ps.filter((m) => !seen.has(m.id)));
	}

	function knows(name) {
		const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
		return (d.moves || []).some((m) => m.toLowerCase().replace(/[^a-z0-9]/g, "") === id);
	}
	function addMove(name) {
		if (!knows(name)) d.moves.push(name);
	}
	function removeMove(name) {
		const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
		d.moves = d.moves.filter((m) => m.toLowerCase().replace(/[^a-z0-9]/g, "") !== id);
	}

	const leftHost = el("div", { class: "ls-list" });
	const rightHost = el("div", { class: "ls-list ls-right" });

	function rebuildRight() {
		empty(rightHost);
		if (d.moves.length === 0) {
			rightHost.appendChild(el("div", { class: "empty", style: { padding: "1rem .5rem" } }, "No moves yet. Drag from the left."));
			return;
		}
		// For each move on the right, look up details by name if possible.
		const detail = (name) => (state.psMoves || []).find((m) => m.name.toLowerCase() === name.toLowerCase());
		for (const name of d.moves) {
			const m = detail(name);
			rightHost.appendChild(el("div", { class: "ls-move ls-known" },
				el("div", { class: "ls-move-name" }, name, m ? null : el("span", { class: "ls-move-warn", title: "Not a standard PS move — make sure this matches a custom move ID" }, " ?")),
				m ? el("div", { class: "ls-move-meta" },
					el("span", { class: "type-chip", style: { background: TYPE_COLORS[m.type] || "#888" } }, m.type),
					el("span", { class: "ls-cat ls-cat-" + (m.category || "Status").toLowerCase() }, m.category),
					m.basePower ? el("span", { class: "ls-bp" }, "BP " + m.basePower) : null,
				) : null,
				el("button", { class: "wk-chip-x", on: { click: () => { removeMove(name); rebuildRight(); rebuildLeft(); } } }, "×"),
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
					dblclick: () => { if (!has) { addMove(m.name); rebuildRight(); rebuildLeft(); } },
				},
			},
				el("div", { class: "ls-move-name" }, m.name),
				el("div", { class: "ls-move-meta" },
					el("span", { class: "type-chip", style: { background: TYPE_COLORS[m.type] || "#888" } }, m.type),
					el("span", { class: "ls-cat ls-cat-" + (m.category || "Status").toLowerCase() }, m.category),
					m.basePower ? el("span", { class: "ls-bp" }, "BP " + m.basePower) : null,
				),
				has ? el("div", { class: "ls-already-tag" }, "✓ added") : el("button", { class: "ls-add-btn", on: { click: () => { addMove(m.name); rebuildRight(); rebuildLeft(); } } }, "+ Add"),
			);
			leftHost.appendChild(card);
		}
	}

	// Right zone accepts drops
	const rightZone = el("div", { class: "ls-zone", on: {
		dragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; rightZone.classList.add("wk-drag-over"); },
		dragleave: () => { rightZone.classList.remove("wk-drag-over"); },
		drop: (e) => {
			e.preventDefault();
			rightZone.classList.remove("wk-drag-over");
			const name = e.dataTransfer.getData("text/pinkacord-move");
			if (!name) return;
			addMove(name);
			rebuildRight(); rebuildLeft();
		},
	} },
		el("div", { class: "ls-zone-head" },
			el("div", { class: "ls-zone-title" }, "Knows these moves"),
			el("div", { class: "ls-zone-sub" }, "Drag from the left, double-click, or click + Add. Type a custom move ID below to add it directly."),
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
					rebuildRight(); rebuildLeft();
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

	return el("div", { class: "ls-root" },
		el("div", { class: "ls-header" },
			el("div", { class: "ls-header-left" },
				el("div", { class: "ls-header-label" }, "This learnset is for"),
				el("div", { class: "ls-header-row" }, speciesSel, monInfo),
			),
		),
		startingHost,
		el("div", { class: "ls-grid" },
			el("div", { class: "ls-pane" },
				el("div", { class: "ls-pane-head" },
					el("div", { class: "ls-pane-title" }, "All moves"),
					el("div", { class: "ls-pane-sub" }, "Click + Add or double-click. Drag also works."),
				),
				el("div", { class: "ls-pane-filters" }, search, typeSel, catSel),
				leftHost,
			),
			rightZone,
		),
	);
}
// ─── Format editor — registry of clauses, tier presets, common bans ─────────
// PS's ruleset / banlist are free-form arrays of strings the engine knows
// about. We curate the common, well-known ones here so admins click instead of
// typing, but we still let them type custom entries (which PS will accept).

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

// Standard, sensible defaults for the most popular tiers in Gen 9 singles.
// Clicking a preset replaces the banlist with these — admins can tweak after.
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

// ─── Format editor — tour-organizer first ───────────────────────────────────
// Designed so a tour organizer can spin up a new format end-to-end without
// understanding PS ruleset string primitives. Every "advanced" PS rule is
// surfaced as a real UI control:
//   - team sizes  →  Min/Max/Picked Team Size = N
//   - level cap   →  Adjust Level = N  (and Min/Max Level = N)
//   - gen filter  →  Min/Max Source Gen = N
//   - monotype    →  Force Monotype = <Type>
//   - tera force  →  Force Tera Type = <Type>
//   - EV limit    →  EV Limit = N
//
// The data model is exactly the same as v1: every change ends up in
// d.ruleset[] / d.banlist[] / d.unbanlist[] / d.gameType / d.team /
// d.bestOfDefault / d.mod / d.sharedPower. The generator + smoke test
// don't need to know we redrew the UI.

// ── Parametric-rule helpers ─────────────────────────────────────────────────
// PS rules with "LHS = N" form. We parse them out of d.ruleset[] for display
// and write them back on change.
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

// ── Allowed-pool category routing ───────────────────────────────────────────
// banlist[]/unbanlist[] are flat string arrays. We categorize entries by
// looking them up in the various PS dexes so the UI can show separate panes
// for Pokémon / Items / Moves / Abilities.
function categorizePoolEntry(entry) {
	const id = String(entry).toLowerCase().replace(/[^a-z0-9]/g, "");
	if (!id) return "unknown";
	// Strip leading + - * (PS allow/ban shorthand) before lookup
	const bare = String(entry).replace(/^[+\-*]/, "").trim();
	const bid = bare.toLowerCase().replace(/[^a-z0-9]/g, "");
	const inDex = (arr, name) => (arr || []).some((x) => {
		const n = typeof x === "string" ? x : (x && x.name) || "";
		return n.toLowerCase().replace(/[^a-z0-9]/g, "") === bid;
	});
	// Custom items aren't fetched yet; only PS items are categorized.
	if (inDex(state.customSpecies && state.customSpecies.map((s) => s.data && s.data.name), null)) return "species";
	if (inDex(state.psSpecies, null)) return "species";
	if (inDex(state.customMoves && state.customMoves.map((m) => m.data && m.data.name), null)) return "moves";
	if (inDex(state.psMoves, null)) return "moves";
	if (inDex(state.customAbilities && state.customAbilities.map((a) => a.data && a.data.name), null)) return "abilities";
	if (inDex(state.psAbilities, null)) return "abilities";
	// Tier names like Uber/OU/UU stay as "species" since they restrict species.
	const tiers = ["AG", "Uber", "Ubers", "OU", "UU", "UUBL", "RU", "RUBL", "NU", "NUBL", "PU", "PUBL", "ZU", "ZUBL", "NFE", "LC"];
	if (tiers.some((t) => t.toLowerCase() === bare.toLowerCase())) return "species";
	return "other";
}

// ── Format preset gallery ───────────────────────────────────────────────────
// Picking one prefills the editor form so the organizer starts from a working
// template, then tweaks. Every preset only writes the fields it cares about,
// so e.g. picking "Monotype" doesn't reset the section/column the admin set.
const FORMAT_PRESETS = [
	{ id: "ou", icon: "🌟", title: "OU (Standard)", desc: "Smogon OverUsed — the most popular competitive ruleset.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Moody", "Shadow Tag", "Arena Trap", "King's Rock", "Razor Fang", "Baton Pass", "Last Respects", "Shed Tail"]; d.unbanlist = []; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] OU"; if (!d.desc) d.desc = "OU rules on the Pinkacord dex."; } },
	{ id: "ubers", icon: "💥", title: "Ubers", desc: "Anything except AG and a few broken combos.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["AG", "Moody", "King's Rock", "Razor Fang", "Baton Pass", "Last Respects"]; d.unbanlist = []; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Ubers"; } },
	{ id: "ag", icon: "🌌", title: "Anything Goes", desc: "No bans. Mostly for testing & jank.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = []; d.unbanlist = []; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] AG"; } },
	{ id: "random", icon: "🎲", title: "Random Battle", desc: "Server generates teams each battle.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.team = "random"; d.ruleset = ["[Gen 9] Random Battle"]; d.banlist = []; d.unbanlist = []; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Random Battle"; } },
	{ id: "doubles", icon: "👥", title: "Doubles OU", desc: "2v2 active. Team play, fast pace.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "doubles"; d.ruleset = ["Standard Doubles", "Sleep Moves Clause", "Species Clause", "OHKO Clause", "Evasion Moves Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["DUber", "Moody", "Swagger", "Last Respects"]; d.unbanlist = []; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Doubles OU"; } },
	{ id: "ffa", icon: "🌪️", title: "Free-for-all", desc: "4-player free-for-all chaos.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "freeforall"; d.ruleset = ["Standard FFA", "Species Clause", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Baton Pass"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] FFA"; } },
	{ id: "monotype", icon: "🌈", title: "Monotype", desc: "Whole team must share a type.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Same Type Clause", "Species Clause", "OHKO Clause", "Evasion Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Monotype"; } },
	{ id: "inverse", icon: "🔄", title: "Inverse", desc: "Type chart is inverted — Fire beats Water.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Inverse Mod", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["AG", "Moody"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Inverse"; } },
	{ id: "scalemons", icon: "📏", title: "Scalemons", desc: "Every mon's BST is scaled to 600.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Scalemons Mod", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Scalemons"; } },
	{ id: "aaa", icon: "⚡", title: "Almost Any Ability", desc: "Most mons can run almost any ability.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "!Obtainable Abilities", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Arena Trap", "Comatose", "Contrary", "Fur Coat", "Huge Power", "Imposter", "Innards Out", "Magic Bounce", "Magnet Pull", "Moody", "Neutralizing Gas", "Parental Bond", "Poison Heal", "Pure Power", "Shadow Tag", "Simple", "Speed Boost", "Stakeout", "Triage", "Unburden", "Water Bubble", "Wonder Guard"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] AAA"; } },
	{ id: "bh", icon: "🏗️", title: "Balanced Hackmons", desc: "Any move/ability/item. Few bans.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["-Nonexistent", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod", "Forme Clause"]; d.banlist = ["Arceus", "Calyrex-Shadow", "Eternatus-Eternamax", "Groudon-Primal", "Kyogre-Primal", "Magearna", "Mewtwo", "Necrozma-Ultra", "Rayquaza", "Zacian-Crowned"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] BH"; } },
	{ id: "bring6pick3", icon: "🎯", title: "Bring 6, Pick 3", desc: "Build 6 mons, choose 3 at preview. Tournament-style.",
		apply: (d) => { d.mod = "gen9"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod", "Min Team Size = 6", "Max Team Size = 6", "Picked Team Size = 3"]; d.banlist = ["Uber", "AG", "Moody", "Baton Pass", "Last Respects"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Bring 6 Pick 3"; } },
	{ id: "pinkacord_ou", icon: "🎀", title: "Pinkacord OU", desc: "Custom dex + OU rules. Your community's home format.",
		apply: (d) => { d.mod = "pinkacord"; d.gameType = "singles"; d.ruleset = ["Standard", "Sleep Clause Mod", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; d.banlist = ["Uber", "AG", "Moody", "Baton Pass"]; d.sharedPower = false; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] OU"; } },
	{ id: "shared_power", icon: "🤝", title: "Shared Power", desc: "Active mons share each switched-in ability.",
		apply: (d) => { d.mod = "pinkacord"; d.gameType = "singles"; d.sharedPower = true; d.ruleset = ["Standard", "Species Clause", "OHKO Clause", "Endless Battle Clause", "HP Percentage Mod"]; if (!d.name || d.name === "[Pinkacord] ") d.name = "[Pinkacord] Shared Power"; } },
	{ id: "blank", icon: "⬜", title: "Blank", desc: "Empty form. Build from scratch.",
		apply: (d) => { /* leave the defaults */ } },
];

// ─── Card-Stack format editor (v3) ────────────────────────────────────────
// Single scrollable page composed of stackable cards. Each card owns one piece
// of the format and mutates d in place. Cross-card updates flow through
// ctrl.refreshAll(except), which rebuilds the sticky preview pill + every card
// EXCEPT the one passed in. Sticky header is outside the card host so the
// format-name input keeps focus while typing.

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
	{ id: "singles", label: "Singles", icon: "⚔️", desc: "1v1 active." },
	{ id: "doubles", label: "Doubles", icon: "⚔️⚔️", desc: "2v2 active." },
	{ id: "triples", label: "Triples", icon: "⚔️⚔️⚔️", desc: "3v3 active." },
	{ id: "multi", label: "Multi", icon: "🤝", desc: "2v2, two players per side." },
	{ id: "freeforall", label: "Free-for-all", icon: "🌪️", desc: "4 players, every mon for itself." },
	{ id: "rotation", label: "Rotation", icon: "🔄", desc: "Triples with rotation." },
];
const TEAM_SOURCES_V3 = [
	{ id: "", label: "Players bring their own", icon: "🛠️", desc: "Standard — players build & bring." },
	{ id: "random", label: "Random teams", icon: "🎲", desc: "Server generates each team." },
	{ id: "randomFFA", label: "Random + FFA", icon: "🎲🌪️", desc: "Random teams in free-for-all." },
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
	const chevEl = el("span", { class: "fc-chev" });
	const titleRow = el("div", { class: "fc-title-row" },
		chevEl,
		el("span", { class: "fc-title" }, title),
		summaryEl,
	);
	let isOpen = defaultExpanded;
	function applyOpen() {
		card.node.dataset.collapsed = String(!isOpen);
		chevEl.textContent = isOpen ? "▾" : "▸";
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

function renderFormatEditor(d) {
	// Defaults
	d.ruleset = d.ruleset || ["Standard"];
	d.banlist = d.banlist || [];
	d.unbanlist = d.unbanlist || [];
	d.gameType = d.gameType || "singles";
	d.mod = d.mod || "pinkacord";
	d.section = d.section || "Pinkacord";
	d.column = d.column || 1;
	if (d.enabled === undefined) d.enabled = true;

	const wrap = el("div", { class: "fc-editor" });

	// STICKY HEADER — outside the card host so input focus survives refreshAll
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

	const isNew = !d.id;
	ctrl.cards = [
		buildCardV3("starting", "Starting point", isNew && !d._startedFrom, renderStartingBodyV3, d, ctrl),
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
			el("button", { class: "secondary", on: { click: () => { delete d._startedFrom; ctrl.refreshAll(); } } }, "Switch starting point"),
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
			el("div", { class: "ico" }, p.icon),
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
		el("button", { class: "primary", style: { marginTop: ".5rem" }, on: { click: doAuto } }, "Auto-create"),
	));

	const customFormats = state.customFormats || [];
	if (customFormats.length) {
		const sel = el("select", {},
			el("option", { value: "" }, "— pick a format to clone —"),
			...customFormats.map((f) => el("option", { value: f.id }, (f.data && f.data.name) || f.id)),
		);
		const cloneBtn = el("button", { class: "secondary", on: { click: () => {
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
				// Bans card depends on d.mod for the species-pool filter — refresh just it.
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
		const host = el("div", { class: "fmt-tile-grid cols-3" });
		for (const o of opts) {
			const sel = currentId === o.id;
			host.appendChild(el("div", { class: "fmt-tile" + (sel ? " selected" : ""), on: { click: () => onPick(o.id) } },
				el("div", { class: "ico" }, o.icon),
				el("div", { class: "title" }, o.label),
				el("div", { class: "desc" }, o.desc),
			));
		}
		return host;
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
			el("div", { style: { display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".2rem" } },
				cb, el("div", { style: { fontWeight: 700, fontSize: "9.5pt", flex: 1 } }, label),
			),
			hint ? el("div", { style: { fontSize: "8.5pt", color: "#6a5a7a", marginBottom: ".2rem" } }, hint) : null,
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
	const genLabel = el("div", { style: { fontWeight: 700, fontSize: ".85rem", marginBottom: ".35rem" } },
		"Allowed gens: " + (minG || maxG ? "gen " + (minG || 1) + " – gen " + (maxG || 9) : "every gen (no filter)"));
	const genBox = el("div", {},
		genLabel,
		paramSlider("Min Source Gen", "Earliest gen", "Minimum source gen.", 1, 9, 1),
		paramSlider("Max Source Gen", "Latest gen", "Maximum source gen.", 1, 9, 9),
	);

	const TYPE_OPTS = ["", ...(typeof TYPES !== "undefined" ? TYPES : [])];
	const monoSel = el("select", { on: { change: (e) => { fmtSetParam(d, "Force Monotype", e.target.value || null); ctrl.refreshAll(card); } } },
		...TYPE_OPTS.map((t) => el("option", { value: t, selected: (fmtGetParam(d, "Force Monotype") || "") === t }, t || "(no monotype)")));
	const teraSel = el("select", { on: { change: (e) => { fmtSetParam(d, "Force Tera Type", e.target.value || null); ctrl.refreshAll(card); } } },
		...TYPE_OPTS.map((t) => el("option", { value: t, selected: (fmtGetParam(d, "Force Tera Type") || "") === t }, t || "(no forced tera)")));

	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Game type"), gameHost));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Team source"), teamHost));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Match length"), bestOf));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Team size"), teamSizesBox));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Level cap"), levelBox));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "EV limit"), evBox));
	host.appendChild(el("div", { class: "fmt-section" }, el("h3", {}, "Gen filter"), genBox));
	host.appendChild(el("div", { class: "fmt-section" },
		el("div", { class: "grid-2" },
			field("Force Monotype", monoSel, "Whole team must share this type."),
			field("Force Tera Type", teraSel, "All mons forced to this Tera type."),
		),
	));
}


// ── Card body: Bans & unbans (unified, search-first) ──────────────────────
// One card with sub-tabs for the four ban categories. Default view shows ONLY
// what's currently banned + a search box; the library appears as you type, or
// when you hit "Browse all." Mon browse is grouped by tier so it's not random.
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

	// Persist active pane across refreshes on the data object so we don't reset.
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

	// — Tier presets (Pokémon only)
	if (pane === "species") {
		const presetRow = el("div", { class: "wk-presets" });
		for (const name of Object.keys(TIER_PRESETS)) {
			presetRow.appendChild(el("button", { class: "secondary", on: { click: () => {
				const p = TIER_PRESETS[name];
				if (!confirm("Replace banlist with " + name + " preset?\n\n" + p.note)) return;
				d.banlist = p.banlist.slice();
				ctrl.refreshAll();
				setToast("success", "Applied " + name + " preset.");
			} } }, name));
		}
		paneSlot.appendChild(el("div", { class: "fmt-section" }, presetRow));
	}

	// Lazy fetch items list
	if (pane === "items" && !state._psItemsLite) {
		api("GET", "/api/ps-dex/items").then((r) => { state._psItemsLite = r.items || []; renderBanPane(d, paneSlot, ctrl, card); }).catch(() => {});
	}

	// — Currently banned/unbanned chips (the at-a-glance state)
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
		el("h3", { style: { fontSize: "10pt" } }, "Currently set"),
		chipCount ? chips : el("p", { class: "sub", style: { margin: 0 } }, "Nothing banned or unbanned yet."),
	));

	// — Search + add (the primary action)
	const search = el("input", { type: "text", placeholder: "Search " + sectLabel + " — type to add by name, Enter to ban", style: { width: "100%", padding: ".45rem .6rem", fontSize: "10pt" } });
	const resultBox = el("div", { class: "fc-search-results" });

	// Build the underlying library once per pane render
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
				for (const n of speciesPool) poolSet[n.toLowerCase().replace(/[^a-z0-9]/g, "")] = true;
				for (const s of state.psSpecies || []) {
					if (poolSet[s.name.toLowerCase().replace(/[^a-z0-9]/g, "")]) out.push({ name: s.name, tier: s.tier || "—", custom: false });
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

	const browseBtn = el("button", { class: "secondary", style: { marginLeft: ".5rem" }, on: { click: () => { d._banBrowse = !d._banBrowse; renderBanPane(d, paneSlot, ctrl, card); } } }, d._banBrowse ? "Hide all" : "Browse all");
	const banBtn = el("button", { class: "danger", title: "Ban what's typed (Enter)", on: { click: () => commitTyped("ban") } }, "🚫 Ban");
	const allowBtn = el("button", { class: "secondary", title: "Add to unban list", on: { click: () => commitTyped("unban") } }, "✅ Allow");
	function commitTyped(mode) {
		const v = search.value.trim(); if (!v) { setToast("info", "Type a name first."); return; }
		const exact = lib.find((it) => it.name.toLowerCase() === v.toLowerCase());
		// If a mod-pool is active and the typed name isn't in it, refuse — prevents
		// e.g. unbanning Mewtwo in a Gen 5 OU format where Mewtwo just isn't in scope.
		if (!exact && pane === "species" && modFilter) {
			setToast("error", '"' + v + '" isn\'t in the ' + modFilter.toUpperCase() + " dex. Pick from the suggestions or switch the dex on the Identity card.", 7000);
			return;
		}
		if (!exact && pane === "species") {
			// Pinkacord pool — still validate against the merged species library so typos
			// don't silently land in the banlist.
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
		// Items pane: if library hasn't loaded yet, show a loading state instead of "type to search"
		if (pane === "items" && !state._psItemsLite) {
			resultBox.appendChild(el("p", { class: "sub", style: { margin: ".5rem 0 0 0" } }, "Loading items…"));
			return;
		}
		if (!q && !showBrowse) {
			resultBox.appendChild(el("p", { class: "sub", style: { margin: ".5rem 0 0 0" } },
				"Type above to find a " + sectLabel.replace(/s$/, "") + ", then hit ",
				el("strong", {}, "🚫 Ban"), " or ", el("strong", {}, "✅ Allow"), ". Or click ",
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
					? ("/api/species/" + normalizeName(it.name) + "/sprite/preview")
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
					el("div", { class: "pi-name" }, it.custom ? el("span", { style: { color: "#ff5cb6", marginRight: ".25rem" } }, "●") : null, it.name),
					it.tier ? el("span", { class: "pi-meta" }, it.tier) : null,
					status === "banned" ? el("span", { class: "pi-tag ban" }, "BAN") : status === "unbanned" ? el("span", { class: "pi-tag unban" }, "UNBAN") : null,
				));
			}
		}
		if (q || !(pane === "species" && showBrowse)) resultBox.appendChild(group);
		if (!shown) resultBox.appendChild(el("div", { class: "empty", style: { padding: ".75rem", color: "#888" } }, "No matches."));
		else if (total > shown) resultBox.appendChild(el("div", { class: "empty", style: { padding: ".4rem", fontSize: ".8rem", color: "#888" } }, "Showing " + shown + " of " + total + " — refine search."));
	}
	search.addEventListener("input", debounce(() => renderResults(), 160));
	search.addEventListener("keydown", (e) => {
		if (e.key === "Enter") { e.preventDefault(); commitTyped("ban"); }
	});

	paneSlot.appendChild(el("div", { class: "fmt-section" },
		el("div", { style: { display: "flex", gap: ".4rem", alignItems: "center", flexWrap: "wrap" } }, search, banBtn, allowBtn, browseBtn),
		el("div", { class: "sub", style: { fontSize: "8.5pt", margin: ".3rem 0 0 0" } }, "Enter = ban. Click a result tile to cycle neutral → ban → unban → neutral."),
		resultBox,
	));
	renderResults();
}

// ── Card body: Clauses ─────────────────────────────────────────────────────
function renderClausesBodyV3(d, host, ctrl, card) {
	const active = KNOWN_CLAUSES.filter((c) => (d.ruleset || []).includes(c.id));
	card.setSummary(active.length + " active");

	const list = el("div", { style: { display: "grid", gap: ".4rem" } });
	for (const c of KNOWN_CLAUSES) {
		const checked = (d.ruleset || []).includes(c.id);
		const cb = el("input", { type: "checkbox", checked, disabled: c.required, style: { width: "auto", marginTop: "3px" },
			on: { change: () => { fmtToggleRule(d, c.id, !checked); ctrl.refreshAll(); } } });
		list.appendChild(el("label", { class: "fmt-toggle " + (checked ? "on" : ""), style: { cursor: c.required ? "default" : "pointer" } },
			cb,
			el("div", {},
				el("div", { class: "t-title" }, c.label, c.required ? el("span", { style: { fontSize: ".7rem", color: "#888", marginLeft: ".4rem", fontWeight: "normal" } }, "(required)") : null),
				el("div", { class: "t-desc" }, c.desc),
			),
		));
	}
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Clauses"),
		el("p", { class: "sub" }, "The competitive rules. ", el("strong", {}, "Standard"), " bundles the common ones."),
		list,
	));
}

// ── Card body: Special mechanics ───────────────────────────────────────────
function renderMechanicsBodyV3(d, host, ctrl, card) {
	const onCount = MECHANICS_V3.filter((m) => m.isOn(d)).length;
	card.setSummary(onCount ? onCount + " active" : "none");

	const list = el("div", { style: { display: "grid", gap: ".4rem" } });
	for (const m of MECHANICS_V3) {
		const on = m.isOn(d);
		const disabled = m.disabled ? m.disabled(d) : false;
		const cb = el("input", { type: "checkbox", checked: on, disabled,
			on: { change: (e) => { m.set(d, e.target.checked); ctrl.refreshAll(); } } });
		list.appendChild(el("label", { class: "fmt-toggle " + (on ? "on" : ""), style: { opacity: disabled ? .55 : 1, cursor: disabled ? "not-allowed" : "pointer" } },
			cb,
			el("div", {},
				el("div", { class: "t-title" }, m.label),
				el("div", { class: "t-desc" }, m.desc, disabled ? el("span", { style: { color: "#a02020", marginLeft: ".4rem" } }, "(" + m.disabledReason + ")") : null),
			),
		));
	}
	host.appendChild(el("div", { class: "fmt-section" },
		el("h3", {}, "Other Metas"),
		el("p", { class: "sub" }, "Popular Smogon OM mechanics."),
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
		el("p", { class: "sub" }, "Direct edit. These textareas are the source of truth for ", el("code", {}, "ruleset"), " / ", el("code", {}, "banlist"), " / ", el("code", {}, "unbanlist"), " — edits flow into the other cards (250ms debounce). Cards' edits flow back here unless you're typing."),
		field("Extra rules (one per line)", rawRules, "Anything PS knows but isn't surfaced as a control above."),
		el("div", { class: "grid-2" },
			field("Banlist (one per line)", rawBan, "Free-text bans."),
			field("Unbanlist (one per line)", rawUnban, "Allow specific entries the rules would normally ban."),
		),
		el("label", { style: { display: "inline-flex", alignItems: "center", gap: ".35rem", marginTop: ".4rem" } }, showJsonCb, "Show raw JSON (debug)"),
		jsonBox,
		el("hr", { style: { margin: "1rem 0", border: "none", borderTop: "1px solid #d8cfe5" } }),
		el("h3", {}, "Summary"),
		renderFormatPreviewSummary(d),
	));
}

// ── Inline summary preview (embedded in Clauses tab) ──────────────────────
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
	if (mn || mx) lines.push("Gens " + (mn || 1) + "\u2013" + (mx || 9));
	const cats = { species: 0, items: 0, moves: 0, abilities: 0 };
	for (const e of d.banlist) cats[categorizePoolEntry(e)] = (cats[categorizePoolEntry(e)] || 0) + 1;
	const bp = [];
	if (cats.species) bp.push(cats.species + " Pok\u00e9mon");
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
		el("div", { style: { background: "#f0e8f5", borderRadius: "6px", padding: ".75rem 1rem", fontSize: ".85rem", lineHeight: "1.6" } },
			el("strong", { style: { fontSize: ".9rem", color: "#2a1a3a" } }, d.name || "(unnamed)"),
			d.desc ? el("div", { style: { color: "#6a5a7a", fontStyle: "italic", marginTop: ".15rem", marginBottom: ".4rem", fontSize: ".8rem" } }, d.desc) : null,
			el("ul", { style: { margin: ".3rem 0 0 0", paddingLeft: "1.2rem", color: "#4a3a5e" } }, ...lines.map((l) => el("li", {}, l))),
		),
		el("button", { class: "secondary", style: { marginTop: ".5rem" }, on: { click: copySummary } }, "Copy summary"),
	);
}

// ── Plain-English summary helpers ─────────────────────────────────────────
function normalizeName(s) { return String(s).replace(/^[+\-*]/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }

// ─── Sprite gallery view ─────────────────────────────────────────────────────
function renderSpritesGallery() {
	const wrap = el("div", {});
	wrap.appendChild(el("div", { class: "card hero" },
		el("h2", {}, "Sprite gallery"),
		el("p", {}, "Every custom Pokémon's sprite at a glance. Click any tile to upload, replace, or remove. Mons without sprites are shown with a placeholder so they're easy to spot."),
	));
	const filter = { showMissingOnly: false, q: "" };
	const card = el("div", { class: "card" });
	wrap.appendChild(card);

	const controls = el("div", { style: { display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".85rem", flexWrap: "wrap" } },
		el("input", { type: "text", placeholder: "Search by name…", style: { maxWidth: "260px" }, on: { input: (e) => { filter.q = e.target.value; rebuild(); } } }),
		el("label", { style: { display: "inline-flex", alignItems: "center", gap: ".35rem", fontWeight: 700, color: "#2a1a3a", fontSize: "9.5pt" } },
			el("input", { type: "checkbox", style: { width: "auto" }, on: { change: (e) => { filter.showMissingOnly = e.target.checked; rebuild(); } } }),
			el("span", {}, "Show missing only"),
		),
	);
	card.appendChild(controls);
	const grid = el("div", { class: "mon-grid" });
	card.appendChild(grid);

	function rebuild() {
		empty(grid);
		api("GET", "/api/sprites").then((r) => {
			const all = (r.items || []).filter((s) => {
				if (filter.showMissingOnly && s.hasSprite) return false;
				if (filter.q && (s.name || "").toLowerCase().indexOf(filter.q.toLowerCase()) < 0) return false;
				return true;
			});
			empty(grid);
			if (all.length === 0) {
				grid.appendChild(el("div", { class: "empty" }, el("div", { class: "big" }, "✨"), el("div", {}, "No mons match.")));
				return;
			}
			for (const s of all) {
				const tile = el("div", { class: "mon-card", on: { click: () => {
					// Navigate to species editor with sprite tab open
					// We use a tiny global state hop: set view to species and open the editor.
					api("GET", "/api/species/" + encodeURIComponent(s.id)).then((res) => {
						if (res && res.item) openEditorOnTab("species", res.item, "sprite");
					}).catch(() => setToast("error", "Couldn't open " + s.id));
				} } });
				const spriteBox = el("div", { class: "sprite-box" });
				if (s.hasSprite) {
					const img = el("img", { src: "/api/species/" + encodeURIComponent(s.id) + "/sprite/preview?ts=" + Date.now() });
					img.onerror = () => { img.style.display = "none"; spriteBox.appendChild(el("div", { style: { fontSize: "2rem", opacity: ".3" } }, "?")); };
					spriteBox.appendChild(img);
				} else {
					spriteBox.appendChild(el("div", { style: { fontSize: "1.8rem", opacity: ".4", color: "#a02020" } }, "—"));
				}
				tile.appendChild(spriteBox);
				tile.appendChild(el("div", { class: "name" }, s.name || s.id));
				tile.appendChild(el("div", { class: "types" },
					...(s.types || []).map((t) => el("span", { class: "type-chip", style: { background: TYPE_COLORS[t] || "#888" } }, t))));
				tile.appendChild(el("div", { class: "meta" }, s.hasSprite ? "Sprite: " + (s.ext || "ok") : "No sprite"));
				grid.appendChild(tile);
			}
		}).catch((err) => {
			empty(grid);
			grid.appendChild(el("div", { class: "empty" }, "Couldn't load sprite list: " + (err.message || err)));
		});
	}
	rebuild();
	return wrap;
}

// ─── Advanced view (the rarely-used entity types) ────────────────────────────
function renderAdvanced() {
	return el("div", {},
		el("div", { class: "card hero" },
			el("h2", {}, "⚙️ Advanced"),
			el("p", {}, "These are power-user tools. Most of the time you'll only need ", el("strong", {}, "Pokémon"), " and ", el("strong", {}, "Formats"), "."),
		),
		el("div", { class: "card" },
			el("h2", {}, "Sections"),
			el("div", { style: { display: "grid", gap: ".5rem", marginTop: ".5rem" } },
				advancedTile("items", "🎒  Custom items", "Make held items like Pinkacord Berry."),
				advancedTile("learnsets", "📚  Learnsets", "Manually edit which moves a Pokémon can learn. Auto-generated normally."),
			),
		),
	);
}
function advancedTile(view, label, hint) {
	return el("div", { style: { padding: ".75rem 1rem", background: "#faf6ff", borderRadius: "8px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }, on: { click: () => { location.hash = view; } } },
		el("div", {},
			el("div", { style: { fontWeight: 600, color: "#3a2a4a" } }, label),
			el("div", { style: { fontSize: ".85rem", color: "#888" } }, hint),
		),
		el("div", { style: { color: "#b58cff" } }, "→"),
	);
}

// ─── Audit / change log ──────────────────────────────────────────────────────
function renderAudit() {
	const wrap = el("div", { class: "card" }, el("h2", {}, "📜 Change log"));
	const slot = el("div", { class: "audit-timeline" }, el("div", { class: "empty" }, "Loading…"));
	wrap.appendChild(slot);
	api("GET", "/api/audit").then((r) => {
		empty(slot);
		if (r.entries.length === 0) {
			slot.appendChild(el("div", { class: "empty" },
				el("div", { class: "big" }, "📜"),
				el("div", {}, "No changes yet. Once you save something, it'll show up here."),
			));
			return;
		}
		for (const e of r.entries) {
			const icon = e.action.startsWith("auth") ? "🔑" : e.action.startsWith("build") ? "⚡" : e.action.startsWith("hotpatch") ? "🚀" : e.action.startsWith("sprite") ? "🎨" : e.action.includes("create") ? "✨" : e.action.includes("update") ? "✏️" : e.action.includes("delete") ? "🗑️" : "•";
			slot.appendChild(el("div", { class: "audit-entry" },
				el("div", { class: "icon" }, icon),
				el("div", { class: "body" },
					el("div", { class: "top" },
						el("div", {}, el("span", { class: "who" }, e.actor), el("span", { style: { color: "#888", marginLeft: ".4rem" } }, e.action), e.id ? el("span", { style: { color: "#b58cff", marginLeft: ".4rem" } }, e.id) : null),
						el("div", { class: "ts" }, new Date(e.ts).toLocaleString()),
					),
				),
			));
		}
	}).catch((err) => { empty(slot); slot.appendChild(el("div", { class: "banner error" }, err.message)); });
	return wrap;
}

// ─── Actions ────────────────────────────────────────────────────────────────
async function doBuildAndApply() {
	// Check for unsaved changes in an open editor modal
	const openModal = $(".modal-overlay");
	if (openModal) {
		if (!confirm("You have an editor open with unsaved changes. Build will NOT include those changes.\n\nClose the editor first, then Save & Apply from there. Continue build anyway?")) return;
	}
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
	const summary = " ✨ " + buildResult.stats.species + " Pokémon, ⚡ " + buildResult.stats.moves + " moves, 🔮 " + buildResult.stats.abilities + " abilities, 🏆 " + buildResult.stats.formats + " formats.";
	if (!state.botConfigured) {
		state.pendingChanges = 0;
		render();
		// Send the user to Home so the deploy card is in front of them with copy-button.
		if (state.view !== "home") location.hash = "home";
		setToast("success", "Built." + summary + " Open Home → Deploy and copy the /hotpatch commands into PS chat to push live.", 14000);
		return;
	}
	setToast("info", "Build OK." + summary + " Hot-patching live server…");
	try {
		const hp = await api("POST", "/api/hotpatch");
		state.pendingChanges = 0;
		render();
		setToast("success", "✓ Live!" + summary + " " + (hp.message || ""), 10000);
	} catch (err) {
		setToast("error", "Build OK but hotpatch failed: " + (err.message || "unknown") + ". Open Home → Deploy and paste the manual commands.", 12000);
	}
}
async function doLogout() {
	try { await api("POST", "/api/logout"); } catch {}
	state.authed = false; state.displayName = null; location.hash = ""; renderRouted();
}
async function confirmDelete(type, item) {
	const name = item.data.name || item.data.species || item.id;
	if (!confirm("Delete \"" + name + "\"?\n\nYou'll need to click ⚡ Apply afterwards to push the deletion to the live server. The change is also recorded in the change log.")) return;
	try {
		await api("DELETE", "/api/" + type + "/" + encodeURIComponent(item.id));
		state.pendingChanges++;
		setToast("success", "Deleted " + name + ". Click ⚡ Apply when you're ready to push to live.");
		render();
	} catch (err) {
		const detail = err.fieldErrors && err.fieldErrors.length ? "\n\n" + err.fieldErrors.join("\n") : "";
		setToast("error", (err.message || "delete failed") + detail, 9000);
	}
}

boot();

})();
`;
