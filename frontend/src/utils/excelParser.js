import * as XLSX from "xlsx";
import { nextNumericInventoryId } from "./inventoryIds.js";
import { COMBO_COLUMN_MAP_ORDERED } from "../constants/comboInventoryImport.js";
import { INVERTER_COLUMN_MAP_ORDERED } from "../constants/inverterInventoryImport.js";
import { HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED } from "../constants/homeInverterBatteryImport.js";
import { TROLLEY_COLUMN_MAP_ORDERED } from "../constants/trolleyInventoryImport.js";
import { LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED } from "../constants/lithiumIonBatteryImport.js";
import {
  isHomeInverterBatterySection,
  isInverterBatterySection,
  isInverterOnlySection,
  isLithiumIonBatterySection,
  isTrolleySection,
} from "../constants/inventoryTypes.js";
import { canonicalAutomotiveBrand } from "../constants/inventoryCategories.js";

const COLUMN_MAP = {
  srNo: ["sr.no", "sr no", "srno", "s.no", "serial", "serial no", "serial number"],
  model: [
    "model",
    "model name",
    "model number",
    "model no",
    "model no.",
    "battery model",
    "product",
    "product name",
    "part number",
    "part no",
    "sku",
    "item code",
  ],
  brand: ["brand", "manufacturer", "make"],
  batteryType: ["battery type", "batt type", "cell type"],
  type: [
    "type",
    "category",
    "inverter+battery",
    "inverter battery",
    "inv+battery",
    "inv + battery",
    "inv+batt",
    "combo type",
    "combo sku",
  ],
  productCapacity: [
    "product capacity",
    "prod capacity",
    "capacity (",
    "spec",
    "capacity spec",
    "technical",
    "voltage",
    "product cap",
    "volt watt ah",
    "v/w/ah",
    "rating",
    "battery spec",
    "batt spec",
  ],
  ah: ["ah capacity", "amp hour", "amp-hour", "amperage", "ampere", "amps"],
  quantity: ["quantity", "qty", "stock", "units", "available"],
  weight: ["weight", "wt"],
  scrapRate: ["scrap rate", "scrap"],
  dpPlusGst: ["dp + gst", "dp+gst", "dpgst", "dp gst", "dealer price", "dp  gst", "dp gst", "dp", "distributor price"],
  cd: ["cd", "cash discount", "cash discount price", "cash price"],
  warranty: ["warranty", "guarantee", "warranty period", "warranty (months)", "warranty months", "warr"],
  mrp: ["mrp", "max retail", "m.r.p", "m.r.p."],
  newRateWithOB: [
    "new rate with ob",
    "rate with ob",
    "with old battery",
    "with ob",
    "new rate — with ob",
    "new rate - with ob",
  ],
  newRateWithoutOB: [
    "new rate w/o b",
    "new rate without",
    "without old battery",
    "without ob",
    "w/o ob",
    "w/o b",
    "no ob",
  ],
  purchaseRate: ["purchase rate", "purchase price", "buy rate", "buy price", "cost", "purchase"],
  sellRate: ["sell rate", "sell price", "selling price", "sale price"],
  supplier: ["supplier", "vendor", "distributor"],
  invoiceNo: ["invoice", "invoice no", "invoice number", "bill no", "bill number"],
  place: ["place", "location", "city"],
};

