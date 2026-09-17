# Opnamestudio v3: getting to clean clips, and keeping track of them

Implementation spec for the next pass on the dev-only recording studio (`/#/opnemen`) and
`tools/split-take.mjs`. The v2 pipeline (`docs/recording-pipeline-v2.md`, built) fixed the
four causes of the clacky first batch. It has not yet produced a clip that ships:
`app/public/audio/words/` and `app/public/audio/weetjes/` are empty, and the 45 klanken are
still the old ones. This pass is about the things that decide whether the **first real take**
comes out clean, and about making the record → cut → listen → judge → retake loop cheap enough
to do three times in an evening.

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement. The three tiers are also the
build order; **Tier 1 and Tier 2 ship together in one PR**, Tier 3 is a second PR after Arjan
has heard real output.

**Status:** Tier 1 and Tier 2 **built** (Claude Opus 5, 1M context). Tier 3 planned, not built —
a second PR once Arjan has heard real output. Deviations are marked *(as built)* where they
occur.

### Sequencing, and the two seams this change must leave

This ships **first**; then the history purge; then `docs/private-audio.md`, which moves every
clip out of the repository into private storage behind the API. See `docs/private-audio.md`
§0 for why the three cannot overlap.

Two consequences for this change:

- **The splitter keeps writing to `app/public/audio/<folder>/`.** That folder is gitignored
  since `4d97bbf`, so clips live there locally and can be neither committed nor deployed;
  private-audio moves the output to `recordings/clips/`. **Never commit an mp3** — CI will
  refuse it once the guard lands, and the whole point is that the voice stays out of git.
- **Leave two seams**, so the next change is a swap rather than a rewrite:
  - **`app/src/audio/recorded.ts`** — the single module answering *does this id have a clip*
    (`hasRecording(kind, id)`, `recordedIds(kind)`), backed here by the §3.2 virtual module.
    `words.ts`, `weetjes.ts` and the studio import from it instead of reading
    `__RECORDED_WORDS__` / `__RECORDED_WEETJES__` directly, so those defines have exactly one
    consumer left.
  - **`clipSrc(kind, id)`** — the one place a clip URL is built. The §2.1 verdict grid,
    `TakeReview` and the games all go through it; nothing constructs
    `/audio/${folder}/${id}.mp3` inline.

*(as built)* Both seams are in `app/src/audio/recorded.ts`, which also owns the single
`kind → folder` mapping that `cueSheet.ts` re-exports — a second copy of that mapping is what
made a Weetjes report play from `/audio/words/` and hear nothing (§2.8). `clipSrc` takes a
third argument, the cache-buster, because the two callers need different ones: the build stamp
for the games, where a clip changes only on a deploy, and the file's own `Last-Modified` for
the studio, where a retake overwrites the same URL mid-session. The studio's `HEAD` probe goes
through it too — it is the one clip URL that is not playback, and so the one that would
otherwise have been left behind.

---

## 1. What is already right and must stay

Hands-free take with one `MediaRecorder`; `echoCancellation`/`noiseSuppression`/
`autoGainControl` off (`takeAudio.ts`); the countdown beeps mixed into the recording so the
splitter can align the cue sheet; whole-take two-pass `loudnorm`; padded and faded cuts;
the report sorted worst-first; the retake-only flow. Nothing below removes any of it.

---

## 2. Tier 1 — before the first take

### 2.1 Judging clips: play, approve, reject (Arjan's request)

Today the setup grid shows `✅`/`⬜` per id — recorded or not. It cannot play a clip and it
cannot say "this one is bad". So the state of the set lives in his head, and a clip he
dislikes stays until he remembers to retake it. The grid becomes the place where the set is
**judged**:

- **Every cell is a play button.** Tapping a cell with a clip plays `/audio/<folder>/<id>.mp3`
  (cache-busted with the file's `Last-Modified`, which the existing `HEAD` probe already
  returns). The cell highlights while playing; tapping another stops the first. Keyboard:
  `→`/`←` move a focus ring across the grid, `Enter`/`Space` plays, so a whole set can be
  auditioned from the keyboard without touching the mouse.
