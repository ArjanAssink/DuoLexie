# Reading mechanics: the window, automatisering and spacing

How **Hardop lezen** trains word reading — the reading window, how it shortens as a word
becomes automatic, and how spaced repetition decides which words come back when.

Design intent lives here; [plan.md](../plan.md) stays the higher-level document and
[code-review-backlog.md](code-review-backlog.md) tracks the bugs this depends on.

**Status:** the reading window is built and shipped at a fixed 5s, and the per-word history
both mechanisms need is now being recorded (`wordStats`, §5). The adaptive shortening (§2) and
the box-driven session composition (§3, §4) are **designed, not built** — nothing reads `box`
or `dueAt` yet, and word selection is still `buildWordExercises`'s shortest-first shuffle.

---

## 1. The reading window (shipped)

A word card appears and a bar drains beside it. She reads the word aloud herself, then
swipes right (*goed*) or left (*nog even*). **The app only pronounces the word once the bar
runs out.**

The ordering is the whole point. Previously the app spoke the word 450ms after showing it,
which handed her the answer before she'd attempted it — in a game called "Lees het woord
hardop". Now:

| Event | What she hears |
|---|---|
| Swipes before the bar empties | nothing — she read it, she doesn't need it read to her |
| Bar empties before she swipes | the word, as the model to check her attempt against |
| Swipes left (*nog even*) | the word replayed, as reinforcement |

So the audio is a **check**, never a prompt. Swiping cancels the pending pronunciation.

Current value: `READ_WINDOW_MS = 5000` in `HardopLezen.tsx`.

## 2. Adaptive shortening — the automatisering engine

Fluent reading isn't "correct eventually", it's "correct *fast*, without decoding". That's
what RID's automatisering target means, and it's already how sound mastery works in this app
(plan.md §3: *Goud = geleerd + fast median response*). The window is how the same criterion
reaches words: as a word becomes automatic for her, she gets less time for it.

**Proposed formula**, per word:

```
window(word) =
  fewer than 3 successful reads  →  clamp(globalEwmaMs * 1.4, 2200, 6000)
  otherwise                      →  clamp(wordEwmaMs   * 1.4, 1800, 6000)
```

- `wordEwmaMs` — EWMA (α ≈ 0.3) of how long she took on reads she graded **goed**. Failed
  reads are excluded deliberately: including them inflates the window and the mechanism
  stops applying pressure exactly where pressure is the point.
- `globalEwmaMs` — the same figure across all words, used until a word has enough of its own
  history. 164 words would otherwise take months to calibrate individually; the global
  baseline means a new word starts at *her* current pace, not a generic 5s.
- **× 1.4** gives roughly 40% headroom over her typical time — a normal read fits
  comfortably, a hesitant decode doesn't.
- **Floor 1800ms** because a 9-year-old needs ~1.5s just to perceive and articulate a short
  word, plus tap latency. Below that this stops being a reading exercise and becomes a
  reflex test she'll lose for reasons that have nothing to do with reading.
- **Ceiling 6000ms** so a bad day can't drift the window long enough that it stops training
  speed at all, and so session length stays predictable.

Every constant here is a guess that should be checked against her actual data once a few
weeks of reads exist. They're deliberately in one place for that reason.

## 3. Spaced repetition — Leitner, gated on speed

Words need to be *embedded*, not just met once. Boxes with widening intervals:

| Box | Comes back after | Meaning |
|---|---|---|
| 1 | same or next session | new, or just missed |
| 2 | 2 days | |
| 3 | 4 days | |
| 4 | 9 days | |
| 5 | 21 days | effectively retired |

**The promotion rule is where the two mechanisms meet:**

| Outcome | Box |
|---|---|
| *goed*, inside the window | **promote** one box |
| *goed*, but the window ran out | **stay** — fluent-but-slow isn't mastery |
| *nog even* | **demote to box 1** |

