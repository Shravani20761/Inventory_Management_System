# Brand product images (quotation, recommendation & invoice PDFs, Smart Quotation UI)

Resolution is centralized in `shared/productImages.js` (trim + uppercase matching).

## Brand PNGs (fallback when no model-specific asset matches)

Place one PNG per brand under:

- `batteries/exide-battery.png`, `luminous-battery.png`, `microtek-battery.png`, `livguard-battery.png`, `amaron-battery.png`
- `inverters/exide-inverter.png`, `luminous-inverter.png`, `microtek-inverter.png`, `livguard-inverter.png`, `amaron-inverter.png`

## Defaults (unknown brand)

- `batteries/default-battery.png`
- `inverters/default-inverter.png`

## Model-specific art

Exide (and similar) hero images can live under `/assets/exide-models/...` (see `MODEL_IMAGE_RULES_*` in `shared/productImages.js`).

## URLs

Code uses absolute-from-site-root paths such as `/images/batteries/...`. The React app wraps these with `publicAssetHref()` so `<img>` requests use the full origin (works after deployment). PDF generation embeds files from `public/` when possible.

Restart the API after replacing images if PDFs were cached in memory.
