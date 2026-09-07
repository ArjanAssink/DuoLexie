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
| Round length | `min(8, eligible words)` | **10 cards**; small pools repeat words (never back-to-back) |
| Reading window | fixed 5 s | **10 s for a new word**, shorter every time she has read it correctly (§3) |
| When she hears the word | only if the bar runs out; swiping early skips it | **always**, after the bar runs out (or after she taps *Klaar!*, §3) |
| When she can grade | any time | **only after she has heard it** — the card is locked until then |
| Grading gesture | swipe left/right, card vanishes | swipe (or tap) the card onto a **visible pile**; piles grow, show counts |
| Feedback | 2-note blip / fart buzz | ding + mini-confetti on *Goed!*; soft "boing" + replay on *Nog even*; haptics; Frida reacts |
| Streak | none | 3 *Goed!* in a row → Bliksemsprint (reuse `components/Bliksemsprint.tsx`) |
| Gems | flat 10 (+5 perfect) | **5 for finishing + 1 per correct word + 3 perfect** → 5…18 for a 10-card round (§6) |
| Reward screen | "Goed gedaan! +10" | both piles counted ("7 van de 10 goed!"), gems count up one by one |
| Word audio | browser TTS | Arjan's own recordings for a starter set of ~20 words, TTS fallback for the rest (§7) |

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
- The card is **not draggable** yet. Touching it does nothing except, optionally, the *Klaar!*
  tap (§3). Piles are dimmed (opacity ~0.5) to signal "not yet".

### Phase 2 — Luisteren (listening)

Triggered when the fuse runs out (or on *Klaar!*).

- The fuse bar is replaced by a **speaker + sound-wave** strip in the same slot (three bars
  bouncing), the card gives a gentle side-to-side wobble (±2°) for the duration of the clip.
- The word is spoken: `playWord(id, text)` — Arjan's recording when present, TTS otherwise.
- Frida tilts to `head-sleepy` reused as a "listening" pose (eyes half closed, attentive);
  bubble says **"Luister…"**. If that reads wrong on screen, a dedicated `head-listening`
  SVG is a small art task — flagged in §9, not blocking.
- Nothing is tappable during the clip except ✕.

### Phase 3 — Sorteren (judging)

Triggered when the clip ends.

- The card **lifts**: shadow grows from `0 8px 0` to `0 14px 0`, scale 1.04, and it settles
  into a very slow idle float (±3 px, 3 s loop) so it visibly "wants" to be picked up.
- A **🔊 replay button** appears under the card: "Nog eens horen". She is judging *by ear*,
  so hearing it again must always be one tap away. Replaying does not affect timing or score.
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
  §8) — plus a small confetti puff from the pile (`canvas-confetti`, `particleCount: 18`,
  `spread: 50`, origin at the tray), haptic `12`. Frida hops to `happy`.
- **Nog even**: the existing playful fart-buzz stays (plan.md §2 decision), haptic
  `[10, 40, 10]`, and — as today — the word is **spoken once more** as reinforcement while the
  card settles on the pile. Frida goes `head-grumpy` for a beat, then back to `happy`; the
  bubble says **"Bijna! Nog een keer luisteren."** No red flash, no "fout" text anywhere.
- Streak: the third consecutive *Goed!* fires **Bliksemsprint** exactly like Tijdrit does
  (`streak.current === STREAK_FOR_BURST`). The band measures the gap between the header and
  the card via the selector `.flash-card, .game-stage > *:nth-child(2)` — give `.word-card`'s
  arena a `.flash-card`-equivalent hook (or widen that selector) so the coach row added in §4
  doesn't make it measure the wrong element.
- ~350 ms after landing the next card deals in (phase 1 again). Total dead time between
  cards stays under a second; the game must never feel like it is waiting on animations.

### End of round

After the tenth card lands, a short beat (~600 ms) so the last landing reads, then the reward
screen (§6).

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

- **Within-round repeats** (when the eligible pool has fewer than 10 words): the second
  appearance in the same round uses the next-shorter window if the first was *goed*, so even
  the very first lesson (5 eligible words, §7) shows the mechanic working.
