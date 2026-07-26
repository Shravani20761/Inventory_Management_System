import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.resolve(__dirname, "..", "generated");
const QUOTATION_TTL_MS = 24 * 60 * 60 * 1000;
const QUOTATION_FILE_PREFIX = "quotation-";

export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, "");
}

export function buildQuotationFileName(quotationId) {
  const safe = String(quotationId).replace(/[^a-zA-Z0-9_-]/g, "");
  return `${QUOTATION_FILE_PREFIX}${safe}.pdf`;
}

export function getQuotationRelativePath(fileName) {
  return `/generated/${fileName}`;
}

export function getQuotationPublicUrl(fileName) {
  return `${publicBaseUrl()}${getQuotationRelativePath(fileName)}`;
}

export function getExpiresAt() {
  return new Date(Date.now() + QUOTATION_TTL_MS);
}

export function isQuotationPdfFile(fileName) {
  return fileName.startsWith(QUOTATION_FILE_PREFIX) && fileName.endsWith(".pdf");
}

/** PDFs written to GENERATED_DIR root (not invoices/ or accounts/). */
export function isRootQuotationOrRecommendationPdf(fileName) {
  if (!fileName || typeof fileName !== "string" || !fileName.endsWith(".pdf")) return false;
  return (
    fileName.startsWith("recommendation-") ||
    fileName.startsWith("quotation_option_") ||
    isQuotationPdfFile(fileName) ||
    /^QT-/i.test(fileName)
  );
}

/**
 * Delete all recommendation + final quotation PDFs from server/generated (root only).
 * Stop the API server first if you see EBUSY / permission errors (Windows locks open files).
 */
export async function clearAllGeneratedQuotationPdfs() {
  await ensureGeneratedDir();
  let removed = 0;
  const failed = [];

  let entries;
  try {
    entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true });
  } catch (err) {
    console.error("[quotation-storage] Cannot read generated folder:", err.message);
    return { removed: 0, failed: [{ name: "(dir)", error: err.message }] };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isRootQuotationOrRecommendationPdf(entry.name)) continue;
    const filePath = path.join(GENERATED_DIR, entry.name);
    try {
      await fs.unlink(filePath);
      removed += 1;
      console.log("[quotation-storage] Removed:", entry.name);
    } catch (err) {
      failed.push({ name: entry.name, error: err.message || String(err) });
      console.warn("[quotation-storage] Could not remove:", entry.name, err.message);
    }
  }

  console.log(`[quotation-storage] Cleared ${removed} file(s)${failed.length ? `, ${failed.length} failed` : ""}`);
  return { removed, failed };
}

export async function ensureGeneratedDir() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

export async function deleteQuotationPdf(fileName) {
  if (!fileName || !isQuotationPdfFile(fileName)) return false;
  const filePath = path.join(GENERATED_DIR, fileName);
  try {
    await fs.unlink(filePath);
    console.log("[quotation-storage] Deleted expired PDF:", fileName);
    return true;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("[quotation-storage] Delete failed:", fileName, err.message);
    return false;
  }
}

/** Remove quotation PDFs older than 24 hours from server/generated/ */
export async function cleanupExpiredQuotationPdfs() {
  await ensureGeneratedDir();
  const now = Date.now();
  let removed = 0;

  let entries;
  try {
    entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true });
  } catch (err) {
    console.error("[quotation-storage] Cannot read generated folder:", err.message);
    return { removed: 0 };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isQuotationPdfFile(entry.name)) continue;

    const filePath = path.join(GENERATED_DIR, entry.name);
    try {
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > QUOTATION_TTL_MS) {
        await fs.unlink(filePath);
        removed += 1;
        console.log("[quotation-storage] Auto-deleted expired:", entry.name);
      }
    } catch (err) {
      console.warn("[quotation-storage] Skip file:", entry.name, err.message);
    }
  }

  if (removed > 0) {
    console.log(`[quotation-storage] Cleanup complete — ${removed} quotation PDF(s) removed`);
  }
  return { removed };
}

export function startQuotationCleanupCron() {
  const intervalMs = Number(process.env.QUOTATION_CLEANUP_INTERVAL_MS) || 60 * 60 * 1000;
  cleanupExpiredQuotationPdfs().catch((err) => console.error("[quotation-storage] Startup cleanup error:", err));
  setInterval(() => {
    cleanupExpiredQuotationPdfs().catch((err) => console.error("[quotation-storage] Cron cleanup error:", err));
  }, intervalMs);
  console.log(`[quotation-storage] Cleanup cron every ${Math.round(intervalMs / 60000)} min (TTL 24h)`);
}
