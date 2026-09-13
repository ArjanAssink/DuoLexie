/**
 * End to end, with no microphone and no judgement calls: generate a take whose every word
 * boundary is known to the sample, split it, and check the clips came out where they should.
 *
 * The point is the seam between the pure logic (tools/lib/*.test.mjs) and ffmpeg. Those tests
 * prove the arithmetic; this one proves that what silencedetect reports, what loudnorm does to
 * the levels, and what the cue sheet says are all on the same clock — which is exactly what a
 * real take would fail at silently, by producing a full set of confidently mislabelled mp3s.
 *
 * Skips rather than fails without ffmpeg, so the Claude sandbox and any machine without it
 * still get a clean run; GitHub's ubuntu runners have it and do run this.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { hasFfmpeg } from './lib/audio.mjs'

const SPLIT_TAKE = fileURLToPath(new URL('./split-take.mjs', import.meta.url))
const RATE = 48_000
const LEAD_IN_MS = 3000
const BEEP_MS = 120
const GO_GAP_MS = 800
const PACE_MS = 2500

const ffmpegMissing = !hasFfmpeg()
const skip = ffmpegMissing ? { skip: 'ffmpeg is not on PATH' } : {}

/** Mono 16-bit WAV from a float array — no dependency, and exact about where things start. */
function writeWav(path, samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([header, data]))
}

/**
 * A tone with 5ms raised-cosine edges, added into `samples` at `atMs`.
 *
 * The edges matter: a tone that starts on a step is a click, and a click is broadband, which
 * would let silencedetect find an onset the eye can see in the spec but the ear never would.
 * Soft edges make the detector work for its answer the way a spoken word does.
 */
function addTone(samples, atMs, durationMs, hz, amplitude) {
  const start = Math.round((atMs / 1000) * RATE)
  const length = Math.round((durationMs / 1000) * RATE)
  const edge = Math.round(0.005 * RATE)
  for (let i = 0; i < length; i++) {
    const ramp = i < edge ? i / edge : i > length - edge ? (length - i) / edge : 1
    const env = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, ramp)))
    samples[start + i] += amplitude * env * Math.sin((2 * Math.PI * hz * i) / RATE)
  }
}

/** The room: quiet, steady, and well below anything spoken. */
function addFloor(samples, amplitude) {
  let last = 0
  for (let i = 0; i < samples.length; i++) {
    last = 0.97 * last + 0.03 * (Math.random() * 2 - 1)
    samples[i] += last * amplitude
  }
}

/**
 * Build a take and its cue sheet. `words` are read in order at `paceMs`, each spoken
 * `reactionMs` after its prompt appears; `pauseAfter` inserts an Esc pause (and its resume
 * countdown) after that many words, the way the studio would write it.
 */
