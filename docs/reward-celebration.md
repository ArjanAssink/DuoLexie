# Beloningsscherm v2: the celebration after a round

Implementation spec for a new end-of-round celebration, replacing the current `RewardScreen`
for **every** game (Hardop lezen, Tijdrit, Flitsen and whatever comes after). The reference
is the "Perfect lesson!" sequence in Duolingo: a hero moment, a settle, stat cards that pop
in one by one and count up, a button. Ours does the same with Frida, in Dutch, in our
palette, without any new art.

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement.

**Status:** built (PR *Beloningsscherm v2: viering na een ronde*). Deviations from what is
written below are marked *(as built)* where they occur, and listed together in §13.

**Amended by [kist-openen.md](kist-openen.md):** the gems in the strip now pour out of a
schatkist she taps open, and the count-up starts with its lid rather than with the strip.
Every beat, every timing and every guarantee below is unchanged — read that document
alongside §2 and §6 rather than instead of them.

---

## 1. What changes and why

| | Today (`app/src/screens/RewardScreen.tsx`) | After |
|---|---|---|
| Entrance | screen fades in, Frida bounces forever | **hero beat**: oversized Frida bursts in over a diagonal streak, big gold headline, gold confetti — then **settles** into the final layout |
| Frida | 180px, `bounce 1.2s infinite` | 2.2× during the hero, then shrinks to 180px and floats slowly |
| Score | pills "7 goed · 3 nog even" | one **stat card** with a **progress bar** that fills to the percentage, the number counting alongside, and a label that upgrades as the bar crosses tiers (Geoefend → Goed → Super → Perfect!) |
| Gems / XP | two plain lines, gems count up | kept, as a compact reward strip under the card; gem count-up and its tick sound kept |
| Nog-even chips | under the tally | kept, fade in after the card |
| Skipping | none | **tap anywhere** jumps to the final state; **Verder** works from the first frame |
| Reduced motion | bounce off | whole sequence collapses to the final state, numbers final |
| Confetti | fired from `GameScreen.handleComplete` | fired from the reward screen's own timeline, gold squares, so it coincides with the hero |

Why a hero beat: the end of a round is the payoff, and today it lands as a form — three
lines and a button. Duolingo spends about two seconds making the moment feel big *before*
showing any numbers, and only then lets the numbers arrive one at a time so each one gets
its own small reaction. That pacing is the whole thing; the visuals are in service of it.

Why a progress bar for the percentage: Arjan asked for it. A bar filling towards the right
edge reads instantly for a nine-year-old, without arithmetic, and "how full did it get" is
a better story than "83%". The number is still shown, counting up beside the bar.

Why no new art: the Frida SVGs in `app/public/avatar/` are canonical and must not be redrawn
(`components/Frida.tsx`). `frida-happy.svg` is the only full-body pose (viewBox 240×260); it
is the hero. Everything dynamic in the hero comes from motion — scale, the streak, confetti,
a wobble — not from the drawing.

---

## 2. The sequence

Times are from mount of the reward screen. They are constants in one place (§8) so they
can be tuned; the *order* and the *gates* are the acceptance criteria, the milliseconds are
suggested.

