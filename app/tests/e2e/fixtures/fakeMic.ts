import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * WAV files to hand Chromium as `--use-file-for-fake-audio-capture`, so a test can decide what
 * the microphone hears.
 *
 * The studio's new meters are all judgements about a signal — is it clipping, is the room
 * quiet, is there mains hum — and none of them can be exercised by the default fake device,
 * which plays one fixed beeping tone. Generated rather than committed because they are a few
 * lines of arithmetic and a megabyte of binary otherwise, and written at import time because
 * Playwright resolves `launchOptions` before it launches anything.
 */
const OUT = fileURLToPath(new URL('./generated/', import.meta.url))
const RATE = 48_000

function writeWav(name: string, samples: Float64Array): string {
  mkdirSync(OUT, { recursive: true })
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
  const path = join(OUT, name)
  writeFileSync(path, Buffer.concat([header, data]))
  return path
}

function tone(seconds: number, hz: number, amplitude: number, noise = 0): Float64Array {
  const samples = new Float64Array(Math.round(seconds * RATE))
  let last = 0
  for (let i = 0; i < samples.length; i++) {
    last = 0.97 * last + 0.03 * (Math.random() * 2 - 1)
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE) + last * noise
  }
  return samples
}

/** Digital silence, plus the faintest of floors so nothing downstream divides by zero. */
export const SILENT_WAV = writeWav('silent.wav', tone(6, 0, 0, 0.00002))

/**
 * Mains hum: 50Hz well above a quiet floor.
 *
 * The floor is deliberately not zero. Hum is detected as "this harmonic stands more than 20dB
 * above the bins beside it", and beside a tone in a digitally silent file there is nothing to
 * stand above — which is not a case that exists in a room, and not one worth writing the
 * detector around.
 */
export const HUM_WAV = writeWav('hum.wav', tone(6, 50, 0.05, 0.0006))

/** Loud enough that every frame is over the clip threshold — a gain set far too high. */
export const HOT_WAV = writeWav('hot.wav', tone(30, 220, 0.99))

/**
 * A level a take can actually be recorded at: peaks around -14 dBFS, inside the target zone.
 *
 * The default fake device is a beep at close to full scale, which the clip detector is right
 * to flag — so every take recorded against it comes out with every word marked for retake,
 * and a test about cue-sheet timing would be measuring the meter instead. This is what the
 * microphone is supposed to sound like.
 */
export const CALM_WAV = writeWav('calm.wav', tone(60, 220, 0.2))

export function fakeMicArgs(wav: string): string[] {
  return [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
  ]
}
