# Recording pipeline v2: one continuous take, split automatically

Implementation spec for replacing the click-per-clip recording studio with a hands-free
continuous take plus an automatic splitter. Written for a fresh session to implement without
having seen the conversation behind it. *Must* marks an acceptance criterion; *suggested* is
open to judgement.

**Status:** built. Extended by [recording-studio-v3.md](recording-studio-v3.md), which adds
judging clips, metering before and during a take, and a dev-server API that takes the
terminal out of the record → cut → listen loop. Nothing there removes anything here.

---

## 1. The problem, and what was actually wrong with the first recordings

The current studio (`app/src/dev/RecordingStudio.tsx`) records one clip at a time: click
record, say the sound, click stop-and-next, repeat 45 times. Arjan recorded all 45 klanken
this way and was not happy with the result — "clacky". Four things are behind that, and the
new pipeline has to fix all four, not just the obvious one:

1. **Clicks in the take.** Every clip starts and ends with a mouse or key press on the same
   desk as the microphone. Hands-free recording removes the cause.
2. **Chrome's default microphone processing.** `getUserMedia({ audio: true })` turns on
   echo cancellation, noise suppression and automatic gain control. On a quiet room with a
   good mic these *hurt*: AGC pumps the level between words, noise suppression smears
   consonants like *s* and *f*. The take must be recorded with all three off.
3. **Cutting at the silence threshold without padding.** `tools/convert-audio.mjs` uses
   `silenceremove`, which cuts at the exact sample the level crosses the threshold — a click
   at the start (partly mitigated by a 15ms fade-in) and a clipped-off ending, since Dutch
   final consonants (*kat*, *bos*) are quiet. Cuts must be padded and faded at both ends.
4. **Loudness-normalising 300ms clips one at a time.** `loudnorm` is designed for programme
   material; on a clip shorter than a second it measures almost nothing and different clips
   end up at visibly different levels, with room noise pulled up on the quiet ones.
   Normalise the whole take **once**, then cut — the words then sit at the natural relative
   levels of one speaker in one room.

Arjan has a decent microphone and can arrange a quiet room. The pipeline's job is to not
undo that.

---

## 2. The design in one paragraph

A dev-only **teleprompter** shows one word at a time at a steady pace while a single
`MediaRecorder` stream runs, with all microphone processing off. Arjan reads each word as it
appears and never touches the keyboard except to flag a stumble. The app saves the take and a
**cue sheet**: when each word was on screen, relative to the recording start. A node tool then
**normalises the whole take, finds the speech inside each word's time window by silence
detection, cuts it with padding and fades, and writes one mp3 per word** — plus a report of
anything it is unsure about, which the studio shows as a review list with play buttons and a
one-tap "opnieuw" queue. No machine learning is needed for the labelling, because the cue
sheet already says which burst is which word. An **optional** local-ASR check (whisper) can
verify the words afterwards, and is also the fallback for a take recorded outside the app
with no cue sheet.

---

## 3. Recording: the teleprompter

Route stays `/#/opnemen` (dev only). The existing per-clip mode may be kept as a secondary
tab or deleted — suggested: delete it once the new flow works, less to maintain.

### 3.1 Setup screen

- **Set to record**: Klanken (all 45) · Woorden, startset (first 20 of
  `wordsInRecordingOrder()`, `data/path.ts`) · Woorden, alle · **Weetjes** (every
  `reviewed: true` card in `shared/curriculum/weetjes.json`, three cues each —
  `<id>-fact`, `<id>-doe`, `<id>-reveal`; the teleprompter shows the sentence, the cue sheet
  carries the id, and the splitter writes `app/public/audio/weetjes/`. docs/weetjes.md §7) ·
  **Alleen ontbrekende** (skip ids that already have an mp3 — reuse the existing
  HEAD-request status check).
- **Pace**: seconds per prompt. Default **2.5s** for words, **2.0s** for klanken, **7.0s**
  for weetjes (a `doe` cue is a question plus its three options). Range 1.5–9.
- **Lead-in**: 3s countdown with a beep on each second and a distinct higher beep at zero,
  after which the first prompt appears. The beeps are recorded into the take on purpose
  (§4.3).
- **Microphone**: a device picker (`enumerateDevices`), a **live level meter** (AnalyserNode
  → peak in dBFS, red above −3), and a "test 3 seconden" button that records and plays back
  so he can check for clipping and noise before committing to a 3-minute take.
