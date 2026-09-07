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
- [x] **Tijdrit** (heette Flitsen, hernoemd): 60s-rondes, Goed/Nog even, klanken-per-minuut records, NIEUW RECORD-viering
- [x] ~~Klankenjacht~~ verwijderd (niet leuk genoeg bevonden) → vervangen door **Flitsen** (nieuwe naam, was Klankkaarten), geport vanuit [CardFlash](https://github.com/ArjanAssink/CardFlash): tik de stapel om, kaart flipt en vliegt naar de aflegstapel, timer, geen score, geen narratie — geverifieerd in browser + e2e-suite (incl. snel overlappend tikken, geen dubbele afronding); iOS-jank-fix onderweg (box-shadow tijdens de flip-animatie is een bekend WebKit-perf-probleem — kon zelf niet op een echte iPhone testen, wachtend op bevestiging)
- [x] Lokale voortgang in IndexedDB (zustand persist): stats per klank, EWMA, mastery
- [x] Audio met TTS-fallback zolang opnames ontbreken
- [x] Opnamestudio `/opnemen` (dev-only) + `tools/convert-audio.mjs`
- [x] Lettertype-toggle (dyslexievriendelijke spatiëring), NL UI
- [x] Frida-redesign geïmplementeerd (art/design_handoff_leerpad): warm licht thema, coin-pad, statbalk, bottom nav, Frida-mascotte + favicons/manifest
- [x] Probeermenu `/proberen` (niet gelinkt in de navigatie): elke spelmodus direct spelen zonder het pad te doorlopen, plus `?test=true` ontgrendelt alle lessen op het echte pad-scherm zelf
- [ ] Klanken inspreken (Fase-1-klanken minimaal) en mp3's committen
- [ ] End-to-end test in browser: les afronden, herladen, voortgang blijft staan
- [ ] Testen op haar eigen tablet/device
- [ ] Mascotte kiezen met dochter (suggestie: Flits de vos)

## Phase 2 — Volledige v1-spellenset + PWA
- [ ] Welke klank? (zie teken → tik het juiste geluid)
- [ ] Woordbouwer (woord bouwen uit klank-tegels, mkm eerst)
- [x] Hardop lezen — swipe-kaart in plaats van tap-knoppen: woord verschijnt, wordt na een korte pauze uitgesproken (TTS-fallback, net als klanken — `/audio/words/{id}.mp3` klaarzet voor als opnames er zijn), sleep rechts (goed, "ding") of links (nog even, scheet-buzz via WebAudio); geen re-queue bij fout (leesbeurt, geen drilloop); elk woord telt mee voor de EWMA van al zijn klanken. Node verschijnt pas per unit zodra er ≥4 woorden met de tot-dan-toe geleerde klanken beschikbaar zijn (`words.ts` → `wordsForPool`). Geverifieerd in browser: volledige les (kok/tas/… ) van kaart tot beloningsscherm, progressiebalk, geen console errors/React-warnings.
- [x] Woordenlijsten per klank — `shared/curriculum/words.json` (was al aanwezig, nu voor het eerst gebruikt) dekt kort/lang/twee/drie/vier
- [x] 115 woorden geïmporteerd uit [Hangman](https://github.com/ArjanAssink/Hangman) via `tools/import-hangman-words.mjs` (greedy klanken-segmentatie, geen echte fonetische analyse) — allemaal `"reviewed": false`, **review nodig (Arjan)**: zie `tools/hangman-import-report.md` (woord + hint + klanken-opsplitsing per rij, plus 12 leenwoorden die niet gesegmenteerd konden worden en dus helemaal niet zijn toegevoegd). Prioriteit voor review: de 6 woorden met een `nk`-klank op een samenstellingsgrens (pannenkoek, woonkamer, boerenkaas, boekenkast) — twijfelachtig of dat fonetisch/didactisch hetzelfde is als een `nk` binnen één woorddeel (sprinkhaan, koninkrijk); ik weet het zelf niet zeker genoeg om dat te bepalen.
- [x] `buildWordExercises` geeft voorkeur aan kortere woorden (langste kandidatenpool = 3× het aantal benodigde oefeningen) — voorkomt dat een beginnersles "kat" en "helikopter" door elkaar aanbiedt nu het woordenboek veel langere samenstellingen bevat
- [x] **Hardop lezen rework — lezen → horen → sorteren** (plan: [docs/hardop-lezen-rework.md](docs/hardop-lezen-rework.md)): ronde van 10 **verschillende** woorden (geen herhalingen; woordpool verbreed door één unit vooruit te kijken op het pad — de openingsunit met alleen klinkers krijgt daardoor terecht nóg geen leesnode, de eerste komt op unit 2 met 17 woorden). Lont op de kaart begint op 10s en wordt korter per Leitner-box (10/7/5/3,5/2,5s). **Laat horen**-knop (of tik op de kaart) onthult het woord eerder; die tijd is het snelheidssignaal dat de box laat stijgen. Pas ná het horen is de kaart te beoordelen: sleep of tik naar de zichtbare stapels **Nog even** / **Goed!**, die meegroeien met mini-kaartjes en een teller. Kaart vliegt in een boog naar de stapel, stapel veert, ding + confetti-pufje bij goed, scheet-buzz + woord opnieuw bij nog even. Frida praat mee per fase, 3 goed op rij geeft een Bliksemsprint, pijltjestoetsen werken voor testen op desktop, alles heeft een reduced-motion-variant. Edelstenen nu per **woord**: 5 voor afmaken + 1 per goed woord + 3 perfect (5…18), dus een ronde die helemaal misging levert nog steeds 5 op. Beloningsscherm toont beide stapels ("7 goed · 3 nog even"), de gemiste woorden als aantikbare chips (tik = opnieuw horen) en telt de edelstenen één voor één op. **Proefronde** op `/proberen`: hele fase 1 als pool, om de interactie meteen met haar te testen zonder dat het niveau al klopt.
  - Onderweg gevonden en gefixt: (1) de deck-hint-pseudo-elementen lagen bovenóp de kaart en slikten elke sleepbeweging op (`::after` is het laatste kind, dus bij gelijke z-index vangt die de pointer-events); (2) TTS zonder `onend` (geen nl-NL-stem op een apparaat) zou de kaart nu permanent onbeoordeelbaar maken nu narratie een poort is — `audio.ts` heeft daarvoor een 6s-backstop gekregen, net als de bestaande clip-timeout, plus `stopSpeech()` bij unmount; (3) het kandidatenvenster voor "kortste woorden eerst" moest van 3× naar 2× de rondegrootte omdat een ronde van 10 anders "katapult" ging uitdelen (echt gebeurd in de browser).
  - [x] **Klif in de woordenlijst gedicht:** 93 woorden van 4 t/m 7 letters toegevoegd (fase 1 gaat van 38 naar **131** leesbare woorden, met oploop 28×3, 53×4, 23×5, 7×6, 10×7 letters). Met de hand gesegmenteerd, niet via de greedy importer, onder vier regels die het toevoeg-script ook echt afdwingt: één lettergreep of gesloten lettergrepen met een sjwa (win-ter), geen klinkerdigrafen en geen ch/ng/nk (elk letterpaar getoetst aan de meerletter-klanken in sounds.json), geen c/q/x/y en geen dubbele consonanten, en **geen open lettergrepen** — zomer/lepel/kalender hebben een lange klank met één letter en horen bij een latere stap (precies de val waar de Hangman-import in trapte). Daarna 8 woorden er weer uit die de regels wél toestonden maar een 9-jarige niet tegenkomt (kortst, strikt, brandt, stampt, stamp, stort, sprak, sprints).
  - **Review nodig (Arjan):** de 93 nieuwe woorden staan op `reviewed: false` — met de hand gesegmenteerd is niet menselijk gecheckt. Kleinere, makkelijkere batch dan de Hangman-import. Het meest discutabele is geen segmentatie maar een woordkeuze: de eerste leesnode heeft maar 15 woorden (klinkers + m·s·k·r·t), dus een ronde van 10 is daar noodgedwongen voor de helft clusterwoorden (storm, sterk, korst, markt, trots). Alternatief zou een kortere ronde op juist die node zijn. Zie §4 + §10 van het plan.
  - Bijkomend gevonden: de openingsunit (alleen klinkers) kreeg door die nieuwe woorden ineens wél een leesnode, want de bijgevulde pool haalde 18 woorden — precies de muur waartegen de bijvul-regel bedoeld was. De regel heeft daarom een tweede voorwaarde gekregen: bijvullen mag alleen als ze al *iets* kan lezen (niet-lege strikte pool). Met de huidige woordenlijst is bijvullen verder helemaal niet meer nodig.
  - [x] Woordmodus in de opnamestudio (`/opnemen`): schakelaar Klanken/Woorden, woorden op **kortste-eerst** (`wordsInRecordingOrder()`; padvolgorde binnen dezelfde lengte), standaard alleen de eerste 20 — allemaal woorden van 3 letters. Opslaan als `{woord}.webm` in `app/public/audio/words`, daarna `node tools/convert-audio.mjs app/public/audio/words`. `vite.config.ts` leest die map bij het starten en injecteert `__RECORDED_WORDS__`, zodat een ronde **eerst opgenomen woorden** pakt (binnen het kortste-woorden-venster) en pas op browser-TTS terugvalt als de opnames op zijn. Let op: die lijst is een momentopname bij het starten van Vite — een clip die je tijdens een dev-sessie opneemt vraagt een herstart.
  - **Nog te doen door Arjan:** de 20 woorden daadwerkelijk inspreken (eigen machine, Chrome) + committen, en het echte speeltest-moment met haar (§9 stap 5 van het plan).
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
