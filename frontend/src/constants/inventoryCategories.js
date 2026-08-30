import {
  HOME_INVERTER_BATTERY_TYPE,
  LITHIUM_ION_BATTERY_TYPE,
  isInverterBatterySection,
  isTrolleySection,
  shouldShowOnHomeInvBatteryTab,
  shouldShowOnInverterInventoryTab,
  shouldShowOnLithiumIonBatteryTab,
} from "./inventoryTypes.js";

/** Car & bike battery brand tabs in inventory. */
export const AUTOMOTIVE_BATTERY_BRANDS = ["Exide", "Amaron"];

/** ERP inventory categories → brand sub-sections (same MongoDB collections, filtered in UI). */
export const INVENTORY_CATEGORIES = [
  {
    id: "car-battery",
    label: "Car Battery",
    uploadType: "Car",
    searchType: "car-battery",
    brands: AUTOMOTIVE_BATTERY_BRANDS,
    tableKind: "automotive-car",
  },
  {
    id: "bike-battery",
    label: "Bike Battery",
    uploadType: "Bike",
    searchType: "bike-battery",
    brands: AUTOMOTIVE_BATTERY_BRANDS,
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
  {
    id: "vehicle-recommend",
    label: "Battery Recommendation",
    uploadType: null,
    searchType: null,
    brands: null,
    tableKind: "vehicle-recommend",
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

/** Car/Bike tabs only — used for brand sub-section chips. */
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

/** Car/Bike tabs: show actual brand chip labels (Exide, Amaron, Other). */
export function automotiveBrandDisplayLabel(category, brandFilter, { isOther = false } = {}) {
  if (!isAutomotiveInventoryCategory(category)) return brandFilter;
  if (isOther || brandFilter === "Other") return "Other";
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
    case "vehicle-recommend":
      return false;
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
  if (!category?.brands?.length || !brandFilter || brandFilter === "All") return true;
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

/** Apply the selected Exide/Amaron chip brand to automotive Excel rows missing a known brand. */
export function applyAutomotiveUploadBrand(rows, defaultBrand) {
  if (!defaultBrand || !Array.isArray(rows)) return rows;
  const chip = canonicalAutomotiveBrand(defaultBrand) || String(defaultBrand).trim();
  if (!chip || !AUTOMOTIVE_BATTERY_BRANDS.some((b) => inventoryBrandMatches(chip, b))) return rows;
  return rows.map((row) => {
    const raw = String(row.brand ?? "").trim();
    const empty = !raw || normalizeInventoryBrand(raw) === "unknown";
    const canon = empty ? "" : canonicalAutomotiveBrand(raw);
    const known = canon && AUTOMOTIVE_BATTERY_BRANDS.some((b) => inventoryBrandMatches(canon, b));
    if (known) return { ...row, brand: canon };
    return { ...row, brand: chip };
  });
}
