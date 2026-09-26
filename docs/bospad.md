# Bospad — het leerpad loopt door een bos

*Status: gebouwd. Ontwerp en bouw door Claude Fable 5.1 (sessie
https://claude.ai/code/session_01US26EWBMQbFxSEE67fJCG7), na een keuze uit twee richtingen
op een mock: A "bosrand" (crème blijft, bos in de kantlijn) en B "bospad" (bosgrond, aarden
pad, houten bordje, seizoen per deel). Arjan koos B.*

## 1. Waarom

Het leerpad was een Duolingo-genre scherm: crème, gestippelde weg, munten. Het werkte, maar
het voelde als een app, niet als een plek. Een bos is een plek waar je *doorheen loopt* —
en lopen is precies wat de leerpad-metafoor nodig heeft: hoe verder je scrolt, hoe dieper
je in het bos bent.

## 2. De stijl

Papieren knipwerk, overdag. Vlakke vormen met twee tinten per vorm, geen gradients — dezelfde
taal als Frida en de speler-avatar, zodat er niets bij is geplakt uit een andere app. De
grond is lichte mos (`#DCE8C6`), geen diep groen: het contrast dat de dyslexievriendelijke
weergave nodig heeft blijft overeind, en het wordt geen nacht-level.

De teal, goud en oranje van de app blijven precies wat ze waren, zodat de *betekenis* van
een node (vergrendeld / actief / klaar) voor haar niet verandert — alleen de wereld eromheen.

## 3. De opzet

1. **De statbalk en de onderste navigatie blijven crème.** Een bladerdak hangt onder de
   statbalk: je kijkt vanuit de app het bos in. De rest van de app hoeft geen bos te worden.
2. **De gestippelde weg is een echt pad.** Dezelfde gemeten S-curve door de muntcentra
   (`buildTrackPath`), nu drie strokes: aarde (46px), het uitgesleten midden (34px) en
   kiezels erop (de oude stippellijn, 6px).
3. **Nodes blijven ronde tikdoelen**, zelfde maten, zelfde 3D-druk. Vergrendeld is een
   grijze steen; actief blijft teal; klaar blijft goud. Labels krijgen een crème naamplaatje
   zodat ze leesbaar zijn op groen.
4. **De unit-kaart is een houten wegwijzer** (met een paaltje eronder); de
   `m · s · k · r · t`-scheiding is een klein houten bordje aan een lijntje.
5. **Frida zit op een boomstam** naast de actieve node, waar ze al zat.
6. **Elk deel is een seizoen.** Deel 1 lente, deel 2 zomer, deel 3 herfst, deel 4 winter;
   deel 5 begint een nieuw jaar. Het seizoen is het zichtbare teken van voortgang.
7. **Geen extra beweging.** Niets in het bos animeert; wat er was (coinPop, Frida's lach)
   blijft, met dezelfde reduced-motion-varianten.

## 4. Als gebouwd

- **`components/Bos.tsx`** — de sprites (den, boom, struik, paddenstoel, gras, steen), de
  boomstam en het bladerdak. Inline SVG, geen `<use>`: elke fill is een class, en de
  `.bos`-regels in `theme.css` zetten die class om in een custom property van het seizoen.
  Dat houdt het buiten schaduwbomen (niets voor WebKit om over te twisten) en maakt een
  seizoen niets anders dan een andere set waardes.
- **Plaatsing**: 16 vaste plekken per unit (`SLOTS`), links en rechts van de muntenkolom,
  op een fractie van de sectiehoogte zodat een unit met vier en met vijf lessen hetzelfde
  bos krijgt, alleen uitgerekt. Een mulberry32 op de unit-index geeft per unit een klein
  beetje jitter en wisselt af en toe een grasje voor een steen — hetzelfde bos bij elke
  render, en geen twee units precies gelijk. De laagste plekken zijn vanaf de onderkant
  verankerd: `.path-section` knipt zijn overflow (de grote bomen lopen expres van de rand
  af), en een boom die vanaf de bovenkant net te laag uitkomt zou anders zijn kruin kwijt
  zijn.
- **Seizoenen**: `seasonOf(faseIndex)` in `data/path.ts`; het `<section>` per unit krijgt
  `data-season`, en `theme.css` definieert per seizoen `--bos-grond`, drie bladtinten,
  gras, twee kruintinten, aarde, kiezel, accent, lijn en tekstkleur. Hout, steen en het
  vergrendelde muntje zijn in elk seizoen gelijk.
- **Seizoensgrens**: elke sectie eindigt in een geschulpte rand in zijn eigen kleur
  (`section::after`, `z-index: 1` omdat de volgende sectie ook gepositioneerd is en later
  in de DOM komt).
- **`iconFill('locked')`** is nu `var(--bos-steen-icon)` (crème op steen) in plaats van
  `var(--muted)`.
- **Frida's boomstam** (`BosLog`) staat vóór Frida in de DOM en op `z-index: auto`, het
  enige stukje decor dat niet achter het pad wordt geduwd.

## 5. Bewust niet

Een donker bos (contrast, en de stemming voor een negenjarige), parallax, foto-texturen, en
een thema-schakelaar naast de `Aa`-knop — het uiterlijk is vervangen, niet vermenigvuldigd.
Vuurvliegjes rond de actieve node zijn een idee voor later, mét reduced-motion-variant.

## 6. Getest

- `ux-polish.spec.ts`: het pad heeft nog een gemeten `d` en zit nog op `z-index: -1`
  (bestaand), plus: de secties dragen de seizoenen in de goede volgorde, elke sectie heeft
  decor, decor laat pointer-events door, en het pad heeft drie strokes.
- Handmatig in Chromium op 390px en op de desktop-kaart (1280px): lente, zomer, herfst en
  winter, Frida op haar stam, de grote bomen die van de kaartrand aflopen, en de
  afgeronde hoeken van de kaart die dat overleven. Nog niet op haar eigen tablet.
