# Backend readiness — making progress syncable to the cloud

Goal: get the local state model into a shape where Phase 3 (accounts + cross-device sync to
Cosmos, see [plan.md](../plan.md)) is a straightforward addition rather than a rewrite.

**Status: nothing in this plan has been executed yet.** Every item below is `[ ]`. The
findings were verified against the tree at commit `46fecbc` (see "How each finding was
verified"), but no code has been changed.

## Scope — read this first to avoid duplicated work

This file covers **only** the state-model/architecture work needed before a backend exists,
plus a few small findings not tracked elsewhere.

It deliberately does **not** duplicate [code-review-backlog.md](code-review-backlog.md),
which is a separate, more current, and more thorough correctness review. Several bugs found
independently in both reviews are queued **there, not here** — the audio `play()`
never-resolving promise, the Flitsen `setState`-updater side effect, `navigate()` during
render, the Hardop-lezen per-klank timing inflation, and the timezone split in streak days.
**Do not fix those from this file.** If you're picking up work generally, work
`code-review-backlog.md` first — it contains reproduced, user-visible bugs, which outrank
this file's architectural prep.

Two items below (**A3** and **A4**) overlap partially with that file's "positional lesson
ids / no store migration" item. Coordinate: doing A3 satisfies the `version`/`migrate` half
of it, and that item's stable-id half should be done at the same time, since both are
migrations of the same persisted blob.

## The core finding

**State is aggregate-only, with no event log — and that blocks multi-device sync.**

`state/progress.ts:68` (`completeLesson`) folds answers directly into running totals
(`gems`, `xp`, `soundStats`, `records`). Nothing records *that a session happened*.

Tellingly, `SessionResult` — with an `id` field, and plan.md Phase 3 explicitly calling for
"outbox-sync (idempotent op sessionResult-id)" — **exists in `shared/src/types.ts:91` but is
never constructed anywhere** (verified: zero call sites across `app/src`, `api/src`,
`shared/src`). The design intent was there; the implementation folded straight to aggregates.

Why this blocks sync: **aggregates cannot be merged.** If the iPad has `gems: 120` and a
second device has `gems: 95`, there is no correct reconciliation — you can't tell which
events produced either number, so you must pick a loser and destroy real progress. The same
applies to `soundStats`: EWMA folded in place is order-dependent and unmergeable. With an
append-only session log, merging is trivial: union by `id`, recompute aggregates.

This gets more expensive the longer it waits, because every new game adds another writer to
the state. Two new games (Tijdrit, Bliksemsprint) landed *during* this review.

## Priority order

- [x] **A1 — Turn on `strict` in `app/tsconfig.app.json`.** Done. Re-verified against the
  current tree (considerably larger than at `46fecbc` — wordStats, Leitner boxes, date.ts,
  Bliksemsprint all landed since): `npx tsc -p tsconfig.app.json --noEmit --strict` was still
  clean before the flag was added. `strict: true` added; `tsc --noEmit`, `npm run build`, and
  `playwright test --project=desktop` (13/13) all pass unchanged.

- [x] **A2 — Emit a `SessionResult` per completed lesson; make aggregates derived.** Done.
  Re-verified the claim first: still zero constructors of `SessionResult` anywhere in
  `app/src`/`api/src`/`shared/src` before this change. `engine/recompute.ts` now holds
  `applySession` (fold one session into an `Aggregates` snapshot) and `recomputeFrom`
  (replay a whole log, sorted by `completedAt`) — one implementation, so the incremental
  path can't drift from the replay path the way the `+10` bonus already has elsewhere (A4).
  `completeLesson` builds a `SessionResult` and calls `applySession`; `sessions:
  SessionResult[]` persists alongside the existing aggregates (persist version 2, migrated
  from both v0 and v1). `SessionResult` gained `wordResults?` so replay can rebuild
  `wordStats` too — it didn't exist when this file was written. `applyAnswer` gained the same
  injectable-`now` parameter `applyWordResult` already had, since without it replay stamps
  `lastSeenAt` with replay time instead of the session's actual time. Three Vitest cases cover
  the equivalence guarantee (replay == incremental fold, order-independence, and concrete
  sums/max/count assertions) — 30/30 tests pass. Verified live against a production build
  (`vite preview`): completing a real lesson persists a well-formed `SessionResult` in
  IndexedDB alongside correctly-derived `gems`/`xp`/`completedLessons`.
  The pivotal change. In `state/progress.ts`, add an append-only `sessions: SessionResult[]`
  and have `completeLesson` push one (generate `id` with `crypto.randomUUID()`, set
  `completedAt` to an ISO timestamp). Keep `gems`/`xp`/`soundStats`/`records` as they are —
  they become a *derived cache* over the log rather than the source of truth.
  - Add a `recomputeFrom(sessions)` helper (pure, in `engine/`) that rebuilds every aggregate
    by replaying the log in `completedAt` order. Unit-test that replaying a log reproduces
    the same aggregates the incremental path produced — that equivalence is the whole
    guarantee that makes sync safe.
  - Don't wire any network calls yet. This step is purely local and independently useful:
    it's also what makes a parent dashboard ("which klanken is she struggling with over
    time?", plan.md Phase 4) possible at all, since that needs history, not totals.
  - Watch the size: ~10 answers/session, a few sessions/day. Even after a year that's a small
    JSON blob in IndexedDB. If it ever matters, compact sessions older than N months into a
    starting-balance snapshot — but don't pre-optimise this.

- [x] **A3 — Add `version` + `migrate` to both zustand `persist` configs.** Re-verified
  first: the original claim no longer held — both stores already carry `version`/`migrate`/
  `merge` (added independently by the wordStats and avatar-shop work that landed after this
  file was written). The scaffolding half was already done. The half that wasn't — the
  stable-lesson-id migration this item shares with `code-review-backlog.md` — is done now:
  `data/path.ts` derives unit ids from their sounds (`fase1-a-e-o-u-i`, stable under reorder/
  insertion) instead of array position, `LEGACY_UNIT_ID_MAP` records the former positional
  ids for exactly one migration, and `progress.ts`'s `migrate` (now cascading through v0→v3
  instead of one `if` per version, so an old-enough profile gets every fixup, not just the
  one matching its stored version) remaps `completedLessons`/`records` keys and
  `sessions[].lessonId` through it. Two e2e tests hardcoded old positional URLs
  (`fase1-u1-l2`, `fase1-u2-l5`) and needed updating to the new ids — a direct, mechanical
  consequence of this change, not a fix to their actual test logic. Verified live against a
  production build: planted a v2 profile with old-style ids in all three locations, reloaded,
  confirmed every one remapped correctly and gems/xp (not migration targets) were untouched.

