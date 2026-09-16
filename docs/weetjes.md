# Weetjes: dyslexia facts as a game, for acceptance

Implementation spec for a new node type on the path — **Weetjes** — that hands her one or
two short, true, encouraging facts about dyslexia in a playable form: hear it, do one small
thing with it, keep it. The goal is not reading practice. It is that a nine-year-old with
dyslexia walks away from the app knowing she is one of many, that her brain is different
and not worse, that people she admires have the same thing, and that she has rights and
tricks. Emotional development and acceptance, in ninety seconds at a time.

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement.

**Status:** planned, not built.

---

## 1. The idea, and what was considered

Four shapes were weighed:

| Shape | Why it's tempting | Why not (alone) |
|---|---|---|
| **Weetjes-kaartjes**: a card with one fact, a 🔊 button, collected in a book | short, collectible, re-readable, parents can browse it | reading a card is passive; nothing to *do* |
| **Waar of niet waar?**: swipe a statement up (waar) or down (niet waar), then the truth | myth-busting *is* the emotional work — "kinderen met dyslexie zijn minder slim" shoved downwards feels good; and she already knows the up/down swipe from Hardop lezen | not every fact is a myth to bust |
| **Wie is het?**: a clue about a famous person, pick the name from three | the most "wow" content for a kid (Spider-Man has dyslexia) | photos are a rights problem; only some facts are about people |
| **Frida vertelt**: Frida narrates a story about *her* dyslexia | a companion who shares it is powerful | a big narrative decision (does the mascot have dyslexia?) — not one to make in a spec; see §11 |

**Recommendation: one node, three card types, one book.** A *Weetjes* node deals 2 cards
(1–3). Every card follows the same three beats — **Luister → Doe → Bewaar** — and differs
only in the *Doe* interaction: swipe **Waar / Niet waar**, tap one of **three keuzes**, or
tap the **name** of the person the clue is about. Every card she has seen lands in a
**Weetjesboek** she can open from her profile, where each card reads itself aloud again.

Text is the enemy here. Rules that hold everywhere (§6): one sentence on screen at a time,
twelve words at most, always a speaker button, narration on by default, options of at most
three words. The interaction is the point; the words are as few as it takes.

---

## 2. A card, beat by beat

```
 Luister                       Doe                            Bewaar
┌──────────────────────┐     ┌──────────────────────┐      ┌──────────────────────┐
│  🧠                  │     │        ▲ Waar         │      │  ✅  Niet waar!       │
│                      │     │  ┌────────────────┐   │      │                      │
│  Dyslexie zegt niks  │     │  │ Kinderen met   │   │      │  Dyslexie zegt niks  │
│  over hoe slim je    │     │  │ dyslexie zijn  │   │      │  over hoe slim je    │
│  bent.               │     │  │ minder slim.   │   │      │  bent. Echt niet.    │
│                      │     │  └────────────────┘   │      │                      │
│      [ 🔊 ]          │     │      ▼ Niet waar      │      │   Frida: blij        │
│                      │     │       [ 🔊 ]          │      │  ✦ in je Weetjesboek │
│  [ Verder ]          │     │                       │      │  [ Verder ]          │
└──────────────────────┘     └──────────────────────┘      └──────────────────────┘
```

**Luister** — a category tile (emoji or one of the existing SVG icons, no photos), the fact
in one sentence, a big 🔊. The sentence is **read aloud automatically** when the card
appears (setting, default on — §7); the 🔊 replays it. *Verder* appears after the narration
finishes (or after 1.5 s under reduced motion / narration off), so she has heard it before
she can move on. Frida stands beside the card, `happy`.

**Doe** — one of three interactions, chosen per card in the content file:

- **`waar-niet-waar`** — a *statement* (often a myth) on a card; **swipe up = Waar, swipe
  down = Niet waar**, exactly the gesture, thresholds and axis lock from
  `app/src/games/swipe.ts`; tapping the *Waar* / *Niet waar* labels also works and performs
  the swipe visibly (the same tap-teaches rule as Hardop lezen). The statement is read aloud
  on appearance; 🔊 replays it.
- **`kies`** — a *question* (≤ 8 words) and **three** answer buttons (≤ 3 words each),
  stacked, full width, ≥ 56 px tall. Question and the three options are read aloud in order
  ("Wat betekent dys? … moeilijk … snel … groot").
