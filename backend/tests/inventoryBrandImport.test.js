import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { findColumnKey, parseBatteryExcelFile } from "../shared/utils/excelParser.js";
import {
  INVENTORY_CATEGORIES,
  applyUploadBrand,
  brandMismatchWarning,
  canonicalInventoryBrand,
  canonicalInventoryCategoryLabel,
  inventoryBrandCounts,
  inventoryRowMatchesBrandSubcategory,
} from "../shared/constants/inventoryCategories.js";
import { HOME_INVERTER_BATTERY_TYPE } from "../shared/constants/inventoryTypes.js";

function fakeFileFromAoa(aoa, name = "test.xlsx") {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const u8 = Buffer.isBuffer(buf) ? new Uint8Array(buf) : new Uint8Array(buf);
  return {
    size: u8.byteLength,
    name,
    arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
  };
}

const batteryTab = INVENTORY_CATEGORIES.find((c) => c.id === "battery");
const carTab = INVENTORY_CATEGORIES.find((c) => c.id === "car-battery");
const inverterTab = INVENTORY_CATEGORIES.find((c) => c.id === "inverter");

function chipFor(category, rows, brand) {
  return inventoryRowMatchesBrandSubcategory({ brand }, category, brand);
}

test("header mapping: Brand / Manufacturer / Make → brand", () => {
  for (const header of ["Brand", "Manufacturer", "Make", "Company", "Brand Name"]) {
    assert.equal(findColumnKey(header, "Car"), "brand", header);
    assert.equal(findColumnKey(header, HOME_INVERTER_BATTERY_TYPE), "brand", header);
    assert.equal(findColumnKey(header, "Inverter"), "brand", header);
  }
});

test("header mapping: Category ≠ Type", () => {
  assert.equal(findColumnKey("Category", "Car"), "type");
  assert.equal(findColumnKey("Product Category", "Car"), "type");
  assert.equal(findColumnKey("Type", "Car"), "batteryType");
  assert.notEqual(findColumnKey("Type", "Car"), "type");
});

test("canonical brand variants", () => {
  assert.equal(canonicalInventoryBrand("EXIDE"), "Exide");
  assert.equal(canonicalInventoryBrand("Exide Industries"), "Exide");
  assert.equal(canonicalInventoryBrand("AMARON"), "Amaron");
  assert.equal(canonicalInventoryBrand("amaron"), "Amaron");
  assert.equal(canonicalInventoryBrand("LUMINOUS"), "Luminous");
  assert.equal(canonicalInventoryBrand("Luminous Power"), "Luminous");
  assert.equal(canonicalInventoryBrand("MICROTEK"), "Microtek");
  assert.equal(canonicalInventoryBrand("Unknown"), "");
  assert.equal(canonicalInventoryBrand("XYZ Battery"), "XYZ Battery");
});

test("Inverter and Battery chips keep previous order and include Amaron", () => {
  assert.deepEqual(inverterTab.brands, ["Microtek", "Exide", "Luminous", "SF Sonic", "Amaron"]);
  assert.deepEqual(batteryTab.brands, ["Microtek", "SF Sonic", "Exide", "Luminous", "Livfast", "Amaron"]);
  assert.equal(inventoryRowMatchesBrandSubcategory({ brand: "Amaron" }, inverterTab, "Amaron"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory({ brand: "Amaron" }, batteryTab, "Amaron"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory({ brand: "Amaron" }, inverterTab, "Other"), false);
});

test("canonical category labels", () => {
  assert.equal(canonicalInventoryCategoryLabel("CAR BATTERY"), "Car Battery");
  assert.equal(canonicalInventoryCategoryLabel("Car Battery"), "Car Battery");
  assert.equal(canonicalInventoryCategoryLabel("Inverter Battery"), "Battery");
  assert.equal(canonicalInventoryCategoryLabel("Inverter"), "Inverter");
});

test("TEST 1 — Exide Car Battery is not Other", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Category", "Model", "Type"],
    ["Exide", "Car Battery", "TEST-EXIDE-1", "DIN"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Exide");
  assert.equal(batteries[0].type, "Car");
  assert.equal(batteries[0].batteryType, "DIN");
  const counts = inventoryBrandCounts(batteries, carTab);
  assert.equal(counts.find((c) => c.brand === "Exide")?.count, 1);
  assert.equal(counts.find((c) => c.isOther)?.count ?? 0, 0);
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], carTab, "Exide"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], carTab, "Other"), false);
});

