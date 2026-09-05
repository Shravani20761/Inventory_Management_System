/** GST / Indian purchase-bill heuristics. Never invent values — return null/blank when unsure. */

const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i;
const PAN_RE = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/;
const INV_RE =
  /(?:invoice|bill|tax\s*invoice|inv)[^\n:]{0,24}(?:no|number|#)[:.\s-]*([A-Z0-9][A-Z0-9/._-]{3,30})/i;
const DATE_RE =
  /(?:invoice\s*date|bill\s*date|dated|date)[:.\s-]*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4})|\d{4}[\/\-.][01]?\d[\/\-.][0-3]?\d)/i;
const PO_RE = /(?:p\.?\s*o\.?|purchase\s*order)[^\n:]{0,12}(?:no|number|#)?[:.\s-]*([A-Z0-9][A-Z0-9/._-]{2,24})/i;
const PO_DATE_RE = /(?:p\.?\s*o\.?\s*date|po\s*date)[:.\s-]*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/i;
const DUE_RE = /(?:due\s*date|payment\s*due)[:.\s-]*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/i;
const TERMS_RE = /(?:payment\s*terms?|terms)[:.\s-]*([^\n]{4,80})/i;
const POS_RE = /(?:place\s*of\s*supply)[:.\s-]*([^\n]{3,60})/i;
const RC_RE = /(?:reverse\s*charge)[:.\s-]*([^\n]{1,20})/i;
const VEH_RE = /(?:vehicle\s*(?:no|number)|lorry)[:.\s-]*([A-Z0-9][A-Z0-9\s-]{4,14})/i;
const DN_RE = /(?:delivery\s*note|e-?way\s*bill)[:.\s-]*([A-Z0-9][A-Z0-9/._-]{3,24})/i;
const PHONE_RE = /(?:ph(?:one)?|mobile|tel)[:.\s-]*([+0-9][0-9\s-]{8,16})/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const MONEY_RE = /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)/i;

const SKIP_LINE =
  /(?:hsn\/sac|description\s+of\s+goods|taxable\s+value|authorised\s+signatory|page\s+\d+|warranty\s+void|terms\s+and\s+conditions|serial\s*no[:.]?\s*$)/i;

export function emptyLineItem() {
  return {
    productName: "",
    modelNumber: "",
    sku: "",
    brand: "",
    category: "",
    description: "",
    hsn: "",
    quantity: null,
    unit: "",
    rate: null,
    mrp: null,
    discount: null,
    discountPercent: null,
    taxableAmount: null,
    gstRate: null,
    cgstPercent: null,
    sgstPercent: null,
    igstPercent: null,
    cgst: null,
    sgst: null,
    igst: null,
    cess: null,
    total: null,
    serialNumber: "",
    batchNumber: "",
    warranty: "",
    batteryType: "",
    capacityAh: null,
    voltage: null,
    technology: "",
    manufacturingDate: "",
    confidence: null,
    fieldConfidence: {},
  };
}

