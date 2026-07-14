# DuoLexie — Plan

## Context

A Duolingo-style web app for a 9-year-old Dutch girl with dyslexia, in treatment at RID (Regionaal Instituut voor Dyslexie). Goal: make her daily reading practice fun and game-like, complementing (never replacing) her RID home practice. Her father (the user) built CardFlash, a flashcard PWA with the 45 Dutch klanken in 6 categories — that inventory is the content foundation.

**Decisions locked in with the user:**
- Content progression: sounds → words → sentences
- Audio: family-recorded clips + a recording helper tool
- Reading-aloud checks: self/parent grading in v1, speech recognition as later experiment
- Stack: React + Vite + TypeScript, kid-friendly PWA, Dutch UI
- Auth: family account (parent email+password) + kid profile with avatar/PIN; progress syncs across devices
- Parent dashboard: later iteration, but progress data stored from day one
- Hosting: Azure free tier, deploy from GitHub, user's custom domain
- Flashcard game is speed-focused (matches her current RID practice); other games accuracy-focused
- Games work in both directions: see letters → say sound AND hear sound → tap the letters

---

## 1. How we think RID works (documented understanding)

### Verified from public RID sources
- RID's treatment program is called **CODE**, built on four pillars: phonological skills, **letter-klankkoppeling** (letter↔sound coupling), reading practice, and spelling. It follows the national Protocol Dyslexie Diagnostiek & Behandeling.
- Letter-klankkoppeling is trained **in both directions** (letters→sounds and sounds→letters) before moving to words and sentences.
- **Automatization and speed are central**: fluent reading = quickly, automatically coupling letters and sounds. RID uses **flitslezen** (flash reading) and the Reading Acceleration Program (disappearing text at auto-adjusting pace). This confirms the observation that her flashcard practice is about speed.
- Home practice: ~5x/week, ~20 min, parent as "oefenpartner", adaptive digital exercises. RID itself gamifies (companion character, visible progression, their KlankKr8 serious game for klank-tekenkoppeling).

### Assumed / to verify with her behandelaar
- **Klankgebaren** (sound gestures) are common in Dutch reading education but not clearly documented as part of CODE, and evidence is mixed. Not built into the app; optionally record a parent video per sound as a hint later.
- CODE's exact sound-introduction order isn't published → the app makes sound order **parent-configurable** (see §3); a sensible default is provided.

### Design principles for the app
1. Bidirectional coupling — every skill trained teken→klank and klank→teken.
2. Accuracy first, then speed — a sound is drilled for accuracy before it appears in timed games; speed is the *mastery* criterion.
3. Short sessions (5–10 min), fitting inside the daily 20-min practice.
4. One new thing at a time; everything old keeps coming back (mixed review).
5. Low frustration: no hearts/lives, errors always answered by playing the correct sound, sessions end on a success.
6. Parent in the loop: grading, progress heatmap, sound configuration.

---

## 2. Mini-game catalog

Direction: **Lezen** = see letters → produce/recognize sound. **Luisteren** = hear audio → pick letters. All audio = family recordings.

| # | Game | Direction | Level | Focus | Iteration |
|---|---|---|---|---|---|
| 1 | **Flitsen** | Lezen | klank+woord | **Speed** | v1 |
| 2 | **Klankenjacht** | Luisteren | klank | Accuracy | v1 |
| 3 | **Welke klank?** | Lezen | klank | Accuracy | v1 |
| 4 | **Woordbouwer** | Luisteren | woord | Accuracy | v1 |
| 5 | **Hardop lezen** | Lezen | woord | Accuracy | v1 |
| 6 | **Klankzoeker** (find the sound in a word) | Beide | woord | Accuracy | v2 |
| 7 | **Woordenvangst** (hear word → tap correct spelling; trains ei/ij, au/ou) | Luisteren | woord | Accuracy | v2 |
| 8 | **Verdwijnzinnen** (RAP-style disappearing text) | Lezen | zin | Fluency | v2–v3 |
| 9 | **Zinnenbouwer** (arrange word tiles into heard sentence) | Luisteren | zin | Accuracy | v3 |

