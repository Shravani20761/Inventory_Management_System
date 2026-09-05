/**
 * Single source of truth for Excel/CSV header → inventory field mapping.
 * Used by excelParser, import preview, and backend validation.
 */
import { COMBO_COLUMN_MAP_ORDERED } from "./comboInventoryImport.js";
import { INVERTER_COLUMN_MAP_ORDERED } from "./inverterInventoryImport.js";
import { HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED } from "./homeInverterBatteryImport.js";
import { TROLLEY_COLUMN_MAP_ORDERED } from "./trolleyInventoryImport.js";
import { LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED } from "./lithiumIonBatteryImport.js";
import {
  isHomeInverterBatterySection,
  isInverterBatterySection,
  isInverterOnlySection,
  isLithiumIonBatterySection,
  isTrolleySection,
} from "./inventoryTypes.js";

/** Automotive (Car / Bike / Truck) — header aliases in priority order. */
export const AUTOMOTIVE_COLUMN_MAP_ORDERED = [
  { key: "srNo", label: "Sr.No", aliases: ["sr.no", "sr no", "srno", "s.no", "serial", "serial no", "serial number"] },
  {
    key: "model",
    label: "Model",
    aliases: [
      "model",
      "model name",
      "model number",
      "model no",
      "model no.",
      "product model",
      "battery model",
      "product",
      "product name",
      "part number",
      "part no",
    ],
  },
  { key: "brand", label: "Brand", aliases: ["brand", "manufacturer", "make"] },
  {
    key: "sku",
    label: "SKU",
    aliases: ["sku", "product code", "item code", "product id", "item id", "sku code"],
  },
  {
    key: "batteryType",
    label: "Type",
    aliases: ["type", "battery type", "product type", "batt type", "cell type"],
  },
  {
    key: "type",
    label: "Category",
    aliases: [
      "category",
      "product category",
      "vehicle type",
      "inverter+battery",
      "inverter battery",
      "inv+battery",
      "inv + battery",
      "inv+batt",
      "combo type",
      "combo sku",
    ],
  },
  {
    key: "productCapacity",
    label: "Product Capacity",
    aliases: [
      "product capacity",
      "prod capacity",
      "capacity (",
      "spec",
      "capacity spec",
      "technical",
      "rating",
      "battery spec",
      "batt spec",
      "product cap",
      "volt watt ah",
      "v/w/ah",
    ],
  },
  {
    key: "ah",
    label: "AH",
    aliases: [
      "ah",
      "ah capacity",
      "amp hour",
      "amp-hour",
      "ampere hour",
      "amp hours",
      "amperage",
      "ampere",
      "amps",
      "capacity ah",
      "capacity (ah)",
      "nom ah",
      "nom. ah",
      "a.h.",
      "(ah)",
    ],
  },
  {
    key: "voltage",
    label: "Voltage",
    aliases: ["voltage", "volt", "volts", "v rating", "nominal voltage"],
  },
  {
    key: "quantity",
    label: "Stock",
    aliases: ["quantity", "qty", "stock", "stock quantity", "units", "available", "available stock"],
  },
  { key: "weight", label: "Weight", aliases: ["weight", "wt", "net weight"] },
  {
    key: "warranty",
    label: "Warranty",
    aliases: [
      "warranty",
      "waranty",
      "warranty period",
      "warranty (months)",
      "warranty months",
      "warr",
      "guarantee",
      "guarantee period",
      "free replacement warranty",
      "frw",
    ],
  },
  {
    key: "scrapRate",
    label: "Scrap Rate",
    aliases: ["scrap rate", "scrap", "scrap price", "scrap value", "scrap amount"],
  },
  {
    key: "dpPlusGst",
    label: "DP",
    aliases: [
      "dp + gst",
      "dp+gst",
      "dpgst",
      "dp gst",
      "dealer price",
      "dp  gst",
      "dp",
      "distributor price",
    ],
  },
  { key: "cd", label: "CD", aliases: ["cd", "cash discount", "cash discount price", "cash price"] },
  {
    key: "mrp",
    label: "MRP",
    aliases: ["mrp", "max retail", "m.r.p", "m.r.p.", "max retail price"],
  },
  {
    key: "newRateWithoutOB",
    label: "Price (Without Old Battery)",
    aliases: [
      "new rate w/o b",
      "new rate without",
      "without old battery",
      "without ob",
      "w/o ob",
      "w/o b",
      "wo ob",
      "no ob",
      "without old",
    ],
  },
  {
    key: "newRateWithOB",
    label: "Price (With Old Battery)",
    aliases: [
      "new rate with ob",
      "new rate with old battery",
      "rate with ob",
      "rate with old battery",
      "with old battery",
      "with old",
      "with ob",
      "new rate — with ob",
      "new rate - with ob",
      "final price with old battery",
      "final with old battery",
      "price with old battery",
      "price with old",
      "selling with old",
    ],
  },
  {
    key: "sellRate",
    label: "Selling Price",
    aliases: ["sell rate", "sell price", "selling price", "selling rate", "sale price", "retail price", "shop price"],
  },
  {
    key: "purchaseRate",
    label: "Purchase Price",
    aliases: ["purchase rate", "purchase price", "buy rate", "buy price", "cost price", "buying price", "cost", "purchase"],
  },
  { key: "supplier", label: "Supplier", aliases: ["supplier", "vendor", "distributor", "supplier name"] },
  { key: "invoiceNo", label: "Invoice No", aliases: ["invoice", "invoice no", "invoice number", "bill no", "bill number"] },
  { key: "place", label: "Place", aliases: ["place", "location", "city"] },
  {
    key: "imageUrl",
    label: "Image",
    aliases: ["image", "image url", "image link", "photo", "product image", "picture"],
  },
  { key: "notes", label: "Notes", aliases: ["notes", "remark", "remarks", "comment", "comments"] },
];

