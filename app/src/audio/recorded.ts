/**
 * The two seams docs/recording-studio-v3.md asks this change to leave behind: one answer to
 * *does this id have a clip*, and one place a clip URL is built.
 *
 * Both exist for what comes next rather than for what is here now. `docs/private-audio.md`
 * moves every clip out of `public/` into private storage behind `/api/audio/{kind}/{id}`,
 * and the voice stops being something a URL can be guessed for. If the answer to either
 * question is spelled out at each call site — and it was, in four files and three different
 * ternaries — that move is a rewrite touching the games, the studio and the report. Through
 * here it is two functions.
 *
 * In dev the backing list is the studio plugin's virtual module, whose Sets are refilled in
 * place when a clip is written to `public/audio/` (§3.2), so a clip the splitter wrote a
 * second ago is usable without a dev-server restart. A production build gets the same module
 * with the list read at build time.
 */

import {
  recordedSounds,
  recordedSpelling,
  recordedWeetjes,
  recordedWords,
} from 'virtual:recorded-audio'

/** The kinds of clip the app has, named as the recording studio names its sets. */
export type ClipKind = 'klanken' | 'woorden' | 'weetjes' | 'spelling'

/** The directory each kind lives in under `public/audio/`. */
export type AudioFolder = 'sounds' | 'words' | 'weetjes' | 'spelling'

const FOLDERS: Record<ClipKind, AudioFolder> = {
  klanken: 'sounds',
  woorden: 'words',
  weetjes: 'weetjes',
  spelling: 'spelling',
}

const SETS: Record<ClipKind, ReadonlySet<string>> = {
  klanken: recordedSounds,
  woorden: recordedWords,
  weetjes: recordedWeetjes,
  spelling: recordedSpelling,
}

/**
 * Where a kind's clips live.
 *
 * It used to be three answers and one of them was wrong: `TakeReview` computed `kind ===
 * 'klanken' ? 'sounds' : 'words'`, so every Weetjes report played from `/audio/words/`,
 * found nothing, and reported nothing about it (§2.8).
 */
export function folderFor(kind: ClipKind): AudioFolder {
  return FOLDERS[kind]
}

export function hasRecording(kind: ClipKind, id: string): boolean {
  return SETS[kind].has(id)
}

export function recordedIds(kind: ClipKind): string[] {
  return [...SETS[kind]]
}

export function recordedCount(kind: ClipKind, ids: string[]): number {
  return ids.filter((id) => SETS[kind].has(id)).length
}

/**
 * The URL of one clip.
 *
 * `version` is the cache-buster and the caller decides what it means: the build stamp for the
 * games, where a clip changes only when a deploy happens, and the file's own `Last-Modified`
 * for the studio, where a retake overwrites the same URL mid-session and both the browser and
 * the service worker will otherwise keep handing back the take before it — which during a
 * judging pass means approving audio that no longer exists.
 */
export function clipSrc(kind: ClipKind, id: string, version?: string | null): string {
  const base = `/audio/${FOLDERS[kind]}/${encodeURIComponent(id)}.mp3`
  return version ? `${base}?v=${encodeURIComponent(version)}` : base
}
