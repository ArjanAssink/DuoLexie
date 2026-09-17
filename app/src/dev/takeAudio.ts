/**
 * The microphone and the beeps — the parts of the recording studio that talk to Web Audio.
 *
 * Kept out of the components because the settings here are the point of the whole rework, not
 * incidental plumbing: docs/recording-pipeline-v2.md §1 puts Chrome's default microphone
 * processing second on the list of what made the first batch sound clacky, and the fix is
 * three booleans that are easy to lose in a refactor if they live inline in a component.
 */

import { BEEP_MS, COUNT_HZ, ZERO_HZ } from './cueSheet'
import { CLIP_DBFS } from './levels'

/**
 * `getUserMedia({ audio: true })` turns on echo cancellation, noise suppression and automatic
 * gain control. They are built for a laptop on a video call; in a quiet room with a decent
 * microphone they actively hurt. AGC pumps the level between words — which is exactly the
 * variation this pipeline then tries to preserve by normalising the take as a whole — and
 * noise suppression smears the quiet consonants, `s` and `f` above all, that a reading app
 * cares most about. All three off, and let the room be quiet instead.
 */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: 48_000,
}

export function micConstraints(deviceId: string | null): MediaStreamConstraints {
  return { audio: deviceId ? { ...MIC_CONSTRAINTS, deviceId: { exact: deviceId } } : MIC_CONSTRAINTS }
}

/** Opus at 192k is transparent for speech; the clips end up as 64k mp3 either way. */
export const RECORDER_OPTIONS: MediaRecorderOptions = {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 192_000,
}

export function supportedRecorderOptions(): MediaRecorderOptions {
  const canRecord = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(RECORDER_OPTIONS.mimeType!)
  return canRecord ? RECORDER_OPTIONS : { audioBitsPerSecond: RECORDER_OPTIONS.audioBitsPerSecond }
}

export interface TakeGraph {
  ctx: AudioContext
  /** what MediaRecorder records: the microphone with the countdown mixed in */
  stream: MediaStream
  mic: MediaStream
  analyser: AnalyserNode
  /** the node the countdown is mixed into — the recorded side of the graph */
  recorded: AudioNode
  close: () => void
}

/**
 * Microphone in, one stream out, with somewhere to put the beeps.
 *
 * The countdown is mixed into the recorded stream rather than only played out of the
 * speakers, so it is in the take whether or not he is wearing headphones — and it is in it at
 * a known pitch and length, instead of whatever the room did to it on the way back to the
 * microphone. It goes to the speakers too, because it is also a countdown for a human.
 *
 * This does not undermine what the beeps are *for* (§4.3). The gap being measured is between
 * `MediaRecorder.start()` returning and the first sample actually being captured; the beeps
 * are positioned by the audio graph's own clock, so they stay a fixed, findable landmark in
 * the recording no matter how that gap turns out.
 */
export function openTakeGraph(mic: MediaStream): TakeGraph {
  const ctx = new AudioContext({ sampleRate: 48_000 })
  const source = ctx.createMediaStreamSource(mic)
  const destination = ctx.createMediaStreamDestination()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  source.connect(destination)
  source.connect(analyser)
  return {
    ctx,
    stream: destination.stream,
    mic,
    analyser,
    recorded: destination,
    close: () => {
      source.disconnect()
      void ctx.close().catch(() => {})
    },
  }
}

/** One soft-edged tone. Hard edges would be a click, which is the thing being avoided. */
function beep(graph: TakeGraph, atSeconds: number, hz: number, durationSeconds: number) {
  const osc = graph.ctx.createOscillator()
  const gain = graph.ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = hz
  gain.gain.setValueAtTime(0, atSeconds)
  gain.gain.linearRampToValueAtTime(0.22, atSeconds + 0.005)
  gain.gain.setValueAtTime(0.22, atSeconds + durationSeconds - 0.005)
  gain.gain.linearRampToValueAtTime(0, atSeconds + durationSeconds)
  osc.connect(gain)
  gain.connect(graph.ctx.destination) // out loud, for the human counting along
  gain.connect(graph.recorded) // and into the take, for the splitter
  osc.start(atSeconds)
  osc.stop(atSeconds + durationSeconds + 0.01)
}

/**
 * Schedule the 3 · 2 · 1 · go countdown and return the `performance.now()` the cue sheet's
 * clock should be zeroed at: the instant the first beep is due.
 *
 * Zeroing on the beep rather than on the `MediaRecorder.start()` call is what makes
 * `beeps.lastEndAt` in the cue sheet exact in the clock the splitter measures against. What
 * is left over — recorder start versus first captured sample — is the offset the splitter
 * works out by finding the beeps, and it is the only thing left for it to work out.
 */
export function scheduleCountdown(graph: TakeGraph, leadInMs: number): number {
  const lead = 0.06 // a beat for the graph to be ready before the first beep is due
  const startSeconds = graph.ctx.currentTime + lead
  const spacing = leadInMs / 3000
  for (let i = 0; i < 4; i++) {
    beep(graph, startSeconds + i * spacing, i === 3 ? ZERO_HZ : COUNT_HZ, BEEP_MS / 1000)
  }
  return performance.now() + lead * 1000
}

