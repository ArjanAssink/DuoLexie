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
- [x] **Flitsen screen not yet visually checked** — verified fine, no change. Screenshotted
  both the intro card and an active round on iPad Pro 11 (`#/les/fase1-u1-l2`, a direct
  hash nav straight to a Flitsen lesson — `GameScreen` doesn't gate on lock/progress state,
  only `PathScreen`'s coin does). Measured real boxes: flash-card 420×300, grade buttons
  202×57 each (well past the 44-48px minimum), progress-track 304×16, timer-big 58×35 —
  all comfortably sized, nothing overlapping or squished, the vh-clamp from the earlier
  game-stage fix reads fine here too.
- [x] **Reward/completion screen not yet visually checked** — verified fine, no change.
  `.reward-screen` isn't URL-routable (it's local `useState` in `GameScreen`), so scripted
  a full Klankenjacht round on iPad Pro 11 (`#/les/fase1-u1-l1`) by hooking
  `HTMLMediaElement.prototype.play` to read the target sound's real filename straight off
  `el.src` — network-response sniffing doesn't work here since `audio.ts` caches and reuses
  `<audio>` elements per soundId, so a repeated sound never fires a new request. Frida image
  (180×195), heading, and the "Verder" button (129×57) all render correctly centered with
  no overlap. Confetti does spill past the card into the surrounding desktop background —
  that's `canvas-confetti`'s own full-viewport canvas, unrelated to `.app`'s bounds and
  unchanged by the earlier `overflow:hidden` fix, and it matches the stated Duolingo
  reference (their celebrations burst across the whole screen too). Didn't chase the
  "NIEUW RECORD!" banner variant specifically (Flitsen-only, needs a beaten speed record to
  trigger) — it's one extra centered text line on the same layout, low risk if the base
  layout is already fine.
- [x] **Landscape orientation** — verified fine, no change. Screenshotted PathScreen and
  Klankenjacht at `devices['iPad Pro 11 landscape']` (1194×834): the existing centered-card
  treatment (`.app { max-width: 480px }`, centered on the darker surround) already applies
  to any viewport ≥540px wide, landscape tablet included — it just letterboxes the same
  portrait-proportioned card on the sides, nothing squished or broken. **False alarm caught
  and disproved**: first pass, a default-resolution screenshot upscaled through ffmpeg's
  nearest-neighbor filter made the "Flits" path-node label visually read as "Elits" (looked
  like a real clipping bug against Frida's mascot image). `boundingBox()` on both elements
  showed no rect overlap, and a native crop at `deviceScaleFactor: 3` (no resampling)
  confirmed the label renders correctly as "Flits" — the missing "F" was a scaling artifact,
  not app behavior. Lesson: don't trust nearest-neighbor-upscaled crops for font legibility,
  re-render at higher deviceScaleFactor instead of scaling up a low-res crop.
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
