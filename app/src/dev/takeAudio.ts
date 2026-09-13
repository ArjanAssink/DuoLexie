/**
 * The microphone and the beeps — the parts of the recording studio that talk to Web Audio.
 *
 * Kept out of the components because the settings here are the point of the whole rework, not
 * incidental plumbing: docs/recording-pipeline-v2.md §1 puts Chrome's default microphone
 * processing second on the list of what made the first batch sound clacky, and the fix is
 * three booleans that are easy to lose in a refactor if they live inline in a component.
 */

import { BEEP_MS, COUNT_HZ, ZERO_HZ } from './cueSheet'

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
