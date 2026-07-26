import {
  HOME_INVERTER_BATTERY_TYPE,
  LITHIUM_ION_BATTERY_TYPE,
  isInverterBatterySection,
  isTrolleySection,
  shouldShowOnHomeInvBatteryTab,
  shouldShowOnInverterInventoryTab,
  shouldShowOnLithiumIonBatteryTab,
} from "./inventoryTypes.js";

/** ERP inventory categories → brand sub-sections (same MongoDB collections, filtered in UI). */
export const INVENTORY_CATEGORIES = [
  {
    id: "car-battery",
    label: "Car Battery",
    uploadType: "Car",
    searchType: "car-battery",
    brands: ["Exide", "Amaron"],
    tableKind: "automotive-car",
  },
  {
    id: "bike-battery",
    label: "Bike Battery",
    uploadType: "Bike",
    searchType: "bike-battery",
    brands: ["Exide", "Amaron"],
    tableKind: "automotive-bike",
  },
  {
    id: "inverter",
    label: "Inverter",
    uploadType: "Inverter",
    searchType: "inverter",
    brands: ["Microtek", "Exide", "Luminous", "SF Sonic"],
    tableKind: "inverter",
  },
  {
    id: "battery",
    label: "Battery",
    uploadType: HOME_INVERTER_BATTERY_TYPE,
    searchType: "battery",
    brands: ["Microtek", "SF Sonic", "Exide", "Luminous", "Livfast"],
    tableKind: "home-inv-bat",
  },
  {
    id: "combo",
    label: "Combo",
    uploadType: "Inverter+Battery",
    searchType: "combo",
    brands: null,
    tableKind: "combo",
  },
  {
    id: "trolley",
    label: "Trolley",
    uploadType: "Trolley",
    searchType: "trolley",
    brands: ["Luminous"],
    tableKind: "trolley",
  },
  {
    id: "lithium-ion",
    label: "Lithium Ion Battery",
    uploadType: LITHIUM_ION_BATTERY_TYPE,
    searchType: "lithium-ion",
    brands: ["Microtek", "Exide", "Amaron", "Luminous", "Livguard", "Okaya"],
    tableKind: "lithium-ion",
  },
];

export function getInventoryCategory(id) {
  return INVENTORY_CATEGORIES.find((c) => c.id === id) ?? INVENTORY_CATEGORIES[0];
}

export function normalizeInventoryBrand(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function inventoryBrandMatches(rowBrand, filterBrand) {
  if (!filterBrand) return true;
  return normalizeInventoryBrand(rowBrand) === normalizeInventoryBrand(filterBrand);
}

/** Car/Bike tabs only: swap chip labels Exide ↔ Other (inventory brand values unchanged). */
export function isAutomotiveInventoryCategory(category) {
  const kind = category?.tableKind;
  return kind === "automotive-car" || kind === "automotive-bike";
}

/** Map sheet/DB brand text to Exide / Amaron for car & bike filters (display only; no DB wipe). */
export function canonicalAutomotiveBrand(rawBrand) {
  const n = normalizeInventoryBrand(rawBrand);
  if (!n || n === "unknown") return "";
  if (n.startsWith("exide")) return "Exide";
  if (n.startsWith("amaron")) return "Amaron";
  return String(rawBrand ?? "").trim();
}

export function automotiveBrandDisplayLabel(category, brandFilter, { isOther = false } = {}) {
  if (!isAutomotiveInventoryCategory(category)) return brandFilter;
  if (isOther || brandFilter === "Other") return "Exide";
  if (brandFilter === "Exide") return "Other";
  return brandFilter;
}

export function inventoryRowMatchesCategory(row, category) {
  if (!row || !category) return false;
  switch (category.tableKind) {
    case "combo":
      return isInverterBatterySection(row.type);
    case "inverter":
      return shouldShowOnInverterInventoryTab(row);
    case "home-inv-bat":
      return (
        shouldShowOnHomeInvBatteryTab(row) ||
        String(row._catalogSource ?? "").trim() === "battery_inventory"
      );
    case "automotive-bike":
      return String(row.type ?? "").trim().toLowerCase() === "bike";
    case "automotive-car": {
      const t = String(row.type ?? "").trim().toLowerCase();
      return t === "car" || t === "truck";
    }
    case "trolley":
      return isTrolleySection(row.type) || String(row._inventoryCategory ?? "") === "trolley";
    case "lithium-ion":
      return shouldShowOnLithiumIonBatteryTab(row);
    default:
      return false;
  }
}

/** Count rows per configured brand + optional "Other" for unlisted brands. */
export function inventoryBrandCounts(rows, category) {
  if (!category?.brands?.length) return [];
  const counts = Object.fromEntries(category.brands.map((b) => [b, 0]));
  let other = 0;
  const automotive = isAutomotiveInventoryCategory(category);
  for (const row of rows) {
    const rb = automotive
      ? canonicalAutomotiveBrand(row.brand) || String(row.brand ?? "").trim()
      : String(row.brand ?? "").trim();
    const match = category.brands.find((b) => inventoryBrandMatches(rb, b));
    if (match) counts[match] += 1;
    else if (rb) other += 1;
  }
  const chips = category.brands.map((brand) => ({ brand, count: counts[brand] ?? 0 }));
  if (other > 0) chips.push({ brand: "Other", count: other, isOther: true });
  return chips;
}

export function inventoryRowMatchesBrandSubcategory(row, category, brandFilter) {
  if (!category?.brands?.length || !brandFilter) return true;
  const automotive = isAutomotiveInventoryCategory(category);
  const rb = automotive
    ? canonicalAutomotiveBrand(row.brand) || String(row.brand ?? "").trim()
    : String(row.brand ?? "").trim();
  if (brandFilter === "Other") {
    if (!rb) return false;
    return !category.brands.some((b) => inventoryBrandMatches(rb, b));
  }
  return inventoryBrandMatches(rb, brandFilter);
}