function normalizeHeader(h) {
  return String(h ?? "")
    .replace(/^\ufeff/, "")
    .replace(/\u00a0/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Normalize common Excel “pipe” variants so specs match. */
function normalizePipesForSpec(s) {
  return String(s ?? "")
    .replace(/\uFF5C/g, "|")
    .replace(/¦/g, "|")
    .replace(/\s*\|\s*/g, "|");
}

/** Values like 12V|36W|35 AH| (and close variants) → product capacity, not Ah. */
function looksLikePipeCapacitySpec(text) {
  const raw = normalizePipesForSpec(text).trim();
  if (!raw) return false;
  const t = normalizeHeader(raw);
  if (!t.includes("|") && !/\d+v.*\d+ah/i.test(t.replace(/\|/g, ""))) return false;
  if (/\d+\s*v\s*\|/i.test(t)) return true;
  if (/\|\s*\d+\s*w\s*\|/i.test(t)) return true;
  if (/\|\s*\d+\s*ah/i.test(t)) return true;
  if (/\d+v/.test(t) && /\d+ah/.test(t) && t.split("|").filter(Boolean).length >= 2) return true;
  if (/^\d+\s*v\s*\|\s*\d+\s*ah/i.test(t)) return true;
  return false;
}

/** Bike / Exide-style sheets: `4 Ah`, `12AH`, `6H`, `48 MONTHS` (no pipe spec). */
function looksLikeSimpleBikeCapacityText(text) {
  const t = cellString(text).trim();
  if (!t || t.length > 48) return false;
  if (/^\d+(\.\d+)?\s*ah\s*\)?$/i.test(t)) return true;
  if (/^\d+\s*ah$/i.test(t)) return true;
  if (/^\d+(\.\d+)?\s*h$/i.test(t) && !/^\d{1,2}:\d{2}/.test(t)) return true;
  if (/^\d+(\.\d+)?\s*months?$/i.test(t)) return true;
  return false;
}

/** Excel cell → display string (handles numbers, Date, Rich text). */
export function cellString(val) {
  if (val == null || val === "") return "";
  if (typeof val === "number" && Number.isFinite(val)) {
    try {
      if (val > 59e3 && val < 1e6 && typeof XLSX.SSF?.parse_date_code === "function") {
        const d = XLSX.SSF.parse_date_code(val);
        if (d?.y) {
          const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
          return dt.toISOString().slice(0, 10);
        }
      }
    } catch {
      /* not an Excel date serial */
    }
    return String(val);
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "object" && val != null && "w" in val && val.w != null) return normalizePipesForSpec(String(val.w).trim());
  /* Hyperlink / rich cells: prefer decoded text in `v` over String(cell) → "[object Object]". */
  if (typeof val === "object" && val != null && val.v != null && typeof val.v !== "object") {
    return normalizePipesForSpec(String(val.v).trim());
  }
  return normalizePipesForSpec(String(val).trim());
}

function findColumnKey(header, importType) {
  const h = normalizeHeader(header);
  if (!h) return null;

  if (looksLikePipeCapacitySpec(h)) return "productCapacity";

  if (isInverterBatterySection(importType)) {
    for (const { key, aliases } of COMBO_COLUMN_MAP_ORDERED) {
      for (const a of aliases) {
        if (!a) continue;
        if (h === a) return key;
        if (!h.includes(a)) continue;
        if (key === "newRateWithOB" && a === "with ob" && /without|w\/o/i.test(h)) continue;
        return key;
      }
    }
  }

  if (isHomeInverterBatterySection(importType)) {
    for (const { key, aliases } of HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED) {
      for (const a of aliases) {
        if (!a) continue;
        if (h === a) return key;
        if (a.length <= 3) continue;
        if (!h.includes(a)) continue;
        if (key === "newRateWithOB" && /without|w\/o|w\/o\s*old/i.test(h)) continue;
        return key;
      }
    }
  }

  if (isInverterOnlySection(importType)) {
    for (const { key, aliases } of INVERTER_COLUMN_MAP_ORDERED) {
      for (const a of aliases) {
        if (!a) continue;
        if (h === a) return key;
        if (a.length <= 3) continue;
        if (!h.includes(a)) continue;
        return key;
      }
    }
  }

  if (isTrolleySection(importType)) {
    for (const { key, aliases } of TROLLEY_COLUMN_MAP_ORDERED) {
      for (const a of aliases) {
        if (!a) continue;
        if (h === a) return key;
        if (a.length <= 3) continue;
        if (!h.includes(a)) continue;
        return key;
      }
    }
  }

  if (isLithiumIonBatterySection(importType)) {
    for (const { key, aliases } of LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED) {
      for (const a of aliases) {
        if (!a) continue;
        if (h === a) return key;
        if (a.length <= 3) continue;
        if (!h.includes(a)) continue;
        return key;
      }
    }
  }

  for (const a of COLUMN_MAP.newRateWithoutOB) {
    if (h === a || h.includes(a)) return "newRateWithoutOB";
  }
  for (const a of COLUMN_MAP.newRateWithOB) {
    if (!a) continue;
    if (h === a || h.includes(a)) {
      if (a === "with ob" && /without|w\/o/i.test(h)) continue;
      return "newRateWithOB";
    }
  }

  for (const [key, aliases] of Object.entries(COLUMN_MAP)) {
    if (key === "newRateWithOB" || key === "newRateWithoutOB") continue;
    for (const a of aliases) {
      if (!a) continue;
      if (h === a || h.includes(a)) return key;
    }
  }

  if (/\bmodel\b/.test(h) && !/\bmodel\s*(year|line)\b/.test(h)) return "model";

  if (h === "ah" || h === "a.h." || h === "(ah)" || h === "nom ah" || h === "nom. ah") return "ah";

  return null;
}

function parseNumber(val) {
  if (val == null || val === "") return 0;
  const n = Number(String(val).replace(/[,₹\s]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Cells like "1100 VA", "900va" (Excel text) — plain parseNumber yields NaN. */
function parseInverterVaCell(val) {
  const s = cellString(val).trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*va\b/i);
  if (m) return Number(m[1]);
  return parseNumber(s);
}

/** Cells like "4", "3.5 hrs", "4 Hours" — avoid treating "150 Ah" as hours. */
function parseBackupHoursCell(val) {
  const s = cellString(val).trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hours)\b/i);
  if (m) return Number(m[1]);
  return parseNumber(s);
}

function parseVaFromProductCapacity(cap) {
  const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*va\b/i);
  return m ? Number(m[1]) : 0;
}

/** e.g. "| ~4 hr", "4hrs", "4 hours" — not "150 Ah". */
function parseBackupHoursFromProductCapacity(cap) {
  const raw = String(cap ?? "");
  let m = raw.match(/(?:^|[|\s,])(~?\d+(?:\.\d+)?)\s*(?:hr|hrs|hours)\b/i);
  if (m) return Number(m[1].replace(/^~/, ""));
  m = raw.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hours)\b/i);
  if (m) return Number(m[1]);
  return 0;
}

function parseAhFromProductCapacity(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*AH/i);
  return m ? Number(m[1]) : 0;
}

/**
 * If productCapacity is empty or wrong, find a pipe-spec string in any mapped field
 * (Excel often puts 12V|36W|35 AH| in a column that didn’t match “Product Capacity”).
 */
function repairPipeSpecCapacityRow(row) {
  let cap = String(row.productCapacity ?? "").trim();
  if (cap && looksLikePipeCapacitySpec(cap)) return row;
  if (cap && looksLikeSimpleBikeCapacityText(cap)) return row;

  const next = { ...row };
  for (const [k, v] of Object.entries(row)) {
    if (k === "model") continue;
    const s = cellString(v).trim();
    if (!s || !looksLikePipeCapacitySpec(s)) continue;
    if (!cap || cap === s || !looksLikePipeCapacitySpec(cap)) {
      next.productCapacity = s;
      if (k === "ah") next.ah = "";
      if (k === "type") next.type = "Car";
      break;
    }
  }
  cap = String(next.productCapacity ?? "").trim();
  if (cap && looksLikeSimpleBikeCapacityText(cap)) return next;
  for (const [k, v] of Object.entries(next)) {
    if (k === "model") continue;
    const s = cellString(v).trim();
    if (!s || !looksLikeSimpleBikeCapacityText(s)) continue;
    next.productCapacity = s;
    if (k === "ah") next.ah = "";
    break;
  }
  return next;
}

/** Scan every cell in the physical row (handles unmapped columns). */
function attachInferredProductCapacityFromCells(item, extended) {
  let cap = String(item.productCapacity ?? "").trim();
  if (cap && (looksLikePipeCapacitySpec(cap) || looksLikeSimpleBikeCapacityText(cap))) return item;
  for (const c of extended) {
    const s = cellString(c).trim();
    if (s && looksLikePipeCapacitySpec(s)) {
      return { ...item, productCapacity: s };
    }
  }
  for (const c of extended) {
    const s = cellString(c).trim();
    if (s && looksLikeSimpleBikeCapacityText(s)) {
      return { ...item, productCapacity: s };
    }
  }
  return item;
}

/** Merge two header rows (handles “NEW RATE” + “WITH OB” on the next row). */
function mergeHeaderLabels(rowTop, rowBottom) {
  const len = Math.max(rowTop?.length || 0, rowBottom?.length || 0);
  const out = [];
  for (let j = 0; j < len; j++) {
    const a = cellString(rowTop?.[j]).trim();
    const b = cellString(rowBottom?.[j]).trim();
    if (a && b && a !== b) out[j] = `${a} ${b}`.replace(/\s+/g, " ").trim();
    else out[j] = a || b;
  }
  return out;
}

