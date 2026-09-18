# Onboarding: the first visit

Implementation spec for what someone sees the first time they open DuoLexie — on a phone,
an iPad or a desktop browser — and what they can do before they ever see the leerpad. Written
for a fresh coding session that has not seen the conversation behind it. *Must* marks an
acceptance criterion; *suggested* is open to judgement. All copy is in Dutch and is given in
full in §4: use it verbatim, do not paraphrase it.

**Status:** specified, not built.

---

## 1. Goal, and what it is not

A visitor who arrives at the URL cold should think "this is a real, finished-looking app made
with care" within two seconds, understand who it is for and what it does, and be gently walked
into making it theirs: a name and an avatar. Frida does the inviting.

It stores the name and the "onboarding done" flag **locally**, in the existing IndexedDB-backed
zustand stores, exactly as gems and the avatar already are. There is no backend yet
(plan.md Phase 3 adds accounts and profiles; the name will move into the profile document
then). "No persistence" in the brief meant no server — a returning visitor must **not** see
the onboarding again, and the name must survive a reload.

Not in scope: accounts, PIN, parent gate, anything server-side, changing any game.

---

## 2. Flow

Three steps and a closing beat, at a new route **`/#/welkom`**. Step dots at the top
(3, filled as she goes), a back chevron on steps 2 and 3, a single primary CTA per step.
Every step fits one phone screen without scrolling (iPhone 13, 390×664) except step 3, whose
pickers may scroll under a pinned CTA.

```
 ① Welkom            ② Naam                ③ Avatar              ✓ Klaar
 ┌─────────────┐     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
 │ ● ○ ○       │     │ ‹ ● ● ○     │      │ ‹ ● ● ●     │      │             │
 │             │     │             │      │  🐶 "Mooi!" │      │    🐶🎉     │
 │   🐶  ┌───┐ │     │  🐶 ┌─────┐ │      │  ┌───────┐  │      │ Veel        │
 │      │Hoi!│ │     │    │Hoi,  │ │      │  │ avatar│  │      │ plezier,    │
 │      └───┘ │     │    │Lotte!│ │      │  │  full │  │      │ Lotte!      │
 │ DUOLEXIE    │     │    └─────┘ │      │  └───────┘  │      │             │
 │ Lezen       │     │             │      │  kapsel     │      │  (confetti, │
 │ oefenen,    │     │ Hoe mogen   │      │  huid       │      │   ~900ms,   │
 │ maar dan    │     │ we je       │      │  ogen       │      │   then →/)  │
 │ leuk.       │     │ noemen?     │      │  haar       │      │             │
 │ • • •       │     │ [ Je naam ] │      │             │      │             │
 │ [Aan de slag│     │ [ Verder ]  │      │ [ Klaar! ]  │      │             │
 │  WIP·GitHub │     │ Liever geen │      │             │      │             │
 └─────────────┘     └─────────────┘      └─────────────┘      └─────────────┘
```

### 2.1 Welkom

Frida (`frida-happy.svg`, large — about 40% of the card width on a phone) with a speech
bubble. Below: kicker, headline, one paragraph, three bullets with the app's own icons
(`components/Icons.tsx`: `LessonIcon`/lightning for the games, `GemIcon`, `FlameIcon`), the
CTA, and a small footer with the work-in-progress note and the GitHub link.

- Frida **must** move: a slow idle float (±4px, 3s, `ease-in-out`) so the screen is alive
  before anything is touched. Suggested: the bubble pops in 300ms after Frida, with the same
  spring curve the game cards use (`cubic-bezier(.2,1.3,.4,1)`).
- The GitHub link opens in a new tab: `target="_blank" rel="noopener noreferrer"`, href
  `https://github.com/ArjanAssink/DuoLexie/issues`.

### 2.2 Naam

