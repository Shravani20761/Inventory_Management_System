import * as XLSX from "xlsx";

const COLUMN_MAP = {
  model: ["model", "model name", "battery model", "product", "product name", "name"],
  brand: ["brand", "manufacturer", "make"],
  batteryType: ["type", "battery type", "product type"],
  type: ["category", "product category", "vehicle type"],
  modelType: ["model type", "modeltype"],
  ah: ["ah", "capacity", "ampere", "amp", "ah capacity"],
  quantity: ["quantity", "qty", "stock", "units", "available"],
  purchaseRate: ["purchase rate", "purchase price", "buy rate", "buy price", "cost", "purchase"],
  sellRate: ["sell rate", "sell price", "selling price", "mrp", "price", "sale price"],
  supplier: ["supplier", "vendor", "distributor"],
  invoiceNo: ["invoice", "invoice no", "invoice number", "bill no", "bill number"],
  place: ["place", "location", "city"],
};

function normalizeHeader(h) {
  return String(h ?? "").trim().toLowerCase();
}

function findColumnKey(header) {
  const h = normalizeHeader(header);
  if (h === "model type" || h === "modeltype") return "modelType";
  if (h === "type" || h === "product type" || h === "battery type") return "batteryType";
  for (const [key, aliases] of Object.entries(COLUMN_MAP)) {
    if (aliases.some((a) => h === a || (a !== "type" && a !== "model" && h.includes(a)))) return key;
  }
  return null;
}

function parseNumber(val) {
  if (val == null || val === "") return 0;
  const n = Number(String(val).replace(/[,₹]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function parseBatteryExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) {
    return { batteries: [], errors: ["Excel sheet is empty"] };
  }

  const headers = Object.keys(rows[0]);
  const mapping = {};
  headers.forEach((h) => {
    const key = findColumnKey(h);
    if (key) mapping[h] = key;
  });

  if (!Object.values(mapping).includes("model")) {
    return {
      batteries: [],
      errors: [
        "Could not find a Model column. Expected headers like: Model, Brand, Type, Ah, Quantity, Purchase Rate, Sell Rate",
      ],
    };
  }

  const batteries = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const item = {};
    for (const [header, key] of Object.entries(mapping)) {
      item[key] = row[header];
    }
    if (!item.model || String(item.model).trim() === "") return;

    const battery = {
      model: String(item.model).trim(),
      brand: String(item.brand || "").trim() || "Unknown",
      type: String(item.type || "").trim(),
      batteryType: String(item.batteryType || "").trim(),
      modelType: String(item.modelType || "").trim(),
      ah: parseNumber(item.ah),
      quantity: parseNumber(item.quantity) || 1,
      purchaseRate: parseNumber(item.purchaseRate),
      sellRate: parseNumber(item.sellRate),
      supplier: String(item.supplier || "").trim(),
      invoiceNo: String(item.invoiceNo || "").trim(),
      place: String(item.place || "").trim(),
    };

    if (!battery.purchaseRate && !battery.sellRate) {
      errors.push(`Row ${idx + 2}: missing purchase/sell rates for "${battery.model}"`);
    }

    batteries.push(battery);
  });

  return { batteries, errors, mappedColumns: mapping };
}
