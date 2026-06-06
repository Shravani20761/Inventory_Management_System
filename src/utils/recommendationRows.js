import { pdfHref } from "./pdfLinks.js";

/** Normalize recommendation sheet row for shop table + modals. */
export function isMongoId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || ""));
}

/** Normalize recommendation sheet row for shop table + modals. */
export function mapRecommendationRow(sheet = {}) {
  const sheetKey = sheet.sheetKey || (String(sheet.id || "").startsWith("REC-") ? String(sheet.id) : "");
  const id = sheetKey || sheet.id || sheet._id || "";
  const pdfPath = pdfHref(sheet.recommendationPdfUrl || sheet.quotationPdfUrl || sheet.pdfUrl || "") || "";
  return {
    ...sheet,
    _id: sheet._id ? String(sheet._id) : undefined,
    id: String(id),
    sheetKey: sheetKey || String(id),
    customerName: sheet.customerName || sheet.customer || "",
    customerPhone: sheet.customerPhone || sheet.phone || "",
    customer: sheet.customerName || sheet.customer || "",
    phone: sheet.customerPhone || sheet.phone || "",
    status: sheet.status || "AwaitingSelection",
    date: sheet.date || (sheet.createdAt ? String(sheet.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10)),
    recommendationPdfUrl: pdfPath,
    pdfUrl: pdfPath,
    suggestedOptions: sheet.suggestedOptions || sheet.options || [],
    documentStage: "recommendation",
  };
}
