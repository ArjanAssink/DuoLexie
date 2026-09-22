import type { Fase, Lesson, Unit, Word } from '@shared/src/types'
import { curriculum } from '../curriculum'
import { wordsForPool } from '../words'
import {
  allSpellingWords, dealableSpellingWords, spellingPairs, spellingWordsForPool,
} from '../spelling'

interface UnitDef {
  title: string
  sounds: string[]
}

interface FaseDef {
  id: string
  title: string
  categoryId: Fase['categoryId']
  units: UnitDef[]
}

// Default order (§3 of the plan). Later this becomes parent-configurable.
const FASE_DEFS: FaseDef[] = [
  {
    id: 'fase1',
    title: 'Korte klanken',
    categoryId: 'kort',
    units: [
      { title: 'De klinkers', sounds: ['a', 'e', 'o', 'u', 'i'] },
      { title: 'm · s · k · r · t', sounds: ['m', 's', 'k', 'r', 't'] },
      { title: 'n · p · b · d · f', sounds: ['n', 'p', 'b', 'd', 'f'] },
      { title: 'g · h · j · l', sounds: ['g', 'h', 'j', 'l'] },
      { title: 'v · w · z', sounds: ['v', 'w', 'z'] },
    ],
  },
  {
    id: 'fase2',
    title: 'Lange klanken',
    categoryId: 'lang',
    units: [
      { title: 'aa · ee · oo · uu', sounds: ['aa', 'ee', 'oo', 'uu'] },
    ],
  },
  {
    id: 'fase3',
    title: 'Twee tekens I',
    categoryId: 'twee',
    units: [
      { title: 'ie · oe', sounds: ['ie', 'oe'] },
      { title: 'eu · ui · uw', sounds: ['eu', 'ui', 'uw'] },
    ],
  },
  {
    id: 'fase4',
    title: 'Tweelingklanken',
    categoryId: 'twee',
    units: [
      { title: 'ei · ij', sounds: ['ei', 'ij'] },
      { title: 'au · ou', sounds: ['au', 'ou'] },
    ],
  },
  {
    id: 'fase5',
    title: 'Twee tekens II',
    categoryId: 'twee',
    units: [
      { title: 'ch · ng · nk', sounds: ['ch', 'ng', 'nk'] },
    ],
  },
  {
    id: 'fase6',
    title: 'Drie & vier tekens',
    categoryId: 'drie',
    units: [
      { title: 'aai · ooi · oei', sounds: ['aai', 'ooi', 'oei'] },
      { title: 'auw · ouw', sounds: ['auw', 'ouw'] },
      { title: 'eeuw · ieuw', sounds: ['eeuw', 'ieuw'] },
    ],
  },
]

/** Cards in one Lezen round — ten different words (docs/hardop-lezen-rework.md §4). */
export const LEZEN_ROUND_SIZE = 10

/**
 * Cards in one Flitsen round. Fixed, rather than "however many klanken this unit knows":
 * the pool runs from five (the opening unit) to forty-five, so a pool-sized round was over
 * in a handful of taps early on and a slog at the end. Twenty is long enough to be a round
 * and short enough to stay a quick game. `buildFlitsDeck` repeats or samples the pool to
 * reach it.
 */
export const FLITS_DECK_SIZE = 20

/**
 * A "Lezen" node needs enough readable words to fill a round without running the same
 * words twice. Nine is the floor rather than ten: a nine-word pool still yields ten cards
 * with a single non-adjacent repeat (`buildWordExercises`), which is a real round.
 */
const MIN_WORDS_FOR_LEZEN = 9

/** Cards one Weetje node hands her (docs/weetjes.md §1). */
export const WEETJE_CARD_COUNT = 2

/** Cards in one Maak het woord af round (docs/maak-het-woord-af.md §5). */
export const SPELLING_ROUND_SIZE = 10

/**
 * Readable, reviewed words a pair needs before it earns a node on a unit.
 *
 * Eight rather than the full ten: a round is allowed to be short (`buildSpellingRound`
 * never repeats a word to pad one out), and eight cards of d/t is still a real round.
 * Below that it is a drill of the same handful of words and belongs one unit later.
 */
const MIN_WORDS_FOR_SPELLING = 8