- **"▶︎ Alles afspelen"** above the grid plays every listed clip in order with a 400 ms gap
  (same as `TakeReview.playAll`), skipping unrecorded ids, with the playing cell highlighted
  and a **stop** button. **"▶︎ Alleen onbeoordeeld"** plays only the clips without a verdict.
- **Each cell has a verdict**, in this order of precedence: `⬜ ontbreekt` → `🎧 onbeoordeeld`
  → `✅ goed` → `❌ afgekeurd`. Two buttons appear on the focused/hovered cell: **✓ Goed** and
  **✗ Afkeuren**. During *Alles afspelen*, `G`/`A` (or `↑`/`↓`) judge the clip that is playing
  and move on — that is the fast path: listen to twenty clips and judge each with one key.
- **Afkeuren does two things.** It sets the verdict, and it **counts the id as missing**, so
  "alleen ontbrekende" and the *Start take* count include it and the next take re-records it
  without further bookkeeping. The mp3 is not deleted from `public/` yet (a rejected clip
  still beats TTS in a round until it is replaced); with Tier 2 it is *moved* to
  `recordings/afgekeurd/<id>-<timestamp>.mp3`, never deleted, so a retake that turns out
  worse can be reverted by hand.
- **A verdict belongs to a file, not an id.** Store the clip's `Last-Modified` with the
  verdict; when the probe sees a newer file (a retake landed), the verdict resets to
  `onbeoordeeld`. Otherwise a retake would inherit the `❌`.
  *(as built)* Compared for **inequality**, not for "newer": a clip restored by hand out of
  `recordings/afgekeurd/` carries an older timestamp and is still not the recording that was
  judged. When the server sends no `Last-Modified` the verdict is kept rather than reset —
  losing one is a nuisance, inheriting one across a retake is a wrong answer that hides
  itself — and a verdict is not stored at all against a file whose timestamp is unknown,
  since nothing could ever invalidate it.
  *(as built)* A `❌` survives the file disappearing, because with Tier 2 rejecting *moves*
  the mp3 out of `public/`. `❌` and `⬜` both mean "record this", but they are not the same
  fact and one of them says somebody listened. A `✅` about a file that has vanished is
  dropped.
- **Storage:** `localStorage['duolexie-studio-verdicts']` as `{ [folder/id]: { verdict,
  lastModified } }` in Tier 1; Tier 2 moves it to `recordings/verdicts.json` through the dev
  middleware so it survives browsers and is visible to the tools (§3.3). Migrate silently
  on first load when the middleware is there.
- **Counts in the set buttons** become `goed / totaal` (e.g. *Woorden, startset (12 goed van
  20)*), and the header shows `⬜ n · 🎧 n · ✅ n · ❌ n` for the current set.
  *(as built)* `goed` counts `✅` only, not "has a file". The 45 klanken on disk are the old
  clacky batch and none of them has been approved, so *Klanken (0 goed van 45)* is exactly
  what that set's state is. All four sets are probed on load so every button can say where it
  stands without being clicked; the counts fill in over a second or two.
- **Same verdict controls in `TakeReview`** (the per-take report): its rows get ✓/✗ too and
  write the same store, so judging right after a split and judging later in the grid are the
  same act. The report's *"Deze opnieuw opnemen"* pre-checks every `❌`.

### 2.2 Level meter during the take

The teleprompter shows no level at all; a slipped mic, a USB device dropping out or one
clipped word is discovered only at split time, after a three-minute take. Add to the
teleprompter, small and out of the way of the word:

