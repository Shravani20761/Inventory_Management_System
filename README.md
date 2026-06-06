# BatteryPro — Smart Inventory & Quotation System

Rule-based battery/inverter quotation engine with React + Tailwind, Express, MongoDB, Puppeteer PDF, **Meta WhatsApp Cloud API**, and **Cloudinary** (invoices only).

## Features

- **Inventory** — products with Ah, VA, brands, stock, Excel import
- **Smart quotations** — flat type, backup hours, budget, preferred brand
- **3–6 dynamic options** from live inventory + rule engine
- **Quotation PDFs** — temporary files in `server/generated/` (auto-delete after 24h)
- **Invoice PDFs** — permanent storage on Cloudinary
- **WhatsApp** — Meta Cloud API for quotation & invoice delivery

## Run locally

```powershell
cd Inventory_management
$env:NODE_OPTIONS="--use-system-ca"
npm install
```

Copy `.env.example` → `.env` and set:

```env
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/batterypro
PORT=3001
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok-free.app
VITE_API_URL=/api

META_ACCESS_TOKEN=...
META_PHONE_NUMBER_ID=...
META_VERIFY_TOKEN=...

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

> **Quotations:** Meta must fetch PDFs from a **public HTTPS** URL. Use [ngrok](https://ngrok.com) and set `PUBLIC_BASE_URL` when testing locally.

```powershell
npm run dev
```

Open http://localhost:5173 — Tailwind UI with React Router. Classic UI: http://localhost:5173/classic

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/preview-quotation-options` | Preview recommendation options |
| POST | `/api/generate-quotation` | Quotation + temp PDF + Meta WhatsApp + DB |
| POST | `/api/generate-invoice` | Invoice + stock + Cloudinary + Meta WhatsApp |
| GET | `/api/webhooks/whatsapp` | Meta webhook verification |
| GET | `/api/vehicles/brands` | Autocomplete: distinct brands (`vehicleType`, optional `q`) |
| GET | `/api/vehicles/models` | Distinct models for a brand (`vehicleType`, `brand`, optional `q`) |
| GET | `/api/vehicles/fuels` | Four-wheeler: distinct fuels (`vehicleType`, `brand`, `model`) |
| GET | `/api/vehicles/compatible-batteries` | Resolve `batteryInventory` rows by vehicle + fuel |

Car / bike **quotations** use MongoDB collections **`vehicleCompatibility`** (brand/model/fuel → `compatibleBatteryCodes`) and **`batteryInventory`** (SKU stock/pricing by `batteryCode`). Vehicle labels are never read from battery rows.

Run `npm run seed:vehicle-batteries` for a minimal Hyundai Creta + Honda Activa demo (requires `MONGODB_URI`).

**Vehicle UI catalog:** dependent brand/model dropdowns load from `src/data/vehicleBrandModels.json` (cars: brand → model → fuels; bikes: brand → models). Edit that file to extend the list without code changes.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for service layout.

## Deploy on Hostinger

Use Hostinger Node.js hosting or VPS, not static-only hosting. The Express server serves the React `dist/` build in production and provides the API/PDF/WhatsApp backend.

Follow [docs/HOSTINGER_DEPLOYMENT.md](./docs/HOSTINGER_DEPLOYMENT.md).

## Services

```
server/services/
  recommendationService.js   # Rule-based combos
  pdfService.js              # Puppeteer PDFs
  quotationStorageService.js # Temp files + 24h cleanup
  cloudinaryService.js       # Invoice uploads only
  whatsappService.js         # Meta Cloud API (Axios)
```