/**
 * The sound pool a Lezen node reads from: what she has been taught, topped up with the next
 * unit's sounds when that isn't enough to fill a round (docs/hardop-lezen-rework.md §4).
 *
 * Strictly, a word is readable only once every klank in it has been introduced. Where that
 * leaves a unit short of a full round, allowing the *next* unit's sounds is a fair top-up:
 * those words are built from the klank category she is already working in, so reading one
 * early is a preview rather than a jump.
 *
 * Two conditions keep the top-up from becoming a wall:
 *
 * - **One unit, never two.** Two would reach sounds she has no business meeting yet.
 * - **She must already be able to read something.** A top-up tops up; it must not conjure a
 *   reading node entirely out of sounds she has never seen. This is what keeps a node off
 *   the opening unit, where she knows the five vowels and nothing else: its strict pool is
 *   empty, so every word would come from the preview. Adding the 4-to-7-letter words made
 *   this bite for real — the opening unit's topped-up pool reached 18 words, and without
 *   this condition it would have been handed a reading lesson of "storm" and "kruk".
 *
 * With the current word list the top-up is dormant: every unit from the second onwards
 * clears a full round on its strict pool alone. It stays because a reorder of the sound
 * order (which plan.md §3 makes parent-configurable) can thin a unit out again.
 */
function lezenPool(cumulative: string[], nextUnitSounds: string[]): string[] {
  const strict = wordsForPool(cumulative).length
  if (strict >= LEZEN_ROUND_SIZE) return cumulative
  if (strict === 0 || nextUnitSounds.length === 0) return cumulative
  return [...cumulative, ...nextUnitSounds]
}

function buildLessons(
  unitId: string,
  unitDef: UnitDef,
  cumulative: string[],
  nextUnitSounds: string[],
): Lesson[] {
  const pool = cumulative
  const lessons: Lesson[] = [
    {
      id: `${unitId}-l1`,
      unitId,
      kind: 'les',
      title: 'Flitsen',
      gameType: 'flitsen',
      newSounds: unitDef.sounds,
      soundPool: pool,
      exerciseCount: FLITS_DECK_SIZE,
    },
    {
      id: `${unitId}-l2`,
      unitId,
      kind: 'les',
      title: 'Tijdrit',
      gameType: 'tijdrit',
      newSounds: unitDef.sounds,
      soundPool: pool,
      exerciseCount: 0, // Tijdrit is time-based, not count-based
    },
    {
      id: `${unitId}-l3`,
      unitId,
      kind: 'herhaling',
      title: 'Mix',
      gameType: 'flitsen',
      newSounds: [],
      soundPool: pool,
      exerciseCount: FLITS_DECK_SIZE,
    },
    {
      id: `${unitId}-l4`,
      unitId,
      kind: 'tijdrit-uitdaging',
      title: 'Uitdaging',
      gameType: 'tijdrit',
      newSounds: [],
      soundPool: pool,
      exerciseCount: 0,
    },
  ]

  const readingPool = lezenPool(pool, nextUnitSounds)
  if (wordsForPool(readingPool).length >= MIN_WORDS_FOR_LEZEN) {
    lessons.push({
      id: `${unitId}-l5`,
      unitId,
      kind: 'les',
      title: 'Lezen',
      gameType: 'hardop-lezen',
      newSounds: [],
      soundPool: readingPool,
      exerciseCount: LEZEN_ROUND_SIZE,
    })
  }

  // A spelling node per pair, after Lezen and before the Weetje (§7).
  lessons.push(...spellingLessonsFor(unitId, pool))

  /*
   * The Weetje node goes last, after Lezen (docs/weetjes.md §5).
   *
   * Deliberately after the hardest thing in the unit rather than before it: it is ninety
   * seconds of being told she is one of many and that her brain is different, not worse,
   * and that lands as a breather earned rather than as one more hurdle between her and the
   * reading. Units with no Lezen node get it last anyway.
   *
   * Which cards it deals is not decided here — it is her collection at the moment she opens
   * it (weetjes.ts `dealWeetjes`), so a node replayed months later is not the same two
   * cards.
   */
  lessons.push({
    id: `${unitId}-weetje`,
    unitId,
    kind: 'weetje',
    title: 'Weetje',
    gameType: 'weetjes',
    newSounds: [],
    soundPool: [],
    exerciseCount: WEETJE_CARD_COUNT,
  })

  return lessons
}

/**
 * The Maak het woord af nodes a unit earns (docs/maak-het-woord-af.md §7).
 *
 * Two conditions, both about her and not about the data: every klank the pair is *about*
 * has been taught (`needs` — spelling `d` or `t` before either letter has been introduced
 * is a guess, not a choice), and there are enough words she can already read to fill a
 * round. The second is what keeps the node off a unit whose pool happens to contain the
 * letters but almost none of the words.
 *
 * Both are recomputed per unit, so a pair's node reappears on every later unit with a wider
 * pool rather than being a one-off — the pairs are exactly the thing that needs coming back
 * to.
 *
 * Exported, and with the word set injectable, because it is the interesting rule in this
 * file and the shipped data cannot exercise it: every seed word is `reviewed: false` until
 * Arjan says otherwise (§6 rule 5), so the real path has no spelling node on it yet and a
 * test over `path` would be asserting the gate rather than the rule.
 */
