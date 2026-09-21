# De kist openen: the schatkist on the reward screen, and where its gems go

An amendment to [reward-celebration.md](reward-celebration.md), not a replacement. That
sequence — hero, settle, card, strip, done — is unchanged; this adds one object to its last
beat and one moment to the screen after it.

**Status:** built. Deviations from what is written below are marked *(as built)* where they
occur and listed together in §7.

---

## 1. What changes and why

| | Before | After |
|---|---|---|
| Gems | a line in the reward strip, counting up on its own the moment the strip arrives | poured out of a **schatkist she taps open**; the count-up starts when the lid does |
| The gem counter on the leerpad | already at the new total when she gets there, having changed while she was on another screen | **holds at the old total** until the gems she just earned fly into it, then takes them with a pop |

Two problems, and they are the same problem twice.

**The reward screen had nothing to do.** Everything on it happens *at* her: Frida arrives, the
bar fills, the numbers count, and the only thing she can do is tap to make it go faster. The
gems are the part she cares about most and they were the most passive thing on the screen — a
number that went up by itself while she watched. A chest is the cheapest possible way to make
the payout something she performs rather than receives, and it is the one interaction on this
screen that cannot be mistaken for an obstacle: opening it is *only* upside.

**The two screens did not know about each other.** `completeLesson` credits the gems the
moment the round ends — a beat before the reward screen even mounts (`screens/GameScreen.tsx`).
So by the time she tapped Verder, the counter in the statbar was already at the new total. The
gems came out of nowhere on one screen and had silently already arrived on the other, and
plan.md's "accumulate in a visible treasure jar" was true of the data and false of anything
she could see. Nothing was wrong; the story between the two screens was simply missing.

Both halves are one gesture: the gems leave the chest, and they land in the counter.

**What this is not.** The **Schatkist** in plan.md §3 is a *path node* — a reward at the end of
a unit, still unbuilt. This is the end of every round, in every game. The two share an
in-world object and nothing else, and the nav's `ChestIcon` is deliberately the same drawing
so they read as the same kind of thing when the node does arrive.

---

## 2. The chest

`components/TreasureChest.tsx`, drawn at 120×96 and rendered at 76px (60px on a short
screen). It lives apart from `Icons.tsx`: those are flat 24px glyphs whose only variables are
`size` and `fill`, and this has moving parts — the lid is its own `<g>` so CSS can hinge it,
and the glow is a real element so it can fade in on the same beat.

No new art in the asset sense. It is built from the same flat wood-and-gold as the nav's
`ChestIcon`, in code, for the reason reward-celebration.md §1 gives for the hero: everything
dynamic comes from motion, not from a second drawing.

It sits **in the reward strip**, on the same row as the two reward lines rather than above
them. An iPhone SE has about fifteen pixels of slack in this layout (reward-celebration.md §3)
and a stacked chest would spend all of them.

- **Closed**, it wobbles every 2.2s — `chestNudge`. This is the only thing that tells a
  nine-year-old it is a button; there is no tooltip and no instruction, and a closed chest
  that just sits there is scenery.
- **Opening** is a 380ms hinge with an overshoot past the resting angle (`chestLidOpen`), a
  gold glow behind it, and up to seven gem sprites arcing out and fading (`gemFly`).
- **Open** is the default state in CSS, with the closed chest written as what it takes away.
  This is the same rule the whole reward block obeys, and it is what makes the chest a skip
  jumps to, and the chest reduced motion mounts, need no rules of their own.

The burst is capped at seven sprites (`gemSpriteCount`) and never exceeds the gems actually
earned. The count-up says how much the round was worth; the burst is a gesture.

---

## 3. When it opens

Three ways in, and they are not equal.

1. **She taps it.** The intended path, and the only one with a lid swing worth watching.
2. **She taps anywhere else.** The screen's existing tap-to-skip. Everything jumps to its
   final value, and a closed chest is not one of those — leaving it shut would make the tap
   she just made the one thing on the screen that did nothing. It opens *without* the swing,
   because `data-skipped` turns every animation off. That is the guarantee working, not an
   oversight.
3. **Nobody taps anything.** It opens by itself at `BEATS.chestAt`, 1.5s after the strip
   arrives.