function enrichFields(list) {
  return list.map((f) => ({
    key: f.key,
    label: f.label ?? formatFieldLabel(f.key),
    aliases: f.aliases ?? [],
    required: Boolean(f.required),
  }));
}

function formatFieldLabel(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Legacy object map for automotive findColumnKey fallbacks. */
export const AUTOMOTIVE_COLUMN_MAP = Object.fromEntries(
  AUTOMOTIVE_COLUMN_MAP_ORDERED.map(({ key, aliases }) => [key, aliases]),
);

const REQUIRED_BY_SECTION = {
  automotive: [{ key: "model", label: "Model" }],
  inverter: [{ key: "model", label: "Inverter Model" }],
  combo: [
    { key: "comboId", label: "Combo ID", altKeys: ["inverterModel", "batteryModel", "model"] },
  ],
  homeInv: [{ key: "batteryModel", label: "Battery Model", altKeys: ["model"] }],
  trolley: [{ key: "model", label: "Trolley Model" }],
  lithium: [
    { key: "batteryModel", label: "Battery Model", altKeys: ["model"] },
    { key: "dp", label: "DP", altKeys: ["dpPlusGst", "purchaseRate"] },
    { key: "cd", label: "CD" },
  ],
};

export function getColumnMapOrderedForImportType(importType) {
  if (isInverterBatterySection(importType)) return enrichFields(COMBO_COLUMN_MAP_ORDERED);
  if (isInverterOnlySection(importType)) return enrichFields(INVERTER_COLUMN_MAP_ORDERED);
  if (isHomeInverterBatterySection(importType)) return enrichFields(HOME_INVERTER_BATTERY_COLUMN_MAP_ORDERED);
  if (isTrolleySection(importType)) return enrichFields(TROLLEY_COLUMN_MAP_ORDERED);
  if (isLithiumIonBatterySection(importType)) return enrichFields(LITHIUM_ION_BATTERY_COLUMN_MAP_ORDERED);
  return enrichFields(AUTOMOTIVE_COLUMN_MAP_ORDERED);
}

export function getRequiredFieldRulesForImportType(importType) {
  if (isInverterBatterySection(importType)) return REQUIRED_BY_SECTION.combo;
  if (isInverterOnlySection(importType)) return REQUIRED_BY_SECTION.inverter;
  if (isHomeInverterBatterySection(importType)) return REQUIRED_BY_SECTION.homeInv;
  if (isTrolleySection(importType)) return REQUIRED_BY_SECTION.trolley;
  if (isLithiumIonBatterySection(importType)) return REQUIRED_BY_SECTION.lithium;
  return REQUIRED_BY_SECTION.automotive;
}

export function getFieldLabel(importType, fieldKey) {
  const def = getColumnMapOrderedForImportType(importType).find((f) => f.key === fieldKey);
  return def?.label ?? formatFieldLabel(fieldKey);
}

export function isValidFieldKeyForImportType(importType, fieldKey) {
  if (!fieldKey || fieldKey === "__ignore__") return fieldKey === "__ignore__";
  return getColumnMapOrderedForImportType(importType).some((f) => f.key === fieldKey);
}

export function getAllFieldOptionsForImportType(importType) {
  return getColumnMapOrderedForImportType(importType).map((f) => ({
    key: f.key,
    label: f.label,
    required: Boolean(f.required),
  }));
}
