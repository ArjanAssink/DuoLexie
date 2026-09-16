/**
 * The one thing in lib/audio.mjs worth testing on its own: that the decode step's high-pass
 * takes off what it is meant to take off and leaves speech alone
 * (docs/recording-studio-v3.md §2.5, test 1).
 *
 * Everything else here is an ffmpeg invocation whose behaviour is ffmpeg's, exercised end to
 * end by split-take.test.mjs. A filter is different: it is a claim about the audio, it is
 * invisible in any report, and getting it wrong thins every recording the project will ever
 * make without anyone noticing until the clips are already in her ears.
 *
 * Skips rather than fails without ffmpeg, like the rest of tools/.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decodeToWav, meanDbfs, hasFfmpeg } from './audio.mjs'

const skip = hasFfmpeg() ? {} : { skip: 'ffmpeg is not on PATH' }

/** A pure tone, loud enough that nothing here is measuring dither. */
function tone(dir, hz) {
  const file = join(dir, `${hz}.wav`)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=f=${hz}:d=3:r=48000`,
    '-ac', '1', '-c:a', 'pcm_s16le', file,
  ])
  return file
}

/** How much quieter `hz` comes out of decodeToWav than it went in. */
function attenuationDb(dir, hz) {
  const input = tone(dir, hz)
  const output = decodeToWav(input, join(dir, `${hz}-out.wav`))
  return meanDbfs(input) - meanDbfs(output)
}

test('the decode high-pass removes rumble and leaves speech alone', skip, () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-hp-'))
  try {
    // A desk thump, a footstep, a fan's body resonance: this is the band the filter is for,
    // and the one place it is allowed to be brutal.
    assert.ok(attenuationDb(dir, 20) >= 20, `20Hz should be ≥20dB down, was ${attenuationDb(dir, 20).toFixed(1)}`)
    assert.ok(attenuationDb(dir, 30) >= 10, `30Hz should be ≥10dB down, was ${attenuationDb(dir, 30).toFixed(1)}`)

    // The mains fundamental. §2.5 asks for ≥20dB here and a two-pole high-pass at 70Hz
    // cannot give it — 50Hz is less than half an octave below the corner. Reaching 20dB
    // would mean cascading, which costs ~3dB at 100Hz, and 100Hz is a voice's own
    // fundamental. So the filter stays gentle, this asserts what it actually does, and the
    // real answer to hum is not to record it: §2.4's stiltemeting says so before the take.
    const atFifty = attenuationDb(dir, 50)
    assert.ok(atFifty >= 5, `50Hz should be ≥5dB down, was ${atFifty.toFixed(1)}`)
    assert.ok(atFifty < 12, `50Hz should not be steeply cut, was ${atFifty.toFixed(1)}`)

    // Speech. 300Hz is inside every vowel she will hear; it must come out untouched.
    assert.ok(Math.abs(attenuationDb(dir, 300)) <= 1, `300Hz moved by ${attenuationDb(dir, 300).toFixed(1)}dB`)
    assert.ok(Math.abs(attenuationDb(dir, 1000)) <= 1, `1kHz moved by ${attenuationDb(dir, 1000).toFixed(1)}dB`)
    // …and a low male fundamental, the thing a steeper filter would have cost
    assert.ok(Math.abs(attenuationDb(dir, 150)) <= 1, `150Hz moved by ${attenuationDb(dir, 150).toFixed(1)}dB`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