- a peak meter with **peak-hold** (1.5 s), fed from the graph's existing `AnalyserNode`;
- a **clip counter** (`> -0.5 dBFS` for ≥ 2 consecutive frames), red, with the id it happened
  on — those ids are **auto-flagged for retake** in the cue sheet (`retake: true`), exactly as
  if Space had been pressed;
  *(as built)* counted and flagged **once per word**. Once per frame races to hundreds on a
  microphone set too hot; once per take is worse, because a continuously clipping input never
  lets the frame counter fall back, so the only clip ever reported is the one during the
  countdown — before any word is on screen — and the counter never names a word at all.
  Auto-flagging is bounded the same way: that microphone clips the retakes too, and a queue
  that re-flags what it re-prompts is a take that never ends, where a person pressing Space
  eventually stops;
- a **"geen signaal"** warning when the peak stays below -55 dBFS for 5 s while prompting.

### 2.3 Target zone and verdict on the setup meter

The setup meter's only verdict is `> -3 dBFS = hot`. Draw a green band at **-18 … -6 dBFS
peak** and print a verdict under it: *te zacht — zet de gain hoger* (peaks below -24 while
speaking), *goed*, *te hard* (above -6), *oversturing* (≥ -0.5). A take recorded at -30
dBFS peak gets pulled up by loudnorm together with all the room noise; that is a large part
of what "not clean" sounds like, and it is fixable only before the take.

### 2.4 Stiltemeting

Next to *Test 3 seconden*: **"Meet de stilte (2 s)"** — record two seconds without speaking
and report:

- the noise floor (RMS, dBFS) with a verdict: `< -60` *stil*, `-60…-50` *oké*, `> -50`
  *ruis — ventilator, laptop, koelkast?*;
- **brom**: FFT energy at 50 and 100 Hz more than 20 dB above the neighbouring bins →
  *brom — kabel, USB-voeding, dimmer?*

The floor is also the number the splitter's threshold is derived from, so a quiet floor is
both a cleaner clip and a more reliable cut. Show the last measurement next to the meter
until the next take.

### 2.5 High-pass in the decode step

`lib/audio.mjs decodeToWav`: add `highpass=f=70:poles=2` to the filter chain. Removes
rumble, desk thumps and the hum fundamental; speech loses nothing audible. One flag; add a
unit test that a synthetic 50 Hz tone comes out ≥ 20 dB down and a 300 Hz tone within 1 dB.

*(as built)* **The filter is as specified; the 20 dB figure is not reachable with it and the
test asserts the curve it really has.** ffmpeg's `highpass` caps at two poles, and 50 Hz is
less than half an octave below a 70 Hz corner. Measured, sine in / sine out:

| 20 Hz | 30 Hz | 40 Hz | 50 Hz | 70 Hz | 100 Hz | 150 Hz | 300 Hz |
|---|---|---|---|---|---|---|---|
| −21.8 dB | −14.8 dB | −10.1 dB | −6.8 dB | −3.0 dB | −0.9 dB | −0.2 dB | −0.0 dB |

So 20 dB of attenuation lands at 20 Hz, where the rumble is, rather than at 50. Cascading to
reach 20 dB at 50 Hz would cost about 3 dB at 100 Hz, which is a voice's own fundamental and
the one thing a filter here must not touch. The test asserts ≥ 20 dB at 20 Hz, ≥ 5 dB at
50 Hz, and within 1 dB at 150, 300 and 1000. The real answer to hum is §2.4: notice it before
the take.

### 2.6 Retake loudness

`split-take` normalises **each take** to -16 LUFS. A retake take of three words is exactly
the "loudnorm on short material" problem that §1.4 of the v2 spec fixed for clips: three
words measured alone land at a different level than the twenty they must sit among.

- Record the applied gain in the report (`audio.appliedGainDb`, from `measured.input_i`
  versus the -16 target).