function makeTake(dir, { kind = 'woorden', words, pauseAfter = null, pauseMs = 9000, retakeIndex = null, retakeWord = null }) {
  const cues = []
  const pauses = []
  /** what the recording actually contains, in take time */
  const events = []

  let takeMs = 0
  let wallMs = 0
  const countdown = () => {
    for (let i = 0; i < 3; i++) events.push({ atMs: takeMs + i * 1000, durationMs: BEEP_MS, hz: 880, amplitude: 0.25 })
    events.push({ atMs: takeMs + LEAD_IN_MS, durationMs: BEEP_MS, hz: 1320, amplitude: 0.25 })
    takeMs += LEAD_IN_MS + GO_GAP_MS
    wallMs += LEAD_IN_MS + GO_GAP_MS
  }
  countdown()

  const queue = words.map((w, i) => ({ ...w, retake: i === retakeIndex }))
  if (retakeIndex !== null) queue.push({ ...words[retakeIndex], ...retakeWord, retake: false })

  for (const [i, word] of queue.entries()) {
    cues.push({ id: word.id, shownAt: wallMs, hiddenAt: wallMs + PACE_MS, ...(word.retake ? { retake: true } : {}) })
    events.push({ atMs: takeMs + word.reactionMs, durationMs: word.durationMs, hz: word.hz, amplitude: 0.35 })
    takeMs += PACE_MS
    wallMs += PACE_MS
    if (pauseAfter !== null && i === pauseAfter - 1) {
      // Esc: performance.now() keeps counting, MediaRecorder.pause() stops capturing, so the
      // wall clock gains `pauseMs` that the take never sees
      pauses.push({ from: wallMs, to: wallMs + pauseMs })
      wallMs += pauseMs
      countdown()
    }
  }

  const totalMs = takeMs + 600
  const samples = new Float64Array(Math.round((totalMs / 1000) * RATE) + RATE)
  addFloor(samples, 0.0015)
  for (const e of events) addTone(samples, e.atMs, e.durationMs, e.hz, e.amplitude)

  const wav = join(dir, 'take.wav')
  const webm = join(dir, 'take.webm')
  writeWav(wav, samples)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '192k', '-ac', '1', webm])
  writeFileSync(join(dir, 'take.json'), JSON.stringify({
    version: 1,
    kind,
    startedAt: new Date('2026-09-14T19:02:11Z').toISOString(),
    paceMs: PACE_MS,
    leadInMs: LEAD_IN_MS,
    beeps: { spacingMs: 1000, durationMs: BEEP_MS, lastEndAt: LEAD_IN_MS + BEEP_MS },
    cues,
    pauses,
  }, null, 2))
  return { webm, queue }
}

function runSplit(args) {
  const r = spawnSync(process.execPath, [SPLIT_TAKE, ...args], { encoding: 'utf8' })
  return { ...r, report: null }
}

function durationOfMs(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return parseFloat(r.stdout.trim()) * 1000
}

const WORDS = [
  { id: 'kat', durationMs: 420, reactionMs: 400, hz: 190 },
  { id: 'tas', durationMs: 560, reactionMs: 300, hz: 220 },
  { id: 'bos', durationMs: 380, reactionMs: 520, hz: 175 },
  { id: 'pen', durationMs: 300, reactionMs: 450, hz: 235 },
  { id: 'mus', durationMs: 480, reactionMs: 380, hz: 205 },
]

/** Padding the splitter adds around every burst for the `woorden` profile. */
const PAD_MS = 60 + 150
/** Opus in, mp3 out, and a detector working off a soft onset — 40ms of slack, per §8. */
const TOLERANCE_MS = 40

