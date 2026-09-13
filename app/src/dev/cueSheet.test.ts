import { describe, it, expect } from 'vitest'
import {
  buildCueSheet, markLastRetake, nextPrompt, pendingRetakes, takeBasename, takeProgress,
  type Cue,
} from './cueSheet'

const SET = ['kat', 'tas', 'bos']

/** A committed cue at an arbitrary but increasing time — the timings are not what is tested. */
function cue(id: string, index: number, retake?: true): Cue {
  return { id, shownAt: 3800 + index * 2500, hiddenAt: 3800 + (index + 1) * 2500, ...(retake ? { retake } : {}) }
}

describe('takeBasename', () => {
  it('names a take by kind and local minute, so takes sort chronologically', () => {
    expect(takeBasename('woorden', new Date('2026-09-14T19:02:11+02:00'))).toBe('woorden-2026-09-14-1902')
  })

  it('pads every field, so the string length never changes', () => {
    expect(takeBasename('klanken', new Date('2026-01-05T07:04:00+01:00'))).toBe('klanken-2026-01-05-0704')
  })
})

describe('nextPrompt', () => {
  it('walks the set in order', () => {
    expect(nextPrompt(SET, [])).toBe('kat')
    expect(nextPrompt(SET, [cue('kat', 0)])).toBe('tas')
    expect(nextPrompt(SET, [cue('kat', 0), cue('tas', 1)])).toBe('bos')
  })

  it('ends the take when the set is done and nothing was flagged', () => {
    expect(nextPrompt(SET, SET.map((id, i) => cue(id, i)))).toBe(null)
  })

  it('shows a flagged word again after the last word of the set', () => {
    const cues = [cue('kat', 0), cue('tas', 1, true), cue('bos', 2)]
    expect(nextPrompt(SET, cues)).toBe('tas')
  })

  it('shows flagged words in the order they were flagged', () => {
    const cues = [cue('kat', 0, true), cue('tas', 1, true), cue('bos', 2)]
    expect(nextPrompt(SET, cues)).toBe('kat')
    expect(nextPrompt(SET, [...cues, cue('kat', 3)])).toBe('tas')
  })

  it('drops a word off the queue once it has been read again', () => {
    const cues = [cue('kat', 0), cue('tas', 1, true), cue('bos', 2), cue('tas', 3)]
    expect(pendingRetakes(cues)).toEqual([])
    expect(nextPrompt(SET, cues)).toBe(null)
  })

  it('puts it straight back if the retake was fluffed too', () => {
    const cues = [cue('kat', 0), cue('tas', 1, true), cue('bos', 2), cue('tas', 3, true)]
    expect(nextPrompt(SET, cues)).toBe('tas')
  })

  it('never queues a word twice for being flagged twice', () => {
    // Space and then Backspace on the next prompt can both land on the same word
    const cues = [cue('kat', 0, true), cue('tas', 1), cue('bos', 2)]
    expect(pendingRetakes(markLastRetake(markLastRetake(cues)))).toEqual(['kat', 'bos'])
  })
})

describe('markLastRetake', () => {
  it('flags the cue before the one on screen — what Backspace is for', () => {
    const cues = [cue('kat', 0), cue('tas', 1)]
    expect(markLastRetake(cues).map((c) => c.retake)).toEqual([undefined, true])
  })

  it('does nothing before the first word has been read', () => {
    expect(markLastRetake([])).toEqual([])
  })

  it('leaves the cues it does not flag untouched', () => {
    const cues = [cue('kat', 0), cue('tas', 1)]
    expect(markLastRetake(cues)[0]).toBe(cues[0])
  })
})

describe('takeProgress', () => {
  it('counts the first pass against the set', () => {
    expect(takeProgress(SET, [cue('kat', 0)])).toEqual({ done: 1, total: 3, pending: 0 })
  })

  it('switches to counting what is left to redo once the set is done', () => {
    const cues = [cue('kat', 0), cue('tas', 1, true), cue('bos', 2, true)]
    expect(takeProgress(SET, cues)).toEqual({ done: 3, total: 3, pending: 2 })
  })

  it('counts a flag straight away, since it is the only sign the key did anything', () => {
    expect(takeProgress(SET, [cue('kat', 0, true)])).toEqual({ done: 1, total: 3, pending: 1 })
  })
})

describe('buildCueSheet', () => {
  it('writes the shape tools/split-take.mjs reads, beeps included', () => {
    const sheet = buildCueSheet({
      kind: 'woorden',
      startedAt: new Date('2026-09-14T19:02:11.000Z'),
      paceMs: 2500,
      leadInMs: 3000,
      cues: [cue('kat', 0)],
      pauses: [{ from: 40_100, to: 52_800 }],
    })

    expect(sheet.version).toBe(1)
    expect(sheet.startedAt).toBe('2026-09-14T19:02:11.000Z')
    // the anchor the splitter measures the recorder-start skew against
    expect(sheet.beeps).toEqual({ spacingMs: 1000, durationMs: 120, countHz: 880, zeroHz: 1320, lastEndAt: 3120 })
    expect(sheet.pauses).toEqual([{ from: 40_100, to: 52_800 }])
  })
})