v1 game details:
- **Flitsen** — digital version of her RID flashcard practice. Grapheme (later word) flashes; she reads aloud; she/parent taps **Goed! / Nog even**; 60-second rounds; score = klanken per minuut with personal records ("Versla jezelf!"). Grading is trusted, not policed — same as RID home practice. Speech recognition slots in behind this same interface later.
- **Klankenjacht** — hear a clip (replayable) → tap the right grapheme tile from 3–6 options. Wrong: tile shakes, correct tile pulses + plays, item re-queued. Distractors scale from random to her personal confusion pairs (ei/ij, au/ou, f/v, s/z, b/d, ng/nk…).
- **Welke klank?** — mirror: see one grapheme → tap the speaker button that plays the matching sound (3–4 audio options). Fully self-checking, no speech needed.
- **Woordbouwer** — hear a word → assemble it from **klank-chunk tiles** (`b · oo · m`, segmented by klank, never by letter — the RID-aligned detail). Scales: mkm → clusters → two syllables; distractor tiles from confusion pairs.
- **Hardop lezen** — word appears untimed; she reads aloud; taps the word to hear the family recording as self-check; grades Goed/Nog even.

---

## 3. Path & progression

**Hierarchy:** Fase → Unit → Les (path node) → Oefening.
- Les = 10–15 exercises, 3–5 min, 1–2 game types, ~70% current material / 30% weighted review.
- Unit = 5–8 lessen ending in an **Eindbaas** (mixed test) + **Schatkist**.
- Special path nodes: **Flits-uitdaging** (beat your speed record), **Herhaling**, **Schatkist**.

**Words interleave early:** "sounds → words → sentences" is the micro-progression *within each unit*, not a global gate — once a unit's sounds are accurate, its last lessons use them in real words restricted to already-learned graphemes.

**Parent-configurable sound order:** the path is generated from a config marking each klank *actief / nog niet / al beheerst*, so it can mirror where she is in RID treatment. Default fase order: (1) Korte klanken + medeklinkers in waves, mkm-words from unit 2; (2) Lange klanken with kort↔lang contrast (man/maan); (3) Twee tekens I (ie oe eu ui uw); (4) Tweelingklanken ei/ij + au/ou (homophone units); (5) Twee tekens II (ch ng nk); (6) Drie & vier tekens; (7) Woordenrijk (two-syllable, mixed); (8) Zinnen.

A short placement flow (parent marks known sounds + one Flitsen round per category) pre-completes early nodes so she isn't bored.

**Mastery per sound:** Nieuw → Leren → **Geleerd** (≥90% accuracy over last 10 exposures) → **Goud** (geleerd + fast median response). Speed is the crown criterion, matching RID's automatization goal. Units show 1–3 crowns; crown 3 replays with tighter timers and nastier distractors.

**Adaptivity (v1, deliberately simple):** per sound store `{attempts, correct, ewmaAccuracy, ewmaResponseMs, lastSeenAt, confusions}`. Review slots filled by weighted random sampling (`weight = 1 + 3·(1−ewmaAccuracy) + 2·slowness + staleness`). Every wrong tap records the confused grapheme → **personal confusion matrix** drives distractor generation (highest-value adaptivity feature, in v1). No SM-2 scheduling — a weighted sampler over ~45 items suffices.

---

## 4. Rewards & motivation

Principles: reward effort and self-beating, never social comparison; no punitive mechanics.