/** First mapping wins per logical key (avoids wrong column overwriting model). */
function buildColToKeyFromLabels(labels, importType) {
  const colToKey = {};
  const usedKeys = new Set();
  labels.forEach((label, j) => {
    const k = findColumnKey(label, importType);
    if (!k || usedKeys.has(k)) return;
    usedKeys.add(k);
    colToKey[j] = k;
  });
  return colToKey;
}

function countMappedKeys(colToKey) {
  return new Set(Object.values(colToKey)).size;
}

const COMBO_IDENTITY_KEYS = ["model", "comboId", "inverterModel", "batteryModel"];

function scoreHeaderLabels(labels, importType) {
  let score = 0;
  const seen = new Set();
  labels.forEach((lab) => {
    const k = findColumnKey(lab, importType);
    if (k && !seen.has(k)) {
      seen.add(k);
      let w = 1;
      if (k === "model" || k === "comboId") w = 6;
      else if (k === "inverterModel" || k === "batteryModel") w = 4;
      else if (isInverterOnlySection(importType) && (k === "mrp" || k === "dp" || k === "cd")) w = 4;
      else if (isTrolleySection(importType) && (k === "price" || k === "dp" || k === "cd")) w = 4;
      else if (isLithiumIonBatterySection(importType) && (k === "mrp" || k === "dp" || k === "cd")) w = 4;
      else if (isInverterOnlySection(importType) && (k === "productCapacity" || k === "inverterVA" || k === "brand")) w = 3;
      else if (isTrolleySection(importType) && (k === "productCapacity" || k === "compatibleVA" || k === "brand" || k === "model")) w = 3;
      else if (isLithiumIonBatterySection(importType) && (k === "mrpFinal" || k === "dp" || k === "cd")) w = 4;
      else if (isLithiumIonBatterySection(importType) && (k === "batteryModel" || k === "model")) w = 6;
      else if (isLithiumIonBatterySection(importType) && (k === "brand" || k === "batteryAH" || k === "voltage")) w = 3;
      else if (isHomeInverterBatterySection(importType) && (k === "batteryModel" || k === "model")) w = 6;
      else if (isHomeInverterBatterySection(importType) && k === "brand") w = 3;
      else if (isHomeInverterBatterySection(importType) && (k === "dp" || k === "mrpFinal" || k === "cd" || k === "newRateWithOB")) w = 4;
      else if (isHomeInverterBatterySection(importType) && k === "batteryAH") w = 2;
      score += w;
    }
  });
  return score;
}

function labelsHaveInventoryIdentity(labels, importType) {
  if (isInverterBatterySection(importType)) {
    return labels.some((lab) => {
      const k = findColumnKey(lab, importType);
      return k && COMBO_IDENTITY_KEYS.includes(k);
    });
  }
  if (isInverterOnlySection(importType)) {
    const set = new Set();
    for (const lab of labels) {
      const k = findColumnKey(lab, importType);
      if (k) set.add(k);
    }
    if (set.has("model")) return true;
    return (set.has("brand") || set.has("productCapacity")) && (set.has("mrp") || set.has("dp") || set.has("cd"));
  }
  if (isTrolleySection(importType)) {
    const set = new Set();
    for (const lab of labels) {
      const k = findColumnKey(lab, importType);
      if (k) set.add(k);
    }
    if (set.has("model")) return true;
    return (set.has("brand") || set.has("productCapacity")) && (set.has("price") || set.has("dp") || set.has("cd"));
  }
  if (isLithiumIonBatterySection(importType)) {
    const set = new Set();
    for (const lab of labels) {
      const k = findColumnKey(lab, importType);
      if (k) set.add(k);
    }
    if (set.has("batteryModel") || set.has("model")) return set.has("dp") && set.has("cd");
    return set.has("brand") && set.has("dp") && set.has("cd");
  }
  if (isHomeInverterBatterySection(importType)) {
    const set = new Set();
    for (const lab of labels) {
      const k = findColumnKey(lab, importType);
      if (k) set.add(k);
    }
    if (set.has("batteryModel") || set.has("model")) return true;
    return set.has("brand") && (set.has("dp") || set.has("newRateWithOB") || set.has("mrpFinal"));
  }
  return labels.some((lab) => findColumnKey(lab, importType) === "model");
}

/** Pick best header row: combo sheets need Combo ID / model / inverter or battery model; others need “model”. */
function findBestHeaderRowIndex(aoa, importType) {
  const maxScan =
    isInverterBatterySection(importType) ||
    isInverterOnlySection(importType) ||
    isHomeInverterBatterySection(importType) ||
    isTrolleySection(importType) ||
    isLithiumIonBatterySection(importType)
      ? 60
      : 30;
  let bestR = -1;
  let bestScore = -1;
  for (let r = 0; r < Math.min(maxScan, aoa.length); r++) {
    const row = aoa[r] || [];
    const labels = row.map((c) => cellString(c));
    if (!labelsHaveInventoryIdentity(labels, importType)) continue;
    const s = scoreHeaderLabels(labels, importType);
    if (s > bestScore) {
      bestScore = s;
      bestR = r;
    }
  }
  return bestR;
}

/** If row r+1 looks like a sub-header (not mostly numeric), merge with r for column titles.
 *  Combo sheets often have a first data row of short text; never treat that as a sub-header row. */
function shouldMergeSubHeaderRow(nextRow, importType) {
  if (!nextRow || !nextRow.length) return false;
  const cells = nextRow.map(cellString).map((s) => s.trim()).filter(Boolean);
  if (cells.length < 2) return false;
  let numericish = 0;
  for (const s of cells) {
    if (/^[\d.,\s₹-]+$/.test(s) && parseNumber(s) !== 0) numericish++;
  }
  if (numericish / cells.length > 0.45) return false;
  const joined = cells.join(" ").toLowerCase();
  if (/(with\s*ob|w\/?o\s*b|without\s*ob|new\s*rate|scrap|dp|gst|mrp)/i.test(joined)) return true;
  if (
    isInverterBatterySection(importType) ||
    isInverterOnlySection(importType) ||
    isHomeInverterBatterySection(importType)
  )
    return false;
  if (cells.length >= 3 && cells.every((s) => s.length <= 22)) return true;
  return false;
}

