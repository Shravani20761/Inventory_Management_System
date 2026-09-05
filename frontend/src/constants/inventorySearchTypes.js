import { HOME_BATTERY_TYPES } from "./batteryTypes.js";

export const INVENTORY_SEARCH_TYPES = [
  { id: "battery", label: "Battery", endpoint: "battery", badge: "Home backup" },
  { id: "inverter", label: "Inverter", endpoint: "inverter", badge: "Inverter" },
  { id: "car-battery", label: "Car Battery", endpoint: "car-battery", badge: "Automotive" },
  { id: "bike-battery", label: "Bike Battery", endpoint: "bike-battery", badge: "Two-wheeler" },
  { id: "combo", label: "Combo", endpoint: "combo", badge: "Inv + Bat" },
  { id: "trolley", label: "Trolley", endpoint: "trolley", badge: "Luminous" },
];

export const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric"];

export const COMBO_BRAND_PAIRINGS = [
  { id: "mixed", label: "Mixed brand OK" },
  { id: "same", label: "Same brand only" },
];

export const SEARCH_FORM_CONFIG = {
  battery: {
    fields: [
      { key: "brand", label: "Brand", placeholder: "Exide" },
      { key: "capacityAh", label: "Battery AH", placeholder: "200", inputMode: "numeric" },
      {
        key: "batteryType",
        label: "Battery type",
        type: "select",
        options: [{ value: "", label: "Any type" }, ...HOME_BATTERY_TYPES.map((t) => ({ value: t, label: t }))],
      },
      { key: "modelNumber", label: "Model number", placeholder: "IMTT1500" },
    ],
  },
  inverter: {
    fields: [
      { key: "brand", label: "Brand", placeholder: "Luminous" },
      { key: "inverterVA", label: "Inverter VA", placeholder: "1500", inputMode: "numeric" },
      { key: "modelNumber", label: "Model number", placeholder: "Eco Volt" },
      { key: "technology", label: "Inverter Type", placeholder: "Sine Wave" },
    ],
  },
  "car-battery": {
    fields: [
      { key: "vehicleBrand", label: "Car brand", placeholder: "Maruti" },
      { key: "vehicleModel", label: "Car model", placeholder: "Swift" },
      {
        key: "fuelType",
        label: "Fuel type",
        type: "select",
        options: [{ value: "", label: "Select fuel" }, ...FUEL_TYPES.map((f) => ({ value: f, label: f }))],
      },
      { key: "capacity", label: "Battery AH", placeholder: "55", inputMode: "numeric" },
      { key: "brand", label: "Battery brand (optional)", placeholder: "Exide" },
      { key: "modelNumber", label: "Battery model (optional)", placeholder: "A555" },
    ],
  },
  "bike-battery": {
    fields: [
      { key: "bikeBrand", label: "Bike brand", placeholder: "Hero" },
      { key: "bikeModel", label: "Bike model", placeholder: "Splendor" },
      { key: "capacity", label: "Battery AH", placeholder: "9", inputMode: "numeric" },
      { key: "brand", label: "Battery brand (optional)", placeholder: "Exide" },
      { key: "modelNumber", label: "Battery model (optional)", placeholder: "XLTZ9" },
    ],
  },
  combo: {
    fields: [
      { key: "inverterVA", label: "Inverter VA", placeholder: "1500", inputMode: "numeric" },
      { key: "batteryAH", label: "Battery AH", placeholder: "200", inputMode: "numeric" },
      {
        key: "batteryType",
        label: "Battery type",
        type: "select",
        options: [{ value: "", label: "Any type" }, ...HOME_BATTERY_TYPES.map((t) => ({ value: t, label: t }))],
      },
      { key: "brandPreference", label: "Brand preference", placeholder: "Exide" },
      {
        key: "brandPairing",
        label: "Brand pairing",
        type: "select",
        options: COMBO_BRAND_PAIRINGS.map((p) => ({ value: p.id, label: p.label })),
      },
    ],
  },
  trolley: {
    fields: [
      { key: "brand", label: "Brand", placeholder: "Luminous" },
      { key: "modelNumber", label: "Trolley model", placeholder: "Trolley 1500 VA" },
      { key: "compatibleVA", label: "Compatible VA", placeholder: "1500", inputMode: "numeric" },
    ],
  },
};

export function inventoryTypeLabel(id) {
  return INVENTORY_SEARCH_TYPES.find((t) => t.id === id)?.label ?? id;
}