**v1:**
- **Edelstenen (gems):** +10 per les, +5 perfect, +10 new Flits record, +20 Eindbaas. Accumulate in a visible treasure jar on the home screen (shop comes in v2).
- **Weekdoel, not a daily streak:** RID prescribes 5 days/week → a weekly ring "5 van de 7 dagen"; full rings build a streak of *weeks*. Missing a day is never shown negatively. (Deliberate divergence from Duolingo's guilt-streak.)
- **Mascot:** one character — suggestion "Flits de vos" (pick with her!). 4 states: idle, cheering, gentle encouragement, party. Static images + CSS/Lottie.
- **Celebrations:** canvas-confetti, full-screen "NIEUW RECORD" in Flitsen, crown animation, and **family-recorded voice clips** for milestones ("Nieuw record!" in dad's voice).
- **Records board:** klanken-per-minuut per category, best week, gold sounds.
- Explicitly excluded: hearts/lives, leaderboards, timers in accuracy games.

**v2:** Schatkisten → stickers for a **Stickerboek** (collection completion), Winkeltje (spend gems on mascot outfits/themes), profile titles ("Klankenkenner → Woordenwonder → Zinnenster").

**v3:** speech recognition silently scored alongside self-grading before trusting it; weekly "letter from Flits" recap.

---

## 5. Hosting & Azure setup (facts verified July 2026)

**Azure Static Web Apps (SWA) Free plan** — recommended over App Service F1:
- 2 custom domains with **free managed SSL**; GitHub Actions deploy wired automatically when creating the resource; **managed Azure Functions API included** (Node 22, `/api` prefix, 45s max request, HTTP only).
- Limits fine for us: 100 GB bandwidth/mo, 250 MB app size (45 sound clips + a few hundred word clips ≈ 15–25 MB as 64kbps mono MP3).
- App Service F1 loses: 60 CPU-min/day, sleeps, and no free managed SSL on custom domains.
- Cold starts (~1–5s) on the managed functions → progress sync must be fire-and-forget, never blocking gameplay.

**Database: Cosmos DB NoSQL free tier** (verified: 1000 RU/s + 25 GB free for account lifetime, one per subscription, opt-in at creation). One shared-throughput DB `duolexie` with containers `auth` (pk `/email`) and `data` (pk `/familyId`). Session sync ≈ 50–100 RU a few times/day — enormous headroom. Fallback if free slot is taken: Table Storage (cents/month).

**Resources:** `rg-duolexie` (West Europe) + `swa-duolexie` (Free) + `cosmos-duolexie` (free tier). Custom domain via CNAME, e.g. `lexie.<jouwdomein>.nl`. Recurring cost: **€0**.

Flagged to confirm at resource creation: SWA managed-functions region availability (West Europe assumed) and the Cosmos free-tier banner showing 1000 RU/s.

## 6. Repo structure

Three self-contained packages, no npm-workspace hoisting (SWA's Oryx builds `app/` and `api/` independently; `shared/` consumed as TS source via path alias):

```
DuoLexie/
├── .github/workflows/azure-static-web-apps.yml
├── app/                      # React + Vite + TS PWA
│   ├── public/audio/{sounds,words}/{id}.mp3
│   ├── public/staticwebapp.config.json   # SPA fallback, apiRuntime node:22
│   └── src/
│       ├── screens/          # PathScreen, ProfileSelect, ParentGate, GameScreen, RewardScreen
│       ├── games/            # one folder per game type + registry.ts (shared game contract)
│       ├── engine/           # exerciseSelector.ts: weighted sampler, mastery, confusion matrix
│       ├── state/            # zustand stores (session, progress, auth), persisted to IndexedDB
│       ├── sync/             # outbox.ts: IndexedDB queue + idempotent flush
│       ├── rewards/          # gems, weekdoel, records, celebrations
│       └── dev/RecordingStudio.tsx       # dev-only /opnemen route
├── api/                      # Azure Functions v4, TypeScript
│   └── src/functions/{auth,profiles,progress}.ts + lib/ (cosmos, jwt, cookies, bcryptjs)
├── shared/
│   ├── src/types.ts          # DTOs shared app↔api
│   └── curriculum/           # sounds.json (45 klanken/6 categories), words/{soundId}.json, sentences/
└── tools/convert-audio.mjs   # ffmpeg webm→mp3 + loudness normalize
```

## 7. Auth & API

SWA built-in auth is GitHub/Entra-only on Free (email+password needs Standard, $9/mo) → **minimal custom auth in the Functions API**:
- Password hashing with **bcryptjs** (pure JS — native modules like argon2 break Oryx builds).
- Session = JWT (`{familyId, email}`) in an `httpOnly; Secure; SameSite=Strict` cookie, 30-day sliding expiry. Same-origin `/api` on SWA → no CORS/cookie friction, XSS-immune.
- Kid profiles: Netflix-model. After family login, profile picker with avatars; optional 4-digit PIN (anti-sibling lock, hashed, verified server-side). Client keeps active `profileId`; API authorizes every call by checking the profile belongs to the JWT's `familyId`.
- Parent gate (profile management, later dashboard): re-prompt account password client-side.

Endpoints: `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `GET|POST /api/profiles`, `POST /api/profiles/{id}/verify-pin`, `GET /api/progress/{profileId}`, `POST /api/progress/{profileId}/sync`.

## 8. Data model & offline sync

Docs in `data` container discriminated by `type`:
- **profile** — name, avatar, pinHash, xp/gems counters, week-streak state.
- **soundProgress** — one per profile×sound: attempts, correct, ewmaAccuracy, avgResponseMs, mastery (0–3), confusions map, lastPracticedAt.
- **sessionResult** — client-UUID id (idempotency key), lessonId, answers `[{soundId, wordId?, correct, ms}]`, xp/gems earned. Audit trail + sync unit.

**Sync protocol (local-first):** zustand+IndexedDB is the UI's source of truth; each finished lesson appends a SessionResult to an outbox; a flush loop (app start, `online` event, post-lesson) batch-POSTs to `/sync`; server skips already-seen ids (idempotent), updates soundProgress + counters, returns authoritative totals. New device: login → pick profile → GET progress snapshot seeds IndexedDB.

## 9. Audio recording helper

Dev-only route `/opnemen` (mounted when `import.meta.env.DEV`): lists every needed clip from the curriculum JSON with recorded/missing status; MediaRecorder with big record/replay buttons and auto-advance; saves via File System Access API directly into `app/public/audio/` (JSZip download fallback). Then `node tools/convert-audio.mjs` (ffmpeg) converts webm→normalized MP3 for commit. (MediaRecorder can't emit MP3 natively — hence the convert step.)

## 10. Milestones (each ends deployed & playable)

**Phase 0 — Walking skeleton (day 1):** git repo + GitHub, Vite/React/TS scaffold, `sounds.json`, SWA resource + generated workflow, custom domain + SSL. *Done = placeholder live on your domain via git push.*

**Phase 1 — First playable (local-only, no backend):** Recording studio → record Fase 1 sounds; **Flitsen** (speed flashcards with Goed/Nog even + klanken-per-minuut records) and **Klankenjacht** (hear→tap letters); path screen with Fase 1 units; local progress/gems/records in IndexedDB; mascot v0 + confetti; dyslexia-friendly font toggle (Lexend/OpenDyslexic), big buttons, Dutch UI. *Done = she can do real lessons on the real domain.*

**Phase 2 — Full v1 game set + PWA:** **Welke klank?**, **Woordbouwer** (klank-chunk tiles), **Hardop lezen**; word lists + recordings for Fases 1–3; weighted review sampler + confusion-matrix distractors; weekdoel ring; vite-plugin-pwa (installable, offline audio precache); Eindbaas + Schatkist nodes.

**Phase 3 — Accounts & sync:** Cosmos free-tier account, `api/` package (auth/profiles/progress), register/login + profile picker with avatar/PIN, outbox sync engine, migrate existing local progress into the first profile.

**Phase 4 — v2 content & parent dashboard:** Fases 4–7, **Klankzoeker** + **Woordenvangst**, parent dashboard (per-sound accuracy/speed heatmap, active-sound configuration), stickerboek + winkeltje.

**Later:** Fase 8 zinnen (**Verdwijnzinnen**, **Zinnenbouwer**), speech recognition silently scored alongside self-grading, placement flow refinements.

## 11. Verification

- Every phase: `git push` → GitHub Actions → live on the custom domain; test on her actual tablet/device.
- Phase 1: complete a full lesson end-to-end in the browser (audio plays, grading works, gems/record persist across reload via IndexedDB).
- Phase 3: register → create profile → play lesson → open site on a second device/browser → login → progress present. Kill network mid-session → finish lesson → reconnect → outbox flushes (verify sessionResult docs in Cosmos Data Explorer, replay is idempotent).
- Real user test: watch her play; the design review that matters most.

## Open items for the user (not blocking)

- Which domain/subdomain to point at the app.
- Pick the mascot together with her (suggestion: "Flits de vos").
- Ask her RID behandelaar about klankgebaren and current active sounds to configure the path.
