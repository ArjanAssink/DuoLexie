/**
 * The eight cases docs/recording-pipeline-v2.md §8 asks for, plus the ones the code invites.
 * Run with `node --test tools/`.
 *
 * Numbers below are on a 2.5s pace with the default 150ms lead and 400ms tail, so window n is
 * [shownAt-150, shownAt+2900) and neighbouring windows share 550ms — the overlap the boundary
 * rule exists for. Keeping the fixtures realistic matters: an assignment bug that only shows
 * up once windows overlap is exactly the one worth catching here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignBursts, assignInOrder, effectiveCues, cueWindows } from './assign-bursts.mjs'

const PACE = 2500
const LEAD_IN = 3000

/** Cue sheet for `ids` read back to back at 2.5s from a 3s lead-in. */
function cuesFor(ids, { from = LEAD_IN } = {}) {
  return ids.map((id, i) => ({
    id,
    shownAt: from + i * PACE,
    hiddenAt: from + (i + 1) * PACE,
  }))
}

/** A burst `durationMs` long, starting `afterMs` into the window of cue `i`. */
function burstIn(i, afterMs, durationMs, { from = LEAD_IN } = {}) {
  const startMs = from + i * PACE + afterMs
  return { startMs, endMs: startMs + durationMs }
}

const byId = (result) => Object.fromEntries(result.assignments.map((a) => [a.id, a]))

test('one burst per window is assigned to its own word', () => {
  const cues = cuesFor(['kat', 'tas', 'bos'])
  const bursts = [burstIn(0, 400, 450), burstIn(1, 500, 500), burstIn(2, 350, 480)]

  const got = byId(assignBursts(bursts, cues))

  assert.deepEqual(Object.keys(got), ['kat', 'tas', 'bos'])
  for (const [i, id] of ['kat', 'tas', 'bos'].entries()) {
    assert.equal(got[id].status, 'ok', id)
    assert.deepEqual(got[id].burst, bursts[i], id)
  }
})

test('two bursts in one window: the longest wins, and the row is flagged multiple', () => {
  // a false start ("k—") then the word, which is what this actually sounds like
  const falseStart = burstIn(1, 200, 90)
  const word = burstIn(1, 600, 520)
  const cues = cuesFor(['kat', 'tas', 'bos'])

  const got = byId(assignBursts([burstIn(0, 400, 450), falseStart, word, burstIn(2, 400, 450)], cues))

  assert.equal(got.tas.status, 'multiple')
  assert.deepEqual(got.tas.burst, word)
  assert.equal(got.tas.candidates.length, 2)
  assert.equal(got.kat.status, 'ok')
  assert.equal(got.bos.status, 'ok')
})

test('an empty window is missing, and carries no burst to cut', () => {
  const cues = cuesFor(['kat', 'tas', 'bos'])

  const got = byId(assignBursts([burstIn(0, 400, 450), burstIn(2, 400, 450)], cues))

  assert.equal(got.tas.status, 'missing')
  assert.equal(got.tas.burst, null)
  assert.equal(got.kat.status, 'ok')
})

test('a burst straddling two windows goes to the window holding its midpoint, and flags both', () => {
  const cues = cuesFor(['kat', 'tas', 'bos'])
  // said late: starts 2400ms into kat's slot (100ms before tas appears) and runs 400ms past
  // the change, so neither prompt contains it. Midpoint 2650ms into kat's slot is past the
  // change, so tas takes it — and kat, which had nothing else, comes back missing.
  const late = burstIn(0, 2400, 500)

  const got = byId(assignBursts([late, burstIn(2, 400, 450)], cues))

  assert.deepEqual(got.tas.burst, late)
  assert.equal(got.tas.status, 'boundary')
  // kat lost the only burst that touched it, and `missing` outranks the flag: there is no
  // file to listen to, which is worse than a file to double-check
  assert.equal(got.kat.status, 'missing')
  assert.deepEqual(got.kat.flags, ['boundary', 'missing'])
  assert.equal(got.bos.status, 'ok')
})

test('a straddling burst whose midpoint stays in the first window keeps it there', () => {
  const cues = cuesFor(['kat', 'tas', 'bos'])
  // still saying tas as bos appears, and the detector ran the two together: no single prompt
  // contains it, midpoint 150ms before the change, so tas keeps it
  const late = burstIn(1, 2100, 600) // [7600, 8200), midpoint 7900 — tas is still on screen
  const got = byId(assignBursts([burstIn(0, 400, 450), late], cues))

  assert.deepEqual(got.tas.burst, late)
  assert.equal(got.tas.status, 'boundary')
  // bos lost the burst that touched it, so its status is the worse of the two things true
  // about it — but the flag survives, which is what says *why* it went missing
  assert.equal(got.bos.status, 'missing')
  assert.deepEqual(got.bos.flags, ['boundary', 'missing'])
  assert.equal(got.bos.burst, null)
})

test('a word read quickly pokes into the previous tail padding and is still not ambiguous', () => {
  // The commonest shape in a real take: windows share 550ms around every prompt change, so
  // any reaction time under 400ms overlaps two of them. Flagging those would flag nearly
  // every row. The burst sits wholly inside its own prompt, so it is simply that word.
  const cues = cuesFor(['kat', 'tas', 'bos'])
  const quick = burstIn(1, 300, 500)

  const got = byId(assignBursts([burstIn(0, 400, 450), quick, burstIn(2, 400, 450)], cues))

  assert.equal(got.tas.status, 'ok')
  assert.deepEqual(got.tas.burst, quick)
  assert.equal(got.kat.status, 'ok')
})

