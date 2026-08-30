/**
 * Maps arbitrary Excel / JSON keys onto the same camelCase field names used by parsers,
 * Mongo row builders, and quotation engines — never persist raw header strings as keys.
 */
import { COMBO_COLUMN_MAP_ORDERED } from "../shared/constants/comboInventoryImport.js";
import { INVERTER_COLUMN_MAP_ORDERED } from "../shared/constants/inverterInventoryImport.js";
import { TROLLEY_COLUMN_MAP_ORDERED } from "../shared/constants/trolleyInventoryImport.js";
import { LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED } from "../shared/constants/lithiumIonBatteryImport.js";
import { HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED } from "../shared/constants/homeInverterBatteryImport.js";

/** Normalize a header or loose key for synonym lookup (aligned with excelParser `normalizeHeader`, plus camelCase split for JSON keys). */
export function normalizeHeaderKey(raw) {
  const s = String(raw ?? "")
    .replace(/^\ufeff/, "")
    .replace(/\u00a0/g, " ")
    .replace(/_/g, " ")
    .trim();
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSynonymLookup(orderedList) {
  const map = new Map();
  const register = (aliasSource, canonicalKey) => {
    const n = normalizeHeaderKey(aliasSource);
    if (!n) return;
    if (!map.has(n)) map.set(n, canonicalKey);
  };
  for (const entry of orderedList) {
    const { key, aliases } = entry;
    register(key, key);
    for (const a of aliases || []) register(a, key);
  }
  return map;
}

const COMBO_LOOKUP = buildSynonymLookup(COMBO_COLUMN_MAP_ORDERED);
const INVERTER_LOOKUP = buildSynonymLookup(INVERTER_COLUMN_MAP_ORDERED);
const TROLLEY_LOOKUP = buildSynonymLookup(TROLLEY_COLUMN_MAP_ORDERED);
const LITHIUM_ION_LOOKUP = buildSynonymLookup(LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED);
const HOME_INV_LOOKUP = buildSynonymLookup(HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED);

function allowedKeysFromOrdered(orderedList) {
  return new Set(orderedList.map((e) => e.key));
}

function isEmptyish(v) {
  return v === undefined || v === null || v === "";
}

/**
 * @template T
 * @param {Record<string, T>} row
 * @param {typeof COMBO_COLUMN_MAP_ORDERED} ordered
 * @param {Map<string, string>} lookup
 */
function normalizeWithMap(row, ordered, lookup) {
  const allowed = allowedKeysFromOrdered(ordered);
  const out = {};
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    if (!isEmptyish(row[key])) out[key] = row[key];
  }
  for (const [rawKey, val] of Object.entries(row)) {
    if (isEmptyish(val)) continue;
    if (rawKey.startsWith("_")) {
      out[rawKey] = val;
      continue;
    }
    let canon = null;
    if (allowed.has(rawKey)) canon = rawKey;
    else canon = lookup.get(normalizeHeaderKey(rawKey));
    if (!canon || !allowed.has(canon)) continue;
    if (isEmptyish(out[canon])) out[canon] = val;
  }
  return out;
}

export function normalizeComboImportRow(row) {
  if (!row || typeof row !== "object") return {};
  return normalizeWithMap(row, COMBO_COLUMN_MAP_ORDERED, COMBO_LOOKUP);
}

export function normalizeInverterImportRow(row) {
  if (!row || typeof row !== "object") return {};
  const out = normalizeWithMap(row, INVERTER_COLUMN_MAP_ORDERED, INVERTER_LOOKUP);
  if (isEmptyish(out.model)) {
    const m = row.model ?? row.modelName ?? row.modelNumber;
    if (!isEmptyish(m)) out.model = m;
  }
  if (isEmptyish(out.dp)) {
    const v = row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate;
    if (!isEmptyish(v)) out.dp = v;
  }
  if (isEmptyish(out.cd)) {
    const v = row.cd ?? row.cdPrice;
    if (!isEmptyish(v)) out.cd = v;
  }
  if (isEmptyish(out.mrp)) {
    const v = row.mrp ?? row.mrpFinal;
    if (!isEmptyish(v)) out.mrp = v;
  }
  if (isEmptyish(out.sellRate)) {
    const v = row.sellRate ?? row.sellingRate ?? row.price ?? row.newRateWithOB;
    if (!isEmptyish(v)) out.sellRate = v;
  }
  if (isEmptyish(out.quantity)) {
    const q = row.quantity ?? row.qty;
    if (!isEmptyish(q)) out.quantity = q;
  }
  if (isEmptyish(out.brand) && !isEmptyish(row.brand)) out.brand = row.brand;
  return out;
}

