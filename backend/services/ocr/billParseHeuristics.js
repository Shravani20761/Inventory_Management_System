/** GST / Indian purchase-bill heuristics. Never invent values — return null/blank when unsure. */

const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i;
const PAN_RE = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/;
const INV_RE =
  /(?:invoice|bill|tax\s*invoice|inv)[^\n:]{0,24}(?:no|number|#)[:.\s-]*([A-Z0-9][A-Z0-9/._-]{3,30})/i;
const DATE_RE =
  /(?:invoice\s*date|bill\s*date|dated|date)[:.\s-]*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4})|\d{4}[\/\-.][01]?\d[\/\-.][0-3]?\d)/i;
const PO_RE = /(?:p\.?\s*o\.?|purchase\s*order)[^\n:]{0,12}(?:no|number|#)?[:.\s-]*([A-Z0-9][A-Z0-9/._-]{2,24})/i;
const MONEY_RE = /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)/i;

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,₹]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function pick(text, re, group = 1) {
  const m = String(text || "").match(re);
  return m?.[group] ? String(m[group]).trim() : "";
}

function labeledMoney(text, labels) {
  const blob = String(text || "");
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\n₹0-9]{0,40}${MONEY_RE.source}`, "i");
    const m = blob.match(re);
    if (m?.[1]) return numOrNull(m[1]);
  }
  return null;
}

export function emptyExtractedBill() {
  return {
    invoiceNumber: "",
    invoiceDate: "",
    purchaseOrderNumber: "",
    supplierDetails: {
      name: "",
      address: "",
      phone: "",
      email: "",
      gstin: "",
      pan: "",
      state: "",
      stateCode: "",
    },
    buyerDetails: {
      name: "",
      address: "",
      billingAddress: "",
      shippingAddress: "",
      gstin: "",
      state: "",
      stateCode: "",
    },
    items: [],
    subtotal: null,
    discount: null,
    taxableAmount: null,
    cgst: null,
    sgst: null,
    igst: null,
    cess: null,
    otherCharges: null,
    freight: null,
    transportation: null,
    installationCharges: null,
    roundOff: null,
    grandTotal: null,
    amountPaid: null,
    balanceDue: null,
    amountInWords: "",
    fieldConfidence: {},
    ocrConfidence: null,
  };
}

function conf(map, key, value, score) {
  if (value !== "" && value != null) map[key] = score;
  return value;
}

/** Parse line-ish rows: qty + rate patterns. Conservative — skip junk. */
function extractLineItems(text) {
  const items = [];
  const lines = String(text || "").split(/\r?\n/);
  const rowRe =
    /^(.{8,80}?)\s+(\d+(?:\.\d+)?)\s+(?:nos?|pcs?|unit|set|qty)?\s*([0-9,]+\.?[0-9]*)\s+([0-9,]+\.?[0-9]*)\s*$/i;
  for (const line of lines) {
    const t = line.replace(/\s+/g, " ").trim();
    if (t.length < 12) continue;
    const m = t.match(rowRe);
    if (!m) continue;
    const name = m[1].replace(/\bhsn\b.*$/i, "").trim();
    if (!/[a-zA-Z]{3}/.test(name)) continue;
    const qty = numOrNull(m[2]);
    const rate = numOrNull(m[3]);
    const total = numOrNull(m[4]);
    if (qty == null || qty <= 0 || qty > 9999) continue;
    items.push({
      productName: name,
      modelNumber: "",
      sku: "",
      brand: guessBrand(name),
      category: "",
      description: "",
      hsn: pick(t, /\b(\d{4,8})\b/) || "",
      quantity: qty,
      unit: "Nos",
      rate,
      discount: null,
      taxableAmount: null,
      gstRate: null,
      cgst: null,
      sgst: null,
      igst: null,
      cess: null,
      total,
      serialNumber: "",
      batchNumber: "",
      warranty: "",
      confidence: 55,
      fieldConfidence: { productName: 55, quantity: 70, rate: 60, total: 60 },
    });
  }
  return items;
}

function guessBrand(name) {
  const n = String(name || "").toUpperCase();
  for (const b of ["EXIDE", "AMARON", "LUMINOUS", "MICROTEK", "LIVGUARD", "SF SONIC", "OKAYA", "SU-KAM", "SUKAM"]) {
    if (n.includes(b.replace("-", " ")) || n.includes(b)) {
      return b
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace("Su-kam", "Su-Kam");
    }
  }
  return "";
}

export function parseBillTextHeuristics(text) {
  const extracted = emptyExtractedBill();
  const fc = {};
  const blob = String(text || "");
  if (!blob.trim()) return { ...extracted, fieldConfidence: fc, ocrConfidence: 0 };

  extracted.invoiceNumber = conf(fc, "invoiceNumber", pick(blob, INV_RE), 72);
  extracted.invoiceDate = conf(fc, "invoiceDate", pick(blob, DATE_RE), 70);
  extracted.purchaseOrderNumber = conf(fc, "purchaseOrderNumber", pick(blob, PO_RE), 60);

  const gstins = [...blob.matchAll(new RegExp(GSTIN_RE, "gi"))].map((m) => m[1].toUpperCase());
  extracted.supplierDetails.gstin = conf(fc, "supplierDetails.gstin", gstins[0] || "", 88);
  extracted.buyerDetails.gstin = conf(fc, "buyerDetails.gstin", gstins[1] || "", gstins[1] ? 80 : 0);
  extracted.supplierDetails.pan = conf(fc, "supplierDetails.pan", pick(blob, PAN_RE), 65);
  if (extracted.supplierDetails.gstin) {
    extracted.supplierDetails.stateCode = extracted.supplierDetails.gstin.slice(0, 2);
    fc["supplierDetails.stateCode"] = 90;
  }

  const company = pick(blob, /(?:^|\n)\s*([A-Z][A-Za-z0-9&.,' \-]{6,60}(?:Pvt\.?\s*Ltd\.?|Limited|Industries|Distributors))/);
  extracted.supplierDetails.name = conf(fc, "supplierDetails.name", company, company ? 68 : 0);

  extracted.grandTotal = labeledMoney(blob, ["grand total", "invoice total", "total amount", "amount payable", "net amount"]);
  if (extracted.grandTotal != null) fc.grandTotal = 75;
  extracted.subtotal = labeledMoney(blob, ["subtotal", "sub total", "taxable value", "taxable amount"]);
  if (extracted.subtotal != null) fc.subtotal = 70;
  extracted.taxableAmount = extracted.subtotal;
  extracted.cgst = labeledMoney(blob, ["\\bcgst\\b"]);
  extracted.sgst = labeledMoney(blob, ["\\bsgst\\b"]);
  extracted.igst = labeledMoney(blob, ["\\bigst\\b"]);
  extracted.cess = labeledMoney(blob, ["\\bcess\\b"]);
  extracted.discount = labeledMoney(blob, ["discount", "less discount"]);
  extracted.freight = labeledMoney(blob, ["freight"]);
  extracted.transportation = labeledMoney(blob, ["transport"]);
  extracted.installationCharges = labeledMoney(blob, ["installation"]);
  extracted.roundOff = labeledMoney(blob, ["round off", "round-off"]);
  extracted.amountPaid = labeledMoney(blob, ["amount paid", "received"]);
  extracted.balanceDue = labeledMoney(blob, ["balance due", "balance"]);
  const words = pick(blob, /(?:amount\s+in\s+words|inr\s*\()[:\s]*([^\n]{8,120})/i);
  extracted.amountInWords = conf(fc, "amountInWords", words, words ? 60 : 0);

  extracted.items = extractLineItems(blob);
  extracted.fieldConfidence = fc;
  const scores = Object.values(fc).filter((n) => typeof n === "number");
  extracted.ocrConfidence = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  return extracted;
}

export function isInsufficientExtraction(extracted) {
  const hasInvoice = Boolean(String(extracted?.invoiceNumber || "").trim());
  const hasSupplier = Boolean(String(extracted?.supplierDetails?.name || extracted?.supplierDetails?.gstin || "").trim());
  const hasItems = Array.isArray(extracted?.items) && extracted.items.some((i) => String(i.productName || i.sku || i.modelNumber || "").trim());
  const hasTotal = extracted?.grandTotal != null && Number(extracted.grandTotal) > 0;
  return !(hasInvoice || hasSupplier || hasItems || hasTotal);
}
