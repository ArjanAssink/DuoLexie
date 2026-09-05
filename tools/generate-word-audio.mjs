#!/usr/bin/env node
/**
 * Bulk-generate Dutch word pronunciation clips via TTS, normalized to the
 * same spec as the recorded sound clips (mono, -16 LUFS, 64kbps mp3).
 *
 * Backends:
 *   piper           - free, offline neural TTS. Needs a piper binary + a
 *                      nl_NL/nl_BE .onnx voice model (see --piper-bin/--piper-model).
 *                      Download voices from https://huggingface.co/rhasspy/piper-voices
 *   google-translate - free, unofficial Google Translate TTS endpoint. One
 *                      fixed Dutch voice, no API key, best for quick previews only.
 *   azure           - paid, needs AZURE_SPEECH_KEY + AZURE_SPEECH_REGION env vars.
 *                      Pass a voice like nl-NL-ColetteNeural via --voice.
 *   google-cloud    - paid, needs GOOGLE_API_KEY env var (Cloud TTS API key).
 *                      Pass a voice like nl-NL-Wavenet-B via --voice.
 *
 * Usage:
 *   node tools/generate-word-audio.mjs --backend piper --piper-model nl_NL-pim-medium.onnx
 *   node tools/generate-word-audio.mjs --backend google-translate --words kat,boom,fiets
 *   node tools/generate-word-audio.mjs --backend azure --voice nl-NL-ColetteNeural
 *
 * Flags:
 *   --backend       piper | google-translate | azure | google-cloud (required)
 *   --words         comma-separated word ids to generate (default: all in shared/curriculum/words.json)
 *   --out           output directory (default: app/public/audio/words)
 *   --voice         voice name for azure / google-cloud
 *   --piper-bin     path to the piper binary (default: piper)
 *   --piper-model   path to the .onnx voice model (piper backend only)
 *   --piper-speaker speaker id for multi-speaker piper models (e.g. nl_NL-mls-medium)
 */
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const backend = args.backend
if (!backend) {
  console.error('Missing --backend (piper | google-translate | azure | google-cloud)')
  process.exit(1)
}

const wordsPath = resolve(repoRoot, 'shared/curriculum/words.json')
const allWords = JSON.parse(readFileSync(wordsPath, 'utf8')).words
const wanted = args.words ? args.words.split(',') : null
const words = wanted ? allWords.filter((w) => wanted.includes(w.id)) : allWords

const outDir = resolve(repoRoot, args.out ?? 'app/public/audio/words')
mkdirSync(outDir, { recursive: true })

function normalize(inputPath, outputPath) {
  execFileSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,silenceremove=start_periods=1:start_threshold=-45dB',
    '-ac', '1',
    '-b:a', '64k',
    outputPath,
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
}

async function generateGoogleTranslate(text, rawPath) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=nl&client=tw-ob`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`google-translate TTS failed: HTTP ${res.status}`)
  writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()))
}

function generatePiper(text, rawPath) {
  const bin = args['piper-bin'] ?? 'piper'
  const model = args['piper-model']
  if (!model) throw new Error('--piper-model is required for the piper backend')
  const piperArgs = ['--model', model, '--output_file', rawPath]
  if (args['piper-speaker'] != null) piperArgs.push('--speaker', String(args['piper-speaker']))
  execFileSync(bin, piperArgs, { input: text, stdio: ['pipe', 'ignore', 'inherit'] })
}

async function generateAzure(text, rawPath) {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars are required for the azure backend')
  const voice = args.voice ?? 'nl-NL-ColetteNeural'
  const ssml = `<speak version='1.0' xml:lang='nl-NL'><voice name='${voice}'>${text}</voice></speak>`
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-64kbitrate-mono-mp3',
    },
    body: ssml,
  })
  if (!res.ok) throw new Error(`azure TTS failed: HTTP ${res.status} ${await res.text()}`)
  writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()))
}

async function generateGoogleCloud(text, rawPath) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY env var is required for the google-cloud backend')
  const voice = args.voice ?? 'nl-NL-Wavenet-B'
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'nl-NL', name: voice },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok) throw new Error(`google-cloud TTS failed: HTTP ${res.status} ${await res.text()}`)
  const { audioContent } = await res.json()
  writeFileSync(rawPath, Buffer.from(audioContent, 'base64'))
}

const generators = {
  piper: generatePiper,
  'google-translate': generateGoogleTranslate,
  azure: generateAzure,
  'google-cloud': generateGoogleCloud,
}

const generate = generators[backend]
if (!generate) {
  console.error(`Unknown backend "${backend}". Use one of: ${Object.keys(generators).join(', ')}`)
  process.exit(1)
}

for (const word of words) {
  const rawPath = join(outDir, `${word.id}.raw`)
  const outPath = join(outDir, `${word.id}.mp3`)
  console.log(`${word.id} (${word.text}) -> ${outPath}`)
  await generate(word.text, rawPath)
  normalize(rawPath, outPath)
  rmSync(rawPath)
}

console.log(`Done: ${words.length} word clips generated via ${backend}.`)