- **`wie`** — a `kies` whose options are three names and whose question is a clue ("Deze
  acteur speelt Spider-Man. Wie heeft dyslexie?"). No photos — a large first letter in a
  coloured circle stands in for a portrait.

**Bewaar** — the truth, always framed positively (§6), read aloud. If she answered right:
`ding`, small confetti puff, Frida `head-celebrating`. If not: `pop` (never `bad`/`fart`),
Frida `happy`, the line starts with **"Goed geprobeerd!"** and then states the fact — there
is no wrong answer that costs anything. Then the card **shrinks and flies into a small book
icon** at the top right, which bounces once and shows the new count ("7"). The `ding` /
`swish` effects exist; the fly-to-book is a new keyframe.

After the last card: **the reward screen** (`RewardScreen`) with `kind: 'weetje'` — no
percentage card (there is nothing to grade), headline **"Nu weet je dit ook!"**, subline
**"Vertel het vanavond aan iemand thuis."**, the gem/XP strip, Verder. Gems are a flat
`WEETJE_GEMS = 8` per node and XP 10, independent of answers; the round is never scored.
(`docs/reward-celebration.md` §4 says a `total === 0` card renders at 0 — this spec
overrides that: a `kind: 'weetje'` reward **hides** the card. Whichever ships second adapts.)

---

## 3. Content model

New file `shared/curriculum/weetjes.json`, one object per card:

```jsonc
{
  "id": "slim",
  "category": "brein",            // "samen" | "brein" | "mensen" | "rechten" | "trucs" | "taal"
  "type": "waar-niet-waar",       // | "kies" | "wie"
  "order": 2,                     // deal order across the whole path (§5)
  "fact": "Dyslexie zegt niks over hoe slim je bent.",
  "statement": "Kinderen met dyslexie zijn minder slim.",   // waar-niet-waar only
  "answer": false,                                          // waar-niet-waar: boolean
  "question": null, "options": null,                        // kies/wie: string + string[3]
  "correct": null,                                          // kies/wie: index 0-2
  "reveal": "Niet waar! Dyslexie zegt niks over hoe slim je bent. Echt niet.",
  "tile": "🧠",
  "evidence": "sterk",            // "sterk" | "redelijk" | "ervaring" (§4)
  "source": "https://…",          // required; a page a parent could open
  "reviewed": false               // true only after Arjan has read fact + source
}
```

- **Only `reviewed: true` cards are dealt.** `words.json` uses the same flag for the same
  reason. The implementing agent seeds the file from §4, sets `reviewed: true` **only** for
  cards whose source it has actually opened, and lists the rest in the PR for Arjan.
- `fact` ≤ 12 words. `statement`/`question` ≤ 10. Options ≤ 3 words. `reveal` ≤ 2 sentences,
  ≤ 20 words. A unit test enforces the limits and the per-type field requirements, and that
  `order` values are unique.
- Narration clips, when recorded, live at `app/public/audio/weetjes/<id>-fact.mp3`,
  `<id>-doe.mp3` (statement, or question + options), `<id>-reveal.mp3`; fallback is
  `speechSynthesis` via `utter()` at rate 0.9 (§7).

---

## 4. Seed content (Dutch), with evidence notes

Copy is final unless Arjan changes it. **Evidence** is what the implementing agent and Arjan
must respect; a card that cannot be sourced stays `reviewed: false` and is not shown.
Nothing in this list may be "improved" with facts from memory: **no Einstein, no Da Vinci,
no Walt Disney** — the dyslexia attributions to historical figures are speculation, and this
game must not teach a child something she may later hear was made up. Living people qualify
only when they have said it about themselves, publicly, on the record.

**samen — je bent niet alleen**

| id | type | copy | evidence |
|---|---|---|---|
| `niet-alleen` | waar-niet-waar | fact: *In een klas van 25 kinderen hebben er meestal 1 of 2 dyslexie.* — statement: *Jij bent de enige in Nederland met dyslexie.* → Niet waar — reveal: *Niet waar! Heel veel kinderen hebben het. In bijna elke klas zit er wel een.* | sterk (prevalence 4–10 %; cite Stichting Dyslexie Nederland or NKD) |
| `familie` | kies | fact: *Dyslexie zit vaak in de familie.* — question: *Wie kan het óók hebben?* — options: *Papa of mama* / *De buurman* / *Je fiets* → 0 — reveal: *Papa, mama, opa of oma. Dyslexie wordt vaak doorgegeven in de familie.* | sterk (heritability) |
| `elke-taal` | waar-niet-waar | fact: *Dyslexie bestaat in elke taal, ook in het Chinees.* — statement: *Dyslexie is er alleen in het Nederlands.* → Niet waar — reveal: *Niet waar! Kinderen in China, Japan en Amerika hebben het ook.* | sterk |

**brein — zo werkt jouw hoofd**

| id | type | copy | evidence |
|---|---|---|---|
| `slim` | waar-niet-waar | fact: *Dyslexie zegt niks over hoe slim je bent.* — statement: *Kinderen met dyslexie zijn minder slim.* → Niet waar — reveal: *Niet waar! Dyslexie zegt niks over hoe slim je bent. Echt niet.* | sterk |
| `ogen` | waar-niet-waar | fact: *Dyslexie zit niet in je ogen, maar in hoe je brein klanken en letters koppelt.* — statement: *Dyslexie komt door je ogen.* → Niet waar — reveal: *Niet waar! Je ogen zijn prima. Je brein koppelt klanken en letters op zijn eigen manier.* | sterk |
| `oefenen` | kies | fact: *Oefenen verandert je brein echt. Elke keer lezen maakt de paadjes sterker.* — question: *Wat maakt de paadjes in je brein sterker?* — options: *Oefenen* / *Slapen* / *Snoep* → 0 — reveal: *Oefenen! Elke keer dat je leest, wordt het paadje een beetje breder.* | sterk (neuroplasticity, in kid terms) |
| `grote-geheel` | kies | fact: *Veel mensen met dyslexie vertellen dat ze goed zijn in het grote geheel zien en in dingen bedenken.* — question: *Waar zijn veel mensen met dyslexie goed in?* — options: *Dingen bedenken* / *Snel lezen* / *Stil zitten* → 0 — reveal: *Dingen bedenken! Veel mensen met dyslexie zijn heel creatief en zien snel hoe iets in elkaar zit.* | **ervaring** — the research on a dyslexia "advantage" is mixed; the copy therefore says *vertellen dat*, and the card must keep that framing |
| `luisteren` | waar-niet-waar | fact: *Een luisterboek is ook een boek. Luisteren telt.* — statement: *Luisteren naar een boek is geen echt lezen.* → Niet waar — reveal: *Niet waar! Van luisteren leer je ook woorden en verhalen. Het telt.* | redelijk |

**mensen — zij hebben het ook** (`wie` cards; each needs a link to the person's own
statement, interview or autobiography)

| id | copy | evidence |
|---|---|---|
| `spiderman` | fact: *De acteur die Spider-Man speelt heeft dyslexie.* — question: *Wie speelt Spider-Man en heeft dyslexie?* — options: *Tom Holland* / *Tom Hanks* / *Tom Cruise* → 0 — reveal: *Tom Holland! Hij kreeg het op zijn zevende te horen. Nu is hij Spider-Man.* | public statements; verify |
| `kok` | fact: *Een wereldberoemde kok uit Engeland heeft dyslexie.* — question: *Welke kok heeft dyslexie?* — options: *Jamie Oliver* / *Gordon Ramsay* / *Herman den Blijker* → 0 — reveal: *Jamie Oliver! Hij las zijn eerste boek toen hij 38 was en schreef er zelf wel twintig.* | public; verify the "eerste boek op 38" detail |
| `piraten` | fact: *De actrice uit Pirates of the Caribbean heeft dyslexie.* — question: *Wie is het?* — options: *Keira Knightley* / *Emma Watson* / *Zendaya* → 0 — reveal: *Keira Knightley! Ze oefende met lezen door filmscripts hardop te lezen.* | public; verify detail |
| `regisseur` | fact: *De regisseur van E.T. en Jurassic Park heeft dyslexie.* — question: *Wie maakte E.T. en heeft dyslexie?* — options: *Steven Spielberg* / *George Lucas* / *Peter Jackson* → 0 — reveal: *Steven Spielberg! Hij hoorde het pas toen hij 60 was. Films maken kon hij allang.* | public (2007 diagnosis); verify |
| `legolas` | fact: *Legolas uit The Lord of the Rings wordt gespeeld door iemand met dyslexie.* — options: *Orlando Bloom* / *Elijah Wood* / *Viggo Mortensen* → 0 — reveal: *Orlando Bloom! Hij zegt dat dyslexie hem juist heeft geleerd om hard te werken.* | public; verify |
| `percy` | fact: *Percy Jackson uit de boeken heeft dyslexie. Zijn hersenen zijn gemaakt voor Oudgrieks.* — question: *Waarvoor is Percy's brein gemaakt?* — options: *Oudgrieks* / *Frans* / *Rekenen* → 0 — reveal: *Oudgrieks! In de boeken hebben alle halfgoden dyslexie. De schrijver bedacht het voor zijn eigen zoon, die het ook heeft.* | sterk (it's the text of the books; Rick Riordan has said so) |
| `lettertype` | kies — fact: *Een Nederlander met dyslexie ontwierp een lettertype dat makkelijker leest.* — question: *Wat ontwierp Christian Boer?* — options: *Een lettertype* / *Een fiets* / *Een spel* → 0 — reveal: *Een lettertype! Het heet Dyslexie. Zoiets zit ook in deze app: probeer de Aa-knop.* | sterk (Christian Boer, Dyslexie font) — note the Aa toggle in the app changes spacing, not the typeface; the copy says *zoiets* on purpose |
| `nl-1`, `nl-2` | placeholders for **two Dutch people** — Arjan picks them. Candidates the author of this spec believes have spoken publicly about their dyslexia but could not verify from the sandbox: Ronald Giphart (schrijver), Ruud de Wild (dj). **Do not ship without a source.** The RID-behandelaar (todo.md) may know better, more child-relevant names. | verify |

