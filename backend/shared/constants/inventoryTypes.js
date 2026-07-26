/** Tabs on Inventory + Excel import tagging (when not “All”). */
export const HOME_INVERTER_BATTERY_TYPE = "Home Inverter Battery";
export const LITHIUM_ION_BATTERY_TYPE = "Lithium Ion Battery";

export const INVENTORY_SECTIONS = [
  "Car",
  "Bike",
  "Inverter",
  "Truck",
  "Inverter+Battery",
  HOME_INVERTER_BATTERY_TYPE,
  LITHIUM_ION_BATTERY_TYPE,
];

/** Product `type` values in forms (same as visible inventory tabs). */
export const INVENTORY_FORM_TYPES = INVENTORY_SECTIONS;

/** Shorter tab labels (full `type` value stays in INVENTORY_SECTIONS for filters / DB). */
export const INVENTORY_SECTION_TAB_LABELS = {
  Car: "Car",
  Bike: "Bike",
  Inverter: "Inverter",
  Truck: "Truck",
  "Inverter+Battery": "Inv + Battery",
  [HOME_INVERTER_BATTERY_TYPE]: "Home Inv Bat",
  [LITHIUM_ION_BATTERY_TYPE]: "Lithium Ion",
};

export function inventorySectionTabLabel(section) {
  return INVENTORY_SECTION_TAB_LABELS[section] ?? section;
}

/** Stored on each row as `type` for combo SKUs (inverter + battery pack). */
export const INVERTER_BATTERY_TYPE = "Inverter+Battery";

export const TROLLEY_TYPE = "Trolley";

/** Luminous trolley / accessory inventory section. */
export function isTrolleySection(value) {
  return String(value ?? "").trim().toLowerCase() === TROLLEY_TYPE.toLowerCase();
}

/** Lithium-ion battery inventory section (separate MongoDB collection). */
export function isLithiumIonBatterySection(value) {
  return String(value ?? "").trim().toLowerCase() === LITHIUM_ION_BATTERY_TYPE.toLowerCase();
}

/** Rows that belong on the Lithium Ion Battery inventory tab. */
export function shouldShowOnLithiumIonBatteryTab(row) {
  if (!row) return false;
  if (String(row._inventoryCategory ?? "").trim() === "lithium_ion") return true;
  if (isLithiumIonBatterySection(row.type)) return true;
  return isLithiumIonBatterySection(row.category);
}

/** Section filter or row `type` string. */
export function isInverterBatterySection(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return (
    s === "inverter+battery" ||
    s === "inverter battery" ||
    s === "inv+battery" ||
    s === "inv + battery" ||
    s === INVERTER_BATTERY_TYPE.toLowerCase()
  );
}

/** True when the Inventory tab is the standalone Inverter section (not Inv + Battery combo). */
export function isInverterOnlySection(value) {
  return String(value ?? "").trim().toLowerCase() === "inverter";
}

/** Home inverter + battery price sheet (20-column master). */
export function isHomeInverterBatterySection(value) {
  return String(value ?? "").trim().toLowerCase() === HOME_INVERTER_BATTERY_TYPE.toLowerCase();
}

/** Rows that belong on the “Home Inv Bat” inventory tab. */
export function shouldShowOnHomeInvBatteryTab(row) {
  if (!row) return false;
  if (String(row._inventoryCategory ?? "").trim() === "home_inv") return true;
  if (String(row._catalogSource ?? "").trim() === "home_inverter_batteries") return true;
  if (isHomeInverterBatterySection(row.type)) return true;
  return isHomeInverterBatterySection(row.category);
}

/**
 * Rows that belong on the “Inverter” tab only (standalone inverter SKUs).
 * Excludes Inv+Battery combos and combo-shaped rows that were mis-tagged as `type: Inverter`.
 */
export function shouldShowOnInverterInventoryTab(row) {
  if (!row) return false;
  if (isInverterBatterySection(row.type)) return false;
  if (!isInverterOnlySection(row.type)) return false;
  const cid = String(row.comboId ?? "").trim();
  const bat = String(row.batteryModel ?? "").trim();
  const inv = String(row.inverterModel ?? "").trim();
  if (cid && (bat || inv)) return false;
  return true;
}
