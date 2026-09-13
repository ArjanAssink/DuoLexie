# recordings/

Hier komen de **ruwe takes** uit de opnamestudio te staan: per take een `.webm` (de hele
doorlopende opname) en een `.json` (het cue sheet, dat zegt wanneer welk woord in beeld stond).
Na het knippen komt daar een `.report.json` bij. Alles in deze map behalve dit bestand is
gitignored — een take is een paar megabyte en het is niet wat de app uitlevert; de app krijgt
alleen de geknipte mp3's in `app/public/audio/`.

Nieuwe take knippen:

```
node tools/split-take.mjs recordings/woorden-2026-09-14-1902.webm
```

Dat normaliseert de hele take één keer, zoekt per woord de spraak binnen zijn cue-venster,
knipt met padding en fades, en schrijft één mp3 per woord plus een rapport van alles waar het
niet zeker over is. Exitcode 0 als álles `ok` is, anders 1. Luister het rapport daarna af op
`/#/opnemen` — en **herstart de dev-server**, want `vite.config.ts` leest de map met opnamen
één keer bij het starten.

Handig: `--dry-run` (meten en rapporteren, niets schrijven), `--ids kat,tas` (alleen die),
`--verify` (whisper.cpp leest de clips terug en markeert wat niet klinkt als het woord — het
beslist nooit iets). De volledige spec staat in [docs/recording-pipeline-v2.md](../docs/recording-pipeline-v2.md).