**rechten — dit mag jij** (NL-specific; verify against the current rules, e.g. the
dyslexieverklaring and the CvTE/school regels)

| id | type | copy | evidence |
|---|---|---|---|
| `extra-tijd` | waar-niet-waar | fact: *Met een dyslexieverklaring mag je op school extra tijd krijgen bij toetsen.* — statement: *Extra tijd bij een toets is spieken.* → Niet waar — reveal: *Niet waar! Extra tijd is eerlijk. Jouw brein heeft gewoon iets langer nodig voor de letters.* | sterk in principle; verify the exact NL rules |
| `voorlezen` | kies | fact: *Je mag hulpmiddelen gebruiken, zoals een computer die voorleest.* — question: *Wat mag je gebruiken bij lezen?* — options: *Voorlees-software* / *Een spiekbriefje* / *Niks* → 0 — reveal: *Voorlees-software! Het is een hulpmiddel, net als een bril. Daar mag je om vragen.* | sterk; verify |

**trucs — dit helpt**

| id | type | copy | evidence |
|---|---|---|---|
| `vinger` | waar-niet-waar | fact: *Je vinger of een liniaal onder de regel helpt je ogen op de goede plek.* — statement: *Met je vinger meelezen is voor baby's.* → Niet waar — reveal: *Niet waar! Grote mensen doen het ook. Het helpt je ogen de regel vast te houden.* | redelijk |
| `ruimte` | kies | fact: *Meer ruimte tussen letters maakt lezen makkelijker.* — question: *Welke knop in deze app doet dat?* — options: *De Aa-knop* / *De 💎-knop* / *De 🔊-knop* → 0 — reveal: *De Aa-knop, bovenin het pad! Probeer maar.* | sterk (in-app) |

