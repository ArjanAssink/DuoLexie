# Private audio: the voice recordings live outside the repo

Implementation spec for moving every recorded clip — klanken, woorden, weetjes — out of the
public repository and the public site, into private Azure Blob Storage served through the
existing Functions API behind a short-lived token and a rate limit. The recordings are one
person's voice. A public git repo with a folder of neatly labelled `kat.mp3`, `bos.mp3`… is
the most convenient voice-cloning dataset imaginable, indexed by every crawler that sweeps
GitHub and immutable in history forever. This spec makes that impossible by construction,
and says honestly what it does *not* protect against.

It is written to be implemented by a fresh session that has not seen the conversation behind
it. Everything needed is here or in the files it names. Where it says *must*, that is an
acceptance criterion; where it says *suggested*, use judgement.

**Status:** planned, not built. **The history purge in §9 has been done** (2026-09-16): no
audio remains anywhere in the repository's history, and the rule that keeps it that way is
in `AGENTS.md` / `CLAUDE.md`.

---

## 1. What this protects, and what it cannot

**Cannot:** anything the app plays, a visitor can capture. HTTPS protects bytes in transit,
not from the recipient; devtools' network tab or a system-audio recorder defeats any
"streaming" scheme, and DRM for a few hundred single-word mp3s is not a serious option.
Modern voice cloning needs seconds of audio, and any public video of Arjan speaking is a
better source than isolated words. So this is not "safe from cloning".

**Can:** remove the *bulk, labelled, permanent* dataset. After this spec:

- no clip is in git, in git history, in any fork made after the purge, or on the public
  site's file tree;
- no crawler can list or fetch clips — there is no listing, every fetch needs a token, and
  responses carry `X-Robots-Tag: noindex`;
- a scraper has to pull clips one at a time through the API at a rate a child playing never
  reaches, which is visible and throttled;
- once accounts exist (Phase 3), the gate becomes "signed-in profile", which is the real one.

That is the proportionate goal: not trivially worse than a podcast appearance.

---

## 2. Design in one paragraph

Clips are uploaded to a **private Blob container** (`audio`, folders `sounds/`, `words/`,
`weetjes/`) with a `manifest.json` next to them. The **Functions API** exposes three routes:
`GET /api/audio/token` (an anonymous, HMAC-signed, 15-minute token; rate-limited per IP),
`GET /api/audio/manifest` (which ids exist per kind), and
`GET /api/audio/{kind}/{id}` (streams the blob, Range-capable, `Cache-Control: private`,
`X-Robots-Tag: noindex`, requires a valid token, rate-limited). The **app** fetches the
manifest once at start (replacing the build-time `__RECORDED_WORDS__` / `__RECORDED_WEETJES__`
lists), fetches a token once per session and refreshes it before expiry, and **prefetches a
round's clips as blobs when the round starts** so the Functions cold start is paid once,
before the first card, never between cards. TTS fallback is unchanged and covers: no
manifest, no token, a missing clip, a fork with no recordings at all. **Locally**, a Vite
dev middleware serves the same three routes from a gitignored `recordings/clips/` folder, so
development and the recording studio need no Azure. The splitter writes there instead of
`app/public/audio/`; a new `tools/upload-audio.mjs` pushes clips and manifest to the
container.

---

## 3. Azure (Arjan does this by hand, once)

1. **Storage account** in the same resource group, West Europe, Standard LRS, hot tier
   (a few MB; cost is cents). Disable *Allow Blob anonymous access* at account level.
   Enable blob soft delete (7 days) so an upload mistake is reversible.
2. **Container `audio`**, access level *Private*.
3. **App settings on the Static Web App** (Configuration → Application settings; these reach
   the managed Functions API):
   - `AUDIO_STORAGE_CONNECTION` — the storage account connection string (key 1).
   - `AUDIO_TOKEN_SECRET` — 32+ random bytes, base64. Separate from `JWT_SECRET` on purpose:
     rotating one must not log anyone out or break the other.
   - `AUDIO_RATE_LIMIT_PER_MIN` — optional, default `60`.