| Beat | Window | What she sees | What she hears |
|---|---|---|---|
| **0 wash** | 0–250 ms | the screen comes up from the game (existing `screenEnter` fade covers the hard cut; nothing extra) | `fanfare` (already fired in `GameScreen.handleComplete`) |
| **1 hero** | 250–1800 ms | a diagonal **streak band** sweeps in from the left (two skewed bands, `--teal-pill` and `--gold` at low alpha, `skewY(-8deg)`); **Frida** (`happy`) pops from `scale(0.4)` to `scale(2.2)` with a small overshoot and a slow ±3° wobble; the **headline** in `--gold`, 52px, two lines if needed; **gold confetti** squares fall from the top (canvas-confetti, `shapes: ['square']`, colors `--gold`/`--gold-shadow`/`#FFF1B8`); four CSS **sparkles** twinkle around Frida | `whoosh` on the streak sweep (new effect) |
| **2 settle** | 1800–2400 ms | streak wipes out to the right; Frida shrinks to 180px and rises into the top third; headline shrinks to 34px and moves under Frida; the **subline** fades in; sparkles stay, twinkling slowly | — |
| **3 card** | 2400–3700 ms | the **stat card** pops in (`scale(0.6)`→`1.06`→`1`, with a small sparkle burst on landing); after 150 ms the **bar fills** from 0 to the percentage over ~800 ms (ease-out) while the number counts up beside it; each time the fill crosses a tier boundary the **label swaps** with a bump and the card's colour steps up | `cardPop` on landing; `tick` steps during the count (reuse); `tierUp` chime on each label swap (new) |
| **4 strip** | 3700 ms → | the **reward strip** (💎 + ✨ XP) fades in and the gem count-up runs exactly as today (90 ms per gem, `tick` walking up the triad); the **nog-even chips** fade in under it; for Tijdrit the klanken-per-minuut line and the **NIEUW RECORD!** banner appear here | `tick` |
| **5 done** | when the strip has finished | **Verder** rises in from the bottom (it was already in the DOM and clickable — see gates); Frida floats slowly (`translateY` ±6px, 3 s, infinite — the only infinite animation, with its own reduced-motion override as today) | — |

**Gates (must):**

- **Tapping anywhere** on the screen during beats 1–4 jumps to `done`: all elements at their
  final positions, bar at its final width, numbers final, chips visible. No element may be
  left mid-animation.
- **Verder** is rendered from mount, `aria-hidden` and `visibility: hidden` until beat 5 —
  but a tap on the screen before that first *skips* (gate above); a second tap hits the now
  visible button. This keeps the "she taps impatiently" path to two taps at most, never a
  dead tap.
- Every timer is cleared on unmount. `tests/e2e/quit-mid-animation.spec.ts` already guards
  against the previous generation of leaks; the new timeline must not add any.
- The hero must be **clipped**: `overflow: hidden` on the screen root, so a 2.2× Frida
  never produces a horizontal scrollbar or a page-level scroll on an iPhone.
- Nothing animates `width`/`height`/`top`/`left` except the bar fill (which animates
  `transform: scaleX` on an inner fill element, not width). Everything else is `transform`
  and `opacity`.

---

## 3. Layout (final state, after settle)