- **Folder**: the existing File System Access picker. Takes save to **`recordings/`** at the
  repository root (gitignored, §7), never into `app/public/` — raw takes are not shipped.

### 3.2 The take

- `getUserMedia` with `{ echoCancellation: false, noiseSuppression: false, autoGainControl:
  false, channelCount: 1, sampleRate: 48000 }`, and `MediaRecorder` with
  `mimeType: 'audio/webm;codecs=opus'`, `audioBitsPerSecond: 192_000`. (Opus at 192k is
  transparent for speech; the final output is 64k mp3 anyway. Lossless PCM via AudioWorklet
  is *not* worth the complexity here.)
- One `MediaRecorder` for the whole set. It is started once, at the start of the countdown.
- The screen shows the current word very large (reuse `.big-sound` styling), a thin ring or
  bar that drains over the pace interval, and `12 / 45` progress. Nothing else.
- **Keys during the take** — the only interaction, and none of it is required:
  - **Space**: "that one went wrong" — marks the *current* prompt for a retake. The word is
    appended to a retake queue and shown again after the last word of the set. No pause, no
    stop.
  - **Backspace**: same, for the *previous* prompt (he noticed a beat late).
  - **Esc**: pause (recorder `pause()`, prompt hidden, "gepauzeerd"), Esc again resumes with
    a fresh 3s countdown *and beeps*, and the cue sheet records the pause so the splitter
    does not look for speech inside it.
- **Cue sheet** — one entry per prompt, recorded with `performance.now()` relative to the
  moment `MediaRecorder.start()` was called:

  ```json
  {
    "version": 1,
    "kind": "woorden",
    "startedAt": "2026-09-14T19:02:11.000Z",
    "paceMs": 2500,
    "leadInMs": 3000,
    "cues": [
      { "id": "kat", "shownAt": 3000, "hiddenAt": 5500 },
      { "id": "tas", "shownAt": 5500, "hiddenAt": 8000, "retake": true },
      ...
      { "id": "tas", "shownAt": 61000, "hiddenAt": 63500 }
    ],
    "pauses": [{ "from": 40100, "to": 52800 }]
  }
  ```

  A word marked `retake: true` is superseded by its later entry; the splitter uses the
  **last** non-retake cue for each id.
- On finishing: write `recordings/<kind>-<yyyy-mm-dd-hhmm>.webm` and the matching `.json`.
  Then show the next step in the UI: the exact command to run (§4), and, once its report
  exists next to the take, the review screen (§5).

### 3.3 What the studio must not do

No per-word start/stop. No clicking to advance. No `silenceremove`, no `loudnorm` in the
browser. The browser records and prompts; everything else is the tool.

---

## 4. Splitting: `tools/split-take.mjs`

Node + ffmpeg, like the existing `tools/convert-audio.mjs`. No Python required for the core
path.

```
node tools/split-take.mjs recordings/woorden-2026-09-14-1902.webm
  [--cues recordings/woorden-2026-09-14-1902.json]   default: same basename .json
  [--out app/public/audio/words]                       default: from cues.kind
  [--ids kat,tas]                                      only these
  [--verify]                                           run whisper afterwards (§6)
  [--dry-run]                                          report only, write nothing
```

### 4.1 Steps

1. **Decode** to a temporary 48kHz mono WAV.
2. **Normalise the whole take once**: two-pass `loudnorm` (measure, then apply the measured
   values) to −16 LUFS integrated, true peak −1.5 dBTP — same targets the repo already uses,
   applied where `loudnorm` actually works.
3. **Detect speech bursts** with `silencedetect`. The threshold is *relative to this take*:
   measure the take's noise floor (the 10th-percentile RMS over 100ms frames is a good
   estimate) and set the silence threshold ~12 dB above it, clamped to [−55, −30] dBFS.
   Minimum silence duration **350ms**: shorter gaps are inside words (the stop closure before
   the *t* in *kat* is ~80ms). Anything not silence is a burst; drop bursts shorter than
   **60ms** (breaths, clicks).
