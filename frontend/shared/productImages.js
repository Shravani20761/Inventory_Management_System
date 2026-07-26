/**
 * Central battery / inverter image resolution (shared by Node PDFs and Vite client).
 * Matching: trim + uppercase on brand/model; model-specific rules first, then brand PNG, then default.
 */

export const DEFAULT_BATTERY_IMAGE = "/images/batteries/default-battery.png";
export const DEFAULT_INVERTER_IMAGE = "/images/inverters/default-inverter.png";

/** Normalize for comparisons: trim, uppercase, collapse spaces. */
export function normalizeMatchKey(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

const BRAND_ORDER = ["LUMINOUS", "EXIDE", "MICROTEK", "LIVGUARD", "AMARON"];

/** Map free-text brand to a known catalog token, or "" if unknown. */
export function resolveKnownBrandUpper(brandRaw) {
  const n = normalizeMatchKey(brandRaw);
  if (!n) return "";
  for (const b of BRAND_ORDER) {
    if (n.includes(b)) return b;
  }
  return "";
}

const BATTERY_FILE = {
  EXIDE: "exide-battery.png",
  LUMINOUS: "luminous-battery.png",
  MICROTEK: "microtek-battery.png",
  LIVGUARD: "livguard-battery.png",
  AMARON: "amaron-battery.png",
};

const INVERTER_FILE = {
  EXIDE: "exide-inverter.png",
  LUMINOUS: "luminous-inverter.png",
  MICROTEK: "microtek-inverter.png",
  LIVGUARD: "livguard-inverter.png",
  AMARON: "amaron-inverter.png",
};

export function brandBatteryImagePath(brandUpperKnown) {
  const f = BATTERY_FILE[brandUpperKnown];
  return f ? `/images/batteries/${f}` : "";
}

export function brandInverterImagePath(brandUpperKnown) {
  const f = INVERTER_FILE[brandUpperKnown];
  return f ? `/images/inverters/${f}` : "";
}

function titleCaseBrand(upper) {
  if (!upper) return "";
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

/** Legacy shape: Title-case keys → absolute public paths under `/images/...`. */
export const BRAND_IMAGES = {
  battery: Object.fromEntries(Object.keys(BATTERY_FILE).map((u) => [titleCaseBrand(u), brandBatteryImagePath(u)])),
  inverter: Object.fromEntries(Object.keys(INVERTER_FILE).map((u) => [titleCaseBrand(u), brandInverterImagePath(u)])),
};

export const brandImages = Object.fromEntries(
  BRAND_ORDER.map((u) => {
    const k = titleCaseBrand(u);
    return [k, { battery: brandBatteryImagePath(u), inverter: brandInverterImagePath(u) }];
  }),
);

/**
 * Model-specific art (e.g. Exide marketing PNGs). `includesAny` entries are compared as
 * substrings of the normalized model string (trim + uppercase).
 */
export const MODEL_IMAGE_RULES_BATTERY = [
  { brandNorm: "EXIDE", includesAny: ["INVA MAGIC HB", "HB SERIES"], path: "/assets/exide-models/exide-inva-magic-hb-series.png" },
  { brandNorm: "EXIDE", includesAny: ["EL ULTRA", "EL-ULTRA"], path: "/assets/exide-models/exide-el-ultra-tall-tubular.png" },
  {
    brandNorm: "EXIDE",
    includesAny: ["INVATUBULAR", "INVA TUBULAR", "IT500", "TALL TUBULAR"],
    path: "/assets/exide-models/exide-home-invatubular-tall-tubular.png",
  },
  { brandNorm: "EXIDE", includesAny: ["INVAMASTER", "INVA MASTER"], path: "/assets/exide-models/exide-home-invamaster.png" },
  { brandNorm: "EXIDE", includesAny: ["INVAMAGIC", "INVA MAGIC"], path: "/assets/exide-models/exide-home-invamagic.png" },
  { brandNorm: "EXIDE", includesAny: ["POWERBOX", "POWER BOX"], path: "/assets/exide-models/exide-powerbox.png" },
  { brandNorm: "EXIDE", includesAny: ["GENPLUS", "GEN PLUS"], path: "/assets/exide-models/exide-genplus.png" },
];

export const MODEL_IMAGE_RULES_INVERTER = [
  { brandNorm: "EXIDE", includesAny: ["GQP"], path: "/assets/exide-models/exide-gqp-inverter.png" },
  { brandNorm: "EXIDE", includesAny: ["HKVA"], path: "/assets/exide-models/exide-hkva-inverter.png" },
  { brandNorm: "EXIDE", includesAny: ["STAR"], path: "/assets/exide-models/exide-star-inverter.png" },
  { brandNorm: "EXIDE", includesAny: ["MAGIC"], path: "/assets/exide-models/exide-magic-inverter.png" },
];

function modelRulePath(brandNorm, modelText, kind) {
  const modelNorm = normalizeMatchKey(modelText).replace(/\s+/g, " ");
  if (!brandNorm || !modelNorm) return "";
  const rules = kind === "inverter" ? MODEL_IMAGE_RULES_INVERTER : MODEL_IMAGE_RULES_BATTERY;
  for (const r of rules) {
    if (r.brandNorm !== brandNorm) continue;
    for (const needle of r.includesAny) {
      const t = normalizeMatchKey(needle).replace(/\s+/g, " ");
      if (t && modelNorm.includes(t)) return r.path;
    }
  }
  return "";
}

/**
 * @returns {{ path: string, source: 'explicit' | 'model' | 'brand' | 'default' }}
 */
export function resolveProductImagePath({ brand, model, product = "battery", explicitUrl } = {}) {
  const ex = String(explicitUrl ?? "").trim();
  if (ex && (ex.startsWith("http") || ex.startsWith("/") || ex.startsWith("data:"))) {
    return { path: ex, source: "explicit" };
  }

  const kind = product === "inverter" ? "inverter" : "battery";
  const brandKnown = resolveKnownBrandUpper(brand);
  const modelStr = String(model ?? "").trim();
  const modelPath = brandKnown && modelStr ? modelRulePath(brandKnown, modelStr, kind) : "";
  if (modelPath) {
    return { path: modelPath, source: "model" };
  }

  const brandPath = brandKnown
    ? kind === "inverter"
      ? brandInverterImagePath(brandKnown)
      : brandBatteryImagePath(brandKnown)
    : "";
  if (brandPath) {
    return { path: brandPath, source: "brand" };
  }

  const def = kind === "inverter" ? DEFAULT_INVERTER_IMAGE : DEFAULT_BATTERY_IMAGE;
  console.log("Image Mapping:", brand, model, def);
  return { path: def, source: "default" };
}

/** @param {string} [model] optional model for tiered / model-specific art */
export function resolveBrandProductImagePath(brandName, product = "battery", model = "") {
  return resolveProductImagePath({ brand: brandName, model, product }).path;
}

export function productImageForOption(option, product = "inverter") {
  const inv = option?.inverter ?? {};
  const bat = option?.battery ?? {};
  const source = product === "inverter" ? inv : bat;
  const direct =
    product === "inverter"
      ? inv.imageUrl || inv.inverterImage || option?.inverterImage
      : bat.imageUrl || bat.batteryImage || option?.batteryImage;
  const model =
    product === "inverter"
      ? inv.inverterModelNumber || inv.modelName || option?.inverterName || ""
      : bat.batteryModelNumber || bat.modelName || option?.batteryName || "";
  const brand =
    source?.brand ||
    (product === "inverter"
      ? option?.inverterBrand || option?.preferredInverterBrand
      : option?.batteryBrand || option?.preferredBatteryBrand);

  return resolveProductImagePath({
    brand,
    model,
    product,
    explicitUrl: direct,
  }).path;
}

/** @deprecated Prefer resolveProductImagePath — kept for older imports. */
export function resolveExideModelImage({ brand, modelText, product = "battery" } = {}) {
  if (normalizeMatchKey(brand) !== "EXIDE") return "";
  const kind = product === "inverter" ? "inverter" : "battery";
  const p = modelRulePath("EXIDE", modelText, kind);
  return p && p.includes("exide-models") ? p : "";
}

/** Legacy Title-case brand for UI tables. */
export function canonicalBrandName(brandName) {
  const u = resolveKnownBrandUpper(brandName);
  return u ? titleCaseBrand(u) : String(brandName ?? "").trim();
}

/** @deprecated */
export function resolveBrandImages(brandName) {
  const key = canonicalBrandName(brandName);
  if (!key) return null;
  return brandImages[key] || null;
}
