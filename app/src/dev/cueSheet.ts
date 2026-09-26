/**
 * The cue sheet: what the teleprompter writes next to a take so tools/split-take.mjs knows
 * which burst of speech is which word. Format and field names are fixed by
 * docs/recording-pipeline-v2.md §3.2; the splitter reads exactly this.
 *
 * Everything in here is pure. The prompt order in particular — which word comes next once
 * retakes are in play — is the one piece of teleprompter logic that can be wrong without
 * looking wrong on screen, so it lives here with tests rather than inside a component.
 *
 * All times are milliseconds from the moment `MediaRecorder.start()` was called, measured
 * with `performance.now()`. They keep counting through a pause even though the recorder does
 * not; `pauses` is what lets the splitter put the two clocks back together.
 */

import type { ClipKind } from '../audio/recorded'

/**
 * Which set a take reads. `weetjes` cues are whole sentences rather than single words
 * (docs/weetjes.md §7, docs/recording-pipeline-v2.md) — the id is `<card>-fact|doe|reveal`
 * and the teleprompter shows the sentence behind it, not the id.
 */
/**
 * A take records one kind of clip, and the kinds are the app's kinds.
 *
 * Defined in `audio/recorded.ts` and re-exported here, not declared twice: that module is the
 * seam docs/recording-studio-v3.md asks this change to leave for `docs/private-audio.md`,
 * which moves every clip out of `public/` and behind the API. A second copy of "which folder
 * does this kind live in" is exactly what made a Weetjes report play from `/audio/words/`
 * and hear nothing (§2.8).
 */
export type { AudioFolder } from '../audio/recorded'
export { folderFor } from '../audio/recorded'
export type TakeKind = ClipKind

export interface Cue {
  id: string
  shownAt: number
  hiddenAt: number
  /** he pressed Space (or Backspace on the one before): this take is not the one to cut */
  retake?: true
}

export interface Pause {
  /** `MediaRecorder.pause()` — from here to `to` there is no audio at all */
  from: number
  to: number
}

/**
 * Where the countdown was, as the teleprompter believes it. The splitter finds the beeps in
 * the audio and compares, which is how the gap between `MediaRecorder.start()` returning and
 * the first sample being captured gets measured instead of assumed (§4.3).
 */
export interface BeepPlan {
  spacingMs: number
  durationMs: number
  countHz: number
  zeroHz: number
  /** when the last (higher) beep finished — the moment both clocks can be anchored to */
  lastEndAt: number
}

export interface CueSheet {
  version: 1
  kind: TakeKind
  startedAt: string
  paceMs: number
  leadInMs: number
  beeps: BeepPlan
  cues: Cue[]
  pauses: Pause[]
  /**
   * The take these clips are replacing, when *Deze opnieuw opnemen* started this one.
   *
   * The splitter lifts a retake by the gain it gave that take instead of measuring this one
   * (docs/recording-studio-v3.md §2.6): three words measured alone do not land where the
   * twenty they have to sit among are.
   */
  retakeOf?: string
}

/** 3 · 2 · 1 and a higher one at zero. */
export const LEAD_IN_MS = 3000
export const BEEP_MS = 120
export const COUNT_HZ = 880
export const ZERO_HZ = 1320

/**
 * The beat between the zero beep and the first word appearing.
 *
 * Not just for the reader. `silencedetect` needs 350ms of quiet to call something a gap, so
 * a zero beep that lands 280ms before the first word is not separated from it — the splitter
 * sees one burst and cuts the beep into the first clip. Nearly a second of air makes the
 * countdown and the first word two unambiguously separate things, and gives him a moment.
 */
export const GO_GAP_MS = 800

/**
 * The slider's range. The ceiling is a Weetjes cue, not a word: a `doe` cue reads a question
 * and its three options, which is eight seconds at a pace a nine-year-old can follow.
 */