4. **Assign bursts to cues.** For each id, take its last non-retake cue and the window
   `[shownAt − 150ms, hiddenAt + 400ms]` (he may start a hair early and end late; the tail
   slack must stay shorter than the pace minus a typical word so windows do not overlap).
   Skip windows that fall inside a recorded pause.
   - exactly one burst in the window → assign it;
   - several → assign the **longest**, flag `multiple`;
   - none → flag `missing`;
   - a burst that overlaps *two* windows → assign to the window containing its midpoint,
     flag both `boundary`.
5. **Cut** each assigned burst from the normalised WAV with **60ms before** the onset and
   **150ms after** the offset (final consonants are quiet and matter most in this app),
   clamped to the neighbouring bursts so two words never share audio, then **fade in 8ms and
   fade out 25ms**. No `silenceremove` anywhere.
6. **Encode** to mp3, mono, 64 kbps CBR (matches the existing clips), to `<out>/<id>.mp3`.
   Existing files are overwritten only for ids present in this take.
7. **Report** to `<take basename>.report.json` next to the take, and print a summary. Per id:
   `{ id, status: 'ok'|'missing'|'multiple'|'boundary'|'too-short'|'clipped', startMs,
   endMs, durationMs, peakDbfs }`. `too-short` under 120ms, `clipped` if true peak ≥ −0.5
   dBTP anywhere in the burst. Exit code 0 if every id is `ok`, 1 otherwise, so it can gate
   a commit.

### 4.2 Without a cue sheet (a take from Audacity or a phone)

If no `.json` exists: assign bursts to ids **in order** from a list given with `--list
woorden-startset|woorden|klanken` or `--ids`. If the burst count differs from the id count,
stop with the counts and the first ten burst timings, and suggest `--verify` (§6), which can
label bursts by content. Order-only assignment must never write files when the counts
differ — one cough would shift every clip after it.

### 4.3 The lead-in beeps

The countdown beeps are in the take deliberately: the tool finds the four beeps (pure tones,
easy to spot as the first bursts, with the last one higher-pitched) and uses the **end of the
last beep as t = 0 of the cue sheet**, instead of trusting that `MediaRecorder.start()` and
`performance.now()` line up to the millisecond across browsers. If the beeps are not found,
fall back to the recorder start with a warning in the report. This also makes an
externally-recorded take alignable later, if the studio is ever used as a prompter for a DAW.

### 4.4 Klanken are different

Isolated sounds are short and some are barely voiced: *k*, *t*, *p* are a ~100ms burst plus a
schwa; *s*, *f* are quiet noise that a threshold can lose. For `kind: 'klanken'`: minimum
burst 40ms, tail padding 200ms, and the threshold clamp lower bound −60 dBFS. The cue sheet
carries the labelling, so no ASR is attempted on klanken (§6) — the review screen is the
check.

---

## 5. Review: the studio shows the report

After a split, the studio (same route) reads `<take>.report.json` from the chosen folder and
shows every id in the set as a row: play button (plays the new mp3 from `app/public/audio/`
via the dev server), duration, status chip. Flagged rows sort to the top. A checkbox per row
and one button, **"Deze opnieuw opnemen"**, start a new take containing only the checked ids
(pace and settings remembered). That closes the loop: a 3-minute take, a 10-second split, a
one-minute listen, a 20-second retake of whatever was wrong.

Also add a **"Alles afluisteren"** button that plays every clip in the set in order with a
400ms gap — the fastest way to hear a level or quality outlier.

---

## 6. Optional verification with a local speech model (`--verify`)

For words only. Runs after the cut, on the individual clips, and **only flags — never
decides**. Single isolated Dutch words are hard for ASR (*kok* vs *kook*), so a mismatch is a
row to listen to, not a rejection.

- Backend: **whisper.cpp** (no Python, one binary + one model file) with the multilingual
  `small` or `medium` model, `--language nl`, one clip per call. Alternative: `faster-whisper`
  via Python if that is already installed. The tool must work without either; `--verify`
  errors out with install instructions if the binary is not on `PATH` or given via
  `--whisper-bin`.
- Compare the transcript to the expected `text` after lower-casing and stripping
  punctuation, with a normalised Levenshtein distance; flag `verify-mismatch` above 0.4.
- **Labelling mode** for a take with no cue sheet and a count mismatch (§4.2): transcribe each
  burst and match it to the *nearest unassigned* expected word in list order (Levenshtein,
  window of ±3 positions), leaving unmatched bursts unassigned (coughs, repeats). Print the
  proposed mapping and require `--accept-mapping` to write files.

