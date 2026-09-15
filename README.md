# DuoLexie 🦊

Speels leren lezen, klank voor klank — met Frida als gids.

<img src="art/avatar/frida-happy.svg" alt="Frida, de DuoLexie-mascotte" width="160" />

Duolingo-achtige lees-oefenapp voor kinderen met dyslexie, gebouwd rond de 45 Nederlandse klanken uit de RID-behandeling. Speels oefenen met flitskaarten (snelheid!) en luisterspellen (klank → teken), met edelstenen, records en een weekdoel.

**Belangrijk:** deze app is een aanvulling op de RID-thuisoefeningen, geen vervanging.

Wie de app voor het eerst opent krijgt een korte kennismaking op `/#/welkom` — Frida stelt
zich voor, je kiest een naam (of niet) en maakt je avatar; daarna kom je altijd meteen op het
leerpad uit. Zie [docs/onboarding-welkom.md](docs/onboarding-welkom.md).

## Structuur

```
app/       React + Vite + TypeScript PWA (het spel)
shared/    Curriculum (klanken/categorieën) + gedeelde types
tools/     convert-audio.mjs — webm-opnames → genormaliseerde mp3
```

## Lokaal draaien

```bash
cd app
npm install
npm run dev
```

## Audio opnemen

De app gebruikt zelf opgenomen klanken en woorden (browser-TTS is de terugval zolang een clip
ontbreekt). Opnemen gaat in **één doorlopende take** die daarna automatisch geknipt wordt —
niet meer klik-per-clip. Dat is geen gemak maar geluidskwaliteit: elke klik zat in de opname,
en een clip van 300ms is te kort om apart te normaliseren. Zie
[docs/recording-pipeline-v2.md](docs/recording-pipeline-v2.md) voor het waarom.

1. Zorg voor een stille kamer. `npm run dev`, open `http://localhost:5173/#/opnemen` in
   **Chrome of Edge** (File System Access API), en kies de map `recordings/`.
2. Kies de set (klanken / woorden-startset / alle woorden, eventueel *alleen ontbrekende*) en
   het tempo. Check de microfoon: de meter mag niet in het rood, en "test 3 seconden" laat
   horen of je de juiste ingang te pakken hebt.
3. **Start take.** Na `3 · 2 · 1 · piep` verschijnt elk woord om de beurt. Lees het één keer
   rustig voor. **Handen van het bureau** — toetsen en muisklikken komen mee de opname in.
   - **spatie** — deze ging mis; het woord komt vanzelf achteraan terug
   - **backspace** — de vorige ging mis (je merkte het een tel te laat)
   - **Esc** — pauze; nog een keer Esc hervat met een nieuwe aftelling
4. Knip de take: `node tools/split-take.mjs recordings/<take>.webm` (vereist ffmpeg). Dat
   schrijft één mp3 per woord in `app/public/audio/` plus een rapport.
5. Luister terug op `/#/opnemen` → **Rapport laden**: gemarkeerde clips staan bovenaan, "alles
   afluisteren" speelt de hele set achter elkaar. Vink aan wat opnieuw moet en druk op
   *Deze opnieuw opnemen* — dat start een take met alleen die woorden.
6. **Herstart de dev-server** (`vite.config.ts` leest `public/audio/words/` één keer bij het
   starten) en commit de mp3's. De `.webm`-takes zelf blijven in `recordings/`, gitignored.

## Deploy (Azure Static Web Apps, gratis tier)

1. Maak in de [Azure Portal](https://portal.azure.com) een **Static Web App** aan:
   - Plan: **Free**, regio **West Europe**
   - Source: GitHub → dit repo, branch `main`
   - Build presets: Custom — app location `app`, api location leeg, output location `dist`
   - Let op: Azure genereert zelf een workflow-bestand; dit repo heeft er al één
     (`.github/workflows/azure-static-web-apps.yml`). Kies bij aanmaken "use existing workflow"
     of verwijder het gegenereerde duplicaat en zet het deployment token als repo-secret
     `AZURE_STATIC_WEB_APPS_API_TOKEN`.
2. Custom domain: voeg in de SWA een custom domain toe en maak bij je DNS-provider
   een CNAME naar de `*.azurestaticapps.net` hostname. SSL is automatisch en gratis.

## Roadmap

Zie het plan: klankspellen → woorden → zinnen, accounts met profielen (fase 3),
ouderdashboard, stickerboek. Spraakherkenning is een later experiment.

## Licentie

MIT — zie [LICENSE](LICENSE).
