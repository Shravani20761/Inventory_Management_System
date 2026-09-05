import { parseGenericBillItems } from "./genericBillParser.js";
import { parseExideBillItems } from "./exideBillParser.js";
import { parseAmaronBillItems } from "./amaronBillParser.js";
import { parseLuminousBillItems } from "./luminousBillParser.js";
import { parseMicrotekBillItems } from "./microtekBillParser.js";

function detectSupplierFamily(text) {
  const t = String(text || "").toUpperCase();
  if (/\bEXIDE\b/.test(t)) return "exide";
  if (/\bAMARON\b/.test(t)) return "amaron";
  if (/\bLUMINOUS\b/.test(t)) return "luminous";
  if (/\bMICROTEK\b/.test(t)) return "microtek";
  return "generic";
}

const FAMILY_PARSERS = {
  exide: parseExideBillItems,
  amaron: parseAmaronBillItems,
  luminous: parseLuminousBillItems,
  microtek: parseMicrotekBillItems,
  generic: parseGenericBillItems,
};

/** Supplier-specific parsers wrap the generic table parser. They are not used unless the supplier name is detected. */
export function parseItemsWithStrategy(table, rawText) {
  const family = detectSupplierFamily(rawText);
  const parse = FAMILY_PARSERS[family] || parseGenericBillItems;
  const items = parse(table);
  return { family, items };
}

export { parseGenericBillItems };
