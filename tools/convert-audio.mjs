#!/usr/bin/env node
/**
 * Convert recorded .webm clips to normalized mono MP3s for the app.
 * Requires ffmpeg (brew install ffmpeg).
 *
 * Usage: node tools/convert-audio.mjs [dir]
 *   dir defaults to app/public/audio/sounds
 */
import { readdirSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? 'app/public/audio/sounds')
const webms = readdirSync(dir).filter((f) => f.endsWith('.webm'))

if (webms.length === 0) {
  console.log(`No .webm files found in ${dir}`)
  process.exit(0)
}

for (const file of webms) {
  const input = join(dir, file)
  const output = join(dir, file.replace(/\.webm$/, '.mp3'))
  console.log(`${file} -> ${output}`)
  execFileSync('ffmpeg', [
    '-y',
    '-i', input,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,silenceremove=start_periods=1:start_threshold=-45dB',
    '-ac', '1',
    '-b:a', '64k',
    output,
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  unlinkSync(input)
}

console.log(`Done: ${webms.length} clips converted.`)
