# Accounts plan — magic-link sign-up, family profiles, sign-up notifications

Goal: a parent types an email address, gets a mail, and is logged in. One email = one
**family**; a family has several kid **profiles** behind a Netflix-style picker. Arjan gets a
mail whenever a new family signs up.

This supersedes the email+password design in [plan.md §7](../plan.md) (bcryptjs, register and
login forms). Passwordless has nothing to leak and no password for a parent to forget on a
tablet.

**Status:** planned, nothing built. Every box below is `[ ]`. Written 2026-09-18 against
`17ba59b`. Planned by Claude Fable 5.1, revised against the current tree by Claude Opus 5
after the first draft turned out to have been written against a 129-commit-stale checkout
(see "What the first draft got wrong").

## 0. Where this sits in the queue

Three things are already queued ahead of this, and the ordering is not free:

1. **The history purge** — [private-audio.md §9](private-audio.md). Its preconditions are
   *no open PRs, no agent mid-branch, no extra worktrees*, and studio v3 (PR #15) has merged,
   so it is due **now**. Nothing here may cut a branch until it has run: a branch cut before
   the rewrite and merged after it puts the voice clips back into history.
2. **[private-audio.md](private-audio.md) §3–§4** — the storage account and
   `api/src/functions/audio.ts` + **`api/src/lib/`**. That spec creates `api/src/lib/` first.
   This plan adds to that directory rather than inventing a parallel one.
3. **This plan**, on a branch cut from post-purge `main`.

If the order slips and accounts are built first, create `api/src/lib/` here with the same
shape private-audio.md §4 assumes (`cosmos.ts`, `http.ts`, a per-purpose secret helper) so
the audio work is a addition and not a merge conflict.

## 1. What already exists (verified 2026-09-18)

`GET https://duolexie.assink.io/api/health` returns:

```json
{"env_COSMOS_ENDPOINT":true,"env_COSMOS_KEY":true,"env_JWT_SECRET":true,
 "cosmosConnection":"ok","database_duolexie":"ok","container_auth":"ok","container_data":"ok"}
```

So the backend groundwork is further along than a reader of [azure-setup.md](azure-setup.md)
would think:

- The SWA deploys `api/` as managed Functions, and the custom domain **duolexie.assink.io**
  is live with SSL. `APP_BASE_URL` is therefore already known, and the mail sender should be
  a subdomain of the same domain.
- Cosmos free tier exists, database `duolexie`, containers `auth` (pk `/email`) and `data`
  (pk `/familyId`), all reachable. `JWT_SECRET` is set.
- **All of [backend-readiness.md](backend-readiness.md) A1–A6 has shipped.** `strict` is on;
  `completeLesson` emits a `SessionResult` into an append-only `sessions[]`; `engine/
  recompute.ts` replays the log; `engine/reward.ts` is the single reward rule; `api/`
  reaches `shared/` through project references; game dispatch fails closed. The first draft
  of this plan listed A1 and A5 as prerequisites to do first. They are done.
- `state/progress.ts` persists at **version 4** with a cascading `migrate`. Any change here
  is version 5, appended to that chain.
- The welkom-flow (`screens/OnboardingScreen.tsx`, [onboarding-welkom.md](onboarding-welkom.md))
  already asks her name and builds her avatar on first visit, writing `settings.playerName`
  into the progress store and the config into the avatar store. **That is a profile in all
  but name** — the sign-up flow should adopt it, not ask again.
- `api/src/` still contains only `health.ts`. There is no `lib/` yet.
- `shared/src/types.ts` has no account or profile DTOs yet.

The only Azure thing genuinely missing for accounts is **a way to send email**.

## 2. Azure resources to create

Click paths are in [azure-setup.md §4–§6](azure-setup.md). What and why:

| # | Resource | Why | Cost |
|---|---|---|---|
| 1 | **Email Communication Services** `ecs-duolexie`, data location Europe | Holds the sending domain. Start with the Azure managed domain, which works in a minute and sends from `DoNotReply@<guid>.azurecomm.net`. Move to `duolexie.assink.io` later for deliverability, via one TXT, one SPF TXT and two DKIM CNAMEs. | €0 |
| 2 | **Communication Services** `acs-duolexie`, data location Europe | The resource holding the connection string the API uses. Link the domain from #1 under *Email → Domains*. Note these are two separate resource types with near-identical names. | ~€0.00025 per mail, so cents per month |
| 3 | **Four SWA environment variables** | `ACS_CONNECTION_STRING`, `MAIL_FROM`, `NOTIFY_EMAIL`, `APP_BASE_URL`. | €0 |
| 4 | **TTL on the `auth` container** | Expired login tokens delete themselves. Managed Functions on SWA are HTTP-only, so there is no timer trigger to sweep them. | €0 |
| 5 | **Application Insights** `appi-duolexie`, recommended | Managed Functions have no other log viewer, and "I never got the mail" is miserable to debug blind. Free to 5 GB/month. | €0 |

Already done, so not on the list: the custom domain, Cosmos, `JWT_SECRET`. Coming from
private-audio.md §3 rather than from here: the storage account, `AUDIO_STORAGE_CONNECTION`,
`AUDIO_TOKEN_SECRET`.

Considered and rejected:

- **Key Vault** — SWA Free cannot do Key Vault references, that is a Standard feature. Env
  vars are the supported place for secrets on this tier.
- **Managed identity** for Cosmos or ACS — not available for *managed* Functions on SWA, only
  for bring-your-own-Functions. Connection strings it is.
- **Entra External ID, SWA built-in auth** — built-in auth is GitHub/Entra-only on Free, and
  External ID takes over the whole sign-in experience without doing plain magic links.
- **SendGrid, Resend, Postmark** — all fine, and Resend's free tier is the least work of any
  of them. ACS wins only because it keeps one resource group and one bill. Swapping is a
  one-file change in `api/src/lib/mail.ts`.

### Environment variables (SWA → Environment variables → Production)

| Name | Value | Notes |
|---|---|---|
| `COSMOS_ENDPOINT`, `COSMOS_KEY`, `JWT_SECRET` | *(already set)* | unchanged |
| `ACS_CONNECTION_STRING` | `acs-duolexie` → *Keys* → Connection string | secret |
| `MAIL_FROM` | `DoNotReply@<guid>.azurecomm.net`, later `noreply@duolexie.assink.io` | must be a sender on the linked domain |
| `NOTIFY_EMAIL` | Arjan's own address | receives the sign-up notifications |
| `APP_BASE_URL` | `https://duolexie.assink.io`, no trailing slash | builds the login link; never derive this from request headers |
| `MAIL_MODE` | unset in production | `console` locally, `test` in e2e |

Follow private-audio.md's precedent of **one secret per purpose**: `JWT_SECRET` signs
sessions and nothing else, so rotating it logs everyone out without touching audio tokens.

## 3. Design decisions

1. **Sign-up and login are one screen.** Enter email, get a mail. The first successful
   verification creates the family; later ones log in. No register form, and no way to
   discover whether an address is already known.

2. **The mail carries a link *and* a 6-digit code.** This is the non-obvious requirement.
   She plays in an installed home-screen web app, and on iOS that has its own cookie jar,
   separate from Safari. A link tapped in Mail opens Safari and authenticates *there*, while
   the installed app stays logged out. The fix every app converges on is a short code typed
   into the device that asked for it. So the mail says "klik hier **of** voer code `482 913`
   in", the waiting screen has a code field, and whichever arrives first consumes the token.

3. **Cookie session.** JWT `{familyId, email}` in an `httpOnly; Secure; SameSite=Lax;
   Path=/api` cookie, 30-day sliding expiry, re-issued when older than a day. Same-origin
   `/api`, so no CORS. `Lax` rather than `Strict` so a top-level navigation from a mail still
   carries it; `Strict` would render a logged-in parent logged out on first paint.

4. **The account is optional and the app keeps working without one.** Today's local play
   becomes the `local` profile. Nothing about the daily habit may require wifi or an account.

5. **Profiles are the unit of progress, the family is the unit of login.** Each zustand
   persist key becomes profile-scoped. No PIN in this phase — it is an anti-sibling lock, and
   there is no sibling yet. The schema carries the field.

6. **The first profile is the welkom-flow's player, not a new question.** She has already
   given a name and built an avatar. On first sign-up, seed the profile from
   `settings.playerName` and the avatar store and confirm it, rather than asking again.

7. **Notify on verified sign-up, not on link request.** Anyone can type any address into the
   request form. Firing on request would let a bored script flood the inbox. It fires once,
   when a family document is created.

8. **Sync is still out of scope here.** The session log now exists, so sync is unblocked, but
   accounts and profiles do not need it and it doubles the surface. Accounts first, then
   `POST /api/sessions` and the outbox.

## 4. Auth flow

```
[Inloggen]   POST /api/auth/request {email}
               ├─ normalise: trim, lowercase
               ├─ throttle: <=3 per email per 15 min, <=20 per IP per hour, still answer 200
               ├─ token = 32 random bytes base64url; code = 6 digits
               ├─ store {type:'login', id: sha256(token), email, codeHash, attempts:0, ttl:900}
               ├─ mail: APP_BASE_URL/#/inloggen?token=<token>  +  the code
               └─ 200 {ok:true} always; the body never differs by address

[Link]       GET /#/inloggen?token=... → SPA posts it to /api/auth/verify
[Code]       POST /api/auth/verify {email, code}
               ├─ look up by sha256(token), or by email then compare codeHash, max 5 tries
               ├─ reject expired or already used; delete the doc on success
               ├─ family exists? load it : create it and mail NOTIFY_EMAIL
               ├─ Set-Cookie: session=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/api
               └─ 200 {email, familyId, isNew, profiles:[...]}

[Start]      GET  /api/auth/me     → 200 {email, familyId, profiles} | 401
[Uitloggen]  POST /api/auth/logout → clears the cookie
```

Tokens are stored hashed, so a Cosmos read never yields a usable link. Fifteen-minute TTL,
single use, five attempts on the code.

## 5. Data model

`auth` container, partition key `/email`, TTL enabled:

```ts
{ type: 'family', id: email, email, familyId, createdAt, lastLoginAt }
{ type: 'login',  id: sha256(token), email, codeHash, attempts, expiresAt, ttl: 900 }
```

`data` container, partition key `/familyId`:

```ts
{ type: 'profile', id: profileId, familyId, name, avatar: AvatarConfig,
  ownedItems: string[], pinHash?, createdAt, lastActiveAt }
// sync phase, later: { type: 'session', id, familyId, profileId, ...SessionResult }
```

Everything is a point read on `(id, partitionKey)` at roughly 1 RU, except listing a family's
profiles, which is one partition query. Nothing approaches the free 1000 RU/s.

`FamilyInfo` and `Profile` DTOs go in `shared/src/types.ts`, which `api/` already reaches
through project references.

## 6. API surface

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/request` | – | send link and code |
| `POST /api/auth/verify` | – | exchange token or code for a session; creates the family on first use |
| `GET  /api/auth/me` | cookie | who am I, plus profiles |
| `POST /api/auth/logout` | cookie | clear the cookie |
| `GET  /api/profiles` | cookie | list the family's profiles |
| `POST /api/profiles` | cookie | create, max 6 per family |
| `PATCH /api/profiles/{id}` | cookie | rename, avatar, owned items |
| `DELETE /api/profiles/{id}` | cookie | remove, refuse the last one |
| `GET  /api/health` | – | gains `env_ACS_CONNECTION_STRING` and a `mail` check, booleans only |

In `api/src/lib/`, shared with private-audio.md §4: `cosmos.ts`, `http.ts`, plus this plan's
`session.ts` (JWT and cookie), `mail.ts` (ACS behind `sendMail({to, subject, text, html})`,
with `console` and `test` modes) and `throttle.ts`. Dependencies: `jose` and
`@azure/communication-email`, both pure JS. No native modules, they break Oryx builds.

Every profile route loads by `(id, familyId-from-JWT)`. A profile id from another family is
simply not found. That single rule is the whole authorisation model.

## 7. App changes

- **`state/account.ts`**, new, not persisted: `{status: 'loading'|'anon'|'signedIn', email,
  familyId, profiles}`. `activeProfileId` *is* persisted, in `localStorage`, defaulting to
  `'local'`. Actions: `refresh`, `requestLink`, `verify`, `logout`, `createProfile`,
  `selectProfile`.
- **Profile-scoped persistence.** `state/idbStorage.ts` gains a key prefix, so
  `duolexie-progress` becomes `duolexie-progress:<profileId>`. `selectProfile` sets the id
  and calls `persist.rehydrate()` on both stores. Two consequences to handle rather than
  discover:
  - `state/hydration.ts` gates every route on both stores having hydrated. A profile switch
    makes them un-hydrated again, so the gate has to reopen rather than latch. It currently
    latches on a `useState` that only ever goes true.
  - `app/tests/e2e/fixtures/profile.ts` and `fixtures/onboarded.ts` write straight into
    IndexedDB at the literal key `duolexie-progress`, version 4. Both need the prefix and the
    new version, or every round test starts on an empty profile.
- **Persist version 5** on `state/progress.ts`, appended to the existing cascade, and the
  first version on the avatar store. The migration itself is a rename of the storage key, so
  it runs in `idbStorage`, not in `migrate`: on first start, if `duolexie-progress` exists and
  `duolexie-progress:local` does not, copy it across. Her iPad keeps everything.
- **Adopt on sign-up.** `verify` returns `isNew: true` with no profiles, so the app offers
  "Is dit jouw profiel?" pre-filled from `settings.playerName` and the current avatar, posts
  it, copies `…:local` to `…:<newProfileId>`, and selects it.
- **Screens**, Dutch, same visual language as the rest:
  - `InloggenScreen` at `/inloggen` — email field, then the sent state with the code field.
    Reads `?token=` out of the hash route and verifies automatically.
  - `ProfielKiezerScreen` at `/profielen` — the Netflix grid, avatar and name per profile,
    a "nieuw profiel" tile, a quiet "uitloggen".
  - `NieuwProfielScreen` — name plus the avatar pickers that already exist in
    `components/AvatarPickers.tsx`.
  - `PathScreen` header shows the active profile's avatar, tapping opens the picker. An
    anonymous player sees a quiet "inloggen" link. No nag, no wall.
- Every new screen gets a `/proberen` entry, per the standing convention in plan.md §11.
- **Vite dev proxy** `/api` to `http://localhost:7071`, so cookies are same-origin in dev the
  way SWA makes them in production.

## 8. The notification mail

Sent from `verify` when a family document is created:

```
Onderwerp: DuoLexie — nieuwe aanmelding: ouder@voorbeeld.nl
Familie:   3f9c...  (aangemaakt 2026-09-18 19:42 CEST)
Totaal:    12 families
```

Awaited but wrapped in try/catch: failing to notify Arjan must never fail a parent's login.
Not doing a daily digest, because this tier has no timer triggers, and not notifying per new
profile, because a family with three kids would make that noise.

## 9. Security

- Token: 32 random bytes, stored as SHA-256, 15-minute TTL, single use, deleted on use.
- Code: 6 digits, hashed, 5 attempts per token.
- Throttle per email and per IP, taking the first hop of `x-forwarded-for`. Always 200.
- Cookie `HttpOnly; Secure; SameSite=Lax; Path=/api`, cleared on logout, JWT `exp` 30 days.
- `/api/*` is already `Cache-Control: no-store` in `staticwebapp.config.json`.
- Never echo submitted input into the mail's HTML; the link carries only the token.
- Profiles: max 6, names at most 24 characters, validated server-side.
- `api/local.settings.json` is now gitignored explicitly. It was not before:
  private-audio.md §3.4 claims `*.local` covers it, and that pattern does not match a file
  named `local.settings.json`. Fixed in the same commit as this plan.

## 10. Local development and tests

- `npm i -g azure-functions-core-tools@4`, then `func start` in `api/` and `npm run dev` in
  `app/`, joined by the Vite proxy. `api/local.settings.json` holds the env vars with
  `MAIL_MODE=console`, so the link and code print in the Functions terminal.
- `lib/store.ts` falls back to an in-memory implementation when `COSMOS_ENDPOINT` is unset,
  which is what makes the API runnable in CI without Cosmos and unit tests trivial.
- Unit tests with the existing Vitest setup: token hash round-trip, code attempt ceiling,
  throttle window, JWT sign/verify/expiry, and a profile from another family returning 404.
- Playwright: `MAIL_MODE=test` returns the code in the response body, guarded so it refuses
  to start when `NODE_ENV=production` or `ACS_CONNECTION_STRING` is set. Spec: request, read
  code, verify, pick profile, create profile, play a lesson, reload, same profile. All three
  projects.
- On her iPad: sign up from the installed app using the code path, confirm the gems survived,
  switch profile, kill wifi, play a lesson.

## 11. Work order

Nothing here starts until the history purge has run. A1–A6 are done, so there are no
code prerequisites left.

- [ ] **S0 — Azure (Arjan).** ECS, ACS, the four env vars, TTL on `auth`, Application
  Insights. Done when the extended `/api/health` reports `mail: ok`. See
  [azure-setup.md §4–§6](azure-setup.md).
- [ ] **S1 — `api/src/lib/`.** `cosmos.ts`, `session.ts`, `mail.ts`, `throttle.ts`, the
  in-memory store, unit tests. Coordinate with private-audio.md §4 if that lands first.
- [ ] **S2 — Auth endpoints.** `request`, `verify`, `me`, `logout`, plus the notification.
  Verified with curl against the deployed API and a real inbox.
- [ ] **S3 — Profile endpoints.** CRUD, family-scoped, max 6, refuse deleting the last.
- [ ] **S4 — Profile-scoped local state.** Key prefixing, the `local` migration, the
  hydration gate, the two e2e fixtures. **Ship this alone and watch her iPad for a day** —
  it is the only step that touches existing progress.
- [ ] **S5 — Inloggen screen**, link and code paths, `/proberen` entry, Playwright spec.
- [ ] **S6 — Profielkiezer, nieuw profiel, adopt-on-sign-up**, header avatar, specs.
- [ ] **S7 — Deliverability.** `duolexie.assink.io` as sending domain, DNS records,
  `MAIL_FROM` switched, tested against Gmail, Outlook and iCloud including spam folders.
- [ ] **S8 — Docs.** README, the azure-setup checklist, todo.md, and this file's boxes.

Then, separately: `POST /api/sessions` and the outbox, hung off the profiles from S3.

## 12. Open questions

Defaults are chosen so work can start; say otherwise and they change.

1. **Sending domain** — `noreply@duolexie.assink.io` assumed, matching the live site.
2. **Who may sign up** — open to anyone, or an allow-list in an env var until you are ready
   for strangers? The allow-list is about five lines in `request`.
3. **`NOTIFY_EMAIL`** — which address, personal or work?
4. **Profiles per family** — 6 assumed.
5. **Session length** — 30 days sliding assumed; never-expire is a one-line change if you
   would rather no parent ever re-clicks a link on the tablet.

## What the first draft got wrong

The first draft of this file was written in a checkout that was 129 commits behind `origin/
main`, and was committed before the staleness surfaced on push. It is preserved on the local
branch `wip/accounts-plan-stale-base`. Corrected here:

- It listed backend-readiness A1 and A5 as prerequisites. A1–A6 have all shipped.
- It said the custom domain still had to be set up. `duolexie.assink.io` has been live since
  Phase 0, which also settles `APP_BASE_URL` and the sending domain.
- It proposed adding `version: 1` and a `migrate` to the progress store. That store is at
  version 4 with a cascading migrate.
- It did not know about the welkom-flow, so it asked for a profile name the app already has.
- It did not know about private-audio.md, so it missed the storage account, the shared
  `api/src/lib/`, the per-purpose secret convention, and the history purge that gates when
  any of this can be branched.

## Working conventions

Per [CLAUDE.md](../CLAUDE.md): work in a git worktree, not the shared checkout; merge rather
than rebase if `main` has moved; name the model in the commit trailer. Verify with
`npx tsc --noEmit -p app`, `npm run build`, `npx vitest run` and
`npx playwright test --project=desktop` from `app/`, plus `npm test` from `api/`. One commit
per step, ticking the box in this file in the same commit. Commits are authored as
`Arjan Assink <assink@gmail.com>`.
