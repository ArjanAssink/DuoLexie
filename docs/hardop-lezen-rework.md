# Hardop lezen rework: read → listen → sort

Plan for turning **Hardop lezen** (the word-flashing game) from a bare swipe card into a
round-based game that feels like a game: a word appears, a fuse burns down while she reads it
aloud, she hears the word, and then she sorts the card onto the *Goed!* pile or the *Nog even*
pile with a satisfying swipe. Ten cards a round, gems scaled to how many landed on the right
pile, always something earned.

This document is the design + implementation plan. [reading-mechanics.md](reading-mechanics.md)
stays the reference for *why* the reading window exists and how words are spaced; this file
replaces its §1 flow description once built. [plan.md](../plan.md) §2 keeps the one-paragraph
game description.

**Status:** designed, not built. Nothing below is implemented yet.

---

## 1. What changes, in one table

| | Today (`HardopLezen.tsx`) | After the rework |
|---|---|---|
| Round length | `min(8, eligible words)` | **10 cards, 10 different words** (at most one duplicate when the pool has only 9 — never a full second pass); the pool is widened so this is rare (§4) |
| Reading window | fixed 5 s | **10 s for a new word**, shorter every time she has read it correctly (§3) |
| When she hears the word | only if the bar runs out; swiping early skips it | **always**: when the bar runs out, or earlier when she taps **Laat horen** (§3) |
| When she can grade | any time | **only after she has heard it** — the card is locked until then |
| Grading gesture | swipe left/right, card vanishes | swipe (or tap) the card onto a **visible pile**; piles grow, show counts |
| Feedback | 2-note blip / fart buzz | ding + mini-confetti on *Goed!*; soft "boing" + replay on *Nog even*; haptics; Frida reacts |
| Streak | none | 3 *Goed!* in a row → Bliksemsprint (reuse `components/Bliksemsprint.tsx`) |
| Gems | flat 10 (+5 perfect) | **5 for finishing + 1 per correct word + 3 perfect** → 5…18 for a 10-card round (§7) |
| Reward screen | "Goed gedaan! +10" | both piles counted ("7 van de 10 goed!"), gems count up one by one |
| Word audio | browser TTS | Arjan's own recordings for a starter set of ~20 words, TTS fallback for the rest (§8) |

Currency note: the app has one currency, **edelstenen/gems** (plan.md §12 decided against a
second "coins" balance). Everywhere this document says gems, read "the coins she earns".

---

## 2. The round, phase by phase

A round is 10 cards. Each card goes through the same four phases. The whole screen is designed
around making the phase she is in unmistakable without reading any instructions.

```
  ┌─────────────────────────────────────────┐
  │ ✕        ● ● ● ● ○ ○ ○ ○ ○ ○            │  header: quit + 10 pips (cards done)
  │                                         │
  │   🐶  "Lees maar!"                      │  Frida + speech bubble = the prompt
  │                                         │
  │        ┌───────────────────┐            │
  │        │                   │            │
  │        │       kat         │            │  the card (Baloo 2, huge)
  │        │                   │            │
  │        │ ▓▓▓▓▓▓▓▓▓░░░░░░░░ │            │  fuse bar on the card's bottom edge
  │        └───────────────────┘            │
  │                                         │
  │   ┌─────────┐             ┌─────────┐   │
  │   │ NOG EVEN│             │  GOED!  │   │  the two piles (trays), counts on top
  │   │  ▭▭ 1   │             │  ▭▭▭ 3  │   │
  │   └─────────┘             └─────────┘   │
  └─────────────────────────────────────────┘
```

### Phase 1 — Lezen (reading)

- The card deals in from the top of the deck: a quick scale-up + settle (~260 ms, spring-ish
  ease), face up. No spinner, no delay; the word must be readable the instant it lands.
