# Inverter + Battery inventory (sheet layout)

## Combo quotations (single row = single option)

**Combo-type quotations** use only **`products`** rows whose **TYPE** is **Inverter+Battery** (or equivalent, e.g. `inverter+battery`). Each matched row becomes **one** quotation option. **All** inverter fields, battery fields, and combo prices are read from **that same row** — the app does **not** pair separate inverter SKUs with separate battery SKUs.

Required behaviour for a row to be used:

- `type` / `category` indicates inverter+battery combo (see app classifier).
- `quantity` > 0.
- At least one of: `inverterModel`, `batteryModel`, or `modelName` (SKU label).
- VA and/or Ah must be derivable from `inverterVA` / `capacityAh` / `productCapacity` / model text (same parsing as inventory).

Useful columns on the **same** Product document:

| Use | Typical fields |
|-----|------------------|
| Inverter | `inverterModel`, `inverterVA` or VA in `productCapacity`, `inverterPrice`, `warranty`, `imageUrl` |
| Battery | `batteryModel`, `capacityAh` / Ah in `productCapacity`, `batteryType`, `batteryPrice`, `warranty`, `imageUrl` |
| Combo totals | `newRateWithOB`, `newRateWithoutOB`, `sellingRate` |
| Backup / fit | `backupHours`, `backupSupport`, `suitableFor` |

If no combo rows match room size / load / backup / optional brand filters, the API returns a **400** with guidance to add or adjust combo rows.

## Optional separate Mongo catalogs

`inverterProducts` and `homeInverterBatteries` may still exist for other workflows; **combo quotation preview does not join them**.

## Legacy “Inv + Battery” Excel tab

| Column | Notes |
|--------|--------|
| Sr.No. | Optional |
| Model Number | Combo code or “Inverter model + Battery model” in one cell |
| Product Capacity / Spec | Free text, e.g. `1100 VA \| 150 Ah \| ~4 hr` — VA and Ah are parsed |
| TYPE | Set to **Inverter+Battery** |
| Dp + GST, MRP, WITH OB, W/O B, Qty | Same as price sheet |

If you share a sample Excel header row, we can map extra columns in the parser.
