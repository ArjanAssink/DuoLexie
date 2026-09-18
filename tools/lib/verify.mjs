/**
 * Optional check of the cut clips with a local speech model (docs/recording-pipeline-v2.md §6).
 *
 * This **only flags, never decides**. Single isolated Dutch words are genuinely hard for ASR —
 * "kok" and "kook" differ by a vowel length that survives none of the usual preprocessing —
 * so a mismatch means "listen to this row", not "this clip is wrong". The cue sheet is still
 * what says which word is which; this is a second opinion on top of it.
 *
 * Backend is whisper.cpp: one binary and one model file, no Python and no virtualenv. Nothing
 * here is reachable unless --verify is passed, and --verify says what to install when it is
 * not there.
 *
 * Not implemented: the labelling mode of §6 that proposes a burst→word mapping for a take
 * with no cue sheet and a count mismatch. It is only reachable from a path that should not
 * happen once the studio is the way takes are made.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Above this, the transcript is different enough from the word to be worth an ear. */
const MISMATCH_DISTANCE = 0.4

export function whisperUnavailableMessage(bin) {
  return (
    `--verify needs whisper.cpp, and ${bin ? `"${bin}"` : '"whisper-cli"'} is not runnable.\n` +
    '  git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && cmake -B build && cmake --build build -j\n' +
    '  sh ./models/download-ggml-model.sh small\n' +
    'then pass --whisper-bin build/bin/whisper-cli --whisper-model models/ggml-small.bin\n' +
    '(faster-whisper is not wired up here; whisper.cpp keeps this to two files and no Python.)'
  )
}

/** Plain Levenshtein, normalised by the longer string, so 0 is identical and 1 is unrelated. */
export function normalisedDistance(a, b) {
  if (a === b) return 0
  if (a.length === 0 || b.length === 0) return 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length] / Math.max(a.length, b.length)
}

/** Lower-case, strip the punctuation whisper likes to add, collapse whitespace. */
export function normaliseText(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ').trim()
}

function runnable(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8' })
  return !r.error && r.status === 0
}

/**
 * Transcribe each written clip and compare it to the word it is named after.
 *
 * Word ids in this curriculum are the word itself (`shared/curriculum/words.json`), so the id
 * is the expected text; a clip whose id ever stops being the word would need the word list
 * passed in here instead.
 *
 * @param {{ id: string, file: string | null }[]} clips
 * @returns {{ ok: true, byId: Record<string, { transcript: string, distance: number, mismatch: boolean }> }
 *          | { ok: false, message: string }}
 */
export function verifyClips(clips, { bin, model } = {}) {
  const whisper = bin ?? 'whisper-cli'
  if (!runnable(whisper, ['--help'])) return { ok: false, message: whisperUnavailableMessage(bin) }
  if (!model || !existsSync(model)) {
    return { ok: false, message: `--verify needs a model file: --whisper-model <path to ggml-*.bin>${model ? ` (no such file: ${model})` : ''}` }
  }

  const work = mkdtempSync(join(tmpdir(), 'split-verify-'))
  try {
    const byId = {}
    for (const clip of clips) {
      if (!clip.file) continue
      // whisper.cpp reads 16kHz mono PCM and nothing else
      const wav = join(work, `${clip.id}.wav`)
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', clip.file, '-ac', '1', '-ar', '16000', wav], { stdio: 'ignore' })
      const out = spawnSync(whisper, ['-m', model, '-l', 'nl', '-nt', '-np', '-f', wav], { encoding: 'utf8' })
      if (out.status !== 0) return { ok: false, message: `whisper failed on ${clip.id}: ${(out.stderr ?? '').trim().split('\n').slice(-3).join(' ')}` }
      const transcript = normaliseText(out.stdout ?? '')
      const distance = normalisedDistance(normaliseText(clip.id), transcript)
      byId[clip.id] = { transcript, distance: Number(distance.toFixed(2)), mismatch: distance > MISMATCH_DISTANCE }
    }
    return { ok: true, byId }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