- The **fuse bar** along the card's bottom edge starts full and drains left→right over the
  window (§3). It is *part of the card*, not a separate widget, so her eyes never leave the
  word. Colour shifts as it drains: teal → orange over the first ~70%, orange → red-orange over
  the last ~30%. In the last 2 seconds the card does a slow, soft "heartbeat" scale pulse
  (1.00 → 1.02). **No ticking sound** — a countdown noise is the kind of pressure design
  principle 5 (low frustration) rules out; the colour and pulse are enough.
- Frida (small, top-left) is `happy`, bubble says **"Lees maar!"**
- Under the card sits one big button: **🔊 Laat horen** (teal, 3D shadow, min 56 px tall).
  Tapping it — or tapping the card itself — ends the fuse early and reveals the word by
  playing it (§3). It is the only control in this phase.
- The card is **not draggable** yet. Piles are dimmed (opacity ~0.5) to signal "not yet".

### Phase 2 — Luisteren (listening)

Triggered when the fuse runs out, or when she taps *Laat horen*.

- The fuse bar is replaced by a **speaker + sound-wave** strip in the same slot (three bars
  bouncing), the card gives a gentle side-to-side wobble (±2°) for the duration of the clip.
  The *Laat horen* button presses in and greys out while the clip plays, then becomes the
  **Nog eens** replay button of phase 3 — same slot, so nothing jumps around.
- The word is spoken: `playWord(id, text)` — Arjan's recording when present, TTS otherwise.
- Frida tilts to `head-sleepy` reused as a "listening" pose (eyes half closed, attentive);
  bubble says **"Luister…"**. If that reads wrong on screen, a dedicated `head-listening`
  SVG is a small art task — flagged in §10, not blocking.
- Nothing is tappable during the clip except ✕.

### Phase 3 — Sorteren (judging)

Triggered when the clip ends.

- The card **lifts**: shadow grows from `0 8px 0` to `0 14px 0`, scale 1.04, and it settles
  into a very slow idle float (±3 px, 3 s loop) so it visibly "wants" to be picked up.
- The button under the card now reads **🔊 Nog eens**. She is judging *by ear*, so hearing
  it again must always be one tap away. Replaying does not affect timing or score.
- Piles light up to full opacity, each with its label and current count. Frida is `sass`,
  bubble: **"Was het goed?"**