function maxDataRowWidth(aoa, dataStart, scan = 100) {
  let w = 0;
  const end = Math.min(aoa.length, dataStart + scan);
  for (let r = dataStart; r < end; r++) {
    w = Math.max(w, (aoa[r] || []).length);
  }
  return w;
}

function findColumnIndexForKey(colToKey, key) {
  for (const [jStr, k] of Object.entries(colToKey)) {
    if (k === key) return Number(jStr);
  }
  return -1;
}

function rowIdentityDisplayValue(item, extended, identityColIndex, importType) {
  if (!isInverterBatterySection(importType)) {
    if (identityColIndex >= 0) return cellString(extended[identityColIndex]).trim();
    if (isHomeInverterBatterySection(importType)) {
      const bm = cellString(item.batteryModel).trim();
      if (bm) return bm;
    }
    if (isLithiumIonBatterySection(importType)) {
      const bm = cellString(item.batteryModel).trim();
      if (bm) return bm;
    }
    return cellString(item.model).trim();
  }
  const fromCol = identityColIndex >= 0 ? cellString(extended[identityColIndex]).trim() : "";
  if (fromCol) return fromCol;
  const cid = cellString(item.comboId).trim();
  if (cid) return cid;
  const inv = cellString(item.inverterModel).trim();
  const bat = cellString(item.batteryModel).trim();
  if (inv || bat) return [inv, bat].filter(Boolean).join(" + ");
  return cellString(item.model).trim();
}

function findPrimaryIdentityColumnIndex(colToKey, importType) {
  if (isInverterBatterySection(importType)) {
    for (const key of COMBO_IDENTITY_KEYS) {
      const j = findColumnIndexForKey(colToKey, key);
      if (j >= 0) return j;
    }
    return -1;
  }
  if (isHomeInverterBatterySection(importType)) {
    const bm = findColumnIndexForKey(colToKey, "batteryModel");
    if (bm >= 0) return bm;
    return findModelColumnIndex(colToKey);
  }
  if (isLithiumIonBatterySection(importType)) {
    const bm = findColumnIndexForKey(colToKey, "batteryModel");
    if (bm >= 0) return bm;
    return findModelColumnIndex(colToKey);
  }
  return findModelColumnIndex(colToKey);
}

function extractDataRows(aoa, dataStart, colToKey, identityColIndex, importType) {
  const rows = [];
  const maxR = aoa.length;
  const mappedMax = Object.keys(colToKey).length ? Math.max(...Object.keys(colToKey).map(Number)) + 1 : 0;
  const dataWidth = maxDataRowWidth(aoa, dataStart);
  const maxJ = Math.max(mappedMax, dataWidth, 32);
  const srJ = findColumnIndexForKey(colToKey, "srNo");
  const homeSheet = isHomeInverterBatterySection(importType) || isLithiumIonBatterySection(importType);
  let lastBatteryModel = "";
  let lastBrand = "";

  for (let r = dataStart; r < maxR; r++) {
    const arr = aoa[r] || [];
    const extended = [...arr];
    while (extended.length < maxJ) extended.push("");

    if (srJ >= 0) {
      const sr = cellString(extended[srJ]).trim();
      if (/^(add|total|subtotal|na|n\/a|--)$/i.test(sr)) continue;
    }

    const item = {};
    Object.entries(colToKey).forEach(([jStr, key]) => {
      const j = Number(jStr);
      item[key] = extended[j] ?? "";
    });

    const cleaned = {};
    Object.entries(item).forEach(([k, v]) => {
      cleaned[k] = typeof v === "string" ? v : cellString(v);
    });

    const brandRaw = cellString(cleaned.brand).trim();
    if (brandRaw) lastBrand = brandRaw;
    else if (lastBrand) cleaned.brand = lastBrand;

    if (homeSheet) {
      const modelRaw = cellString(cleaned.batteryModel || cleaned.model).trim();
      if (modelRaw) lastBatteryModel = modelRaw;
      else if (lastBatteryModel) {
        cleaned.batteryModel = lastBatteryModel;
        cleaned.model = lastBatteryModel;
      }
    }

    let modelVal = rowIdentityDisplayValue(cleaned, extended, identityColIndex, importType);
    if (homeSheet && !modelVal) {
      const sr = cellString(cleaned.srNo).trim();
      const brand = cellString(cleaned.brand).trim();
      const ah = parseNumber(cleaned.batteryAH ?? cleaned.ah);
      if (sr && brand) modelVal = `${brand}-${sr}${ah ? `-${ah}Ah` : ""}`;
      else if (sr) modelVal = `SR-${sr}`;
      else if (brand && ah) modelVal = `${brand}-${ah}Ah`;
    }
    if (!modelVal) continue;
    if (/^(model|type|sr\.?no|serial)/i.test(modelVal) && modelVal.length < 25) continue;

    cleaned.model = modelVal;
    const withCap = attachInferredProductCapacityFromCells(cleaned, extended);
    rows.push(withCap);
  }
  return rows;
}

function findModelColumnIndex(colToKey) {
  for (const [jStr, key] of Object.entries(colToKey)) {
    if (key === "model") return Number(jStr);
  }
  return -1;
}

/** First column index strictly after `fromJ` that is already mapped (e.g. weight). */
function firstMappedColumnAfter(colToKey, fromJ) {
  let min = Infinity;
  for (const jStr of Object.keys(colToKey)) {
    const j = Number(jStr);
    if (j > fromJ) min = Math.min(min, j);
  }
  return min === Infinity ? fromJ + 8 : min;
}

/**
 * Bike price sheets often leave the Ah column header blank (Model | [blank] | Weight …).
 * Map that unnamed column to productCapacity when it sits between model and the next mapped column.
 */
