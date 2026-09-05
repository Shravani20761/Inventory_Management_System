import { guessBrand, parseBatteryHints, emptyLineItem } from "../billParseHeuristics.js";

function extractModelCode(name) {
  const tokens = String(name || "").split(/\s+/);
  const codes = tokens.filter(
    (t) => /[A-Z]/i.test(t) && /\d/.test(t) && t.length >= 4 && t.length <= 18 && !/^(GSTIN|HSN|CGST|SGST|IGST)$/i.test(t),
  );
  return codes.sort((a, b) => b.length - a.length)[0] || "";
}

export function tableRowToLineItem(assigned) {
  const name = assigned.description || assigned.sku || "";
  const sku = assigned.sku || extractModelCode(name);
  const hints = parseBatteryHints(`${name} ${assigned.raw || ""}`);
  const qty = assigned.quantity;
  const rate = assigned.rate;
  const fc = assigned.confidenceByField || {};
  const mathBad =
    qty != null &&
    rate != null &&
    assigned.total != null &&
    Math.abs(qty * rate - (assigned.discount || 0) - assigned.total) > Math.max(2, Math.abs(assigned.total) * 0.05);
  return {
    ...emptyLineItem(),
    rawDescription: assigned.raw || "",
    productName: name,
    description: name,
    sku,
    modelNumber: sku,
    brand: guessBrand(name),
    hsn: assigned.hsn || "",
    quantity: qty,
    unit: "Nos",
    rate,
    discount: assigned.discount ?? null,
    gstRate: assigned.gstRate ?? null,
    total: assigned.total ?? null,
    taxableAmount: assigned.taxableAmount ?? (qty != null && rate != null ? Number((qty * rate - (assigned.discount || 0)).toFixed(2)) : null),
    ...hints,
    confidence: Math.round(
      Object.values(fc)
        .filter((n) => typeof n === "number" && n > 0)
        .reduce((a, b, i, arr) => a + b / arr.length, 0) || 50,
    ),
    fieldConfidence: fc,
    needsReview: Boolean(assigned.needsReview || !name || qty == null || mathBad),
    parseSource: assigned.source || "positional",
    page: assigned.page || 1,
  };
}

export function parseGenericBillItems(table) {
  return (table?.items || []).map(tableRowToLineItem);
}
