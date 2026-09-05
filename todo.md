# DuoLexie — Todo

Voortgang per fase uit [plan.md](plan.md). Bijwerken bij elke werksessie.

## Phase 0 — Walking skeleton
- [x] Git repo + Vite/React/TS scaffold in `app/`
- [x] Curriculum: `shared/curriculum/sounds.json` (45 klanken, 6 categorieën, verwarringsparen)
- [x] `staticwebapp.config.json` + GitHub Actions workflow
- [x] GitHub repo aangemaakt (`ArjanAssink/DuoLexie`)
- [x] Push naar GitHub
- [x] Azure Static Web App aangemaakt — live op https://jolly-wave-019071410.7.azurestaticapps.net
- [x] Dubbele workflow opgeruimd (Azure-gegenereerde behouden)
- [x] CNAME `duolexie.assink.io` → jolly-wave-019071410.7.azurestaticapps.net
- [x] Custom domain live: **https://duolexie.assink.io** (SSL automatisch)
- [x] Regio-besluit: SWA blijft staan (EUAP-resourcegroep alleen metadata-eigenaardigheid; Cosmos staat in West Europe)

## Phase 1 — Eerste speelbare versie (lokaal, geen backend)
- [x] Padscherm: fases → units → lessen, lineaire unlock, edelstenen + weekdoel (5 van 7)
- [x] Flitsen: 60s-rondes, Goed/Nog even, klanken-per-minuut records, NIEUW RECORD-viering
- [x] ~~Klankenjacht~~ verwijderd (niet leuk genoeg bevonden) → vervangen door **Klankkaarten**, geport vanuit [CardFlash](https://github.com/ArjanAssink/CardFlash): tik de stapel om, kaart flipt en vliegt naar de aflegstapel, timer, geen score — geverifieerd in browser + e2e-suite (incl. snel overlappend tikken, geen dubbele afronding)
- [x] Lokale voortgang in IndexedDB (zustand persist): stats per klank, EWMA, mastery
- [x] Audio met TTS-fallback zolang opnames ontbreken
- [x] Opnamestudio `/opnemen` (dev-only) + `tools/convert-audio.mjs`
- [x] Lettertype-toggle (dyslexievriendelijke spatiëring), NL UI
- [x] Frida-redesign geïmplementeerd (art/design_handoff_leerpad): warm licht thema, coin-pad, statbalk, bottom nav, Frida-mascotte + favicons/manifest
- [ ] Klanken inspreken (Fase-1-klanken minimaal) en mp3's committen
- [ ] End-to-end test in browser: les afronden, herladen, voortgang blijft staan
- [ ] Testen op haar eigen tablet/device
- [ ] Mascotte kiezen met dochter (suggestie: Flits de vos)

## Phase 2 — Volledige v1-spellenset + PWA
- [ ] Welke klank? (zie teken → tik het juiste geluid)
- [ ] Woordbouwer (woord bouwen uit klank-tegels, mkm eerst)
- [x] Hardop lezen — swipe-kaart in plaats van tap-knoppen: woord verschijnt, wordt na een korte pauze uitgesproken (TTS-fallback, net als klanken — `/audio/words/{id}.mp3` klaarzet voor als opnames er zijn), sleep rechts (goed, "ding") of links (nog even, scheet-buzz via WebAudio); geen re-queue bij fout (leesbeurt, geen drilloop); elk woord telt mee voor de EWMA van al zijn klanken. Node verschijnt pas per unit zodra er ≥4 woorden met de tot-dan-toe geleerde klanken beschikbaar zijn (`words.ts` → `wordsForPool`). Geverifieerd in browser: volledige les (kok/tas/… ) van kaart tot beloningsscherm, progressiebalk, geen console errors/React-warnings.
- [x] Woordenlijsten per klank — `shared/curriculum/words.json` (was al aanwezig, nu voor het eerst gebruikt) dekt kort/lang/twee/drie; **nog uit te breiden** voor vier/mede-categorie zodra die fases content krijgen
- [ ] **Review nodig (Arjan):** stem/backend kiezen voor bulk woord-audio — zie vergelijking https://claude.ai/code/artifact/12e0af9c-368a-4d27-954e-5ee143df7edc (Piper vs Google Translate vs Azure/Google Cloud), script in `tools/generate-word-audio.mjs`; tot dan speelt Hardop lezen via browser-TTS
- [ ] Eindbaas + Schatkist nodes op het pad
- [ ] vite-plugin-pwa: installeerbaar, offline audio-precache

## Phase 3 — Accounts & sync
- [x] Cosmos DB account aangemaakt (West Europe; check: free tier discount "Applied")
- [x] Database `duolexie` + containers `auth`/`data`
- [x] Env vars op SWA (`COSMOS_ENDPOINT`, `COSMOS_KEY`, `JWT_SECRET`) — geverifieerd via `/api/health`
- [x] `api/` package opgezet met `/api/health` canary (env + Cosmos-check)
- [ ] `api/` package: register/login (bcryptjs, JWT-cookie), profiles + PIN, progress sync
- [ ] Registratie/login + profielkiezer met avatars
- [ ] Outbox-sync (idempotent op sessionResult-id); lokale voortgang migreren naar profiel

## Phase 4 — v2 content & ouderdashboard
- [ ] Fases 4–7 content (tweelingklanken, ch/ng/nk, drie/vier tekens, woordenrijk)
- [ ] Klankzoeker + Woordenvangst (ei/ij, au/ou spelling)
- [ ] Ouderdashboard: heatmap per klank, actieve-klanken-configuratie
- [ ] Stickerboek

### Speler-avatar & winkel (zie plan.md §12)
- [x] `AvatarView`: layered SVG rig (body/head/eyes/hair), `crop` prop (full / topbar), placeholder art — geverifieerd in browser (Playwright): kleuren + kapsel wisselen live, persisteert over reload (IndexedDB), geen console errors
- [x] `state/avatar.ts`: avatarConfig, persisted zoals progress.ts (ownedItems volgt bij de shop-stap)
- [x] Topbar: `Frida` in `.statbar` vervangen door `<AvatarView crop="topbar">`, tikbaar naar AvatarScreen; bottomnav "Profiel" navigeert ook naar /avatar
- [x] `AvatarScreen`: volledige bovenlijf-weergave, kleurkeuzes (huid/ogen/haar), kapsel-picker (kort/krullen/staart/lang)
- [x] Accessoire-slots (oorbellen, bril, hoed) in de rig + `AvatarConfig.equipped` — geverifieerd: 3 items tegelijk dragen (bril + pet + oorbellen) rendert correct gestapeld
- [x] Shop: `shopItems.json` catalogus (7 items), `spendGems` op progress.ts, `ShopScreen` per categorie — geverifieerd: kopen trekt gems af, niet-betaalbare items zijn uitgeschakeld en doen niets bij een tik, gedragen/eigendom-status en persistente over reload kloppen, geen console errors
- [x] Echte kunst-pas: placeholder-vormen vervangen door verfijnde hand-getekende SVG (rechtstreeks in code, niet via de design-canvas — lagen moeten pixelperfect uitlijnen tussen huid/oog/haarkleuren, kapsels en accessoires; vlakke shading i.p.v. gradients omdat meerdere AvatarViews tegelijk renderen). Geverifieerd in browser: 4 kapsels, meerdere kleurcombinaties, alle 7 accessoires los en gestapeld, ook op winkel-thumbnail-schaal — geen console errors

## Later
- [ ] Fase 8 zinnen: Verdwijnzinnen (RAP-stijl), Zinnenbouwer
- [ ] Spraakherkenning stil meescoren naast zelfbeoordeling
- [ ] Vraag RID-behandelaar: klankgebaren? huidige actieve klanken?
