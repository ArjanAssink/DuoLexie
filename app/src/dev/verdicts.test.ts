import { describe, it, expect } from 'vitest'
import { folderFor, type TakeKind } from './cueSheet'
import {
  MISSING, clipState, countStates, countsAsMissing, isMissing, mergeStores, parseStore,
  verdictKey, withVerdict, type ClipProbe, type VerdictStore,
} from './verdicts'

const FILE: ClipProbe = { present: true, lastModified: 'Tue, 16 Sep 2026 18:00:00 GMT' }
const NEWER: ClipProbe = { present: true, lastModified: 'Tue, 16 Sep 2026 19:30:00 GMT' }
const OLDER: ClipProbe = { present: true, lastModified: 'Mon, 15 Sep 2026 09:00:00 GMT' }
const NO_HEADER: ClipProbe = { present: true, lastModified: null }

const judged = (verdict: 'goed' | 'afgekeurd', probe = FILE): VerdictStore =>
  withVerdict({}, 'words', 'kat', verdict, probe)

describe('folderFor', () => {
  it('answers for all three kinds, including the one that used to fall through to words', () => {
    // `kind === 'klanken' ? 'sounds' : 'words'` is what TakeReview had, so a Weetjes report
    // played /audio/words/slim-doe.mp3, heard nothing, and said nothing about it (§2.8)
    expect(folderFor('klanken')).toBe('sounds')
    expect(folderFor('woorden')).toBe('words')
    expect(folderFor('weetjes')).toBe('weetjes')
  })

  it('has an answer for every kind there is', () => {
    const kinds: TakeKind[] = ['klanken', 'woorden', 'weetjes']
    expect(kinds.map(folderFor).filter(Boolean)).toHaveLength(kinds.length)
    expect(new Set(kinds.map(folderFor)).size).toBe(kinds.length)
  })
})

describe('clipState', () => {
  it('is ontbreekt when there is no file, and forgets a "goed" about one that vanished', () => {
    expect(clipState({}, 'words', 'kat', MISSING)).toBe('ontbreekt')
    expect(clipState(judged('goed'), 'words', 'kat', MISSING)).toBe('ontbreekt')
  })

  it('keeps ❌ after the file is gone, because rejecting moves it to afgekeurd/', () => {
    // ❌ and ⬜ both mean "record this", but they are not the same fact: one of them says
    // somebody listened to it and threw it away
    expect(clipState(judged('afgekeurd'), 'words', 'kat', MISSING)).toBe('afgekeurd')
    expect(countsAsMissing(clipState(judged('afgekeurd'), 'words', 'kat', MISSING))).toBe(true)
  })

  it('is onbeoordeeld for a clip nobody has listened to yet', () => {
    expect(clipState({}, 'words', 'kat', FILE)).toBe('onbeoordeeld')
  })

  it('remembers a verdict about the same file', () => {
    expect(clipState(judged('goed'), 'words', 'kat', FILE)).toBe('goed')
    expect(clipState(judged('afgekeurd'), 'words', 'kat', FILE)).toBe('afgekeurd')
  })

  it('resets to onbeoordeeld once a retake has landed', () => {
    // the ❌ is what sent the word back to be re-recorded; inheriting it would queue the
    // word forever, since afgekeurd counts as missing
    expect(clipState(judged('afgekeurd'), 'words', 'kat', NEWER)).toBe('onbeoordeeld')
    expect(clipState(judged('goed'), 'words', 'kat', NEWER)).toBe('onbeoordeeld')
  })

  it('resets for an older file too — a different recording, not an older opinion', () => {
    // restoring a clip by hand out of recordings/afgekeurd/ puts back an earlier timestamp,
    // and it is still not the file that was judged
    expect(clipState(judged('goed'), 'words', 'kat', OLDER)).toBe('onbeoordeeld')
  })

  it('keeps the verdict when the server sends no Last-Modified to compare', () => {
    // losing a verdict is a nuisance; inheriting one across a retake is a wrong answer that
    // hides itself, so the side to fail on is "trust what was said"
    expect(clipState(judged('goed'), 'words', 'kat', NO_HEADER)).toBe('goed')
  })

  it('keeps the three sets apart on a shared id', () => {
    const store = withVerdict({}, 'words', 'aan', 'afgekeurd', FILE)
    expect(clipState(store, 'words', 'aan', FILE)).toBe('afgekeurd')
    expect(clipState(store, 'sounds', 'aan', FILE)).toBe('onbeoordeeld')
    expect(verdictKey('weetjes', 'slim-doe')).toBe('weetjes/slim-doe')
  })
})

