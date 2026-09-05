import { parseGenericBillItems } from "./genericBillParser.js";

/** Placeholder for Microtek-specific layout rules. Uses the generic positional parser until a layout is reliably detected. */
export function parseMicrotekBillItems(table) {
  return parseGenericBillItems(table);
}
