/**
 * What Arjan thinks of each clip (docs/recording-studio-v3.md §2.1).
 *
 * The splitter can hear levels and silence. It cannot hear that a word was read oddly, that
 * the `s` got smeared, or that a sentence trailed off — and those are the reasons a clip
 * actually gets re-recorded. Until now that judgement lived in his head between one evening
 * and the next, which meant a clip he disliked stayed in the app until he happened to
 * remember it.
 *
 * The rules that make this survive contact with a real session are all in here, pure, because
 * getting any of them wrong is invisible: a verdict that silently survives a retake, or one
 * that silently does not, both look like a working screen.
 */

import type { AudioFolder } from './cueSheet'

/** What a person can say about a clip. `onbeoordeeld` is the absence of one, not a value. */
export type Verdict = 'goed' | 'afgekeurd'

/**
 * What the grid shows, in the order §2.1 gives: worst first, so a set is read at a glance.
 * `ontbreekt` and `afgekeurd` both mean "the next take records this".
 */
export type ClipState = 'ontbreekt' | 'onbeoordeeld' | 'goed' | 'afgekeurd'

export interface VerdictEntry {
  verdict: Verdict
  /**
   * The `Last-Modified` of the file that was judged.
   *
   * This is the whole reason a verdict is not just a string. A verdict belongs to a *file*,
   * not to an id: the moment a retake lands, the old opinion is about audio that no longer
   * exists. Without this a rejected word would come back from its retake still wearing the ❌
   * that sent it away — and, because ❌ counts as missing, would queue itself forever.
   */
  lastModified: string
}

/** Keyed `<folder>/<id>`, so the three sets cannot collide on an id like `aan`. */
export type VerdictStore = Record<string, VerdictEntry>

/** Tier 1 storage. Tier 2 moves this to recordings/verdicts.json and migrates it once. */
export const VERDICTS_KEY = 'duolexie-studio-verdicts'

/** What a HEAD probe of `/audio/<folder>/<id>.mp3` found. */
export interface ClipProbe {
  present: boolean
  /** `null` when the server sent no `Last-Modified` — then a verdict can only be trusted. */
  lastModified: string | null
}

export const MISSING: ClipProbe = { present: false, lastModified: null }

/** The four-state alphabet §2.1 gives, in the order it gives them: worst first. */
export const STATE_ICON: Record<ClipState, string> = {
  ontbreekt: '⬜',
  onbeoordeeld: '🎧',
  goed: '✅',
  afgekeurd: '❌',
}

export const STATE_TITLE: Record<ClipState, string> = {
  ontbreekt: 'nog niet opgenomen',
  onbeoordeeld: 'opgenomen, nog niet beluisterd',
  goed: 'goedgekeurd',
  afgekeurd: 'afgekeurd — de volgende take neemt hem opnieuw op',
}

export function verdictKey(folder: AudioFolder, id: string): string {
  return `${folder}/${id}`
}

/**
 * The state of one clip: what is on disk, and what he said about it if it is still the same
 * file he said it about.
 *
 * A changed `Last-Modified` resets to `onbeoordeeld` — compared for *inequality*, not for
 * "newer". A file restored from a backup, or a clip copied back out of `recordings/afgekeurd/`,
 * is an older timestamp and is still a different recording from the one that was judged.
 * When the server sends no `Last-Modified` at all there is nothing to compare, and keeping the
 * verdict is the better failure: losing one is an annoyance, inheriting one across a retake is
 * a wrong answer that hides itself.
 */
export function clipState(store: VerdictStore, folder: AudioFolder, id: string, probe: ClipProbe): ClipState {
  const entry = store[verdictKey(folder, id)]
  // A rejected clip keeps its ❌ after the file has gone, because with the dev middleware
  // rejecting *moves* the mp3 to recordings/afgekeurd/. Operationally ❌ and ⬜ mean the same
  // thing — record this — but they are not the same fact, and "I listened to this and threw
  // it away" is worth being able to see. A `goed` verdict about a file that has vanished is
  // meaningless and goes.
  if (!probe.present) return entry?.verdict === 'afgekeurd' ? 'afgekeurd' : 'ontbreekt'
  if (!entry) return 'onbeoordeeld'
  if (probe.lastModified !== null && entry.lastModified !== probe.lastModified) return 'onbeoordeeld'
  return entry.verdict
}