**taal**

| id | type | copy | evidence |
|---|---|---|---|
| `grieks` | kies | fact: *Dyslexie komt uit het Grieks. Dys is moeilijk, lexis is woord.* — question: *Wat betekent dys?* — options: *Moeilijk* / *Snel* / *Groot* → 0 — reveal: *Moeilijk! Dyslexie betekent letterlijk: moeite met woorden. Niet: niet kunnen.* | sterk |

That is 22 cards plus two Dutch placeholders — enough for eleven Weetjes nodes at two cards
each, i.e. the whole current path with room to spare.

---

## 5. On the path

- New `LessonKind` **`'weetje'`** and `GameType` **`'weetjes'`** (`shared/src/types.ts`).
  `GameScreen`'s `GAMES` record makes the missing component a compile error, so add
  `games/Weetjes.tsx` there.
- `data/path.ts` `buildLessons`: one **Weetje node per unit**, placed **after the Lezen
  node** (last in the unit) — so it is the breather after the hardest thing, not a hurdle
  before it. Units without a Lezen node put it last anyway. Title *"Weetje"*,
  `exerciseCount: 2`, empty sound arrays.
- **Which cards a node deals:** the lowest-`order` cards not yet in
  `progress.collectedWeetjes`, `exerciseCount` at a time, `reviewed: true` only. When every
  card is collected, the node deals two she has seen before (least recently) — it never goes
  empty, and re-hearing "je bent niet alleen" months later is the point, not a bug.