export const PACE_RANGE = { min: 1500, max: 9000 }
export const DEFAULT_PACE_MS: Record<TakeKind, number> = {
  woorden: 2500,
  klanken: 2000,
  weetjes: 7000,
  // "honden" and "Hoor je /cht/? Dan schrijf je cht. Behalve bij een werkwoord met een g:
  // ik lig, hij ligt." are in the same set; the pace has to fit the sentence, not the word.
  spelling: 5000,
}

/** `woorden-2026-09-14-1902` — sorts chronologically, and says what it is at a glance. */
export function takeBasename(kind: TakeKind, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    kind, '-', at.getFullYear(), '-', pad(at.getMonth() + 1), '-', pad(at.getDate()),
    '-', pad(at.getHours()), pad(at.getMinutes()),
  ].join('')
}

export function beepPlan(leadInMs: number): BeepPlan {
  return {
    spacingMs: leadInMs / 3,
    durationMs: BEEP_MS,
    countHz: COUNT_HZ,
    zeroHz: ZERO_HZ,
    lastEndAt: leadInMs + BEEP_MS,
  }
}

/**
 * Words still waiting to be read again, oldest first.
 *
 * An id is pending when its *last* cue is marked — which makes the whole thing self-
 * correcting without any separate queue to keep in step. Re-prompting a word appends an
 * unmarked cue and it drops off; pressing Space during the retake appends a marked one and
 * it comes back. A word marked twice never queues twice.
 */
export function pendingRetakes(cues: Cue[]): string[] {
  const last = new Map<string, Cue>()
  for (const cue of cues) last.set(cue.id, cue)
  const pending: string[] = []
  for (const [id, cue] of last) if (cue.retake) pending.push(id)
  return pending
}

/**
 * The next word to put on screen, or null when the take is done: the set in order, then
 * whatever he flagged, in the order he flagged it.
 */
export function nextPrompt(ids: string[], cues: Cue[]): string | null {
  // the first ids.length cues are the first pass, one per id, by construction — everything
  // after them is the retake round
  if (cues.length < ids.length) return ids[cues.length]
  return pendingRetakes(cues)[0] ?? null
}

/**
 * Flag the last committed cue — what Backspace means.
 *
 * Backspace exists because noticing a stumble takes a beat, and by then the prompt has moved
 * on. Space needs nothing here: the prompt on screen has no cue yet, so the teleprompter
 * marks it as it commits it. Backspace before anything has been read is a no-op rather than
 * an error; the take is running and there is nothing sensible to interrupt it for.
 */
export function markLastRetake(cues: Cue[]): Cue[] {
  const index = cues.length - 1
  if (index < 0) return cues
  return cues.map((cue, i) => (i === index ? { ...cue, retake: true as const } : cue))
}

/**
 * How far through the take he is: position in the set, and how many words are waiting to be
 * read again. `pending` counts from the moment a word is flagged rather than from the end of
 * the set, because it is the only acknowledgement Space and Backspace get — nothing else on
 * screen changes, and Backspace acts on a word that is no longer there to change.
 */
export function takeProgress(ids: string[], cues: Cue[]): { done: number; total: number; pending: number } {
  return {
    done: Math.min(cues.length, ids.length),
    total: ids.length,
    pending: pendingRetakes(cues).length,
  }
}

export function buildCueSheet(fields: {
  kind: TakeKind
  startedAt: Date
  paceMs: number
  leadInMs: number
  cues: Cue[]
  pauses: Pause[]
  retakeOf?: string | null
}): CueSheet {
  return {
    version: 1,
    kind: fields.kind,
    startedAt: fields.startedAt.toISOString(),
    paceMs: fields.paceMs,
    leadInMs: fields.leadInMs,
    beeps: beepPlan(fields.leadInMs),
    cues: fields.cues,
    pauses: fields.pauses,
    ...(fields.retakeOf ? { retakeOf: fields.retakeOf } : {}),
  }
}
