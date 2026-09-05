/**
 * Custom purchase-bill parser. Receives OCR/PDF text only — never calls AI.
 * Column order is detected from the bill header when present; otherwise rows are parsed from the right.
 */
import {
  emptyExtractedBill,
  emptyLineItem,
  guessBrand,
  parseBatteryHints,
  isInsufficientExtraction,
} from "./billParseHeuristics.js";
import { normalizeBillText, splitPages, stripCurrencyNoise } from "./textNormalizer.js";

export const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i;
const PAN_RE = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/;
const PHONE_RE = /(?:ph(?:one)?|mobile|tel|contact)[:.\s-]*([+0-9][0-9\s-]{8,16})/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const HSN_RE = /\b(\d{4,8})\b/;
const PAGE_SKIP =
  /(?:authorised\s+signatory|page\s+\d+\s+of|warranty\s+void|terms\s+and\s+conditions|e\.?\s*&?\s*o\.?\s*e\.?|for\s+[A-Z].*authorised)/i;

const INVOICE_LABEL =
  /(?:tax\s*invoice|invoice|bill|inv)[^\n]{0,28}(?:no\.?|number|#|num)/i;
const DATE_LABEL = /(?:invoice\s*date|bill\s*date|dated|date)/i;
const PO_LABEL = /(?:p\.?\s*o\.?|purchase\s*order)/i;
const DUE_LABEL = /(?:due\s*date|payment\s*due)/i;

const COL_ALIASES = {
  sku: ["sku", "code", "item code", "product code", "part no", "part number", "model", "model no", "item no"],
  description: ["description", "item", "product", "particulars", "goods", "description of goods", "name of product"],
  hsn: ["hsn", "hsn/sac", "sac", "hsn code"],
  qty: ["qty", "qty.", "quantity", "qnty", "nos", "pcs", "units"],
  rate: ["rate", "unit rate", "price", "unit price", "purchase rate", "rate (inr)", "rate inr"],
  discount: ["discount", "disc", "disc%", "disc %", "less"],
  gst: ["gst", "gst%", "gst %", "gst rate", "tax", "tax%"],
  cgst: ["cgst", "cgst%", "c gst"],
  sgst: ["sgst", "sgst%", "s gst"],
  igst: ["igst", "igst%", "i gst"],
  amount: ["amount", "total", "value", "taxable value", "taxable amount", "line total", "net amount"],
};

const TOTAL_LABELS = {
  grandTotal: ["grand total", "invoice total", "total amount", "amount payable", "net amount", "total invoice value"],
  subtotal: ["subtotal", "sub total", "taxable value", "taxable amount", "total taxable"],
  discount: ["discount", "less discount", "trade discount"],
  cgst: ["cgst"],
  sgst: ["sgst"],
  igst: ["igst"],
  cess: ["cess"],
  freight: ["freight"],
  transportation: ["transport", "transportation"],
  packingCharges: ["packing", "packaging"],
  installationCharges: ["installation"],
  roundOff: ["round off", "round-off", "rounding"],
  amountPaid: ["amount paid", "received"],
  balanceDue: ["balance due", "balance payable", "outstanding"],
};

function conf(map, key, value, score) {
  if (value !== "" && value != null) map[key] = score;
  return value;
}

export function parseAmount(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (GSTIN_RE.test(s)) return null;
  if (/^\+?\d{10,13}$/.test(s.replace(/[\s-]/g, ""))) return null;
  if (/[A-Za-z]{3,}/.test(s) && !/^(rs|inr)$/i.test(s)) return null;
  const cleaned = stripCurrencyNoise(s).replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function looksLikeGstin(value) {
  return GSTIN_RE.test(String(value || "").trim());
}

export function looksLikeInvoiceNumber(value) {
  const s = String(value || "").trim();
  if (s.length < 4 || s.length > 32) return false;
  if (looksLikeGstin(s)) return false;
  if (/^\+?\d{10,13}$/.test(s.replace(/[\s-]/g, ""))) return false;
  if (/^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(s)) return false;
  return /[A-Z0-9]/i.test(s);
}

export function parseBillDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const named = s.match(/^(\d{1,2})[ \-\/.]([A-Za-z]{3,9})[ \-\/.](\d{2,4})$/);
  if (named) {
    const mm = months[named[2].slice(0, 3).toLowerCase()];
    if (mm) return `${named[1].padStart(2, "0")}/${mm}/${named[3].length === 2 ? `20${named[3]}` : named[3]}`;
  }
  const yearLast = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})$/);
  const iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  const m = yearLast || iso;
  if (!m) return "";
  if (m[1].length === 4) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${year}`;
}

function pickAfterLabel(text, labelRe, valueRe) {
  const blob = String(text || "");
  const m = blob.match(new RegExp(`${labelRe.source}[:.\\s-]*${valueRe.source}`, "i"));
  return m?.[1] ? String(m[1]).trim() : "";
}

function labeledMoney(text, labels) {
  const blob = String(text || "");
  for (const label of labels) {
    const re = new RegExp(
      `${label}(?:[^\\n%]{0,12}\\d{1,2}(?:\\.\\d+)?\\s*%)?[^\\n₹0-9]{0,24}((?:₹|rs\\.?|inr)?\\s*(?:[0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]+)(?:\\.[0-9]{1,2})?)`,
      "i",
    );
    const m = blob.match(re);
    if (m?.[1] && !looksLikeGstin(m[1])) {
      const n = parseAmount(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function parsePercentNear(text, labels) {
  const blob = String(text || "");
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\n%]{0,24}(\\d{1,2}(?:\\.\\d+)?)\\s*%`, "i");
    const m = blob.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return null;
}

