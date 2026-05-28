# Pinkacord — Client Customization Architecture

This document describes how we extend the official Pokemon Showdown **client**
(forked at `C:\pokemon-showdown-pinkacord-client`) with our custom dex, in a
way that survives upstream rebases and shares its source of truth with the
server fork.

## Why the client matters

PS is two cooperating systems: a game server (this repo) and a browser client.
Our server already knows about Pinkachu / Pink Bolt / Rose Aura, but the
**client** doesn't — so when a user opens the teambuilder or watches a battle,
custom mons render as missingno and custom moves show with no description or
animation.

We fix this by generating a single **client overlay script** that the client
loads after its standard dex data. The overlay mutates the well-known global
tables (`window.BattlePokedex`, `BattleMovedex`, `BattleAbilities`, …) to
inject our content.


## Why a runtime overlay, not a fork of the data pipeline

The PS client pulls its dex data from a separate repo
(`Zarel/Pokemon-Showdown-Dex`) and serves the result as static JS files
(`data/pokedex.js`, `data/moves.js`, etc.). Forking that pipeline is a heavy
maintenance burden. Instead we:

1. Treat the official dex files as opaque, immutable input.
2. Emit a single additional file, `pinkacord-overlay.js`, that runs after them.
3. The overlay simply `Object.assign`s our entries onto the globals — the same
   pattern the client itself uses for late-loaded data.

This makes upstream PS-client rebases almost free: as long as the global
table names don't change (they haven't in years), our overlay keeps working.


## Same source of truth as the server

We do **not** duplicate the content. The client overlay generator reads the
exact same `content/pinkacord/*.json` files the server generator reads, plus
one extra file `content/pinkacord-client.json` for browser-only fields
(sprite mapping, move animation hooks). Single canonical content means
admins editing in the Phase 3 panel automatically update both server and
client output.

```
content/pinkacord/pokedex.json    ──┐
content/pinkacord/moves.json        ├──→ tools/pinkacord/generator        ──→ data/mods/pinkacord/*.ts  (server)
content/pinkacord/abilities.json    │                                          config/custom-formats.ts
content/pinkacord/items.json        │
content/pinkacord/learnsets.json    │
                                    │
content/pinkacord-client.json    ───┴──→ tools/pinkacord-client/generator ──→ dist/pinkacord-overlay.js (client)
```


## What the overlay contains

For each custom Pokemon:

```js
window.BattlePokedex.pinkachu = {
  num: 10001,
  name: "Pinkachu",
  types: ["Electric", "Fairy"],
  baseStats: { hp: 70, atk: 60, def: 70, spa: 115, spd: 85, spe: 120 },
  abilities: { 0: "Static", 1: "Cute Charm", H: "Rose Aura" },
  heightm: 0.5, weightkg: 7,
  spriteid: "pikachu", // ← reuse Pikachu's sprite until we ship a real one
  color: "Pink",
  eggGroups: ["Fairy", "Field"],
  tier: "OU",
};
```

For each custom move:

```js
window.BattleMovedex.pinkbolt = {
  num: 9001,
  name: "Pink Bolt",
  type: "Electric",
  category: "Special",
  basePower: 90, accuracy: 100, pp: 15,
  shortDesc: "30% chance to paralyze the target.",
  desc: "...",
  target: "normal",
};
```

For each custom ability:

```js
window.BattleAbilities.roseaura = {
  name: "Rose Aura",
  shortDesc: "This Pokemon's Fairy-type moves have 1.33x power.",
  desc: "...",
};
```

Note: the client only needs the *displayable* fields — names, descriptions,
sprite hints, base stats for the teambuilder. The actual game mechanics live
in the server; the client never simulates battles.


## Deployment

Two supported options for v1:

### Option A — Co-host the client from the PS server (simplest)

Build the client to static files, drop them in `server/static/`, and the PS
server's built-in static file handler serves them at `http://your-server:8000/`.
Players connect by visiting that URL directly.

This is what we'll target for v1. The Phase 5 hosting decision will revisit
whether to split client and server later for scale.

### Option B — Separate web server

Fork hosts the client on its own domain (e.g. via Cloudflare Pages, Vercel,
or a static-only nginx). Users visit the client URL, then it connects to the
PS server via WebSocket. This is what production PS does.


## Sprite strategy

For each custom mon `spriteid` controls which sprite the client renders:

- **v1 (today):** map every custom mon to a similar existing PS sprite (Pinkachu → "pikachu"). Cheap, works immediately, looks weird if the mon is meant to be visually distinct.
- **v2:** community-drawn sprites or AI-generated. Drop into `client-overlay/sprites/` and the overlay points at them.
- **v3:** animated sprites with custom shiny variants. Significant per-mon investment.

The admin panel will surface a "sprite" field in the create-mon form (Phase 3).
For v1 it accepts a PS-base spriteid; later it'll accept uploads.


## Edge cases handled / deferred

| Edge case | Status |
|---|---|
| Overlay runs before BattlePokedex loads (race) | ✅ Overlay defers via `if (window.BattlePokedex)` and a setTimeout fallback |
| Custom mon shadows a real PS mon | ✅ Generator refuses to emit if the id collides with a known PS species |
| Client rebase changes the global table names | ⚠️ Documented — would require a generator update; unlikely |
| Sprite URL points to a missing file | ⚠️ Client falls back to a "missing sprite" placeholder; admin panel will warn |
| Custom move with no animation defined | ✅ Client uses generic animation; admin panel will surface a picker later |
| Client-side cache holds old data | ⚠️ Overlay version-stamps itself; user may need to hard-reload after big changes |


## What we explicitly defer to later phases

- **Real custom sprites** (Phase 2.5 once the community wants visual identity)
- **Custom move animations** (Phase 4 — they need to map to PS's animation primitives)
- **Damage calculator integration** (Phase 4)
- **Client building & serving infra** (Phase 5 with hosting decision)
- **Replay viewer updates** (Phase 5 — replay rendering uses same dex, should "just work")