The auto-open is a **floor under the tap, not the intended path**. It is timed by two
constraints, both pinned by unit tests:

- *After* `doneAt`. Verder is up and usable while the chest is still shut, so waiting for the
  chest is never something the screen makes her do. A child who does not care about the chest
  is not held by it for a millisecond.
- *At least a second* after the strip. Under about a second the auto-open beats a
  nine-year-old's hand to the chest, which turns the one interactive thing on the screen back
  into another thing that happened at her.

And nothing is ever stuck behind it: a child who never taps still gets her gems, without
having to do anything, because the count-up is gated on the chest being open and the chest
always ends up open.

**The gem count-up starts with the lid.** A number climbing beside a chest that is still shut
is the one thing on this screen that would give the game away. It is still allowed to run on
past `done` (reward-celebration.md §2) — a perfect round's eighteen ticks outlast the beat
they started in, and holding Verder back for them would penalise her best rounds.

**The tap does not skip.** `.reward-chest` stops the pointer event, and it has to: the
screen's tap-to-skip sets `data-skipped`, which turns every animation off, so without it the
one tap this feature exists for would be the one tap whose lid never swings.

**Which of the three did it** is recorded and mirrored to `data-opened-by` on the chest —
`tap`, `auto`, `skip`, or `reduced` for a screen that mounted open. Opening is one-way and
the first one in wins, guarded by a ref rather than by state so a tap landing in the same
frame as the timer cannot open the chest twice.

Timers live in `useCelebration`, with the rest of the sequence's, for the reason that hook's
own note gives — a celebration with timers scattered through a component's render body is how
`quit-mid-animation.spec.ts` came to exist.

**Sound.** `playEffect('chestOpen')` — a low wooden thump with a three-note shimmer over it,
and an 18ms haptic. It fires on a tap and on the auto-open, never on a skip and never under
reduced motion, on exactly the same terms as `onBeat`: in both of those cases the chest is
open because the screen jumped, and nothing happened for a sound to belong to.

---

## 4. The landing

What she sees a frame after Verder: the gems fly from low on the leerpad — roughly where the
chest stood on the screen she just left — into the gem counter in the statbar, which has been
holding at the old total and now takes them with a pop.

`screens/gemLanding.ts` carries it. `GameScreen` puts `{ gemsLanded }` in the navigation's
router state; `useGemLanding` reads it, holds the counter back for 900ms, and strips the state
off the history entry so a back gesture cannot replay the flight — or, worse, briefly show her
a counter that has gone *down* by the gems she earned.

**Why router state and not the store.** Nothing here is worth persisting, and `useProgress`
has no `partialize` — a field added to it is a field written to IndexedDB and read back on the
next launch, which for this would mean gems flying into the jar on a cold start days later.
Router state dies with the history entry, which is exactly the lifetime this has.

**The count-up is not repeated.** She has already watched these gems counted, one tick at a
time, on the reward screen. Doing it again makes the second one a wait rather than a reward:
the counter sits at the old total, the gems arrive, and it takes them in one step.

**The destination is measured, not assumed** (`components/GemFlight.tsx`). The statbar's gem
stat moves with the font toggle, the notch inset, and the width of the number in it — nine
gems and nine thousand are not the same box — and a hard-coded corner would be wrong on the
first phone that disagreed.

There is a hard route cut between the two halves and this does not pretend otherwise. What
makes them read as one gesture is that the gems leave from where the chest was and land on the
number that then changes.

Any other way onto the leerpad — a reload, a deep link, the back gesture, the bottom nav —
carries no state, so the counter shows the plain total immediately with nothing in the air.

---

## 5. Reduced motion, skipping, and reach

- **Reduced motion**: the chest mounts already open and the count-up starts at mount, exactly
  as it did before any of this existed. There is no swing to watch and no reason to make her
  tap for a number the screen could simply be showing her. On the leerpad there is no flight
  and no holding back: the counter reads the true total from the first frame. Both are decided
  in JS, with the CSS `@media` block as the belt to those braces.
- **Skipping**: covered in §3. A skip leaves no gem frozen in the air — the sprites' resting
  state is *gone*, not *mid-arc*.