describe('countsAsMissing', () => {
  it('treats a rejected clip exactly like one that was never recorded', () => {
    expect(countsAsMissing('ontbreekt')).toBe(true)
    expect(countsAsMissing('afgekeurd')).toBe(true)
    expect(countsAsMissing('onbeoordeeld')).toBe(false)
    expect(countsAsMissing('goed')).toBe(false)
  })

  it('puts a rejected id back in the "alleen ontbrekende" filter with nothing else to do', () => {
    const store = judged('afgekeurd')
    expect(isMissing(store, 'words', 'kat', FILE)).toBe(true)
    // …and takes it out again the moment the retake lands, without anyone clearing anything
    expect(isMissing(store, 'words', 'kat', NEWER)).toBe(false)
  })
})

describe('withVerdict', () => {
  it('clears a verdict when given null', () => {
    const store = withVerdict(judged('afgekeurd'), 'words', 'kat', null, FILE)
    expect(store).toEqual({})
  })

  it('refuses to store a verdict it could never invalidate', () => {
    // with no Last-Modified there is nothing to compare a later file against, so the entry
    // would outlive every retake of that clip
    expect(withVerdict({}, 'words', 'kat', 'goed', NO_HEADER)).toEqual({})
  })

  it('does not mutate the store it was given', () => {
    const before = judged('goed')
    const after = withVerdict(before, 'words', 'tas', 'afgekeurd', FILE)
    expect(Object.keys(before)).toEqual(['words/kat'])
    expect(Object.keys(after).sort()).toEqual(['words/kat', 'words/tas'])
  })
})

describe('countStates', () => {
  it('counts a set the way the header prints it', () => {
    let store: VerdictStore = {}
    store = withVerdict(store, 'words', 'kat', 'goed', FILE)
    store = withVerdict(store, 'words', 'tas', 'afgekeurd', FILE)
    const probes = { kat: FILE, tas: FILE, bos: FILE }

    expect(countStates(store, 'words', ['kat', 'tas', 'bos', 'pen'], probes))
      .toEqual({ ontbreekt: 1, onbeoordeeld: 1, goed: 1, afgekeurd: 1 })
  })
})

describe('parseStore', () => {
  it('drops anything that is not a verdict about a known file', () => {
    expect(parseStore({
      'words/kat': { verdict: 'goed', lastModified: 'x' },
      'words/tas': { verdict: 'prima', lastModified: 'x' },
      'words/bos': { verdict: 'goed' },
      'words/pen': 'goed',
      'words/mus': null,
    })).toEqual({ 'words/kat': { verdict: 'goed', lastModified: 'x' } })
  })

  it('survives junk in localStorage rather than taking the studio down with it', () => {
    expect(parseStore(null)).toEqual({})
    expect(parseStore('nope')).toEqual({})
    expect(parseStore(42)).toEqual({})
  })
})

describe('mergeStores', () => {
  it('lets the file on disk win, since it is the one shared between browsers', () => {
    const disk = { 'words/kat': { verdict: 'goed' as const, lastModified: 'a' } }
    const local = {
      'words/kat': { verdict: 'afgekeurd' as const, lastModified: 'a' },
      'words/tas': { verdict: 'goed' as const, lastModified: 'b' },
    }
    expect(mergeStores(disk, local)).toEqual({
      'words/kat': { verdict: 'goed', lastModified: 'a' },
      'words/tas': { verdict: 'goed', lastModified: 'b' },
    })
  })
})