function aliasKey(cell) {
  const n = String(cell || "")
    .toLowerCase()
    .replace(/[^a-z0-9/%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    if (aliases.some((a) => n === a || n.includes(a))) return key;
  }
  return null;
}

export function detectColumnLayout(lines) {
  let best = null;
  let bestScore = 0;
  (lines || []).forEach((line, idx) => {
    const cells = String(line)
      .split(/\s{2,}|\t|\|/)
      .map((c) => c.trim())
      .filter(Boolean);
    const mapped = cells.map(aliasKey);
    const hits = mapped.filter(Boolean);
    const unique = new Set(hits);
    if (unique.size >= 3 && unique.has("qty") && (unique.has("rate") || unique.has("amount") || unique.has("description"))) {
      const score = unique.size * 10 - Math.abs(idx - 8);
      if (score > bestScore) {
        bestScore = score;
        best = { index: idx, columns: mapped, cells };
      }
    }
    const collapsed = aliasKey(line) ? null : line;
    if (!best && /qty|quantity/i.test(line) && /rate|price|amount|total/i.test(line)) {
      const tokens = String(line).toLowerCase().split(/\s+/);
      const columns = tokens.map(aliasKey);
      if (columns.filter(Boolean).length >= 3) {
        best = { index: idx, columns, cells: tokens };
      }
    }
  });
  return best;
}

function isNumericToken(tok) {
  return parseAmount(tok) != null;
}

function extractModelCode(name) {
  const tokens = String(name || "").split(/\s+/);
  const codes = tokens.filter((t) => /[A-Z]/i.test(t) && /\d/.test(t) && t.length >= 4 && t.length <= 18 && !/^(GSTIN|HSN|CGST|SGST|IGST)$/i.test(t));
  return codes.sort((a, b) => b.length - a.length)[0] || "";
}

function assignFromRight(tokens, layoutColumns) {
  const cols = (layoutColumns || []).filter(Boolean);
  const values = {};
  const nums = [];
  const rest = [];
  for (const tok of tokens) {
    if (isNumericToken(tok) || /^\d{4,8}$/.test(tok) || /^\d+(?:\.\d+)?%$/.test(tok)) nums.push(tok);
    else rest.push(tok);
  }
  const rightKeys = [...cols].reverse().filter((k) => k !== "description" && k !== "sku");
  const used = [];
  let ni = nums.length - 1;
  for (const key of rightKeys) {
    if (ni < 0) break;
    used.unshift({ key, tok: nums[ni] });
    ni -= 1;
  }
  for (const { key, tok } of used) {
    if (key === "hsn") values.hsn = String(tok).replace(/\D/g, "");
    else if (key === "qty") values.quantity = parseAmount(tok);
    else if (key === "rate") values.rate = parseAmount(tok);
    else if (key === "discount") values.discount = parseAmount(tok);
    else if (key === "gst" || key === "cgst" || key === "sgst" || key === "igst") {
      const pct = String(tok).includes("%") ? parseAmount(tok) : parseAmount(tok);
      if (key === "gst") values.gstRate = pct;
      if (key === "cgst") values.cgstPercent = pct;
      if (key === "sgst") values.sgstPercent = pct;
      if (key === "igst") values.igstPercent = pct;
    } else if (key === "amount") values.total = parseAmount(tok);
  }
  values.description = rest.join(" ").trim();
  if (cols.includes("sku") && rest[0] && /[A-Z0-9]/i.test(rest[0])) {
    values.sku = rest[0];
    values.description = rest.slice(1).join(" ").trim() || values.description;
  }
  return values;
}

function fallbackFromRight(tokens) {
  const values = {};
  const copy = [...tokens];
  const takeMoney = () => {
    while (copy.length) {
      const tok = copy[copy.length - 1];
      const n = parseAmount(tok.replace(/%/g, ""));
      if (n != null && !/^\d{4,8}$/.test(tok)) {
        copy.pop();
        return n;
      }
      break;
    }
    return null;
  };
  values.total = takeMoney();
  const maybePct = copy[copy.length - 1];
  if (maybePct && /%$/.test(maybePct)) {
    values.gstRate = parseAmount(maybePct);
    copy.pop();
  }
  values.rate = takeMoney();
  const qtyTok = copy[copy.length - 1];
  if (qtyTok && /^\d{1,4}(?:\.\d+)?$/.test(qtyTok) && Number(qtyTok) > 0 && Number(qtyTok) < 5000) {
    values.quantity = parseAmount(qtyTok);
    copy.pop();
  }
  const hsnTok = copy[copy.length - 1];
  if (hsnTok && /^\d{4,8}$/.test(hsnTok)) {
    values.hsn = hsnTok;
    copy.pop();
  }
  values.description = copy.join(" ").trim();
  return values;
}

function looksLikeProductRow(line, hasLayout) {
  const t = String(line || "").replace(/\s+/g, " ").trim();
  if (t.length < 6 || PAGE_SKIP.test(t)) return false;
  if (/^(?:s\.?\s*no|sr\.?|total|subtotal|cgst|sgst|igst|grand|round|hsn\/sac|description of goods)/i.test(t)) return false;
  const nums = t.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  const hasLetters = /[A-Za-z]{2}/.test(t);
  if (hasLayout) return hasLetters && nums.length >= 1;
  return hasLetters && nums.length >= 2;
}

function toLineItem(parsed, rawLine) {
  const name = parsed.description || parsed.sku || "";
  const hints = parseBatteryHints(`${name} ${rawLine}`);
  const sku = parsed.sku || extractModelCode(name);
  const gstRate =
    parsed.gstRate ??
    (parsed.igstPercent != null ? parsed.igstPercent : null) ??
    (parsed.cgstPercent != null && parsed.sgstPercent != null ? parsed.cgstPercent + parsed.sgstPercent : null);
  const qty = parsed.quantity;
  const rate = parsed.rate;
  const item = {
    ...emptyLineItem(),
    rawDescription: rawLine,
    productName: name,
    description: name,
    sku,
    modelNumber: sku,
    brand: guessBrand(name) || guessBrand(rawLine),
    hsn: parsed.hsn || "",
    quantity: qty,
    unit: "Nos",
    rate,
    discount: parsed.discount ?? null,
    gstRate,
    cgstPercent: parsed.cgstPercent ?? null,
    sgstPercent: parsed.sgstPercent ?? null,
    igstPercent: parsed.igstPercent ?? null,
    total: parsed.total ?? null,
    taxableAmount: qty != null && rate != null ? Number((qty * rate - (parsed.discount || 0)).toFixed(2)) : null,
    ...hints,
    confidence: qty && rate ? 70 : 48,
    fieldConfidence: {
      productName: name ? 65 : 0,
      quantity: qty ? 75 : 0,
      rate: rate ? 70 : 0,
      total: parsed.total ? 70 : 0,
    },
    needsReview: !(qty > 0 && rate != null && name),
  };
  return item;
}

export function extractLineItems(text, layout) {
  const lines = String(text || "").split(/\n/);
  const start = layout ? layout.index + 1 : 0;
  const items = [];
  for (let i = start; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (/^(?:grand\s*total|sub\s*total|invoice\s*total|taxable\s+value|amount\s+in\s+words|round\s*off|cgst\b|sgst\b|igst\b)/i.test(raw)) break;
    if (PAGE_SKIP.test(raw)) continue;
    if (!looksLikeProductRow(raw, Boolean(layout))) {
      const prev = items[items.length - 1];
      if (prev && raw.length < 90 && /serial|batch|warranty|mfg|ah\b|12v|hsn/i.test(raw)) {
        prev.description = `${prev.description}\n${raw}`.trim();
        prev.rawDescription = `${prev.rawDescription}\n${raw}`.trim();
        const hints = parseBatteryHints(`${prev.productName} ${raw}`);
        if (!prev.capacityAh && hints.capacityAh) prev.capacityAh = hints.capacityAh;
        if (!prev.voltage && hints.voltage) prev.voltage = hints.voltage;
        if (!prev.batteryType && hints.batteryType) prev.batteryType = hints.batteryType;
      }
      continue;
    }
    let tokens = raw.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);
    if (tokens.length < 3) tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    let parsed = layout?.columns?.length ? assignFromRight(tokens, layout.columns) : fallbackFromRight(tokens);
    if (parsed.quantity == null) {
      const fb = fallbackFromRight(raw.split(/\s+/));
      parsed = {
        ...fb,
        ...parsed,
        quantity: parsed.quantity ?? fb.quantity,
        rate: parsed.rate ?? fb.rate,
        total: parsed.total ?? fb.total,
        description: parsed.description || fb.description,
      };
    }
    const item = toLineItem(parsed, raw);
    if (!item.productName || !/[A-Za-z]{2}/.test(item.productName)) continue;
    if (item.quantity != null && (item.quantity <= 0 || item.quantity > 9999)) continue;
    items.push(item);
  }
  return items;
}

