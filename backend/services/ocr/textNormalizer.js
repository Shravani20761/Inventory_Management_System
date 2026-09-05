/**
 * Normalize OCR/PDF text before parsing.
 * Does not blindly rewrite characters that could be part of product codes (0/O, 1/I, 5/S).
 */

const LABEL_FIXES = [
  [/invioce/gi, "Invoice"],
  [/invoicenumber/gi, "Invoice Number"],
  [/tax\s*lnvoice/gi, "Tax Invoice"],
  [/quantlty/gi, "Quantity"],
  [/qunatity/gi, "Quantity"],
  [/amoun t/gi, "Amount"],
  [/tota1/gi, "Total"],
  [/sub\s*tota1/gi, "Subtotal"],
  [/g5tin/gi, "GSTIN"],
  [/gst1n/gi, "GSTIN"],
  [/cg5t/gi, "CGST"],
  [/sg5t/gi, "SGST"],
  [/ig5t/gi, "IGST"],
];

export function collapseSpaces(line) {
  return String(line || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function stripCurrencyNoise(value) {
  return String(value || "")
    .replace(/[₹]/g, "")
    .replace(/\b(?:rs\.?|inr)\b/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBillText(raw) {
  let text = String(raw || "")
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[|¦]/g, " | ");

  for (const [re, to] of LABEL_FIXES) text = text.replace(re, to);

  const lines = text.split("\n").map((line) => {
    let l = line.replace(/\u00a0/g, " ").replace(/[ \t]*\t[ \t]*/g, "  ");
    l = l.replace(/ {3,}/g, "  ");
    l = l.replace(/[.]{3,}/g, " ");
    return l.trimEnd();
  });

  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  const compact = [];
  let blank = 0;
  for (const line of lines) {
    if (!line.trim()) {
      blank += 1;
      if (blank <= 1) compact.push("");
      continue;
    }
    blank = 0;
    compact.push(line.trim());
  }

  return compact.join("\n");
}

export function splitPages(text) {
  const blob = String(text || "");
  const parts = blob.split(/\n+----- PAGE(?:\s+\d+)? -----\n+/i);
  if (parts.length <= 1) return [{ page: 1, text: blob }];
  return parts.map((t, i) => ({ page: i + 1, text: t }));
}