export function spellingLessonsFor(
  unitId: string,
  pool: string[],
  words = dealableSpellingWords,
): Lesson[] {
  const out: Lesson[] = []
  for (const pair of spellingPairs) {
    if (!pair.needs.every((k) => pool.includes(k))) continue
    if (spellingWordsForPool(pair.id, pool, words).length < MIN_WORDS_FOR_SPELLING) continue
    out.push({
      // unit sounds + pair id: stable under any reorder of FASE_DEFS or of the pairs, the
      // same property unitSlug exists for.
      id: `${unitId}-spel-${pair.id}`,
      unitId,
      kind: 'les',
      title: 'Maak het woord af',
      gameType: 'maak-het-woord-af',
      newSounds: [],
      soundPool: pool,
      exerciseCount: SPELLING_ROUND_SIZE,
      spellingPair: pair.id,
    })
  }
  return out
}

/**
 * A unit's stable id — derived from the sounds it introduces, not its position in
 * FASE_DEFS. docs/backend-readiness.md A3 / code-review-backlog.md's "positional lesson
 * ids": the old `u${i+1}` scheme silently remapped a user's completedLessons/records onto
 * whatever unit happened to occupy that array slot after any reorder or insertion. A unit's
 * sound set is what actually identifies it and doesn't change under editing elsewhere in
 * the array, so it survives exactly the edits the old scheme didn't.
 */
function unitSlug(unitDef: UnitDef): string {
  return unitDef.sounds.join('-')
}

/**
 * Maps this file's *former* positional unit ids (`fase{n}-u{i+1}`, one-time only, computed
 * from the current FASE_DEFS order) to the new stable ids above. Used once, by
 * state/progress.ts's persisted-state migration, to remap old completedLessons/records
 * keys and session lessonIds so upgrading doesn't silently blank out real progress. Nothing
 * else should use this — new code has no reason to know the old scheme ever existed.
 */
export const LEGACY_UNIT_ID_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const faseDef of FASE_DEFS) {
    faseDef.units.forEach((unitDef, i) => {
      map[`${faseDef.id}-u${i + 1}`] = `${faseDef.id}-${unitSlug(unitDef)}`
    })
  }
  return map
})()

function buildPath(): Fase[] {
  const fases: Fase[] = []
  const cumulative: string[] = []
  for (const faseDef of FASE_DEFS) {
    const cat = curriculum.categories.find((c) => c.id === faseDef.categoryId)!
    const units: Unit[] = []
    for (let i = 0; i < faseDef.units.length; i++) {
      const unitDef = faseDef.units[i]
      cumulative.push(...unitDef.sounds)
      const unitId = `${faseDef.id}-${unitSlug(unitDef)}`
      units.push({
        id: unitId,
        faseId: faseDef.id,
        title: unitDef.title,
        sounds: unitDef.sounds,
        cumulativeSounds: [...cumulative],
        lessons: buildLessons(
          unitId,
          unitDef,
          [...cumulative],
          faseDef.units[i + 1]?.sounds ?? [],
        ),
      })
    }
    fases.push({
      id: faseDef.id,
      title: faseDef.title,
      categoryId: faseDef.categoryId,
      color1: cat.color1,
      color2: cat.color2,
      units,
    })
  }
  return fases
}

export const path: Fase[] = buildPath()

export const allLessons: Lesson[] = path.flatMap((f) => f.units.flatMap((u) => u.lessons))

/**
 * Proefronde — a direct-launch Hardop lezen round over the whole of fase 1 (short vowels +
 * every consonant, 38 readable words), reachable from `/#/proberen` only.
 *
 * Deliberately *not* in `allLessons`: it must not appear on the path, take a slot in the
 * linear-unlock order, or wait on her progress. It exists so the read → listen → sort
 * interaction can be tried with her before the word level is tuned to where she actually is
 * (docs/hardop-lezen-rework.md §4).
 */
/**
 * The `unitId` every off-path try-round carries. A spelling try-round is allowed to deal
 * unreviewed drafts, and this is how the game knows it is one (§12.1).
 */
export const TRY_UNIT_ID = 'proefronde'

