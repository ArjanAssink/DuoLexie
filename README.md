# DuoLexie 🦊

Duolingo-achtige lees-oefenapp voor kinderen met dyslexie, gebouwd rond de 45 Nederlandse klanken uit de RID-behandeling. Speels oefenen met flitskaarten (snelheid!) en luisterspellen (klank → teken), met edelstenen, records en een weekdoel.

**Belangrijk:** deze app is een aanvulling op de RID-thuisoefeningen, geen vervanging.

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

De app gebruikt zelf opgenomen klankclips (val terug op browser-TTS zolang die ontbreken):

1. `npm run dev` en open `http://localhost:5173/#/opnemen` (alleen in dev-mode)
2. Kies de map `app/public/audio/sounds` (File System Access API — gebruik Chrome)
3. Neem elke klank op; bestanden worden als `{klank}.webm` opgeslagen
4. Converteer naar mp3: `node tools/convert-audio.mjs` (vereist ffmpeg)
5. Commit de mp3's

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
