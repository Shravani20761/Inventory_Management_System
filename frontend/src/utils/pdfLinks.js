/** Normalize PDF URLs for browser — use Vite proxy path `/generated/...` not localhost:3001. */
export function pdfHref(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  const generatedIdx = raw.indexOf("/generated/");
  if (generatedIdx >= 0) {
    return raw.slice(generatedIdx);
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search || ""}`;
    } catch {
      /* fall through */
    }
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}