test('a generated take is split into one clip per word, at the right lengths', skip, () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-e2e-'))
  try {
    const { webm } = makeTake(dir, { words: WORDS })
    const out = join(dir, 'out')

    const r = runSplit([webm, '--out', out])

    assert.equal(r.status, 0, `split-take failed:\n${r.stdout}\n${r.stderr}`)
    assert.deepEqual(readdirSync(out).sort(), WORDS.map((w) => `${w.id}.mp3`).sort())

    const report = JSON.parse(readFileSync(join(dir, 'take.report.json'), 'utf8'))
    assert.deepEqual(report.warnings, [])
    assert.equal(report.audio.beepsFound, true)
    assert.equal(report.summary.ok, WORDS.length)
    assert.deepEqual(report.clips.map((c) => c.id), WORDS.map((w) => w.id))

    for (const word of WORDS) {
      const clip = report.clips.find((c) => c.id === word.id)
      assert.equal(clip.status, 'ok', `${word.id}: ${clip.status} ${clip.flags}`)
      const expected = word.durationMs + PAD_MS
      assert.ok(
        Math.abs(clip.durationMs - expected) <= TOLERANCE_MS,
        `${word.id}: report says ${clip.durationMs}ms, expected ${expected}ms ±${TOLERANCE_MS}`,
      )
      assert.ok(
        Math.abs(durationOfMs(join(out, `${word.id}.mp3`)) - expected) <= TOLERANCE_MS,
        `${word.id}: the mp3 on disk is ${Math.round(durationOfMs(join(out, `${word.id}.mp3`)))}ms, expected ${expected}ms ±${TOLERANCE_MS}`,
      )
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a retake and a pause land on the same clock as the audio', skip, () => {
  // The two corrections that cannot be checked without real audio: the last non-retake cue is
  // the one cut, and everything after an Esc has to be pulled back by the length of the pause,
  // because MediaRecorder.pause() leaves those milliseconds out of the take entirely.
  const dir = mkdtempSync(join(tmpdir(), 'split-e2e-'))
  try {
    // tas is fluffed and read again at the end; Esc after the third word
    // the take he rejects is short, the one the cue sheet points at is full length, so the
    // clip's own duration says which of the two was cut
    const words = WORDS.map((w, i) => (i === 1 ? { ...w, durationMs: 300 } : { ...w }))
    const { webm } = makeTake(dir, { words, retakeIndex: 1, retakeWord: { durationMs: WORDS[1].durationMs }, pauseAfter: 3 })
    const out = join(dir, 'out')

    const r = runSplit([webm, '--out', out])

    assert.equal(r.status, 0, `split-take failed:\n${r.stdout}\n${r.stderr}`)
    const report = JSON.parse(readFileSync(join(dir, 'take.report.json'), 'utf8'))
    assert.deepEqual(report.warnings, [])
    assert.equal(report.summary.ok, WORDS.length)

    // every word after the pause has to have survived the shift, or they would have been cut
    // from whatever the wall clock pointed at — most likely the gap before the next word
    for (const word of WORDS) {
      const clip = report.clips.find((c) => c.id === word.id)
      const expected = (word.id === 'tas' ? WORDS[1].durationMs : word.durationMs) + PAD_MS
      assert.equal(clip.status, 'ok', `${word.id}: ${clip.status} ${clip.flags}`)
      assert.ok(
        Math.abs(clip.durationMs - expected) <= TOLERANCE_MS,
        `${word.id}: ${clip.durationMs}ms, expected ${expected}ms ±${TOLERANCE_MS}`,
      )
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a word that was never spoken is reported missing, and nothing is written for it', skip, () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-e2e-'))
  try {
    const words = WORDS.map((w) => (w.id === 'bos' ? { ...w, durationMs: 0 } : w))
    const { webm } = makeTake(dir, { words })
    const out = join(dir, 'out')

    const r = runSplit([webm, '--out', out])

    assert.equal(r.status, 1, 'a missing word must not exit 0 — that exit code gates a commit')
    const report = JSON.parse(readFileSync(join(dir, 'take.report.json'), 'utf8'))
    const bos = report.clips.find((c) => c.id === 'bos')
    assert.equal(bos.status, 'missing')
    assert.equal(bos.file, null)
    assert.ok(!readdirSync(out).includes('bos.mp3'))
    assert.equal(report.clips.filter((c) => c.status === 'ok').length, WORDS.length - 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--dry-run reports everything and writes nothing', skip, () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-e2e-'))
  try {
    const { webm } = makeTake(dir, { words: WORDS })
    const out = join(dir, 'out')

    const r = runSplit([webm, '--out', out, '--dry-run'])

    assert.equal(r.status, 0)
    assert.match(r.stdout, /Dry run: nothing was written/)
    assert.throws(() => readdirSync(out))
    assert.throws(() => readFileSync(join(dir, 'take.report.json')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('no cue sheet and the wrong number of ids refuses to write anything', skip, () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-e2e-'))
  try {
    const { webm } = makeTake(dir, { words: WORDS })
    rmSync(join(dir, 'take.json'))
    const out = join(dir, 'out')

    // four ids for five words, plus four lead-in beeps that are bursts like any other
    const r = runSplit([webm, '--out', out, '--ids', 'kat,tas,bos,pen'])

    assert.equal(r.status, 1)
    assert.match(r.stderr, /Nothing was written/)
    assert.throws(() => readdirSync(out))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the ffmpeg-dependent tests are skipped, not failed, without ffmpeg', () => {
  // this one always runs: without it a machine with no ffmpeg reports "all tests passed"
  // having run nothing above, and nobody notices for a month
  assert.equal(typeof ffmpegMissing, 'boolean')
  if (ffmpegMissing) process.stderr.write('ffmpeg not found — the split-take end-to-end tests did not run.\n')
})