Frida smaller (head, `head-grumpy` as the app's resting face), bubble **live**: it says "Hoe
heet jij?" until the field has a character, then "Hoi, {naam}!" — updating on every
keystroke, no debounce; that reaction is the delight of the step.

- One text input. `autoComplete="given-name"`, `autoCapitalize="words"`,
  `enterKeyHint="done"`, `maxLength={20}`, `inputMode="text"`. Enter submits like the CTA.
  **Font size 20px** on the input: below 16px iOS Safari zooms the page on focus,
  `user-scalable=no` notwithstanding. Set `user-select: text` on it explicitly — `.app`
  sets `user-select: none` on everything.
- The name is trimmed; internal whitespace collapsed to one space. Empty after trimming
  counts as no name.
- CTA **Verder** is enabled only with a non-empty name. Below it a text link **Liever geen
  naam** continues without one. Both go to step 3.
- **The CTA must stay reachable with the software keyboard up.** Lay the step out as a flex
  column with the CTA in normal flow (not `position: fixed`) and a `min-height` of `100dvh`
  (not `vh`), and verify on the iPhone profile that after focusing the input the CTA's
  bounding box is still inside the viewport.

### 2.3 Avatar

The full avatar (`AvatarView crop="full"`) with the four pickers from `AvatarScreen`
(kapsel, huidskleur, oogkleur, haarkleur). Frida head top-right with "Mooi zo!" — or
"Mooi, {naam}!" when there is a name. Shop accessories are **not** offered here (they cost
gems she does not have yet).

- **Extract the pickers** from `screens/AvatarScreen.tsx` into
  `components/AvatarPickers.tsx` and use that component in both places. Do not copy the
  four sections.
- Changes write straight to the avatar store as they do today — the statbar avatar on the
  leerpad reflects them immediately after finishing.
- CTA **Klaar!**

### 2.4 Klaar

`completeOnboarding()` is called, then a ~900ms closing beat: Frida `head-celebrating`,
"Veel plezier, {naam}!" (or "Veel plezier!"), a confetti burst (`canvas-confetti`, already a
dependency; `particleCount: 90, spread: 80, origin: { y: 0.6 }`), then `navigate('/')`.
Under reduced motion: no confetti, 400ms, no float anywhere in the flow.

### 2.5 Getting back to it

`screens/AvatarScreen.tsx` (the Profiel tab) gains a section **Over DuoLexie** at the bottom:
a name field (same rules as step 2, saves on blur), the work-in-progress paragraph and GitHub
link from §4, and a button **Introductie opnieuw bekijken** that navigates to `/welkom`
without clearing anything (finishing again just returns to the path). That is also how the
flow is reached for manual checks once the flag is set.

---

## 3. Gate, routing, hydration

### 3.1 State

In `state/progress.ts`, two fields on `settings` and two actions:

```ts
settings: {
  font: 'standaard' | 'dyslexie'
  selfSwipes: number
  playerName: string          // '' = none. Trimmed, ≤ 20 chars.
  onboardedAt: string | null  // ISO instant; null = show the flow at /
}
setPlayerName(name: string): void
completeOnboarding(): void    // sets onboardedAt = new Date().toISOString(); idempotent
```

Defaults `''` and `null`. The store's `merge` already does `settings: { ...current.settings,
...p.settings }`, so an existing profile gets the defaults without a version bump or a
migration — **read `merge` and confirm that before relying on it**, as `selfSwipes` did.

### 3.2 Where the gate sits

`PathScreen` (route `/`) redirects to `/welkom` when `onboardedAt` is null. Nothing else
redirects: deep links (`/#/les/...`, `/#/proberen`, `/#/avatar`) work on a fresh profile,
which the e2e suite and `/proberen` depend on. `?test=true`, the existing hook that unlocks
every lesson for `/proberen`, **also bypasses the gate** — the "Open het pad, alles
ontgrendeld" link must keep working without a detour.

`/welkom` itself is always reachable, before or after onboarding (§2.5).

### 3.3 Hydration — the part that is easy to get wrong