```
┌────────────────────────────────┐
│          ✦    Frida     ✦      │  180px, floating
│               (happy)          │
│                                │
│            Perfect!            │  h1, 34px, --orange   (gold during the hero)
│      Alles goed gelezen!       │  subline, 17px, --muted
│                                │
│  ┌──────────────────────────┐  │
│  │ SUPER                    │  │  label, 11px caps, tier colour
│  │ ████████████░░░░  8/10   │  │  bar + fraction ("8 van 10" on wide screens)
│  │          83%             │  │  big number, counts up
│  └──────────────────────────┘  │
│                                │
│     💎 +12      ✨ +14 XP       │  reward strip (.reward-line ×2, gems first)
│                                │
│   🔊 boom   🔊 vis   🔊 kist    │  nog-even chips (Hardop lezen only)
│                                │
│  ┌──────────────────────────┐  │
│  │          Verder          │  │  .btn-primary
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

- Root is `.reward-screen` (keep the class — tests and the shared `screenEnter` rule use
  it) with `data-beat="hero|settle|card|strip|done"` for CSS and tests.
- Max width follows `.app` (480px). On desktop the streak band spans the full `.app` width,
  not the viewport.
- The card is `min-width: 260px; max-width: 340px`, white, `border-radius: 18px`, 2px border
  in the tier colour, tier-coloured label strip on top like the tally pills' palette.
- Vertical rhythm: `gap: 16px`; the screen must fit an iPhone SE (667pt tall) **without
  scrolling** when there are up to 4 chips. With more chips the chip row wraps and the screen
  may scroll — Verder stays reachable because it is in flow, not fixed.

---

## 4. The stat card

One card. Data: `correct / total`, where for Hardop lezen `total = wordResults.length` and
for klank games `total = answers.length` (per klank, as `computeReward` already does).
`total === 0` (should not happen; defensive) renders the card at 0 with the *Geoefend* tier
and no crash.

**Exception, already shipped: `kind: 'weetje'` renders no card at all.** A Weetjes round is
never scored — `computeReward` pays a flat `WEETJE_GEMS` off `lesson.kind` alone — so there
is nothing honest to fill a percentage with, and a card at 0 would turn "kinderen met
dyslexie zijn minder slim" into a question she can get wrong, which is the one thing that
game must not be. `RewardScreen` takes the lesson's `kind` on its `DisplayReward` and, for
`weetje`, swaps the headline for **"Nu weet je dit ook!"**, adds the subline **"Vertel het
vanavond aan iemand thuis."**, and shows only the gem/XP strip. See docs/weetjes.md §2; when
this celebration is built, keep that branch.
*(as built: kept. The card, the tally and the announcement are all behind `!isWeetje`, and
`useCelebration`'s `skipCard` drops the card **beat** as well — 1.3 seconds of an empty middle
is worse pacing than no middle. A Weetje still gets the full hero, streak and confetti: it has
no percentage to be quiet about, and she learned the thing however she guessed.)*

| Tier | Percentage | Label | Colour |
|---|---|---|---|
| geoefend | 0–49 | **Geoefend** | `--orange` / `#FDEBD5` fill |
| goed | 50–79 | **Goed** | `--teal` / `--teal-pill` |
| super | 80–99 | **Super** | `--teal-shadow` / `--teal-pill` with a `--gold` border |
| perfect | 100 | **Perfect!** | `--gold` / `#FFF1B8` *(as built: `--gold` is the border and
  `#FFF1B8` the fill, but the label and the number are `--gold-shadow` — `--gold` on white is
  too thin to read at 11px caps)* |

- The bar's inner fill animates `scaleX(0)` → `scaleX(pct/100)` over `BAR_FILL_MS` (800)
  with `cubic-bezier(.22,.9,.35,1)`. The number counts up in step with the fill (drive both
  from one `requestAnimationFrame` loop reading the same eased progress, so they can never
  disagree).
- The **label upgrades while filling**: it starts at *Geoefend* and swaps each time the
  eased progress crosses 50, 80 and 100, so a perfect round visibly runs through all four
  labels — that is the Duolingo "Lesson XP → Combo → X3 XP" beat. Each swap: `tierUp` chime,
  label `scale(1.25)`→`1` bump, card border colour transitions.
- Final tier colours also drive the headline's Frida-independent accent, nothing else.
- `aria-live="polite"` region announces the final sentence once ("8 van 10 goed").

Below the number, small: **"8 van 10 goed"**. Keep `.reward-tally` as the class of this
line with the text `"{correct} goed · {missed} nog even"` for Hardop lezen — the existing
test `a round she gets entirely wrong still pays for finishing` asserts
`.reward-tally` contains `0 goed`. (Either keep that exact text, or update the assertion in
the same change; keeping it is simpler.)

---

## 5. Headline, subline, Frida

Selected from the *final* percentage (`pct`) and `reward.perfect`:

| Condition | Headline (h1) | Subline |
|---|---|---|
| `perfect` | **Perfect!** | Alles goed gelezen! *(klank games: Alles goed!)* |
| pct ≥ 80 | **Super gedaan!** | Bijna alles goed! |
| pct ≥ 50 | **Goed gedaan!** | Je hebt lekker geoefend. |
| pct < 50 | **Lekker geoefend!** | Oefenen helpt. Volgende keer weer! |

*(as built)* The headline keeps v1's personalisation, so the first three rows read
**Perfect, Lexie!** / **Super gedaan, Lexie!** / **Goed gedaan, Lexie!** where she gave a
name, and exactly as tabled where she did not. The floor line stays impersonal on purpose:
her name on the weakest result would sting rather than warm.