4. Locally: the same two in `api/local.settings.json` (gitignored via `*.local`) for anyone
   who wants to run the real API against the real container; not needed for normal dev.

The health canary (`api/src/functions/health.ts`) gains `env_AUDIO_STORAGE_CONNECTION`,
`env_AUDIO_TOKEN_SECRET`, and a `container_audio: ok` check — booleans only, as it does today.

---

## 4. The API (`api/src/functions/audio.ts` + `api/src/lib/`)

Dependencies: `@azure/storage-blob`. `authLevel: 'anonymous'` on all three (the token is
the auth).

### 4.1 `GET /api/audio/token`

- Rate limit first (§4.4). Then respond `{ token, expiresAt }`.
- Token = `base64url(payload).base64url(hmacSha256(secret, payload))`, payload
  `{ exp: <unix seconds, now + 900>, n: <random 8 bytes> }`. No user identity yet; the
  payload gets a `sub` when Phase 3 lands and the route then requires the session cookie.
- `Cache-Control: no-store`.

### 4.2 `GET /api/audio/manifest`

- Requires a valid token (`Authorization: Bearer …` or `?t=`; header preferred).
- Returns the container's `manifest.json` as written by the upload tool:
  `{ version: 1, generatedAt, sounds: string[], words: string[], weetjes: string[] }`.
  Served with `Cache-Control: private, max-age=300` and an `ETag` from the blob's ETag; the
  API does **not** list blobs per request (slow, and a listing endpoint is the thing we do
  not want to exist for ids that are not in the manifest).
- Missing manifest → `{ version: 1, sounds: [], words: [], weetjes: [] }` with status 200,
  so a fresh deployment without recordings behaves like a fork: TTS everywhere.

### 4.3 `GET /api/audio/{kind}/{id}`

- `kind ∈ {sounds, words, weetjes}`; `id` must match `^[a-z0-9-]{1,64}$` (ids are lowercase
  word/klank/cue ids; `slim-doe` is the longest shape). Anything else → 404 before touching
  storage. No `..`, no slashes, no extension in the URL: the blob is `${kind}/${id}.mp3`.
- Requires a valid token; rate-limited.
- Streams the blob with **Range support** (Safari sends `Range: bytes=0-1` first and refuses
  to play without a 206), `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`, `ETag` and
  `Last-Modified` from the blob, `Cache-Control: private, max-age=86400`,
  `X-Robots-Tag: noindex, nofollow`, `Content-Disposition: inline`. 404 for a missing blob.
- **`staticwebapp.config.json`**: the existing `/api/*` rule sets `Cache-Control: no-store`;
  add a **more specific rule for `/api/audio/*` placed before it** so the private caching
  headers from the function survive (verify in the deployed response — SWA route order and
  precedence are the thing to test, not assume). Remove `/audio/*` from
  `navigationFallback.exclude`; there is no `/audio/` on the site any more.

### 4.4 Rate limit

Per client IP (`x-forwarded-for` first hop; SWA sets it), sliding window of 60 s,
`AUDIO_RATE_LIMIT_PER_MIN` requests across token + manifest + clip routes combined. A child
playing needs ~10 clips a minute; a scraper needs hundreds. Over the limit → `429` with
`Retry-After`. **In-memory per Functions instance**, documented as an approximation: on the
consumption plan several instances may run, so the effective limit is `N × 60`. That is
acceptable for what it defends against; a Cosmos-backed counter is the upgrade path and is
out of scope here.

### 4.5 Never

No listing route. No route that accepts a path. No wildcard CORS (same origin; none needed).
No secret in any response, including error messages.

---

## 5. The app (`app/src/audio/`)

### 5.1 `audio/clips.ts` — new

```ts
export type ClipKind = 'sounds' | 'words' | 'weetjes'
export function loadManifest(): Promise<Manifest>       // once; cached in memory + IDB
export function hasClip(kind: ClipKind, id: string): boolean  // sync, from the manifest
export function prefetchClips(kind: ClipKind, ids: string[]): Promise<void>
export function clipUrl(kind: ClipKind, id: string): string | null  // object URL or null
```