- Constants live in one place (`engine/readingWindow.ts`, `windowForBox(box)`), unit-tested,
  and replace the fixed `READ_WINDOW_MS`. The EWMA-based formula in reading-mechanics.md §2
  stays a *later* refinement: the ladder is easier to explain to her ("you know this one, so
  it goes faster") and needs no calibration period.

**Recommended addition — the *Klaar!* tap.** With a 10 s window, a word she reads in one
second means nine seconds of watching a bar. Recommendation: during phase 1 a single tap on
the card means "I said it" — the fuse snaps out (short flash), the clip plays immediately, and
we record how long she took. That timing is what promotes the word to the next box
(`withinWindow: true`); a card that runs out on its own records `withinWindow: false` and
holds its box, exactly as reading-mechanics.md §3 already specifies. Without the tap there is
no speed signal at all and the window can never shorten. It is one tap, on the thing she is
already looking at, and it is optional — never tapping is always allowed.

This is the one place the plan deviates from the request as spoken ("you hear it after the
time runs out"); the time does still run out, she can just end it early. **Decision for Arjan:
keep or drop the tap.** If dropped, `withinWindow` is always `false`, boxes never promote, and
the ladder needs a different signal (e.g. promote on any *goed* read) — noted so the choice
is made knowingly.

---

## 4. Screen layout and visual design

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

## 5. Sound design

All effects stay WebAudio-synthesised (`audio/audio.ts playEffect`) so nothing needs assets:

| Moment | Sound |
|---|---|
| card deals in | soft short "swish" (filtered noise burst, 90 ms, low volume) |
| fuse ends / *Klaar!* | tiny "pop" then the word clip |
| *Goed!* lands | **ding**: sine 1046 Hz + 2093 Hz partial, 0.6 s decay, slight pitch rise on the first 30 ms — bright, bell-like, distinct from the 2-note `good` blip Tijdrit uses |
| *Nog even* lands | existing fart-buzz (unchanged), then the word replayed |
| Bliksemsprint | whatever Tijdrit already plays |
| round end | existing `fanfare` |
| gem count-up | short "tick" per gem, pitch stepping up (C5 → E5 → G5 …) |

No sound plays during phase 1 except *Klaar!*. iOS needs a user gesture before WebAudio
resumes: the first ✕/tap already provides it in practice, but resume `audioCtx` explicitly on
the first pointerdown in the game to be safe.

---

## 6. Gems and the reward screen

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

## 7. Word recordings

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

## 8. Implementation plan

Work in the order below; each step builds, passes `npm run build`, `npm test`, and
`npx playwright test --project=desktop` from `app/`, and gets its own commit. The game is
already on the `/#/proberen` test menu, so every step is playable immediately.

### Step 1 — Mechanics: phases, window ladder, ten cards
- `engine/readingWindow.ts`: `windowForBox(box: WordBox): number` + tests.
- `HardopLezen.tsx`: introduce an explicit phase state
  `'dealing' | 'reading' | 'listening' | 'judging' | 'flying'`; the card is inert outside
  `judging` (and `reading` for *Klaar!*); narration always plays at the end of `reading`;
  replay button in `judging`; within-round repeat bookkeeping for the shorter window.
- `exerciseSelector.buildWordExercises`: 10 cards, repeats when the pool is short (no
  adjacent duplicates), prefer words with recordings once the manifest exists (step 4).
- `data/path.ts`: `exerciseCount` for Lezen nodes → 10.
- `WordResult.withinWindow` now means "tapped *Klaar!* before the fuse ran out".
- Update `tests/e2e/reading-window.spec.ts`: swiping before narration must *not* grade;
  narration always fires; the *Klaar!* tap fires it early.

### Step 2 — Piles, flight, sounds, Frida
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

### Step 3 — Gems and reward screen
- `computeReward` word-based branch + tests; reward screen with pile summary, chips, count-up.
- `docs/reading-mechanics.md` §1 rewritten to describe the new flow; §6 "does goed-but-slow
  earn gems" answered: yes, gems count *goed*, the box holds — two different systems on purpose.

### Step 4 — Recordings
- Studio word mode; manifest; selection preference; Arjan records the 20 starter words;
  convert and commit mp3s; `todo.md` updated.

### Step 5 — Polish pass on her devices
- Playwright screenshots on iPad Pro 11 and iPhone 13 per ux-backlog.md method: card size,
  pile tap targets ≥ 44 px, nothing overlapping Bliksemsprint's band, font-swap reflow.
- Watch her play one round. Adjust window ladder constants and animation timings from that,
  not from taste.

### Files touched
`app/src/games/HardopLezen.tsx` (largely rewritten), `app/src/engine/readingWindow.ts` (new),
`app/src/engine/exerciseSelector.ts`, `app/src/engine/reward.ts`, `app/src/screens/GameScreen.tsx`,
`app/src/audio/audio.ts`, `app/src/data/path.ts`, `app/src/state/progress.ts` (one settings
flag), `app/src/dev/RecordingStudio.tsx`, `app/src/words.ts` (recording manifest),
`app/src/theme.css`, `app/tests/e2e/*.spec.ts`, `shared/src/types.ts` (only doc comments;
no shape change — `WordResult`/`WordStats` already carry everything needed, so no store
migration).

---

## 9. Decisions for Arjan

1. **Keep the *Klaar!* tap?** (§3) Recommended yes. Dropping it removes the speed signal.
2. **Fuse visible?** Recommended yes, with the no-tick, colour-only pressure described. If
   she freezes on it, hide the bar and keep the timing invisible — one CSS class.
3. **Do *nog even* words come back at the end of the round?** Recommended **no** for now
   (existing decision: a read-through, not a drill loop); the box system brings them back
   next session anyway. Easy to add later as a "nog één keer?" bonus card set.
4. **Frida listening pose:** reuse `head-sleepy`, or spend twenty minutes on a
   `head-listening` SVG (ear up, eyes on the card)? Not blocking.
5. **Recording list:** the 20 words in §7, or a different set? Recording happens on Arjan's
   machine in Chrome; nothing else in the plan waits on it.