That middle row is the important one. Without it the timer is just decoration; with it,
speed is the thing that actually advances a word, and the spacing system and the
automatisering goal become the same system rather than two features sitting next to each
other.

**Why Leitner and not SM-2.** plan.md §3 already rejected SM-2 for the ~45 sounds in favour
of a weighted sampler, and the reasoning holds harder here: SM-2 wants a 0–5 recall-quality
rating, and what we actually have is a binary swipe from a nine-year-old grading herself.
Leitner consumes exactly that signal, survives irregular practice, and can be explained to a
parent in one sentence. The word set (164 and growing) is large enough to need real spacing;
it isn't large enough to need SM-2's precision.

## 4. Session composition

A Lezen lesson serves 8 words. Fill the slots in this order:

1. **Due words** — box interval elapsed. Lowest box first, then oldest `lastSeenAt`. Cap at 6.
2. **New words** from the unit's eligible pool. Cap at 3, so a session is mostly review.
3. **Backfill** from boxes 1–2 if the first two don't fill it.

Cap the due backlog at 6 per session even when far more are due. After a two-week holiday
sixty words come due at once; showing all of them makes the session unfinishable and the
progress bar demoralising. The rest simply wait — they're already spaced, a few more days
does no harm.

## 5. Per-word stats — built

`wordStats` is now a persisted slice of the progress store, written by Hardop lezen on every
graded card. The reducer lives in `app/src/engine/wordStats.ts` (unit-tested) and implements
the box rules in §3 exactly, including the "correct but slow holds position" gate. The shape:

```ts
interface WordStats {
  attempts: number
  correct: number
  ewmaMs: number | null   // successful reads only; null until the first success
  box: 1 | 2 | 3 | 4 | 5
  dueAt: string           // local calendar day (YYYY-MM-DD) — day arithmetic only
  lastSeenAt: string      // full ISO instant — ordering only
}
```

`ewmaMs` ended up nullable rather than seeded with a guess (as `emptyStats()` does at 4000ms
for sounds): §2 branches on "fewer than 3 successful reads" and falls back to a global average,
which a fake seed would quietly poison. Only successful reads feed it — a failed read times how
long she struggled, not how fluently she reads the word — and samples are clamped so one
abandoned card can't drag the average for the next ten reads.

**Both blocking backlog items are now closed**, and both were prerequisites rather than
niceties: the stores carry `version`/`migrate`/`merge` (item 9), so adding this slice couldn't
hand her existing profile a half-formed object; and calendar arithmetic goes through
`src/date.ts` in local time (item 10), so box intervals can't misfire by a day.

**Word audio.** All of §1's self-check assumes she hears a real pronunciation.
`app/public/audio/words/` is still empty, so `playWord` 404s and falls back to browser speech
synthesis — robotic, and not the family voice the audio design is built around. The
generator (`tools/generate-word-audio.mjs`) exists and has never been run. Note that
code-review-backlog item 2 (the promise that never resolves when `play()` rejects) activates
the moment those files exist, so fix that before generating them.

## 6. Open decisions

- **Should the bar be visible?** It currently is. A visible clock motivates some children and
  freezes others, and the mechanism works either way — the window can gate promotion
  invisibly. Worth trying both on her and keeping whichever reads better; this is not a
  question the design can answer from first principles.
- **Does "goed but slow" still earn gems?** Right now every *goed* counts the same toward the
  lesson result. If the boxes treat slow-but-correct as non-mastery, the reward screen
  arguably should acknowledge it too — but adding a second way to "not quite succeed" to a
  dyslexia app deserves care.
- **Per-word or per-child pacing?** §2 proposes both, blended. If that proves fiddly, a single
  global window that shortens as *she* gets faster overall is much simpler and captures most
  of the benefit.
- **Do the boxes belong to Tijdrit too?** The same promote-on-speed logic would work for
  klanken, replacing the current weighted sampler. Probably a later question — don't
  destabilise sound progression while words are still bedding in.
