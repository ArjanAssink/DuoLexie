/**
 * The ffmpeg half of tools/split-take.mjs: everything that has to look at, or produce, actual
 * audio. Split out from the tool so the tool reads as the five steps of
 * docs/recording-pipeline-v2.md §4.1 rather than as argv-parsing wrapped around ffmpeg
 * invocations, and so the parsing of ffmpeg's several output formats sits in one place.
 *
 * Every function here takes and returns milliseconds. ffmpeg speaks seconds; the conversion
 * happens at this boundary and nowhere else.
 */
import { spawnSync } from 'node:child_process'

const SAMPLE_RATE = 48_000

/** ffmpeg writes its analysis filters' output to stderr, and some of it only at EOF. */
function run(bin, args, { input } = {}) {
  const result = spawnSync(bin, args, { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, input })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: (result.stderr ?? Buffer.alloc(0)).toString('utf8'),
  }
}

function ffmpeg(args, opts) {
  const r = run('ffmpeg', ['-hide_banner', '-nostdin', ...args], opts)
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed (exit ${r.status}):\n${r.stderr.split('\n').slice(-12).join('\n')}`)
  }
  return r
}

/** True when both binaries are on PATH — callers decide whether that is fatal or a skip. */
export function hasFfmpeg() {
  for (const bin of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' })
    if (r.error || r.status !== 0) return false
  }
  return true
}

export function requireFfmpeg() {
  if (hasFfmpeg()) return
  throw new Error(
    'ffmpeg and ffprobe are required and were not found on PATH.\n' +
    '  macOS:  brew install ffmpeg\n' +
    '  Debian: sudo apt install ffmpeg\n' +
    '  Arch:   sudo pacman -S ffmpeg',
  )
}

export function durationMs(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}:\n${r.stderr}`)
  const seconds = parseFloat(r.stdout.toString('utf8').trim())
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe reported no duration for ${file}`)
  return seconds * 1000
}

/**
 * Everything below a speaking voice, taken off before anything else looks at the take
 * (docs/recording-studio-v3.md §2.5).
 *
 * Desk thumps, the chair, footfalls in the house, a fan's body resonance and the 50Hz mains
 * fundamental all live under 70Hz, where speech has nothing at all — a male fundamental
 * starts around 85Hz and Arjan's is higher. Taking it off first means the noise floor the
 * silence threshold is derived from is the floor of the *audible* take, not of a rumble
 * nobody can hear, and `loudnorm` is not spending headroom on it either.
 *
 * Measured response of this exact filter, 48kHz, sine in / sine out (see audio.test.mjs):
 *
 *     20Hz -21.8dB   30Hz -14.8dB   40Hz -10.1dB   50Hz -6.8dB
 *     70Hz  -3.0dB  100Hz  -0.9dB  150Hz  -0.2dB  300Hz  -0.0dB
 *
 * Deliberately gentle. ffmpeg's `highpass` caps at two poles, and cascading it to reach 20dB
 * at 50Hz would cost ~3dB at 100Hz, which is a voice's own fundamental — the one thing this
 * must not touch.
 */
export const DECODE_FILTER = 'highpass=f=70:poles=2'

/** Opus (or anything else) → the 48kHz mono WAV everything downstream works on. */
export function decodeToWav(input, output) {
  ffmpeg([
    '-y', '-v', 'error', '-i', input, '-af', DECODE_FILTER,
    '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', output,
  ])
  return output
}

/**
 * Mean level of a file in dBFS — RMS over the whole thing, from `volumedetect`.
 *
 * Only used to compare one rendering of a signal against another (the high-pass test, and
 * anything that wants to know what a gain change actually did). For "how loud is this take
 * to a listener" the answer is `measureLoudness`, which is gated and weighted; this is not.
 */
export function meanDbfs(file) {
  const { stderr } = ffmpeg(['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
  const m = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
  return m ? parseFloat(m[1]) : null
}

/**
 * loudnorm pass 1 — measure. The numbers come back on stderr as a JSON object after the
 * filter's own log line, so the parse starts at the last `{`.
 */
export function measureLoudness(wav, { i = -16, tp = -1.5, lra = 11 } = {}) {
  const { stderr } = ffmpeg([
    '-v', 'info', '-i', wav,
    '-af', `loudnorm=I=${i}:TP=${tp}:LRA=${lra}:print_format=json`,
    '-f', 'null', '-',
  ])
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start === -1 || end < start) throw new Error(`loudnorm printed no measurement:\n${stderr.slice(-800)}`)
  return JSON.parse(stderr.slice(start, end + 1))
}

/**
 * loudnorm pass 2 — apply the measured values, once, to the whole take.
 *
 * This is the fix for the fourth thing wrong with the first recordings (§1): loudnorm on a
 * 300ms clip measures almost nothing, so clip-at-a-time normalisation left the words at
 * visibly different levels with the room noise pulled up on the quiet ones. Measured over
 * three minutes of one voice in one room it does the job it was designed for, and the words
 * keep their natural relative levels because the cutting happens afterwards.
 *
 * `linear=true` asks for a single gain change rather than the dynamic mode, which is what
 * keeps those relative levels; ffmpeg falls back to dynamic on its own if the measurement
 * says linear cannot hit the target.
 */
export function applyLoudnorm(wav, output, measured, { i = -16, tp = -1.5, lra = 11 } = {}) {
  const filter = [
    `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
  // loudnorm resamples to 192kHz internally; -ar puts it back before it is written
  ffmpeg(['-y', '-v', 'error', '-i', wav, '-af', filter, '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', output])
  return output
}