function extractSupplierAndBuyer(blob, lines) {
  const gstins = [...blob.matchAll(new RegExp(GSTIN_RE, "gi"))].map((m) => m[1].toUpperCase());
  const billToIdx = lines.findIndex((l) => /bill\s*to|buyer|customer\s*name|ship\s*to/i.test(l));
  const headerLines = billToIdx > 0 ? lines.slice(0, billToIdx) : lines.slice(0, 18);
  const headerText = headerLines.join("\n");
  const bodyText = billToIdx > 0 ? lines.slice(billToIdx).join("\n") : blob;

  const companyRe =
    /([A-Z][A-Za-z0-9&.,' \-]{3,70}(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|Limited|Industries|Distributors|Batteries|Battery|Power|Energy|Solutions))/i;
  let supplierName =
    (headerText.match(companyRe)?.[1] || blob.match(companyRe)?.[1] || "").replace(/\s+/g, " ").trim();
  if (!supplierName) {
    const top = headerLines.find(
      (l) =>
        /^[A-Z][A-Z0-9&.,' \-]{6,80}$/.test(l.trim()) &&
        !/GSTIN|INVOICE|TAX\s*INVOICE|BILL\s*TO|DATE|TOTAL|DESCRIPTION|QUANTITY/i.test(l),
    );
    supplierName = (top || "").replace(/\s+/g, " ").trim();
  }

  const supplierGst = (headerText.match(GSTIN_RE)?.[1] || gstins[0] || "").toUpperCase();
  let buyerGst = "";
  const bodyGst = bodyText.match(GSTIN_RE)?.[1];
  if (bodyGst && bodyGst.toUpperCase() !== supplierGst) buyerGst = bodyGst.toUpperCase();
  else if (gstins[1] && gstins[1] !== supplierGst) buyerGst = gstins[1];

  const addressLine = headerLines.find((l) => /\d/.test(l) && /(road|street|nagar|marg|india|state|pin)/i.test(l)) || "";

  return {
    supplierDetails: {
      name: supplierName,
      legalName: supplierName,
      address: addressLine,
      phone: (headerText.match(PHONE_RE)?.[1] || "").trim(),
      email: (headerText.match(EMAIL_RE)?.[0] || "").trim(),
      gstin: supplierGst,
      pan: (headerText.match(PAN_RE)?.[1] || "").toUpperCase(),
      state: "",
      stateCode: supplierGst ? supplierGst.slice(0, 2) : "",
    },
    buyerDetails: {
      name: "",
      legalName: "",
      address: "",
      billingAddress: "",
      shippingAddress: "",
      gstin: buyerGst,
      state: "",
      stateCode: buyerGst ? buyerGst.slice(0, 2) : "",
    },
  };
}

function extractInvoiceMeta(blob) {
  const invRaw = pickAfterLabel(blob, INVOICE_LABEL, /([A-Z0-9][A-Z0-9/._-]{3,30})/);
  const invoiceNumber = looksLikeInvoiceNumber(invRaw) ? invRaw : "";
  const dateRaw = pickAfterLabel(blob, DATE_LABEL, /([0-3]?\d[\/\-. ][A-Za-z0-9]{2,9}[\/\-. ](?:\d{4}|\d{2})|\d{4}[\/\-.][01]?\d[\/\-.][0-3]?\d)/);
  const invoiceDate = parseBillDate(dateRaw);
  const poRaw = pickAfterLabel(blob, PO_LABEL, /(?:no|number|#)?[:.\s-]*([A-Z0-9][A-Z0-9/._-]{2,24})/);
  const dueRaw = pickAfterLabel(blob, DUE_LABEL, /([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/);
  return {
    invoiceNumber,
    invoiceDate,
    purchaseOrderNumber: poRaw && !looksLikeGstin(poRaw) ? poRaw : "",
    dueDate: parseBillDate(dueRaw),
    deliveryNote: pickAfterLabel(blob, /(?:delivery\s*note|e-?way\s*bill)/i, /([A-Z0-9][A-Z0-9/._-]{3,24})/),
    placeOfSupply: pickAfterLabel(blob, /place\s*of\s*supply/i, /([^\n]{3,60})/),
    reverseCharge: pickAfterLabel(blob, /reverse\s*charge/i, /([^\n]{1,20})/),
    vehicleNumber: pickAfterLabel(blob, /(?:vehicle\s*(?:no|number)|lorry)/i, /([A-Z0-9][A-Z0-9\s-]{4,14})/),
    paymentTerms: pickAfterLabel(blob, /(?:payment\s*terms?|terms)/i, /([^\n]{4,80})/),
    poDate: parseBillDate(pickAfterLabel(blob, /(?:p\.?\s*o\.?\s*date|po\s*date)/i, /([0-3]?\d[\/\-.][01]?\d[\/\-.](?:\d{2}|\d{4}))/)),
  };
}

function extractGstTotals(blob) {
  const cgstPct = parsePercentNear(blob, ["\\bcgst\\b"]);
  const sgstPct = parsePercentNear(blob, ["\\bsgst\\b"]);
  const igstPct = parsePercentNear(blob, ["\\bigst\\b"]);
  const out = {};
  for (const [key, labels] of Object.entries(TOTAL_LABELS)) {
    out[key] = labeledMoney(blob, labels.map((l) => (key === "cgst" || key === "sgst" || key === "igst" ? `\\b${l}\\b` : l)));
  }
  if (igstPct != null && out.igst == null) {
    /* rate known, amount may still be missing */
  }
  if (out.igst != null && out.igst > 0) {
    out.cgst = out.cgst && out.igst ? null : out.cgst;
  }
  const words = blob.match(/(?:amount\s+in\s+words|inr\s*\()[:\s]*([^\n]{8,120})/i);
  out.amountInWords = words?.[1]?.trim() || "";
  out.gstRates = { cgstPct, sgstPct, igstPct };
  return out;
}

/**
 * @param {string} rawText
 * @param {{ pages?: Array<{page:number,text:string,confidence?:number}>, ocrConfidence?: number }} [ocrMeta]
 */
export function parsePurchaseBill(rawText, ocrMeta = {}) {
  const extracted = emptyExtractedBill();
  const fc = {};
  const warnings = [];
  const normalized = normalizeBillText(rawText);
  if (!normalized.trim()) {
    return { ...extracted, fieldConfidence: fc, ocrConfidence: 0, parseWarnings: ["No text was detected on this bill."] };
  }

  const pages = ocrMeta.pages?.length ? ocrMeta.pages : splitPages(normalized);
  const blob = pages.map((p) => p.text).join("\n\n");
  const lines = blob.split(/\n/).map((l) => l.trim());

  const meta = extractInvoiceMeta(blob);
  extracted.invoiceNumber = conf(fc, "invoiceNumber", meta.invoiceNumber, meta.invoiceNumber ? 80 : 0);
  extracted.invoiceDate = conf(fc, "invoiceDate", meta.invoiceDate, meta.invoiceDate ? 78 : 0);
  extracted.purchaseOrderNumber = conf(fc, "purchaseOrderNumber", meta.purchaseOrderNumber, meta.purchaseOrderNumber ? 62 : 0);
  extracted.poDate = meta.poDate;
  extracted.dueDate = conf(fc, "dueDate", meta.dueDate, meta.dueDate ? 60 : 0);
  extracted.paymentTerms = meta.paymentTerms;
  extracted.placeOfSupply = meta.placeOfSupply;
  extracted.reverseCharge = meta.reverseCharge;
  extracted.vehicleNumber = meta.vehicleNumber;
  extracted.deliveryNote = meta.deliveryNote;

  const parties = extractSupplierAndBuyer(blob, lines);
  extracted.supplierDetails = parties.supplierDetails;
  extracted.buyerDetails = parties.buyerDetails;
  if (extracted.supplierDetails.name) fc["supplierDetails.name"] = 72;
  if (extracted.supplierDetails.gstin) fc["supplierDetails.gstin"] = 90;

  const totals = extractGstTotals(blob);
  extracted.grandTotal = totals.grandTotal;
  extracted.subtotal = totals.subtotal;
  extracted.taxableAmount = totals.subtotal;
  extracted.discount = totals.discount;
  extracted.cess = totals.cess;
  extracted.freight = totals.freight;
  extracted.transportation = totals.transportation;
  extracted.packingCharges = totals.packingCharges;
  extracted.installationCharges = totals.installationCharges;
  extracted.roundOff = totals.roundOff;
  extracted.amountPaid = totals.amountPaid;
  extracted.balanceDue = totals.balanceDue;
  extracted.amountInWords = totals.amountInWords;
  if (extracted.grandTotal != null) fc.grandTotal = 78;
  if (extracted.subtotal != null) fc.subtotal = 72;

  const igstAmt = totals.igst;
  const cgstAmt = totals.cgst;
  const sgstAmt = totals.sgst;
  if (igstAmt != null && igstAmt > 0) {
    extracted.igst = igstAmt;
    extracted.cgst = null;
    extracted.sgst = null;
  } else {
    extracted.cgst = cgstAmt;
    extracted.sgst = sgstAmt;
    extracted.igst = null;
  }

  const layout = detectColumnLayout(lines);
  extracted.items = extractLineItems(blob, layout);
  if (layout) extracted.items.forEach((it) => {
    it.fieldConfidence = { ...it.fieldConfidence, layout: 70 };
  });

  if (extracted.items.length) {
    const gstRate = totals.gstRates.igstPct
      ?? (totals.gstRates.cgstPct != null && totals.gstRates.sgstPct != null
        ? totals.gstRates.cgstPct + totals.gstRates.sgstPct
        : null);
    for (const it of extracted.items) {
      if (it.gstRate == null && gstRate != null) it.gstRate = gstRate;
      if (it.cgstPercent == null && totals.gstRates.cgstPct != null && extracted.igst == null) it.cgstPercent = totals.gstRates.cgstPct;
      if (it.sgstPercent == null && totals.gstRates.sgstPct != null && extracted.igst == null) it.sgstPercent = totals.gstRates.sgstPct;
      if (it.igstPercent == null && totals.gstRates.igstPct != null) it.igstPercent = totals.gstRates.igstPct;
    }
  }

  if (!extracted.invoiceNumber) warnings.push("Invoice number was not found. Please verify.");
  if (!extracted.supplierDetails?.name && !extracted.supplierDetails?.gstin) warnings.push("Supplier was not identified. Please verify.");
  if (!extracted.items.length) warnings.push("No product rows were detected. Add lines manually if needed.");
  if (!extracted.invoiceDate) warnings.push("Invoice date was not found or could not be parsed.");

  extracted.fieldConfidence = fc;
  const scores = Object.values(fc).filter((x) => typeof x === "number" && x > 0);
  const ocrBoost = Number(ocrMeta.ocrConfidence);
  extracted.ocrConfidence = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length + (Number.isFinite(ocrBoost) ? ocrBoost : 50)) / 2)
    : Number.isFinite(ocrBoost)
      ? Math.round(ocrBoost)
      : 0;
  extracted.parseWarnings = warnings;
  extracted.pages = pages.map((p) => ({ page: p.page, text: p.text, confidence: p.confidence ?? null }));
  extracted.columnLayout = layout ? layout.cells : [];
  return extracted;
}

export { isInsufficientExtraction, emptyExtractedBill, emptyLineItem, HSN_RE };
