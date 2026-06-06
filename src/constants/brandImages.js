/** Mirrors `server/constants/brandImages.js` for client-side previews (paths are same as served from `/`). */
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

export const brandImages = Object.fromEntries(
  ["Luminous", "Exide", "Microtek", "Amaron"].map((name) => [
    name,
    { battery: BRAND_IMAGES.battery[name], inverter: BRAND_IMAGES.inverter[name] },
  ]),
);

const KNOWN_BRANDS = ["Luminous", "Exide", "Microtek", "Amaron"];

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalBrandName(brandName) {
  const raw = String(brandName ?? "").trim();
  if (!raw) return "";
  const n = normalizeText(raw);
  for (const b of KNOWN_BRANDS) {
    if (n.includes(normalizeText(b))) return b;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function resolveBrandProductImagePath(brandName, product = "battery") {
  const kind = product === "inverter" ? "inverter" : "battery";
  const bucket = BRAND_IMAGES[kind];
  const key = canonicalBrandName(brandName);
  if (key && bucket[key]) return bucket[key];
  const alt = Object.keys(bucket).find((k) => normalizeText(k) === normalizeText(key));
  if (alt) return bucket[alt];
  return kind === "inverter" ? DEFAULT_INVERTER_IMAGE : DEFAULT_BATTERY_IMAGE;
}

export function resolveBrandImages(brandName) {
  const key = canonicalBrandName(brandName);
  if (!key) return null;
  return brandImages[key] || null;
}

export const BADGE_COLORS = {
  Budget: "#059669",
  Recommended: "#2563eb",
  Premium: "#6B21D8",
  "Heavy Load": "#ea580c",
};