- For a take whose cue sheet is a retake (`sheet.retakeOf: <basename>`, written by the
  studio when *Deze opnieuw opnemen* started it) **or** shorter than 30 s of speech, apply
  the **gain of the take it retakes** (read from that take's report) instead of measuring.
  Fall back to measuring, with a warning, when the original report is gone.
  *(as built)* Three readings of that sentence had to be pinned down.
  **"30 s of speech" is read as 30 s of take.** Speech is about a quarter of a reading take —
  twenty words at 2.5 s is fifty seconds of take and maybe twelve of voice — so taken
  literally every take including the first would go down the reuse path, and the first has
  nothing to reuse. Thirty seconds of take is where a three-word retake and a twenty-word set
  actually separate, and roughly where EBU R128 stops having enough gated content to trust.
  **A short take with no `retakeOf` falls back to the newest report of the same kind in the
  same folder**, because that is the level the rest of the set is already sitting at on disk;
  without this rule the "or shorter than 30 s" half of the sentence has nothing to reuse.
  **Only a *named* parent going missing warns.** A short take with nothing before it is the
  first take of a set: measuring is the only thing available, and a warning — which makes the
  exit code 1 — would have the first session of every set failing for doing the only possible
  thing.
- Tier 3's calibration sentence (§4.3) makes this robust across sessions; this is the
  minimum that keeps a same-evening retake at the same level.

### 2.7 Checklist on the setup screen

A collapsible block, four lines, shown until dismissed for the session: *15–20 cm van de
mic, iets naast je mond · plopkap · telefoon stil, ventilator en laptopfan uit · dezelfde
plek en afstand als de vorige keer*. Human factors beat any filter.

### 2.8 Two bugs

- `TakeReview` computes `folder` as `klanken → sounds`, else `words`; a Weetjes report plays
  from `/audio/words/` and hears nothing. Use one shared `folderFor(kind)` in `cueSheet.ts`
  and use it in `RecordingStudio`, `TakeReview` and the grid.
- Review rows and grid cells for Weetjes show `slim-doe`; show the sentence (the studio's
  `weetjeCues().labels`) with the id small underneath.

---

## 3. Tier 2 — the terminal leaves the loop

A take today is: pick a folder → record → copy a command → run it in a terminal → *Rapport
laden* via a file picker → restart the dev server → play a round. Each arrow is a place to
stop. A small **Vite dev-server plugin** (dev only; must not exist in the production build)
collapses it.

### 3.1 `app/vite-plugins/studio.ts`

`configureServer(server)` adds middleware under `/__studio/` (JSON; 404 outside dev):

| Route | Does |
|---|---|
| `POST /__studio/take` | body: multipart with the webm and the cue sheet → writes `recordings/<basename>.webm` + `.json`. The File System Access picker stays as a fallback when the middleware is absent (e.g. the preview build). |
| `POST /__studio/split?take=<basename>[&ids=a,b]` | spawns `node tools/split-take.mjs recordings/<basename>.webm [--ids …]`, streams stderr lines as NDJSON progress, ends with the report JSON. |
| `GET /__studio/report?take=<basename>` | the report, if it exists. |
| `GET /__studio/takes` | list of takes in `recordings/`, newest first, with whether a report exists. |
| `GET/PUT /__studio/verdicts` | `recordings/verdicts.json` (§2.1). |
| `POST /__studio/reject?folder=words&id=kat` | moves the mp3 to `recordings/afgekeurd/<id>-<ISO>.mp3` and records the verdict. |

Paths are validated: basenames only, no `..`, folder must be one of the three known ones.

*(as built)* An allowlist — `^[A-Za-z0-9][A-Za-z0-9._-]*$`, then an explicit `..` rejection on
top — rather than a search for `..`: a denylist has to anticipate `..`, `%2e%2e`, a leading
slash, a Windows drive letter, a NUL and a backslash, and it only takes one being missed. This
server listens on the network whenever `vite --host` is used to try a clip on the iPad.
*(as built)* Multipart is parsed by Node's own `Request.formData()` (undici), so there is no
dependency and no hand-rolled boundary splitting over binary data.
*(as built)* Anything else under `/__studio` answers 404 JSON rather than falling through to
the SPA, which would hand back `index.html` with a 200 for a request that expects JSON.

### 3.2 No more restart

`__RECORDED_WORDS__` is read once at Vite start. Make the plugin serve a **virtual module**
(`virtual:recorded-audio`) that lists `words/`, `sounds/` and `weetjes/` and is invalidated
via `server.watcher` on `app/public/audio/**`, so a clip written by the splitter is used by
the next round without a restart. `words.ts hasWordRecording` and the weetjes probe import
it; production builds keep getting a static list at build time as they do today.

*(as built)* The module exports `Set`s that the plugin **refills in place** over a custom HMR
event, as well as invalidating the module. Invalidation alone only helps the *next* page load;
the event reaches the page that is open now with no module re-execution, no HMR boundary to
arrange and — the thing that matters mid-session — no reload, because what is on screen at
that moment is the report for the take just recorded. `server.watcher.add` is given a plain
directory: chokidar 4 dropped glob support, so a `/**` suffix would name a directory that does
not exist.

### 3.3 The studio uses it

- After a take: **one button, "Knip en beluister"** — upload if needed, split, show the
  report with §2.1's verdict controls, no terminal. Progress lines from the splitter are
  shown as they arrive.
  *(as built)* When the middleware is there, the folder picker is not offered at all — there
  is nothing left to pick. Without it the screen is exactly what it was: pick a folder, copy
  the command, *Rapport laden*.
- **"Speel een proefronde met deze clips"** opens `/#/proberen` in a new tab.
- **Takes list** on the setup screen (from `/__studio/takes`): re-open any report; *Knip
  opnieuw* for a take whose report is missing.
- `npm run take:split` in `app/package.json` picks the newest `recordings/*.webm` for the
  terminal-inclined.

---

## 4. Tier 3 — better delivery, consistent across sessions (second PR)

### 4.1 Waveform with cue windows

After the split, draw the take's waveform on a canvas (decode the webm with
`AudioContext.decodeAudioData`, downsample to one min/max pair per pixel) with each cue's
window as a coloured band, the detected bursts marked, and the beeps highlighted. Clicking a
band plays that span. "I was late on word 7" or "the breath got cut off as its own burst"
becomes visible at a glance, which is what makes the report trustworthy.