/**
 * Lift the whole take by a gain someone else already worked out — what a retake gets instead
 * of its own measurement (docs/recording-studio-v3.md §2.6).
 *
 * Three words measured alone do not land where the same three words land inside the twenty
 * they have to sit among: that is the "loudnorm on short material" problem the v2 spec's §1.4
 * fixed for individual clips, arriving again one level up. So a retake is not measured at
 * all; it is moved by exactly the number the take it replaces was moved by, which is the only
 * way the replacement can match what is already on disk.
 *
 * No limiter afterwards. A limiter would change how the words sound relative to each other,
 * which is the thing being preserved; if the gain pushes the peak too high the caller says so
 * in the report and the take can be redone.
 */
export function applyGainDb(wav, output, gainDb) {
  ffmpeg([
    '-y', '-v', 'error', '-i', wav, '-af', `volume=${gainDb.toFixed(2)}dB`,
    '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', output,
  ])
  return output
}

/**
 * The take's own noise floor, as the 10th percentile of RMS over 100ms frames (§4.1 step 3).
 *
 * A percentile rather than a minimum: a minimum finds the one frame where the air handling
 * happened to dip, which is not the floor the rest of the take sits on. A percentile rather
 * than a mean: most frames of a reading take are silence, so the mean *is* roughly the floor
 * already, but it drifts upward with how densely he reads, which is exactly the thing the
 * threshold must not depend on.
 */
export function noiseFloorDbfs(wav) {
  const { stdout } = ffmpeg([
    '-v', 'error', '-i', wav,
    '-af', 'asetnsamples=n=4800,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-',
  ])
  const levels = []
  for (const line of stdout.toString('utf8').split('\n')) {
    const m = line.match(/RMS_level=(-?\d+(?:\.\d+)?|-?inf)/)
    if (!m) continue
    // a digitally silent frame reports -inf; it is a real part of the floor, but as a number
    // it would drag any percentile to negative infinity, so it is floored at the -96dBFS
    // that 16-bit audio can actually represent
    levels.push(m[1].includes('inf') ? -96 : parseFloat(m[1]))
  }
  if (levels.length === 0) return null
  levels.sort((a, b) => a - b)
  return levels[Math.floor(levels.length * 0.1)]
}

/**
 * The silence threshold for this take: ~12dB above its own floor, clamped (§4.1 step 3).
 *
 * Relative, because a fixed threshold is what made the old converter need a fallback path —
 * a quiet take sits entirely below it and the whole clip reads as silence. Clamped, because
 * a take with an unusually loud floor (a fan, a laptop) would otherwise push the threshold
 * up into the quiet consonants this app cares most about.
 */
export function silenceThresholdDb(floorDbfs, { min = -55, max = -30 } = {}) {
  if (floorDbfs === null) return max
  return Math.min(max, Math.max(min, floorDbfs + 12))
}