If the cue-sheet path turns out to work reliably in practice, this section can stay
unimplemented indefinitely; build it last, and only the flag path first.

---

## 7. Repository changes

- `.gitignore`: add `recordings/`. Add `recordings/README.md` (committed, one paragraph:
  what lives here, that it is not shipped, and the split command).
- `tools/split-take.mjs` — new. `tools/convert-audio.mjs` stays for now (klanken already
  recorded with it); mark it in its header as superseded by `split-take.mjs`, and delete it
  when the klanken have been re-recorded with the new flow.
- `app/src/dev/RecordingStudio.tsx` — the teleprompter (§3) and the review screen (§5).
  Suggested split into `dev/Teleprompter.tsx`, `dev/TakeReview.tsx`, `dev/cueSheet.ts`
  (types + the pure timing helpers) to keep each under ~250 lines.
- `app/vite.config.ts`'s `__RECORDED_WORDS__` manifest already picks up new mp3s in
  `public/audio/words/` on the next dev-server start; nothing to change. Mention the restart
  in the studio's post-split message.
- `README.md` "Audio opnemen" section: rewrite for the new flow.
- `todo.md`: replace the two outstanding recording items with the new state; and the
  code-review-backlog entry about ten `<audio>` elements per round becomes *more* relevant
  once real clips exist — leave it, but reference it from the studio's post-split message so
  a real-device check is not forgotten.

---

## 8. Tests

- **Pure logic, unit-tested with vitest (`app/src/dev/cueSheet.test.ts` or, if the helpers
  live in `tools/`, a `node --test` file next to them):** the burst→cue assignment of §4.1
  step 4 with synthetic bursts and cues, covering: one burst per window; two bursts in one
  window (longest wins, `multiple`); an empty window (`missing`); a burst straddling two
  windows (`boundary`, midpoint rule); a retaken word (last non-retake cue wins); a pause
  (windows inside it skipped); no cue sheet with matching count (order assignment); no cue
  sheet with mismatched count (refuses). Keep the assignment a pure function of
  `(bursts, cues, options)` so this needs no audio.
- **End to end, deterministic, no microphone:** a test that *generates* a take with ffmpeg
  (`-f lavfi` sine bursts of known lengths separated by known silences, plus the four lead-in
  beeps) and a matching cue sheet, runs `split-take.mjs` on it, and asserts one mp3 per id
  with duration within ±40ms of expected and a report of all `ok`. Skip cleanly (not fail)
  when `ffmpeg` is not on `PATH`; GitHub's ubuntu runners have it, this sandbox does not.
- **Studio e2e** (`tests/e2e/recording-studio.spec.ts`, desktop project only, which already
  runs Chromium with `--use-fake-device-for-media-stream`): a 3-word set at 1.5s pace
  produces a `.webm` and a `.json` whose cues are 3 entries at 1500ms spacing after the
  lead-in; Space during the second word appends a retake cue for it. Use the File System
  Access fallback (download) or intercept the write, whichever the existing spec already
  does. The existing two studio tests describe the old auto-chain and will be replaced.

---

## 9. Verification before a PR

From `app/`: `npm run build`, `npm run lint`, `npm test`, `npx playwright test
--project=desktop` (in the Claude sandbox use a throwaway config pointing
`launchOptions.executablePath` at `/opt/pw-browsers/chromium`, and expect the one known
`path-to-lesson` console-error failure caused by the sandbox blocking Google Fonts — confirm
it fails identically on untouched `main`). Run the synthetic end-to-end split test on a
machine with ffmpeg; if the sandbox has none, say so in the PR and rely on CI. Then a **real**
take: this cannot be done by the session — Arjan records the 20 starter words with the new
flow, runs the split, listens to the review, and reports back. The PR should be mergeable
before that, with the studio + tool complete and the synthetic test green.

---

## 10. Out of scope

Bulk TTS generation (`tools/generate-word-audio.mjs`) stays as-is as the fallback for words
nobody records. Nothing in the game code changes. The `<audio>` caching question stays in the
backlog. The vertical-swipe rework (docs/hardop-lezen-swipe-v2.md) is a separate change on a
separate branch; do not touch `HardopLezen.tsx` here.
