import fs from "fs/promises";
import path from "path";
import { renderInvoiceHtml } from "./invoiceTemplate.js";
import { renderRecommendationHtml } from "./recommendationTemplate.js";
import { renderFinalQuotationHtml } from "./finalQuotationTemplate.js";
import { ensureGeneratedDir, GENERATED_DIR, getQuotationRelativePath } from "./quotationStorageService.js";

const INVOICE_DIR = path.join(GENERATED_DIR, "invoices");

function buildRecommendationFileName(id) {
  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, "");
  return `recommendation-${safe}.pdf`;
}

function buildFinalQuotationFileName(quotation) {
  const letter = String(quotation?.pdfOptionId || "").replace(/[^a-zA-Z0-9]/g, "");
  const co = String(quotation?.clientOptionId || "").trim();
  const m = /^option-(\d+)$/i.exec(co);
  const optNum =
    letter ||
    m?.[1] ??
    (quotation?.optionIndex != null && Number.isFinite(Number(quotation.optionIndex))
      ? String(Number(quotation.optionIndex) + 1)
      : "1");
  const qk = String(quotation?.quoteKey || quotation?.id || "QT").replace(/[^a-zA-Z0-9_.-]/g, "");
  return `quotation_option_${optNum}_${qk}.pdf`;
}

async function puppeteerPdf(html, filePath, options = {}) {
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    const err = new Error("Puppeteer is not installed. Run: npm install puppeteer");
    err.status = 501;
    throw err;
  }
  const margin = options.margin ?? { top: "10px", right: "10px", bottom: "10px", left: "10px" };
  /** Static templates use embedded assets — avoid networkidle0 (adds seconds). */
  const waitUntil = options.waitUntil ?? "load";
  const settleMs = Number(options.settleMs ?? 350);
  const browser = await puppeteer.default.launch({
    headless: true,
    timeout: 120000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil, timeout: 90000 });
    if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));
    await page.pdf({
      path: filePath,
      format: "A4",
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      margin,
    });
  } finally {
    await browser.close();
  }
}

export async function generateRecommendationPdf(sheet) {
  await ensureGeneratedDir();
  const fileName = buildRecommendationFileName(sheet.sheetKey || sheet.id || `REC-${Date.now()}`);
  const filePath = path.join(GENERATED_DIR, fileName);
  const html = await renderRecommendationHtml(sheet);
  console.log("[pdf] Generating recommendation PDF:", fileName);
  await puppeteerPdf(html, filePath, {
    waitUntil: "networkidle0",
    settleMs: 800,
  });
  return {
    fileName,
    filePath,
    pdfUrl: getQuotationRelativePath(fileName),
    recommendationPdfPath: filePath,
  };
}

export async function generateFinalQuotationPdf(quotation) {
  await ensureGeneratedDir();
  const fileName = buildFinalQuotationFileName(quotation);
  const filePath = path.join(GENERATED_DIR, fileName);
  try {
    console.log("Generating quotation for:", quotation?.clientOptionId);
    console.log("[pdf] final quotation context", {
      optionIndex: quotation?.optionIndex,
      optionLabel: quotation?.selectedOption?.optionLabel,
      quoteKey: quotation?.quoteKey,
    });
    const html = await renderFinalQuotationHtml(quotation);
    console.log("[pdf] Selected Option:", quotation?.clientOptionId, "optionIndex:", quotation?.optionIndex);
    console.log("[pdf] Quotation Data (selected inverter/battery):", {
      inv: quotation?.selectedOption?.inverter?.modelName,
      bat: quotation?.selectedOption?.battery?.modelName,
      label: quotation?.selectedOption?.optionLabel,
    });
    console.log("[pdf] Generating final quotation PDF:", fileName);
    await puppeteerPdf(html, filePath, {
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      waitUntil: "load",
      settleMs: 280,
    });
    const pdfUrl = getQuotationRelativePath(fileName);
    console.log("[pdf] Generated PDF:", pdfUrl);
    return {
      fileName,
      filePath,
      pdfUrl,
      finalQuotationPdfPath: filePath,
    };
  } catch (e) {
    console.error("[pdf] Final quotation PDF failed:", quotation?.quoteKey, e?.message, e?.stack);
    const err = new Error(e.message || "Puppeteer PDF failed");
    err.status = e.status || 500;
    throw err;
  }
}

/** Legacy alias — recommendation sheet PDF for combo quotations. */
export async function generateQuotationPdf(quotation) {
  return generateRecommendationPdf(quotation);
}

/** Generate invoice PDF with BatteryMela branded template. */
export async function generateInvoicePdf(invoice) {
  await fs.mkdir(INVOICE_DIR, { recursive: true });
  const safeNum = String(invoice.invoiceNumber ?? invoice.id ?? Date.now()).replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `invoice-${safeNum}.pdf`;
  const filePath = path.join(INVOICE_DIR, fileName);
  const html = await renderInvoiceHtml(invoice);

  console.log("[pdf] Generating invoice PDF:", fileName);
  await puppeteerPdf(html, filePath, {
    waitUntil: "networkidle0",
    settleMs: 800,
  });

  return {
    fileName,
    filePath,
    pdfUrl: `/generated/invoices/${fileName}`,
    invoicePdfPath: filePath,
  };
}
