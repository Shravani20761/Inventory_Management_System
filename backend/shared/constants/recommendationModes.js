/** Combo quotation: dynamic inverter×battery pairing vs predefined combo inventory rows. */
export const RECOMMENDATION_MODE_DYNAMIC = "dynamic";
export const RECOMMENDATION_MODE_PREDEFINED = "predefined";

export const RECOMMENDATION_MODES = [RECOMMENDATION_MODE_DYNAMIC, RECOMMENDATION_MODE_PREDEFINED];

export const RECOMMENDATION_MODE_LABELS = {
  [RECOMMENDATION_MODE_DYNAMIC]: "Dynamic Recommendation",
  [RECOMMENDATION_MODE_PREDEFINED]: "Predefined Combo",
};

export function normalizeRecommendationMode(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    s === "predefined" ||
    s === "predefined combo" ||
    s === "combo_inventory" ||
    s === "combo-inventory" ||
    s === "static"
  ) {
    return RECOMMENDATION_MODE_PREDEFINED;
  }
  return RECOMMENDATION_MODE_DYNAMIC;
}

export function isPredefinedComboMode(value) {
  return normalizeRecommendationMode(value) === RECOMMENDATION_MODE_PREDEFINED;
}
