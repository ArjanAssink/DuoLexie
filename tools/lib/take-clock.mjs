/**
 * Getting the cue sheet and the recording onto the same clock, before anything is assigned.
 *
 * Two things pull them apart, and both are pure arithmetic, so they live here with the rest
 * of the numbers rather than inside tools/split-take.mjs next to the ffmpeg calls.
 *
 * @typedef {{ id: string, shownAt: number, hiddenAt: number, retake?: boolean }} Cue
 * @typedef {{ from: number, to: number }} Pause
 */

/**
 * How much of the wall clock had already been spent paused by `atMs`.
 *
 * This is a correction to docs/recording-pipeline-v2.md §4.1, which says only that the
 * splitter should not look for speech inside a pause. That is necessary but not sufficient:
 * `MediaRecorder.pause()` stops producing data, so those milliseconds are not silence in the
 * take — they are *absent from it*. `performance.now()`, which the cue sheet is written
 * against, keeps counting through them. A 12-second pause therefore puts every cue after it
 * 12 seconds late, and the splitter would cut a whole take's worth of wrong words while
 * reporting every row `ok`.
 *
 * Only pauses that have fully elapsed count: a cue inside a pause has no audio to be late
 * for, and is dropped by toAudioClock rather than shifted.
 */
export function elapsedPauseMs(pauses, atMs) {
  let total = 0
  for (const p of pauses) {
    if (p.to <= atMs) total += p.to - p.from
  }
  return total
}

/**
 * Cue sheet times (wall clock from `MediaRecorder.start()`) → take times (samples).
 *
 * `offsetMs` is the second correction, and the one §4.3 asks for: the beeps. There is no
 * promise that `MediaRecorder.start()` returns at the instant the first sample is captured,
 * and the gap varies by browser and by how busy the machine was. The countdown beeps are
 * recorded into the take on purpose so the splitter can measure that gap instead of trusting
 * it, and pass the difference in here. When the beeps cannot be found it is 0 and the
 * recorder start is trusted, with a warning in the report.
 *
 * `seams` come back alongside: where each pause *was*, once its length has been taken out.
 * The take is spliced at those points, so nothing downstream may look across one.
 *
 * @param {Cue[]} cues
 * @param {Pause[]} pauses
 * @param {number} offsetMs
 * @returns {{ cues: Cue[], dropped: { id: string, reason: 'paused' }[], seams: number[] }}
 */
export function toAudioClock(cues, pauses = [], offsetMs = 0) {
  /** @type {Cue[]} */
  const out = []
  /** @type {{ id: string, reason: 'paused' }[]} */
  const dropped = []
  for (const cue of cues) {
    if (pauses.some((p) => cue.shownAt >= p.from && cue.hiddenAt <= p.to)) {
      dropped.push({ id: cue.id, reason: 'paused' })
      continue
    }
    const shift = offsetMs - elapsedPauseMs(pauses, cue.shownAt)
    out.push({ ...cue, shownAt: cue.shownAt + shift, hiddenAt: cue.hiddenAt + shift })
  }
  const seams = pauses.map((p) => p.from + offsetMs - elapsedPauseMs(pauses, p.from))
  return { cues: out, dropped, seams }
}

/**
 * Which of the take's first bursts are the lead-in countdown (§4.3).
 *
 * Deliberately shape-based rather than a search for a known frequency: what identifies the
 * countdown is that it is short things, evenly spaced a second apart, the last of which is
 * higher than the ones before it. Nothing a human does in front of a microphone looks like
 * that, and a take whose beeps were generated at some other pitch — an older cue sheet, a
 * different browser's oscillator — still matches.
 *
 * Two allowances, both of them things a recorded take actually does. A run is searched for
 * rather than assumed at index 0, because the start of a take is where a stray click (the
 * mouse that pressed start, a chair) is most likely to be. And the *first* beep is treated as
 * unreliable: `MediaRecorder.start()` frequently returns partway through it, so it arrives
 * clipped, smeared by the encoder warming up, and at a pitch that measures nothing like the
 * tone it was — 552Hz for an 880Hz beep, in the take this was tuned against. So a run of
 * three is accepted as well as four, and the pitches are judged against their median with a
 * majority rather than requiring all of them to agree.
 *
 * What is never relaxed is the last beep standing clear of the rest. That is what says which
 * beep was the *last* one, and its end is the millisecond the whole alignment hangs on.
 *
 * @param {{ startMs: number, endMs: number, hz: number | null }[]} candidates first few bursts
 * @param {{ spacingMs?: number, toleranceMs?: number, maxDurationMs?: number, pitchRatio?: number }} [options]
 * @returns {{ first: number, beeps: typeof candidates, endMs: number } | null}
 */
export function chooseBeepRun(candidates, options = {}) {
  const spacingMs = options.spacingMs ?? 1000
  const toleranceMs = options.toleranceMs ?? 250
  const maxDurationMs = options.maxDurationMs ?? 350
  const pitchRatio = options.pitchRatio ?? 1.15

  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

  const looksLikeCountdown = (run) => {
    if (run.some((b) => b.endMs - b.startMs > maxDurationMs)) return false
    for (let i = 1; i < run.length; i++) {
      if (Math.abs(run[i].startMs - run[i - 1].startMs - spacingMs) > toleranceMs) return false
    }
    const counts = run.slice(0, -1).map((b) => b.hz).filter((hz) => hz)
    const zero = run[run.length - 1].hz
    if (!zero || counts.length === 0) return true // no pitch to go on: shape alone will do
    const mid = median(counts)
    const agreeing = counts.filter((hz) => Math.max(hz, mid) / Math.min(hz, mid) <= 1.2).length
    return agreeing >= Math.ceil(counts.length / 2) && zero / mid >= pitchRatio
  }

  // four beeps is the whole countdown; three is the same countdown with its first beep lost
  // to the recorder starting up, and the zero beep — the one that matters — is still there
  for (const length of [4, 3]) {
    for (let first = 0; first + length <= candidates.length; first++) {
      const run = candidates.slice(first, first + length)
      if (looksLikeCountdown(run)) return { first, beeps: run, endMs: run[length - 1].endMs }
    }
  }
  return null
}
