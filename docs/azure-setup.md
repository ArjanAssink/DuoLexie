# Azure setup — stap voor stap

Alles hieronder past in de gratis tiers, op e-mail na (centen per maand); totale maandkosten: **≈ €0**.

## 1. Static Web App aanmaken (Phase 0)

1. Ga naar [portal.azure.com](https://portal.azure.com) → **Create a resource** → zoek **Static Web App** → *Create*.
2. Vul in:
   | Veld | Waarde |
   |---|---|
   | Subscription | jouw subscription |
   | Resource group | *Create new* → `rg-duolexie` |
   | Name | `swa-duolexie` |
   | Plan type | **Free** |
   | Region (managed functions) | **West Europe** |
   | Source | **GitHub** |
   | Organization / Repository / Branch | `ArjanAssink` / `DuoLexie` / `main` |
   | Build presets | **Custom** |
   | App location | `app` |
   | Api location | *(leeg laten)* |
   | Output location | `dist` |
3. *Review + create* → *Create*.

**Let op:** Azure commit zelf een workflow-bestand (`azure-static-web-apps-<naam>.yml`) in het repo én zet het deployment-token als repo-secret. Dit repo heeft al een eigen workflow. Na het aanmaken:

```bash
git pull                                    # haal Azure's gegenereerde workflow op
ls .github/workflows/                       # er staan er nu twee
```

Kies één van beide (het makkelijkst): verwijder **onze** `azure-static-web-apps.yml` en houd de door Azure gegenereerde (die verwijst naar het juiste secret), óf verwijder de gegenereerde en hernoem in de onze het secret naar wat Azure heeft aangemaakt (te zien onder GitHub → repo → Settings → Secrets and variables → Actions, iets als `AZURE_STATIC_WEB_APPS_API_TOKEN_<RANDOM>`).

4. Controleer: GitHub → *Actions* tab → de deploy-run wordt groen → de app staat live op de `https://<naam>.azurestaticapps.net` URL (te vinden op de SWA *Overview* pagina).

## 2. Custom domain koppelen — ✅ gedaan, live op https://duolexie.assink.io

1. SWA in de portal → **Custom domains** → *Add* → *Custom domain on other DNS*.
2. Vul je (sub)domein in — hier `duolexie.assink.io`.
3. Maak bij je DNS-provider een **CNAME**-record: `duolexie` → `<naam>.azurestaticapps.net` (de hostname van de Overview-pagina).
4. Terug in de portal: *Validate* → *Add*. SSL-certificaat wordt automatisch en gratis geregeld (kan ~15 min duren).

## 3. Cosmos DB (pas nodig in Phase 3 — accounts & sync)

1. *Create a resource* → **Azure Cosmos DB** → API: **NoSQL**.
2. Vul in: resource group `rg-duolexie`, naam `cosmos-duolexie`, regio **West Europe**, Capacity mode: **Provisioned throughput**.
3. **Belangrijk:** zet **Apply Free Tier Discount: Apply** aan (kan maar op één account per subscription, en alleen bij aanmaken). Controleer dat de banner **1000 RU/s en 25 GB gratis** vermeldt.
4. Na aanmaken: *Data Explorer* → *New Database* → id `duolexie`, **Provision throughput** aan, **Manual**, `1000` RU/s (gedeeld over containers = gratis).
5. Maak twee containers in die database:
   - `auth` met partition key `/email`
   - `data` met partition key `/familyId`
6. Koppel aan de SWA: portal → SWA → **Environment variables** (of *Configuration*) → voeg toe:
   - `COSMOS_ENDPOINT` = URI van de Cosmos *Overview*-pagina
   - `COSMOS_KEY` = *Keys* → Primary key
   - `JWT_SECRET` = een lange random string, bijv. uitvoer van `openssl rand -base64 48`

## 4. E-mail versturen — Azure Communication Services (accounts, magic link)

Nodig voor [accounts-plan.md](accounts-plan.md): de inloglink/code naar ouders en de
aanmeld-notificatie naar jezelf. Twee resources, allebei in `rg-duolexie`.

### 4a. Email Communication Service (het verzenddomein)

1. *Create a resource* → zoek **Email Communication Services** → *Create*.
2. Vul in: resource group `rg-duolexie`, naam `ecs-duolexie`, **Data location: Europe**. *Review + create*.
3. Na aanmaken: linkermenu **Provision domains** → *Add domain* → **Azure domain**. Binnen een
   minuut heb je een domein als `<guid>.azurecomm.net` met afzender `DoNotReply@<guid>.azurecomm.net`.
   Dit werkt meteen en is genoeg om mee te bouwen en te testen.
4. **Later (stap S7 in het accounts-plan), eigen domein:** *Add domain* → **Custom domain** →
   `duolexie.assink.io`. Azure toont drie soorten DNS-records die je bij je DNS-provider
   zet: een **TXT** (verificatie), een **TXT** voor **SPF**, en twee **CNAME**'s voor
   **DKIM**. Daarna *Verify* per record. Onder **MailFrom addresses** kun je dan
   `noreply@duolexie.assink.io` toevoegen. Gebruik hetzelfde (sub)domein als de site — dat
   is wat de mail uit de spam houdt.

### 4b. Communication Service (de API-sleutel)

1. *Create a resource* → zoek **Communication Services** → *Create*.
2. Vul in: resource group `rg-duolexie`, naam `acs-duolexie`, **Data location: Europe**. *Review + create*.
3. Na aanmaken: linkermenu **Email → Domains** → *Connect domain* → kies subscription,
   resource group, `ecs-duolexie` en het domein uit 4a.
4. Linkermenu **Keys** → kopieer de **Connection string** (Primary). Dit is een geheim.

Kosten: ongeveer $0,00025 per mail plus een fractie per MB. Geen gratis tier, maar bij een
paar honderd mails per maand is dit centenwerk.

## 5. Application Insights (aanbevolen — logs van de API)

Managed Functions op een SWA hebben verder géén logboek. Zonder dit debug je "ik heb geen
mail gekregen" blind.

1. Portal → `swa-duolexie` → linkermenu **Application Insights** → *Yes* → *Create new*
   `appi-duolexie` (zelfde resource group, regio West Europe) → *Save*.
2. Logs bekijken: `appi-duolexie` → **Logs** → query `traces | order by timestamp desc`
   (alles wat de API met `context.log` schrijft) en `exceptions`.

Gratis tot 5 GB/maand; wij zitten daar mijlenver onder.

## 6. Environment variables voor accounts

Portal → `swa-duolexie` → **Environment variables** → *Production* → *Add*:

| Naam | Waarde |
|---|---|
| `ACS_CONNECTION_STRING` | connection string uit 4b |
| `MAIL_FROM` | `DoNotReply@<guid>.azurecomm.net` (later `noreply@duolexie.assink.io`) |
| `NOTIFY_EMAIL` | `duolexie@assink.io` — ontvangt de aanmeldingen én de goedkeurlinks |
| `APP_BASE_URL` | `https://duolexie.assink.io` (zonder slash op het eind) |
| `ADMIN_TOKEN_SECRET` | `openssl rand -base64 32` — ondertekent de goedkeurlinks |

`COSMOS_ENDPOINT`, `COSMOS_KEY` en `JWT_SECRET` staan er al. Gebruik voor
`ADMIN_TOKEN_SECRET` een **ander** geheim dan `JWT_SECRET`: één geheim per doel, zodat je er
één kunt roteren zonder iedereen uit te loggen. *Save* → de SWA start de Functions opnieuw;
controleer daarna `/api/health` (wordt uitgebreid met een `mail`-check).

**Lokaal:** dezelfde namen in `api/local.settings.json` (staat in `.gitignore`) onder
`"Values"`, plus `"MAIL_MODE": "console"` zodat de link en code in de terminal verschijnen in
plaats van verstuurd te worden:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "COSMOS_ENDPOINT": "https://cosmos-duolexie.documents.azure.com:443/",
    "COSMOS_KEY": "...",
    "JWT_SECRET": "...",
    "MAIL_MODE": "console",
    "MAIL_FROM": "DoNotReply@local",
    "NOTIFY_EMAIL": "duolexie@assink.io",
    "APP_BASE_URL": "http://localhost:5173",
    "ADMIN_TOKEN_SECRET": "..."
  }
}
```

## 7. Checklist

- [x] SWA aangemaakt, deploy groen, app live op azurestaticapps.net
- [x] Dubbele workflow opgeruimd (alleen `azure-static-web-apps-jolly-wave-019071410.yml` over)
- [x] Custom domain + CNAME, SSL actief — **https://duolexie.assink.io**
- [x] Cosmos free tier + containers + environment variables — *geverifieerd 2026-09-18 via `/api/health`: alles `ok`*
- [ ] TTL aanzetten op container `auth` (Data Explorer → `auth` → *Scale & Settings* → **Time to Live: On (no default)**) — inlogtokens ruimen zichzelf dan op
- [ ] Email Communication Service `ecs-duolexie` + Azure managed domain (§4a)
- [ ] Communication Service `acs-duolexie`, domein gekoppeld, connection string gekopieerd (§4b)
- [ ] Application Insights `appi-duolexie` gekoppeld aan de SWA (§5)
- [ ] Vijf nieuwe environment variables gezet, `/api/health` toont `mail: ok` (§6)
- [ ] (later, S7) Eigen verzenddomein geverifieerd: TXT + SPF + 2× DKIM, `MAIL_FROM` omgezet