/** silencedetect's stderr lines → the silent stretches, in ms. */
export function detectSilences(wav, thresholdDb, minSilenceMs, totalMs) {
  const { stderr } = ffmpeg([
    '-v', 'info', '-i', wav,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=${(minSilenceMs / 1000).toFixed(3)}`,
    '-f', 'null', '-',
  ])
  const silences = []
  let open = null
  for (const line of stderr.split('\n')) {
    const start = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
    if (start) {
      open = Math.max(0, parseFloat(start[1]) * 1000)
      continue
    }
    const end = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
    if (end && open !== null) {
      silences.push({ from: open, to: parseFloat(end[1]) * 1000 })
      open = null
    }
  }
  // a take that ends in silence sometimes gets its closing silence_end at EOF and sometimes
  // not, depending on how the last frame lands — close it either way
  if (open !== null) silences.push({ from: open, to: totalMs })
  return silences
}

/** The complement of the silences: everything that is not silence, minus the specks. */
export function burstsFromSilences(silences, totalMs, minBurstMs) {
  const bursts = []
  let cursor = 0
  for (const s of silences) {
    if (s.from > cursor) bursts.push({ startMs: cursor, endMs: Math.min(s.from, totalMs) })
    cursor = Math.max(cursor, s.to)
  }
  if (cursor < totalMs) bursts.push({ startMs: cursor, endMs: totalMs })
  return bursts.filter((b) => b.endMs - b.startMs >= minBurstMs)
}

/**
 * A rough fundamental for a slice, by counting zero crossings of the raw samples.
 *
 * Only ever asked about the lead-in beeps, which are pure tones — where zero-crossing rate
 * *is* the pitch, to within a hertz or two (measured: 879 for an 880Hz tone). No FFT, no
 * dependency, and nothing else in the pipeline needs pitch.
 */
export function estimateHz(wav, startMs, endMs) {
  const seconds = (endMs - startMs) / 1000
  if (seconds <= 0) return null
  const { stdout } = ffmpeg([
    '-v', 'error', '-ss', (startMs / 1000).toFixed(4), '-t', seconds.toFixed(4), '-i', wav,
    '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-',
  ])
  const samples = Math.floor(stdout.length / 2)
  if (samples < 64) return null
  // ignore crossings by samples too small to be the tone, so the noise between half-cycles
  // of a quiet beep does not read as a much higher pitch
  let peak = 0
  for (let i = 0; i + 1 < stdout.length; i += 2) peak = Math.max(peak, Math.abs(stdout.readInt16LE(i)))
  const gate = peak * 0.2
  let crossings = 0
  let sign = 0
  for (let i = 0; i + 1 < stdout.length; i += 2) {
    const v = stdout.readInt16LE(i)
    if (Math.abs(v) < gate) continue
    const next = v >= 0 ? 1 : -1
    if (sign !== 0 && next !== sign) crossings++
    sign = next
  }
  return (crossings / 2) / (samples / SAMPLE_RATE)
}

/**
 * Peak of a slice in dBFS, measured on a 4× oversampled copy so it approximates true peak —
 * the inter-sample peaks that `clipped` in the report is actually about (§4.1 step 7).
 */
export function peakDbfs(wav, startMs, endMs) {
  const seconds = (endMs - startMs) / 1000
  if (seconds <= 0) return null
  const { stderr } = ffmpeg([
    '-v', 'info', '-ss', (startMs / 1000).toFixed(4), '-t', seconds.toFixed(4), '-i', wav,
    '-af', 'aresample=192000,volumedetect', '-f', 'null', '-',
  ])
  const m = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
  return m ? parseFloat(m[1]) : null
}

/**
 * Cut one word out of the normalised take and encode it (§4.1 steps 5–6).
 *
 * The fades are the fix for the first thing wrong with the old clips: silenceremove cut at
 * the exact sample the level crossed the threshold, so every clip began on a step from zero
 * to whatever that sample happened to be — the click. 8ms in is enough to smooth the edge
 * without softening an onset; 25ms out is longer because the cut end is quiet anyway and a
 * slightly slow release is inaudible where a step is not.
 *
 * No silenceremove anywhere: the padding is the whole point, and silenceremove would take it
 * straight back off.
 */
export function cutToMp3(wav, output, startMs, endMs, { fadeInMs = 8, fadeOutMs = 25, bitrate = '64k' } = {}) {
  const seconds = (endMs - startMs) / 1000
  const fadeOutStart = Math.max(0, seconds - fadeOutMs / 1000)
  const filter = [
    `afade=t=in:st=0:d=${(fadeInMs / 1000).toFixed(4)}`,
    `afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${(fadeOutMs / 1000).toFixed(4)}`,
  ].join(',')
  ffmpeg([
    '-y', '-v', 'error', '-ss', (startMs / 1000).toFixed(4), '-t', seconds.toFixed(4), '-i', wav,
    '-af', filter, '-ac', '1', '-b:a', bitrate, '-map_metadata', '-1', output,
  ])
  return output
}
