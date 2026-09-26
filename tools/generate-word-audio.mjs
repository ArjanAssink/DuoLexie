#!/usr/bin/env node
/**
 * Bulk-generate Dutch pronunciation clips via TTS, normalized to the same spec as the
 * recorded clips (mono, -16 LUFS, 64kbps mp3).
 *
 * Two sets, because two different games need audio nobody has recorded:
 *
 *   --set words     one clip per word in shared/curriculum/words.json -> app/public/audio/words
 *   --set spelling  the longer forms Maak het woord af speaks ("hond… honden") and, with
 *                   --rules, the two pair rules -> app/public/audio/spelling
 *
 * Backends:
 *   piper            - free, offline neural TTS, and the one that was chosen. Needs a piper
 *                      binary + an nl_NL .onnx voice model (--piper-bin/--piper-model);
 *                      tools/piper/README.md gets you both.
 *   google-translate - free, unofficial Google Translate TTS endpoint. One fixed Dutch
 *                      voice, no API key, best for quick previews only.
 *   azure            - paid, needs AZURE_SPEECH_KEY + AZURE_SPEECH_REGION env vars.
 *                      Pass a voice like nl-NL-ColetteNeural via --voice.
 *   google-cloud     - paid, needs GOOGLE_API_KEY env var (Cloud TTS API key).
 *                      Pass a voice like nl-NL-Wavenet-B via --voice.
 *
 * **The voice is already decided: `nl_NL-ronnie-medium`.** Chosen by ear after a bake-off
 * over all 257 words and 45 klanken (Piper vs Google Translate vs Azure vs Google Cloud,
 * then Pim vs Ronnie vs Alex). Pim lost on `tas`; Alex clips `kat`, `pot` and `kok` down to
 * 0.19s — first-lesson words — where Ronnie clips none, and Ronnie's klanken land at a
 * median 0.39s, closest to the real recordings' ~0.35s.
 *
 * A fifth backend, **Chatterbox**, was written, measured, and is deliberately not here. Its
 * one advantage was voice cloning: ~30s of reference audio would have put every clip in the
 * voice of the 45 recorded klanken. On this corpus it could not be trusted — 19 of 20 words
 * flagged, three-letter words ranging 0.19s to 1.60s against Piper's 0.40–0.71s, `pan` at
 * 0.19s too short to contain the word. Short input is the model's known weak point
 * (resemble-ai/chatterbox#97, #201) and this corpus is single words. The code is on the
 * `claude/chatterbox-tts` branch under tools/chatterbox/ if the cloned-voice question comes
 * back; that branch predates the audio removal in 4d97bbf, so read it, never merge it.
 *
 * Usage:
 *   node tools/generate-word-audio.mjs --set spelling --backend piper \
 *       --piper-bin tools/piper/.venv/bin/piper \
 *       --piper-model tools/piper/models/nl_NL-ronnie-medium.onnx
 *   node tools/generate-word-audio.mjs --backend piper --missing --piper-model ...
 *   node tools/generate-word-audio.mjs --backend google-translate --only kat,boom,fiets
 *
 * Flags:
 *   --backend       piper | google-translate | azure | google-cloud (required)
 *   --set           words | spelling (default: words)
 *   --only          comma-separated ids to generate (alias: --words)
 *   --missing       skip ids that already have an mp3 in the output directory
 *   --rules         spelling set only: also generate the two pair rule cues (see below)
 *   --out           output directory (default: per set)
 *   --report        write a TSV of id/text/seconds, for the listening pass
 *   --voice         voice name for azure / google-cloud
 *   --piper-bin     path to the piper binary (default: piper)
 *   --piper-model   path to the .onnx voice model (piper backend only)
 *   --piper-speaker speaker id for multi-speaker piper models (e.g. nl_NL-mls-medium)
 *   --noise-scale, --noise-w-scale, --length-scale   piper knobs; see generatePiper
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
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

const BACKENDS = ['piper', 'google-translate', 'azure', 'google-cloud']

const args = parseArgs(process.argv.slice(2))
const backend = args.backend
// Both checks up here, before anything reads the curriculum or makes a directory: a typo in
// --backend should not leave an empty output folder behind.
if (!backend) {
  console.error(`Missing --backend (${BACKENDS.join(' | ')})`)
  process.exit(1)
}
if (!BACKENDS.includes(backend)) {
  console.error(`Unknown backend "${backend}". Use one of: ${BACKENDS.join(', ')}`)
  process.exit(1)
}

const setName = args.set ?? 'words'
if (!['words', 'spelling'].includes(setName)) {
  console.error(`Unknown --set "${setName}". Use words or spelling.`)
  process.exit(1)
}

function readCurriculum(file) {
  return JSON.parse(readFileSync(resolve(repoRoot, 'shared/curriculum', file), 'utf8'))
}

/**
 * What a pair's strategy badge *says* out loud — mirrored from `spelling.ts`'s
 * `strategyLine`, which owns it: a `langer` pair asks her to make the word longer, a `regel`
 * pair states the rule, and either way it is one `<pairId>-regel.mp3`
 * (docs/maak-het-woord-af.md §10). Duplicated rather than imported because this file is
 * plain node and that one is TypeScript; if the two ever disagree, the app is right.
 */
