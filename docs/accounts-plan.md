# Accounts plan — magic-link sign-up, family profiles, sign-up notifications

Goal: a parent enters an email address, clicks a link in their inbox and is logged in. One
email = one **family**; a family has several kid **profiles** with a Netflix-style picker.
Arjan gets an email for every new family that signs up.

This supersedes the email+password design in [plan.md §7](../plan.md) (bcryptjs, register/
login forms). Passwordless is simpler to build, has nothing to leak, and there is no password
for a parent to forget on a tablet.

**Status: nothing executed yet.** Written 2026-09-18 against commit `e5cc508`.

## What already exists (verified 2026-09-18)

`GET https://jolly-wave-019071410.7.azurestaticapps.net/api/health` returns:

```json
{"env_COSMOS_ENDPOINT":true,"env_COSMOS_KEY":true,"env_JWT_SECRET":true,
 "cosmosConnection":"ok","database_duolexie":"ok","container_auth":"ok","container_data":"ok"}
```

So: the SWA deploys `api/` as managed Functions, Cosmos free tier exists with the `auth` and
`data` containers, and the three secrets are set. **Azure is further along than the
checklist in [azure-setup.md](azure-setup.md) suggested** — that checklist is updated in the
same commit as this file.

What is missing on the Azure side is exactly one thing: **a way to send email.** Everything
else is code.

## Azure resources you need to create

Step-by-step click paths are in [azure-setup.md §4–§6](azure-setup.md). Summary and reasoning:

| # | Resource | Why | Cost |
|---|---|---|---|
| 1 | **Email Communication Services** `ecs-duolexie` (data location Europe) | Holds the sending domain(s). Start with the *Azure managed domain* (works in a minute, sends from `DoNotReply@<guid>.azurecomm.net`). Add your own domain later for deliverability — three DNS records (TXT verification, SPF, two DKIM CNAMEs). | €0 for the resource |
| 2 | **Communication Services** `acs-duolexie` (data location Europe) | The thing with the connection string the API uses. Link the domain from #1 under *Email → Domains*. | ~€0.00025 per mail. A few hundred mails/month ≈ cents. No free tier, but negligible. |
| 3 | **SWA environment variables** (existing `swa-duolexie`) | `ACS_CONNECTION_STRING`, `MAIL_FROM`, `NOTIFY_EMAIL`, `APP_BASE_URL`. See table below. | €0 |
| 4 | **Application Insights** `appi-duolexie` — *recommended, optional* | Managed Functions have no log viewer otherwise. Auth bugs ("I never got the mail") are miserable to debug blind. Enable from the SWA blade; free up to 5 GB/month. | €0 at our volume |
| 5 | **Custom domain on the SWA** — *already on the checklist, do it now* | The login link is baked into every email. Sending `From:` a domain that matches the link domain is what keeps you out of spam. Also nicer than `jolly-wave-…` in a parent's inbox. | €0 (managed SSL) |

Considered and rejected:

- **Key Vault** — SWA Free can't do Key Vault references (Standard only). Env vars are the
  supported place for secrets on this tier; they are encrypted at rest and never returned by
  the API.
- **Managed identity for Cosmos/ACS** — not available for *managed* Functions on SWA (only
  "bring your own Functions"). Connection strings/keys it is.
- **Entra External ID / B2C, SWA built-in auth** — SWA built-in auth is GitHub/Entra-only on
  Free; External ID takes over the whole UX and doesn't do plain magic links. Overkill for a
  family app.
- **SendGrid / Resend / Postmark** — all fine and Resend's free tier is the easiest API
  around, but you asked for Azure, and ACS keeps everything in one resource group and one bill.
  Swapping is a one-file change (`api/src/lib/mail.ts`) if ACS ever annoys you.
- **Timer-triggered cleanup** — managed Functions on SWA are HTTP-only. Expired login tokens
  are cleaned up with Cosmos **TTL** instead (set `defaultTtl: -1` on `auth`, per-doc `ttl`).

