#!/usr/bin/env node
/**
 * Split one continuous recording take into one mp3 per word, using the cue sheet the
 * recording studio wrote alongside it. Implements docs/recording-pipeline-v2.md §4.
 *
 * Requires ffmpeg and ffprobe. No Python, no model files, no network: the cue sheet already
 * says which burst is which word, so nothing here has to recognise speech.
 *
 *   node tools/split-take.mjs recordings/woorden-2026-09-14-1902.webm
 *     [--cues <file>]        cue sheet; defaults to the take's basename with .json
 *     [--out <dir>]          output directory; defaults to the one this kind belongs in
 *     [--ids kat,tas]        only write these
 *     [--list klanken|<file>] ids for a take with no cue sheet, in spoken order
 *     [--dry-run]            measure and report, write nothing
 *     [--verify]             check the words with whisper afterwards (§6)
 *     [--whisper-bin <path>] whisper.cpp binary, if it is not on PATH as whisper-cli
 *     [--whisper-model <path>] ggml model file for whisper.cpp
 *
 * Exits 0 when every id came out `ok`, 1 otherwise, so it can gate a commit.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  requireFfmpeg, durationMs, decodeToWav, measureLoudness, applyLoudnorm,
  noiseFloorDbfs, silenceThresholdDb, detectSilences, burstsFromSilences,
  estimateHz, peakDbfs, cutToMp3,
} from './lib/audio.mjs'
import { assignBursts, assignInOrder } from './lib/assign-bursts.mjs'
import { toAudioClock, chooseBeepRun } from './lib/take-clock.mjs'
import { verifyClips, whisperUnavailableMessage } from './lib/verify.mjs'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Everything that differs between reading words and reading isolated klanken (§4.4).
 *
 * A klank is not a small word. `k`, `t` and `p` are a ~100ms burst and a schwa; `s` and `f`
 * are quiet noise that a threshold set for a voiced word loses entirely. So the minimum
 * burst comes down, the threshold is allowed further into the floor, and the tail padding
 * goes up — a klank is nearly all release, and clipping the release is what made the first
 * batch sound clacky.
 */
const PROFILES = {
  woorden: {
    outDir: 'app/public/audio/words',
    minBurstMs: 60,
    thresholdClamp: { min: -55, max: -30 },
    padStartMs: 60,
    padEndMs: 150,
    verifiable: true,
  },
  klanken: {
    outDir: 'app/public/audio/sounds',
    minBurstMs: 40,
    thresholdClamp: { min: -60, max: -30 },
    padStartMs: 60,
    padEndMs: 200,
    // the cue sheet carries the labelling and ASR has nothing useful to say about an
    // isolated `f`; the review screen is the check (§4.4)
    verifiable: false,
  },
}

/** Shorter gaps are inside words — the stop closure before the t in "kat" is about 80ms. */
const MIN_SILENCE_MS = 350
const TOO_SHORT_MS = 120
const CLIPPED_DBTP = -0.5
const DEFAULT_BEEP_MS = 120

/** Worst first: this is what the report sorts on and what the exit code is decided by. */
const STATUS_RANK = ['missing', 'too-short', 'clipped', 'boundary', 'multiple', 'ok']
const worstOf = (...statuses) =>
  STATUS_RANK[Math.min(...statuses.filter(Boolean).map((s) => STATUS_RANK.indexOf(s)))]

function parseArgs(argv) {
  const opts = { take: null, cues: null, out: null, ids: null, list: null, dryRun: false, verify: false, whisperBin: null, whisperModel: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${arg} needs a value`)
      return v
    }
    if (arg === '--cues') opts.cues = next()
    else if (arg === '--out') opts.out = next()
    else if (arg === '--ids') opts.ids = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (arg === '--list') opts.list = next()
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--verify') opts.verify = true
    else if (arg === '--whisper-bin') opts.whisperBin = next()
    else if (arg === '--whisper-model') opts.whisperModel = next()
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`)
    else if (opts.take === null) opts.take = arg
    else throw new Error(`Unexpected extra argument ${arg}`)
  }
  if (!opts.take) throw new Error('Usage: node tools/split-take.mjs <take.webm> [options]')
  return opts
}