Never a failure message; `Lekker geoefend!` is the floor. The existing test asserts the h1
does **not** contain "Perfect" for an all-wrong round — that holds.

Frida is `happy` in the hero for every tier (the only full-body asset). The tier changes the
*intensity*, not the art:

- perfect / ≥ 80: full hero — streak, confetti sized to the correct count (reuse the
  existing formula from `GameScreen`: `40 + 18 × correct`, capped at 220; `newRecord` → 220),
  wobble.
- 50–79: streak and wobble, half the confetti.
- < 50: no streak, no confetti, a gentle pop-in instead of the burst; the sequence is
  otherwise identical and takes the same time. She still gets the full ceremony; the room is
  just quieter.

`newRecord` (Tijdrit): the **NIEUW RECORD!** banner replaces the subline and pulses as today
(`.record-banner`); haptics stay in `GameScreen`.

---

## 6. Sound and haptics

All synthesized in `app/src/audio/audio.ts` via `playEffect`, no asset files. Add to
`EffectKind` with a doc comment each, in the style of `ding` and `tick`:

- `whoosh` — 350 ms band-passed noise sweep, centre frequency gliding 400 → 2400 Hz, gain
  fading out; the streak sweeping in.
- `cardPop` — a short sine pluck, 660 → 880 Hz over 60 ms, 120 ms decay; the card landing.
- `tierUp` — two partials like `ding` but shorter (250 ms) and a fifth apart (1318.5 and
  1975.5 Hz); the label swapping. `step` raises it a whole tone per tier so the perfect run
  climbs.
- `tick` — reused for both count-ups (percentage and gems).

`fanfare` stays where it is (`GameScreen.handleComplete`). The confetti call and its sizing
formula **move** from `GameScreen` into the reward screen's hero beat (§2) so they coincide
with Frida and are skipped under reduced motion and when tapped through. Haptics stay in
`GameScreen`.

*(Added after the merge, on request: the hero beat also has a haptic of its own, longer than
anything else in the app — three rising pulses and a held rumble, ~450ms — because this is
the one moment meant to feel big; a quiet round gets a single soft 40ms pulse, as it gets the
pop-in instead of the burst. It fires from `handleBeat` alongside the whoosh and the confetti,
so it goes through the same reduced-motion and skip gates; the short round-end tap in
`GameScreen` stays where it is. On an iPhone it arrives as a rattle of six light ticks through
the switch trick in docs/haptics.md; an iPad has no motor and feels nothing.)*

Volume: none of the new effects louder than `ding`. Nothing plays after `done` except the
gem ticks that were already running.

---

## 7. Reduced motion

`prefers-reduced-motion: reduce` (checked with `matchMedia`, same as
`HardopLezen.prefersReducedMotion`; **suggested:** move that helper to a shared
`app/src/motion.ts` and import it from both):

- The screen mounts directly in `done`: Frida at 180px, no streak, no confetti, no float,
  card at full width, bar at its final width, numbers final, chips visible, Verder visible.
- The gem count-up still runs (it is numbers changing, not motion) — keep the existing
  behaviour.
- Sounds: `fanfare` and the gem ticks only; no `whoosh`, `cardPop`, `tierUp`.
- The CSS side must be complete on its own (`@media (prefers-reduced-motion: reduce)`
  blocks for every new keyframe, following the pattern already documented above
  `.reward-screen .frida` in `theme.css`), so a browser that reports reduced motion via CSS
  but where the JS check fails still shows nothing moving.

---

## 8. Implementation notes

**Files**

- `app/src/screens/RewardScreen.tsx` — rewrite. Keep the `DisplayReward` export and the
  `{ reward, onDone }` props; `GameScreen` keeps calling it the same way.
- `app/src/screens/rewardTimeline.ts` — **new**, pure: the beat constants, a
  `tierFor(pct)` function, the headline/subline table, the confetti sizing formula and the
  bar's easing. Unit test this file — tiers at the boundaries (49/50, 79/80, 99/100),
  headline per tier, `total === 0`. *(as built: `app/src/screens/rewardTimeline.test.ts`,
  not `tests/unit/` — `vitest.config.ts` includes `src/**/*.test.ts` only, and every other
  unit test in the app sits beside the file it tests.)*
