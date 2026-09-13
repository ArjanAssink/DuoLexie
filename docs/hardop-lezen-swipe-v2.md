# Hardop lezen: vertical swipe, and teaching the swipe by tapping

Implementation spec for the second pass on Hardop lezen's sorting interaction. The first pass
(docs/hardop-lezen-rework.md, shipped) sorts the card with a **horizontal** swipe onto two
side-by-side piles. Play-testing showed that axis is wrong, and that nothing on screen tells
her *how* to sort. This document says exactly what replaces it.

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement.

**Status:** **built.** Deviations from this spec found while building are marked *(as built)* in the sections they belong to.

---

## 1. What changes and why

| | Today | After |
|---|---|---|
| Sort axis | left = Nog even, right = Goed | **down = Nog even, up = Goed** |
| Piles | two identical trays side by side under the card | **Goed! pocket at the top, beside Frida; Nog even tray at the bottom** |
| Reveal / replay button | separate button under the card | **on the card** (frees the vertical room the tray needs on an iPhone) |
| How she learns the gesture | a horizontal nudge, once | **three layers** (§4): the card demonstrates itself, chevrons point, and **tapping a pile performs the swipe visibly** |
| Commit rule | drag ≥ 90px | drag ≥ 80px **or** a flick, locked to the vertical axis |
| Keyboard | ← / → | **↑ / ↓** |

Why vertical: left and right carry no meaning for a nine-year-old; the card is wide so a
horizontal drag has little travel; on an iPhone it competes with edge gestures; and up is the
easier, more satisfying flick, so it gets the positive meaning. A good word goes *up* to
Frida. A word that needs another go is put *down* into the tray — "not yet", never "wrong".

Why tapping teaches: tapping a pile is what she will do first, because it is obvious. It must
keep working, and it must never feel like the lesser option. So a tap sorts the card exactly
as a swipe would, but the card visibly *performs the swipe* on her behalf. She sees the
gesture every time she taps, until she has swiped a few herself.

---

## 2. Layout

Everything stays inside the existing `.game-screen.hardop-screen` / `.game-header` /
`.game-stage.hardop-stage` structure. The header (✕ + `.round-pips`) is unchanged.

```
  ✕        ● ● ● ○ ○ ○ ○ ○ ○ ○           header, unchanged

   🐶 "Was het goed?"    ┌──────────┐    .top-row: coach (Frida head + bubble) on the
                         │ ▭▭▭   3  │    left, the Goed! pocket on the right
                         └──────────┘
                            Goed!
                  ︿  ︿                   chevrons drifting up (judging, until learned)
            ┌─────────────────┐  🔊      .word-card, with the audio control as a badge
            │                 │          in its top-right corner
            │       kat       │
            │                 │
            │ ▓▓▓▓▓▓▓▓░░░░░░░ │          fuse (reading) / listen strip (listening)
            └─────────────────┘
                  ﹀  ﹀                   chevrons drifting down
            ┌─────────────────┐
            │  Nog even   ▭ 1 │          .tray: the oefenbakje, full card width
            └─────────────────┘
```

- **`.top-row`** — flex row, `justify-content: space-between`, `align-items: flex-end`. Left:
  the existing `.coach` (Frida head + `.coach-bubble`). Right: the Goed! pocket, which is the
  existing `.pile.pile-goed` button moved here. Frida is *beside* the pocket, not on it; on a
  goed landing she celebrates (`head-celebrating`, already implemented) and the pocket does
  its landing squash. That is the "Frida catches it" moment.
- **`.swipe-arena` / `.word-card`** — unchanged size and position. The stamps become
  vertical: `GOED!` centred *above* the card text, `NOG EVEN` centred *below* it, both inside
  the card (so they move with it), faded in by drag progress exactly as the side stamps are
  today. *(As built: the stamps sit hard against the card's top and bottom edges rather than
  tucked in beside the word, and they are a size smaller. The card is only ~195px tall on an
  iPhone with the word filling the middle of it — a position that clears both the word and
  the audio badge does not exist. Covering the word she is judging is the worse of the two
  collisions, so the badge, which paints above them, clips a corner of `GOED!` when the two
  meet.)*
