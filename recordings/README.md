# recordings/

Hier komen de **ruwe takes** uit de opnamestudio te staan: per take een `.webm` (de hele
doorlopende opname) en een `.json` (het cue sheet, dat zegt wanneer welk woord in beeld stond).
Na het knippen komt daar een `.report.json` bij. Alles in deze map behalve dit bestand is
gitignored — een take is een paar megabyte en het is niet wat de app uitlevert; de app krijgt
alleen de geknipte mp3's in `app/public/audio/`.

## De lus, zonder terminal

Draait de dev-server (`npm run dev` in `app/`), dan doet de studio het knippen zelf. Er is
geen commando en geen herstart meer:

1. `/#/opnemen` → checklist, **Meet de stilte (2 s)**, niveau in de groene band zetten
2. **Start take** — lees voor, handen van het bureau; spatie als er één misgaat
3. **Knip en beluister** — één knop: de take gaat naar `recordings/`, `split-take.mjs` draait,
   de regels ervan lopen live over het scherm, en het rapport verschijnt eronder
4. Beoordelen: **Alles afspelen**, dan per clip **G** (goed) of **A** (afkeuren). Afkeuren telt
   meteen als ontbrekend, dus de volgende take pakt die woorden vanzelf.
5. **Deze opnieuw opnemen** — de afgekeurde clips staan al aangevinkt
6. **Speel een proefronde met deze clips** — nieuwe clips worden direct gebruikt; de
   dev-server hoeft niet herstart te worden.

Liever toch de terminal, of geen dev-server bij de hand:

```
node tools/split-take.mjs recordings/woorden-2026-09-14-1902.webm
npm run take:split          # vanuit app/ — pakt de nieuwste take in recordings/
```

Dat normaliseert de hele take één keer, zoekt per woord de spraak binnen zijn cue-venster,
knipt met padding en fades, en schrijft één mp3 per woord plus een rapport van alles waar het
niet zeker over is. Exitcode 0 als álles `ok` is, anders 1.

Handig: `--dry-run` (meten en rapporteren, niets schrijven), `--ids kat,tas` (alleen die),
`--latest` (de nieuwste take), `--verify` (whisper.cpp leest de clips terug en markeert wat
niet klinkt als het woord — het beslist nooit iets).

## Wat er verder in deze map komt

- **`verdicts.json`** — wat je van elke clip vond (✅ goed / ❌ afgekeurd), met de
  `Last-Modified` van het bestand waar dat oordeel over ging. Zodra een nieuwere opname
  binnenkomt vervalt het oordeel vanzelf: een retake erft nooit het ❌ dat hem terugstuurde.
  Staat hier in plaats van in de browser, zodat het een browserwissel overleeft en de tools
  het kunnen lezen. Zonder dev-server valt de studio terug op `localStorage` en verhuist het
  bij de eerste keer met dev-server stilletjes hierheen.
- **`afgekeurd/`** — afgekeurde clips, verplaatst en nooit weggegooid
  (`<map>-<id>-<tijdstip>.mp3`). Een retake kan slechter uitpakken dan wat hij verving, en dan
  is de clip die je weggooide het enige dat dat kan aantonen; terugzetten is een `mv`.

## Een take die niet uit de studio komt

De aftelpiepjes gaan ook door de speakers, dus een opname die je in Audacity of QuickTime
maakt *terwijl de teleprompter loopt* is achteraf te knippen met het cue sheet van die sessie:

```
node tools/split-take.mjs mijn-opname.wav --cues recordings/woorden-2026-09-14-1902.json
```

De piepjes lijnen de twee klokken uit (§4.3 van de v2-spec). Dat levert een echte audio-driver
en monitoring op als je die liever gebruikt.

De volledige specs: [docs/recording-pipeline-v2.md](../docs/recording-pipeline-v2.md) (de
pijplijn) en [docs/recording-studio-v3.md](../docs/recording-studio-v3.md) (beoordelen, meten,
en de dev-server-API).
