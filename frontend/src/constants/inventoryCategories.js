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

/** Known ERP brands → chip label. Longer needles first. */
const KNOWN_BRAND_CANON = [
  { canon: "SF Sonic", needles: ["sf sonic", "sf-sonic", "sfsonic"] },
  { canon: "Livguard", needles: ["livguard", "liv guard"] },
  { canon: "Livfast", needles: ["livfast", "liv fast", "livefast"] },
  { canon: "Luminous", needles: ["luminous"] },
  { canon: "Microtek", needles: ["microtek"] },
  { canon: "Amaron", needles: ["amaron"] },
  { canon: "Exide", needles: ["exide"] },
  { canon: "Okaya", needles: ["okaya"] },
];

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
    brands: ["Microtek", "Exide", "Amaron", "Luminous", "SF Sonic"],
    tableKind: "inverter",
  },
  {
    id: "battery",
    label: "Battery",
    uploadType: HOME_INVERTER_BATTERY_TYPE,
    searchType: "battery",
    brands: ["Microtek", "SF Sonic", "Exide", "Amaron", "Luminous", "Livfast"],
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

function isPlaceholderBrand(value) {
  const n = normalizeInventoryBrand(value);
  return !n || n === "unknown" || n === "other";
}

/**
 * Map sheet/DB brand text to a known chip label (Exide, Amaron, Luminous, Microtek, …).
 * Unknown brands keep their original trimmed text — never rewritten to "Other" or "Unknown".
 */
export function canonicalInventoryBrand(rawBrand) {
  const trimmed = String(rawBrand ?? "").trim();
  const n = normalizeInventoryBrand(trimmed);
  if (isPlaceholderBrand(n)) return "";
  for (const { canon, needles } of KNOWN_BRAND_CANON) {
    for (const needle of needles) {
      if (n === needle || n.startsWith(needle)) return canon;
    }
  }
  return trimmed;
}

/** @deprecated Use canonicalInventoryBrand — kept for car/bike call sites. */
export function canonicalAutomotiveBrand(rawBrand) {
  return canonicalInventoryBrand(rawBrand);
}

export function inventoryBrandMatches(rowBrand, filterBrand) {
  if (!filterBrand) return true;
  const a = canonicalInventoryBrand(rowBrand) || String(rowBrand ?? "").trim();
  const b = canonicalInventoryBrand(filterBrand) || String(filterBrand ?? "").trim();
  return normalizeInventoryBrand(a) === normalizeInventoryBrand(b);
}

/** Car/Bike tabs only — used for brand sub-section chips. */
export function isAutomotiveInventoryCategory(category) {
  const kind = category?.tableKind;
  return kind === "automotive-car" || kind === "automotive-bike";
}

/** Car/Bike tabs: show actual brand chip labels (Exide, Amaron, Other). */
export function automotiveBrandDisplayLabel(category, brandFilter, { isOther = false } = {}) {
  if (isOther || brandFilter === "Other") return "Other";
  return brandFilter;
}

/** Excel Category / Product Category → UI tab label (not Type/DIN). */
export function canonicalInventoryCategoryLabel(raw) {
  const n = normalizeInventoryBrand(raw);
  if (!n) return "";
  if (n === "car" || n.includes("car battery")) return "Car Battery";
  if (n === "bike" || n.includes("bike battery")) return "Bike Battery";
  if (n.includes("lithium")) return "Lithium Ion Battery";
  if (n.includes("trolley")) return "Trolley";
  if (n.includes("combo") || n.includes("inverter+battery") || n.includes("inverter + battery")) return "Combo";
  if (n.includes("inverter battery") || n === "home inverter battery") return "Battery";
  if (n === "inverter") return "Inverter";
  if (n === "battery") return "Battery";
  return "";
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
  for (const row of rows) {
    const rb = canonicalInventoryBrand(row.brand) || String(row.brand ?? "").trim();
    if (isPlaceholderBrand(rb)) continue;
    const match = category.brands.find((b) => inventoryBrandMatches(rb, b));
    if (match) counts[match] += 1;
    else other += 1;
  }
  const chips = category.brands.map((brand) => ({ brand, count: counts[brand] ?? 0 }));
  if (other > 0) chips.push({ brand: "Other", count: other, isOther: true });
  return chips;
}

export function inventoryRowMatchesBrandSubcategory(row, category, brandFilter) {
  if (!category?.brands?.length || !brandFilter || brandFilter === "All") return true;
  const rb = canonicalInventoryBrand(row.brand) || String(row.brand ?? "").trim();
  if (brandFilter === "Other") {
    if (isPlaceholderBrand(rb)) return false;
    return !category.brands.some((b) => inventoryBrandMatches(rb, b));
  }
  return inventoryBrandMatches(rb, brandFilter);
}

/**
 * Fill blank/Unknown Excel brands from the selected chip only.
 * Never overwrite a real Excel brand (e.g. Amaron while viewing Exide).
 */
export function applyUploadBrand(rows, defaultBrand, categoryBrands = null) {
  if (!Array.isArray(rows)) return rows;
  const chipCanon = canonicalInventoryBrand(defaultBrand) || String(defaultBrand ?? "").trim();
  const chips = Array.isArray(categoryBrands) && categoryBrands.length ? categoryBrands : AUTOMOTIVE_BATTERY_BRANDS;
  const chipIsKnown = chipCanon && chips.some((b) => inventoryBrandMatches(chipCanon, b));
  return rows.map((row) => {
    const raw = String(row.brand ?? "").trim();
    if (isPlaceholderBrand(raw)) {
      return chipIsKnown ? { ...row, brand: chipCanon } : { ...row, brand: "" };
    }
    return { ...row, brand: canonicalInventoryBrand(raw) || raw };
  });
}

/** @deprecated Use applyUploadBrand. */
export function applyAutomotiveUploadBrand(rows, defaultBrand) {
  return applyUploadBrand(rows, defaultBrand, AUTOMOTIVE_BATTERY_BRANDS);
}

export function brandMismatchWarning(selectedBrand, excelBrands) {
  const selected = canonicalInventoryBrand(selectedBrand) || String(selectedBrand ?? "").trim();
  if (!selected || selected === "All" || selected === "Other") return "";
  const detected = [
    ...new Set(
      (excelBrands || [])
        .map((b) => canonicalInventoryBrand(b) || String(b ?? "").trim())
        .filter((b) => b && !isPlaceholderBrand(b)),
    ),
  ];
  if (!detected.length) return "";
  const disagrees = detected.filter((b) => !inventoryBrandMatches(b, selected));
  if (!disagrees.length) return "";
  return `Selected section: ${selected}\nExcel brand detected: ${disagrees.join(", ")}\nPlease verify the import.`;
}
