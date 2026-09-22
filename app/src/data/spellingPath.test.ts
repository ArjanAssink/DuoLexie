import { describe, it, expect } from 'vitest'
import {
  SPELLING_TRY_LESSONS,
  allLessons,
  lessonById,
  path,
  spellingDraftCount,
  spellingLessonsFor,
} from './path'
import { allSpellingWords, spellingWordsForPool } from '../spelling'

/** Every unit on the path, in the order she meets them, with the pool she has by then. */
const units = path.flatMap((f) => f.units)

/** The first unit that earns a node for `pair`, judged on the *draft* word list. */
function firstUnitFor(pair: string): string | undefined {
  return units.find((u) =>
    spellingLessonsFor(u.id, u.cumulativeSounds, allSpellingWords).some(
      (l) => l.spellingPair === pair,
    ),
  )?.id
}

describe('the Maak het woord af node on the path (docs/maak-het-woord-af.md §7)', () => {
  it('gives d-t its first node on the unit that teaches d, not before', () => {
    expect(firstUnitFor('d-t')).toBe('fase1-n-p-b-d-f')
  })

  it('has no d-t node on the first two units — one has no consonants, the other no d', () => {
    for (const unitId of ['fase1-a-e-o-u-i', 'fase1-m-s-k-r-t']) {
      const unit = units.find((u) => u.id === unitId)!
      const lessons = spellingLessonsFor(unit.id, unit.cumulativeSounds, allSpellingWords)
      expect(lessons.map((l) => l.spellingPair), unitId).not.toContain('d-t')
    }
  })

  it('gives cht-gt its first node on the unit that teaches ch', () => {
    // `g` arrives in fase 1 and `t` before it, so `ch` is the klank that gates this pair.
    expect(firstUnitFor('cht-gt')).toBe('fase5-ch-ng-nk')
  })

  it('keeps a pair\'s node on every later unit, with a wider pool each time', () => {
    const after = units.slice(units.findIndex((u) => u.id === 'fase1-n-p-b-d-f'))
    for (const unit of after) {
      const lessons = spellingLessonsFor(unit.id, unit.cumulativeSounds, allSpellingWords)
      expect(lessons.map((l) => l.spellingPair), unit.id).toContain('d-t')
    }
    const first = units.find((u) => u.id === 'fase1-n-p-b-d-f')!
    const last = units[units.length - 1]
    expect(
      spellingWordsForPool('d-t', last.cumulativeSounds, allSpellingWords).length,
    ).toBeGreaterThan(spellingWordsForPool('d-t', first.cumulativeSounds, allSpellingWords).length)
  })

  it('gives the node a stable id built from the unit sounds and the pair', () => {
    const unit = units.find((u) => u.id === 'fase1-n-p-b-d-f')!
    const lessons = spellingLessonsFor(unit.id, unit.cumulativeSounds, allSpellingWords)
    expect(lessons[0].id).toBe('fase1-n-p-b-d-f-spel-d-t')
    expect(lessons[0].exerciseCount).toBe(10)
    expect(lessons[0].kind).toBe('les')
  })

  it('puts nothing on the real path while every seed word is still unreviewed', () => {
    // The reviewed gate (§6 rule 5), asserted rather than assumed: this is why the
    // /proberen entry exists, and the line to delete once Arjan has been through the list.
    expect(allLessons.filter((l) => l.gameType === 'maak-het-woord-af')).toEqual([])
  })
})

describe('the /proberen entries (§7, §12.1)', () => {
  it('has one per pair, reachable by id and off the path', () => {
    expect(SPELLING_TRY_LESSONS.map((l) => l.spellingPair)).toEqual(['d-t', 'cht-gt'])
    for (const lesson of SPELLING_TRY_LESSONS) {
      expect(lessonById(lesson.id)).toBe(lesson)
      expect(allLessons).not.toContain(lesson)
    }
  })

  it('gives d-t the whole of fase 1 and cht-gt everything up to ch · ng · nk', () => {
    const [dt, chtgt] = SPELLING_TRY_LESSONS
    const fase1 = path[0].units[path[0].units.length - 1].cumulativeSounds
    const fase5 = units.find((u) => u.id === 'fase5-ch-ng-nk')!.cumulativeSounds
    expect(dt.soundPool).toEqual(fase1)
    expect(chtgt.soundPool).toEqual(fase5)
  })

  it('has enough draft words in each pool to make a real round', () => {
    for (const lesson of SPELLING_TRY_LESSONS) {
      const readable = spellingWordsForPool(
        lesson.spellingPair!,
        lesson.soundPool,
        allSpellingWords,
      )
      expect(readable.length, lesson.id).toBeGreaterThanOrEqual(10)
    }
  })

  it('counts the drafts the probeermenu warns about', () => {
    expect(spellingDraftCount('d-t')).toBe(
      allSpellingWords.filter((w) => w.pair === 'd-t').length,
    )
    expect(spellingDraftCount('nope')).toBe(0)
  })
})