test('a retaken word uses its last non-retake cue, not the one he rejected', () => {
  const cues = [
    ...cuesFor(['kat', 'tas', 'bos']),
    // Space during tas: re-queued and read again after the last word of the set
    { id: 'tas', shownAt: LEAD_IN + 4 * PACE, hiddenAt: LEAD_IN + 5 * PACE },
  ]
  cues[1].retake = true

  const fluffed = burstIn(1, 400, 450)
  const good = burstIn(4, 400, 520)
  const got = byId(assignBursts([burstIn(0, 400, 450), fluffed, burstIn(2, 400, 450), good], cues))

  assert.deepEqual(got.tas.burst, good)
  assert.equal(got.tas.status, 'ok')
  // the rejected take is simply not looked at — no window covers it, so it is dropped
  assert.equal(effectiveCues(cues).find((c) => c.id === 'tas').cue.shownAt, LEAD_IN + 4 * PACE)
})

test('a word whose every cue is marked for retake is missing, not cut from the bad take', () => {
  const cues = cuesFor(['kat', 'tas'])
  cues[1].retake = true

  const got = byId(assignBursts([burstIn(0, 400, 450), burstIn(1, 400, 450)], cues))

  assert.equal(got.tas.status, 'missing')
  assert.equal(got.tas.burst, null)
  assert.equal(got.tas.window, null)
  assert.ok(got.tas.flags.includes('all-retaken'))
})

test('windows inside a recorded pause are skipped, not reported missing', () => {
  const cues = cuesFor(['kat', 'tas', 'bos'])
  // Esc after kat; the pause closes when bos appears, so tas's prompt is inside it and the
  // resume countdown's beeps are too
  const pauses = [{ from: cues[1].shownAt - 10, to: cues[2].shownAt + 10 }]

  const result = assignBursts([burstIn(0, 400, 450), burstIn(2, 400, 450)], cues, { pauses })
  const got = byId(result)

  assert.deepEqual(result.skipped, [{ id: 'tas', reason: 'paused' }])
  assert.equal(got.tas, undefined)
  assert.equal(got.kat.status, 'ok')
  assert.equal(got.bos.status, 'ok')
})

test('a pause next to a cue does not swallow it', () => {
  const cues = cuesFor(['kat', 'tas'])
  // the padded window pokes into the pause, the prompt itself does not
  const pauses = [{ from: cues[1].hiddenAt, to: cues[1].hiddenAt + 9000 }]

  const got = byId(assignBursts([burstIn(0, 400, 450), burstIn(1, 400, 450)], cues, { pauses }))

  assert.equal(got.tas.status, 'ok')
})

test('bursts outside every window — beeps, coughs — are ignored', () => {
  const cues = cuesFor(['kat'])
  const beeps = [0, 1000, 2000, 3000].map((at) => ({ startMs: at, endMs: at + 120 }))
  // the lead-in beeps land before kat's window opens at 2850ms… except the zero beep, which
  // sounds exactly as the first prompt appears, so it is inside it
  const got = byId(assignBursts([...beeps.slice(0, 3), burstIn(0, 400, 450)], cues))

  assert.equal(got.kat.status, 'ok')
})

test('the lead and tail slack are configurable, and widen the window', () => {
  const cues = cuesFor(['kat'])
  const early = { startMs: LEAD_IN - 300, endMs: LEAD_IN - 200 }

  assert.equal(byId(assignBursts([early], cues)).kat.status, 'missing')
  assert.equal(byId(assignBursts([early], cues, { leadMs: 400 })).kat.status, 'ok')
})

test('cueWindows pads the prompt on both sides', () => {
  const { windows } = cueWindows(cuesFor(['kat']))

  assert.deepEqual(windows, [
    { id: 'kat', from: LEAD_IN - 150, to: LEAD_IN + PACE + 400, cue: { id: 'kat', shownAt: LEAD_IN, hiddenAt: LEAD_IN + PACE } },
  ])
})

test('no cue sheet, matching counts: bursts map to ids in order', () => {
  const bursts = [
    { startMs: 500, endMs: 900 },
    { startMs: 2000, endMs: 2600 },
    { startMs: 4000, endMs: 4400 },
  ]

  const result = assignInOrder(bursts, ['kat', 'tas', 'bos'])

  assert.equal(result.ok, true)
  assert.deepEqual(result.assignments.map((a) => [a.id, a.burst]), [
    ['kat', bursts[0]], ['tas', bursts[1]], ['bos', bursts[2]],
  ])
  assert.ok(result.assignments.every((a) => a.status === 'ok'))
})

test('no cue sheet, mismatched counts: refuses and reports both numbers', () => {
  const bursts = [
    { startMs: 500, endMs: 900 },
    { startMs: 1400, endMs: 1500 }, // the cough
    { startMs: 2000, endMs: 2600 },
    { startMs: 4000, endMs: 4400 },
  ]

  const result = assignInOrder(bursts, ['kat', 'tas', 'bos'])

  assert.equal(result.ok, false)
  assert.equal(result.burstCount, 4)
  assert.equal(result.idCount, 3)
  assert.equal(result.assignments, undefined)
})