function inferProductCapacityColumnIfUnlabeled(colToKey, labels, importType) {
  if (Object.values(colToKey).includes("productCapacity")) return colToKey;
  let modelJ = findModelColumnIndex(colToKey);
  if (modelJ < 0 && isInverterBatterySection(importType)) {
    const cj = findColumnIndexForKey(colToKey, "comboId");
    const ij = findColumnIndexForKey(colToKey, "inverterModel");
    const bj = findColumnIndexForKey(colToKey, "batteryModel");
    modelJ = cj >= 0 ? cj : ij >= 0 ? ij : bj;
  }
  if (modelJ < 0 && isHomeInverterBatterySection(importType)) {
    modelJ = findColumnIndexForKey(colToKey, "batteryModel");
  }
  if (modelJ < 0) return colToKey;
  const wj = findColumnIndexForKey(colToKey, "weight");
  const sj = findColumnIndexForKey(colToKey, "scrapRate");
  const dj = findColumnIndexForKey(colToKey, "dpPlusGst");
  let upper = -1;
  if (wj > modelJ) upper = wj;
  else if (sj > modelJ) upper = sj;
  else if (dj > modelJ) upper = dj;
  if (upper <= modelJ && isInverterOnlySection(importType)) {
    const candidates = [
      findColumnIndexForKey(colToKey, "warranty"),
      findColumnIndexForKey(colToKey, "productCapacity"),
      findColumnIndexForKey(colToKey, "mrp"),
      findColumnIndexForKey(colToKey, "amazonPrice"),
    ].filter((j) => j > modelJ);
    if (candidates.length) upper = Math.min(...candidates);
  }
  if (upper <= modelJ) upper = firstMappedColumnAfter(colToKey, modelJ);
  const next = { ...colToKey };
  for (let j = modelJ + 1; j < upper; j++) {
    if (next[j]) continue;
    const lab = cellString(labels[j] ?? "").trim();
    if (normalizeHeader(lab)) continue;
    next[j] = "productCapacity";
    break;
  }
  return next;
}

/** @param {string} [importType] When set (not "All"), every row gets this `type` (section segregation). */
function resolveBatteryType(item, inferredBike, importType) {
  const forced = String(importType ?? "").trim();
  if (forced && forced.toLowerCase() !== "all") return forced;
  const fromSheet = String(item.type || "").trim();
  if (fromSheet) return fromSheet;
  if (inferredBike) return "Bike";
  return "Car";
}

/**
 * @param {File|Blob} file
 * @param {{ importType?: string }} [options] Pass the active Inventory section (e.g. "Bike") so uploads are tagged; omit or "All" to use sheet TYPE / heuristics.
 */
