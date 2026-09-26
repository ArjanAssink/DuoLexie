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

## 7. Na de merge: het bos maakte het leerpad traag om te verschijnen

PR #20 was groen op zijn eigen CI-run, maar de run op `main` na de merge verloor zes keer op
rij (twee runs, drie pogingen elk) dezelfde iPad-test: `reward-celebration.spec.ts › after a
real round, a tap and then Verder leaves cleanly` — na Verder verscheen `.coin-item` niet
binnen de vijf seconden. De laatste `main`-run vóór de merge had nul failures, dus dit was
van het bos. Lokaal nagemeten in Chromium op iPad-formaat met CPU-throttling (de tijd tussen
de tik op Verder en de eerste zichtbare munt):

| | ×1 | ×8 |
|---|---|---|
| zonder bos (`f5198f8`) | 235 ms | 2,4 s |
| met bos, zoals gemerged | 455 ms | 4,3 s |
| met bos, na de fix hieronder | 280 ms | 2,2 s |

Twee oorzaken, allebei in de manier waarop het decor gerenderd werd, niet in het decor zelf:

1. **Alles tegelijk.** Zestien sprites × twintig-plus units werden bij het mounten in één
   keer gerenderd, terwijl er hooguit twee units in beeld zijn. Nu groeit het bos per unit
   pas aan als die sectie in de buurt van het scherm komt (`IntersectionObserver`, 600px
   marge, eenmalig — eens aangekleed blijft aangekleed). De munten wachten nergens op: een
   sectie zonder decor is een sectie op kale mos.
2. **Elke meting rendert opnieuw.** `UnitPath` meet zijn munten na iedere render (mount,
   elke ResizeObserver-tik) en zet daarbij state; `BosScenery` werd daardoor telkens opnieuw
   gereconcilieerd. Nu `memo`: de seed verandert nooit, dus het decor ook niet.

De e2e-test in `ux-polish.spec.ts` vraagt sindsdien decor bij de eerste sectie, en bij de
laatste nadat ernaartoe gescrold is, in plaats van bij allemaal tegelijk.

*Fix door Claude Fable 5.1, dezelfde sessie.*