### Environment variables (SWA → Environment variables, Production)

| Name | Value | Notes |
|---|---|---|
| `COSMOS_ENDPOINT`, `COSMOS_KEY`, `JWT_SECRET` | *(exist)* | unchanged |
| `ACS_CONNECTION_STRING` | `acs-duolexie` → *Keys* → Connection string | secret |
| `MAIL_FROM` | `DoNotReply@<guid>.azurecomm.net`, later `noreply@lexie.<domein>.nl` | must be a sender on the linked domain |
| `NOTIFY_EMAIL` | your own address | receives the sign-up notifications |
| `APP_BASE_URL` | `https://lexie.<domein>.nl` (no trailing slash) | used to build the login link; never derive it from request headers |
| `MAIL_MODE` | *(unset in prod)* | `console` locally: logs the mail instead of sending |

## Design decisions (and why)

1. **Sign-up and login are the same screen.** Enter email → "we hebben je een mail gestuurd".
   First successful verification creates the family; later ones just log in. No separate
   register form, no enumeration ("this email already exists").

2. **Link *and* 6-digit code in the same email.** This is the one non-obvious requirement.
   She plays in an installed home-screen web app on iPad/iPhone. On iOS, a home-screen PWA has
   its **own cookie jar**, separate from Safari. A magic link tapped in Mail opens in Safari
   and sets the cookie *there* — the installed app stays logged out. The classic fix (Slack,
   Notion) is a short code you type into the device that asked for it. So: the email says
   "Klik hier **of** voer code `482 913` in", the requesting screen shows a code field, and
   whichever is used first consumes the token. The link is still the happy path on desktop.

3. **Cookie session, not bearer tokens.** JWT `{familyId, email}` in an
   `httpOnly; Secure; SameSite=Lax; Path=/api` cookie, 30-day sliding expiry (re-issued on
   any authenticated call older than 24 h). Same-origin `/api` so no CORS. `Lax`, not
   `Strict`, so the top-level navigation from the email still carries it once set (Strict
   would make "I'm logged in, tap the site link in a mail" look logged out on first paint).

4. **Account is optional; the app keeps working without one.** Today's local-only mode
   becomes a `local` profile. Nothing about the daily habit may depend on wifi or on having
   signed up. Signing up *adopts* the existing local progress into the first cloud profile,
   so her current gems/records on the iPad are never lost.

5. **Profiles are the unit of progress; the family is the unit of login.** Every zustand
   persist key becomes profile-scoped (`duolexie-progress:<profileId>`). Switching profile =
   switch key + rehydrate. No PIN in this phase (it's an anti-sibling lock; add when a second
   kid actually exists — the schema has the field).

6. **Notify on *verified* sign-up, not on link request.** Anyone can type any email into the
   request form. If the notification fired there, a bored bot could flood your inbox. It fires
   once, when a family document is first created.

7. **Sync stays out of this phase.** Accounts + profiles do not need the session log from
   [backend-readiness A2](backend-readiness.md). Cross-device sync does. Ship accounts first
   (this file), then A2, then sync (`/api/sessions`). Profiles created here are what sync will
   later hang progress on, so nothing is wasted.

## Auth flow

```
[Inloggen screen]  POST /api/auth/request  {email}
                     ├─ normalise (trim, lowercase)
                     ├─ throttle: ≤3 tokens per email / 15 min, ≤20 per IP / hour → 200 anyway
                     ├─ token = 32 random bytes (base64url); code = 6 digits
                     ├─ store  {type:'login', id: sha256(token), email, codeHash, expiresAt, ttl: 900}
                     ├─ send mail: APP_BASE_URL/#/inloggen?token=<token>   +   code
                     └─ 200 {ok:true}   (always; response body never differs by email)

[Email link]       GET  /#/inloggen?token=…  → SPA reads token → POST /api/auth/verify {token}
[Code entry]       POST /api/auth/verify {email, code}
                     ├─ lookup by sha256(token)  |  query email + compare codeHash, ≤5 tries
                     ├─ reject if expired / already used
                     ├─ mark used (delete doc)
                     ├─ upsert family:  new? → create {familyId, email, createdAt}
                     │                        → send NOTIFY_EMAIL "Nieuwe aanmelding"
                     ├─ Set-Cookie: session=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=30d
                     └─ 200 {email, familyId, isNew, profiles:[…]}

[Every app start]  GET  /api/auth/me → 200 {email, familyId, profiles} | 401
[Uitloggen]        POST /api/auth/logout → clears cookie
```