/** Peak of the last analyser frame in dBFS, for the level meter. */
export function peakDbfs(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer)
  let peak = 0
  for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]))
  return peak === 0 ? -Infinity : 20 * Math.log10(peak)
}

export interface MeterReading {
  /** this frame */
  peak: number
  /** the highest peak of the last `holdMs`, so a single loud word stays readable */
  hold: number
  over: boolean
}

/**
 * A peak meter with a hold (§2.2).
 *
 * Without the hold there is nothing to see: a word peaks for a few milliseconds and the bar
 * is back at the floor before an eye moving between the prompt and the meter arrives. A
 * second and a half is long enough to catch on the way past and short enough that the next
 * word is not hidden behind the last one's peak.
 */
export function createPeakMeter(analyser: AnalyserNode, holdMs = 1500) {
  const buffer = new Float32Array(analyser.fftSize)
  let hold = -Infinity
  let holdUntil = 0
  return function read(now = performance.now()): MeterReading {
    const peak = peakDbfs(analyser, buffer)
    if (peak >= hold || now > holdUntil) {
      hold = peak
      holdUntil = now + holdMs
    }
    return { peak, hold, over: peak > CLIP_DBFS }
  }
}

export interface SilenceReading {
  /** RMS over the whole measurement, in dBFS */
  floorDbfs: number
  /** how far 50Hz stands above the bins around it, in dB */
  hz50Db: number
  hz100Db: number
}

/**
 * Two seconds of not speaking, measured (§2.4).
 *
 * Its own AudioContext with a much longer FFT than the take graph's: 16384 bins at 48kHz is
 * 2.9Hz of resolution, and telling 50Hz from the noise beside it needs that — at the take
 * graph's 2048 the nearest neighbour bin is 23Hz away, which is most of the distance to the
 * next harmonic.
 *
 * Averaged in linear power and converted back at the end. Averaging the analyser's dB values
 * directly would be a geometric mean, which understates exactly the kind of intermittent
 * buzz this is looking for.
 */
export async function measureSilence(deviceId: string | null, durationMs = 2000): Promise<SilenceReading> {
  const stream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId))
  const ctx = new AudioContext({ sampleRate: 48_000 })
  try {
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 16_384
    analyser.smoothingTimeConstant = 0
    source.connect(analyser)

    const time = new Float32Array(analyser.fftSize)
    const freq = new Float32Array(analyser.frequencyBinCount)
    const power = new Float64Array(analyser.frequencyBinCount)
    let sumSquares = 0
    let samples = 0
    let frames = 0

    const deadline = performance.now() + durationMs
    while (performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 40))
      analyser.getFloatTimeDomainData(time)
      for (let i = 0; i < time.length; i++) sumSquares += time[i] * time[i]
      samples += time.length
      analyser.getFloatFrequencyData(freq)
      for (let i = 0; i < freq.length; i++) power[i] += 10 ** (freq[i] / 10)
      frames++
    }

    const rms = samples > 0 ? Math.sqrt(sumSquares / samples) : 0
    const binHz = ctx.sampleRate / analyser.fftSize
    const mean = (i: number) => (frames > 0 ? power[i] / frames : 0)
    return {
      floorDbfs: rms > 0 ? 20 * Math.log10(rms) : -120,
      hz50Db: harmonicExcessDb(mean, 50, binHz, power.length),
      hz100Db: harmonicExcessDb(mean, 100, binHz, power.length),
    }
  } finally {
    stream.getTracks().forEach((t) => t.stop())
    await ctx.close().catch(() => {})
  }
}

/**
 * How far a mains harmonic stands above the noise beside it.
 *
 * The neighbourhood deliberately skips a few bins either side of *both* 50 and 100Hz: at
 * 2.9Hz per bin they are only 17 bins apart, so a window wide enough to describe the
 * background would otherwise include the other harmonic and hum would hide its own evidence.
 * The median rather than the mean, so one stray bin in the neighbourhood does not raise the
 * bar that the harmonic has to clear.
 */
function harmonicExcessDb(mean: (i: number) => number, hz: number, binHz: number, bins: number): number {
  const centre = Math.round(hz / binHz)
  const skip = 4
  const span = 20
  const near = (i: number) =>
    Math.abs(i - centre) <= skip ||
    Math.abs(i - Math.round(50 / binHz)) <= skip ||
    Math.abs(i - Math.round(100 / binHz)) <= skip

  let signal = 0
  for (let i = Math.max(0, centre - 1); i <= Math.min(bins - 1, centre + 1); i++) {
    signal = Math.max(signal, mean(i))
  }

  const around: number[] = []
  for (let i = Math.max(3, centre - span); i <= Math.min(bins - 1, centre + span); i++) {
    if (!near(i)) around.push(mean(i))
  }
  if (around.length === 0 || signal <= 0) return 0
  around.sort((a, b) => a - b)
  const background = around[Math.floor(around.length / 2)]
  if (background <= 0) return 0
  return 10 * Math.log10(signal / background)
}