test("TEST 2 — Amaron Car Battery is not Other", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Category", "Model", "Type"],
    ["Amaron", "Car Battery", "TEST-AMARON-1", "JIS"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Amaron");
  const counts = inventoryBrandCounts(batteries, carTab);
  assert.equal(counts.find((c) => c.brand === "Amaron")?.count, 1);
  assert.equal(counts.find((c) => c.isOther)?.count ?? 0, 0);
});

test("TEST 3 — Luminous Inverter Battery is not Other", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Category", "Model", "Model Type"],
    ["Luminous", "Inverter Battery", "RC18000", "Tall Tubular"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: HOME_INVERTER_BATTERY_TYPE });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Luminous");
  const counts = inventoryBrandCounts(batteries, batteryTab);
  assert.equal(counts.find((c) => c.brand === "Luminous")?.count, 1);
  assert.equal(counts.find((c) => c.isOther)?.count ?? 0, 0);
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], batteryTab, "Luminous"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], batteryTab, "Other"), false);
});

test("TEST 4 — Microtek Inverter Battery is not Other", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Category", "Model"],
    ["Microtek", "Inverter Battery", "MTK-150"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: HOME_INVERTER_BATTERY_TYPE });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Microtek");
  const counts = inventoryBrandCounts(batteries, batteryTab);
  assert.equal(counts.find((c) => c.brand === "Microtek")?.count, 1);
  assert.equal(counts.find((c) => c.isOther)?.count ?? 0, 0);
});

test("TEST 5 — column order does not matter", async () => {
  const file = fakeFileFromAoa([
    ["Model", "Price", "Category", "Brand", "Stock"],
    ["IMTT1500", "12000", "Inverter Battery", "Exide", "4"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: HOME_INVERTER_BATTERY_TYPE });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Exide");
  assert.equal(batteries[0].model, "IMTT1500");
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], batteryTab, "Exide"), true);
});

test("TEST 6 — EXIDE / CAR BATTERY case variants", async () => {
  const file = fakeFileFromAoa([
    ["BRAND", "CATEGORY", "MODEL"],
    ["EXIDE", "CAR BATTERY", "TEST-EXIDE-CASE"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Exide");
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], carTab, "Exide"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], carTab, "Other"), false);
});

test("TEST 7 — unknown brand can be Other; known brands never are", () => {
  const rows = [
    { brand: "XYZ Battery", type: "Car" },
    { brand: "Exide Industries", type: "Car" },
  ];
  const counts = inventoryBrandCounts(rows, carTab);
  assert.equal(counts.find((c) => c.brand === "Exide")?.count, 1);
  assert.equal(counts.find((c) => c.isOther)?.count, 1);
  assert.equal(inventoryRowMatchesBrandSubcategory(rows[0], carTab, "Other"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(rows[1], carTab, "Other"), false);
});

test("Exide Industries on Battery tab is Exide, not Other", () => {
  const row = { brand: "Exide Industries" };
  assert.equal(chipFor(batteryTab, [row], "Exide"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(row, batteryTab, "Other"), false);
});

test("Amaron on Battery tab is Amaron, not Other", () => {
  const row = { brand: "Amaron" };
  assert.equal(inventoryRowMatchesBrandSubcategory(row, batteryTab, "Amaron"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(row, batteryTab, "Other"), false);
});

test("Luminous inverter SKU is Luminous, not Other", () => {
  const row = { brand: "LUMINOUS POWER", type: "Inverter" };
  assert.equal(inventoryRowMatchesBrandSubcategory(row, inverterTab, "Luminous"), true);
  assert.equal(inventoryRowMatchesBrandSubcategory(row, inverterTab, "Other"), false);
});

test("applyUploadBrand does not overwrite Excel Amaron with selected Exide", () => {
  const rows = applyUploadBrand([{ brand: "Amaron", model: "X" }], "Exide", carTab.brands);
  assert.equal(rows[0].brand, "Amaron");
  const warn = brandMismatchWarning("Exide", rows.map((r) => r.brand));
  assert.match(warn, /Selected section: Exide/);
  assert.match(warn, /Amaron/);
});

test("applyUploadBrand fills blank brand from selected chip only", () => {
  const rows = applyUploadBrand([{ brand: "", model: "X" }], "Exide", carTab.brands);
  assert.equal(rows[0].brand, "Exide");
});

test("missing brand is not stored as Unknown and is not Other", async () => {
  const file = fakeFileFromAoa([
    ["Model", "Type"],
    ["NO-BRAND-1", "DIN"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.notEqual(batteries[0].brand, "Unknown");
  assert.equal(inventoryRowMatchesBrandSubcategory(batteries[0], carTab, "Other"), false);
});
