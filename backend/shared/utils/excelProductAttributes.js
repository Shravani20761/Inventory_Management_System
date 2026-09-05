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

/** Excel Type / Battery Type / Product Type — never Car/Bike from the inventory tab. */
export function excelProductTypeFromRow(item) {
  const fromAttr = String(item?.batteryType ?? "").trim();
  if (fromAttr && !isInventoryCategoryLabel(fromAttr)) return fromAttr;
  const fromType = String(item?.type ?? "").trim();
  if (fromType && !isInventoryCategoryLabel(fromType)) return fromType;
  return "";
}

/** Excel Model Type — never the Model column. */
export function excelModelTypeFromRow(item) {
  return String(item?.modelType ?? "").trim();
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
  for (const key of ["batteryType", "modelType"]) {
    if (next[key] == null || String(next[key]).trim() === "") {
      delete next[key];
    }
  }
  return next;
}