/**
 * Whether the next take has to record this id.
 *
 * Rejecting is not bookkeeping followed by more bookkeeping: it is the same act as never
 * having recorded the clip. That is what makes "alleen ontbrekende" and the *Start take*
 * count pick a rejected word up with nothing else to remember, which is the difference
 * between a loop that gets run three times in an evening and one that does not.
 */
export function countsAsMissing(state: ClipState): boolean {
  return state === 'ontbreekt' || state === 'afgekeurd'
}

export function isMissing(store: VerdictStore, folder: AudioFolder, id: string, probe: ClipProbe): boolean {
  return countsAsMissing(clipState(store, folder, id, probe))
}

/** `⬜ 3 · 🎧 5 · ✅ 11 · ❌ 1` for the header, and `goed / totaal` for the set buttons. */
export function countStates(
  store: VerdictStore,
  folder: AudioFolder,
  ids: string[],
  probes: Record<string, ClipProbe>,
): Record<ClipState, number> {
  const counts: Record<ClipState, number> = { ontbreekt: 0, onbeoordeeld: 0, goed: 0, afgekeurd: 0 }
  for (const id of ids) counts[clipState(store, folder, id, probes[id] ?? MISSING)]++
  return counts
}

/**
 * Write a verdict, or clear one (`null`).
 *
 * Returns a new store rather than mutating: the caller is React state, and the verdict for a
 * clip whose file is unknown is dropped rather than stored against `null`, since an entry
 * with no `lastModified` could never be invalidated by a retake.
 */
export function withVerdict(
  store: VerdictStore,
  folder: AudioFolder,
  id: string,
  verdict: Verdict | null,
  probe: ClipProbe,
): VerdictStore {
  const key = verdictKey(folder, id)
  const next = { ...store }
  if (verdict === null || probe.lastModified === null) delete next[key]
  if (verdict !== null && probe.lastModified !== null) next[key] = { verdict, lastModified: probe.lastModified }
  return next
}

/** Anything that is not a `{verdict, lastModified}` map is treated as no verdicts at all. */
export function parseStore(raw: unknown): VerdictStore {
  if (!raw || typeof raw !== 'object') return {}
  const out: VerdictStore = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const { verdict, lastModified } = value as Partial<VerdictEntry>
    if ((verdict === 'goed' || verdict === 'afgekeurd') && typeof lastModified === 'string') {
      out[key] = { verdict, lastModified }
    }
  }
  return out
}

export function readLocalVerdicts(): VerdictStore {
  try {
    return parseStore(JSON.parse(localStorage.getItem(VERDICTS_KEY) ?? '{}'))
  } catch {
    return {}
  }
}

export function writeLocalVerdicts(store: VerdictStore): void {
  try {
    localStorage.setItem(VERDICTS_KEY, JSON.stringify(store))
  } catch {
    // a full or disabled localStorage loses verdicts, which is a nuisance and not a failure
    // worth interrupting a recording session for
  }
}

export function clearLocalVerdicts(): void {
  try {
    localStorage.removeItem(VERDICTS_KEY)
  } catch { /* see above */ }
}

/**
 * Fold the browser's verdicts into the ones on disk, for the one-time Tier 2 migration.
 *
 * Disk wins on a conflict: `recordings/verdicts.json` is shared between browsers and visible
 * to the tools, so it is the newer opinion by construction — the localStorage copy is
 * whatever this particular browser happened to be left with before the middleware existed.
 */
export function mergeStores(disk: VerdictStore, local: VerdictStore): VerdictStore {
  return { ...local, ...disk }
}
