# DuoLexie — Todo

Voortgang per fase uit [plan.md](plan.md). Bijwerken bij elke werksessie.

## Phase 0 — Walking skeleton
- [x] Git repo + Vite/React/TS scaffold in `app/`
- [x] Curriculum: `shared/curriculum/sounds.json` (45 klanken, 6 categorieën, verwarringsparen)
- [x] `staticwebapp.config.json` + GitHub Actions workflow
- [x] GitHub repo aangemaakt (`ArjanAssink/DuoLexie`)
- [ ] Push naar GitHub — **geblokkeerd**: `gh` token mist `workflow` scope → draai `gh auth refresh -h github.com -s workflow`
- [ ] Azure Static Web App aanmaken (Free, West Europe, app=`app`, output=`dist`) + deploy groen
- [ ] Custom domain + CNAME instellen (welk (sub)domein? → Arjan)

## Phase 1 — Eerste speelbare versie (lokaal, geen backend)
- [x] Padscherm: fases → units → lessen, lineaire unlock, edelstenen + weekdoel (5 van 7)
- [x] Flitsen: 60s-rondes, Goed/Nog even, klanken-per-minuut records, NIEUW RECORD-viering
- [x] Klankenjacht: hoor klank → tik teken, distractors uit verwarringsmatrix, re-queue bij fout
- [x] Lokale voortgang in IndexedDB (zustand persist): stats per klank, EWMA, mastery
- [x] Audio met TTS-fallback zolang opnames ontbreken
- [x] Opnamestudio `/opnemen` (dev-only) + `tools/convert-audio.mjs`
- [x] Lettertype-toggle (dyslexievriendelijke spatiëring), NL UI, mascotte v0 (🦊 emoji)
- [ ] Klanken inspreken (Fase-1-klanken minimaal) en mp3's committen
- [ ] End-to-end test in browser: les afronden, herladen, voortgang blijft staan
- [ ] Testen op haar eigen tablet/device
- [ ] Mascotte kiezen met dochter (suggestie: Flits de vos)

## Phase 2 — Volledige v1-spellenset + PWA
- [ ] Welke klank? (zie teken → tik het juiste geluid)
- [ ] Woordbouwer (woord bouwen uit klank-tegels, mkm eerst)
- [ ] Hardop lezen (woord lezen, zelf nakijken met opname)
- [ ] Woordenlijsten per klank (`shared/curriculum/words/`) + opnames
- [ ] Eindbaas + Schatkist nodes op het pad
- [ ] vite-plugin-pwa: installeerbaar, offline audio-precache

## Phase 3 — Accounts & sync
- [ ] Cosmos DB free tier account + containers `auth`/`data`
- [ ] `api/` package: register/login (bcryptjs, JWT-cookie), profiles + PIN, progress sync
- [ ] Registratie/login + profielkiezer met avatars
- [ ] Outbox-sync (idempotent op sessionResult-id); lokale voortgang migreren naar profiel

## Phase 4 — v2 content & ouderdashboard
- [ ] Fases 4–7 content (tweelingklanken, ch/ng/nk, drie/vier tekens, woordenrijk)
- [ ] Klankzoeker + Woordenvangst (ei/ij, au/ou spelling)
- [ ] Ouderdashboard: heatmap per klank, actieve-klanken-configuratie
- [ ] Stickerboek + winkeltje

## Later
- [ ] Fase 8 zinnen: Verdwijnzinnen (RAP-stijl), Zinnenbouwer
- [ ] Spraakherkenning stil meescoren naast zelfbeoordeling
- [ ] Vraag RID-behandelaar: klankgebaren? huidige actieve klanken?