- **Manifest**: fetched at app start (after the token), stored in memory and in the existing
  IDB `kv` store under `duolexie-audio-manifest` so a launch without network still knows what
  it had. Failure → empty manifest → TTS. `hasWordRecording` in `words.ts` and the weetjes
  probe in `weetjes.ts` read `hasClip` instead of `__RECORDED_*__`; the two `define`s and
  `mp3Ids()` in `vite.config.ts` are deleted, and so is `__AUDIO_VERSION__` (ETags replace
  the deploy-time cache-bust).
- **Token**: `audio/token.ts` fetches `/api/audio/token` lazily on first need, stores
  `{ token, expiresAt }` in memory, refreshes when < 2 min remain, retries once on 401.
  Never persisted.
- **Prefetch**: `prefetchClips` fetches each clip with the token, `URL.createObjectURL`s the
  blob, and caches it in a `Map` bounded to ~60 entries (LRU; revoke on eviction). A miss or
  a network error resolves (never rejects) and leaves `clipUrl` null → the existing
  `playWithFallback` path speaks the word instead.
- **Where prefetch is called**: `HardopLezen` after `buildWordExercises` (the ten words of
  the round — this is the call that absorbs the cold start, and it fires before the first
  card deals); `Flitsen`/`Tijdrit` with the lesson's `soundPool`; `Weetjes` with the three
  cues of each dealt card; the Weetjesboek when a card opens. The game **does not wait** for
  prefetch to finish — the first card can start while the rest stream in; only that card's
  own clip is awaited, with the 6 s `SPEECH_TIMEOUT_MS`/`CLIP_TIMEOUT_MS` backstops unchanged.
- `loadClip` / `loadWordClip` in `audio.ts` become thin: `clipUrl()` → `new Audio(url)`, or
  null → speak. The `?v=` query goes.
- **Dev/e2e switch**: `import.meta.env.VITE_AUDIO_BASE` (default `/api/audio`) is the only
  knob; tests and the dev middleware both sit behind the same path, so no test-only branch in
  production code.

### 5.2 Service worker / offline

`vite-plugin-pwa` precache must **not** include `/api/audio/**` (it cannot — the routes need
a token — but assert it in the config's `navigateFallbackDenylist`/`runtimeCaching` so a
future change cannot add it). Runtime caching of clips is the object-URL cache above; the
offline precache item on `todo.md` stays open and must respect this spec when it is done.

---

## 6. Local development and the studio

### 6.1 Dev middleware

Extend the Vite dev plugin from `docs/recording-studio-v3.md` §3 (or create
`app/vite-plugins/audio-dev.ts` if that has not shipped yet — the two plugins share nothing
but a file) to serve, **in dev only**:

- `GET /api/audio/token` → a fixed dev token; `GET /api/audio/manifest` → built by listing
  `recordings/clips/{sounds,words,weetjes}/*.mp3`; `GET /api/audio/{kind}/{id}` → the file,
  with Range support (Safari) and the same headers as production.
- Same id validation as §4.3, so a dev-only path traversal is impossible too.
- When `VITE_AUDIO_BASE` points at a real deployment, the middleware steps aside.

### 6.2 Where clips live locally