- **`.tray`** — the existing `.pile.pile-nog-even` button, moved below the arena, widened to
  the card's width (`width: min(80vw, 340px)`), lower than it is tall (suggested height 64px +
  label). It keeps its mini-card stack and count badge.
- **Remove** `.pile-row`. The two piles are no longer siblings in a row.
- **The audio control moves onto the card.** Remove the separate `.reveal-btn` under the
  card. In its place a badge in the card's top-right corner, **class `reveal-btn` retained**
  so the e2e selectors stay stable:
  - `reading`: a 44×44 round teal badge showing 🔊, `aria-label="Laat horen"`. The whole card
    also still reveals on tap (existing `onCardClick`).
  - `listening`: the same badge, disabled, dimmed.
  - `judging` / `flying`: the badge widens into a pill with visible text **"🔊 Nog eens"**
    (min-height 44px). It replays the word (existing `replay()`).
  - The badge **must stop pointer events from starting a drag**: `onPointerDown={(e) =>
    e.stopPropagation()}` on the badge, since it sits inside the draggable card. *(As built:
    it calls `resumeAudio()` first. The screen-level `onPointerDown={resumeAudio}` is what
    unlocks WebAudio on iOS, and stopping propagation here would otherwise mean the one
    control whose whole job is to make a sound never unlocks the audio to make it with.)*
- **iPhone 13 (390×664) must fit without scrolling.** Suggested vertical budget: header 76,
  top row 100, arena 195, tray 84, three gaps of 12–16. Verify with a real screenshot, not
  arithmetic (see §8).

Bliksemsprint's band finder already matches `.swipe-arena` explicitly
(`components/Bliksemsprint.tsx`); confirm it still measures the arena after the row above it
changes, and that the band never covers the pocket or the card.