- **Idle hint:** if she hasn't touched the card for ~2.5 s, it does a small nudge left, then
  right (translate ±14 px with the stamps peeking in) — a wordless "swipe me" for the first
  rounds. The hint stops appearing after she has sorted 5 cards in her lifetime (persisted
  in the progress store's `settings`, not per round).
- **Two ways to sort**, both first-class:
  1. **Drag** the card (existing pointer logic: `setPointerCapture`, `activePointerId`
     guard, `onPointerCancel` reset — keep all of it). Card follows the finger with rotation
     `dragX / 18`. The pile under the drag direction **scales to 1.08 and brightens**, its
     label bolds, and the matching stamp (GOED! / NOG EVEN) fades in over the card exactly as
     today. Release past `SWIPE_THRESHOLD` (90 px) commits; short of it, the card springs
     back (`transform 0.32s cubic-bezier(.2,1.4,.4,1)` for a little overshoot).
  2. **Tap a pile.** The trays are `<button>`s. Tapping *Goed!* or *Nog even* commits the same
     way as a swipe. This is what makes the game playable with a mouse on the desktop build
     and by a child who never discovers swiping; it also gives the e2e tests a deterministic
     path that doesn't depend on pointer geometry.
- Also accepted: keyboard ← / → for desktop testing.

### Phase 4 — Vliegen (the card lands)

On commit:

- The card **flies** to its pile: a ~420 ms transform from its current position to the pile's
  centre (measured via `getBoundingClientRect` at commit time, so it's correct on every
  viewport), scaling down to the tray's mini-card size (~0.28) and rotating to a random
  ±6° so the stack looks hand-dealt. Slight arc: `translateY` dips by 24 px mid-flight via a
  two-step keyframe.
- **Landing**: the pile does a squash (`scaleY .92 → 1`, 180 ms), a new mini-card is
  appended to its stack (offset 2 px per card, capped visually at 5 visible, count badge
  keeps the true number), and the badge bumps (`scale 1.3 → 1`).
- **Goed!**: a proper **ding** — a two-partial bell (`playEffect('ding')`, new WebAudio voice,
  §6) — plus a small confetti puff from the pile (`canvas-confetti`, `particleCount: 18`,
  `spread: 50`, origin at the tray), haptic `12`. Frida hops to `happy`.
- **Nog even**: the existing playful fart-buzz stays (plan.md §2 decision), haptic
  `[10, 40, 10]`, and — as today — the word is **spoken once more** as reinforcement while the
  card settles on the pile. Frida goes `head-grumpy` for a beat, then back to `happy`; the
  bubble says **"Bijna! Nog een keer luisteren."** No red flash, no "fout" text anywhere.
- Streak: the third consecutive *Goed!* fires **Bliksemsprint** exactly like Tijdrit does
  (`streak.current === STREAK_FOR_BURST`). The band measures the gap between the header and
  the card via the selector `.flash-card, .game-stage > *:nth-child(2)` — give `.word-card`'s
  arena a `.flash-card`-equivalent hook (or widen that selector) so the coach row added in §5
  doesn't make it measure the wrong element.
- ~350 ms after landing the next card deals in (phase 1 again). Total dead time between
  cards stays under a second; the game must never feel like it is waiting on animations.

### End of round

After the tenth card lands, a short beat (~600 ms) so the last landing reads, then the reward
screen (§7).

### Quitting

✕ at any point returns to the path without crediting — the existing `cancelled` ref pattern
covers every `await` in the commit path, and `GameScreen.handleComplete`'s `credited` guard
stays as the backstop. Pending audio is cancelled (`speechSynthesis.cancel()` / pause the
clip) on unmount.

---

## 3. The reading window ("the more often you've seen it, the quicker it runs out")

**Rule:** the window is set by the word's Leitner **box** in `wordStats` (already recorded
per word, see reading-mechanics.md §3/§5), not by raw view count:

| Box | Meaning | Window |
|---|---|---|
| 1 | new, or last read was *nog even* | **10 s** |
| 2 | read correctly once (in time) | 7 s |
| 3 | twice | 5 s |
| 4 | three times | 3.5 s |
| 5 | four+ times — effectively automatic | 2.5 s |

Why box rather than "times seen": a box only goes up on a *goed* read inside the window and
drops back to 1 on *nog even*. So the fuse gets shorter as the word becomes automatic for
her, and a word she struggled with gets its full 10 seconds back instead of getting *harder*
after a miss. That matches "the more often you've seen it" in every case that matters and
avoids the one case where it would punish her.