/**
 * The ids for a take with no cue sheet, in the order they were spoken (§4.2).
 *
 * `klanken` is built in because the 45 graphemes are a flat list in the curriculum JSON and
 * nothing has to be derived to get them. The word lists are not: `wordsInRecordingOrder()`
 * walks the built lesson path and sorts by length, which lives in TypeScript the app
 * compiles and this plain-node tool cannot import. A file of ids covers the case instead —
 * and in practice a take that came out of the studio has a cue sheet, which makes this the
 * exotic path it looks like.
 */
function resolveIds(list) {
  if (list === 'klanken') {
    const json = JSON.parse(readFileSync(join(REPO, 'shared/curriculum/sounds.json'), 'utf8'))
    return json.categories.flatMap((c) => c.sounds)
  }
  if (list === 'woorden' || list === 'woorden-startset') {
    throw new Error(
      `--list ${list} cannot be resolved here: the word order comes from wordsInRecordingOrder()\n` +
      'in app/src/data/path.ts, which this tool cannot import.\n' +
      'Pass the ids instead — the studio shows the list for the set it is about to record:\n' +
      '  --ids kat,tas,bos,...        or  --list <file with one id per line>',
    )
  }
  const path = resolve(list)
  if (!existsSync(path)) throw new Error(`--list ${list}: not a known list and not a file`)
  return readFileSync(path, 'utf8').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
}

function readCueSheet(path) {
  const sheet = JSON.parse(readFileSync(path, 'utf8'))
  if (sheet.version !== 1) throw new Error(`${path}: cue sheet version ${sheet.version} is not supported`)
  if (!Array.isArray(sheet.cues) || sheet.cues.length === 0) throw new Error(`${path}: no cues`)
  if (!PROFILES[sheet.kind]) throw new Error(`${path}: unknown kind "${sheet.kind}"`)
  return { pauses: [], leadInMs: 3000, ...sheet }
}

/**
 * Find the countdown and measure how far the cue sheet's clock is from the take's (§4.3).
 *
 * `MediaRecorder.start()` returning and the first sample being captured are not the same
 * instant, and how far apart they are varies by browser and by how busy the machine was.
 * Rather than trust that, the countdown is recorded into the take on purpose: its last beep
 * is a known moment in both clocks, so the difference is measurable.
 */
function alignToBeeps(wav, bursts, sheet, warnings) {
  const beeps = sheet.beeps ?? {}
  const spacingMs = beeps.spacingMs ?? sheet.leadInMs / 3
  const expectedEndMs = beeps.lastEndAt ?? sheet.leadInMs + DEFAULT_BEEP_MS

  const candidates = bursts.slice(0, 6).map((b) => ({ ...b, hz: estimateHz(wav, b.startMs, b.endMs) }))
  const found = chooseBeepRun(candidates, { spacingMs })
  if (!found) {
    warnings.push(
      'Lead-in beeps not found; falling back to the recorder start for alignment. ' +
      'If words come out shifted by a fixed amount, that is why.',
    )
    return { offsetMs: 0, beepsFound: false }
  }
  const offsetMs = found.endMs - expectedEndMs
  if (Math.abs(offsetMs) > 500) {
    warnings.push(`Beep alignment wants to shift the cue sheet by ${Math.round(offsetMs)}ms, which is a lot — check the first clips by ear.`)
  }
  return { offsetMs, beepsFound: true, beepEndMs: found.endMs }
}