Both stores load from IndexedDB **asynchronously**. On first render `onboardedAt` is `null`
for everyone, including a returning visitor whose real value has not arrived yet. A gate that
reads it on first render sends every returning visitor to `/welkom` for a frame or two — a
visible flash of the wrong screen, and if `navigate` has already fired, a wrong screen that
sticks. Nothing in the app handles this today (there is no `hasHydrated` anywhere), because
nothing has needed it: the leerpad merely shows 0 gems for a frame.

**Must:** a `useHydrated()` hook (suggested location `state/hydration.ts`) built on zustand's
`useProgress.persist.hasHydrated()` / `onFinishHydration` and the same for `useAvatar`,
true only when **both** are done. `App.tsx` renders nothing but the `.app` background until
it is true — a blank card in the app's own colour, no spinner, no text. Hydration from
IndexedDB takes tens of milliseconds; a spinner would be a flash of its own. Only then do the
routes render, so the redirect in `PathScreen` sees the real value.

Verify it, don't assume it: with a seeded "onboarded" profile, load `/` and assert the URL
never becomes `/welkom` (poll the URL for ~500ms after load), and that `.coin-item` appears.

---

## 4. Copy (Dutch, verbatim)

**Step 1 — Welkom**

| slot | text |
|---|---|
| Frida's bubble | Hoi! Ik ben Frida. |
| kicker (uppercase, letter-spaced) | DUOLEXIE |
| headline | Lezen oefenen, maar dan leuk. |
| paragraph | DuoLexie is een oefen-app voor kinderen met dyslexie die bij RID leren lezen. Korte spelletjes met klanken en woorden, een paar minuten per dag — náást je gewone oefeningen, niet in plaats daarvan. |
| bullet 1 (lightning) | Snelle spelletjes met klanken en woorden |
| bullet 2 (gem) | Edelstenen verdienen en je eigen avatar aankleden |
| bullet 3 (flame) | Een weekdoel: 5 van de 7 dagen oefenen |
| CTA | Aan de slag |
| footer | DuoLexie is nog in ontwikkeling. Loop je ergens tegenaan, of heb je een idee? Laat het weten op **GitHub**. |

**Step 2 — Naam**

| slot | text |
|---|---|
| bubble, empty field | Hoe heet jij? |
| bubble, with name | Hoi, {naam}! |
| headline | Hoe mogen we je noemen? |
| input placeholder | Je naam |
| helper (small, muted) | Alleen je voornaam is genoeg. |
| CTA | Verder |
| skip link | Liever geen naam |

**Step 3 — Avatar**

| slot | text |
|---|---|
| bubble | Mooi zo! / Mooi, {naam}! |
| headline | Maak je eigen avatar |
| sub | Dit kun je later altijd veranderen bij Profiel. |
| pickers | Kapsel · Huidskleur · Oogkleur · Haarkleur (existing labels) |
| CTA | Klaar! |

**Klaar** — Veel plezier, {naam}! / Veel plezier!

**Profiel → Over DuoLexie** — section title *Over DuoLexie*; name field label *Je naam*;
the footer paragraph from step 1; button *Introductie opnieuw bekijken*.

**Leerpad greeting (suggested)** — *Hoi, {naam}!* as a small line above the unit header card,
only when a name exists.

**Reward screen (suggested)** — when a name exists, *Goed gedaan, {naam}!* and *Perfect,
{naam}!* replace the bare headlines in `screens/RewardScreen.tsx`.

---

## 5. Look, on three screens

The flow lives inside the existing centred `.app` card and uses only existing tokens
(`theme.css :root`): Baloo 2 for headline and bubble, Nunito for body, `--teal` CTA with its
hard shadow, white bubble with `0 3px 0 var(--hairline)`. Reuse `.coach-bubble` (it exists for
the reading game) — give it a `--large` modifier rather than a second bubble style.

- **Phone**: as sketched. Frida ~150px tall on step 1; headline `clamp(28px, 7vw, 36px)`.
- **iPad**: the card is 480px wide and centred; everything scales with the existing `clamp()`
  approach. Check nothing looks sparse — Frida may grow to ~190px.