const LANGER_PROMPT = 'Maak het woord langer. Zeg het maar.'
function strategyLine(pair) {
  return pair.strategy === 'langer' ? LANGER_PROMPT : pair.rule
}

function wordItems() {
  return readCurriculum('words.json').words.map((w) => ({ id: w.id, text: w.text }))
}

/**
 * The Maak het woord af set: one clip per longer form, and — only when asked — one per pair
 * rule.
 *
 * The rules are off by default on purpose. `Hoor je /cht/? … een werkwoord met een g:` runs
 * straight into what made 39 of 45 klanken come out wrong the first time they were pushed
 * through espeak: a bare letter is read as its *name* (`b` becomes "bee"), and `/cht/` in
 * slashes is not text any engine has a sensible reading for. Those two sentences need either
 * hand-written phonemes or a rewording that never names a letter, and how a spelling rule
 * should sound to a nine-year-old is a judgement call — not something to settle silently
 * inside a batch of 84 clips. Pass --rules once it is settled.
 */
function spellingItems() {
  const { pairs, words } = readCurriculum('spelling.json')
  const items = []
  if (args.rules) {
    for (const pair of pairs) items.push({ id: `${pair.id}-regel`, text: strategyLine(pair) })
  }
  for (const word of words) {
    if (word.langer) items.push({ id: `${word.wordId}-langer`, text: word.langer })
  }
  return items
}

const DEFAULT_OUT = {
  words: 'app/public/audio/words',
  spelling: 'app/public/audio/spelling',
}

let items = setName === 'spelling' ? spellingItems() : wordItems()

const only = args.only ?? args.words
if (typeof only === 'string') {
  const wanted = new Set(only.split(','))
  items = items.filter((item) => wanted.has(item.id))
}

const outDir = resolve(repoRoot, args.out ?? DEFAULT_OUT[setName])
mkdirSync(outDir, { recursive: true })

if (args.missing) {
  const before = items.length
  items = items.filter((item) => !existsSync(join(outDir, `${item.id}.mp3`)))
  console.log(`--missing: ${before - items.length} of ${before} already there, ${items.length} to go.\n`)
}

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

/** Seconds — how a clip too short to contain its own word gives itself away in the report. */
function durationOf(path) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path,
  ], { encoding: 'utf8' })
  return Number.parseFloat(out.trim())
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

  // Piper is stochastic by default: the same word rendered twice differs in length and in
  // how hard the sibilants hit — measured at up to 1.27x on the s-energy of `tas`. For a
  // fixed set of clips that is pure downside, because the clip you approved is not the clip
  // you get on the next run. Zeroing both noise terms makes it reproducible (verified
  // byte-identical across two runs); pass --noise-scale to opt back in.
  piperArgs.push('--noise-scale', String(args['noise-scale'] ?? 0))
  piperArgs.push('--noise-w-scale', String(args['noise-w-scale'] ?? 0))
  if (args['length-scale'] != null) piperArgs.push('--length-scale', String(args['length-scale']))

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

const report = []
for (const item of items) {
  const rawPath = join(outDir, `${item.id}.raw`)
  const outPath = join(outDir, `${item.id}.mp3`)
  await generate(item.text, rawPath)
  normalize(rawPath, outPath)
  rmSync(rawPath)
  const seconds = durationOf(outPath)
  report.push({ ...item, seconds })
  console.log(`${item.id}\t${item.text}\t${seconds.toFixed(2)}s`)
}

if (args.report) {
  const path = resolve(repoRoot, args.report === true ? join(outDir, 'report.tsv') : args.report)
  const lines = report.map((r) => `${r.id}\t${r.text}\t${r.seconds.toFixed(3)}`)
  writeFileSync(path, ['id\ttext\tseconds', ...lines].join('\n') + '\n')
  console.log(`\nReport: ${path}`)
}

console.log(`\nDone: ${items.length} ${setName} clips via ${backend}.`)
if (setName === 'spelling' && !args.rules) {
  console.log('The two pair rule cues were skipped — pass --rules once their wording is settled (see spellingItems).')
}
