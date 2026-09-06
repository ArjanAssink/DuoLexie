# Code review backlog

Working list from an adversarial review of the app code (correctness, data integrity, and
robustness — not app-feel, see [ux-backlog.md](ux-backlog.md) for that, and
[todo.md](../todo.md) for new features). Findings were verified against the running app
(dev *and* production build) rather than by reading alone. Ordered by priority; pull from
the top.

## Resuming this in a new session

1. Read this whole file first — the priority order, the "already checked" section (so you
   don't re-investigate settled questions), and the notes at the bottom.
2. Read `git log --oneline -10` for recent context.
3. Pick the first unchecked `[ ]` item and work it. **Reproduce the bug first** — most of
   these items include a concrete repro; run it and watch it fail before you change
   anything, so you know your fix actually fixed it.
4. After each item: `npx tsc --noEmit -p app`, `npm run build` (from `app/`), and
   `npx playwright test --project=desktop` (from `app/`) before committing. Then commit
   that one item, update its checkbox + note in this file in the same commit, and push —
   the live site redeploys automatically via GitHub Actions (Azure Static Web Apps) a
   couple of minutes after a push to `main`.
5. Keep going down the list. Add newly-noticed issues to the bottom rather than fixing them
   inline, unless they're trivial — keeps the list an honest queue.
6. `git identity`: commits should be authored as `Arjan Assink <assink@gmail.com>` (this
   repo's convention), not a work email — check `git log -1 --format='%an <%ae>'` after your
   first commit to confirm the local git config resolved correctly.

Mark `[ ]` → `[x]` when shipped, with a one-line note on what changed. If investigation
shows an item isn't actually a problem, mark `[x]` with "verified fine, no change" and say
what you checked — don't leave it ambiguous for the next pass.

**Standing rule: prove it, don't assume it.** Every item below was either reproduced in a
browser or confirmed by reading the exact lines. Three plausible-sounding bugs were
*disproved* during this review (see "Already checked"). Hold the same bar: a `boundingBox()`
reading, a screenshot, or a measured before/after — not a plausible-sounding argument.
Playwright + `devices['iPad Pro 11']` against `npx vite preview` is the fastest way to check
real behaviour; note that a few of these bugs only appear in a **production** build, since
StrictMode's double-invocation of effects can mask them in dev.

## Priority order

- [ ] **Quitting mid-animation still completes the lesson** — `games/KlankKaarten.tsx:96`
  schedules the card flight with `setTimeout(..., FLY_MS)` and never cancels it on unmount.
  Tap ✕ during the last card's 420ms flight and the orphaned callback still fires
  `onComplete` → `completeLesson` persists gems/XP and marks the lesson done.
  **Reproduced** on the production build (iPad Pro 11): flip all cards, tap ✕ 60ms into the
  last flight → gems went **0 → 10** and **1 lesson was marked done on the path**, with no
  reward screen ever shown. `games/HardopLezen.tsx:86-101` has the same defect and is worse:
  it awaits 320ms (often >1.5s when wrong, because it replays the word) and then calls
  `onComplete` unconditionally, so quitting also fires `confetti()` and the fanfare
  (`screens/GameScreen.tsx:53-54`) on top of the path screen. Fix: a `cancelled`/`mounted`
  ref checked after every await and in a cleanup, in both games — and consider an
  idempotence guard in `GameScreen.handleComplete` itself, since today every "fire once"
  guarantee lives in the game components.

- [ ] **A rejected `play()` leaves a promise that never resolves — do this before generating
  word audio** — `audio/audio.ts:91-94` (and identically `49-52`):
  ```js
  await clip.play().catch(() => speakWord(text))
  return new Promise((resolve) => { clip.onended = () => resolve() })
  ```
  If `play()` rejects (iOS autoplay policy, or `AbortError` from an interrupting load), the
  fallback speaks but the returned promise still waits on `onended`, which can never fire
  because the clip never played. `HardopLezen.commit()` has no `try/finally`, so
  `busy.current` stays `true` forever: the card stays at `opacity: 0`, no further input is
  accepted, and ✕ is the only escape. **Currently masked** — `public/audio/words/` is empty,
  so `clip` is always `null` and the TTS path resolves fine. It activates the moment word
  mp3s exist, i.e. the first time `tools/generate-word-audio.mjs` is run for real. Fix:
  resolve on `ended` *or* `error`/rejection, add a timeout, and wrap `commit`'s body in
  `try/finally` so `busy.current` always clears. Related: `clip.onended =` is an assignment,
  so two overlapping plays of the same cached element orphan the first promise, and
  restarting via `currentTime = 0` doesn't fire `ended` for the interrupted play.

- [ ] **A second finger auto-grades a word** — `games/HardopLezen.tsx:52-70` tracks no
  `pointerId`: `onPointerDown` unconditionally overwrites `startX.current`, and
  `onPointerMove`/`onPointerUp` share one `dragging` flag across all pointers. Thumb resting
  on the card at x=300 (`dragging=true`, `startX=300`), index finger taps at x=100 →
  `startX` becomes 100 → any thumb movement yields `dragX ≈ 210` → releasing either finger
  passes the 90px threshold and commits "Goed!" for a word she never swiped. Very reachable
  for a 9-year-old resting a hand on a tablet. Fix: capture `e.pointerId` on down and ignore
  move/up from other ids. Same item: `onPointerCancel={onPointerUp}` (line 140) means a
  browser-cancelled gesture past the threshold also records a grade — cancel should reset
  `dragX` to 0 instead.

- [ ] **Half the path feeds nothing to the adaptive engine** — `games/KlankKaarten.tsx:103`
  calls `onComplete({ answers: [] })`, so the `l1` ("Luister") and `l3` ("Mix") nodes — half
  the lesson nodes in every unit — contribute zero to `soundStats`. The EWMA / mastery /
  confusion-matrix engine that plan.md calls the core adaptivity feature now only ever sees
  data from Flitsen and Hardop lezen. It also makes the "Perfect!" bonus unreachable on
  those lessons, since `handleComplete` requires `result.answers.length > 0`. This may be a
  deliberate consequence of "pure exposure, no grading" — but decide it explicitly: either
  record exposure-only records (correct: true, or a separate `seen` counter) so mastery can
  progress, or accept that mastery advances only on the other two game types and adjust the
  crown criteria accordingly.

- [ ] **Hardop lezen inflates every timing sample** — `games/HardopLezen.tsx:77-79` pushes
  one `AnswerRecord` per klank, all carrying the same whole-word `ms`. A 4-klank word writes
  four ~6000ms samples, so `ewmaResponseMs` reflects word-reading time attributed to each
  individual klank. The speed-based "Goud" gate in `masteryOf` (`< 2000ms`) becomes
  effectively unreachable and `reviewWeight`'s slowness term saturates. Fix: divide by klank
  count, record a single word-level record, or exclude Hardop lezen from the speed metric.

- [ ] **Side effect inside a `setState` updater** — `games/Flitsen.tsx:41-49` calls
  `clearInterval` and `finish()` (→ `onComplete` → `GameScreen.setReward`) from inside the
  `setSecondsLeft` updater. Updater functions must be pure; StrictMode double-invokes them,
  and updating a parent's state from inside one triggers React's "Cannot update a component
  while rendering a different component" warning. Only `done.current` (line 56) prevents
  double gems. Note `HardopLezen.tsx:96-98` carries a comment documenting avoidance of this
  exact pattern — Flitsen never got the same treatment. Fix: move completion into an effect
  on `secondsLeft === 0`.

- [ ] **`navigate()` during render** — `screens/GameScreen.tsx:33-37` calls `navigate('/')`
  in the render body when a lesson id doesn't resolve. Replace with
  `<Navigate to="/" replace />`.

- [ ] **Progress is keyed on positional lesson ids, with no store migration** —
  `data/path.ts` generates ids as `fase1-u${i+1}-l${n}`, so inserting or reordering a unit in
  `FASE_DEFS` silently remaps later ids onto the previous unit's saved `completedLessons`
  and `records`. There's also no `version`/`migrate` on either zustand store, and zustand's
  default merge is **shallow** — adding a key to a nested object (e.g. `settings.volume`)
  reads back `undefined` at runtime for existing users while TypeScript insists it exists.
  Worth fixing before Phase 3 syncs progress to Cosmos and the corruption becomes durable
  and cross-device. Fix: stable content-derived ids (or an explicit id map) plus
  `version` + `migrate`.

- [ ] **Streak days are computed in two different timezones** — `state/progress.ts:13-15`
  builds `today()` from `toISOString()` (UTC) while `daysThisWeek` constructs Monday in
  local time. In CEST a session at 01:00 Monday is stored as Sunday and drops out of the
  week entirely; a Monday-evening and Tuesday-01:00 session both store "Monday" and count
  once. Fix: use local-date formatting consistently on both sides.

- [ ] **The 45 klank recordings are no longer played by anything** — `playSound` in
  `audio/audio.ts:45` has **zero callers** (only its own definition and a comment). Its
  consumer, Klankenjacht, was removed, and KlankKaarten deliberately dropped narration. So
  the recorded mp3s ship in the bundle but nothing plays them, and the "hear the klank →
  recognise it" direction — which plan.md §1 says RID trains in *both* directions — is
  currently absent from the app. Decide: reintroduce a listening drill that uses them, or
  drop `playSound` + the `TTS_TEXT` map as dead code and stop shipping the clips.

- [ ] **`generate-word-audio.mjs` can silently clobber real recordings** — the script writes
  straight into `app/public/audio/words/{id}.mp3` with no check for an existing file. The
  whole premise of the audio design is family-recorded voices; a TTS batch run overwrites
  them without warning. Add a skip-if-exists default plus an explicit `--force`. Same item,
  smaller fixes: `${text}` is interpolated unescaped into the Azure SSML (breaks on `&`/`<`);
  a typo'd id in `--words` matches nothing and still reports "Done: 0 word clips generated"
  as success (validate requested ids against the database and fail loudly); the `.raw` temp
  file leaks when ffmpeg throws (wrap in `try/finally`); and 49 sequential unthrottled
  requests to the unofficial Google Translate endpoint risk a rate-limit block — add a small
  delay between calls.

- [ ] **The word database is thin now that it's live content** — `shared/curriculum/words.json`
  holds 49 words, seeded as a starter set before Hardop lezen existed. Sound pools are
  cumulative, so later "Lezen" nodes draw from very nearly the same handful every time.
  Expand it (and consider splitting per the `words/{soundId}.json` layout plan.md §6
  describes). Same item: add a test pinning the invariant that every entry's `klanken` are
  valid ids from `sounds.json` and concatenate back to `text` — both hold today (verified),
  but nothing enforces them, and one typo would silently create a bogus `soundStats` entry
  via Hardop lezen's per-klank records.

- [ ] **No test covers the newest, most interaction-heavy code** — the e2e suite is 7 tests
  and green, but nothing exercises Hardop lezen (swipe gestures, grading) or the
  completion/reward flow, which is exactly where the confirmed bugs above live. There are no
  unit tests at all. At minimum: a test that quitting mid-animation does *not* award gems
  (it would have caught the top item), and one for the swipe threshold/grading path.

- [ ] **Small robustness items** — (a) the rounded-corner fix in `theme.css` assumes
  `.statbar` and `.bottomnav` are the first/last children of `.app`; any future child that
  paints its own background at the top or bottom will show square corners outside the card's
  radius (fine today — game screens are transparent). (b) `.statbar .avatar-btn` computes to
  56×44 — exactly at the tap-target floor with no margin, added after the tap-target pass;
  give it the same explicit `min-height` treatment as its neighbours.

## Already checked — don't re-investigate

Three plausible-sounding problems were investigated during this review and **disproved**.
Recorded so a later pass doesn't spend the time again:

- **KlankKaarten's fly-animation measurement is *not* broken in production.** The theory was
  that `useLayoutEffect([])` runs while `deck` is still `[]` (component returns `null`, refs
  null, `measure()` bails), and that it only appeared to work because StrictMode
  double-invokes effects in dev. Tested against an actual `vite build` + `vite preview`:
  `--kk-fly-left`/`--kk-fly-top` are set correctly and `--fly-dx` (244px) matches the true
  deck→discard distance in both dev and prod. Not a bug.
- **Lezen lessons can't end up with an empty deck.** `MIN_WORDS_FOR_LEZEN = 4` in
  `data/path.ts:78` means the `l5` node is only created when the pool yields enough words,
  so the "unfinishable blank screen" scenario can't occur.
- **The e2e suite is not stale after the Klankenjacht → KlankKaarten swap.** It was properly
  updated (`path-to-lesson.spec.ts` now asserts "the first lesson is Klankkaarten and
  flipping the deck lands a card") and the obsolete recorded-clip test was removed. All 7
  pass.

Also verified as correct, for what it's worth: `buildExercises` cannot infinite-loop and
can't produce duplicate tiles; Flitsen's klanken-per-minuut math is right (60s round, so
correct-count *is* the per-minute rate); persisted state contains no JSON-unsafe values and
all store updates are immutable.

## Notes

- Reproduce against a **production build** (`npm run build` then `npx vite preview`), not
  just the dev server — StrictMode's double-invoked effects can hide real ordering bugs in
  dev and, occasionally, mask them the other way round.
- `devices['iPad Pro 11']` in Playwright uses WebKit, which won't launch on this machine
  (missing system libs, needs sudo). Chromium with the same device descriptor's viewport
  works fine for layout/behaviour checks — just remember it isn't Safari, so iOS-specific
  media and autoplay-policy behaviour still needs a real device check.
- Let entrance animations finish (~800ms) before trusting a `getBoundingClientRect()`
  reading; `.coin-item`'s `coinPop` scales from 0.4 and will report a too-small box mid-flight.
- Commit each item separately, so history stays readable and each change is easy to revert
  in isolation.