- **Desktop (≥ 900px), suggested**: the card floating on the flat `--bg-desktop` reads as a
  phone screenshot. While the onboarding route is mounted, set `data-welkom` on `<html>` and
  give `body` a soft radial gradient from `--bg` at the centre to `--bg-desktop`, plus a very
  large, very faint Frida (`frida-sass.svg`, ~700px, `opacity: .06`) anchored bottom-left of
  the viewport. Remove the attribute on unmount. Cheap, and it turns a floating card into a
  landing page.
- Reduced motion: no float, no bubble pop, no confetti; static everything.

**Frida art.** Everything above uses SVGs that exist in `app/public/avatar/`: `frida-happy`,
`frida-sass`, `frida-head-grumpy`, `frida-head-celebrating`. A dedicated *waving* pose would
be better than `happy`+float on step 1; it is an art task for the design-handoff pipeline
(`art/`, see plan.md §12), **not** a blocker — build with `frida-happy`, leave a one-line
TODO where the asset name is, and list it in the PR description.

---

## 6. Link previews and install metadata

Part of "suitably impressed" is the link card in WhatsApp or iMessage before the tap.
`app/index.html` has none of it.

- `<meta name="description" content="Lezen oefenen, maar dan leuk — een oefen-app voor kinderen met dyslexie, met Frida.">`
- Open Graph: `og:title` "DuoLexie", `og:description` (same text), `og:type` "website",
  `og:locale` "nl_NL", `og:image` → `/icon-512.png` for now (square renders fine in WhatsApp;
  a 1200×630 card is a later art task), `og:url` → `https://duolexie.assink.io/`.
- `app/public/site.webmanifest`: add `"description"` (same text) and `"lang": "nl"`.

---

## 7. Files

| file | change |
|---|---|
| `app/src/screens/OnboardingScreen.tsx` | new — the three steps + Klaar beat, step state local (`useState`), no router per step |
| `app/src/components/AvatarPickers.tsx` | new — extracted from `AvatarScreen`, used by both |
| `app/src/components/FridaSays.tsx` | new, suggested — Frida + bubble, props `expression`, `size`, `children`; the reading game's coach row is a candidate to adopt it later, out of scope now |
| `app/src/state/hydration.ts` | new — `useHydrated()` |
| `app/src/state/progress.ts` | `playerName`, `onboardedAt`, `setPlayerName`, `completeOnboarding` |
| `app/src/App.tsx` | hydration gate around `<Routes>`; route `/welkom` |
| `app/src/screens/PathScreen.tsx` | redirect when not onboarded (honouring `?test=true`); suggested greeting |
| `app/src/screens/AvatarScreen.tsx` | uses `AvatarPickers`; *Over DuoLexie* section |
| `app/src/screens/RewardScreen.tsx` | suggested — name in headline |
| `app/src/theme.css` | onboarding styles, bubble `--large`, desktop backdrop, reduced-motion block |
| `app/index.html`, `app/public/site.webmanifest` | §6 |
| `app/tests/e2e/fixtures/onboarded.ts` | new — §8 |
| `app/tests/e2e/onboarding.spec.ts` | new — §8 |
| existing specs | add the fixture where they visit `/` — §8 |
| `todo.md`, `README.md` | one line each |

---

## 8. Tests

The gate changes what `/` is on a fresh profile, so **every existing e2e test that lands on
`/` — directly or by quitting a game — now needs the flag set first**, or it will find
the onboarding where it expected the leerpad. `grep -l "goto('/')\|coin-item" app/tests/e2e`
lists them; at the time of writing that is at least `path-to-lesson`, `ux-polish` and
`quit-mid-animation` (which asserts `.coin-item` after quitting to `/`).