- [x] **A4 — Move the reward rule into one place.** Done. Re-verified the duplication first
  (same shape post-A2, different lines): `GameScreen.tsx` computed `gems`/`xp` and separately
  re-added the `+10` record bonus for display, while `progress.ts`'s `completeLesson`
  independently added the same bonus to what got credited. `engine/reward.ts` now holds
  `computeReward(lesson, answers, prevRecord, score)` as the one formula; `completeLesson`'s
  signature changed to take `lesson` instead of precomputed `gems`/`xp` and now returns the
  full `Reward` (gems, xp, perfect, newRecord); `GameScreen` renders exactly what it gets back
  and computes nothing itself. Four Vitest cases pin the exact arithmetic (base reward,
  perfect bonus, eindbaas bonus stacking, and the record-bonus boundary — tied is not a new
  record). Verified live against a production build: displayed gems, credited gems, and the
  session's recorded `gemsEarned` all agreed (10/10/10) after a real completed lesson.

- [ ] **A5 — Give `api/` a path mapping to `shared/`.** `api/tsconfig.json` has no `paths`
  entry and `api/src` imports nothing from `shared/` (verified) — so `shared/` is currently
  app-only, and the `@shared` alias is a *Vite* alias, not a TypeScript one. The moment the
  API needs `AnswerRecord`/`SessionResult` (i.e. the first sync endpoint) it will need
  `"paths": { "@shared/*": ["../shared/*"] }` plus an `include` that reaches `../shared/src`.
  Cheap now, annoying to retrofit mid-feature.

- [ ] **A6 — Make game dispatch fail closed.** `screens/GameScreen.tsx:80-82` is a ternary
  chain that falls through to a default component. `GameType` in `shared/src/types.ts` already
  lists games that don't exist yet (`welke-klank`, `woordbouwer`), so adding one silently
  renders the *wrong game* instead of failing. Replace with
  `const GAMES: Record<GameType, ComponentType<GameProps>>` — TypeScript then makes an
  unimplemented game a compile error. ~6 lines, and the single best extensibility fix in the
  codebase given how fast games are being added.

## Only after A1–A5: the actual backend

Do not start this until the log exists (A2) and types are shared (A5). Sketch, not a spec:

- `POST /api/sessions` — accepts a batch of `SessionResult`, **idempotent on `id`** (upsert,
  ignore duplicates). This is why `id` must be client-generated: the client can retry
  forever without double-counting.
- `GET /api/progress` — returns the session log (or a snapshot + tail) for a profile; client
  recomputes aggregates locally via A2's `recomputeFrom`.
- Auth: parent email+password → JWT cookie, kid profiles + PIN, per plan.md Phase 3.
  `api/src/functions/health.ts` already proves Cosmos connectivity and that `JWT_SECRET`,
  `COSMOS_ENDPOINT`, `COSMOS_KEY` are wired — reuse that pattern for config access.
- Outbox: queue unsynced session ids locally, flush on reconnect, clear on 2xx. The app must
  stay fully functional offline — it's used on a tablet, and the whole point is a daily
  20-minute habit that can't depend on wifi.

**Azure resources:** Cosmos (`duolexie` db, `auth`/`data` containers) and the SWA env vars
already exist — see [azure-setup.md](azure-setup.md). If new resources are needed, **write
the how-to into that file rather than creating them**; Arjan provisions Azure himself.

## How each finding was verified

Against commit `46fecbc`, by reading the exact lines and running the compiler — not inferred:

- `strict` absent from `tsconfig.app.json`; `tsc --strict --noEmit` exits clean → A1 is free.
- `grep -rn "SessionResult" app/src api/src shared/src` → one hit, the type declaration
  itself. Never constructed.
- `grep -n "version\|migrate"` across both store files → no matches.
- `grep -c "paths" api/tsconfig.json` → 0; `grep -rn "@shared\|shared/" api/src` → no hits.
- `GameScreen.tsx:42/51` and `progress.ts:84` both read directly — the `+10` appears in both.

## Working conventions (same as the other backlogs)

- Verify with `npx tsc --noEmit -p app`, `npm run build` and `npx playwright test
  --project=desktop` (both from `app/`) before each commit.
- Reproduce against a **production** build (`npm run build` && `npx vite preview`), not just
  the dev server — StrictMode's double-invoked effects mask some ordering bugs in dev.
- Commit each item separately; update its checkbox and a one-line result note **in this file
  in the same commit**, then push. Live site redeploys via GitHub Actions a couple of minutes
  after a push to `main`.
- If investigation shows an item isn't a real problem, mark it `[x]` with "verified fine, no
  change" and say what you checked — don't leave it ambiguous.
- Commits are authored as `Arjan Assink <assink@gmail.com>`; check with
  `git log -1 --format='%an <%ae>'` after your first one.