/** Widen a burst by the profile's padding, without letting two clips share any audio. */
function padded(burst, bursts, profile, totalMs) {
  const i = bursts.indexOf(burst)
  const prev = i > 0 ? bursts[i - 1] : null
  const next = i >= 0 && i + 1 < bursts.length ? bursts[i + 1] : null
  return {
    startMs: Math.max(0, prev ? Math.max(burst.startMs - profile.padStartMs, prev.endMs) : burst.startMs - profile.padStartMs),
    endMs: Math.min(totalMs, next ? Math.min(burst.endMs + profile.padEndMs, next.startMs) : burst.endMs + profile.padEndMs),
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  requireFfmpeg()

  const takePath = resolve(opts.take)
  if (!existsSync(takePath)) throw new Error(`No such take: ${takePath}`)
  const takeBase = join(dirname(takePath), basename(takePath, extname(takePath)))
  const cuesPath = opts.cues ? resolve(opts.cues) : `${takeBase}.json`

  const sheet = existsSync(cuesPath) ? readCueSheet(cuesPath) : null
  if (!sheet && !opts.list && !opts.ids) {
    throw new Error(
      `No cue sheet at ${cuesPath}.\n` +
      'For a take recorded outside the studio, say what was said and in what order:\n' +
      '  --list klanken   |   --list <file with one id per line>   |   --ids kat,tas,bos',
    )
  }
  const kind = sheet?.kind ?? (opts.list === 'klanken' ? 'klanken' : 'woorden')
  const profile = PROFILES[kind]
  const outDir = resolve(opts.out ?? join(REPO, profile.outDir))
  const warnings = []

  const work = mkdtempSync(join(tmpdir(), 'split-take-'))
  try {
    process.stderr.write(`Decoding ${basename(takePath)}…\n`)
    const rawWav = decodeToWav(takePath, join(work, 'take.wav'))

    // §4.1 step 2 — normalise the whole take once, before anything is cut out of it
    process.stderr.write('Normalising the whole take (two-pass loudnorm)…\n')
    const measured = measureLoudness(rawWav)
    const normWav = applyLoudnorm(rawWav, join(work, 'norm.wav'), measured)
    const totalMs = durationMs(normWav)

    // §4.1 step 3 — a threshold this take's own noise floor earns
    const floor = noiseFloorDbfs(normWav)
    const threshold = silenceThresholdDb(floor, profile.thresholdClamp)
    const silences = detectSilences(normWav, threshold, MIN_SILENCE_MS, totalMs)
    const bursts = burstsFromSilences(silences, totalMs, profile.minBurstMs)
    process.stderr.write(
      `Noise floor ${floor === null ? '?' : floor.toFixed(1)} dBFS → silence below ${threshold.toFixed(1)} dB; ` +
      `${bursts.length} bursts in ${(totalMs / 1000).toFixed(1)}s.\n`,
    )

    // §4.1 step 4 — which burst is which word
    let assignments
    let alignment = { offsetMs: 0, beepsFound: false }
    if (sheet) {
      alignment = alignToBeeps(normWav, bursts, sheet, warnings)
      const { cues, dropped, seams } = toAudioClock(sheet.cues, sheet.pauses, alignment.offsetMs)
      for (const d of dropped) warnings.push(`"${d.id}" was prompted inside a pause and is not in the recording.`)
      assignments = assignBursts(bursts, cues, { seams }).assignments
    } else {
      const ids = opts.ids ?? resolveIds(opts.list)
      const result = assignInOrder(bursts, ids)
      if (!result.ok) {
        const first = bursts.slice(0, 10)
          .map((b, i) => `  ${String(i + 1).padStart(2)}. ${(b.startMs / 1000).toFixed(2)}s – ${(b.endMs / 1000).toFixed(2)}s`)
          .join('\n')
        throw new Error(
          `Found ${result.burstCount} bursts but was given ${result.idCount} ids, and with no cue sheet\n` +
          'there is no way to tell which is which. Nothing was written: one extra cough would\n' +
          'put every clip after it under the wrong name.\n\n' +
          `First ${first ? Math.min(10, bursts.length) : 0} bursts:\n${first}\n\n` +
          'Try --verify, which can label the bursts by what they say (§6), or re-record with the studio.',
        )
      }
      assignments = result.assignments
    }

    const wanted = opts.ids && sheet ? new Set(opts.ids) : null
    const rows = assignments.filter((a) => !wanted || wanted.has(a.id))
    if (rows.length === 0) throw new Error('Nothing to write: --ids matched none of the cues in this take')

    // §4.1 steps 5–7 — cut, encode, report
    if (!opts.dryRun) mkdirSync(outDir, { recursive: true })
    const clips = []
    for (const row of rows) {
      if (!row.burst) {
        clips.push({ id: row.id, status: 'missing', flags: row.flags, startMs: null, endMs: null, durationMs: null, peakDbfs: null, file: null })
        continue
      }
      const cut = padded(row.burst, bursts, profile, totalMs)
      const durMs = cut.endMs - cut.startMs
      const peak = peakDbfs(normWav, cut.startMs, cut.endMs)
      const flags = [...row.flags]
      if (durMs < TOO_SHORT_MS) flags.push('too-short')
      if (peak !== null && peak >= CLIPPED_DBTP) flags.push('clipped')
      const status = worstOf(
        row.status,
        durMs < TOO_SHORT_MS ? 'too-short' : null,
        peak !== null && peak >= CLIPPED_DBTP ? 'clipped' : null,
      )
      const file = join(outDir, `${row.id}.mp3`)
      if (!opts.dryRun) cutToMp3(normWav, file, cut.startMs, cut.endMs)
      clips.push({
        id: row.id,
        status,
        flags,
        startMs: Math.round(cut.startMs),
        endMs: Math.round(cut.endMs),
        durationMs: Math.round(durMs),
        peakDbfs: peak === null ? null : Number(peak.toFixed(1)),
        file: opts.dryRun ? null : file,
      })
    }

    if (opts.verify && !opts.dryRun) {
      if (!profile.verifiable) {
        warnings.push('--verify does not apply to klanken: an isolated "f" is not a word, and the review screen is the check.')
      } else {
        const verified = verifyClips(clips, { bin: opts.whisperBin, model: opts.whisperModel })
        if (verified.ok) {
          for (const clip of clips) {
            const v = verified.byId[clip.id]
            if (!v) continue
            clip.transcript = v.transcript
            clip.verifyDistance = v.distance
            if (v.mismatch) clip.flags.push('verify-mismatch')
          }
        } else {
          warnings.push(verified.message)
        }
      }
    } else if (opts.verify && opts.dryRun) {
      warnings.push('--verify needs the clips on disk; it does nothing under --dry-run.')
    }

    const report = {
      version: 1,
      generatedAt: new Date().toISOString(),
      take: takePath,
      cues: sheet ? cuesPath : null,
      kind,
      out: outDir,
      dryRun: opts.dryRun,
      audio: {
        durationMs: Math.round(totalMs),
        noiseFloorDbfs: floor === null ? null : Number(floor.toFixed(1)),
        silenceThresholdDb: Number(threshold.toFixed(1)),
        burstCount: bursts.length,
        inputLufs: Number(measured.input_i),
        beepsFound: alignment.beepsFound,
        alignmentOffsetMs: Math.round(alignment.offsetMs),
      },
      warnings,
      clips,
      summary: {
        total: clips.length,
        ok: clips.filter((c) => c.status === 'ok' && !c.flags.includes('verify-mismatch')).length,
      },
    }
    const reportPath = `${takeBase}.report.json`
    if (!opts.dryRun) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

    printSummary(report, reportPath, opts.dryRun)
    return report.summary.ok === report.summary.total && warnings.length === 0 ? 0 : 1
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function printSummary(report, reportPath, dryRun) {
  const flagged = report.clips.filter((c) => c.status !== 'ok' || c.flags.includes('verify-mismatch'))
  const order = (c) => STATUS_RANK.indexOf(c.status)
  for (const clip of [...report.clips].sort((a, b) => order(a) - order(b))) {
    const mark = clip.status === 'ok' ? '  ' : '! '
    const dur = clip.durationMs === null ? '   —  ' : `${String(clip.durationMs).padStart(4)}ms`
    const peak = clip.peakDbfs === null ? '      ' : `${String(clip.peakDbfs).padStart(5)}dB`
    const extra = clip.transcript === undefined ? '' : `  heard "${clip.transcript}"`
    process.stdout.write(`${mark}${clip.id.padEnd(12)} ${clip.status.padEnd(10)} ${dur} ${peak}${extra}\n`)
  }
  process.stdout.write(`\n${report.summary.ok}/${report.summary.total} ok`)
  process.stdout.write(flagged.length ? `, ${flagged.length} to listen to.\n` : '.\n')
  for (const w of report.warnings) process.stdout.write(`⚠️  ${w}\n`)
  if (dryRun) process.stdout.write('\nDry run: nothing was written.\n')
  else process.stdout.write(`\nWrote ${report.out}/ and ${reportPath}\nOpen /#/opnemen to listen to the flagged rows; restart the dev server so Vite picks up the new mp3s.\n`)
}

try {
  process.exitCode = main()
} catch (err) {
  process.stderr.write(`\n${err.message}\n`)
  process.exitCode = 1
}
