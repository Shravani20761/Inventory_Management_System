import { parseGenericBillItems } from "./genericBillParser.js";

/** Placeholder for Exide-specific layout rules. Uses the generic positional parser until a layout is reliably detected. */
export function parseExideBillItems(table) {
  return parseGenericBillItems(table);
}
