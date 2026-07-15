# Handoff: Leerpad Home Screen (Frida learning app)

## Overview
Redesign of the home screen of a Dutch dyslexia-learning webapp for a 9-year-old. Style: friendly lesson-path app (Duolingo-genre, original design). Light warm background, chunky "3D" coin buttons along a winding path, and the app's own mascot **Frida** (a bulldog, provided as SVG assets).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy directly**. Recreate this design in the target codebase's existing environment (React, Vue, plain web, etc.) using its established patterns. If no frontend framework exists yet, pick what fits the project. `Leerpad App.dc.html` + `support.js` open together in a browser for reference; the layout markup is inside the `<x-dc>` tag with all styling inline.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and shadows below are final — recreate pixel-perfectly.

## Screen: Leerpad Home
Mobile-first, one column, design width **420px** (fluid up to ~480px is fine), background `#FDF8EE`, page behind it `#E9E0CC` if shown on desktop (card centered, radius 28px, shadow `0 10px 40px rgba(66,40,26,0.18)`).

Vertical structure:
1. **Stat bar** — flex row, space-between, padding `18px 22px 12px`.
   - Gems: blue diamond icon (24px) + count, `#3FB6DB`, Nunito 900 17px.
   - Center: Frida grumpy head (`avatar/frida-head-grumpy.svg`, ~46×38px), links to profile.
   - Streak: flame icon (22px, orange `#F5883C`, yellow `#F7DE4A` inner) + `0/5`, `#F5883C`, Nunito 900 17px.
   - `Aa` button (font/readability toggle): transparent, border `2px solid #EADFC8`, radius 12px, padding `4px 10px`, Nunito 900 16px `#42281A`.
2. **Unit header card** — margin `8px 20px 6px`, background `#F5A03C`, radius 18px, hard shadow `0 4px 0 #D9812A` (the "3D" treatment used throughout).
   - Kicker: `DEEL 1 · KORTE KLANKEN`, uppercase, 12px/800, letter-spacing 1.5px, `#FFE3BC`.
   - Title: `De klinkers`, Baloo 2 800 22px white.
   - Right: 2px divider `#D9812A`, then white list icon button (unit overview).
3. **Lesson path** — flex column, centered, `gap 26px`, padding `26px 0 10px`. Coins zig-zag via horizontal offsets (0 / +130px / +40px / +150px). Each item = coin button + label below (Nunito 900 14px).
   - **Active** (`Luister`): 74px circle, `#2FA79B`, hard shadow `0 7px 0 #22857B`, white star icon 34px; surrounding progress ring: 96px circle, `5px solid #BFE4E0`. Label `#2FA79B`.
   - **Locked** (`Flits`, `Mix`, `Uitdaging`): 64px circle, `#E7DCC4`, shadow `0 6px 0 #D3C5A6`, icon fill `#B7A886`. Label `#B7A886`. Icons: lightning (Flits), shuffle arrows (Mix), trophy (Uitdaging), star (generic lesson).
   - **Completed** (state exists, not shown): gold `#F7C531`, shadow `0 6px 0 #D9A616`, dark star `#B07E10`.
   - **Mascot**: `avatar/frida-sass.svg`, 128px wide, absolutely positioned beside the path (left ~34px, top ~150px). Swap to `frida-happy.svg` on lesson completion, `frida-head-celebrating.svg` in celebration moments.
4. **Letters divider** — row: 2px lines `#EADFC8` either side of `m · s · k · r · t`, Baloo 2 800 18px, letter-spacing 3px, `#B7A886`.
5. **Next unit teaser** — one locked star coin + label, offset left.
6. **Bottom nav** — white bar, top border `2px solid #EADFC8`, 4 evenly spaced buttons, padding `10px 12px`:
   - Leerpad (active): house icon (orange `#F5A03C` body, red-orange `#E2542F` roof), pill background `#E4F3F1`, border `2px solid #9ED4CD`, radius 14px.
   - Letters: `Aa` Baloo 2 800 22px `#B7A886`.
   - Beloningen: chest icon, `#D3C5A6`/`#B7A886`.
   - Profiel: person icon `#D3C5A6`.

## Interactions & Behavior
- Coin press: translate down 4–6px while reducing the hard shadow to ~2px (classic 3D-button press), ~80ms ease-out. Locked coins: subtle shake or no-op + optional tooltip "Nog vergrendeld".
- Active coin opens the lesson; completed lessons re-playable.
- Progress ring around active coin = completion within the current lesson (arc, `#2FA79B` on `#BFE4E0`).
- `Aa` toggles a dyslexia-friendly reading mode (larger letter-spacing / dyslexia font) app-wide; persist the choice.
- Path scrolls vertically; stat bar and bottom nav stay fixed.

## State Management
- `lessons[]`: id, label (Dutch), icon, state: `locked | active | completed`, unit grouping.
- `gems: number`, `streak: {current, goal}` (shown `0/5`).
- `readingMode: boolean` (Aa toggle), persisted.
- Mascot expression derived from context: default `sass`, `happy` on success, `celebrating` on unit complete, `sad/grumpy` sparingly on streak loss.

## Design Tokens
- Background: `#FDF8EE` (app), `#E9E0CC` (desktop surround), `#FFFFFF` (nav bar)
- Text: `#42281A` (primary), `#B7A886` (muted/locked), `#FFE3BC` (on orange, kicker)
- Primary action teal: `#2FA79B`, pressed/shadow `#22857B`, ring `#BFE4E0`, nav pill `#E4F3F1` + `#9ED4CD`
- Brand orange (Frida coat): `#F5A03C`, shadow `#D9812A`, accent `#E2542F`
- Gold (completed): `#F7C531`, shadow `#D9A616`, icon `#B07E10`
- Locked: fill `#E7DCC4`, shadow `#D3C5A6`, icon `#B7A886`; hairline `#EADFC8`
- Info blue (gems): `#3FB6DB` / `#4FC3E8` / `#7ED6F0`; streak orange `#F5883C` + `#F7DE4A`
- Fonts: **Baloo 2** (700–800) for display/titles, **Nunito** (600–900) for UI text (both Google Fonts). Minimum UI text 14px.
- Radii: 28px (screen), 18px (cards), 12–14px (small buttons), 50% (coins). Hard shadows always `0 <n>px 0 <darker-shade>`, n = 4–7.

## Assets (`avatar/` — the approved Frida mascot, plain SVG, scale freely)
- `frida-sass.svg` — full body, default (half-lidded signature look)
- `frida-happy.svg` — full body, correct-answer state
- `frida-head-grumpy.svg`, `frida-head-sad.svg`, `frida-head-celebrating.svg`, `frida-head-sleepy.svg` — head crops for stat bar, feedback toasts, empty states
- These are the canonical mascot files — do not redraw; inline or serve as static assets. All other icons in the design are simple inline SVGs described above (recreate with any icon approach the codebase uses).
- The sleepy head uses a text "z" glyph in Baloo 2; ensure the font is loaded or convert to a path.

## Files
- `Leerpad App.dc.html` — the home screen prototype (open in a browser alongside `support.js`; all markup/styles inline inside `<x-dc>`)
- `support.js` — runtime needed only to view the prototype; not part of the implementation
- `avatar/*.svg` — production-ready mascot assets
