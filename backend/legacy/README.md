# Legacy prototype (do not deploy)

This folder is the old **CommonJS** Battery Inventory API that lived at the repo root as `/server`.

It is **not** used by the live app. The production API is the ESM code in `backend/` (`index.js`, `models/`, `routes/`, `services/`).

## Why it is archived

| Legacy file | Live equivalent |
|-------------|-----------------|
| `models/Invoice.js` | `../models/Invoice.js` (richer schema, ESM) |
| `models/Product.js` | `../models/Product.js` |
| `models/Quotation.js` | `../models/Quotation.js` |
| `routes/*Routes.js` | `../routes/invoices.js`, `products.js`, `quotations.js` |
| `services/pdfService.js` | `../services/pdfService.js` |
| `services/whatsappService.js` | `../services/whatsappService.js` |
| `server.js` | `../index.js` |

Schemas and module systems differ (`require` vs `import`). Wiring this folder would break Hostinger / Mongo collections.

Keep for reference only. Safe to delete once you no longer need the prototype.