- **Order matters.** §4's `order` is: `niet-alleen`, `slim` first (the two facts that do the
  most work), then alternate a *mensen* card with a non-*mensen* card so every node has one
  "wow" and one "so that's how it works". Rights cards from the third node on.
- Path rendering (`PathScreen`): the node gets its own icon (💡 or the book) and colour
  (`--gold`); locked/unlocked behaviour identical to other lessons.
- **State** (`state/progress.ts`): `collectedWeetjes: string[]` (ids, in order collected),
  action `collectWeetje(id)`; persisted; bump the persist `version` and add the migration
  default `[]`. Completing the node goes through the normal `completeLesson` so gems/XP/
  session log stay in one place; `computeReward` gets a `weetje` branch returning
  `{ gems: WEETJE_GEMS, xp: 10, perfect: false, newRecord: false }`.

---

## 6. Copy and typography rules (must)

For dyslexia, and for a nine-year-old:

- One sentence visible at a time. ≤ 12 words. Options ≤ 3 words. Reveal ≤ 20 words.
- Type ≥ 22 px for the fact/statement/reveal, `--font-ui`, **left-aligned** (never
  justified, never centred for more than one line), `line-height ≥ 1.6`, respects the
  existing `.font-dyslexie` spacing.
- **One bold key word** per sentence (`<strong>`), marked in the JSON with `*asterisks*`.
  Never italics, never ALL CAPS in body text.
- Sentence case. Short words where possible; no "echter", no "desondanks".
- **Tone**: *anders*, never *minder*; *nog even*, never *fout*; *je mag*, not *je hebt
  recht op*; never *ondanks je dyslexie*. The reveal after a wrong answer starts with *Goed
  geprobeerd!* and then just says the fact — no "helaas", no "jammer".
- 🔊 button ≥ 56 px, on every beat, always the same place (bottom centre of the card).
- Every card can be completed without reading a single word: narration covers fact,
  statement/question + options (in order, with a 400 ms gap), and reveal.

---

## 7. Narration

- **Recorded first, TTS fallback.** Recordings are Arjan's voice via the teleprompter
  (`docs/recording-pipeline-v2.md`): add a `weetjes` set to the Studio that reads the three
  parts of each card as separate cues, so `split-take.mjs` yields the `<id>-fact/-doe/
  -reveal.mp3` files of §3. Until they exist, `utter(text, 0.9)` speaks the copy.
- Follow `playWord`'s pattern in `audio/audio.ts`: try the clip (`loadWordClip`-style probe
  against a build-time manifest — add `__RECORDED_WEETJES__` next to `__RECORDED_WORDS__` in
  `vite.config.ts`), fall back to speech, both with the 6 s `SPEECH_TIMEOUT_MS` backstop.
- **Auto-read** is a setting, `settings.autoRead: boolean`, default **true**; toggled in
  the Over DuoLexie block on `AvatarScreen`. Off = nothing plays until 🔊 is tapped, and
  *Verder* appears after 1.5 s instead of after narration.
- Tapping 🔊 while narration is playing restarts it (`stopSpeech()` then play).
- Never two narrations at once; leaving the screen (`quit`) stops speech synchronously, the
  way `HardopLezen.quit()` does.

---

## 8. The Weetjesboek