`recordings/clips/<kind>/<id>.mp3`, gitignored (`recordings/*` already is). The splitter's
`PROFILES[*].outDir` change to it; `app/public/audio/` is **deleted** and must never come
back (§9's guard fails CI if it does). The studio's "already recorded" probe and the v3
verdict grid read the dev manifest route instead of `HEAD /audio/...`.

### 6.3 `tools/upload-audio.mjs`

```
node tools/upload-audio.mjs [--kind words] [--ids kat,tas] [--dry-run] [--prune]
```

- Reads `AUDIO_STORAGE_CONNECTION` from `.env` at the repo root (gitignored) or the
  environment; refuses to run without it, with a message that says where to put it.
- Uploads `recordings/clips/**/*.mp3` that differ from the blob (compare MD5 from blob
  properties), `Content-Type: audio/mpeg`, `Cache-Control: private, max-age=86400`.
- `--prune` deletes blobs that have no local file (asks for confirmation unless `--yes`);
  default is add/replace only.
- Regenerates and uploads `manifest.json` last, atomically (upload to `manifest.json.tmp`,
  then copy over — a client that fetches during the upload never sees a half-list).
- Prints what changed; exit 0 only if manifest and every clip are in place.
- The studio's post-split screen (v3 §3.3) gets an **"Upload naar Azure"** button that runs
  it through the dev middleware, when the connection string is configured; otherwise it shows
  the command.

---

## 7. Repository hygiene (must)

- `.gitignore`: `app/public/audio/` (whole folder) and, belt and braces,
  `*.mp3`, `*.wav`, `*.webm`, `*.m4a`, `*.ogg` **except** `!app/tests/e2e/fixtures/silent.mp3`
  and `!docs/media/**` (screen recordings of the UI, no voice).
- **CI guard** in `.github/workflows/…yml`, a step before the tests: fail if the tree
  contains any audio file outside the two allow-listed locations, and fail if
  `git log origin/main..HEAD --name-only -- 'app/public/audio/**' '**/*.mp3' '**/*.wav'`
  (minus the allow-list) is non-empty — that second check is what catches a branch cut
  before the purge reintroducing the old blobs through a merge.
- `AGENTS.md` / `CLAUDE.md` already carry the rule (added with the purge): no audio in the
  repo, ever; clips go to `recordings/clips/` and to the private container.

---

## 8. README and license (Dutch copy, verbatim)

Replace the current *Audio opnemen* section's framing with this block at its top (the
recording steps below it stay, updated for `recordings/clips/` and the upload step):

> ### De stemopnames zitten niet in deze repo
>
> De klanken, woorden en weetjes die de app voorleest zijn ingesproken door één persoon.
> Een openbare map met netjes gelabelde `kat.mp3`, `bos.mp3`, … is precies de dataset waarmee
> je een stem kloont, en alles wat ooit in git heeft gestaan blijft daar. Daarom staan de
> opnames **niet** in deze repository en niet op de openbare site, maar in een privé
> opslagbak, en levert de app ze alleen uit via de API met een kortlopend token en een
> snelheidslimiet. Zie [docs/private-audio.md](docs/private-audio.md) — ook voor wat dit
> *niet* beschermt.
>
> **Zonder opnames werkt de app volledig**: elke klank en elk woord valt terug op de
> voorleesstem van de browser. Wil je je eigen stem gebruiken, dan neem je die op met de
> studio hieronder en zet je hem in je eigen opslag (`AUDIO_STORAGE_CONNECTION`), of — als
> je het kloonrisico voor jezelf accepteert — in een **privé** fork. Zet ze nooit in een
> openbare repo; de CI van deze repo weigert dat ook.
>
> **Licentie:** de code is MIT (zie [LICENSE](LICENSE)). De stemopnames vallen daar niet
> onder: alle rechten voorbehouden, ze mogen niet worden gekopieerd, gepubliceerd of gebruikt
> om een stem te trainen of te synthetiseren.

The *Deploy* section gains step 3 of this spec's §3 (storage account, container, the two app
settings).

---

## 9. The history purge (done 2026-09-16; recorded here so nobody has to wonder)

What was in history: 45 klank clips under `app/public/audio/sounds/` (recorded with the old
click-per-clip studio) and a committed `app/dist/` build that contained the same 45. Both
paths were removed from **every commit on every branch** with `git filter-repo
--invert-paths --path app/public/audio/sounds --path app/dist`, and all branches were
force-pushed. Kept: `app/tests/e2e/fixtures/silent.mp3` (a generated silent file) and
`docs/media/**` (screen recordings of the UI).

Consequences, for anyone with a clone from before that date:

- **Re-clone** (or `git fetch && git reset --hard origin/<branch>` in every worktree). Your
  old commits have new SHAs; the content is identical.
- **Never merge a branch cut before the purge into the new `main`** — that would bring the
  old commits, and the blobs, straight back. Cherry-pick its commits onto the new base
  instead. The CI guard in §7 is there to catch exactly this.
