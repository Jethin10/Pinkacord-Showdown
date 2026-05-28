# Pinkacord — Edge Case Coverage

This document is the **honest inventory** of what the Phase 1.5 content
pipeline catches today, what we explicitly chose to defer, and what the
admin panel (Phase 3+) will need to cover that we cannot.

Every "✅ Caught" item below has a concrete schema rule, cross-reference
check, or smoke-test gate that fails the build with a clear error.

## Schema-level (Zod) — `npm run pinkacord:check` catches these

These are caught by static validation of the JSON before anything is written.

| # | Edge case                                                  | Status   | Where it fails                                  |
|---|------------------------------------------------------------|----------|-------------------------------------------------|
| 1 | Pokemon `types` includes a non-canonical type ("Lightning")| ✅ Caught | `SpeciesSchema.types` Zod enum                  |
| 2 | Pokemon `baseStats.spe` is negative or >255                | ✅ Caught | `StatBlockSchema`                                |
| 3 | Pokemon `num` < 10001 (would collide with PS base species) | ✅ Caught | `SpeciesSchema.num` min                         |
| 4 | Pokemon `id` contains uppercase / spaces / hyphens         | ✅ Caught | `IdSchema` regex                                |
| 5 | Pokemon `eggGroups` has 3 entries                          | ✅ Caught | `SpeciesSchema.eggGroups` `.max(2)`             |
| 6 | Pokemon `genderRatio.M + F` doesn't sum to 1               | ⚠️ Allowed | PS itself is lenient; warn in panel later     |
| 7 | Pokemon `color` is "Pinkish"                               | ✅ Caught | `COLORS` enum                                   |
| 8 | Pokemon missing `baseStats`                                | ✅ Caught | Zod required field                              |
| 9 | Move `category` is "Magical"                               | ✅ Caught | `MOVE_CATEGORIES` enum                          |
| 10 | Move `accuracy` is 105                                    | ✅ Caught | `MoveSchema.accuracy.max(100)`                  |
| 11 | Move `basePower` is 300                                   | ✅ Caught | `MoveSchema.basePower.max(255)`                 |
| 12 | Move `priority` is 10                                     | ✅ Caught | `MoveSchema.priority.max(7)`                    |
| 13 | Move `secondary.chance` is 200                            | ✅ Caught | `SecondaryEffectSchema.chance.max(100)`         |
| 14 | Move `secondary` exists but specifies no effect           | ✅ Caught | `SecondaryEffectSchema.refine`                  |
| 15 | Move `flags` includes a random unknown flag               | ✅ Caught | Zod strict object (we allow-list known flags)   |
| 16 | Move `num` < 9001                                         | ✅ Caught | `MoveSchema.num.min`                            |
| 17 | Ability declares `effects[0].kind` not in the registry    | ✅ Caught | `parseEffectParams` lookup                      |
| 18 | Ability effect params malformed (wrong type, missing key) | ✅ Caught | per-kind Zod schema                             |
| 19 | Effect multiplier > 3 (sanity ceiling)                    | ✅ Caught | `boostMovePowerByType.paramsSchema`             |
| 20 | Format `id` collides with PS base format id               | ⚠️ Soft  | PS will use whichever is loaded last — name uniquely |
| 21 | Format `mod` references a non-existent mod                | ✅ Caught | cross-ref + smoke test                          |
| 22 | Format `column` is 99                                     | ✅ Caught | `FormatSchema.column.max(3)`                    |
| 23 | Learnset `species` not in pokedex                         | ✅ Caught | cross-reference validator                       |
| 24 | Learnset `moves` has duplicates                           | ✅ Caught | cross-reference validator                       |
| 25 | Invalid JSON (missing comma, trailing comma in strict)    | ✅ Caught | `JSON.parse`                                    |

## Cross-reference — `npm run pinkacord:build` catches these (internal refs)

These are caught after schema validation, examining relationships between
entities within our content.

| # | Edge case                                                  | Status   |
|---|------------------------------------------------------------|----------|
| 26 | Two species share the same `id`                           | ✅ Caught |
| 27 | Two species share the same `num`                          | ✅ Caught |
| 28 | Two moves share the same `id`                             | ✅ Caught |
| 29 | Two moves share the same `num`                            | ✅ Caught |
| 30 | Two abilities share the same `id`                         | ✅ Caught |
| 31 | Two items share the same `id` or `num`                    | ✅ Caught |
| 32 | Two formats share the same `id`                           | ✅ Caught |

## Smoke test — catches PS-side cross-references

These would require loading PS's full dex to catch at the schema layer. We
chose to defer that to the smoke test (a real `validate-team` invocation),
which is the same code path PS uses on every real ladder battle.

| # | Edge case                                                  | Status   |
|---|------------------------------------------------------------|----------|
| 33 | Pokemon's `abilities.0` is a typo'd PS-base ability ("Statc") | ✅ Caught at smoke test |
| 34 | Learnset references a PS-base move that doesn't exist     | ✅ Caught at smoke test |
| 35 | Format `ruleset` includes an unknown ruleset name         | ✅ Caught at smoke test |
| 36 | Format `banlist` references a Pokemon that doesn't exist  | ✅ Caught at smoke test |
| 37 | Ruleset rule conflicts (e.g. Sleep Clause Mod twice)      | ✅ Caught at smoke test |