export function emptyExtractedBill() {
  return {
    invoiceNumber: "",
    invoiceDate: "",
    purchaseOrderNumber: "",
    poDate: "",
    dueDate: "",
    paymentTerms: "",
    placeOfSupply: "",
    reverseCharge: "",
    vehicleNumber: "",
    deliveryNote: "",
    supplierDetails: {
      name: "",
      legalName: "",
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
      legalName: "",
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
    packingCharges: null,
    installationCharges: null,
    roundOff: null,
    grandTotal: null,
    amountPaid: null,
    balanceDue: null,
    amountInWords: "",
    fieldConfidence: {},
    ocrConfidence: null,
    parseDebug: null,
    manufacturerDetails: {
      label: "",
      names: [],
      raw: "",
    },
  };
}

export function numOrNull(v) {
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

function conf(map, key, value, score) {
  if (value !== "" && value != null) map[key] = score;
  return value;
}

export function guessBrand(name) {
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

/** Extract battery hints only when explicitly present on the text. */
export function parseBatteryHints(text) {
  const t = String(text || "");
  const ah = t.match(/(\d+(?:\.\d+)?)\s*A(?:h|H)\b/);
  const volt = t.match(/(\d+(?:\.\d+)?)\s*V(?:olts?)?\b/i);
  const out = {
    capacityAh: ah ? numOrNull(ah[1]) : null,
    voltage: volt ? numOrNull(volt[1]) : null,
    technology: "",
    batteryType: "",
  };
  if (/\btall\s*tubular\b/i.test(t)) out.batteryType = "Tall Tubular";
  else if (/\btubular\b/i.test(t)) out.batteryType = "Tubular";
  else if (/\bsmf\b/i.test(t)) out.batteryType = "SMF";
  if (/\blithium\b/i.test(t)) out.technology = "Lithium";
  else if (/\bvrl?a\b/i.test(t)) out.technology = "VRLA";
  return out;
}

function looksLikeProductRow(line) {
  const t = line.replace(/\s+/g, " ").trim();
  if (t.length < 8 || SKIP_LINE.test(t)) return false;
  const nums = t.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  const hasQtyish = nums.some((x) => {
    const n = Number(x);
    return n > 0 && n < 5000;
  });
  const hasLetters = /[a-zA-Z]{3}/.test(t);
  return hasLetters && hasQtyish && nums.length >= 2;
}

function parseRow(line) {
  const t = line.replace(/\s+/g, " ").trim();
  const rowRe =
    /^(.{6,90}?)\s+(\d+(?:\.\d+)?)\s+(?:nos?|pcs?|unit|set|qty|n)?\s*([0-9,]+\.?[0-9]*)\s+([0-9,]+\.?[0-9]*)\s*$/i;
  const m = t.match(rowRe);
  const name = m ? m[1].replace(/\bhsn\b.*$/i, "").trim() : t.replace(/\s+[0-9,]+\.?[0-9]*\s*$/, "").trim();
  const qty = m ? numOrNull(m[2]) : null;
  const rate = m ? numOrNull(m[3]) : null;
  const total = m ? numOrNull(m[4]) : null;
  const hints = parseBatteryHints(name);
  const item = {
    ...emptyLineItem(),
    productName: name,
    description: name,
    brand: guessBrand(name),
    hsn: pick(t, /\b(\d{4,8})\b/) || "",
    quantity: qty,
    unit: "Nos",
    rate,
    total,
    ...hints,
    confidence: m ? 55 : 40,
    fieldConfidence: { productName: m ? 55 : 40, quantity: qty ? 70 : 0, rate: rate ? 60 : 0, total: total ? 60 : 0 },
  };
  return item;
}

/** Merge wrapped description lines into the previous product instead of creating extras. */
function extractLineItems(text) {
  const raw = String(text || "").split(/\r?\n/);
  const items = [];
  for (const line of raw) {
    const t = line.replace(/\s+/g, " ").trim();
    if (!t || SKIP_LINE.test(t)) continue;
    if (looksLikeProductRow(t)) {
      const item = parseRow(t);
      if (!item.productName || item.quantity == null || item.quantity <= 0 || item.quantity > 9999) continue;
      if (!/[a-zA-Z]{3}/.test(item.productName)) continue;
      items.push(item);
      continue;
    }
    const prev = items[items.length - 1];
    if (!prev) continue;
    if (/serial|batch|warranty|mfg|ah\b|12v|hsn/i.test(t) && t.length < 80 && !looksLikeProductRow(t)) {
      prev.description = `${prev.description}\n${t}`.trim();
      const hints = parseBatteryHints(`${prev.productName} ${t}`);
      if (!prev.capacityAh && hints.capacityAh) prev.capacityAh = hints.capacityAh;
      if (!prev.voltage && hints.voltage) prev.voltage = hints.voltage;
      if (!prev.batteryType && hints.batteryType) prev.batteryType = hints.batteryType;
      if (!prev.technology && hints.technology) prev.technology = hints.technology;
      if (/serial/i.test(t)) prev.serialNumber = prev.serialNumber || pick(t, /(?:serial|sl)[:.\s-]*([A-Z0-9-]{4,})/i);
      if (/batch/i.test(t)) prev.batchNumber = prev.batchNumber || pick(t, /(?:batch)[:.\s-]*([A-Z0-9-]{3,})/i);
      if (/warranty/i.test(t)) prev.warranty = prev.warranty || t;
    }
  }
  return items;
}

export function parseBillTextHeuristics(text) {
  const extracted = emptyExtractedBill();
  const fc = {};
  const blob = String(text || "");
  if (!blob.trim()) return { ...extracted, fieldConfidence: fc, ocrConfidence: 0 };

  extracted.invoiceNumber = conf(fc, "invoiceNumber", pick(blob, INV_RE), 72);
  extracted.invoiceDate = conf(fc, "invoiceDate", pick(blob, DATE_RE), 70);
  extracted.purchaseOrderNumber = conf(fc, "purchaseOrderNumber", pick(blob, PO_RE), 60);
  extracted.poDate = conf(fc, "poDate", pick(blob, PO_DATE_RE), 55);
  extracted.dueDate = conf(fc, "dueDate", pick(blob, DUE_RE), 55);
  extracted.paymentTerms = conf(fc, "paymentTerms", pick(blob, TERMS_RE), 50);
  extracted.placeOfSupply = conf(fc, "placeOfSupply", pick(blob, POS_RE), 60);
  extracted.reverseCharge = conf(fc, "reverseCharge", pick(blob, RC_RE), 55);
  extracted.vehicleNumber = conf(fc, "vehicleNumber", pick(blob, VEH_RE), 50);
  extracted.deliveryNote = conf(fc, "deliveryNote", pick(blob, DN_RE), 50);

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
  extracted.supplierDetails.legalName = extracted.supplierDetails.name;
  extracted.supplierDetails.phone = conf(fc, "supplierDetails.phone", pick(blob, PHONE_RE), 55);
  extracted.supplierDetails.email = conf(fc, "supplierDetails.email", pick(blob, EMAIL_RE), 70);

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
  extracted.packingCharges = labeledMoney(blob, ["packing", "packaging"]);
  extracted.installationCharges = labeledMoney(blob, ["installation"]);
  extracted.roundOff = labeledMoney(blob, ["round off", "round-off"]);
  extracted.amountPaid = labeledMoney(blob, ["amount paid", "received"]);
  extracted.balanceDue = labeledMoney(blob, ["balance due", "balance"]);
  const words = pick(blob, /(?:amount\s+in\s+words|inr\s*\()[:\s]*([^\n]{8,120})/i);
  extracted.amountInWords = conf(fc, "amountInWords", words, words ? 60 : 0);

  extracted.items = extractLineItems(blob);
  extracted.fieldConfidence = fc;
  const scores = Object.values(fc).filter((x) => typeof x === "number");
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