- `app/src/screens/RewardPreviewScreen.tsx` — **new** *(as built)*: the screen on its own at
  `/#/beloning?goed=…&totaal=…`, linked from the probeermenu, one button per tier plus a
  Tijdrit record. Real `computeReward`, real word ids, real `DisplayReward`; it never calls
  `completeLesson`, so it credits nothing — there is a test pinning that, because this is a
  route in the shipped app rather than a test-only door.
- `app/src/screens/useCelebration.ts` — **new** hook: owns the timers, exposes
  `{ beat, progress, skip }`. `progress` is the eased 0–1 fill progress driven by rAF during
  the card beat. `skip()` sets `beat = 'done'` and `progress = 1` and clears everything.
  Unmount clears everything. Under reduced motion it starts at `done`.
- `app/src/audio/audio.ts` — three new effects (§6).
- `app/src/theme.css` — replace the `/* ---------- reward ---------- */` block. New
  keyframes: `heroIn`, `heroWobble`, `streakIn`, `streakOut`, `settleFrida`, `settleTitle`,
  `cardIn`, `sparkle`, `fridaFloat`, `riseIn`; reduced-motion overrides for all.
  *(as built: `cardIn` is `rewardCardIn` — `@keyframes cardIn` is already Flitsen's
  `.flash-card` entrance and a second definition would have replaced it. `fridaFloat`
  already exists for the welkom-flow and is reused as it stands, at ±4px rather than ±6px.
  Four more were needed: `heroTitleIn` for the headline's own hero entrance, `heroInQuiet`
  for §5's gentle pop-in below 50%, `stripIn` for the strip, chips and subline, and
  `tierBump` for the label bump §4 asks for.)*
- `app/src/screens/GameScreen.tsx` — remove the `confetti` import and call; leave fanfare and
  haptics.

**Suggested constants** (`rewardTimeline.ts`):

```ts
export const BEATS = {
  heroAt: 250,
  settleAt: 1800,
  cardAt: 2400,
  barDelay: 150,
  barFillMs: 800,
  stripAt: 3700,
  // (as built) — see §13
  doneAt: 4300,
} as const
```

**State per beat** is expressed as `data-beat` on the root; CSS does the choreography from
that attribute (`.reward-screen[data-beat="hero"] .frida { animation: heroIn … }` etc.),
JS only advances the attribute and the bar progress. That keeps every visual in one CSS
block and makes `skip()` a one-attribute change.

**Count-up correctness:** the displayed percentage is `Math.round(progress × pct)`, never
an independently ticking integer, so it always ends on exactly `pct`. The gem count-up is
unchanged and lives in the strip.

*(as built)* One existing test file did need changing: `weetjes.spec.ts` gave the gem
count-up 10 seconds, which was enough while the reward screen started counting at mount. It
no longer does — §2 holds the gems back until the strip beat, ~2.4s in — and that pushed CI's
ipad profile over, with the count still at +3 when the clock ran out. Both polls now use the
20s `hardop-lezen.spec.ts` already settled on for the same assertion: what these pin is the
total the count lands on, never its pace. No selector or expected value changed.

**Keep for the existing tests** (or update them in the same change — say which in the PR):
`.reward-screen`, `.reward-screen h1`, `.reward-tally` containing `"{correct} goed"`,
`.reward-line` **first** being the gems line and ending on `+{gems}`, `.word-chip` buttons,
the **Verder** button text.

**Fonts:** headline and card number in `--font-display`; everything else `--font-ui`.

**Desktop:** no special treatment beyond the `.app` max width; the streak clips to it.

---

## 9. Tests

`tests/e2e/reward-celebration.spec.ts` (new; desktop Chromium locally, all three profiles
on CI).