- Constants live in one place (`engine/readingWindow.ts`, `windowForBox(box)`), unit-tested,
  and replace the fixed `READ_WINDOW_MS`. The EWMA-based formula in reading-mechanics.md §2
  stays a *later* refinement: the ladder is easier to explain to her ("you know this one, so
  it goes faster") and needs no calibration period.

**The *Laat horen* button (decided).** With a 10 s window, a word she reads in one second
would mean nine seconds of watching a bar. So during phase 1 she can tap **Laat horen** (or
the card): the fuse snaps out with a short flash and the word is revealed by playing it
immediately. The time until that tap is the speed signal: it is recorded as
`withinWindow: true` and promotes the word to the next box; a card whose fuse runs out on its
own records `withinWindow: false` and holds its box, exactly as reading-mechanics.md §3
already specifies. Never tapping is always allowed — the fuse running out leads to the same
listening phase.

---

## 4. Which words a round draws from

**Rule: 10 cards means 10 different words.** A round may contain at most one duplicate, and
only when the pool genuinely has just 9 words; it never runs the same words twice. To make
that possible the pool a Lezen node draws from is **widened** rather than the round shortened.

Today `wordsForPool(lesson.soundPool)` is strict: a word is eligible only if *every* klank in
it has been introduced. On the path that gives the first Lezen node (`fase1-m-s-k-r-t-l5`)
just 5 words and the next one 24:

| Cumulative pool after unit | Eligible words (strict) |
|---|---|
| De klinkers + m·s·k·r·t | 5 — kat, tas, mat, kok, kus |
| + n·p·b·d·f | 24 (incl. limonade, katapult, trampoline, dromenland) |
| + g·h·j·l + v·w·z | 38 |

**Widening, in order, until ≥ 9 unique words (10 preferred):**

1. Strict pool (as today), shortest words first.
2. **Look ahead one unit** on the path: allow words whose klanken are all in the cumulative
   pool *plus the next unit's sounds*. A word one unit ahead is still built from the klank
   category she is working in; reading it early is a preview, not a jump.
3. Look ahead a second unit, then the rest of the same fase.
4. If a fase still comes up short, the node is not generated (`MIN_WORDS_FOR_LEZEN` becomes 9
   and is measured on the *widened* pool).

The look-ahead happens in `data/path.ts` when the Lezen lesson is built (it already has the
unit order in hand), so the lesson carries the widened `soundPool` and nothing downstream
changes: `buildWordExercises` keeps its shortest-first bias and draws 10 **distinct** ids.
`exerciseCount` is `min(10, eligible)`; only a 9-word pool yields one word twice, never
adjacent.

**Growing the dictionary is the other half.** 38 short words across all of fase 1 is thin
for a game that shows 10 per round several times a week. Which extra words to add, and from
which level (more 3-letter mkm words, 4-letter cluster words like *stok/kast*, two-syllable
words), is **a decision to take together** once the round itself is testable — see §10. The
`reviewed: false` words already in `words.json` (the Hangman import) are the cheapest first
source.

**Proefronde: a pool for trying it with her now.** The `/proberen` menu gets a **Proefronde**
entry that launches Hardop lezen on a synthetic lesson (`lessonById('proef-hardop-lezen')`)
whose pool is *all* fase-1 sounds (kort + medeklinkers → the 38 words above, shortest first).
It ignores where she is on the path, so the interaction can be tried with her right away
without the level being right yet; it credits gems like any lesson, which is fine for a test.

---

## 5. Screen layout and visual design

Design language follows the existing tokens (`theme.css :root`, from
`art/design_handoff_leerpad/README.md`): warm `--bg`, Baloo 2 for the word, Nunito for UI,
hard 3D shadows (`0 Npx 0 <shadow-colour>`) on every pressable thing, Duolingo as the
reference feel (ux-backlog.md standing note).

- **Header** (`.game-header`, unchanged height): ✕ left; the progress track becomes **10
  pips** (`.round-pips`, 10 × 12 px circles, done = `--teal`, current = `--teal-ring` pulsing,
  todo = `--hairline`). Ten discrete cards read better as pips than as a bar, and they match
  the "ten words" framing. Tijdrit/Flitsen keep their bar.
- **Frida + bubble** (`.coach`): Frida head at ~64 px, speech bubble (white, `border-radius
  16px`, hard shadow `0 3px 0 var(--hairline)`, a small tail toward Frida) with the phase
  prompt in Nunito 800 16 px. Bubble text swaps with a 120 ms fade. On phones under 600 px
  tall the coach row collapses to just the bubble to protect card size.
- **Card** (`.word-card`): white, `border-radius 24px`, `min(80vw, 340px)` wide, aspect ~1.5:1,
  word in Baloo 2 800 `clamp(40px, 13vw, 72px)`, `letter-spacing` follows the dyslexia-font
  toggle as elsewhere. Fuse bar: 10 px strip inset 14 px from the card's bottom edge, rounded,
  background `--hairline`, fill animated via `transform: scaleX` (GPU path, same as the
  existing `.read-timer-fill`), colour via a CSS variable driven by the same keyframes.
- **Deck hint**: two faint card outlines peeking 6 px and 12 px behind the live card (static
  `::before/::after`) so it reads as "cards from a deck", and the deal-in animation has
  somewhere to come from. They disappear when ≤2 cards remain.
- **Piles** (`.pile`, two `<button>`s in a row under the card, `gap 24px`):
  - Tray: 132 × 96 px, `border-radius 18px`, 3D shadow. *Nog even* = `--orange` with
    `--orange-shadow` (warm, not red — it's "not yet", not "wrong"); *Goed!* = `--teal` with
    `--teal-shadow`, label turns gold-badged at 10/10.
  - Inside: up to 5 stacked mini-cards (white, 40 × 28 px, each offset 2 px and rotated
    ±3°), a count badge top-right (white circle, Nunito 900), label under the tray in
    Nunito 900 14 px matching the tray colour.
  - States: dimmed (phase 1–2), ready (phase 3), targeted (during drag toward it: scale 1.08,
    brighter), landing (squash).
- **Stamps** (GOED! / NOG EVEN): keep the existing rotated bordered stamps, they work; move
  them to sit over the card corners rather than the arena corners.
- **Replay button**: pill under the card, `--teal-pill` background, speaker icon + "Nog eens",
  min 48 px tall (tap-target rule from ux-backlog.md).
- **Tablet/desktop**: everything stays inside the centred 480 px app card; piles scale with
  `clamp()` on height so the layout works on iPad Pro 11 portrait, iPhone 13 and a desktop
  window — the three Playwright projects.
- **Reduced motion** (`prefers-reduced-motion: reduce`, existing blocks in `theme.css`): no
  idle float, no heartbeat, no nudge hint, flight becomes a 150 ms fade to the pile, confetti
  off. Sounds unaffected.

---

## 6. Sound design

All effects stay WebAudio-synthesised (`audio/audio.ts playEffect`) so nothing needs assets:

| Moment | Sound |
|---|---|
| card deals in | soft short "swish" (filtered noise burst, 90 ms, low volume) |
| fuse ends / *Laat horen* | tiny "pop" then the word clip |
| *Goed!* lands | **ding**: sine 1046 Hz + 2093 Hz partial, 0.6 s decay, slight pitch rise on the first 30 ms — bright, bell-like, distinct from the 2-note `good` blip Tijdrit uses |
| *Nog even* lands | existing fart-buzz (unchanged), then the word replayed |
| Bliksemsprint | whatever Tijdrit already plays |
| round end | existing `fanfare` |
| gem count-up | short "tick" per gem, pitch stepping up (C5 → E5 → G5 …) |

No sound plays during phase 1 except *Laat horen*. iOS needs a user gesture before WebAudio
resumes: the first ✕/tap already provides it in practice, but resume `audioCtx` explicitly on
the first pointerdown in the game to be safe.

---

## 7. Gems and the reward screen

`engine/reward.ts computeReward` gains a game-aware branch. For `hardop-lezen` the per-klank
`answers` array is the wrong unit (a 5-letter word contributes 5 records, so "perfect" and
counts skew toward long words); use `wordResults`:

```
finish bonus      5        (always — even 0/10 earns something, as requested)
per correct word  +1       (0…10)
perfect round     +3
                  ─────
                  5 … 18   (Tijdrit today: 10, +5 perfect, +10 record — comparable range)
```

`xp` stays `10 + correct words`. Every other game's formula is untouched. Unit tests in
`reward.test.ts` cover 0/10, 7/10 and 10/10.

**Reward screen** (`GameScreen`'s reward branch, extended rather than replaced):

- Frida `head-celebrating` for ≥8/10, `happy` otherwise. Never a sad Frida here.
- Headline: "Perfect!" (10/10), "Goed gedaan!" (≥5), "Lekker geoefend!" (<5).
- The two piles reappear side by side as a summary: **"7 goed · 3 nog even"**, with the
  *nog even* words listed as small chips (she and a parent can see which ones to practise;
  tapping a chip replays its clip).
- Gems: the 💎 counter counts up from 0 to the earned total, one gem per ~90 ms with the tick
  sound, then the perfect bonus lands as a separate "+3 ✨ perfect!" line if applicable.
- "Verder" button as today. Confetti volume scales with correct count (`particleCount:
  40 + 18 * correct`).

---

## 8. Word recordings

The self-check only works if she hears a real voice. Plan: Arjan records a starter set;
everything else keeps the TTS fallback until recorded.

**Which words first.** The first Lezen node on the path is `fase1-m-s-k-r-t-l5` (pool: a e o
u i + m s k r t), which has exactly **5** eligible words. The next unit's node has 24. The
short (3-letter) words readable by the end of the third unit make a natural starter set of
**20**:

| Unit | Words |
|---|---|
| m·s·k·r·t (5) | kat, tas, mat, kok, kus |
| n·p·b·d·f (+15) | bal, pan, dak, bed, pen, les, pot, bos, top, bus, put, pil, dik, kip, rib |

Next 8 when there is time (g·h·j·l + v·w·z): jas, zak, hek, vel, hok, hut, vis, wip.

**Recording flow** — extend the existing dev-only studio rather than build a new one:

1. `dev/RecordingStudio.tsx` gets a **mode switch** (Klanken / Woorden). Word mode lists
   words instead of sounds, ordered by the path (unit order, then length), with a
   "starter set" filter at the top so the 20 above are the default view. Saves
   `{wordId}.webm` into the chosen folder (pick `app/public/audio/words`). Same one-mic-stream,
   auto-advance, replay controls; same File System Access requirement (Chrome/Edge).
   Route stays `/#/opnemen` (`?mode=woorden` or a toggle in the header).
2. `node tools/convert-audio.mjs app/public/audio/words` — the script already takes a
   directory argument; no change needed. Commit the mp3s.
3. **Manifest so the game knows what exists**: a small Vite glob
   (`import.meta.glob('/public/audio/words/*.mp3')` at build time, or a generated
   `recorded-words.json` written by `convert-audio.mjs`) → `hasWordRecording(id)`. Used to
   (a) show ✅ in the studio and (b) let `buildWordExercises` **prefer recorded words** when
   filling a round, so the first rounds she plays are in Arjan's voice, TTS only appearing once
   the recorded pool is exhausted.
4. Recording tips in the studio UI: say the word once, naturally, ~1 s of room before and
   after; `convert-audio.mjs` trims and normalises to −16 LUFS like the sound clips.

`generate-word-audio.mjs` (bulk TTS) stays available as the fallback path for the other ~140
words; that decision (todo.md "stem/backend kiezen") is unaffected by this plan.

---

## 9. Implementation plan

**Goal of the first two steps: a round Arjan can play with her.** Steps 1 and 2 together are
the first testable build — the full read → listen → sort loop, piles, sounds and the
Proefronde entry — running on browser TTS with the fase-1 word pool. Recordings, the gem
formula and level tuning come after that first play-test, so what she says about the
interaction can still change them.

Each step builds, passes `npm run build`, `npm test`, and
`npx playwright test --project=desktop` from `app/`, and gets its own commit. The game is
already on the `/#/proberen` test menu, so every step is playable immediately.

### Step 1 — Mechanics: phases, window ladder, ten distinct words, Laat horen
- `engine/readingWindow.ts`: `windowForBox(box: WordBox): number` + tests.
- `HardopLezen.tsx`: explicit phase state
  `'dealing' | 'reading' | 'listening' | 'judging' | 'flying'`; the card is inert outside
  `judging`; **Laat horen** (button + card tap) ends `reading` early; narration always plays
  at the end of `reading`; the same button becomes **Nog eens** in `judging`.
- `data/path.ts`: widened Lezen pool via unit look-ahead (§4), `MIN_WORDS_FOR_LEZEN` 9,
  `exerciseCount` 10; synthetic `proef-hardop-lezen` lesson resolvable by `lessonById`.
- `exerciseSelector.buildWordExercises`: 10 distinct ids, one non-adjacent duplicate only
  when the pool has 9; tests for both cases.
- `WordResult.withinWindow` now means "tapped *Laat horen* before the fuse ran out".
- `TestMenuScreen`: **Proefronde** entry.
- Update `tests/e2e/reading-window.spec.ts`: swiping before narration must *not* grade;
  narration always fires; *Laat horen* fires it early.

### Step 2 — Piles, flight, sounds, Frida → **first play-test with her**
- `.pile` buttons with stacks and counts; tap-to-sort; keyboard arrows.
- Fly-to-pile animation measured against the real pile rect; landing squash; badge bump.
- `playEffect('ding' | 'swish' | 'pop' | 'tick')` voices in `audio.ts`.
- Coach row: Frida expression + bubble per phase.
- Streak → `Bliksemsprint`.
- Idle nudge hint with the lifetime "sorted 5 cards" cutoff in `progress.settings`.
- Reduced-motion variants for every new animation.
- New `tests/e2e/hardop-lezen.spec.ts`: full 10-card round via pile taps, pile counts,
  reward numbers; a drag-based sort on Chromium; ✕ mid-flight still credits nothing
  (extend `quit-mid-animation.spec.ts`).
- Quick screenshot pass on iPad Pro 11 + iPhone 13 so the build she sees isn't broken on
  her devices; the full polish pass is step 5.

### Step 3 — Gems and reward screen
- `computeReward` word-based branch + tests; reward screen with pile summary, chips, count-up.
- `docs/reading-mechanics.md` §1 rewritten to describe the new flow; §6 "does goed-but-slow
  earn gems" answered: yes, gems count *goed*, the box holds — two different systems on purpose.

### Step 4 — Words and recordings
- Decide the extra word levels together (§4, §10); add/review words in `words.json`.
- Studio word mode; manifest; selection preference; Arjan records the 20 starter words;
  convert and commit mp3s; `todo.md` updated.

### Step 5 — Polish pass on her devices
- Playwright screenshots on iPad Pro 11 and iPhone 13 per ux-backlog.md method: card size,
  pile tap targets ≥ 44 px, nothing overlapping Bliksemsprint's band, font-swap reflow.
- Adjust window ladder constants and animation timings from watching her play, not from
  taste.

### Files touched
`app/src/games/HardopLezen.tsx` (largely rewritten), `app/src/engine/readingWindow.ts` (new),
`app/src/engine/exerciseSelector.ts`, `app/src/engine/reward.ts`, `app/src/screens/GameScreen.tsx`,
`app/src/screens/TestMenuScreen.tsx`, `app/src/audio/audio.ts`, `app/src/data/path.ts`,
`app/src/state/progress.ts` (one settings flag), `app/src/dev/RecordingStudio.tsx`,
`app/src/words.ts` (recording manifest), `app/src/theme.css`, `app/tests/e2e/*.spec.ts`,
`shared/src/types.ts` (only doc comments; no shape change — `WordResult`/`WordStats` already
carry everything needed, so no store migration).

---

## 10. Decisions for Arjan

Decided in review: **Laat horen** stays (§3); **no full repeats** in a round, one duplicate at
most, widen the pool instead (§4); **first goal is a play-testable round**, level-correctness
comes later (§9).

Still open:

1. **Which extra words, from which level?** (§4) To look at together after the first
   play-test. Options: more 3-letter mkm words; 4-letter cluster words (*stok, kast, brug*);
   two-syllable words; reviewing the `reviewed: false` Hangman import.
2. **Fuse visible?** Recommended yes, with the no-tick, colour-only pressure described. If
   she freezes on it, hide the bar and keep the timing invisible — one CSS class.
3. **Do *nog even* words come back at the end of the round?** Recommended **no** for now
   (existing decision: a read-through, not a drill loop); the box system brings them back
   next session anyway. Easy to add later as a "nog één keer?" bonus set.
4. **Frida listening pose:** reuse `head-sleepy`, or spend twenty minutes on a
   `head-listening` SVG (ear up, eyes on the card)? Not blocking.
5. **Recording list:** the 20 words in §8, or a different set? Recording happens on Arjan's
   machine in Chrome; nothing else in the plan waits on it.
