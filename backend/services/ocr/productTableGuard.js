/**
 * Product-table boundary and row evidence.
 * Tax/summary/footer lines must never become purchase items.
 */

export const TABLE_END_RE =
  /^(?:gst\s*summary|tax\s*summary|hsn\s*(?:wise|summary)|taxable\s+value|sub\s*total|grand\s*total|invoice\s*total|total\s*payable|amount\s+in\s+words|terms\s*(?:and|&)\s*conditions|bank\s+details|declaration|authoris[e]?d\s+signatory|due\s*balance|cheque\s*bounce|round\s*off)\b/i;

export const TAX_BAND_RE = /^(?:gst\s*(?:5|12|18|28)\s*%|gst\s*\d+\s*%)/i;
export const TAX_HEAD_RE = /^(?:cgst|sgst|igst|cess|gst)\b/i;
export const TOTAL_HEAD_RE = /^(?:total|grand\s*total|sub\s*total|invoice\s*total|total\s*payable)\b/i;
export const FOOTER_HEAD_RE =
  /(?:amount\s+in\s+words|terms\s*(?:and|&)\s*conditions|bank\s+details|authoris[e]?d\s+signatory|declaration|cheque\s*bounce|due\s*balance|e\.?\s*&?\s*o\.?\s*e\.?)/i;

const TAXISH_NAME = /^(?:gst|cgst|sgst|igst|cess|tax|total|subtotal|discount|round|freight|packing|transport|hsn)\b/i;

function normLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @returns {{ code: string, reason: string }}
 */
export function classifyInvoiceLine(text) {
  const t = normLine(text);
  if (!t) return { code: "EMPTY", reason: "empty" };

  if (FOOTER_HEAD_RE.test(t) || /^(?:for\s+).{4,60}$/i.test(t) && /automobiles|limited|pvt|llp|signatory/i.test(t)) {
    return { code: "FOOTER_SECTION", reason: "FOOTER_SECTION" };
  }
  if (TABLE_END_RE.test(t) || TOTAL_HEAD_RE.test(t)) {
    if (/^total\s+with\s+gst\b/i.test(t)) return { code: "CANDIDATE", reason: null };
    return { code: t.match(TOTAL_HEAD_RE) ? "TOTAL_SECTION" : "TAX_SUMMARY_SECTION", reason: TABLE_END_RE.test(t) ? "TABLE_END" : "TOTAL_SECTION" };
  }
  if (TAX_BAND_RE.test(t) || (TAX_HEAD_RE.test(t) && !/\bqty\b/i.test(t))) {
    return { code: "TAX_SUMMARY_SECTION", reason: "TAX_SUMMARY_SECTION" };
  }
  if (/^(?:s\.?\s*no|sr\.?\s*no|description of goods|hsn\/sac)\s*$/i.test(t)) {
    return { code: "HEADER", reason: "HEADER" };
  }
  return { code: "CANDIDATE", reason: null };
}

export function isTableEndLine(text) {
  const { code } = classifyInvoiceLine(text);
  return code === "TAX_SUMMARY_SECTION" || code === "TOTAL_SECTION" || code === "FOOTER_SECTION";
}

function hasProductLikeName(name) {
  const n = normLine(name);
  if (n.length < 3) return false;
  if (TAXISH_NAME.test(n)) return false;
  if (/^\d{4,8}$/.test(n)) return false;
  if (!/[A-Za-z]{2}/.test(n)) return false;
  return true;
}

function hasProductCode(text) {
  return /[A-Za-z]{2,}\d|\d+[A-Za-z]{2,}/.test(String(text || ""));
}

export function hasProductDescription(name, text = "") {
  const n = normLine(name);
  const blob = `${n} ${text}`.trim();
  if (TAXISH_NAME.test(n)) return false;
  if (/^\d{4,8}$/.test(n)) return false;
  if (hasProductLikeName(n) || hasProductCode(blob)) return true;
  return false;
}

/**
 * A purchase item needs a real product description in table context.
 * HSN or a stray number is not enough.
 */
export function hasProductEvidence(assigned = {}) {
  const text = assigned.raw || assigned.text || "";
  const classified = classifyInvoiceLine(text);
  if (classified.code !== "CANDIDATE") {
    return { ok: false, reason: classified.reason || classified.code };
  }

  const name = String(assigned.description || assigned.sku || assigned.productName || "").trim();
  if (!hasProductDescription(name, text)) {
    if (/^\d{4,8}$/.test(name)) return { ok: false, reason: "HSN_ONLY" };
    if (TAXISH_NAME.test(name)) return { ok: false, reason: "TAX_LABEL_AS_NAME" };
    return { ok: false, reason: "NO_PRODUCT_DESCRIPTION" };
  }

  const qty = assigned.quantity;
  const rate = assigned.rate;
  const total = assigned.total;
  const qtyOk = qty != null && qty > 0 && qty <= 5000;
  const moneyOk = (rate != null && rate >= 0) || (total != null && total >= 0);
  if (!qtyOk && !moneyOk) return { ok: false, reason: "NO_QTY_OR_AMOUNT" };

  return { ok: true, reason: null };
}