### 4.2 Auto-tempo

Option on the setup screen, off by default: **advance 700 ms after the voice falls below
the threshold**, with a 1.2 s minimum on screen and the pace slider as the maximum. Uses the
analyser already in the graph; still hands-free. The cue sheet records real `shownAt`/
`hiddenAt`, so the splitter is unaffected. A fixed 2.5 s means waiting or rushing, and both
change how a word is read.

### 4.3 Calibration sentence and drift check

Every take starts with a fixed cue, `_kalibratie`: *"Frida leest een boek."* The splitter
measures its LUFS and spectral centroid, stores them in the report, compares with the most
recent previous take of the same kind, and warns when loudness differs by > 2 dB or the
centroid by > 15 % — *microfoon verplaatst?* — before two hundred words are recorded that
will not match the first twenty. The clip itself is never written to `public/`. §2.6 then
normalises retakes on this sentence instead of on the take's gain.

### 4.4 A/B before overwrite

The splitter writes `<id>.mp3` over the previous one. Keep the previous as
`recordings/vorige/<id>.mp3`; the review row offers **oud / nieuw** buttons and *behoud oud*
restores it. Only the confirmed version stays in `public/`.

### 4.5 Listen on the iPad

A QR code / link on the review screen for the LAN address (`vite --host`), so the set can be
auditioned on her iPad's speakers — the real target; studio headphones flatter a clip.

### 4.6 Lossless capture

Record 48 kHz 16-bit mono **WAV** via an `AudioWorklet` (≈ 5.7 MB/min; a three-minute take
is fine) instead of Opus 192k → mp3 64k, so there is one lossy stage and sample-exact
alignment (Opus pre-skip and webm timestamps are part of why the beeps were needed).
`split-take` accepts `.wav` as it accepts `.webm`. Do this after Tier 2, because the upload
path changes with it.

