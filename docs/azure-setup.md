# Azure setup — stap voor stap

Alles hieronder past in de gratis tiers; totale maandkosten: **€0**.

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

## 2. Custom domain koppelen

1. SWA in de portal → **Custom domains** → *Add* → *Custom domain on other DNS*.
2. Vul je (sub)domein in, bijv. `lexie.jouwdomein.nl`.
3. Maak bij je DNS-provider een **CNAME**-record: `lexie` → `<naam>.azurestaticapps.net` (de hostname van de Overview-pagina).
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

## 4. Checklist

- [ ] SWA aangemaakt, deploy groen, app live op azurestaticapps.net
- [ ] Dubbele workflow opgeruimd
- [ ] Custom domain + CNAME, SSL actief
- [ ] (Phase 3) Cosmos free tier + containers + environment variables
