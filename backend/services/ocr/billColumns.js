/** Shared purchase-bill column aliases. */

export const COL_ALIASES = {
  sku: ["sku", "code", "item code", "product code", "part no", "part number", "model", "model no", "item no"],
  description: [
    "description",
    "item",
    "product",
    "product name",
    "displayname",
    "display name",
    "particulars",
    "goods",
    "description of goods",
    "name of product",
  ],
  hsn: ["hsn", "hsn/sac", "sac", "hsn code"],
  qty: ["qty", "qty.", "quantity", "qnty", "nos", "pcs", "units"],
  rate: ["rate", "unit rate", "price", "unit price", "purchase rate", "rate (inr)", "rate inr"],
  discount: ["discount", "disc", "disc%", "disc %", "disc amt", "disc amount", "spcl disc", "special disc", "less"],
  gst: ["gst", "gst%", "gst %", "gst rate", "tax", "tax%"],
  cgst: ["cgst", "cgst%", "c gst"],
  sgst: ["sgst", "sgst%", "s gst"],
  igst: ["igst", "igst%", "i gst"],
  amount: ["amount", "total", "value", "taxable value", "taxable amount", "line total", "net amount", "total with gst"],
};

export function normalizeHeaderToken(cell) {
  return String(cell || "")
    .toLowerCase()
    .replace(/[^a-z0-9/%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function aliasKey(cell) {
  const n = normalizeHeaderToken(cell);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    if (aliases.some((a) => n === a || n.includes(a))) return key;
  }
  return null;
}

/** Header matching must be exact so "Product Qty Rate" is not one Description column. */
export function headerAliasKey(cell) {
  const n = normalizeHeaderToken(cell);
  if (!n) return null;
  let best = null;
  let bestLen = 0;
  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    for (const a of aliases) {
      if (n === a && a.length >= bestLen) {
        best = key;
        bestLen = a.length;
      }
    }
  }
  return best;
}

export const FOOTER_RE =
  /^(?:grand\s*total|sub\s*total|invoice\s*total|taxable\s+value|amount\s+in\s+words|round\s*off|bank\s+details|authorised\s+signatory|terms\s+and\s+conditions|e\.?\s*&?\s*o\.?\s*e\.?|less\s*discount|total\s*qty|add(?:itional)?\s*gst|freight|packing|transport(?:ation)?|amount\s*paid|balance\s*due)/i;

export const HEADER_REPEAT_RE = /(?:description|particulars|qty|quantity|rate|amount|hsn)/i;
export const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i;
export const PHONE_TOKEN_RE = /^\+?\d[\d\s-]{8,16}$/;
