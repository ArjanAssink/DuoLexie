# Maak het woord af: choosing between two spellings

Implementation spec for a new game. A word is spoken and shown with its last sound missing
(`hon▢`); two tiles offer the two ways it could be spelled (`d` · `t`); she slides the right
one into the gap. It starts with the two pairs that trip up every Dutch speller, **d/t** and
**cht/gt**, and is built so that a pair is data (ei/ij and au/ou come later without code).

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement.

**Status:** **built** (2026-09-22), by Claude Opus 5 (1M context), session
[01WNvYJ9iJ8uddJbSiCh8jC7](https://claude.ai/code/session_01WNvYJ9iJ8uddJbSiCh8jC7).
Planned by Claude Fable 5.1 (session
[012C52p53S3dATWRG7puuGvK](https://claude.ai/code/session_012C52p53S3dATWRG7puuGvK)) after
four rounds of design questions with Arjan; the decisions those settled are marked
*(decided)* below, the ones still open are collected in §12. It replaces plan.md's v2 row
"Woordenvangst (hear word → tap correct spelling; trains ei/ij, au/ou)".

Everywhere the build departed from this document is marked ***(as built)*** inline, and
§15 collects the departures that are worth reading on their own. The one that matters
most: **fourteen of §6.1's draft words are not in the shipped file**, because their other
spelling is also a real Dutch word — which is this spec's own §6 rule 3.

**Not built, deliberately, and waiting on Arjan:** the seed words are all
`reviewed: false`, so *no spelling node is on the path yet* — the way in is
`/#/proberen`, which deals the drafts. Reviewing them, the open decisions in §12 and
recording the Spelling set are all his (§12.1, §10).

---

## 1. The idea, and what was considered

Reading is what the app trains; RID's CODE programme has spelling as its fourth pillar, and
the two pairs this starts with are the ones where the *sound* gives no help at all: `hond`
and `hont` are pronounced the same, so are `lucht` and `lugt`. That is why the cue is the
word itself, spoken, and why every item comes with a **strategy** she can call on rather than
a rule she has to remember.

What was considered and rejected, so nobody re-litigates it while building:

- **Two full spellings side by side** (`hond` / `hont`), pick the right one. Direct, and the
  first thing Arjan asked for; dropped because it puts a misspelled word image in front of a
  child with dyslexia on every card, which the methods the app follows avoid. *(decided: one
  stem, two endings; the wrong full word is never spelled out on screen.)*
- **Carry a gem onto the word** you choose. Fun, and the carry mechanic exists
  (docs/flitsen-swipe.md), but it presupposes two full spellings. Kept as the *gesture*: it is
  the tile that is carried, into the gap.
- **Balloons that float away** with the spellings on them. Time pressure; the rest of the app
  deliberately has none outside Tijdrit.
- **Frida walks to the word.** Charming, needs new canonical Frida poses, which are not to be
  redrawn (components/Frida.tsx).
- **Letting her try again** after a miss. With two options the second try is always right and
  teaches nothing. *(decided: show the right one, the word comes back later in the round.)*

---

## 2. A card, beat by beat

```
  ✕        ● ● ● ○ ○ ○ ○ ○ ○ ○           header, unchanged (.round-pips)

   🐶 "Welke past?"                       coach row, Frida + bubble (reuse .coach)

            ┌─────────────────┐  🔊      .spel-card: the stem and the gap, the speaker
            │     hon ▢       │          badge top-right (class reveal-btn, as in Hardop
            │                 │          lezen), the strategy badge bottom-right
            │        Maak langer ↗        │
            └─────────────────┘

              ┌─────┐   ┌─────┐          .spel-tiles: the two endings, big, side by side
              │  d  │   │  t  │
              └─────┘   └─────┘
```

| Beat | What happens | Sound / haptic |
|---|---|---|
| **deal** | card deals in (reuse `.word-card.dealing`, 260ms), tiles rise in under it; the word is **spoken** (`playWord`, recording first, else TTS) | `swish` |
| **choose** | she carries a tile into the gap, flicks it there, or taps it (the tile then slides itself in). The speaker badge replays the word; the strategy badge (§4) may be used freely, before or after choosing, never penalised | — |
| **right** | the tile clicks into the gap, the whole word turns **green** (`--teal`), Frida `head-celebrating` "Lekker!", the word is spoken once more, a small confetti puff of round pieces from the card (the "balloons") | `ding`, `haptic(12)` |
| **wrong** | the tile **bumps against the gap and bounces back to its slot** — it never enters, so `hont` is never formed; the card flashes **red** (`--orange`… see §8 for the exact token), Frida `head-sad` "Bijna! Kijk:"; then the *correct* tile slides in on its own, turns green, and the word is spoken **with its longer form** ("hond… honden"); the strategy bubble opens by itself. The word is queued again three cards later (§5) | `fart`, `haptic([10, 40, 10])` |
| **next** | 900ms after a right answer, 1600ms after a wrong one (she needs to see the correction), the card and tiles slide off and the next deal in | — |

Streak of three right in a row → Bliksemsprint (`components/Bliksemsprint.tsx`), same rule as
Tijdrit and Hardop lezen. Band finder: add `.spel-card`'s parent to its selector list and
check the band clears the card and the tiles on an iPhone 13.

Keyboard, for the desktop: `ArrowLeft` / `ArrowRight` choose the left/right tile, `Space`
replays, `L` opens the strategy bubble.

---

## 3. The gesture

The tile is a carried object exactly like the Flitsen card (docs/flitsen-swipe.md §3), and
the component reuses that pattern rather than inventing one: pointer handlers on the tile
row (not the tile — a tile may re-render mid-drag), `setPointerCapture`, one
`activePointerId`, a `samples` buffer capped at 20 evicting the *second* slot,
`pointercancel` returns the tile.

- **Lift**: past `LIFT_SLOP_PX` (8) the tile lifts (`scale(1.08)`, shadow), and follows the
  finger 1:1 with an inline transform. `haptic(4)`.
- **Over the gap**: when the tile's centre is inside the gap's rect grown by 24px on every
  side, the gap highlights (`.gap.targeted`) and the card lifts a touch. Measured against real
  `getBoundingClientRect`s at lift time, like `measureFlight` in Hardop lezen.
- **Release over the gap** → commit that tile. **Release elsewhere** → the tile springs back
  to its slot (320ms, the Hardop lezen spring curve). **Flick** towards the gap — use
  `resolveDrag(samples, 'y')` from `games/swipe.ts`: a verdict of `-1` (upwards) from a tile
  commits it, since both tiles sit below the card and "up" can only mean "into the word". A
  flick that is mostly sideways springs back.
- **Tap** (no lift): the tile slides itself into the gap over 260ms and commits. Taps are
  never the lesser option; there is no "taught tap" here as in Hardop lezen — the tile
  visibly travelling *is* the demonstration, every time.

The decision "is it over the gap" is a pure function, `overGap(tileRect, gapRect, slackPx)`,
unit-tested; so is `resolveDrag` already.

---

## 4. The strategy badge

*(decided: always available, never penalised.)* Each pair has a `strategy`, and the badge on
the card is that strategy made tappable:

| pair | badge | what it does |
|---|---|---|
| **d/t** | **Maak langer** | **Two steps** *(decided)*. First tap: Frida says "Maak het woord langer. Zeg het maar." and waits — RID's move is that *she* produces the longer word. Second tap, or after `LANGER_REVEAL_MS` (2000) without one: the `langer` form appears under the stem and is spoken: "honden". |
| **cht/gt** | **cht of gt?** | Frida's bubble speaks the pair's `rule`: "Hoor je /cht/? Dan schrijf je cht. Behalve bij een werkwoord met een g: ik lig, hij ligt." For a `gt` word the bubble adds the word's own `langer`: "ik lig". One step; there is nothing for her to produce. |

The badge never affects the score or the streak. After a wrong answer the bubble opens by
itself (§2), straight to the reveal step — the correction is not the moment to quiz her. The
`langer` text is spoken through `utter()` (TTS) until there is a recording; §10 says how
recordings arrive.

*(as built)* Three details §4 did not pin down, settled in the build:

- **One clip per pair, not two.** `<pairId>-regel.mp3` holds whatever that pair's badge
  actually *says*: the question for a `langer` pair ("Maak het woord langer. Zeg het
  maar."), the rule for a `regel` pair. A pair only ever speaks one of them, so a second
  id would be a clip recorded and never played (`spelling.ts` `strategyLine`).
- **A `langer` pair's `rule` is shown, never spoken.** At the reveal step the longer form
  is printed under the stem *and* spoken, and the bubble carries the pair's written rule —
  the reminder behind the question it just asked. Without this the `d-t` pair's `rule`
  field would have had no use in the UI at all.
- **`LANGER_REVEAL_MS` starts when the prompt has finished playing**, not when it starts.
  Two seconds measured from the tap would mean the bubble answered itself while Frida was
  still asking.

**No gate** *(decided)*: she may choose before the word has finished playing. The stem `hon`
is unambiguous to a reader, so the audio confirms rather than reveals, and a fast round stays
fast. This is the one place this game differs from Hardop lezen's read → hear → judge order,
on purpose.

---

## 5. Round, queue and scoring

- A round is **10 items** (`SPELLING_ROUND_SIZE`), drawn from the node's pool (§6) by a pure
  `buildSpellingRound(lesson)` in `engine/exerciseSelector.ts`: distinct words, shortest
  first inside a 2× window, recorded first, the same shape as `buildWordExercises`. A pool of
  fewer than 10 gives a shorter round, never a repeat — the re-queue below is the only source
  of repeats.
- **A miss re-queues the word three positions later** *(decided)*, once. A second miss moves
  on. `requeue(queue, index, wordId, gap = 3)` is pure and unit-tested (including the tail:
  fewer than three cards left → append).
- A word counts as **right only if the first attempt was right**. Results are
  `SpellingResult { wordId, correct }`, a new optional field `spellingResults` on
  `GameResult` — *not* `wordResults`, because `completeLesson` feeds those into the
  reading-speed Leitner boxes (`wordStats`), and how she spells a word says nothing about how
  fast she reads it.
- **Gems**: the reading formula, in its own branch of `computeReward`: `5 + correct + 3 if
  perfect` over the round's *distinct* words; XP `10 + correct`. `perfect` and `newRecord`
  as for reading. The reward screen's stat card works unchanged once `spellingResults` is
  mapped to the shape it reads. Its missed-word chips get one new behaviour *(decided)*: for
  a spelling round a tap speaks the word **and its longer form** — "hond… honden" — so the
  strategy rides along one last time for exactly the words she got wrong. For `cht` words,
  which have no `langer`, the chip speaks the word only.
- **Stats**: `state/progress.ts` gains `spellingStats: Record<wordId, { seen, missed }>`
  (persist version **5**, migration adds `{}`); the selector prefers words she has missed
  before (weight `1 + missed`). Nothing else reads it yet.

*(as built)* Three things this section left open:

- **The pips count distinct words, not cards.** A miss re-queues a word, so the queue grows
  mid-round; if the pips grew with it the bar would get *longer* the worse she did. Ten
  pips, one per word she is scored on, and a re-queued card advances none of them.
- **`spellingStats` lives in `engine/recompute.ts`'s `Aggregates`**, next to `wordStats`,
  so it is folded out of the session log by the same `applySession` that everything else
  is and a replay of two devices' logs reproduces it. The v5 migration still seeds `{}`
  rather than replaying: no session written before v5 carries a `spellingResults` field,
  so the replay would cost a fold over her whole history to produce an empty object.
- **The game reports `answers: []`.** Hardop lezen charges every klank of a word for how
  fast she read it; how she *spells* a word says nothing about any of its klanken, and
  writing one would quietly move her per-sound EWMA on evidence it has no business using.
  `computeReward`'s spelling branch ignores `answers` entirely, and a unit test pins that.

---

## 6. Content model — `shared/curriculum/spelling.json`

Pairs are data; a word's spelling facts sit next to the word list, not inside it:

```jsonc
{
  "pairs": [
    {
      "id": "d-t",
      "title": "d of t?",
      "options": ["d", "t"],          // tile order, fixed: left, right (decided; ArrowLeft/Right follow it)
      "strategy": "langer",           // the badge: 'langer' | 'regel'
      "rule": "Maak het woord langer. Hoor je een d? Dan schrijf je een d.",
      "needs": ["d", "t"]             // klanken that must be taught before the node appears
    },
    {
      "id": "cht-gt",
      "title": "cht of gt?",
      "options": ["cht", "gt"],
      "strategy": "regel",
      "rule": "Hoor je /cht/? Dan schrijf je cht. Behalve bij een werkwoord met een g: ik lig, hij ligt.",
      "needs": ["ch", "g", "t"]
    }
  ],
  "words": [
    { "wordId": "hond", "pair": "d-t", "stem": "hon", "ending": "d", "langer": "honden", "reviewed": false },
    { "wordId": "kast", "pair": "d-t", "stem": "kas", "ending": "t", "langer": "kasten", "reviewed": false },
    { "wordId": "lucht", "pair": "cht-gt", "stem": "lu", "ending": "cht", "langer": null, "reviewed": false },
    { "wordId": "ligt",  "pair": "cht-gt", "stem": "li", "ending": "gt", "langer": "ik lig", "reviewed": false }
  ]
}
```

Rules, all enforced by a unit test over the file (`spelling.test.ts`):

1. `wordId` **must** exist in `shared/curriculum/words.json` — a spelling word is a word, with
   `klanken` (for the pool filter) and a place in the recording order. New words needed here
   go into `words.json` with `reviewed: false`, under the same segmentation rules as the
   last batch (todo.md's "Klif in de woordenlijst gedicht": closed syllables, no open
   syllables, no c/q/x/y).
2. `stem + ending === text`, and `ending` is one of the pair's `options`.
3. **Neither spelling may be a real word unless the item carries a `zin`.** `licht`/`ligt`
   are both words, so the spoken word alone cannot say which is meant. The field `zin` (a
   short sentence, shown under the stem and spoken) is in the schema for that case but **the
   first release ships no `zin` items**: `licht` and `ligt` are simply left out. §12.
4. A `d-t` word **must** have a `langer`; a `cht-gt` word ending in `gt` must have one (its
   `ik`-form); a `cht` word has `null`.
5. Only `reviewed: true` words are dealt — exactly the Weetjes rule. Arjan flips the flag.

*(as built)* Rule 3 is the one that bit. It cannot be checked mechanically — there is no
Dutch dictionary in this repo, and `hard`, `nood` and `liet` are ordinary words that
simply happen not to be on the reading list — so `engine/spelling.test.ts` enforces it in
two halves: a **written-down list** of the pairs found while building (which is the review,
and which keeps a later batch from re-adding one), plus the mechanical check that the wrong
spelling is not itself a word in `words.json`, which catches the case the list cannot — a
word added later that turns an existing item into a homophone pair.

`zin` is present on every word as an explicit `null` rather than left out, the same
convention `weetjes.json` uses and for the same reason: a hand-edited item that forgets a
field should fail the unit test rather than render an empty beat.

### 6.1 Seed content, for review

Drafted, not reviewed; every one goes in with `reviewed: false`. Words already in
`words.json` are marked ✓; the others are additions to it. Verb forms are marked *(ww)*.

**d/t — `d`** (langer = plural or inflected form):
hond→honden ✓, hand→handen ✓, land→landen ✓, kind→kinderen ✓, wind→winden ✓, mond→monden ✓,
tand→tanden ✓, rand→randen ✓, bord→borden ✓, brand→branden ✓, bed→bedden ✓, koud→koude ✓,
blad→bladen ✓, paard→paarden, brood→broden, hoofd→hoofden, eend→eenden, maand→maanden,
vriend→vrienden, hoed→hoeden, draad→draden, oud→oude, rood→rode, goed→goede, breed→brede,
dood→dode, strand→stranden, mand→manden, band→banden ✓ (fietsband ✓ exists; plain `band` is
new), rond→ronde, blond→blonde, held→helden, veld→velden, beeld→beelden, hemd→hemden,
baard→baarden, zwaard→zwaarden, lied→liederen, tijd→tijden, bad→baden.

**d/t — `t`**: kat→katten ✓, mat→matten ✓, pot→potten ✓, put→putten ✓, hut→hutten ✓,
boot→boten ✓, kast→kasten ✓, slot→sloten ✓, plat→platte ✓, sport→sporten ✓, plant→planten ✓,
klant→klanten ✓, krant→kranten ✓, borst→borsten ✓, worst→worsten ✓, poot→poten, voet→voeten,
hart→harten, taart→taarten, kaart→kaarten, noot→noten, straat→straten, gat→gaten, net→netten,
pet→petten, nat→natte, wit→witte, vet→vette, groot→grote, laat→late, heet→hete, zoet→zoete,
tent→tenten, punt→punten, kist→kisten, feest→feesten, beest→beesten, nest→nesten, kust→kusten,
staart→staarten.

Deliberately **not** in: `zand` (no natural longer form), `stad` (steden changes the vowel),
`avond` (open syllable), `geld`, `bloed` (no plural in her world).

**cht/gt — `cht`**: lucht, nacht, zacht, kracht, bocht, vocht, echt, recht, slecht, vlecht,
knecht, gracht, wacht *(ww)*, jacht, dicht, zicht, tocht, vrucht, vlucht, kocht *(ww)*,
dacht *(ww)*, bracht *(ww)*, zocht *(ww)*, lacht *(ww: lachen → cht, the stem has ch)*.

**cht/gt — `gt`** *(all ww; langer = ik-form)*: ligt→ik lig, zegt→ik zeg, legt→ik leg,
draagt→ik draag, vliegt→ik vlieg, zaagt→ik zaag, vraagt→ik vraag, veegt→ik veeg,
buigt→ik buig, zuigt→ik zuig, krijgt→ik krijg, stijgt→ik stijg, zwijgt→ik zwijg,
jaagt→ik jaag, klaagt→ik klaag, weegt→ik weeg, voegt→ik voeg, dreigt→ik dreig.

Excluded: `licht` and `ligt` (rule 3). `juicht` is a `cht` word with a `ch` stem and would
confuse the rule's wording; left out of the first set.

***(as built)*** **Fourteen of the words above are not in `spelling.json`**, because their
other spelling is also a real Dutch word and the item carries no `zin` — rule 3, applied to
this section's own draft:

| word | what the wrong tile would have spelled |
|---|---|
| hart | hard |
| wind | wint |
| veld | velt |
| held | helt |
| paard | paart |
| maand | maant |
| baard | baart |
| lied | liet |
| boot | bood |
| voet | voed |
| noot | nood |
| laat | laad |
| band | bant |
| ligt | licht |

The last is the spec contradicting itself: the `gt` list opens with `ligt→ik lig` and the
paragraph two lines below excludes it. The exclusion is right.

What shipped is **108 words**: 32 `d`, 35 `t`, 24 `cht`, 17 `gt`. Eighty-one of them were
new to `words.json` and were segmented by hand against the multi-letter klanken in
`sounds.json`, under the rules in todo.md's "Klif in de woordenlijst gedicht" — with the
one exception that rule list could not survive here: **vowel digraphs are unavoidable**.
`paard`, `brood`, `vliegt` and `krijgt` are the content this game is about, and the batch
that banned digraphs was a fase-1 batch. Everything else holds: no `c`/`q`/`x`/`y` outside
`ch`, no double consonants, no open syllables, every word one closed syllable.

**Still borderline, and worth a second opinion (§12):** `koud`/`kout` (archaic, "praatje"),
`oud`/`out` (an English loan used in sport), `kaart`/`kaard` (kaarden, to card wool),
`bad`/`bat` (a cricket bat is in Van Dale) and `rand`/`rant`. All five are in the file;
none is a word a nine-year-old is likely to produce, but they are the closest calls.

---

## 7. On the path

*(decided: a spelling node per unit once the pair's letters are known.)* In
`data/path.ts`'s `buildLessons`, after the Lezen node and before the Weetje node, **for each
pair** whose `needs` are all in the unit's cumulative pool and whose readable spelling words
(§6 filter: every klank of the word in the pool, `reviewed: true`) number at least
`MIN_WORDS_FOR_SPELLING` (8):

```ts
{
  id: `${unitId}-spel-${pair.id}`,      // stable: unit sounds + pair id
  unitId, kind: 'les', title: 'Maak het woord af',
  gameType: 'maak-het-woord-af',
  newSounds: [], soundPool: pool, exerciseCount: SPELLING_ROUND_SIZE,
  spellingPair: pair.id,                // new optional Lesson field
}
```

With the seed list, `d-t` first appears on fase 1's third unit (`n · p · b · d · f`, where
`d` and `t` are both known and `mond`, `tand`, `rand`, `bed`, `kat`, `pot`, `kast`, `net`,
`nest`… are readable; `hond` and `hand` wait one more unit for the `h`) and then
on every later unit with a growing pool; `cht-gt` appears on fase 5's `ch · ng · nk` unit.
`GameType` gains `'maak-het-woord-af'`; the compiler then points at every `Record<GameType,…>`
(GameScreen's game map, TestMenuScreen's labels, PathScreen's node icon map) — fill them all
in, no default branch.

`/#/proberen` gets one button per pair with the whole fase-1 (resp. fase-5) pool, like the
Proefronde: the entry Arjan uses to play-test it with her before her path reaches it.

*(as built)*

- The rule is `spellingLessonsFor(unitId, pool, words?)`, **exported** from `data/path.ts`
  with the word set injectable. It has to be: every seed word is `reviewed: false`, so the
  real `path` has no spelling node on it at all, and a test over `allLessons` would be
  asserting the gate rather than the rule. Its test walks the units with the *draft* list
  and pins `fase1-n-p-b-d-f` and `fase5-ch-ng-nk`; a separate test pins that the shipped
  path is empty, which is the line to delete once the review has happened.
- A try-round's pool runs to the end of the **fase** that completes the pair's `needs`,
  not to the unit — derived from `FASE_DEFS` rather than written out, so a third pair gets
  the right pool without anyone remembering to widen a constant.
- The try-rounds deal the **drafts**. They are recognised by `unitId === TRY_UNIT_ID`
  (`'proefronde'`, the id the Proefronde already used), which is the one thing that
  distinguishes "this is a play-test entry" from "this is a node on her path".
- `PathScreen`'s icon map is a `switch` on the lesson *title*, not a `Record<GameType>`, so
  the compiler did not point at it; it gained a `TileIcon` case by hand.

---

## 8. Layout and visual rules

- Inside the existing `.game-screen` / `.game-header` / `.game-stage` frame; header
  identical to Hardop lezen (✕ + `.round-pips`).
- `.spel-card`: the `.word-card` look (white, 24px radius, hairline shadow), `width:
  min(80vw, 340px)`, word in `--font-display` at the `.word-text` size, **letter-spacing
  honouring the dyslexia font toggle** exactly as `.word-text` does. The gap `▢` is a
  dashed box the width of the pair's widest option (`cht`), so the card does not jump when
  the tile lands.
- Tiles: two `.spel-tile` buttons, `min 96×80px`, 44px letters, `--teal` background, white
  text, 16px gap between; row centred under the card with 20px space.
- Right: card border and letters go `--teal`; wrong flash: card border `--orange` for 600ms
  (not red — the app's "nog even" colour is orange, and red is never used on her work).
- Frida coach row reuses `.coach` / `.coach-bubble` / `.coach-frida`.
- **iPhone 13 (390×664) must fit without scrolling**: header 76, coach 100, card 160, tiles
  80, gaps 3×16. Verify with a screenshot, not arithmetic.
- Reduced motion: no tile travel (a chosen tile appears in the gap), no confetti, no lift
  scale; the drag still follows the finger.

*(as built)* Three layout details this section's description made real:

- **The gap's width is a pseudo-element, and so is its dashed box.** `.gap::before` takes
  its text from a `--gap-ghost` custom property, so the widest option reserves the width
  without a single character of it reaching `textContent` — which is what lets the e2e
  suite ask the DOM whether the wrong spelling was ever on screen and get a straight
  answer. The dashed box is `.gap::after`, drawn *outside* the flow: a real border and
  padding added about eighteen pixels of inline width, and a landed word read "tan d".
- **The card reserves the badge's row** (`padding-bottom: 46px`). The badge is positioned
  rather than laid out so the word stays centred whether or not the longer form is
  showing, and without the reserved space the two collided the moment the reveal printed
  `bedden`.
- **A tile shrinks as it travels into the gap.** A tile is 96×80 and the gap is about a
  letter wide; at full size it arrived sitting *over* the word — and, after a miss, over
  the correction she is being shown. It scales to the gap on the way in.

---

## 9. Sounds, haptics, motion

Nothing new in `audio/audio.ts`. `swish` on deal, `ding`/`fart` on the verdict, `pop` when
the strategy bubble opens, the existing `haptic()` calls. Confetti: `canvas-confetti` with
`shapes: ['circle']`, 14 pieces, from the card's centre — the "balloons".

*(as built)* No new *sound*, but one new function: `playSpelling(clipId, lines)`. It is
`playWeetje` pointed at the other folder, and the two now share one body — same clip cache,
same `stopNarration`, same "exactly one thing may ever be speaking" guarantee. The strategy
badge needed that guarantee for the same reason a Weetje beat does: she can tap it twice,
or answer the card, while it is still talking.

---

## 10. Narration and recordings

- The word: `playWord(id, text)` — recording if it exists, TTS otherwise, as everywhere.
- The `langer` form and the pair `rule`: `utter()` (TTS) with the 6s backstop. A recording
  set **"Spelling"** for the studio (`/opnemen`): one cue per `langer` string and one per
  `rule`, written to `app/public/audio/spelling/<wordId>-langer.mp3` / `<pairId>-regel.mp3`,
  addressed through `audio/recorded.ts` like the Weetjes clips. Building the studio set is
  part of this change; recording it is Arjan's.

---

## 11. Tests

Run from `app/`. Unit `npm test`; e2e `npx playwright test --project=desktop`.

**Unit**
- `engine/spelling.test.ts`: `overGap` (inside, at the slack edge, just outside);
  `requeue` (middle, tail shorter than the gap, word already at the end); the
  `spelling.json` rules of §6 over the real file; `buildSpellingRound` (distinct, pool
  smaller than the round, weight of missed words).
- `engine/reward.test.ts`: the spelling branch, 0/10, 7/10, 10/10.
- `data/path` test: `d-t` node first appears on `fase1-n-p-b-d-f`, never on the first two
  units; `cht-gt` first on `fase5-ch-ng-nk`.

**E2E — `tests/e2e/maak-het-woord-af.spec.ts`** (all three projects), on the `/proberen`
entry with a fixture that marks the seed words reviewed:
- *a round is ten distinct words and ends on the reward screen* (taps).
- *carrying the right tile into the gap turns the word green*; *releasing it elsewhere
  springs it back*; *a flick up commits*.
- *a wrong tile bounces, the right one slides in, and the word comes back three cards
  later*: assert the `.word-text` after the bounce never contains the wrong full spelling.
- *the strategy badge prompts first and reveals on the second tap* (narration spy fixture:
  first tap speaks the prompt and no `langer`; second tap speaks "honden"); *after a miss the
  bubble opens straight at the reveal*.
- *a missed-word chip on the reward screen speaks the word and its longer form*.
- *arrow keys choose*.
- `pointer-isolation.spec.ts`: one case, a second finger cannot steal the tile.
- `quit-mid-animation.spec.ts`: one case, quitting during the correction credits nothing
  (same shape as the Hardop lezen case; the wrong-path chain is the longest).

**Selectors that must exist**: `.spel-screen[data-beat]`, `.spel-card`, `.word-text`,
`.gap`, `.spel-tile`, `.reveal-btn`, `.strategy-btn`, `.coach-bubble`, `.pip`, `.pip-done`.
All of them do.

*(as built)*

- The e2e suite drives the **`/#/proberen` try-round** and needs no "mark the seed words
  reviewed" fixture: that entry deals the drafts by design (§7), which is one less thing
  that can drift from the shipped data.
- `fixtures/spellingNarration.ts` serves silence for `/audio/words/` **and**
  `/audio/spelling/` from *one* patch of `HTMLMediaElement.prototype.play` — there is only
  one such method, and a second fixture wrapping the first would hand spelling clips to a
  handler that only knows about words. It also exports the stem→ending map read straight
  out of `spelling.json`, which is how a test answers a card on purpose rather than by luck
  (stems are unique inside a pair, and a unit test pins that).
- The quit-mid-animation case commits by **carry**, not by tap. A tap schedules the tile's
  260ms travel on a `setTimeout`, which the fake clock freezes before `commit` is ever
  reached; releasing the tile over the gap calls `commit` synchronously, so the chain is
  genuinely parked mid-animation with the CSS bump still running. Both new cases were
  checked in the other direction too — the pointer guard and the `quit()` cancellation were
  each stripped out and each test went red.
- The screenshots (`tests/e2e/shots-spelling.spec.ts`, behind `SHOTS=1`, into
  `docs/media/maak-het-woord-af/`) run on **Chromium wearing the iPhone 13 and iPad Pro 11
  descriptors**. WebKit does not run on the machine this was built on — Playwright's host
  check wants libicu/libxml/libflite that Arch does not provide — so the `iphone` and
  `ipad` projects, and with them the real engine, are CI's to confirm.

---

## 12. Decisions for Arjan (not blocking the build)

1. **Review the seed words** (§6.1): flip `reviewed` to true per word. Until then the node
   does not appear on the path; the `/proberen` entry uses the drafts regardless, marked as
   such in its label.
2. **Do the new words also feed Hardop lezen?** They are in `words.json`, so yes by default.
   Verb forms (`ligt`, `zegt`, `kocht`) as reading cards are unusual; if unwanted, a
   `readable: false` flag is a two-line filter in `wordsForPool`.
3. **`licht`/`ligt`** stay out until a `zin` (context sentence) is worth building. Say if
   the cht/gt set feels thin without them.
4. **Balloons**: round confetti from the card (spec) or real CSS balloons drifting up. The
   spec's is a two-line change; the other is an afternoon of animation.

5. ***(as built, new)*** **The five borderline homophones** listed at the end of §6.1 —
   `koud`/`kout`, `oud`/`out`, `kaart`/`kaard`, `bad`/`bat`, `rand`/`rant`. They are in the
   file; say if any of them should follow the other fourteen out.
6. ***(as built, new)*** **Whether the cht/gt set is now too thin.** It lost `ligt`, which
   was its own rule's worked example, and it was already short of §12.3's `licht`. Forty-one
   words is plenty for a round; it is the *`gt`* half — seventeen verbs — that is thin.

Settled in the fourth round of questions and no longer open: the badge is two-step for d/t
(§4), there is no hearing gate (§4), reward chips speak the longer form (§5), tile order is
fixed (§6).

---

## 13. Docs to update in the same change

`todo.md` (Phase 2, one entry in the house style), `plan.md` §game table (retire the
Woordenvangst row in favour of this), `README.md` structure block if `spelling.json` is
mentioned alongside the other curriculum files, and this file's *Status* line with *(as
built)* notes.

*(as built)* All done, except `README.md`: it does not list the curriculum files at all, so
there was nothing to add to. `plan.md`'s structure block did list them, and now names
`words.json`, `weetjes.json` and `spelling.json` instead of the `words/{soundId}.json`
layout that has not existed for a long time.

---

## 14. Out of scope

Typing the ending, more than two options per item, `zin` items, any pair beyond the two
above (they are data, and can follow), a spelling section in the Weetjesboek, and the
recordings themselves. If one of these blocks the work, say so in the commit rather than
fixing it in passing.

*(as built)* None of them blocked it. `zin` came closest — fourteen words wanted one — and
leaving them out rather than building it is what §6 rule 3 asks for.