export async function parseBatteryExcelFile(file, options = {}) {
  const importType = options.importType;
  if (!file || typeof file.arrayBuffer !== "function") {
    return { batteries: [], errors: ["No file selected or this browser cannot read files."] };
  }
  if (file.size === 0) {
    return { batteries: [], errors: ["The file is empty (0 bytes)."] };
  }

  let data;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch (e) {
    return { batteries: [], errors: [e?.message || "Unable to read the file."] };
  }

  try {
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const names = workbook.SheetNames || [];
    const fileName = (file && file.name) || "";

        /** Pick the worksheet whose header row scores best (fixes data on Sheet2+). */
        let bestPick = { sheetName: names[0] || "", aoa: [], h: -1, score: -1 };
        for (const sheetName of names) {
          const sh = workbook.Sheets[sheetName];
          if (!sh) continue;
          const aoaPart = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "", raw: false });
          if (!aoaPart.length) continue;
          const hPart = findBestHeaderRowIndex(aoaPart, importType);
          if (hPart < 0) continue;
          const labelsPart = (aoaPart[hPart] || []).map((c) => cellString(c));
          const sPart = scoreHeaderLabels(labelsPart, importType);
          if (sPart > bestPick.score) {
            bestPick = { sheetName, aoa: aoaPart, h: hPart, score: sPart };
          }
        }

        const sheet =
          bestPick.h >= 0 ? workbook.Sheets[bestPick.sheetName] : workbook.Sheets[names[0]];
        let aoa =
          bestPick.h >= 0
            ? bestPick.aoa
            : names.length
              ? XLSX.utils.sheet_to_json(workbook.Sheets[names[0]], { header: 1, defval: "", raw: false })
              : [];

        if (!aoa.length) {
          return { batteries: [], errors: ["Excel workbook has no readable rows"] };
        }

        let dataRows = [];
        let mapping = {};
        let headerIdx = -1;
        let inferredBike = false;

        const h = bestPick.h >= 0 ? bestPick.h : findBestHeaderRowIndex(aoa, importType);
        if (h >= 0) {
          headerIdx = h;
          const row0 = aoa[h] || [];
          const labels0 = row0.map((c) => cellString(c));
          let effectiveLabels = labels0;
          let colToKey = buildColToKeyFromLabels(labels0, importType);
          let dataStart = h + 1;

          const nextRow = h + 1 < aoa.length ? aoa[h + 1] : null;
          if (nextRow && shouldMergeSubHeaderRow(nextRow, importType)) {
            const mergedLabels = mergeHeaderLabels(row0, nextRow);
            const colMerged = buildColToKeyFromLabels(mergedLabels, importType);
            const mergedJoin = mergedLabels.join(" ").toLowerCase();
            const betterKeys = countMappedKeys(colMerged) > countMappedKeys(colToKey);
            const hasSplitRate = /with\s*ob|w\/o\s*b|old\s*battery/i.test(mergedJoin);
            if (betterKeys || (hasSplitRate && countMappedKeys(colMerged) >= countMappedKeys(colToKey))) {
              colToKey = colMerged;
              dataStart = h + 2;
              effectiveLabels = mergedLabels;
            }
          }

          colToKey = inferProductCapacityColumnIfUnlabeled(colToKey, effectiveLabels, importType);

          const sheetName0 = bestPick.sheetName || names[0] || "";
          const bikeHint = `${sheetName0} ${fileName} ${effectiveLabels.join(" ")}`.toLowerCase();
          inferredBike = /\b(bike|two[\s-]*wheel|motorcycle|scooter|moped)\b/.test(bikeHint);

          const identityCol = findPrimaryIdentityColumnIndex(colToKey, importType);
          if (identityCol < 0) {
            return {
              batteries: [],
              errors: isInverterBatterySection(importType)
                ? [
                    "Could not map Combo ID, Model, Inverter Model, or Battery Model from the header row.",
                    "Use clear headers such as “Combo ID”, “Inverter Model”, “Battery Model”, or “Model Number”.",
                  ]
                : isInverterOnlySection(importType)
                  ? [
                      "Found a header row on a sheet but could not map an “Inverter Model Number” / Model column.",
                      "Use a clear header such as “Inverter Model Number”, “Model”, or “SKU”.",
                    ]
                  : isTrolleySection(importType)
                    ? [
                        "Found a header row but could not map a Trolley Model Number / Model column.",
                        "Use headers such as “Trolley Model Number”, “Brand”, “Compatible VA”, “DP”, “CD”, and “Price”.",
                      ]
                  : isLithiumIonBatterySection(importType)
                    ? [
                        "Could not map Lithium Ion Battery headers. Required: Battery Model Number (or Model), DP, and CD.",
                        "Use headers such as “Battery Model Number”, “Brand”, “Voltage (V)”, “Product Capacity (AH)”, “DP”, “CD”, and “MRP FINAL”.",
                      ]
                  : isHomeInverterBatterySection(importType)
                    ? [
                        "Could not map “Battery Model Number” (or Model) from the header row.",
                        "Use clear headers such as “Battery Model Number”, “Brand”, and “DP + GST”.",
                      ]
                    : [
                        "Found header-like text but could not map a Model / Model Number column after merge.",
                        "Try unmerging header cells or put “Model Number” in one clear cell.",
                      ],
            };
          }

          dataRows = extractDataRows(aoa, dataStart, colToKey, identityCol, importType);

          labels0.forEach((cell, j) => {
            const key = findColumnKey(cell, importType);
            if (key) mapping[cell || `__col${j}`] = key;
          });
        } else {
          const sheetName0 = names[0] || "";
          inferredBike = /\b(bike|two[\s-]*wheel|motorcycle|scooter|moped)\b/.test(
            `${sheetName0} ${fileName}`.toLowerCase(),
          );
          if (!sheet) {
            return { batteries: [], errors: ["Excel workbook has no readable worksheet."] };
          }
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
          if (!rows.length) {
            return { batteries: [], errors: ["Excel sheet is empty"] };
          }
          const rawHeaders = Object.keys(rows[0]);
          rawHeaders.forEach((rawKey) => {
            const key = findColumnKey(rawKey, importType);
            if (key) mapping[rawKey] = key;
          });
          dataRows = rows
            .map((row) => {
              const item = {};
              for (const [rawKey, key] of Object.entries(mapping)) {
                item[key] = cellString(row[rawKey]);
              }
              const synthetic = Object.values(row).map((v) => cellString(v));
              let withCap = attachInferredProductCapacityFromCells(item, synthetic);
              withCap = repairPipeSpecCapacityRow(withCap);
              const modelVal = rowIdentityDisplayValue(withCap, synthetic, -1, importType);
              return { ...withCap, model: modelVal };
            })
            .filter((row) => cellString(row.model).trim());
        }

        const mappedIdentityKeys = Object.values(mapping);
        const hasMappedIdentity = isInverterBatterySection(importType)
          ? mappedIdentityKeys.some((k) => COMBO_IDENTITY_KEYS.includes(k))
          : isInverterOnlySection(importType)
            ? mappedIdentityKeys.includes("model") ||
              (mappedIdentityKeys.includes("brand") &&
                (mappedIdentityKeys.includes("mrp") || mappedIdentityKeys.includes("dp") || mappedIdentityKeys.includes("cd")))
            : isTrolleySection(importType)
              ? mappedIdentityKeys.includes("model") ||
                (mappedIdentityKeys.includes("brand") &&
                  (mappedIdentityKeys.includes("price") || mappedIdentityKeys.includes("dp") || mappedIdentityKeys.includes("cd")))
            : isLithiumIonBatterySection(importType)
              ? (mappedIdentityKeys.includes("batteryModel") ||
                  mappedIdentityKeys.includes("model") ||
                  mappedIdentityKeys.includes("brand")) &&
                mappedIdentityKeys.includes("dp") &&
                mappedIdentityKeys.includes("cd")
            : isHomeInverterBatterySection(importType)
              ? mappedIdentityKeys.includes("batteryModel") ||
                mappedIdentityKeys.includes("model") ||
                (mappedIdentityKeys.includes("brand") &&
                  (mappedIdentityKeys.includes("dp") || mappedIdentityKeys.includes("newRateWithOB") || mappedIdentityKeys.includes("mrpFinal")))
              : mappedIdentityKeys.includes("model");

        if (headerIdx < 0 && !hasMappedIdentity) {
          const sample = (aoa[0] || []).slice(0, 10).map(cellString).join(" | ");
          return {
            batteries: [],
            errors: isInverterBatterySection(importType)
              ? [
                  "Could not find Combo ID / Model / Inverter Model / Battery Model in the first rows (object-style sheet).",
                  `Top of sheet (sample): "${sample || "(empty)"}"`,
                ]
              : isInverterOnlySection(importType)
                ? [
                    "Could not find a usable header row on any worksheet (need Model / Inverter Model Number, or Brand with MRP/DP+GST).",
                    `First sheet sample: "${sample || "(empty)"}" — if your table is on another tab, it is scanned automatically.`,
                  ]
                : isLithiumIonBatterySection(importType)
                  ? [
                      "Could not find Lithium Ion Battery headers (Battery Model Number + compulsory DP and CD columns).",
                      `Top of sheet (sample): "${sample || "(empty)"}"`,
                    ]
                  : isHomeInverterBatterySection(importType)
                    ? [
                        "Could not find Home Inverter Battery headers (Battery Model Number, or Brand with CD / DP / MRP FINAL).",
                        `Top of sheet (sample): "${sample || "(empty)"}"`,
                      ]
                    : [
                        "Could not find a Model / Model Number column in the first rows.",
                        `Top of sheet (sample): "${sample || "(empty)"}"`,
                      ],
          };
        }

        if (headerIdx >= 0 && !dataRows.length) {
          const row0 = (aoa[headerIdx] || []).map(cellString).join(" | ");
          return {
            batteries: [],
            errors: [
              "Header row was found but no data rows with a product identity were read.",
              isInverterBatterySection(importType)
                ? "Check Combo ID, Model, Inverter Model, or Battery Model cells under the correct columns."
                : isHomeInverterBatterySection(importType)
                  ? "Check Battery Model Number (and Brand / rates) cells directly under the header row."
                  : "Check that product codes are directly under the Model column, and that there is no extra blank row.",
              `Header sample: ${row0.slice(0, 200)}`,
            ],
          };
        }

        const batteries = [];
        const errors = [];
        let skipped = 0;
        const isHomeInv = isHomeInverterBatterySection(importType);
        const isLithiumIonSheet = isLithiumIonBatterySection(importType);
        dataRows.forEach((item, idx) => {
          item = repairPipeSpecCapacityRow(item);
          const modelRaw =
            isHomeInv || isLithiumIonSheet
              ? cellString(item.batteryModel || item.model).trim()
              : cellString(item.model).trim();
          if (!modelRaw) {
            skipped++;
            return;
          }
          const invPrice = parseNumber(item.inverterPrice);
          const battPrice = parseNumber(item.batteryPrice);
          const isTrolley = isTrolleySection(importType);
          const isLithiumIon = isLithiumIonSheet;
          const isInvOnlyInverter = isInverterOnlySection(importType);
          const isInvOnly = isInvOnlyInverter || isTrolley;
          const cd = parseNumber(item.cd) || 0;
          const dp = isHomeInv
            ? parseNumber(item.dp) || parseNumber(item.dpPlusGst) || parseNumber(item.purchaseRate) || 0
            : isInvOnlyInverter || isTrolley || isLithiumIon
              ? parseNumber(item.dp) || parseNumber(item.dpPlusGst) || parseNumber(item.purchaseRate) || 0
              : parseNumber(item.dpPlusGst) ||
                parseNumber(item.purchaseRate) ||
                (!isInvOnly ? invPrice + battPrice || 0 : 0);
          if (isLithiumIon && (!dp || !cd)) {
            errors.push(`Row ${idx + 2}: DP and CD are required for "${modelRaw}"`);
            skipped++;
            return;
          }
          const mrpFinalN =
            isHomeInv || isLithiumIon ? parseNumber(item.mrpFinal) || parseNumber(item.mrp) : 0;
          const mrpN = isHomeInv || isLithiumIon ? mrpFinalN : parseNumber(item.mrp);
          const ob = isInvOnly
            ? mrpN || parseNumber(item.newRateWithOB) || parseNumber(item.sellRate)
            : parseNumber(item.newRateWithOB) || parseNumber(item.sellRate);
          const wo = isInvOnly ? 0 : parseNumber(item.newRateWithoutOB);
          const ahFromCap = parseAhFromProductCapacity(String(item.productCapacity || ""));
          const batteryAHNum = parseNumber(item.batteryAH) || parseNumber(item.ah) || ahFromCap;
          let invVA = parseInverterVaCell(item.inverterVA);
          if (isTrolley) {
            const trolleyVa = parseInverterVaCell(item.compatibleVA);
            if (trolleyVa) invVA = trolleyVa;
          }
          const backupSup = String(item.backupSupport || "").trim();
          let bkHr = parseBackupHoursCell(item.backupHours) || parseBackupHoursCell(backupSup);
          let productCapacity = String(item.productCapacity || "").trim();
          const homeSys = String(item.homeSystemType || item.comboCategory || "").trim();
          if (!isInvOnly && !isHomeInv) {
            if ((!invVA || !bkHr) && productCapacity) {
              if (!invVA) invVA = parseVaFromProductCapacity(productCapacity);
              if (!bkHr) bkHr = parseBackupHoursFromProductCapacity(productCapacity);
            }
          } else if (!invVA && productCapacity && !isHomeInv) {
            invVA = parseVaFromProductCapacity(productCapacity);
          }
          if (!productCapacity && (invVA || batteryAHNum || bkHr) && !isHomeInv) {
            const parts = [];
            if (invVA) parts.push(`${invVA} VA`);
            if (batteryAHNum) parts.push(`${batteryAHNum} Ah`);
            if (bkHr) parts.push(`~${bkHr} hr`);
            productCapacity = parts.join(" | ");
          }
          if (isHomeInv && !productCapacity) {
            const parts = [];
            if (batteryAHNum) parts.push(`${batteryAHNum} Ah`);
            if (parts.length) productCapacity = parts.join(" · ");
          }

          const battModelStored = String(item.batteryModel || modelRaw).trim();
          const displayModel = isHomeInv ? battModelStored : modelRaw;
          const rawBrand = isTrolley
            ? String(item.brand || "").trim() || "Luminous"
            : String(item.brand || "").trim() || "Unknown";
          const forcedType = String(importType ?? "").trim();
          const brandOut =
            forcedType === "Car" || forcedType === "Bike" || forcedType === "Truck"
              ? canonicalAutomotiveBrand(rawBrand) || rawBrand
              : rawBrand;

          batteries.push({
            model: displayModel,
            comboId: String(item.comboId || "").trim(),
            brand: brandOut,
            type: resolveBatteryType(item, inferredBike, importType),
            productCapacity,
            cd: isHomeInv || isInvOnlyInverter || isTrolley || isLithiumIon || !isInvOnly ? cd : undefined,
            dp: isHomeInv || isInvOnlyInverter || isTrolley || isLithiumIon || !isInvOnly ? dp : undefined,
            mrpFinal: isHomeInv || isLithiumIon ? mrpFinalN || wo || ob : undefined,
            voltage: isLithiumIon ? parseNumber(item.voltage) : undefined,
            compatibleVA: isTrolley ? invVA : undefined,
            suitableBatteryType: isTrolley ? String(item.suitableBatteryType || item.description || "").trim() : undefined,
            description: isTrolley ? String(item.suitableBatteryType || item.description || "").trim() : undefined,
            price: isTrolley ? parseNumber(item.price) || parseNumber(item.mrp) : undefined,
            ah: batteryAHNum,
            batteryAH: batteryAHNum,
            homeSystemType: homeSys,
            inverterVA: invVA,
            batteryType: isLithiumIon
              ? String(item.batteryType || "Lithium Ion").trim()
              : String(item.batteryType || "").trim(),
            warranty: String(item.warranty || "").trim(),
            inverterModel: String(item.inverterModel || "").trim(),
            batteryModel: battModelStored,
            backupHours: bkHr,
            backupSupport: backupSup,
            suitableFor: String(item.suitableFor || "").trim(),
            comboCategory: isHomeInv ? homeSys : String(item.comboCategory || "").trim(),
            quantity: parseNumber(item.quantity) || 1,
            weight: parseNumber(item.batteryWeight ?? item.weight),
            batteryWeight: parseNumber(item.batteryWeight ?? item.weight),
            scrapRate: parseNumber(item.scrapRate),
            inverterPrice: invPrice,
            batteryPrice: battPrice,
            dpPlusGst: dp,
            mrp: parseNumber(item.mrp),
            newRateWithOB: ob,
            newRateWithoutOB: isInvOnly ? 0 : wo,
            finalPriceWithOldBattery: parseNumber(item.finalPriceWithOldBattery) || ob,
            finalPriceWithoutOldBattery: parseNumber(item.finalPriceWithoutOldBattery) || wo,
            purchaseRate: dp,
            sellRate: isInvOnly
              ? ob
              : isHomeInv || isLithiumIon
                ? ob || wo || mrpN || dp * 1.3
                : ob || mrpN || dp * 1.3,
            supplier: String(item.supplier || "").trim(),
            invoiceNo: String(item.invoiceNo || "").trim(),
            place: String(item.place || "").trim(),
            amazonPrice: parseNumber(item.amazonPrice),
            flipkartPrice: parseNumber(item.flipkartPrice),
            batteryBhaiPrice: parseNumber(item.batteryBhaiPrice),
            batteryBossPrice: parseNumber(item.batteryBossPrice),
            notes: String(item.notes || "").trim(),
          });
          if (!batteries[batteries.length - 1].purchaseRate && !batteries[batteries.length - 1].sellRate) {
            if (!isInvOnly || (!dp && !mrpN)) {
              errors.push(`Row ${idx + 2}: missing rates for "${modelRaw}"`);
            }
          }
        });
        if (skipped && !batteries.length) {
          errors.push(`${skipped} row(s) had no product identity (model / combo id / inverter+battery).`);
        }
        if (isHomeInv && batteries.length < dataRows.length) {
          errors.push(
            `Note: ${dataRows.length - batteries.length} home sheet row(s) were skipped (missing battery model / rates). Check merged Excel cells in the Battery Model Number column.`,
          );
        }
        return { batteries, errors, mappedColumns: mapping, parsedRowCount: dataRows.length };
  } catch (err) {
    return { batteries: [], errors: [err?.message || String(err) || "Excel parse failed"] };
  }
}