**`fixtures/onboarded.ts`** — `skipOnboarding(page)`: navigate to any app route (`/#/welkom`
is fine), then `page.evaluate` a write of the persisted progress blob to IndexedDB, then
return so the caller does its own `goto`. Mirror `state/idbStorage.ts` exactly for database
name, object-store name and key (`duolexie` / `kv` / `duolexie-progress`; verify). The value is
the JSON string zustand's `createJSONStorage` writes: `{ "state": { "settings": {
"onboardedAt": "<iso>" } }, "version": <the store's current version> }` — read `version` from
`progress.ts`; a stale number would trigger `migrate` on every test. `merge` fills in the rest.
An awaited `page.evaluate` is used rather than `addInitScript` because the seed must be
**committed before** the app opens the database, and only an awaited write guarantees the
order.

**`onboarding.spec.ts`** (desktop project; add the ipad/iphone projects for the layout
assertions):

1. A fresh visit to `/` lands on `/#/welkom`, step 1, with Frida, the headline and the CTA
   visible, and no console errors (in the Claude sandbox, expect the one known font error —
   see §9).
2. The GitHub link has the exact href, `target="_blank"` and `rel` containing `noopener`.
3. Aan de slag → step 2. Typing `lotte` makes the bubble read exactly `Hoi, lotte!`; clearing
   it returns `Hoe heet jij?`. Verder is disabled while empty, enabled after typing.
4. Liever geen naam → step 3 with `playerName` still `''`.
5. On step 3, choosing a different kapsel changes the avatar store (assert via the topbar
   avatar's rendered hairstyle on the leerpad after finishing, or read the store).
6. Klaar! → within ~2s the URL is `/` and `.coin-item.active` is visible; reload, still `/`,
   `onboardedAt` set.
7. With `skipOnboarding`, `/` shows the leerpad and the URL **never** passes through
   `/welkom` (poll for 500ms) — the hydration test of §3.3.
8. A deep link `/#/les/fase1-a-e-o-u-i-l1` on a fresh profile opens the game, no redirect.
9. `/?test=true#/` on a fresh profile shows the leerpad.
10. iPhone profile: on step 2, after `.focus()` on the input, the CTA's `boundingBox()` is
    inside the viewport.
11. `emulateMedia({ reducedMotion: 'reduce' })`: Frida's computed `animationName` is `none`.
12. Profiel → *Introductie opnieuw bekijken* reaches `/welkom`; Klaar! returns to `/`.

**Unit**: `setPlayerName` trims and collapses whitespace and caps at 20;
`completeOnboarding` is idempotent (second call keeps the first timestamp). Small, but the
trimming is where a stray space in the bubble would come from.

**Screenshots**, checked by eye and by measurement, on iPhone 13, iPad Pro 11 and a 1280×800
desktop: all three steps and the Klaar beat. Tap targets ≥ 44px. Attach the phone and desktop
ones to the PR.

---

## 9. Verification, and what the sandbox cannot do

From `app/`: `npm run build`, `npm run lint`, `npm test`, `npx playwright test
--project=desktop`. In the Claude sandbox the pinned Playwright cannot find its browser: use a
throwaway config that sets `launchOptions.executablePath: '/opt/pw-browsers/chromium'` on
every project, and delete it before committing. Expect **one** failure that is not yours,
`path-to-lesson.spec.ts`'s no-console-errors assertion, because the sandbox blocks
fonts.googleapis.com — confirm it fails identically on untouched `main` and say so. WebKit
cannot run locally; open a PR so CI runs the ipad and iphone projects (they retry twice; a
failure surviving all attempts is real). Do not merge red.

Real-device checks the session cannot do, to list in the PR for Arjan: the software-keyboard
behaviour on an actual iPhone, and how the WhatsApp link card renders.

---

## 10. Decisions taken here, so the session does not reopen them

- Name is **optional**; skipping is a text link, not a second button.
- The gate is on `/` only. Deep links never redirect.
- Local persistence via the existing stores; no new storage, no backend.
- Frida `happy` + float on step 1; a waving pose is a follow-up art task.
- No parent-specific screen. The paragraph on step 1 addresses the parent implicitly ("náást
  je gewone oefeningen"). A *Voor ouders* page is a plausible later addition, not this one.
