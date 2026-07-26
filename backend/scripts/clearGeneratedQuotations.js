/**
 * Remove all recommendation + quotation PDFs from server/generated (root only).
 *
 * On Windows, stop `npm run dev` / the API first so files are not locked by Puppeteer/static.
 * Or run: npm run dev:clean && npm run clear:quotation-pdfs
 */
import { clearAllGeneratedQuotationPdfs } from "../services/quotationStorageService.js";

const { removed, failed } = await clearAllGeneratedQuotationPdfs();
console.log(`Done. Removed: ${removed}. Failed: ${failed.length}.`);
if (failed.length) {
  console.warn("Failures (stop the server and retry):");
  for (const f of failed) console.warn(`  ${f.name}: ${f.error}`);
  process.exitCode = 1;
}
