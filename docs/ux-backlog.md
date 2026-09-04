# UX polish backlog

Working list for the app-feel polish pass (not new features — see [todo.md](../todo.md)
for those). Verified on an iPad Pro 11 viewport via Playwright screenshots, since that's
one of her real devices. Ordered by priority; pull from the top.

Mark `[ ]` → `[x]` when shipped, with a one-line note on what changed. If a screenshot
shows the item isn't actually a problem, mark `[x]` with "verified fine, no change" —
don't leave it ambiguous for the next pass.

## Priority order

- [x] **Game-stage elements were phone-sized on tablet** — speaker button, answer tiles,
  flashcard, and prompt heading used fixed/vw-only sizing, leaving Klankenjacht/Flitsen
  looking sparse on a tall iPad viewport. Clamped to vh too. (commit 4ebfbc3)
- [ ] **Outer app-shell stretches to full viewport height on tablet** — `.app` uses
  `min-height: calc(100vh - 48px)`, so on a tall iPad the "card" itself is much taller
  than its content, which is what causes the leftover empty margin even after the
  game-stage fix above. Likely fix: cap `.app`'s height on the desktop/tablet media
  query and center it vertically, similar to how width is already capped at 480px.
  **Risk**: PathScreen can have long scrollable content (many units) — capping height
  means switching from "the whole page scrolls" to "an inner scroll container," which
  needs checking against the sticky statbar/bottomnav and the Frida-tap absolute
  positioning (already fragile — two prior bugs there this session). Needs a real
  screenshot pass on PathScreen at various scroll depths before/after, not just GameScreen.
- [ ] **Bottom nav reachability** — `.bottomnav` (Leerpad/Aa/Beloningen/Profiel) renders
  at the end of normal document flow, not fixed/sticky. On a long path (many units) it's
  only reachable by scrolling all the way down. Check whether that's intentional (nav
  rarely used mid-session) or should be sticky like `.statbar` already is.
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