Tokens are stored **hashed**; a Cosmos read never yields a usable link. Token TTL 15 min,
single use. Codes get a per-token attempt counter (5) so 6 digits can't be brute-forced.

## Data model (Cosmos, existing containers)

`auth` container, partition key `/email` — enable TTL on the container (`-1` = per-document):

```ts
{ type: 'family', id: email, email, familyId: uuid, createdAt, lastLoginAt }
{ type: 'login',  id: sha256(token), email, codeHash, attempts: 0, expiresAt, ttl: 900 }
```

`data` container, partition key `/familyId`:

```ts
{ type: 'profile', id: profileId, familyId, name, avatar: AvatarConfig, ownedItems: string[],
  pinHash?: string, createdAt, lastActiveAt }
// later (sync phase): { type: 'session', id: sessionResultId, familyId, profileId, ...SessionResult }
```

Point reads by `(id, partitionKey)` everywhere: ~1 RU each. Listing a family's profiles is
one partition query. Nothing here gets near the free 1000 RU/s.

Add `FamilyInfo` and `Profile` DTOs to `shared/src/types.ts`; `api/` imports them via the
`@shared/*` path mapping ([backend-readiness A5](backend-readiness.md) — do A5 first).

## API surface (`api/src/functions/`)

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/request` | – | send link + code |
| `POST /api/auth/verify` | – | exchange token or code for session cookie; creates family on first use |
| `GET  /api/auth/me` | cookie | who am I + profiles |
| `POST /api/auth/logout` | cookie | clear cookie |
| `GET  /api/profiles` | cookie | list profiles of the family |
| `POST /api/profiles` | cookie | create `{name, avatar?}`; max 6 per family |
| `PATCH /api/profiles/{id}` | cookie | rename / avatar / ownedItems |
| `DELETE /api/profiles/{id}` | cookie | remove (refuse if it's the last one) |
| `GET  /api/health` | – | extend with `env_ACS_CONNECTION_STRING`, `mail: 'ok'` |

Shared `lib/`: `cosmos.ts` (client + typed container helpers), `session.ts` (JWT sign/verify,
cookie parse/serialize), `mail.ts` (ACS client behind a `sendMail({to, subject, text, html})`
interface + `console` mode), `throttle.ts`, `http.ts` (json/401 helpers). Deps: `jose` (JWT,
pure JS), `@azure/communication-email`. No native modules — Oryx builds break on them.

Every profile route loads the profile by `(id, familyId-from-JWT)`. A profile id from another
family is simply "not found". That one rule is the whole authorisation model.

## App changes (`app/src/`)

- **`state/account.ts`** — new zustand store, *not* persisted: `{status: 'loading'|'anon'|
  'signedIn', email, familyId, profiles}`, `activeProfileId` (this one *is* persisted, in
  `localStorage`, key `duolexie-active-profile`, default `'local'`). Actions: `refresh()`
  (`/me`), `requestLink`, `verify`, `logout`, `createProfile`, `selectProfile`.
- **Profile-scoped persistence** — one custom `StateStorage` in `state/idbStorage.ts` that
  prefixes keys with the active profile id. `selectProfile()` sets the id, then calls
  `useProgress.persist.rehydrate()` and `useAvatar.persist.rehydrate()`. This is also where
  [backend-readiness A3](backend-readiness.md) (`version` + `migrate`) lands — same commit,
  same blob.
- **One-time migration** on first start of the new build: if the legacy keys
  `duolexie-progress` / `duolexie-avatar` exist and `…:local` doesn't, copy them to the
  `local` profile. Her iPad keeps everything.
- **Adopt on first sign-up**: `verify` returns `isNew: true` and zero profiles → screen
  "Hoe heet de speler?" pre-filled from nothing → `POST /api/profiles` → copy `…:local` keys
  to `…:<newProfileId>` → select it. The local profile is kept around but hidden once a family
  has ≥1 profile (cheap insurance; delete it in a later cleanup).
- **Screens** (all Dutch, big buttons, same look as PathScreen):
  - `InloggenScreen` (`/inloggen`) — email field → sent state with 6-digit code field; reads
    `?token=` from the hash query and verifies automatically when present.
  - `ProfielKiezerScreen` (`/profielen`) — Netflix grid: avatar + name per profile, "+ Nieuw
    profiel" tile, small "Uitloggen" link. Shown after login, and reachable from the header.
  - `NieuwProfielScreen` — name + reuse `AvatarScreen` pieces.
  - PathScreen header: replace the current "Profiel" button (which opens the avatar editor)
    with the active profile's avatar → tapping opens the picker. Anonymous users see a quiet
    "Inloggen" link there; **no nag, no wall**.
- **Routing**: `HashRouter`, so the mail link is `…/#/inloggen?token=…` and
  `useSearchParams` works inside the hash route. Add all three screens to `/proberen` per the
  standing convention.
