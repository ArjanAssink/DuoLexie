import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elapsedPauseMs, toAudioClock, chooseBeepRun } from './take-clock.mjs'

test('nothing to correct: cues pass through unchanged', () => {
  const cues = [{ id: 'kat', shownAt: 3000, hiddenAt: 5500 }]
  assert.deepEqual(toAudioClock(cues, [], 0), { cues, dropped: [], seams: [] })
})

test('a pause leaves a seam where it was, with its length taken out', () => {
  const pauses = [{ from: 40_100, to: 52_800 }, { from: 70_000, to: 73_000 }]

  const { seams } = toAudioClock([], pauses, -30)

  // the first pause is spliced out at 40.1s (less the beep offset); the second is 3s further
  // into the wall clock than into the take, because the first one already took 12.7s out
  assert.deepEqual(seams, [40_070, 57_270])
})

test('the beep offset shifts every cue by the same amount', () => {
  const cues = [
    { id: 'kat', shownAt: 3000, hiddenAt: 5500 },
    { id: 'tas', shownAt: 5500, hiddenAt: 8000 },
  ]
  const { cues: shifted } = toAudioClock(cues, [], -40)

  assert.deepEqual(shifted.map((c) => [c.shownAt, c.hiddenAt]), [[2960, 5460], [5460, 7960]])
})

test('a pause removes its own length from every cue after it', () => {
  // Esc at 40.1s, resumed at 52.8s: 12.7s of wall clock that is not in the recording at all
  const pauses = [{ from: 40_100, to: 52_800 }]
  const cues = [
    { id: 'kat', shownAt: 3000, hiddenAt: 5500 },
    { id: 'bos', shownAt: 56_000, hiddenAt: 58_500 },
  ]

  const { cues: shifted } = toAudioClock(cues, pauses, 0)

  assert.deepEqual(shifted[0], { id: 'kat', shownAt: 3000, hiddenAt: 5500 })
  assert.deepEqual(shifted[1], { id: 'bos', shownAt: 43_300, hiddenAt: 45_800 })
})

test('pauses accumulate, and the beep offset applies on top', () => {
  const pauses = [{ from: 10_000, to: 12_000 }, { from: 30_000, to: 35_000 }]

  assert.equal(elapsedPauseMs(pauses, 5000), 0)
  assert.equal(elapsedPauseMs(pauses, 20_000), 2000)
  assert.equal(elapsedPauseMs(pauses, 40_000), 7000)

  const { cues } = toAudioClock([{ id: 'bos', shownAt: 40_000, hiddenAt: 42_500 }], pauses, -30)
  assert.deepEqual(cues[0], { id: 'bos', shownAt: 32_970, hiddenAt: 35_470 })
})

test('a cue that somehow sat inside a pause is dropped, not shifted into a neighbour', () => {
  const pauses = [{ from: 10_000, to: 20_000 }]
  const cues = [
    { id: 'kat', shownAt: 3000, hiddenAt: 5500 },
    { id: 'tas', shownAt: 12_000, hiddenAt: 14_500 },
    { id: 'bos', shownAt: 22_000, hiddenAt: 24_500 },
  ]

  const { cues: shifted, dropped } = toAudioClock(cues, pauses, 0)

  assert.deepEqual(dropped, [{ id: 'tas', reason: 'paused' }])
  assert.deepEqual(shifted.map((c) => c.id), ['kat', 'bos'])
})

test('retake marks survive the shift', () => {
  const { cues } = toAudioClock([{ id: 'tas', shownAt: 5500, hiddenAt: 8000, retake: true }], [], 100)
  assert.equal(cues[0].retake, true)
})

/** Four short bursts a second apart, the last one higher — what a countdown looks like. */
function countdown(from = 0, { zeroHz = 1320, countHz = 880, durationMs = 120 } = {}) {
  return [0, 1, 2, 3].map((i) => ({
    startMs: from + i * 1000,
    endMs: from + i * 1000 + durationMs,
    hz: i === 3 ? zeroHz : countHz,
  }))
}

test('the countdown is found, and its end is the anchor', () => {
  const bursts = [...countdown(), { startMs: 3400, endMs: 3900, hz: 210 }]

  const found = chooseBeepRun(bursts)

  assert.equal(found.first, 0)
  assert.equal(found.endMs, 3120)
})

test('a stray click before the countdown does not throw the search off', () => {
  const click = { startMs: 0, endMs: 30, hz: null }
  const bursts = [click, ...countdown(600)]

  const found = chooseBeepRun(bursts)

  assert.equal(found.first, 1)
  assert.equal(found.endMs, 3720)
})

test('four words are not a countdown: too long, and not evenly spaced', () => {
  const words = [
    { startMs: 3400, endMs: 3900, hz: 180 },
    { startMs: 5900, endMs: 6500, hz: 200 },
    { startMs: 8300, endMs: 8800, hz: 190 },
    { startMs: 10_900, endMs: 11_500, hz: 175 },
  ]
  assert.equal(chooseBeepRun(words), null)
})

test('four evenly spaced beeps all at the same pitch are not a countdown', () => {
  // it is the higher zero beep that says *which* beep was the last one, and that is the
  // millisecond the whole alignment hangs on
  assert.equal(chooseBeepRun(countdown(0, { zeroHz: 880 })), null)
})

test('beeps whose pitch could not be estimated still match on shape alone', () => {
  const run = countdown().map((b) => ({ ...b, hz: null }))
  assert.equal(chooseBeepRun(run).endMs, 3120)
})

test('three counts with no higher one at the end are not a countdown', () => {
  assert.equal(chooseBeepRun(countdown().slice(0, 3)), null)
  assert.equal(chooseBeepRun([]), null)
  assert.equal(chooseBeepRun(countdown().slice(0, 2)), null)
})

test('the first beep may be clipped and mismeasured, as the recorder starting up makes it', () => {
  // measured from a take recorded through the studio: MediaRecorder.start() returned partway
  // through beep one, so it arrived 186ms long and reading 552Hz for an 880Hz tone
  const run = [
    { startMs: 0, endMs: 186, hz: 552 },
    { startMs: 1067, endMs: 1186, hz: 859 },
    { startMs: 2067, endMs: 2186, hz: 859 },
    { startMs: 3067, endMs: 3187, hz: 1293 },
  ]

  const found = chooseBeepRun(run)

  assert.equal(found.first, 0)
  assert.equal(found.endMs, 3187)
})

test('a first beep lost entirely still leaves a findable countdown', () => {
  const run = countdown().slice(1)
  const found = chooseBeepRun(run)

  assert.equal(found.beeps.length, 3)
  assert.equal(found.endMs, 3120)
})

test('the zero beep is still required to stand clear, however lenient the rest is', () => {
  const flat = countdown().map((b, i) => ({ ...b, hz: i === 0 ? 552 : 880 }))
  assert.equal(chooseBeepRun(flat), null)
})

test('the countdown spacing follows the lead-in, so a 4s lead-in still matches', () => {
  const slow = [0, 1, 2, 3].map((i) => ({ startMs: i * 1333, endMs: i * 1333 + 120, hz: i === 3 ? 1320 : 880 }))

  assert.equal(chooseBeepRun(slow), null)
  assert.equal(chooseBeepRun(slow, { spacingMs: 1333 }).endMs, 4119)
})