export function mergeBatteriesIntoInventory(inventory, batteries) {
  const merged = [...inventory];
  let nextId = nextNumericInventoryId(merged);
  batteries.forEach((row) => {
    const rowCombo = String(row.comboId || "").trim().toLowerCase();
    const rowBrand = String(row.brand || "").trim().toLowerCase();
    const rowModel = String(row.model || "").trim().toLowerCase();
    const existing = merged.find((b) => {
      const bc = String(b.comboId || "").trim().toLowerCase();
      if (rowCombo && bc && rowCombo === bc) return true;
      const bBrand = String(b.brand || "").trim().toLowerCase();
      const bModel = String(b.model || "").trim().toLowerCase();
      return bModel === rowModel && bBrand === rowBrand;
    });
    if (existing) {
      existing.quantity += row.quantity;
      if (row.purchaseRate) existing.purchaseRate = row.purchaseRate;
      if (row.sellRate) existing.sellRate = row.sellRate;
      if (row.dpPlusGst) existing.dpPlusGst = row.dpPlusGst;
      if (row.newRateWithOB) existing.newRateWithOB = row.newRateWithOB;
      if (row.newRateWithoutOB) existing.newRateWithoutOB = row.newRateWithoutOB;
      if (row.mrp) existing.mrp = row.mrp;
      if (row.productCapacity) existing.productCapacity = row.productCapacity;
      if (row.weight != null) existing.weight = row.weight;
      if (row.scrapRate != null) existing.scrapRate = row.scrapRate;
      if (row.cd != null) existing.cd = row.cd;
      if (row.cdPrice != null) existing.cdPrice = row.cdPrice;
      if (row.dp != null) existing.dp = row.dp;
      if (row.supplier) existing.supplier = row.supplier;
      if (row.invoiceNo) existing.invoiceNo = row.invoiceNo;
      if (row.place) existing.place = row.place;
      if (row.type) existing.type = row.type;
      if (row.comboId != null) existing.comboId = row.comboId;
      if (row.inverterModel != null) existing.inverterModel = row.inverterModel;
      if (row.batteryModel != null) existing.batteryModel = row.batteryModel;
      if (row.inverterVA != null) existing.inverterVA = row.inverterVA;
      if (row.batteryType != null) existing.batteryType = row.batteryType;
      if (row.warranty != null) existing.warranty = row.warranty;
      if (row.backupHours != null) existing.backupHours = row.backupHours;
      if (row.backupSupport != null) existing.backupSupport = row.backupSupport;
      if (row.suitableFor != null) existing.suitableFor = row.suitableFor;
      if (row.comboCategory != null) existing.comboCategory = row.comboCategory;
      if (row.inverterPrice != null) existing.inverterPrice = row.inverterPrice;
      if (row.batteryPrice != null) existing.batteryPrice = row.batteryPrice;
      if (row.amazonPrice != null) existing.amazonPrice = row.amazonPrice;
      if (row.flipkartPrice != null) existing.flipkartPrice = row.flipkartPrice;
      if (row.batteryBhaiPrice != null) existing.batteryBhaiPrice = row.batteryBhaiPrice;
      if (row.batteryBossPrice != null) existing.batteryBossPrice = row.batteryBossPrice;
      if (row.notes != null) existing.notes = row.notes;
      if (row.ah != null) existing.ah = row.ah;
    } else {
      merged.push({
        id: nextId++,
        model: row.model,
        comboId: row.comboId ?? "",
        brand: row.brand,
        type: row.type,
        productCapacity: row.productCapacity || "",
        ah: row.ah,
        inverterVA: row.inverterVA ?? 0,
        batteryType: row.batteryType ?? "",
        warranty: row.warranty ?? "",
        inverterModel: row.inverterModel ?? "",
        batteryModel: row.batteryModel ?? "",
        backupHours: row.backupHours ?? 0,
        backupSupport: row.backupSupport ?? "",
        suitableFor: row.suitableFor ?? "",
        comboCategory: row.comboCategory ?? "",
        inverterPrice: row.inverterPrice ?? 0,
        batteryPrice: row.batteryPrice ?? 0,
        weight: row.weight ?? 0,
        scrapRate: row.scrapRate ?? 0,
        dpPlusGst: row.dpPlusGst ?? row.purchaseRate ?? 0,
        mrp: row.mrp ?? 0,
        newRateWithOB: row.newRateWithOB ?? row.sellRate ?? 0,
        newRateWithoutOB: row.newRateWithoutOB ?? 0,
        purchaseRate: row.purchaseRate,
        sellRate: row.sellRate,
        quantity: row.quantity,
        invoiceNo: row.invoiceNo || "",
        supplier: row.supplier || "",
        place: row.place || "",
        amazonPrice: row.amazonPrice ?? 0,
        flipkartPrice: row.flipkartPrice ?? 0,
        batteryBhaiPrice: row.batteryBhaiPrice ?? 0,
        batteryBossPrice: row.batteryBossPrice ?? 0,
        notes: row.notes || "",
      });
    }
  });
  return merged;
}
