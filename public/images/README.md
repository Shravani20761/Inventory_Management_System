# Brand product images (quotation & invoice PDFs)

Place **one PNG per brand** (all models for that brand use the same file):

- `batteries/luminous-battery.png`, `batteries/exide-battery.png`, …
- `inverters/luminous-inverter.png`, `inverters/exide-inverter.png`, …

Optional defaults (unknown brand):

- `batteries/default-battery.png`
- `inverters/default-inverter.png`

Paths in code are `/images/batteries/...` and `/images/inverters/...` (served from this folder).

**Amaron:** use `amaron-battery.png` / `amaron-inverter.png` in this folder (replace with your artwork when ready)., restart the API if PDFs were cached in memory; no code change is required.
