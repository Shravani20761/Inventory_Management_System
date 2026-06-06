/**
 * Central brand → image map for quotation PDFs (and any HTML that uses productImageForOption).
 * One image per brand per category — all models for that brand use the same asset.
 *
 * Files live under `public/images/` (served as `/images/...`). Replace PNGs anytime; no code change needed.
 * Amaron uses existing SVGs until PNGs are added under `/images/...`.
 */
export const BRAND_IMAGES = {
  battery: {
    Luminous: "/images/batteries/luminous-battery.png",
    Exide: "/images/batteries/exide-battery.png",
    Microtek: "/images/batteries/microtek-battery.png",
    Amaron: "/images/batteries/amaron-battery.png",
  },
  inverter: {
    Luminous: "/images/inverters/luminous-inverter.png",
    Exide: "/images/inverters/exide-inverter.png",
    Microtek: "/images/inverters/microtek-inverter.png",
    Amaron: "/images/inverters/amaron-inverter.png",
  },
};

export const DEFAULT_BATTERY_IMAGE = "/images/batteries/default-battery.png";
export const DEFAULT_INVERTER_IMAGE = "/images/inverters/default-inverter.png";

/** @deprecated Use BRAND_IMAGES — kept for older imports expecting this shape. */
export const brandImages = Object.fromEntries(
  ["Luminous", "Exide", "Microtek", "Amaron"].map((name) => [
    name,
    {
      battery: BRAND_IMAGES.battery[name],
      inverter: BRAND_IMAGES.inverter[name],
    },
  ]),
);

export const BADGE_COLORS = {
  Budget: { bg: "#059669", text: "#fff", label: "Budget" },
  Recommended: { bg: "#2563eb", text: "#fff", label: "Recommended" },
  Premium: { bg: "#6B21D8", text: "#fff", label: "Premium" },
  "Heavy Load": { bg: "#ea580c", text: "#fff", label: "Heavy Load" },
  "Long Backup": { bg: "#0891b2", text: "#fff", label: "Long Backup" },
  "Best Value": { bg: "#059669", text: "#fff", label: "Best Value" },
  "Premium Choice": { bg: "#6B21D8", text: "#fff", label: "Premium Choice" },
};

/** Optional per-model Exide art (legacy). Not used by productImageForOption — brand-level images only. */
export const exideModelImages = {
  battery: [
    { match: ["inva magic hb", "hb series"], path: "/assets/exide-models/exide-inva-magic-hb-series.png" },
    { match: ["el ultra", "el-ultra"], path: "/assets/exide-models/exide-el-ultra-tall-tubular.png" },
    { match: ["invatubular", "inva tubular", "it500", "tall tubular"], path: "/assets/exide-models/exide-home-invatubular-tall-tubular.png" },
    { match: ["invamaster", "inva master"], path: "/assets/exide-models/exide-home-invamaster.png" },
    { match: ["invamagic", "inva magic"], path: "/assets/exide-models/exide-home-invamagic.png" },
    { match: ["powerbox", "power box"], path: "/assets/exide-models/exide-powerbox.png" },
    { match: ["genplus", "gen plus"], path: "/assets/exide-models/exide-genplus.png" },
  ],
  inverter: [
    { match: ["gqp"], path: "/assets/exide-models/exide-gqp-inverter.png" },
    { match: ["hkva"], path: "/assets/exide-models/exide-hkva-inverter.png" },
    { match: ["star"], path: "/assets/exide-models/exide-star-inverter.png" },
    { match: ["magic"], path: "/assets/exide-models/exide-magic-inverter.png" },
  ],
};

const KNOWN_BRANDS = ["Luminous", "Exide", "Microtek", "Amaron"];

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map free-text brand names to a known catalog key (e.g. "EXIDE" → "Exide", "Exide Industries" → "Exide").
 */
export function canonicalBrandName(brandName) {
  const raw = String(brandName ?? "").trim();
  if (!raw) return "";
  const n = normalizeText(raw);
  for (const b of KNOWN_BRANDS) {
    if (n.includes(normalizeText(b))) return b;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Public URL path for battery or inverter hero/thumbnail (brand-only; no per-model logic).
 */
export function resolveBrandProductImagePath(brandName, product = "battery") {
  const kind = product === "inverter" ? "inverter" : "battery";
  const bucket = BRAND_IMAGES[kind];
  const key = canonicalBrandName(brandName);
  if (key && bucket[key]) return bucket[key];
  const alt = Object.keys(bucket).find((k) => normalizeText(k) === normalizeText(key));
  if (alt) return bucket[alt];
  return kind === "inverter" ? DEFAULT_INVERTER_IMAGE : DEFAULT_BATTERY_IMAGE;
}

/** @deprecated Prefer resolveBrandProductImagePath + BRAND_IMAGES */
export function resolveBrandImages(brandName) {
  const key = canonicalBrandName(brandName);
  if (!key) return null;
  return brandImages[key] || null;
}

/** @deprecated Model-level Exide images are not used in the main PDF pipeline anymore */
export function resolveExideModelImage({ brand, modelText, product = "battery" } = {}) {
  if (normalizeText(brand) !== "exide") return "";
  const text = normalizeText(modelText);
  if (!text) return "";
  const rules = exideModelImages[product] ?? [];
  const rule = rules.find((r) => r.match.some((needle) => text.includes(normalizeText(needle))));
  return rule?.path || "";
}

/**
 * Image path for PDF/HTML embedding. Uses battery/inverter brand only (all models same image).
 * Optional per-line imageUrl on inventory rows still wins when present.
 */
export function productImageForOption(option, product = "inverter") {
  const inv = option?.inverter ?? {};
  const bat = option?.battery ?? {};
  const source = product === "inverter" ? inv : bat;
  const direct =
    product === "inverter"
      ? inv.imageUrl || inv.inverterImage || option.inverterImage
      : bat.imageUrl || bat.batteryImage || option.batteryImage;
  if (direct) return direct;

  const brand =
    source.brand ||
    (product === "inverter" ? option.inverterBrand || option.preferredInverterBrand : option.batteryBrand || option.preferredBatteryBrand);

  return resolveBrandProductImagePath(brand, product);
}
