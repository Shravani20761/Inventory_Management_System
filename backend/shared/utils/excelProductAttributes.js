/**
 * Excel "Type" / "Model Type" are product attributes.
 * Inventory section tags (Car, Bike, Home Inverter Battery, …) stay separate.
 */

const INVENTORY_CATEGORY_LABELS = new Set([
  "car",
  "bike",
  "truck",
  "inverter",
  "inverter+battery",
  "inverter battery",
  "inv+battery",
  "inv + battery",
  "home inverter battery",
  "lithium ion battery",
  "trolley",
  "car battery",
  "bike battery",
]);

export function isInventoryCategoryLabel(value) {
  return INVENTORY_CATEGORY_LABELS.has(String(value ?? "").trim().toLowerCase());
}

/** Excel Type / Battery Type / Product Type — copy cell text as-is (not the inventory tab). */
export function excelProductTypeFromRow(item) {
  const fromAttr = String(item?.batteryType ?? "").trim();
  if (fromAttr) return fromAttr;
  const fromType = String(item?.type ?? "").trim();
  if (fromType && !isInventoryCategoryLabel(fromType)) return fromType;
  return "";
}

/** Excel Type / Inverter Type / Product Type on inverter sheets — copy as-is. */
export function excelInverterTypeFromRow(item) {
  const fromAttr = String(item?.inverterType ?? "").trim();
  if (fromAttr) return fromAttr;
  const fromTech = String(item?.technology ?? "").trim();
  if (fromTech) return fromTech;
  const fromBatt = String(item?.batteryType ?? "").trim();
  if (fromBatt && !isInventoryCategoryLabel(fromBatt)) return fromBatt;
  return "";
}

/** Excel Model Type — never the Model column. */
export function excelModelTypeFromRow(item) {
  return String(item?.modelType ?? "").trim();
}

/**
 * Excel P&L / Profit & Loss / PnL / PL — never computed from sell − buy.
 * `normalizedHeader` should already be lowercased/trimmed (same as findColumnKey).
 */
export function isPlColumnHeader(normalizedHeader) {
  const h = String(normalizedHeader ?? "").trim().toLowerCase();
  if (!h) return false;
  if (/^(p\s*&\s*l|p\s*and\s*l|pnl|p\/l|p\.l\.?|pl)\b/.test(h)) return true;
  if (h.includes("profit") && h.includes("loss")) return true;
  return false;
}

/** Copy the sheet P&L cell as-is. Blank means no P&L — do not invent one. */
export function excelPlFromRow(item) {
  if (item?.pl == null || item.pl === "") return "";
  return String(item.pl).trim();
}

/**
 * Inventory tab / section tag (Car, Bike, Home Inverter Battery, …).
 * Not the Excel Type attribute (DIN, JIS, VRLA).
 */
export function resolveInventorySectionType(item, inferredBike, importType) {
  const forced = String(importType ?? "").trim();
  if (forced && forced.toLowerCase() !== "all") return forced;
  const fromSheet = String(item?.type || "").trim();
  if (fromSheet && isInventoryCategoryLabel(fromSheet)) {
    const t = fromSheet.toLowerCase();
    if (t === "car" || t === "car battery") return "Car";
    if (t === "bike" || t === "bike battery") return "Bike";
    if (t === "truck") return "Truck";
    return fromSheet;
  }
  if (inferredBike) return "Bike";
  return "Car";
}

/** On upsert, skip blank Type / Model Type so existing values are not wiped. */
export function omitBlankAttributeUpdates(docShape) {
  if (!docShape || typeof docShape !== "object") return docShape;
  const next = { ...docShape };
  for (const key of ["batteryType", "modelType", "inverterType", "brand", "pl"]) {
    if (next[key] == null || String(next[key]).trim() === "") {
      delete next[key];
    } else if (key === "brand" && /^(unknown|other)$/i.test(String(next[key]).trim())) {
      delete next[key];
    }
  }
  return next;
}
