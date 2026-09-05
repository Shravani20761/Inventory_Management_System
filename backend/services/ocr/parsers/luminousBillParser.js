import { parseGenericBillItems } from "./genericBillParser.js";

/** Placeholder for Luminous-specific layout rules. Uses the generic positional parser until a layout is reliably detected. */
export function parseLuminousBillItems(table) {
  return parseGenericBillItems(table);
}
