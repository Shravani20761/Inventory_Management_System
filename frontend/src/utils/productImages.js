/**
 * Browser helpers: absolute URLs for public assets + re-export shared mapping.
 */
export {
  normalizeMatchKey,
  resolveKnownBrandUpper,
  resolveProductImagePath,
  productImageForOption,
  resolveBrandProductImagePath,
  BRAND_IMAGES,
  DEFAULT_BATTERY_IMAGE,
  DEFAULT_INVERTER_IMAGE,
} from "../../shared/productImages.js";

/**
 * Absolute URL for `<img src>` so assets resolve correctly behind reverse proxies and non-root deploys.
 * Uses `import.meta.env.BASE_URL` (Vite) and `window.location.origin`.
 */
export function publicAssetHref(assetPath) {
  const p = String(assetPath ?? "").trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("data:")) return p;

  const pathPart = p.startsWith("/") ? p : `/${p}`;
  const base = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL != null ? import.meta.env.BASE_URL : "/";
  const normalizedBase = String(base).replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    const prefix = normalizedBase && normalizedBase !== "/" ? normalizedBase : "";
    return `${window.location.origin}${prefix}${pathPart}`;
  }

  return normalizedBase && normalizedBase !== "/" ? `${normalizedBase}${pathPart}` : pathPart;
}
