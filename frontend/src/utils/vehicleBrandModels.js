import data from "../data/vehicleBrandModels.json";

/** @returns {string[]} */
export function listCarBrands() {
  return Object.keys(data.cars || {}).sort((a, b) => a.localeCompare(b));
}

/** @param {string} brand */
export function listCarModels(brand) {
  if (!brand || !data.cars?.[brand]) return [];
  return Object.keys(data.cars[brand]).sort((a, b) => a.localeCompare(b));
}

/** @param {string} brand @param {string} model */
export function listCarFuelsFromJson(brand, model) {
  const arr = data.cars?.[brand]?.[model];
  return Array.isArray(arr) ? [...arr] : [];
}

/** @returns {string[]} */
export function listBikeBrands() {
  return Object.keys(data.bikes || {}).sort((a, b) => a.localeCompare(b));
}

/** @param {string} brand */
export function listBikeModels(brand) {
  const v = data.bikes?.[brand];
  if (!Array.isArray(v)) return [];
  return [...v].sort((a, b) => a.localeCompare(b));
}
