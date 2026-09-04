#!/usr/bin/env node
/**
 * Convert recorded .webm clips to normalized mono MP3s for the app.
 * Requires ffmpeg (brew install ffmpeg).
 * Raw .webm takes are moved to a sibling raw-webm/ folder (not deleted),
 * so a bad conversion can be redone without re-recording.
 *
 * Usage: node tools/convert-audio.mjs [dir]
 *   dir defaults to app/public/audio/sounds
 */
import { readdirSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? 'app/public/audio/sounds')
const webms = readdirSync(dir).filter((f) => f.endsWith('.webm'))

if (webms.length === 0) {
  console.log(`No .webm files found in ${dir}`)
  process.exit(0)
}

// keep the raw takes around — trim silence *before* normalizing loudness, or a
// quiet lead-in gets blown up to speech-level noise instead of being trimmed away
const rawDir = join(dir, '..', 'raw-webm')
mkdirSync(rawDir, { recursive: true })

function measurePeakDb(input) {
  // ffmpeg writes volumedetect's stats to stderr, not stdout
  const { stderr } = spawnSync('ffmpeg', ['-i', input, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  })
  const m = (stderr ?? '').match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
  return m ? parseFloat(m[1]) : -1
}

function convert(input, output, filterChain) {
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-i', input,
    '-af', filterChain,
    '-ac', '1', '-b:a', '64k',
    output,
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  return statSync(output).size >= 1000
}

// silenceremove cuts right at the threshold crossing, jumping straight from
// silence to whatever amplitude that sample happens to be — an audible click.
// A short fade-in smooths that cut edge.
const FADE_IN = 'afade=t=in:d=0.015'
const LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11'
const untrimmed = []

for (const file of webms) {
  const input = join(dir, file)
  const output = join(dir, file.replace(/\.webm$/, '.mp3'))
  // trim silence relative to how loud this specific take actually is, instead of
  // a fixed threshold — a quiet take (far mic, low gain) sits entirely below a
  // fixed threshold otherwise, so silenceremove strips the whole clip as "silence"
  const peak = measurePeakDb(input)
  const threshold = Math.min(-30, Math.max(-70, peak - 20))
  console.log(`${file} -> ${output} (peak ${peak}dB, silence threshold ${threshold}dB)`)
  let ok = convert(input, output, `silenceremove=start_periods=1:start_threshold=${threshold}dB,${FADE_IN},${LOUDNORM}`)
  if (!ok) {
    // even the adaptive threshold swallowed the whole clip (a brief, quiet
    // utterance) — fall back to just normalizing, which can't drop everything
    console.log(`  silence-trim produced empty output for ${file}, retrying without it`)
    ok = convert(input, output, `${FADE_IN},${LOUDNORM}`)
    if (ok) untrimmed.push(file)
  }
  renameSync(input, join(rawDir, file))
  if (!ok) console.log(`  ⚠️  still empty after fallback — check ${file} by ear, the raw take may be silent`)
}

console.log(`Done: ${webms.length} clips converted.`)
if (untrimmed.length > 0) {
  console.log(`\nKept without silence-trimming (may have a little lead-in quiet): ${untrimmed.join(', ')}`)
}