export function normalizeTrolleyImportRow(row) {
  if (!row || typeof row !== "object") return {};
  const out = normalizeWithMap(row, TROLLEY_COLUMN_MAP_ORDERED, TROLLEY_LOOKUP);
  if (isEmptyish(out.model)) {
    const m = row.model ?? row.modelName ?? row.modelNumber;
    if (!isEmptyish(m)) out.model = m;
  }
  if (isEmptyish(out.suitableBatteryType)) {
    const v = row.suitableBatteryType ?? row.description;
    if (!isEmptyish(v)) out.suitableBatteryType = v;
  }
  if (isEmptyish(out.dp)) {
    const v = row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate;
    if (!isEmptyish(v)) out.dp = v;
  }
  if (isEmptyish(out.cd)) {
    const v = row.cd ?? row.cdPrice;
    if (!isEmptyish(v)) out.cd = v;
  }
  if (isEmptyish(out.price)) {
    const v = row.price ?? row.mrp ?? row.sellRate ?? row.sellingRate ?? row.newRateWithOB;
    if (!isEmptyish(v)) out.price = v;
  }
  if (isEmptyish(out.quantity)) {
    const q = row.quantity ?? row.qty;
    if (!isEmptyish(q)) out.quantity = q;
  }
  if (isEmptyish(out.brand) && !isEmptyish(row.brand)) out.brand = row.brand;
  return out;
}

export function normalizeLithiumIonImportRow(row) {
  if (!row || typeof row !== "object") return {};
  const out = normalizeWithMap(row, LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED, LITHIUM_ION_LOOKUP);
  if (isEmptyish(out.batteryModel)) {
    const m = row.batteryModel ?? row.model ?? row.modelName ?? row.modelNumber;
    if (!isEmptyish(m)) out.batteryModel = m;
  }
  if (isEmptyish(out.batteryAH)) {
    const ah = row.batteryAH ?? row.ah ?? row.capacityAh ?? row.capacityAH;
    if (!isEmptyish(ah)) out.batteryAH = ah;
  }
  if (isEmptyish(out.voltage)) {
    const v = row.voltage ?? row.volt;
    if (!isEmptyish(v)) out.voltage = v;
  }
  if (isEmptyish(out.dp)) {
    const v = row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate;
    if (!isEmptyish(v)) out.dp = v;
  }
  if (isEmptyish(out.cd)) {
    const v = row.cd ?? row.cdPrice;
    if (!isEmptyish(v)) out.cd = v;
  }
  if (isEmptyish(out.mrpFinal)) {
    const v = row.mrpFinal ?? row.mrp;
    if (!isEmptyish(v)) out.mrpFinal = v;
  }
  if (isEmptyish(out.newRateWithOB)) {
    const v = row.newRateWithOB ?? row.sellRate ?? row.sellingRate;
    if (!isEmptyish(v)) out.newRateWithOB = v;
  }
  if (isEmptyish(out.newRateWithoutOB)) {
    const v = row.newRateWithoutOB;
    if (!isEmptyish(v)) out.newRateWithoutOB = v;
  }
  if (isEmptyish(out.weight)) {
    const w = row.weight ?? row.batteryWeight;
    if (!isEmptyish(w)) out.weight = w;
  }
  if (isEmptyish(out.batteryType) && !isEmptyish(row.batteryType)) out.batteryType = row.batteryType;
  if (isEmptyish(out.quantity)) {
    const q = row.quantity ?? row.qty;
    if (!isEmptyish(q)) out.quantity = q;
  }
  if (isEmptyish(out.brand) && !isEmptyish(row.brand)) out.brand = row.brand;
  return out;
}

export function normalizeHomeInvImportRow(row) {
  if (!row || typeof row !== "object") return {};
  const out = normalizeWithMap(row, HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED, HOME_INV_LOOKUP);
  if (isEmptyish(out.batteryModel)) {
    const m = row.batteryModel ?? row.model ?? row.modelName;
    if (!isEmptyish(m)) out.batteryModel = m;
  }
  if (isEmptyish(out.batteryAH)) {
    const ah = row.batteryAH ?? row.ah ?? row.capacityAh ?? row.capacityAH ?? row.productCapacityAh;
    if (!isEmptyish(ah)) out.batteryAH = ah;
  }
  if (isEmptyish(out.dp)) {
    const v = row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate;
    if (!isEmptyish(v)) out.dp = v;
  }
  if (isEmptyish(out.cd)) {
    const v = row.cd ?? row.cdPrice;
    if (!isEmptyish(v)) out.cd = v;
  }
  if (isEmptyish(out.mrpFinal)) {
    const v = row.mrpFinal ?? row.mrp;
    if (!isEmptyish(v)) out.mrpFinal = v;
  }
  if (isEmptyish(out.newRateWithOB)) {
    const v = row.newRateWithOB ?? row.sellRate ?? row.sellingRate;
    if (!isEmptyish(v)) out.newRateWithOB = v;
  }
  if (isEmptyish(out.newRateWithoutOB)) {
    const v = row.newRateWithoutOB;
    if (!isEmptyish(v)) out.newRateWithoutOB = v;
  }
  if (isEmptyish(out.weight)) {
    const w = row.weight ?? row.batteryWeight;
    if (!isEmptyish(w)) out.weight = w;
  }
  if (isEmptyish(out.quantity)) {
    const q = row.quantity ?? row.qty;
    if (!isEmptyish(q)) out.quantity = q;
  }
  if (isEmptyish(out.brand) && !isEmptyish(row.brand)) out.brand = row.brand;
  if (isEmptyish(out.batteryType) && !isEmptyish(row.batteryType)) out.batteryType = row.batteryType;
  return out;
}
