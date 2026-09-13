/**
 * Burst → cue assignment for tools/split-take.mjs (docs/recording-pipeline-v2.md §4.1 step 4).
 *
 * Kept pure and audio-free on purpose: this is the only part of the splitter where a mistake
 * is silent — a wrong assignment writes a clip that plays the *previous* word, and nothing
 * downstream would notice. Everything here is a function of numbers, so it can be tested
 * exhaustively without a microphone, an ffmpeg, or a fixture (tools/lib/assign-bursts.test.mjs).
 *
 * All times are milliseconds on the take's own clock: 0 is the first sample of the recording.
 * The caller is responsible for having shifted the cue sheet onto that clock already (§4.3).
 *
 * @typedef {{ startMs: number, endMs: number }} Burst   a stretch of non-silence
 * @typedef {{ id: string, shownAt: number, hiddenAt: number, retake?: boolean }} Cue
 * @typedef {{ from: number, to: number }} Pause
 * @typedef {{ id: string, from: number, to: number, cue: Cue }} Window
 */

/** He may start a hair before the word appears… */
export const DEFAULT_LEAD_MS = 150
/** …and still be finishing it after the prompt is gone. */
export const DEFAULT_TAIL_MS = 400

/**
 * The cue that actually counts for each id, in the order the ids were first prompted.
 *
 * Space during the take marks the cue on screen `retake: true` and re-queues the word, so an
 * id can appear several times. The *last non-retake* entry is the good one. An id whose every
 * cue is marked (he fluffed the retake too, and the take ended there) has no good entry at
 * all; it is returned with `cue: null` so the caller can report it `missing` rather than
 * quietly cutting a take he already rejected.
 *
 * @param {Cue[]} cues
 * @returns {{ id: string, cue: Cue | null }[]}
 */
export function effectiveCues(cues) {
  /** @type {Map<string, Cue | null>} */
  const best = new Map()
  for (const cue of cues) {
    if (!best.has(cue.id)) best.set(cue.id, null)
    if (!cue.retake) best.set(cue.id, cue)
  }
  return [...best].map(([id, cue]) => ({ id, cue }))
}

/** Does `[aFrom, aTo)` overlap `[bFrom, bTo)` at all? */
function overlapMs(aFrom, aTo, bFrom, bTo) {
  return Math.min(aTo, bTo) - Math.max(aFrom, bFrom)
}

/**
 * The stretch of take to look for each word in, and the cues to not look at all.
 *
 * A window is skipped when its prompt sat inside a recorded pause: the recorder was paused,
 * so those milliseconds are not in the audio, and anything found there belongs to whatever
 * the recorder resumed on. (The studio closes a pause at the moment the first prompt after
 * the resume countdown appears, so the resume beeps are inside the pause too.)
 *
 * @param {Cue[]} cues
 * @param {{ leadMs?: number, tailMs?: number, pauses?: Pause[] }} [options]
 * @returns {{ windows: Window[], skipped: { id: string, reason: 'paused' }[], noCue: string[] }}
 */
export function cueWindows(cues, options = {}) {
  const leadMs = options.leadMs ?? DEFAULT_LEAD_MS
  const tailMs = options.tailMs ?? DEFAULT_TAIL_MS
  const pauses = options.pauses ?? []

  /** @type {Window[]} */
  const windows = []
  /** @type {{ id: string, reason: 'paused' }[]} */
  const skipped = []
  /** @type {string[]} */
  const noCue = []

  for (const { id, cue } of effectiveCues(cues)) {
    if (!cue) {
      noCue.push(id)
      continue
    }
    // measured on the prompt itself, not the padded window: the padding is slack for a
    // human, and letting it decide whether a cue is "in" a pause would drop good cues
    // that merely sit next to one
    const inPause = pauses.some((p) => cue.shownAt >= p.from && cue.hiddenAt <= p.to)
    if (inPause) {
      skipped.push({ id, reason: 'paused' })
      continue
    }
    windows.push({ id, from: cue.shownAt - leadMs, to: cue.hiddenAt + tailMs, cue })
  }
  return { windows, skipped, noCue }
}

/**
 * Which burst is which word.
 *
 * Windows deliberately overlap — at a 2.5s pace, 150ms of lead and 400ms of tail leave
 * neighbouring windows sharing 550ms around every prompt change — so a burst can fall in two
 * of them. Most of the time that means nothing: a word read 300ms after its prompt appeared
 * pokes into the previous window's tail padding while sitting comfortably inside its own
 * prompt. **Padding is slack, not evidence** — a burst contained entirely within one cue's
 * unpadded `[shownAt, hiddenAt)` belongs to that cue and is not ambiguous. Without that rule
 * every quick reader flags `boundary` and the report stops meaning anything.
 *
 * What is left is genuine: a burst that no single prompt contains, because he was still
 * saying one word when the next appeared, or the detector merged the two. That goes to the
 * window holding its **midpoint**, and *both* windows are flagged `boundary` — the one that
 * lost it may now be empty, and the one that won it may have taken a word that was really
 * said late for the previous prompt. Either way it is a row to listen to.
 *
 * Statuses are ranked by how much they cost to get wrong, worst first: `missing` writes no
 * file at all, `boundary` may write the wrong audio, `multiple` writes a guess (the longest
 * burst — a word beats a breath or a false start).
 *
 * @param {Burst[]} bursts sorted by startMs; already filtered for minimum length
 * @param {Cue[]} cues
 * @param {{ leadMs?: number, tailMs?: number, pauses?: Pause[] }} [options]
 * @returns {{
 *   assignments: { id: string, status: 'ok'|'missing'|'multiple'|'boundary', burst: Burst | null, window: Window | null, candidates: Burst[], flags: string[] }[],
 *   skipped: { id: string, reason: 'paused' }[],
 * }}
 */