### 4.7 External recorder, documented

The countdown beeps also come out of the speakers, so a take recorded in Audacity or
QuickTime at 48 kHz WAV *while the teleprompter runs* can be split with
`--cues recordings/<basename>.json`: the beeps align it. One paragraph in
`recordings/README.md`; no code. It gives a proper audio driver and monitoring for free.

### 4.8 Klanken hints on the prompt

For isolated sounds, "clacky" is partly pronunciation (a plosive with a schwa after it). Show
a per-klank hint from `sounds.json` under the prompt — *k — kort, zonder "uh"* — once Arjan
has the RID convention from the behandelaar (already on `todo.md`).

---

## 5. Tests

Unit / tool:

1. `lib/audio.mjs` high-pass: synthetic 50 Hz down ≥ 20 dB, 300 Hz within 1 dB (§2.5).
2. `split-take` retake gain: a 3-word retake with `retakeOf` applies the original's gain;
   without the original report it measures and warns (§2.6).
3. Verdict store: a newer `Last-Modified` resets a verdict; reject counts as missing for the
   "alleen ontbrekende" filter (§2.1).
4. `folderFor(kind)` covers all three kinds (§2.8).
5. Plugin route validation: `..`, unknown folder, and absolute paths are refused (§3.1).

E2E (extending the existing three studio tests; Chromium, with the fake microphone the current
tests use):

*(as built)* Split across four spec files rather than one, because Playwright only accepts
`launchOptions` at the top level of a file and each meter test needs a different microphone:
`recording-studio.spec.ts` (a calm tone — Chromium's default fake device clips on every word,
which the new counter is right to flag and which would make a cue-sheet test measure the
meter), `studio-clipping.spec.ts` (hot), `studio-silence.spec.ts` (silent) and
`studio-hum.spec.ts` (50 Hz). Playback is spied rather than heard: what the tests assert is
which URL was requested, in what order, and what the screen did about it.

6. Grid: a cell with a clip plays it (media `play` spy on the URL), highlights, stops when
   another is tapped; `Alles afspelen` visits every recorded id in order.
7. Verdicts: ✗ shows ❌, the set count changes, *Start take* with "alleen ontbrekende" now
   includes the id; reload keeps the verdict; a changed `Last-Modified` (route with a new
   header) resets it.
8. Teleprompter meter: with a synthetic loud fake-mic wav, the clip counter increments and
   the id is `retake: true` in the saved cue sheet.
9. Stiltemeting: with a silent fake mic → *stil*; with a 50 Hz tone → *brom*.
10. Tier 2: *Knip en beluister* against a stubbed `/__studio/split` shows progress lines and
    then the report with verdict controls; no terminal text on screen.
11. Weetjes report rows show the sentence and play from `/audio/weetjes/`.

---

## 6. Verification before a PR

- `npm run lint`, typecheck, unit tests, full Playwright suite in `app/`.
- The production build must contain no `/__studio` code (`grep` the `dist/` output).
- The synthetic-take round trip from the v2 spec (§8 there) still passes.
- **Then the real thing**, by Arjan, same evening: Tier 1 checklist → stiltemeting →
  20-word starter set → *Knip en beluister* → judge all twenty with `G`/`A` → retake the ❌
  set → listen on the iPad → commit the mp3s. The PR description says what could not be
  heard in the sandbox (everything) and what was verified by spy and by synthetic wav.

---

## 7. Docs to update in the same change

- `todo.md`: a line for this plan; tick per tier as they ship.
- `recordings/README.md`: the new loop (no terminal), `verdicts.json`, `afgekeurd/`,
  `vorige/`, the external-recorder paragraph.
- `docs/recording-pipeline-v2.md`: a one-line pointer here at the top.
- This file: Status per tier; deviations marked *(as built)*.

---

## 8. Out of scope

- Any change to how clips are played in the games.
- Cloud or TTS bulk generation (`tools/generate-word-audio.mjs` stays as is).
- A production (non-dev) studio.