export const PROEFRONDE_LESSON: Lesson = {
  id: 'proef-hardop-lezen',
  unitId: TRY_UNIT_ID,
  kind: 'les',
  title: 'Proefronde lezen',
  gameType: 'hardop-lezen',
  newSounds: [],
  soundPool: [
    ...(curriculum.categories.find((c) => c.id === 'kort')?.sounds ?? []),
    ...(curriculum.categories.find((c) => c.id === 'mede')?.sounds ?? []),
  ],
  exerciseCount: LEZEN_ROUND_SIZE,
}

/**
 * One direct-launch Maak het woord af round per pair, reachable from `/#/proberen` only.
 *
 * Like the Proefronde, deliberately *not* in `allLessons`: these must not appear on the
 * path or wait on her progress. Unlike it, they exist for a second reason — a path node
 * only appears once the pair's seed words are `reviewed: true` (docs/maak-het-woord-af.md
 * §6 rule 5, §12.1), and until Arjan has been through the list there is no other way in.
 * So these deal the **drafts**, and the probeermenu's label says so.
 *
 * The pool is every klank up to and including the fase the pair first becomes readable in,
 * which for `d-t` is fase 1 and for `cht-gt` is everything up to `ch · ng · nk`.
 */
export const SPELLING_TRY_LESSONS: Lesson[] = spellingPairs.map((pair) => ({
  id: `proef-spel-${pair.id}`,
  unitId: TRY_UNIT_ID,
  kind: 'les',
  title: 'Maak het woord af',
  gameType: 'maak-het-woord-af',
  newSounds: [],
  soundPool: tryPoolFor(pair.needs),
  exerciseCount: SPELLING_ROUND_SIZE,
  spellingPair: pair.id,
}))

/**
 * The widest pool a try-round may draw from: every klank the path has introduced by the
 * end of the **fase** that completes `needs` — all of fase 1 for `d-t`, everything up to
 * and including `ch · ng · nk` for `cht-gt` (§7).
 *
 * A whole fase rather than a whole path, so a try-round is still made of words she has a
 * chance at; a whole fase rather than the exact unit, so the pool is wide enough to be a
 * real round rather than the eight words the node itself first appears on.
 *
 * Derived rather than written out, so adding `ei`/`ij` to spelling.json gives its
 * try-round the right pool without anyone remembering to widen a constant here.
 */
function tryPoolFor(needs: string[]): string[] {
  const cumulative: string[] = []
  const missing = new Set(needs)
  for (const faseDef of FASE_DEFS) {
    for (const unitDef of faseDef.units) {
      cumulative.push(...unitDef.sounds)
      for (const sound of unitDef.sounds) missing.delete(sound)
    }
    // checked per fase, not per unit: the pool runs to the end of the fase that completes
    // the pair, which is what makes fase 1's `d-t` round the whole of fase 1
    if (missing.size === 0) return [...cumulative]
  }
  return [...cumulative]
}

/** Every lesson reachable by URL that is not on the path. */
const OFF_PATH_LESSONS: Lesson[] = [PROEFRONDE_LESSON, ...SPELLING_TRY_LESSONS]

export function lessonById(id: string): Lesson | undefined {
  return OFF_PATH_LESSONS.find((l) => l.id === id) ?? allLessons.find((l) => l.id === id)
}

/**
 * How many of a pair's seed words are still `reviewed: false` — the probeermenu says so on
 * the button, because a try-round of unreviewed drafts is exactly what it is.
 */
export function spellingDraftCount(pairId: string): number {
  return allSpellingWords.filter((w) => w.pair === pairId && !w.reviewed).length
}

/** Linear unlock: a lesson is unlocked when all earlier lessons are completed */
export function lessonIndex(id: string): number {
  return allLessons.findIndex((l) => l.id === id)
}

/**
 * Every word the path can serve, in the order worth recording it: shortest first, and within
 * one length, in the order the path introduces it. The studio's word mode walks this
 * (dev/RecordingStudio.tsx).
 *
 * Length leads deliberately. Walking the path node by node instead would record all of the
 * first node's words — three letters up to six — before reaching the three-letter words that
 * the *next* node introduces, so a session spent recording "the first twenty" would have
 * ended up holding "strikt" and "kortst" while "pan" and "bed" went unrecorded. Shortest
 * first means the twenty clips recorded first are the twenty simplest words she reads.
 */
export function wordsInRecordingOrder(): Word[] {
  const seen = new Set<string>()
  const out: Word[] = []
  for (const lesson of allLessons) {
    if (lesson.gameType !== 'hardop-lezen') continue
    for (const word of wordsForPool(lesson.soundPool)) {
      if (seen.has(word.id)) continue
      seen.add(word.id)
      out.push(word)
    }
  }
  // stable sort, so words of equal length keep the path order established above
  return out.sort((a, b) => a.text.length - b.text.length)
}