export function assignBursts(bursts, cues, options = {}) {
  const { windows, skipped, noCue } = cueWindows(cues, options)

  /** window index → bursts whose midpoint elected it */
  const owned = windows.map(() => /** @type {Burst[]} */ ([]))
  const boundary = windows.map(() => false)

  for (const burst of bursts) {
    const hits = []
    for (let i = 0; i < windows.length; i++) {
      if (overlapMs(burst.startMs, burst.endMs, windows[i].from, windows[i].to) > 0) hits.push(i)
    }
    if (hits.length === 0) continue // a beep, a cough between prompts, the room settling
    let winner = hits[0]
    if (hits.length > 1) {
      // contained in exactly one prompt's own span → that prompt, unambiguously
      const contained = hits.filter((i) =>
        burst.startMs >= windows[i].cue.shownAt && burst.endMs <= windows[i].cue.hiddenAt)
      if (contained.length === 1) {
        owned[contained[0]].push(burst)
        continue
      }
      // the midpoint is tested against the *prompt*, not the padded window: padded windows
      // overlap, so a midpoint inside two of them says nothing, while "which word was on
      // screen when the middle of this burst happened" is the question actually being asked
      const mid = (burst.startMs + burst.endMs) / 2
      const containsMid = hits.find((i) => mid >= windows[i].cue.shownAt && mid < windows[i].cue.hiddenAt)
      // the midpoint can miss every prompt when it lands in the lead padding before the
      // first one, or in a gap a pause left behind — fall back on overlap rather than throw,
      // so an odd cue sheet still produces a report instead of a stack trace
      winner = containsMid ?? hits.reduce((best, i) =>
        overlapMs(burst.startMs, burst.endMs, windows[i].from, windows[i].to) >
        overlapMs(burst.startMs, burst.endMs, windows[best].from, windows[best].to) ? i : best)
      for (const i of hits) boundary[i] = true
    }
    owned[winner].push(burst)
  }

  const assignments = windows.map((window, i) => {
    const candidates = owned[i]
    const burst = candidates.length === 0
      ? null
      : candidates.reduce((a, b) => (b.endMs - b.startMs > a.endMs - a.startMs ? b : a))
    const flags = []
    if (boundary[i]) flags.push('boundary')
    if (candidates.length > 1) flags.push('multiple')
    if (burst === null) flags.push('missing')
    // `status` is the single worst thing about the row, because that is what the report and
    // the review screen sort on; `flags` keeps the rest, so a window that lost its only burst
    // across a prompt change reads "missing, and it was a boundary" rather than just one
    const status = burst === null ? 'missing'
      : boundary[i] ? 'boundary'
      : candidates.length > 1 ? 'multiple'
      : 'ok'
    return { id: window.id, status, burst, window, candidates, flags }
  })

  for (const id of noCue) {
    assignments.push({ id, status: 'missing', burst: null, window: null, candidates: [], flags: ['missing', 'all-retaken'] })
  }
  return { assignments, skipped }
}

/**
 * Assignment for a take with no cue sheet — one recorded in Audacity or on a phone (§4.2).
 *
 * Nothing here knows what was said, only how many things were said, so the *only* safe
 * mapping is burst n → id n, and it is only safe when the counts agree exactly. One cough,
 * one false start, one word said twice, and every clip after it is a different word under
 * the wrong name — the one failure this pipeline must never ship. So a mismatch refuses
 * outright and hands back the numbers to explain itself; `--verify` (§6) is the way through.
 *
 * @param {Burst[]} bursts
 * @param {string[]} ids
 * @returns {{ ok: true, assignments: { id: string, status: 'ok', burst: Burst, window: null, candidates: Burst[] }[] }
 *          | { ok: false, burstCount: number, idCount: number }}
 */
export function assignInOrder(bursts, ids) {
  if (bursts.length !== ids.length) {
    return { ok: false, burstCount: bursts.length, idCount: ids.length }
  }
  return {
    ok: true,
    assignments: ids.map((id, i) => ({
      id,
      status: /** @type {'ok'} */ ('ok'),
      burst: bursts[i],
      window: null,
      candidates: [bursts[i]],
      flags: /** @type {string[]} */ ([]),
    })),
  }
}
