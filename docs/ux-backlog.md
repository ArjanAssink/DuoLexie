# UX polish backlog

Working list for the app-feel polish pass (not new features — see [todo.md](../todo.md)
for those). Verified on an iPad Pro 11 viewport via Playwright screenshots, since that's
one of her real devices. Ordered by priority; pull from the top.

## Resuming this in a new session

1. Read this whole file first — the priority order and the notes at the bottom (screenshot
   method, verification commands, commit-per-item convention).
2. Read `git log --oneline -10` for recent context; the last few commits are this same
   polish pass and show the pattern to follow (one focused CSS change, verified, own commit).
3. Pick the first unchecked `[ ]` item and work it: reproduce/screenshot the issue first,
   don't assume — a couple of "problems" I assumed going in turned out fine once actually
   screenshotted (see PathScreen note on the height-cap item).
4. After each item: `npx tsc --noEmit -p app`, `npm run build` (from `app/`), and
   `npx playwright test tests/e2e/path-to-lesson.spec.ts --project=desktop` (from `app/`)
   before committing. Then commit that one item, update its checkbox + note in this file
   in the same commit, and push — the live site redeploys automatically via GitHub Actions
   (Azure Static Web Apps) a couple minutes after a push to `main`.
5. Keep going down the list. Add newly-noticed issues to the bottom of the priority list
   rather than fixing them inline, unless they're trivial — keeps the list an honest queue.
6. `git identity`: commits should be authored as `Arjan Assink <assink@gmail.com>` (this
   repo's convention), not a work email — check `git log -1 --format='%an <%ae>'` after
   your first commit to confirm the local git config resolved correctly.

Mark `[ ]` → `[x]` when shipped, with a one-line note on what changed. If a screenshot
shows the item isn't actually a problem, mark `[x]` with "verified fine, no change" —
don't leave it ambiguous for the next pass.

**Standing aesthetic reference: Duolingo.** That's the explicit target feel — chunky
3D-pressed buttons, a bounded/centered play area (not edge-to-edge on wide viewports),
mascot-driven celebration, generous but purposeful whitespace, playful but legible type.
When in doubt about a polish decision, ask "what would Duolingo do here" before inventing
something new.

## Priority order

- [x] **Game-stage elements were phone-sized on tablet** — speaker button, answer tiles,
  flashcard, and prompt heading used fixed/vw-only sizing, leaving Klankenjacht/Flitsen
  looking sparse on a tall iPad viewport. Clamped to vh too. (commit 4ebfbc3)
- [x] **Outer app-shell stretched to full viewport height on tablet** — `.app` used
  `min-height: calc(100vh - 48px)`, so on a tall iPad the "card" was much taller than its
  content even after the game-stage fix above. Capped `.app`'s min-height at
  `min(calc(100vh - 48px), 820px)` and vertically+horizontally centered it on `body`
  (flex). **Gotcha hit and fixed**: `.game-screen` and `.reward-screen` each had their
  *own* independent `min-height: 100vh`, which silently overrode the `.app` cap since a
  child forcing itself taller makes the flex-column parent grow to match — removed both,
  `flex: 1` alone is enough since they're direct children of `.app`'s flex column.
  Second gotcha: `body`'s `min-height: 100%` (chained from `html, body`) didn't reliably
  resolve to a full viewport height once `body` became `display: flex` — replaced with an
  explicit `min-height: 100vh` on body inside the same media query. Verified via
  `getBoundingClientRect()` inspection + screenshots on both PathScreen (unaffected, its
  content still exceeds the cap) and Klankenjacht (now a properly centered, compact,
  phone-proportioned card — closer to how Duolingo's own desktop/tablet layout reads).
- [x] **Bottom nav reachability** — screenshotted a long path on iPad Pro 11 mid-scroll:
  turned out **both** `.bottomnav` and `.statbar` were broken, not just the nav (the
  backlog's assumption that `.statbar` "already is" sticky was wrong — verified it
  scrolled fully off-screen too, `boundingBox().y` went from `24` to `-3440`). Root cause:
  `.app`'s desktop/tablet rule (`@media (min-width: 540px)`) had `overflow: hidden` to
  clip content to the rounded card corners — but an ancestor with `overflow != visible`
  breaks `position: sticky` on descendants even when that ancestor never actually clips
  anything itself (here `.app` has no `max-height`, so it just grows with content; the
  `overflow: hidden` was doing nothing but breaking sticky). Fix: removed `overflow:
  hidden` from `.app`, gave `.statbar`/`.bottomnav` their own matching
  `border-top-*-radius`/`border-bottom-*-radius: 28px` in that same media query so the
  rounded-card look is preserved without needing the parent clip. Verified both now stay
  pinned mid-scroll (`statbar.y` stays `0`, `bottomnav.y` stays `viewport height - 72`)
  and corners look clean at both scroll extremes; phone-width breakpoint untouched, no
  regression there. (commit pending)
- [ ] **Flitsen screen not yet visually checked** — only Klankenjacht was screenshotted
  so far. Confirm the flashcard sizing fix actually looks right in context (grade
  buttons, timer, progress bar layout).
- [ ] **Reward/completion screen not yet visually checked** — `.reward-screen` in
  GameScreen.tsx, shown after finishing a lesson. Confirm Frida image, confetti,
  record banner, and stat lines look right on tablet.
- [ ] **Landscape orientation** — the whole app appears tuned for portrait only. Tablets
  (her iPad) get used in landscape often. Check whether the app is unusable, just
  awkward, or fine in landscape, and whether it's worth constraining vs. adapting.
- [ ] **Tap target sizing for a 9-year-old** — spot-check that coins, tiles, and buttons
  meet a comfortable minimum touch-target size (roughly 44-48px+) at actual device scale,
  not just desktop viewport math.

## Notes for whoever (or whichever future loop iteration) picks this up

- Screenshot method: `playwright-core` directly via a throwaway script (see git history
  around commit 4ebfbc3 for the pattern), `devices['iPad Pro 11']` from `playwright`.
  Don't leave `playwright.temp.config.ts` committed — it's a scratch file, delete after use.
- Always verify with `tsc --noEmit`, `npm run build`, and the existing e2e suite
  (`npx playwright test tests/e2e/path-to-lesson.spec.ts --project=desktop`) before
  committing a CSS change — low cost, catches real regressions.
- Commit each backlog item separately rather than batching, so history stays readable
  and each change is easy to revert in isolation if it looks wrong on her actual device.