- **Vite dev proxy**: `server.proxy['/api'] → http://localhost:7071` so cookies stay
  same-origin in dev (SWA does this in prod).

## The notification email

Sent from `verify` when a family doc is created. Plain text is enough:

```
Onderwerp: DuoLexie — nieuwe aanmelding: ouder@voorbeeld.nl
Familie:   3f9c…   (aangemaakt 2026-09-18 19:42 CEST)
Totaal:    12 families
```

Awaited inside the function but wrapped in try/catch: a failure to notify you must never fail
the parent's login. (Managed Functions have no queue to defer to; at this volume that's fine.)
The family count is one cheap `COUNT` on the `auth` partition set — skip it if it ever costs
real RUs.

Not doing: a daily digest (no timer triggers on this tier) or a notification per new profile
(you asked for sign-ups; profiles would be noisy for a family with three kids). Both are
trivial to add later.

## Security & abuse checklist

- Token: 32 random bytes, stored as SHA-256, 15-min TTL, single use, deleted on use.
- Code: 6 digits, hashed, 5 attempts per token, same TTL.
- Throttle per email and per IP (`x-forwarded-for`, first hop). Always respond 200 to
  `request`; never reveal whether an email is known.
- Cookie `HttpOnly; Secure; SameSite=Lax; Path=/api`. Logout clears it. JWT `exp` 30 d.
- All `/api/*` already `Cache-Control: no-store` (staticwebapp.config.json).
- Email body: never echo user input unescaped into HTML; the link contains only the token.
- Profiles: max 6 per family, names ≤ 24 chars, server-side validated.
- Secrets only in SWA env vars; `api/local.settings.json` gitignored (added in this commit —
  the existing `*.local` pattern does **not** match it).

## Local development & tests

- Install once: `npm i -g azure-functions-core-tools@4`. Run `func start` in `api/` (port 7071)
  and `npm run dev` in `app/`; the Vite proxy joins them. `api/local.settings.json` carries
  the env vars with `MAIL_MODE=console` so the link and code print in the Functions terminal
  instead of being mailed. Point `COSMOS_*` at the real free-tier account (it's free and the
  dev data is throwaway) — or at the Cosmos emulator if you prefer, it's a URL swap.
- `lib/store.ts` gets a tiny **in-memory implementation** used automatically when
  `COSMOS_ENDPOINT` is unset. That's what makes the API runnable in CI without Cosmos and
  makes unit tests trivial.