- **Reach**: the chest is a real `<button>`. It is the only thing on this screen that does
  something, so it must be reachable from a keyboard and announce itself — "Open de
  schatkist", then "De schatkist is open". "She can always tap anywhere" is not an answer for
  either. It clears the 44px floor everything tappable in this app obeys, comfortably.

---

## 6. Tests

`app/tests/e2e/kist-openen.spec.ts`, plus the pure parts in
`app/tests/unit/rewardTimeline.test.ts` and `app/tests/unit/gemLanding.test.ts`.

The chest is exercised through the `/#/beloning` preview, for the reason
reward-celebration.md §9 gives. The *landing* cannot be — it is the seam between two screens,
and the only way to produce a real navigation carrying a real reward is to play a real round —
so the two tests that cover it play one.

What is pinned:

1. The chest arrives shut, the gem line reads `+0`, and her tap — not the timer — is what
   opens it.
2. The tap does not skip: `data-skipped` is never set, and the lid animation actually runs.
3. Left alone, Verder comes up *first* and the chest opens by itself afterwards, and the gems
   still arrive.
4. A tap anywhere else opens it too, with nothing left mid-animation.
5. Reduced motion mounts it open, with nothing moving and the gems still counting.
6. It is a button: labelled, and openable with Enter.
7. After a real round: the counter holds at the old total with seven gems in the air, then
   reads the new total with nothing left on screen.
8. A leerpad reached any other way shows the total straight away.

**Why `data-opened-by` exists, and not a clock reading.** A click is not free on a paused
clock: Playwright's actionability wait drives it forward, and further on this element than
almost anywhere else in the suite, because a wobbling button is never "stable" until the
quiet stretch of its keyframes. Test 1 originally read `performance.now()` after the tap and
asserted it had beaten `BEATS.chestAt`. On Chromium the click cost about a second and that
held. On CI's WebKit it cost 2.7s, the auto-open fired *inside* the `click()` that was meant
to beat it, and the test reported the timer's work as hers — it failed, then passed on
retry, which is the worst way for a test to be wrong. The attribute makes the claim exactly
instead of by inference, on any engine and at any speed, and the other three tests assert
their own path with it too.

**Budget the real rounds.** The two tests that play one need `test.setTimeout(150_000)`: a
ten-card round costs about 15s on a desktop and up to 38s on CI's two-core WebKit runners,
so the 30s default is not enough — which is how the first CI run failed.

---

## 7. As built: deviations, and what was not done

- **The "treasure jar" is the statbar's gem counter**, not a new drawing. plan.md §4 says the
  gems "accumulate in a visible treasure jar on the home screen"; what is on the home screen
  today is `<GemIcon /> {gems}` in the statbar, and that is what the gems fly into. Building an
  actual filling jar is a separate piece of work with its own art, and the connective tissue —
  which was the whole complaint — does not depend on it. When a jar is drawn, it is the same
  target and the same handoff; only the thing at the end of the flight changes.
- **The chest does not gate anything.** An earlier shape had the gems appear only if she
  opened it. It was dropped: it breaks "Verder works from the first frame", and it makes the
  most important number on the screen conditional on an interaction a distracted nine-year-old
  will skip half the time.
- **No second beat after Verder.** reward-celebration.md §12 leaves `onDone` as the single
  exit so a quest/sticker/streak beat can be added in front of `navigate('/')` later. This
  adds an argument to that `navigate`, not a beat in front of it, so that door is still open.
- **Only the `desktop` profile was run.** `ipad` and `iphone` are both WebKit, and
  Playwright's WebKit could not be installed on the machine this was built on (its host-
  requirements check fails on Arch). Those two profiles' runs are CI's. Worth knowing for
  this change in particular: the lid hinge is an SVG `transform-origin` with
  `transform-box: view-box`, which is exactly the kind of thing the two engines have
  historically disagreed about, and the reward screen's own iPhone SE height budget
  (reward-celebration.md §3) was measured with WebKit text metrics that run ~11px taller
  over a screen this long. The chest gives back 16px of its width on short screens for that
  reason, but the measurement behind it is Chromium's.