- Route `/#/weetjes`, reachable from a **book button** on `AvatarScreen` (label *"Mijn
  weetjes"* with the count) and from the little book that the cards fly into during a node.
- A grid of small cards, collected ones in colour with their tile and first three words,
  uncollected ones as face-down cards with a `?` (so she can see the book fills up — that is
  the collecting motive; it also tells a parent how far she is).
- Tap a collected card → it opens full-screen as the *Bewaar* beat (fact + reveal, 🔊,
  auto-read per setting). Swipe or arrows move between collected cards.
- Empty state (`0` collected): Frida + *"Speel een Weetje op het pad. Dan komt het hier."*

---

## 9. Sounds, haptics, motion

- Card in: `swish`. Right answer: `ding` + a small confetti puff (reuse `confettiPuff`'s
  sizing) + haptic `[15, 60, 15]`. Not right: `pop`, haptic `12`. **Never** `bad` or `fart`
  here; this game has no failure sound.
- Fly-to-book: 450 ms, card scales to 0.15 and translates to the book icon
  (`getBoundingClientRect` at flight time, `transform` only), book bumps `scale(1.2)`→`1`.
- The swipe card uses the `waar-niet-waar` labels above and below the card in place of the
  Goed!/Nog even pockets; commit rule and spring-back from `swipe.ts` unchanged.
- Reduced motion: no fly (card fades, count updates), no confetti, no bump; swipes still
  work; nothing infinite.

---

## 10. Tests

Unit (`tests/unit/weetjes.test.ts`):

1. `weetjes.json` validates: unique ids and `order`, word limits (§3), per-type required
   fields, `correct` within range, `source` non-empty, every `*bold*` marker balanced.
2. Dealing: lowest-order uncollected first; skips `reviewed: false`; when all collected,
   deals least-recently-collected; never returns an empty deck when ≥ 1 reviewed card exists.
3. `computeReward` for a `weetje` lesson returns flat gems/XP regardless of answers.

E2E (`tests/e2e/weetjes.spec.ts`, Proefronde-style direct route `/#/les/<unit>-weetje`,
`skipOnboarding` + a `installNarration`-like fixture that serves silent mp3s for
`/audio/weetjes/*`):

4. A `waar-niet-waar` card: statement narrated (spy), swipe down on a myth → *Bewaar* shows
   the reveal, `ding` played (WebAudio spy), the book count goes 0 → 1.
5. Tapping the *Niet waar* label instead of swiping performs the same, with the visible
   swipe.
6. A `kies` card: wrong option → reveal starts with "Goed geprobeerd!", no `bad` effect, book
   count still increments; the reward afterwards shows the same gems as a right answer.
7. Auto-read off (seed the setting): nothing narrated until 🔊 tapped; *Verder* appears
   after ~1.5 s.
8. Reward screen for the node: no percentage card, headline "Nu weet je dit ook!", gems
   `+8`.
9. Weetjesboek: shows collected cards in colour and the rest face-down; tapping one opens it
   and narrates; empty state renders.
10. Quit mid-narration: speech stopped (spy on `speechSynthesis.cancel` / media `pause`),
    nothing credited, no console errors.
11. iPhone 375×667: every beat fits without scrolling with the longest reviewed card.

Existing suites must stay green; `PathScreen` tests that count nodes per unit need the new
node accounted for.

---

## 11. Decisions for Arjan (not blocking the build)

- **Does Frida have dyslexia?** The spec keeps Frida as the friend who *tells*, not one who
  *has it*. Making the mascot dyslexic would be the strongest possible "you are not alone",
  and also a permanent narrative commitment across every screen. Worth asking the RID-
  behandelaar; easy to add later as a `samen` card ("Frida heeft het ook") — nothing in the
  build depends on it.
- The two **Dutch names** (§4 `nl-1`, `nl-2`).
- Whether *"Vertel het vanavond aan iemand thuis."* on the reward screen should also appear
  as a small line in the Weetjesboek (a conversation starter for parents).

---

## 12. Docs to update in the same change

- `todo.md`: tick the *Weetjes* line, add as-built notes and the list of cards still
  `reviewed: false`.
- `docs/reward-celebration.md` §4: note the `kind: 'weetje'` exception.
- `docs/recording-pipeline-v2.md`: one line for the new `weetjes` studio set.
- This file: Status → built; deviations marked *(as built)*.

---

## 13. Out of scope

- Photos or likenesses of real people.
- Any AI-generated or memory-sourced "fact" beyond §4 — new cards go through the JSON with a
  source and Arjan's review.
- Sharing cards outside the app, parent dashboard views, streak/daily mechanics.
- Localisation beyond Dutch.