- Unit tests (`node:test`, no new framework): token hashing round-trip, code attempt limit,
  throttle window, JWT sign/verify/expiry, "profile from another family → 404".
- Playwright: extend the CI job to also start the API with `MAIL_MODE=test`, which returns the
  code in the `request` response body (guarded: refuses to start if `NODE_ENV=production` or
  `ACS_CONNECTION_STRING` is set). Spec: request → read code → verify → profile picker →
  create profile → play a lesson → reload → still that profile. Run on all three projects.
- Manual, on her iPad: sign up from the installed PWA using the code path; confirm the
  existing gems survived the migration; switch profile; kill wifi; play a lesson; it works.

## Work order (each step shippable and independently verifiable)

Do [backend-readiness A1](backend-readiness.md) (`strict`) and A5 (`@shared` path mapping for
`api/`) first — both are one-liners and both are prerequisites here.

- [ ] **S0 — Azure:** you create ECS + ACS, link the managed domain, set the four env vars,
  enable Application Insights, add the custom domain. Verify: extended `/api/health` shows
  `mail: 'ok'`. Steps in [azure-setup.md §4–§6](azure-setup.md).
- [ ] **S1 — API lib:** `cosmos.ts`, `session.ts`, `mail.ts` (+ console/test modes),
  `throttle.ts`, in-memory store, unit tests. Deps `jose`, `@azure/communication-email`.
  Verify: `npm test` in `api/`, `npm run build`, deploy still green.
- [ ] **S2 — Auth endpoints:** `request`, `verify`, `me`, `logout`; notification mail on new
  family. Verify with `curl` against the deployed API and a real inbox; the notification
  arrives in yours.
- [ ] **S3 — Profile endpoints:** CRUD with family scoping; max 6; refuse deleting last.
- [ ] **S4 — Profile-scoped local state + migration + A3:** prefixing storage, `version: 1`
  + `migrate`, legacy-key migration, `local` profile. **Ship this alone and watch her iPad
  for a day** — it's the only step that touches existing progress.
- [ ] **S5 — Inloggen screen** with link + code paths, `/proberen` entry, Playwright spec.
- [ ] **S6 — Profielkiezer + Nieuw profiel + adopt-local-on-first-signup**, header avatar,
  `/proberen` entries, Playwright spec.
- [ ] **S7 — Deliverability:** custom sending domain on ECS (TXT/SPF/DKIM), `MAIL_FROM`
  switched, test in Gmail/Outlook/iCloud, check spam folder in all three.
- [ ] **S8 — Docs:** README "Accounts" section, azure-setup checklist ticked, plan.md §7
  pointer (done in this commit), this file's boxes.

Then, separately: backend-readiness A2 (session log) → sync endpoints → outbox. Profiles from
S3 are the `profileId` those sessions will carry.

## Open questions for Arjan (defaults chosen; say so if you want otherwise)

1. **Sending domain** — the app currently lives on `jolly-wave-…azurestaticapps.net`. Which
   domain/subdomain do you want for the site *and* the mail `From:`? Default assumption:
   the same one, e.g. `lexie.<domein>.nl` / `noreply@lexie.<domein>.nl`.
2. **Who may sign up** — open to anyone with an email (default), or an allow-list you edit
   in an env var until you're ready for strangers? An allow-list is ~5 lines in `request`.
3. **Notification recipient** — the address for `NOTIFY_EMAIL`. Personal or work?
4. **Max profiles per family** — 6 assumed.
5. **Session length** — 30 days sliding assumed. Forever-until-logout is one line if you'd
   rather never make a parent re-click a link on the tablet.

## Working conventions

Same as the other backlogs: verify with `npx tsc --noEmit -p app`, `npm run build`,
`npx playwright test --project=desktop` (from `app/`) and `npm test` (from `api/`) before each
commit; one commit per step; tick the box **in this file in the same commit**; author
`Arjan Assink <assink@gmail.com>`.
