/** Quotation engine categories — inventory stays one `Product` collection filtered by `type`. */
export const QUOTATION_KINDS = ["combo", "inverter", "battery", "car", "bike"];

export const QUOTATION_KIND_LABELS = {
  combo: "Inverter + Battery (home)",
  inverter: "Inverter only",
  battery: "Battery only (home backup)",
  car: "Car battery",
  bike: "Bike battery",
};

export const QUOTATION_KEY_PREFIX = {
  combo: "COMBO-QT",
  inverter: "INV-QT",
  battery: "BAT-QT",
  car: "CAR-QT",
  bike: "BIKE-QT",
};

export function normalizeQuotationKind(value) {
  const k = String(value ?? "combo")
    .trim()
    .toLowerCase();
  return QUOTATION_KINDS.includes(k) ? k : "combo";
}