*(as built)* The tests open the screen directly, from `/#/beloning?goed=7&totaal=10` — a new
entry in the probeermenu (`screens/RewardPreviewScreen.tsx`, §8). Driving a real round to
reach it, as first planned and first built, costs ~20s on a desktop and ~1 minute on CI's
WebKit profiles; eight of them across three profiles roughly doubled the CI job for coverage
of a screen that does not care how she got there. The preview builds the same `wordResults`
and `answers` a real round produces and hands them to the real `computeReward`, so nothing is
faked but the route in.

Two tests still play a real round, because their subject is the seam rather than the screen:
the Verder case below, and (already existing, untouched) `hardop-lezen.spec.ts`'s assertions
that the tally, the chips and the gem total match what she actually did. `finishRound(page,
correctCount)` is extracted into `fixtures/round.ts` as suggested, and is what they use.

1. **Beats advance in order** — `data-beat` goes `hero → settle → card → strip → done`
   (poll; don't assert timing tighter than ±500 ms, CI's ipad profile runs slow).
2. **Perfect round** — h1 "Perfect!", card label ends at "Perfect!", bar fill ends at
   `scaleX(1)` (read the computed transform), number "100%".
3. **7/10** — label "Goed", "70%", `.reward-tally` "7 goed · 3 nog even", three chips.
4. **0/10** — label "Geoefend", "0%", h1 not containing "Perfect", gems line reaches "+5".
5. **Tap skips** — tap the screen 300 ms after mount; within 200 ms `data-beat="done"`,
   Verder visible, number final, no element with a running animation (`getAnimations()`
   on the root's subtree filtered to `playState === 'running'` is empty except `fridaFloat`).
6. **Verder during animation** — tap the screen once, then Verder; the path screen appears,
   and no console errors.
7. **Reduced motion** — `page.emulateMedia({ reducedMotion: 'reduce' })`: mounts in
   `done`, `getAnimations()` empty, gem count-up still reaches its total.
8. **Sounds** — with a WebAudio spy (`AudioContext.prototype.createOscillator` counter via
   `addInitScript`), a perfect round produces strictly more oscillator starts than an
   all-wrong round (the tier chimes), and the reduced-motion run produces only the gem
   ticks + fanfare count.
9. **No leaks** — `quit-mid-animation.spec.ts` must still pass unchanged.
10. **iPhone SE fits** — at 375×667 with 4 chips, `document.scrollingElement.scrollHeight ≤
    clientHeight + 1` in `done`.

Unit: `rewardTimeline.test.ts` as in §8.

---

## 10. Verification, and what a sandbox cannot do

- `npm run lint`, typecheck, unit tests, full Playwright suite in `app/` on desktop
  Chromium.
- Watch it: record the sequence with Playwright `video: 'on'` for a perfect round and a
  0/10 round, attach both to the PR (or a frame strip made with ffmpeg if available), and
  screenshot the `done` state at 375, 820 and 1280 px wide.
- Confirm no console errors, and no horizontal scroll at any point during the hero at
  375 px (poll `document.documentElement.scrollWidth`).
- Sound cannot be heard in CI. Check the three new synths by ear on a real device once, and
  say in the PR whether they were heard or only seen in the spy count.
- Speech synthesis cannot be patched under Playwright WebKit; use
  `tests/e2e/fixtures/narration.ts` for anything that needs narration.

---

## 11. Docs to update in the same change

- `todo.md`: tick the *Beloningsscherm v2* line and add one line of as-built notes.
- `docs/hardop-lezen-rework.md` §7 (reward screen description) — one sentence pointing here.
- This file: set **Status** to built; mark deviations *(as built)*.

---

## 12. Out of scope

- A second beat after Verder (quest progress, sticker, streak). Leave `onDone` as the
  single exit so it can be added in front of `navigate('/')` later. *(Still true. The gem
  landing in kist-openen.md §4 adds an argument to that `navigate`, not a beat in front of
  it.)*
- New Frida art. If a full-body celebrating pose is ever drawn, it slots into the hero as a
  different `expression`; nothing else changes.
- Recorded sound assets.
- Showing time or XP as their own cards.

---

## 13. As built: every deviation, and why

Naming and structure:

1. **`cardIn` is `rewardCardIn`.** `@keyframes cardIn` already exists in `theme.css` as
   Flitsen's `.flash-card` entrance. Keyframe names are global, so a second definition would
   have silently replaced it and changed a game this plan does not touch.
2. **`fridaFloat` is reused, not redefined** — it already exists for the welkom-flow, at ±4px
   rather than the ±6px above. Same reason: redefining the name would have changed that
   screen too, and 2px is not worth it.
3. **Four keyframes beyond the list in §8**: `heroTitleIn` (the headline's own entrance into
   the hero, which §2 describes but §8's list omits), `heroInQuiet` (§5's "gentle pop-in
   instead of the burst" below 50%), `stripIn` (the strip, the chips and the subline fading
   in) and `tierBump` (the `scale(1.25)→1` label bump §4 asks for). All four have
   reduced-motion coverage.
4. ~~The unit test is `src/screens/rewardTimeline.test.ts`, not `tests/unit/`.~~ **No longer a
   deviation.** It was one while `vitest.config.ts` included `src/**/*.test.ts` alone; the
   Weetjes change added `tests/unit/**/*.test.ts` to that list, so the test moved to
   `tests/unit/rewardTimeline.test.ts` where §8 asked for it in the first place.
5. **A new e2e fixture, `tests/e2e/fixtures/round.ts`** — `finishRound(page, correct)` as §9
   suggests, plus the beat recorder, the WebAudio spy and the running-animation reader the
   tests need.

Behaviour:

6. **`BEATS.doneAt` (4300) was added.** §2 puts beat 5 at "when the strip has finished"; what
   has to be finished is the strip *arriving*, not the gem count-up — §6 explicitly allows
   those ticks to run on into `done`, and waiting for them would hold Verder back by up to
   1.6s on exactly the rounds she did best on.
7. **The headline keeps v1's player name** (§5, marked in place).
8. **The h1 stays `--orange` in the final state**, gold only during the hero, as §3's layout
   drawing says. §4's "final tier colours also drive the headline's accent" was not taken any
   further than that: the tier colour drives the card, and a headline that changed colour
   with it fought the card for the same beat.
9. **`DisplayReward` gained an optional `answers`.** §4 wants `total = answers.length` for
   klank games and the screen had no denominator otherwise; `GameScreen` passes what it
   already holds. `DisplayReward` and the `{ reward, onDone }` props are otherwise unchanged.
10. **The klanken-per-minuut line is `.reward-score`, not a third `.reward-line`.** The
    existing tests read the *first* `.reward-line` as the gems line, and in v1 the score line
    came before it for Tijdrit — an ordering bug waiting for the first Tijdrit test.
11. **`cardPop` fires as the card starts its pop**, not at the visual landing 420ms later.
    Leading the visual by a fraction is what a pop sounds like; trailing it is a rattle.
12. **The sparkles stop at the strip beat** rather than twinkling on into `done`. §2 beat 5
    and §9.5 both require `fridaFloat` to be the only thing still running at the end, and a
    gate that is checkable is worth more than four more twinkles.
13. **The `NIEUW RECORD!` banner keeps its infinite `pulse`** — that is v1 behaviour §5 says
    to keep, so a Tijdrit record round does have a second infinite animation in the final
    state. Flagged rather than changed silently; no test covers it, because no Tijdrit test
    reaches a record.

Layout:

14. **The root is `overflow: hidden` through the hero, `overflow-y: auto` from the strip
    beat.** §2's clipping gate and §3's "with more chips the screen may scroll" cannot both
    hold of the same rule. The thing that needs clipping is the 2.2× hero, and it is long
    over by the time the chips are on screen.
15. **A `@media (max-height: 700px)` block tightens the rhythm, Frida included.** Measured at
    375×667 with four chips, the comfortable spacing ran 47px over and pushed Verder off the
    screen. Short screens get `gap: 10px`, less padding, a 34px number, smaller chips — and a
    **150px Frida rather than 180px**, which is the part that is not in §3. The first attempt
    kept her at 180 and took the whole 47px out of spacing and type. It fit on Chromium with
    15px to spare, and CI came back 11px *over* on both WebKit profiles, whose text metrics
    run taller over a screen this long. A layout that fits by four pixels on one engine is
    not a layout that fits. Thirty px off the hero buys ~60px of slack and makes it true on
    both engines; a 150px Frida on a 667px screen is still plainly the hero.

Elsewhere in the app:

16. **`prefersReducedMotion` moved to `app/src/motion.ts`** (§7's suggestion). `HardopLezen`
    and `OnboardingScreen` import it instead of each keeping a copy.
17. **`GameScreen` also stopped passing its confetti sizing**, which moved to
    `rewardTimeline.confettiCount` with the call. The fanfare and the haptics stayed.

Verification:

17b. **The PR screenshots are generated by `tests/e2e/shots.spec.ts`**, the SHOTS-gated file
    the Weetjes change introduced for exactly this, writing into `docs/media/reward-celebration/`.
    They are reproducible with `SHOTS=1 npx playwright test shots.spec.ts --project=desktop -g beloning`
    rather than being a one-off nobody can regenerate.

18. **WebKit could not be run locally.** This machine is missing the system libraries
    Playwright's WebKit needs (`libicu74`, `libxml2`, `libflite1`) and installing them needs
    root. Desktop Chromium was run in full and is green; the ipad and iphone profiles are
    covered by CI only.
19. **The tests open the screen directly rather than playing a round to it** (§9, marked in
    place). Built the planned way first, and CI came back at 20m03s against an ~8-9 minute
    baseline — eight ten-card rounds across three profiles. `/#/beloning` took the whole
    e2e suite from 60s to 40s locally while *adding* cases the round-driven version could not
    afford: the 80/79 tier boundary on the real screen, the Tijdrit `NIEUW RECORD!` banner
    (which a reading round cannot produce, since Hardop lezen is untimed by design), and a
    test that opening the preview credits nothing. §9.9 needed no new test at all: it is
    `quit-mid-animation.spec.ts`, which passes unchanged.
20. **Two traps worth knowing about, both found by CI rather than locally.**
    *Assertions about the final state have to wait for it.* Everything on this screen is
    mid-climb for four seconds — the label walks all four tiers, the number counts 0 → pct —
    and a polling `toHaveText` matches the instant a value flies past. The 79% boundary test
    was green on Chromium while the screen was actually settling on 100% (a cap in the
    preview's own URL parsing), and only WebKit's different polling cadence missed the
    transient and caught the bug. Every final-state assertion now goes through a `settled()`
    gate that waits for `data-beat="done"` first.
    *The beats are only assertable on a fake clock, and the clock has no baseline worth
    assuming.* On CI's ipad profile the DOM went `hero → card → done`: React coalesces two
    state updates into one commit when the main thread is busy enough that the render for
    `settle` has not flushed before `card` is set, so the beat never reaches the DOM at all.
    Nothing is broken by that — a beat nobody had time to paint is a beat nobody saw — but it
    makes "every beat appeared" a claim about the runner, so the test drives `page.clock`, the
    same tool and reason as `quit-mid-animation.spec.ts`. The first version of that jumped one
    beat's width at a time from an assumed starting point and went flaky on both WebKit
    profiles, reading `card` where it wanted `strip`: where the clock stood when the screen
    mounted was not where it assumed. It now walks in 200ms steps past the end of the
    sequence and asserts the recorded order, which forces a flush between beats (they are
    ≥600ms apart, so no step can merge two) without assuming any baseline at all.
21. **The three new synths were checked by spy count only, not by ear.** There is no audio
    device here. `whoosh` deliberately does not show up in an oscillator count at all — it is
    noise through a buffer source — so what the count proves is `cardPop` and the `tierUp`
    chimes. Worth one listen on a real device.
