# Pinkacord — Architecture

This is a layered fork of [smogon/pokemon-showdown][ps]. Upstream PS is preserved
as `data/`, `sim/`, `server/`, `config/` etc. **Our customization sits in three
new layers on top of PS** so that:

1. Admins can never inject arbitrary code — they edit structured data, we generate
   the code.
2. Pulling new versions of PS rebases cleanly (we don't touch their files).
3. The whole pipeline is testable end-to-end before anything touches a live server.

  [ps]: https://github.com/smogon/pokemon-showdown


## The three new layers

```
        ┌──────────────────────────────────────────────────────────────┐
        │  L3 — Admin Panel (Phase 3+)                                 │
        │  Web UI that reads/writes content/ via the same Zod schemas. │
        │  Calls L2 generator + L1 PS hotpatch commands.               │
        └────────────────────────┬─────────────────────────────────────┘
                                 │ writes
                                 ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  L2 — Content layer (this commit, "Phase 1.5")               │
        │                                                              │
        │  content/pinkacord/   ◀── canonical JSON (single source of   │
        │    meta.json              truth, git-tracked, audit-friendly)│
        │    pokedex.json                                              │
        │    moves.json                                                │
        │    abilities.json                                            │
        │    items.json                                                │
        │    learnsets.json                                            │
        │  content/formats.json                                        │
        │                                                              │
        │  tools/pinkacord/     ◀── generator + validator              │
        │    schemas.ts             (Zod, runs at build time only)     │
        │    effects.ts                                                │
        │    generator.ts                                              │
        │    cli.ts                                                    │
        └────────────────────────┬─────────────────────────────────────┘
                                 │ generates (atomic write)
                                 ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  L1 — Pokémon Showdown (upstream, unmodified core)           │
        │                                                              │
        │  data/mods/pinkacord/*.ts      ◀── generated, do not edit    │
        │  config/custom-formats.ts      ◀── generated, do not edit    │
        │                                                              │
        │  sim/, server/, etc.           ◀── upstream, do not edit     │
        └──────────────────────────────────────────────────────────────┘
```

The arrow is **one-way**: content → generator → PS data files. PS reads from
its own files like any vanilla PS install. This is what keeps upstream merges
clean.


## Why JSON, not TypeScript

PS's native data format is `.ts`. We could let admins edit `.ts` directly. We
don't, for three reasons:

1. **Security.** A `.ts` file can execute arbitrary JavaScript at server boot.
   An admin "adding a Pokemon" could in theory drop a backdoor. A JSON file
   can only express data — no `eval`, no imports, no side effects.

2. **Validation.** Zod can validate JSON in one pass and produce
   field-level error messages an admin panel can render next to form fields.
   Validating arbitrary TS requires running the TS compiler.

3. **Schema evolution.** When we want to rename a field or split a structure,
   we own the JSON schema and migrate it. The TS PS expects can change
   independently — only the generator has to update.


## Validation pipeline

Every `npm run pinkacord:build` runs five gates. **Any gate failing aborts the
build with a non-zero exit and a clear field-level error.** No partial state is
ever written to `data/mods/` or `config/`.

| # | Gate                       | What it catches                                                                 |
|---|----------------------------|---------------------------------------------------------------------------------|
| 1 | Zod schema validation      | Missing required fields, wrong types, out-of-range numbers, unknown enum values |
| 2 | Cross-reference validation | Learnset references a move that doesn't exist; ability used by a mon isn't defined; format references a missing mod |
| 3 | Effect-kind resolution     | A custom ability/move declares an effect kind not in our registry, or with wrong params |
| 4 | Atomic write               | All generated files written to a temp dir, then renamed into place in one swap |
| 5 | Smoke test                 | After PS rebuild, validate a canonical team in each Pinkacord format. If a format breaks, this gate fails |


## Effect kinds — how custom abilities/moves stay safe

Custom abilities/moves often need real game-mechanics logic ("boost Fairy
moves 1.33x", "30% chance to paralyze on contact"). Letting admins write
arbitrary handler code is unsafe.

Instead, `tools/pinkacord/effects.ts` declares a **registry of effect kinds**.
Each kind has:

- An ID (`boostMovePowerByType`, `statusOnContact`, etc.)
- A Zod schema for its parameters
- A code-emitter that produces the exact PS handler snippet

Admins (and the Phase 3 panel) compose abilities/moves by picking effect kinds
and filling in parameters. The generator concatenates the emitted snippets into
the final `.ts` file. There is **no way for an admin to inject arbitrary
JavaScript** — they can only choose from primitives we approve.

Adding a new effect kind is a developer task (a code change in `effects.ts`)
and goes through the normal review process.


## Hot reload

After every successful build the operator (or the Phase 3 panel) issues these
commands to a running PS server, which reloads in <1 second:

| Command                       | What it reloads                                  |
|-------------------------------|--------------------------------------------------|
| `/hotpatch formats`           | New / changed formats; banlists; rulesets        |
| `/hotpatch battles`           | Battle engine, mod data (mons / moves / abilities) |
| `/hotpatch teamvalidator`     | Legality checking subprocess                     |
| `/hotpatch chat`              | Chat commands and plugins (rarely needed for us) |

If a hotpatch fails (e.g. an in-progress battle holds references), we fall
back to instructing a full restart. The build is already atomic so this is
recoverable.


## Audit & rollback

`content/` is just files. Treat it as code:

- Every admin-panel-driven change becomes a commit on a `content-admin` branch
  with the admin's name as the commit author. The Phase 3 panel will set this
  up automatically via `git commit --author`.
- Rollback = `git revert <sha>` + `npm run pinkacord:build` + hotpatch.
- Every build emits a JSONL line to `logs/pinkacord/builds.log` with timestamp,
  triggering user, content git sha, and smoke-test result.


## Scalability notes

PS already handles thousands of concurrent battles via its
networking-subprocess + battle-subprocess model. Our content layer **doesn't
add runtime cost** — once generated, PS reads our mod as any other mod, with
the same dex-loading performance characteristics.

Practical limits (measured / inferred):

| Item                          | Soft limit  | Why                                           |
|-------------------------------|-------------|-----------------------------------------------|
| Custom Pokemon                | ~thousands  | Dex loads in <100ms even at gen9ssb's scale   |
| Custom moves                  | ~thousands  | Same — dex map lookup is O(1)                  |
| Custom abilities              | ~thousands  | Same                                          |
| Concurrent battles            | 1000s       | Inherits from PS; scales with CPU cores       |
| Custom formats                | dozens      | Each format adds a row to the lobby UI        |

If we ever blow past these, the bottleneck will be the lobby UI rendering
hundreds of formats, not the engine.


## What "production-grade" excludes from Phase 1.5

To keep this milestone scoped, we are explicitly deferring:

- **Multi-tenant content** (different communities sharing one server) — Phase 6+
- **Real-time admin panel** — Phase 3
- **Client-side custom sprites** — Phase 2
- **Production deployment infra** (Docker, CI, monitoring) — Phase 5
- **Replay storage** beyond what PS gives us out of the box — TBD with hosting decision
- **Custom random-battles team generation** — Phase 4+

These don't block Phase 2 or 3; they layer on top of the content pipeline
we've built here.
