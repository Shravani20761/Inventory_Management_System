# Smart Battery Inventory — Architecture

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Tailwind, React Router, Axios |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) or local JSON fallback |
| Quotation PDFs | Puppeteer (HTML/CSS) → `server/generated/` (24h TTL); combo rows use **Cloudinary image URLs** on each SKU |
| Invoice PDFs | Puppeteer → **Cloudinary** (permanent) |
| WhatsApp | **Meta Cloud API** (Axios) |

## Services (`server/services/`)

| Service | Role |
|---------|------|
| `recommendationService.js` | Rule-based combo options (Budget / Recommended / Premium / …) |
| `pdfService.js` | Puppeteer PDF for quotations & invoices |
| `quotationStorageService.js` | Temp files, public URLs, 24h cleanup cron |
| `cloudinaryService.js` | Permanent invoice PDF upload; **`uploadInventoryProductImage`** for combo inverter/battery/logo images |
| `whatsappService.js` | Meta WhatsApp document + text messages |
| `quotationService.js` | Full quotation flow orchestration |
| `invoiceService.js` | Invoice + stock + Cloudinary + WhatsApp |

## Quotation flow

```
POST /api/generate-quotation (combo)
  → previewQuotationByKind (combo)
  → previewComboFromComboInventory / appliance path
  → dynamicInvBatRecommendationService: load watts (applianceConfig) → VA / Ah sizing
  → MongoDB: inverter_inventory + battery_inventory (or legacy inverters + home_inverter_batteries if catalogs empty)
  → pair candidates + recommendation_rules boosts → suggestedOptions
  → pdfService → quotation-{id}.pdf in server/generated/
  → quotationStorageService → PUBLIC_BASE_URL/generated/...
  → whatsappService (Meta document message)
  → MongoDB quotation record (expiresAt, quotationPublicUrl)
```

Legacy **`inv_battery_combos`** rows are no longer used for combo quotation preview or PDF option generation; they may remain for imports or reporting until removed.

## Invoice flow

```
POST /api/generate-invoice
  → deduct stock
  → pdfService (temp file)
  → cloudinaryService (permanent URL)
  → whatsappService (Meta, Cloudinary link)
  → MongoDB invoice (cloudinaryInvoiceUrl, invoiceSent)
```

## Environment

See `.env.example` — **no Twilio**. Required for production WhatsApp:

- `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_VERIFY_TOKEN`
- `PUBLIC_BASE_URL` (HTTPS, e.g. ngrok) for quotation PDFs
- `CLOUDINARY_*` for invoices and **combo inventory image uploads** (`POST /api/inv-combos/:id/upload-image`, multipart: `file`, `imageField` = `inverterImage` | `batteryImage` | `brandLogo`)
- Optional `BATTERYMELA_LOGO_URL` — default letterhead logo in combo quotation PDFs when row has no `brandLogo`

## Static files

```js
app.use("/generated", express.static(GENERATED_DIR));
```

Only `quotation-*.pdf` files are auto-deleted after 24 hours.

## Inventory import (single canonical schema)

Excel and API payloads may use **human headers** (`INVERTER MODEL`, `COMBO ID`) or **camelCase** (`inverterModel`, `comboId`). Before any write to MongoDB, the API normalizes rows to **one camelCase shape** shared by the shop, quotations, and recommendations:

| Layer | Role |
|-------|------|
| `src/constants/comboInventoryImport.js` | `COMBO_COLUMN_MAP_ORDERED` — header aliases → keys for **client-side** Excel parsing |
| `server/utils/inventoryImportNormalize.js` | `normalizeComboImportRow` (and inverter / home variants) — **server-side** remap of any stray keys → same keys before `mergeCategoryRowsFromParsed` |
| `server/services/categoryInventoryService.js` | `rowToInvComboDoc` — maps normalized row → **`inv_battery_combos`** Mongoose fields only (no raw Excel keys stored) |

**Dynamic combo catalogs** (no stored permutations): `inverter_inventory`, `battery_inventory`, optional `recommendation_rules` — see `server/services/dynamicInvBatRecommendationService.js` and `npm run seed:dynamic-inv-bat`.

**Inv + Battery canonical fields** (subset): `productCategory` (always `Inverter+Battery` on save), `comboId`, `brand`, `inverterModel`, `batteryModel`, `inverterVA`, `capacityAh` (filled from `capacityAh` / `batteryAH` / `ah`, `productCapacity` text, or Ah in `batteryModel`), `batteryType`, `warranty`, `batteryWeight`, `scrapRate`, `inverterPrice`, `batteryPrice`, `finalPriceWithOldBattery`, `finalPriceWithoutOldBattery`, `backupHours`, `suitableFor`, `quantity`, `productCapacity`, `notes`, **`inverterImage`**, **`batteryImage`**, **`brandLogo`** (HTTPS URLs, often from Cloudinary), …

## Vehicle ↔ battery mapping (`vehicleCompatibility`)

- Rows match **either** legacy `brand` / `model` **or** camelCase `vehicleBrand` / `vehicleModel` (same trim + fuel rules for four-wheelers).
- **`compatibleBatteryCodes`**: must exist on `batteryInventory` rows (`batteryCode`).
- **`compatibleBatteryModels`**: free-text hints (e.g. `"Amaron 55Ah"`) resolved against in-stock `batteryInventory` by code / brand / model text.
- Example seed: `npm run seed:vehicle-compatibility` (requires `MONGODB_URI`).

Re-upload combo sheets after schema changes so existing Mongo documents pick up corrected fields.