## Filesystem & concurrency

| # | Edge case                                                  | Status   |
|---|------------------------------------------------------------|----------|
| 38 | Build is interrupted mid-write (Ctrl-C, crash)            | ✅ Atomic temp-rename pattern; partial state never visible to PS |
| 39 | One target file write fails (disk full, permission)       | ✅ Tmp files cleaned up, in-place files untouched |
| 40 | Two concurrent `pinkacord:build` invocations              | ⚠️ Last writer wins; race is non-corrupting because of atomic rename. Phase 3 panel will serialize through a single writer. |
| 41 | Admin edits content/ while panel is reading it            | ⚠️ Phase 3 will lock at the panel layer; CLI users should avoid this |
| 42 | Build succeeds but PS server already running              | ✅ Server keeps old data until hotpatch issued; no corruption |
| 43 | `/hotpatch formats` fails because a battle holds refs     | ⚠️ Documented; operator may need full restart in rare cases |

## Security

| # | Edge case                                                  | Status   |
|---|------------------------------------------------------------|----------|
| 44 | Admin tries to add ability with arbitrary JS handler      | ✅ No "code" field exists in any schema; only `effects[]` of registered kinds |
| 45 | Admin tries to add new effect kind via content edit       | ✅ Effect registry is in `tools/pinkacord/effects.ts`, requires a developer code change + review |
| 46 | Admin tries to escape via JSON injection (e.g. closing `*/` in `desc`) | ✅ Generator uses `JSON.stringify` for all user-controlled strings — no template-string injection |
| 47 | Admin sets BST to 9999/9999/9999 (intentional grief)      | ✅ Caught by `StatBlockSchema.max(255)`         |
| 48 | Admin sets accuracy to 999                                | ✅ Caught by `MoveSchema.accuracy.max(100)`     |
| 49 | Admin renames "pinkachu" → "pinkachu " (trailing space)   | ✅ Caught by `IdSchema` regex                    |
| 50 | Admin uploads a 100MB JSON file                           | ⚠️ Phase 3 panel will impose request-size limits at the HTTP layer |

## Performance / scalability (forecast — not yet measured at scale)

| # | Concern                                                   | Plan                                            |
|---|-----------------------------------------------------------|-------------------------------------------------|
| 51 | 10,000 custom mons — dex load time                        | PS already loads gen9ssb-scale mods in <100ms; benchmark before Phase 5 |
| 52 | 1,000 custom formats — lobby UI rendering                 | UI cliff well before engine; we will paginate formats in the client fork (Phase 2) |
| 53 | Generator cold-build time                                 | Currently <200ms for 1 mon; linear in entity count; not a concern <10k |
| 54 | `node build force` time after content change              | ~3s on this machine for full PS rebuild; can be optimized by selective build targets in Phase 5 |

## Deferred — explicit Phase 2/3/4 work

These are out of scope for Phase 1.5 because they belong to layers we
haven't built yet. We mark them so we don't lose them.

| # | Edge case                                                  | Will be handled in            |
|---|------------------------------------------------------------|-------------------------------|
| 55 | Custom Pokemon sprite missing                              | Phase 2 (client fork) — fallback sprite + admin upload UI |
| 56 | Admin lacks permission to edit                             | Phase 3 (admin panel) — RBAC  |
| 57 | Two admins editing the same mon simultaneously             | Phase 3 — optimistic locking via JSON version field |
| 58 | Audit log of "who changed what when"                       | Phase 3 — git commits authored by admin id |
| 59 | Rollback to previous content state                         | Phase 3 — `git revert` button |
| 60 | Random Battles team generation for custom mons             | Phase 4 — random-teams.ts per mod |
| 61 | Custom move animations on the client                       | Phase 2 — client move-anim map |
| 62 | Damage calculator support for custom mons                  | Phase 4 — fork smogon/damage-calc dex |
| 63 | Replay storage when self-hosting                           | Phase 5 — minimal replay service |
| 64 | Backup & restore of content (in case of disaster)          | Phase 5 — content is git-tracked; back up the repo |
| 65 | Multilanguage (i18n) for custom content                    | Phase 6+ — out of scope for v1 |
| 66 | Custom typechart (new types beyond the 18)                 | Phase 6+ — invasive engine work |
| 67 | Tournament bracket UI customizations                       | Inherited from PS; revisit if community needs more |

## Open questions for the user

These need a decision before the corresponding phase can land cleanly:

- **Sprites:** AI-generated, community-drawn, or "good enough" placeholders for v1?
- **Login server:** lean on PS Main accounts (default) for v1, or stand up our own?
- **Free hosting candidate:** Fly.io is the most websocket-friendly free tier; should we target it specifically?
- **Discord-side automation:** is there an existing bot in the community, or do we plan a new one?
