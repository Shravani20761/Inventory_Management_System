import { parseGenericBillItems } from "./genericBillParser.js";

/** Placeholder for Amaron-specific layout rules. Uses the generic positional parser until a layout is reliably detected. */
export function parseAmaronBillItems(table) {
  return parseGenericBillItems(table);
}
