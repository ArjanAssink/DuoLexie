# Flitsen: swiping a card to the other stack

Implementation spec for adding a **drag** to Flitsen (`app/src/games/Flitsen.tsx`). Today the
only way to move a card is to tap the deck: the top card flips over and flies to the discard
pile on its own. After this change she can also **pick the card up and carry it across**: it
sticks to her finger the whole way, turns over as it travels, and drops onto the discard pile
when she lets go near it — or slides back onto the deck when she does not.

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement.

**Status:** **built.** Plan written and built by Claude Fable 5.1 in one session
([012C52p53S3dATWRG7puuGvK](https://claude.ai/code/session_012C52p53S3dATWRG7puuGvK)).
Deviations found while building are marked *(as built)* in the sections they belong to; the
two that matter are in §3.1 (a latent measuring bug on `main` that this change had to fix)
and §3.3 (the tap is handled in `pointerup`, not `click`).

---

## 1. What changes and why

| | Today | After |
|---|---|---|
| Moving a card | tap the deck; the card flies by itself (420ms keyframe flight) | **tap still works, unchanged**, *or* drag the card across: it follows the finger 1:1 and lands when released past halfway |
| The flip | happens mid-flight, at 55% of the keyframes | during a drag, the card **turns over in proportion to how far it has travelled** — face-down on the deck, edge-on halfway, face-up over the discard pile |
| Letting go early | n/a | the card **slides back** onto the deck, face-down, nothing counted |
| A flick | n/a | a short fast flick towards the discard pile commits, like a real card toss |
| Hint text | "Tik op de stapel!" | "Tik of veeg de kaart!" |
| Keyboard | Enter/Space on the deck button flips | unchanged |

Why: Flitsen is pure exposure, no grading, and its whole feel is the physical satisfaction of
turning cards over. A tap that triggers a canned animation is fine, but a card that is *in
her hand* — that she can carry slowly, hold edge-on, peek at, drop back — is the thing that
makes a deck of cards fun. The other two card games (Hardop lezen, Weetjes) already drag; the
one game that is literally *about* cards should too.

Why the tap stays exactly as it is: it is the fast route (a twenty-card round in ten
seconds), it is what the e2e suite drives, and it is what she does first. Nothing about the
tap's timing, animation or completion logic changes.

Why the drag reveals the card progressively rather than only at the drop: the reveal is the
payoff of the game, and putting it under her control (slowly turning a card to see what it
is) is the point of the whole change. It also means the drop needs no separate flip
animation — the card is already face-up when it arrives.

---

## 2. Layout

Nothing moves. `.kk-arena` keeps its two `.kk-stack-wrap`s (deck left, discard right) and the
`flights` layer between them. The only additions are:

- the deck's `.kk-stack` becomes the **drag surface** (pointer handlers, `touch-action: none`,
  `cursor: grab`; `grabbing` while a card is held). It is the stack *div*, not the
  `.kk-face-back` button, that takes the handlers and the pointer capture — see §3.3 for why.
- one more kind of card in the flights layer: the **held card** (`.kk-fly.kk-held`), the same
  size and position as a `.kk-fly`, driven by inline transforms instead of keyframes.

No change to the header, timer, progress bar, labels, ghosts or the discard stack.

---

## 3. The gesture

### 3.1 Decision — generalise `games/swipe.ts`

`resolveSwipe` already holds the right rules (distance *or* flick, axis lock, velocity over the
tail of the gesture) but is hard-wired to the vertical axis and the `goed`/`nogEven` verdict.
Extract the axis-independent core and keep `resolveSwipe` as a wrapper, so Hardop lezen and
Weetjes see no change:

```ts
export type DragAxis = 'x' | 'y'

/**
 * The sign of a completed drag along `axis`: +1 towards the positive end, -1 towards the
 * negative end, 0 for anything short, slow or mostly on the other axis.
 * `distancePx` is the drag length that commits at any speed (default SWIPE_DISTANCE_PX).
 */
export function resolveDrag(samples: SwipeSample[], axis: DragAxis, distancePx = SWIPE_DISTANCE_PX): -1 | 0 | 1

export function resolveSwipe(samples: SwipeSample[]): SwipeVerdict {
  const r = resolveDrag(samples, 'y')
  return r < 0 ? 'goed' : r > 0 ? 'nogEven' : null
}
```

Rules are those of the existing function, with "dy" read as "the chosen axis" and "dx" as the
other one. `FLICK_VELOCITY`, `FLICK_MIN_PX`, `AXIS_LOCK_RATIO` and the 80ms window are shared.
The existing tests in `swipe.test.ts` **must pass unchanged**.

Flitsen calls it with the horizontal axis and a **distance of half the deck-to-discard gap**:

```ts
const sign = resolveDrag(samples, 'x', Math.abs(stackDx) / 2)
if (sign === Math.sign(stackDx)) land() else returnToDeck()
```

`stackDx` is the already-measured `dx` state (discard left minus deck left; positive in the
current layout, but the code must not assume that).

*(As built: "already-measured" turned out to be false. The measuring `useLayoutEffect` had
`[]` deps, but the component returns `null` until the deck is built, so at mount there was no
arena to measure, the `ResizeObserver` was never attached, and `dx` stayed 0 for the whole
round — the tap flight has been flipping in place at its static position between the two
stacks since the port, and nobody noticed because the card still appeared on the discard
pile when the timer fired. The carry divides by that gap, so it could not work at all until
this was fixed: the effect now re-runs when the arena appears. The tap flight now actually
flies to the discard pile, which is a visible change on `main`'s behaviour, not just a
prerequisite.)* Half the gap: on an iPhone 13 the stacks
are ~150px apart so ~75px commits; on a desktop ~244px so ~122px. The card's *centre* being
past the midpoint between the stacks is the natural "it's on the other pile now" rule, and it
scales with the layout instead of being a magic number. A flick towards the discard pile of
at least `FLICK_MIN_PX` commits regardless (a card toss), and a drag that is more vertical
than horizontal springs back (axis lock, as in Hardop lezen).

### 3.2 State in the component

The `flights` array becomes a list of **airborne cards**, each with a `mode`:

```ts
type AirMode = 'flying' | 'held' | 'landing' | 'returning'
interface AirCard { id: number; sound: string; mode: AirMode; x: number; y: number }
```

- `flying` — the existing tap flight, rendered exactly as today (`kkFly` keyframes, `--fly-dx`).
- `held` — under her finger. `x`/`y` are the pointer offset from where it was picked up.
  Rendered with inline `transform: translate(x, y)` on the outer `.kk-fly`, no transition,
  and `rotateY(progress × 180deg)` on the inner, where
  `progress = clamp(x / stackDx, 0, 1)` — so it is face-down until she moves towards the
  discard pile, edge-on at the midpoint, face-up once it is over the other stack. Suggested:
  a slight tilt `rotate(clamp(x / 40, -6, 6)deg)` on the outer so it reads as carried, not
  slid, and `scale(1.04)` for the lift.
- `landing` — released past the threshold. Outer `transform: translate(stackDx, 0)`, inner
  `rotateY(180deg)`, both with a `LAND_MS` transition (suggested 260ms,
  `cubic-bezier(0.34, 1.1, 0.64, 1)` — the flight's curve). A transition rather than a
  keyframe because it has to start *from wherever her finger left it*, and a transition does
  that for free.
- `returning` — released short. Outer `translate(0, 0)`, inner `rotateY(0)`, `RETURN_MS`
  transition (suggested 320ms, `cubic-bezier(.2,1.4,.4,1)` — Hardop lezen's spring-back).

At most one card is `held` at a time; `landing`/`returning` cards can overlap with each other
and with `flying` ones, the same way overlapping taps already do.

Refs, mirroring Hardop lezen exactly: `activePointerId`, `samples` (capped at 20, evicting
the *second* sample — the origin has to survive, see the note in `HardopLezen.onPointerMove`),
`startX`/`startY`, and a `lifted` flag for §3.3.

The deck's count while a card is held: `remaining - 1` on the `.kk-count`, the `Stapel (n)`
label and the ghost count. The card is off the deck, so the deck has one fewer; it comes back
on a `returning`. `idx` itself advances only on a **landing** commit, never on the lift.

### 3.3 Tap vs drag, and why the handlers sit on the stack

The tap must keep working through the button's existing `onClick`, so that keyboard
activation (Enter/Space) and the e2e suite's `click()` are untouched. The rule:

- `pointerdown` on the deck: record the start, the pointer id, capture the pointer **on
  `.kk-stack`** (`e.currentTarget`), start the sample buffer. Nothing visible yet.
- `pointermove`: once the pointer has moved more than `LIFT_SLOP_PX` (suggested 8) from the
  start, **lift**: push the `held` card (sound = `deck[idx]`), `haptic(4)` (suggested), start
  the timer if not started. Before that, ignore — it is still a tap.
- `pointerup`, not lifted: do nothing; the button's `onClick` fires right after and flips as
  today.
- `pointerup`, lifted: `resolveDrag` → `landing` or `returning`; and set a `swallowClick` ref
  so the click that follows the pointerup does *not* also flip a card. The button's `onClick`
  checks and clears the ref. (Reset it on every `pointerdown` too, so a stale flag can never
  eat a genuine tap.)
- `pointercancel`: a `held` card returns; nothing commits. A second pointer while one is
  active is ignored, as in Hardop lezen.

*(As built: the two `pointerup` rules above are wrong, and the first run of the e2e suite
said so — every tap stopped working. Once the pointer is captured on the stack, the browser
retargets the `pointerup` to the stack, and the `click` that follows goes to the common
ancestor of the pointerdown and pointerup targets, which is the stack too: the button's
`onClick` never fires. So a tap is flipped **in `onPointerUp` itself** when nothing lifted,
and the button's `onClick` only acts on a click with `detail === 0`, which is what Enter or
Space on the focused button produces — keyboard activation keeps working, and a pointer
click, wherever the browser delivers it, can never flip a second card. There is no
`swallowClick` ref.)*

Why the stack and not the button: when the **last** card is lifted, the deck shows zero and
the `.kk-face-back` button is replaced by the `✓ Leeg!` placeholder. If the button held the
pointer capture, unmounting it would end the gesture halfway across the arena. The stack div
stays mounted through the whole round, so it owns the gesture and the button underneath can
come and go.

### 3.4 Landing and completion

Reuse the existing completion path. Factor the body of the `flip()` timeout into a
`settle(id, sound, isLast)` helper (remove from `flights`, set `discardTop`, `inFlight--`,
`onComplete` when it was the last card and nothing else is in the air). The tap flight
schedules it after `FLY_MS` as today; a landing schedules it after `LAND_MS`, with the same
bookkeeping on commit (`setIdx(i => i + 1)`, `inFlight++`, `haptic(10)`, push the timer on
`flightTimers` so `quit()` cancels it).

A `returning` card is removed from `flights` after `RETURN_MS` by a timer that is also on
`flightTimers`. Nothing else happens.

The `isLast` for a landing is `idx + 1 >= deck.length` read at **release**, not at lift.

### 3.5 Text

- `<h2>` at the start: **"Tik of veeg de kaart!"** (was "Tik op de stapel!"). The two later
  states ("3 van 20 omgedraaid", "Alle 20 kaarten omgedraaid!") are unchanged.
- `.kk-tap-hint`: **"👆 Tik, of veeg naar de andere stapel"** (was "👆 Tik op de stapel").
- `aria-label` on the deck button stays "Draai een kaart om" — the button *is* the tap.

No teaching layers (ghost swipe, chevrons, taught tap) as Hardop lezen has: there the swipe
carries a *verdict* she has to learn to give; here it is a second way to do the same thing,
and the tap is not a lesser option to be steered away from. Revisit if play-testing shows she
never finds it (§10).

---

## 4. CSS

In the `flitsen` block of `theme.css`:

- `.kk-stack.kk-deck { touch-action: none; cursor: grab; }` and `.kk-deck.holding { cursor: grabbing; }`.
  *(As built: also `.kk-deck .kk-face-back { touch-action: none; }`. The generic button rule
  sets `touch-action: manipulation`, and `touch-action` is read from the element the finger
  actually lands on — the button — not from the stack that owns the gesture. `manipulation`
  leaves panning to the browser, which on iOS is a `pointercancel` a few px into every
  carry.)*
- `.kk-held .kk-fly-inner { animation: none; }` — the inner is driven by the inline
  `rotateY`, and must not also run `kkFly`. Same for `.kk-landing` and `.kk-returning`, which
  carry `transition: transform <ms> <curve>` on both the outer and the inner.
- Keep `.kk-fly-inner .kk-face { box-shadow: none }` for the held card too — the iOS
  rasterisation note above it applies to any 3D-rotating face, and a card under a finger is
  rotating on every frame.
- `.kk-held { z-index: 6; }` — above a `landing`/`flying` card, so the card in her hand is
  never painted under one that is on its way.

Reduced motion (`@media (prefers-reduced-motion: reduce)`, existing block): the **held card
still follows the finger** — that is direct manipulation, not decoration, and Hardop lezen
keeps its drag too. `landing` and `returning` get `transition: none` (they jump to their end
state, as the tap flight already does under this media query). Suggested: also drop the
`scale`/tilt on the held card.

---

## 5. Sounds, haptics, timer, reward — unchanged

No new sounds; Flitsen is silent by design (the klank narration was removed on request, see
the comment in `path-to-lesson.spec.ts`). `haptic(10)` on a landing, as on a flip. The timer
starts on the first lift *or* the first tap. The reward path (`onComplete({ answers: [] })`)
is identical, and `quit()` cancels every pending timer as it does today — landings and
returns included, since they share `flightTimers`.

---

## 6. Tests

Run everything from `app/`. Unit: `npm test`. E2E: `npx playwright test --project=desktop`.

**New**

- `src/games/swipe.test.ts`, a `resolveDrag` block: a slow 100px drag right on `'x'` → `1`;
  left → `-1`; a 30px slow drag → `0`; a 30px flick right → `1`; a drag that is 200px right
  and 250px down → `0` (axis lock); a custom `distancePx` of 60 commits a 70px drag that the
  default 80 would not. The existing `resolveSwipe` cases stay as they are.
- `tests/e2e/flitsen-swipe.spec.ts` (all three projects):
  - *dragging a card to the other stack lands it*: `mouse.down` on the deck's `.kk-face-back`,
    move in ~10 steps to the centre of the discard stack, `mouse.up`. The discard
    `.kk-face-front` becomes visible, the deck's `.kk-count` is one lower, and `.kk-fly` is
    back to zero after `LAND_MS`.
  - *the card sticks to the finger*: mid-drag (after moving, say, 60px right and 20px down),
    read `.kk-held`'s computed transform as a `DOMMatrixReadOnly` and assert `m41`/`m42`
    match the pointer delta within 2px. Then keep dragging and land it, so the test leaves
    the game in a clean state.
  - *a short drag slides back*: move 20px right and release. No discard card, the count is
    unchanged, `.kk-fly` is zero after `RETURN_MS`, and the *next* tap still flips a card
    (the swallowed click must not have swallowed the wrong one).
  - *a tap after a drag still flips exactly one card*: covered inside the previous test.
  - *(as built)* *a flick towards the other stack lands the card before it gets there*: 40px
    in two quick steps, well short of the midpoint, lands.
- `tests/e2e/pointer-isolation.spec.ts`, one Flitsen case using the same CDP helper: touch
  down on the deck, move past the midpoint, `touchCancel` → no card on the discard pile, the
  deck count unchanged, `.kk-fly` zero after the return. This file is already Chromium-only,
  which is where `Input.dispatchTouchEvent` exists.

**Unchanged, must keep passing**: `quit-mid-animation.spec.ts` (both Flitsen tests — they tap,
and `FLITSEN_FLY_MS` mirrors a `FLY_MS` that does not change; note the first one asserts
`.kk-fly` has count **1** right after a tap, which only holds if no held/returning card is
lingering — a tap never creates one), `path-to-lesson.spec.ts` ("flipping the deck lands a
card"), `flitsDeck.test.ts`.

**Selectors that must keep existing**: `.kk-arena`, `.kk-stack-wrap`, `.kk-stack`,
`.kk-face-back`, `.kk-face-front`, `.kk-count`, `.kk-fly`, `.quit`.

---

## 7. Verification, and what this sandbox cannot do

Do all of these before pushing, and say in the commit which you ran:

1. `npm run build`, `npm run lint`, `npm test`.
2. Desktop e2e, whole suite. Chromium is at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`
   is set); do not run `playwright install`. Run a baseline on the untouched branch first so a
   pre-existing failure is not mistaken for yours.
3. **Screenshots on iPhone 13 and iPad Pro 11** (Playwright `devices`, Chromium is fine for
   layout) of the Flitsen node with a card held **edge-on at the midpoint** and **face-up over
   the discard pile**, and of the landing. Check the held card is the same size as the deck
   cards and nothing overflows horizontally. A couple of these go in `docs/media/flitsen/`
   for the PR.
4. WebKit **cannot run here**. CI runs the ipad/iphone projects on every PR; watch the run.
   The `touch-action: none` on the deck is the thing most likely to differ on real iOS
   (Safari's scroll takeover) — if the card stutters on her iPad, that is the first place to
   look, and it is why `pointercancel` returns the card instead of dropping it.

---

## 8. Docs to update in the same change

- `todo.md`: one line under the Flitsen entry, Dutch, in the same style as the others.
- This file's *Status* line, and *(as built)* notes wherever the build departed from the
  spec.

---

## 9. Files

| File | Change |
|---|---|
| `app/src/games/swipe.ts` | `resolveDrag(samples, axis, distancePx)`; `resolveSwipe` becomes a wrapper |
| `app/src/games/swipe.test.ts` | `resolveDrag` cases |
| `app/src/games/Flitsen.tsx` | drag handlers on the deck stack, `AirCard` modes, `settle()`, text |
| `app/src/theme.css` | `.kk-deck`, `.kk-held`, `.kk-landing`, `.kk-returning`, reduced motion |
| `app/tests/e2e/flitsen-swipe.spec.ts` | new |
| `app/tests/e2e/pointer-isolation.spec.ts` | one Flitsen cancel case |
| `docs/media/flitsen/` | two or three screenshots |
| `todo.md` | one line |

---

## 10. Out of scope

Teaching the drag (ghost swipe, chevrons, taught tap), a sound on landing, dragging a card
*back* from the discard pile, changing `FLITS_DECK_SIZE` or the tap flight's timing, and
anything in Tijdrit, Hardop lezen or Weetjes beyond the `swipe.ts` refactor above. If one of
those turns out to block the work, say so in the commit rather than fixing it in passing.