- GitHub keeps unreachable objects and PR refs (`refs/pull/*/head`) for a while; a support
  request to purge cached views of the old commits was filed by Arjan at
  https://support.github.com/request (category *Remove cached views / sensitive data*), with
  the old `main` SHA `a1046afc7fcd6e49fe14e4305d75afa3ea6ce49b` as reference. Anything
  cloned before the purge is, of course, out there regardless.

---

## 10. Tests

Unit (`api/` gets vitest, `api/src/lib/*.test.ts`):

1. Token: sign → verify ok; tampered payload → invalid; expired → invalid; wrong secret →
   invalid.
2. Rate limiter: 60 in a window pass, the 61st is 429; window slides; IPs independent.
3. Id validation: `kat`, `slim-doe`, `ij` pass; `../x`, `kat.mp3`, `Kat`, 65 chars,
   empty, `%2e%2e` fail; unknown kind fails.
4. Range parsing: `bytes=0-1`, `bytes=100-`, `bytes=-100`, unsatisfiable → 416.
5. `upload-audio.mjs`: dry-run lists changes without touching storage (mock the SDK);
   manifest written last; `--prune` refuses without `--yes`.

App unit (`tests/unit/clips.test.ts`): manifest failure → `hasClip` false everywhere;
prefetch never rejects; LRU eviction revokes object URLs.

E2E (adapt `tests/e2e/fixtures/narration.ts` — it currently routes `/audio/words/*.mp3`;
it now routes `/api/audio/token`, `/api/audio/manifest` and `/api/audio/*/*`, serving the
same silent mp3 and recording which ids were fetched):

6. A Hardop lezen round **prefetches all ten** clips before the first card is graded
   (assert on the fixture's fetch log), and narration plays from the prefetched URLs.
7. Manifest route failing (500) → the round runs entirely on TTS (spy) and never calls the
   clip route.
8. Token route returning 401 once → one refresh, then clips load.
9. Rate limit: clip route returning 429 for one id → that word falls back to TTS, the other
   nine play; no console errors.
10. Weetjes and Flitsen prefetch their cues / sound pool (fetch log).
11. `existing suites` stay green with the fixture change; `quit-mid-animation.spec.ts` in
    particular (prefetch must be cancellable/ignorable on quit — pending fetches must not
    play anything after unmount).

API integration (local, `func start` with the Azurite emulator or a mocked
`@azure/storage-blob`): the three routes end-to-end including a 206 for `Range: bytes=0-1`
and the exact header set of §4.3.

---

## 11. Verification before a PR

- `npm run lint`, typecheck, unit tests, full Playwright suite in `app/`; `api` build and
  its tests.
- Build `app/` and **grep `dist/` for `__RECORDED_`, `/audio/sounds`, `/audio/words`** —
  none may remain.
- CI guard: prove it fires — a scratch commit adding `app/public/audio/x.mp3` must fail the
  step; revert it.
- Deployed: `curl -I https://<site>/api/audio/manifest` without a token → 401;
  with a token → 200 and the §4.2 headers; `curl -I …/api/audio/words/kat` with a token and
  `Range: bytes=0-1` → 206 with `Accept-Ranges`, `X-Robots-Tag`, `Cache-Control: private`
  (this is the SWA-route-precedence check from §4.3 — it can only be verified on the
  deployed site, so it is Arjan's step, listed in the PR as such).
- On her iPad: one Hardop lezen round with real clips — the first card must not wait
  perceptibly longer than today.

---

## 12. Docs to update in the same change

- `README.md` (§8), `recordings/README.md` (clips folder, upload tool), `todo.md`
  (tick the line, as-built notes), `docs/recording-pipeline-v2.md` and
  `docs/recording-studio-v3.md` (out dir is now `recordings/clips/`), this file (Status →
  built; deviations *(as built)*).

---

## 13. Out of scope

- DRM, audio watermarking (AudioSeal or similar could be added at upload time later if
  provenance ever needs proving), deliberately degrading clip quality.
- Cosmos-backed rate limiting; per-user quotas — arrive with Phase 3 accounts.
- Any change to how words are chosen or graded.