*(As built: it does not still measure the arena, because measuring the arena is what would
cover the pocket — the band would run from the header all the way down to the card, with the
whole `.top-row` inside it, and the "3 op een rij!" badge landing on the coach bubble. The
selector list gained `.top-row`, which wins on this screen by document order, so the band and
its badge now sit in the empty gap above that row. The band's 72px floor can still reach a
few px into the row on a short phone, so `.top-row` also paints above the overlay
(`z-index: 31` against `.bs`'s 30) — a paint order only; `.bs` is `pointer-events: none`.
Measured on both devices: iPhone 13 band 80–152 against a pocket at 137–220 and an arena at
267; iPad Pro 11 band 267–361, pocket 377–466, arena 528.)*

---

## 3. The gesture

Replace the horizontal drag in `games/HardopLezen.tsx` (`dragX`, `startX`, `SWIPE_THRESHOLD`,
`rotate = dragX / 18`, the `'left' | 'right'` direction type) with a vertical one.

### 3.1 Pure decision function — new file `app/src/games/swipe.ts`

Keep the decision out of the component so it is unit-tested without a DOM:

```ts
export type SwipeVerdict = 'goed' | 'nogEven' | null

export interface SwipeSample { t: number; x: number; y: number }

export const SWIPE_DISTANCE_PX = 80      // a deliberate drag this far commits
export const FLICK_VELOCITY = 0.6        // px/ms over the last ~80ms commits even if short
export const FLICK_MIN_PX = 24           // ...but never from a tremble
export const AXIS_LOCK_RATIO = 1.0       // |dx| > |dy| → sideways → no verdict

/** What a completed gesture means. Up (negative dy) is goed, down is nogEven. */
export function resolveSwipe(samples: SwipeSample[]): SwipeVerdict
```

Rules, in order:
1. Fewer than 2 samples → `null`.
2. `dx`, `dy` = last sample minus first. If `|dx| > |dy| * AXIS_LOCK_RATIO` → `null` (a
   mostly-sideways drag springs back; a sloppy diagonal never lands on the wrong pile).
3. Velocity = `dy` over the samples in the last 80ms (or the last two samples if fewer),
   in px/ms.
4. Commit if `|dy| ≥ SWIPE_DISTANCE_PX`, **or** `|velocity| ≥ FLICK_VELOCITY && |dy| ≥
   FLICK_MIN_PX`. Otherwise `null`.
5. Direction: `dy < 0` → `'goed'`, else `'nogEven'`.

Unit tests (`app/src/games/swipe.test.ts`, vitest, node environment like the other engine
tests): a slow 100px drag up → goed; a slow 100px drag down → nogEven; a 30px flick up at
1 px/ms → goed; a 30px slow drag → null; a 200px drag that is 250px sideways → null; a
single sample → null.

### 3.2 In the component

- State: `dragY` (replaces `dragX`); keep a `samples` ref (`SwipeSample[]`, push on every
  pointermove, reset on pointerdown; cap at ~20). *(As built: the cap evicts the **second**
  sample, not the first. `resolveSwipe` measures total distance from sample zero, so dropping
  the origin would make a long, slow, deliberate drag read as a short one and spring back.
  The tail, which is all the flick velocity needs, is what the cap is really bounding.)*
- `onPointerUp`: `const verdict = resolveSwipe(samples.current)`; if non-null →
  `commit(verdict, 'swipe')`; else spring back (`setDragY(0)`).
- Keep **everything** that exists for pointer robustness: `activePointerId`,
  `setPointerCapture`, the `onPointerCancel` reset, the `busy` guard, the `phaseRef` guard.
  `tests/e2e/pointer-isolation.spec.ts` exercises these and must keep passing (it needs its
  coordinates turned vertical, see §7).
- Visual during drag (replaces rotation):
  - `transform: translateY(${dragY}px) scale(${scale})` where `scale = 1 + clamp(-dragY /
    600, 0, 0.06)` going up (it grows as it rises), `1 - clamp(dragY / 1200, 0, 0.05)` going
    down, and `opacity` eases toward 0.85 going down. Rising = lighter and bigger, dropping =
    smaller and dimmer.
  - Stamp opacity: `GOED!` = `clamp(-dragY / SWIPE_DISTANCE_PX, 0, 1)`, `NOG EVEN` =
    `clamp(dragY / SWIPE_DISTANCE_PX, 0, 1)`.
  - Targeted pile: pocket gets `.targeted` when `dragY < -TARGET_THRESHOLD`, tray when
    `dragY > TARGET_THRESHOLD` (existing class and 1.08 scale).
- `commit(verdict: PileKey, via: 'swipe' | 'tap' | 'key')` — the direction type becomes the
  pile key; `via` decides whether the demo runs (§4.3) and whether the self-swipe counter
  increments (§4.4).
- Flight: `measureFlight` already computes `dx`/`dy` to the real pile rect and is
  direction-agnostic — keep it. The `cardFly` keyframes take `--fly-from-y` (the `dragY` at
  release) instead of `--fly-from-x`; set `--fly-from-x: 0`. Rotation `--fly-rot` shrinks to
  ±4°. Drop the 26px mid-flight arc dip for the *downward* flight (a card dropping into a
  tray should not bounce upward first): suggested — two keyframe sets, `cardFlyUp` (small arc)
  and `cardFlyDown` (ease-in, no arc), chosen by class.
- Keyboard: `ArrowUp` → `commit('goed', 'key')`, `ArrowDown` → `commit('nogEven', 'key')`.
  Remove ← / →. Space/Enter still reveal.
- `haptic`, `playEffect('ding' | 'fart')`, confetti puff from the pocket, streak →
  Bliksemsprint, `feedback` bubble text: all unchanged.

---

## 4. How she learns the gesture

Three layers. All three switch off on the same counter (§4.4). All three have a
reduced-motion variant (§6).

### 4.1 The card demonstrates itself

Replaces the horizontal `nudge`/`cardNudge`. On entering `judging`, if not yet learned, start
a timer (`HINT_AFTER_MS`, currently 2500 — suggested 1200 now that the hint is the primary
teaching moment). When it fires, add class `.ghosting` to the card and mount a
**`.touch-dot`** over the card's centre: a 44px translucent white disc with a 2px ring, the
universal "a finger is here" indicator, no art needed. CSS animation `cardGhostSwipe`, ~2s:

| time | card | touch-dot |
|---|---|---|
| 0–200ms | — | fades in, scales 0.8 → 1 (press) |
| 200–800ms | translateY 0 → −40px | moves with the card |
| 800–1000ms | back to 0 | fades out |
| 1000–1400ms | translateY 0 → +24px | fades in, moves with it |
| 1400–1700ms | back to 0 | fades out |

Cancel immediately on `pointerdown` (remove the class, unmount the dot) so it never fights
her finger. Do not repeat within the same card.

### 4.2 The chevrons point

While in `judging` and not yet learned, and not dragging: `.chevrons.chevrons-up` between
the card and the pocket (two or three `︿` glyphs or small SVG chevrons, `--teal`, staggered
`translateY` drift upward, ~1.4s loop) and `.chevrons.chevrons-down` between the card and
the tray (`--orange`, drifting down). They are the piles' labels turned into directions.
Hide them while dragging (`dragging`), during `flying`, and once learned.

### 4.3 Tapping a pile performs the swipe — for both directions

When `commit(pile, 'tap')` runs and the gesture is not yet learned, the card does not simply
fly; it **demonstrates the swipe first**, then flies. Both piles, symmetrically:

1. Mount the `.touch-dot` at the card's centre; it presses (200ms).
2. The dot and the card move together toward the pile — `translateY(−120px)` for the pocket,
   `+120px` for the tray — over 600ms, the matching stamp fading in and the pile taking
   `.targeted`, exactly as a real drag would look.
3. The dot lifts (fades, 150ms). The card continues into the normal `cardFly*` flight
   (420ms) to the pile. Landing, count bump, ding/buzz, confetti, Frida: all as for a swipe.

So a taught tap is ~1.4s from tap to landing against ~0.42s for a swipe. The coach bubble
during the demo reads **"Zo! Veeg omhoog."** (pocket) or **"Zo! Veeg omlaag."** (tray),
then the usual landing text. Once learned, a tap is the quick flight again — tapping is never
punished, it just stops teaching.

Implementation note: drive the demo with **CSS animations plus a single `await
wait(DEMO_MS)`** in `runCommit` before the existing `await wait(FLY_MS)`, not a chain of JS
timers. `tests/e2e/quit-mid-animation.spec.ts` freezes the page's timers with
`page.clock.pauseAt` right before tapping the last pile and then asserts the card's opacity
reached 0 — CSS animations keep running under the fake clock, JS timers do not. `DEMO_MS`
must be added to that spec's `HARDOP_COMMIT_MAX_MS` sum (§7).

*(As built, and this is the load-bearing detail: the demonstration and the flight are **one
CSS animation list** on the card — `demoSwipeUp 950ms, cardFlyUp 420ms 950ms forwards` — set
up in a single render the moment the tap commits. Sequencing them from JS (wait, then apply
the flight class) would have put a JS timer between the two halves, and the card's opacity
would never have reached 0 under the frozen clock. The `await wait(DEMO_MS)` is still there,
but all it times is *state*: when Frida stops teaching and starts reacting, and when the card
lands on the pile. Verified in both directions: with `cancelled.current = true` stripped from
the game the quit test fails on sessions 0→1, and passes with it restored.)*

### 4.4 When she has learned it

Persist a count of **swipes she made herself**, not cards sorted: taps and keys must not
count, or the teaching switches off before she has ever swiped.

- `state/progress.ts`: `settings.selfSwipes: number` (default 0) and an action
  `noteSelfSwipe()` that increments it. The store's `merge` already spreads
  `current.settings` under the persisted settings, so an existing profile gets the default
  without a migration or a version bump — verify that by reading `merge`, don't assume it.
- `const SWIPES_TO_LEARN = 5` in the component. `learned = selfSwipes >= SWIPES_TO_LEARN`,
  read once at mount via `useProgress.getState()` like the existing `showHint`, *and* updated
  live within the round (so the fifth swipe of her first round already switches the hints
  off for the sixth card).
- `commit(pile, 'swipe')` calls `noteSelfSwipe()`. `'tap'` and `'key'` do not.
- Remove the old `HINT_UNTIL_SORTED` / `showHint` (which counted all cards ever sorted, taps
  included) — this replaces it.

---

## 5. Sounds, haptics, reward — unchanged

Nothing in `audio/audio.ts`, `engine/reward.ts`, `screens/RewardScreen.tsx` or the gem
formula changes. The reward screen's summary ("7 goed · 3 nog even", chips) is unaffected by
which direction the cards flew.

---

## 6. Reduced motion

Under `prefers-reduced-motion: reduce` (the existing `@media` block in `theme.css` for this
game): no ghost swipe (§4.1), no drifting chevrons (show them static), no touch-dot travel in
the taught tap (the card fades into the pile as today, `cardFade`), no grow/shrink during
drag. Sounds unaffected.

*(As built: the taught tap is skipped outright rather than having its motion stripped — the
component reads `prefers-reduced-motion` once at mount and a tap simply takes the quick path,
which is the end state this section describes and avoids holding the screen for 950ms of
deliberately invisible demonstration. Same for the ghost swipe, which is never scheduled. The
grow/shrink during a drag is an inline style, so it too is a JS branch rather than a CSS
override. Measured under emulated reduced motion: chevrons present with `animation-name:
none`, no `.touch-dot` ever mounted, tap to landing 892ms.)*

---

## 7. Tests

Run everything from `app/`. Unit: `npm test`. E2E: `npx playwright test --project=desktop`
(the ipad/iphone projects are WebKit and only run on CI — see §8).

**New**
- `src/games/swipe.test.ts` — the cases in §3.1.
- `tests/e2e/hardop-lezen.spec.ts`, add:
  - *a tap on either pile shows the swipe before the card lands*: fresh profile
    (`selfSwipes` 0), tap `.pile-goed` → `.touch-dot` becomes visible, card's translateY goes
    negative before the flight; then on the next card tap `.pile-nog-even` → dot visible,
    translateY positive. Card lands on the right pile both times.
  - *five real swipes switch the teaching off*: swipe five cards (mouse drag up/down, past
    80px), then tap a pile → no `.touch-dot` appears and the landing takes < 1s; also no
    `.chevrons` on that sixth card.

**Update** (all currently drag horizontally or assert on X):
- `hardop-lezen.spec.ts`: "swiping the card sorts it" → drag **up** 200px, assert
  `.swipe-stamp-goed` (rename from `-right`) fades in at 60px, lands on `.pile-goed`; "a short
  drag springs back" → 40px up; "arrow keys" → `ArrowDown` lands on `.pile-nog-even`.
  *(As built: the short drag has to be **slow** as well as short, and the test now pauses
  80ms between its four 10px steps. `page.mouse.move()` fires its steps back to back, so 40px
  in a couple of milliseconds is a flick by any measure and `resolveSwipe` commits it —
  rightly, that is what FLICK_MIN_PX is for. The hesitation is the thing the test is about,
  so the test now performs one. A "a sideways drag never lands on a pile" case was added
  alongside it to cover the axis lock end to end.)*
- `reading-window.spec.ts` "dragging during reading cannot grade" → drag up.
- `pointer-isolation.spec.ts`: thumb/finger offsets become vertical (`y ± 15`, `y − 200`);
  `translateX()` helper → `translateY()` reading `m.m42`; tolerance stays < 5px (the idle
  float is now the same axis as the drag, so read it at rest — after a cancel, wait ~900ms as
  the test already does).
- `quit-mid-animation.spec.ts`: `HARDOP_COMMIT_MAX_MS` gains `DEMO_MS` (the tap-taught path
  is exactly what this test's final `.pile-nog-even` click takes, since the test profile has
  never swiped). Re-verify in **both directions** as that file's comments describe: strip
  `cancelled.current = true` from the game, the test must fail (sessions 0→1); restore it,
  the test must pass. That check has caught a toothless version of this test once already.
- Every spec: `.pile-row` no longer exists; `.reveal-btn` does (on the card).

**Selectors that must keep existing**, because the specs and the Bliksemsprint band finder
use them: `.hardop-screen[data-phase]`, `.word-card`, `.word-text`, `.swipe-arena`,
`.reveal-btn`, `.pile-goed`, `.pile-nog-even`, `.pile-count`, `.pip`, `.pip-done`,
`.reward-screen`, `.reward-tally`, `.word-chip`.

---

## 8. Verification, and what this sandbox cannot do

Do all of these before pushing, in this order, and say in the commit which you ran:

1. `npm run build` (tsc -b + vite), `npm run lint`, `npm test`.
2. Desktop e2e. In the Claude sandbox the pinned Playwright cannot find its browser; use a
   throwaway config that sets `launchOptions.executablePath: '/opt/pw-browsers/chromium'`
   on every project (see the git history of this repo's sessions for the exact file), and
   **delete it before committing**. Expect exactly one failure that is not yours:
   `path-to-lesson.spec.ts` asserts a clean console and this sandbox blocks
   fonts.googleapis.com; it fails identically on untouched `main`.
   *(As built: neither applied this time. The pinned Playwright resolved its own Chromium at
   the standard `~/.cache/ms-playwright` path, so no throwaway launch config was needed, and
   `path-to-lesson.spec.ts` passed — fonts.googleapis.com was reachable. A baseline run on
   untouched `main` before any of this work was **30/30 green**, so every failure seen during
   this change was genuinely mine.)*
3. **Screenshots on iPhone 13 and iPad Pro 11** (Playwright `devices`, Chromium is fine for
   layout) of `/#/les/proef-hardop-lezen` in `reading`, `judging` with chevrons, mid-drag
   up, mid-drag down, the taught tap mid-demo, and the landing. Measure with
   `getBoundingClientRect()`: no horizontal overflow, every tap target ≥ 44px, tray bottom
   above the viewport bottom, pocket/Frida not overlapping the pips.
4. Both directions of the quit test (§7).
5. WebKit **cannot run here**. CI runs the ipad/iphone projects on every PR to `main`, with
   `retries: 2` because those runners occasionally lose the page mid-round (see
   `playwright.config.ts` and the backlog entry about ten `<audio>` elements per round). A
   failure that survives all three attempts is real. Watch the run; do not merge red.

---

## 9. Docs to update in the same change

- `docs/hardop-lezen-rework.md`: §2 (phase 3 and 4 descriptions), §5 (layout) and the
  status line at the top now describe the horizontal version. Replace those passages with a
  short note that the sorting interaction is specified in this document, rather than
  rewriting them in full.
- `todo.md`: one line under the Hardop lezen entry, Dutch, in the same style as the others.

---

## 10. Out of scope

Not in this change, however tempting while in the file: the first reading node's word mix
(§10 of the rework doc), the `<audio>`-element caching question (backlog), the word
recordings, the gem formula, anything in Tijdrit or Flitsen. If one of those blocks the work,
say so in the commit rather than fixing it in passing.
