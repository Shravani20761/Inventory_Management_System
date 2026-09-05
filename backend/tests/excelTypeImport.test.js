import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { findColumnKey, parseBatteryExcelFile } from "../shared/utils/excelParser.js";
import { omitBlankAttributeUpdates } from "../shared/utils/excelProductAttributes.js";
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

test("header mapping: Type / Battery Type / Product Type → batteryType, not category", () => {
  for (const header of ["Type", " TYPE ", "TYPE", "type", "Battery Type", "Product Type"]) {
    assert.equal(findColumnKey(header, "Car"), "batteryType", header);
    assert.equal(findColumnKey(header, "Bike"), "batteryType", header);
  }
  assert.equal(findColumnKey("Category", "Car"), "type");
  assert.equal(findColumnKey("Product Category", "Car"), "type");
  assert.notEqual(findColumnKey("Type", "Car"), "type");
});

test("header mapping: Model Type ≠ Model", () => {
  for (const header of ["Model Type", "ModelType", "Model_Type", "Model type"]) {
    assert.equal(findColumnKey(header, HOME_INVERTER_BATTERY_TYPE), "modelType", header);
  }
  assert.equal(findColumnKey("Model", HOME_INVERTER_BATTERY_TYPE), "batteryModel");
  assert.equal(findColumnKey("Model Number", HOME_INVERTER_BATTERY_TYPE), "batteryModel");
});

test("TEST 1 — Car Battery Type comes from Excel (DIN), not Car", async () => {
  const file = fakeFileFromAoa([
    ["Category", "Brand", "Model", "Type"],
    ["Car Battery", "Exide", "TEST-CAR-1", "DIN"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].type, "Car");
  assert.equal(batteries[0].batteryType, "DIN");
  assert.notEqual(batteries[0].batteryType, "Car");
});

test("TEST 2 — Bike Battery Type comes from Excel (VRLA), not Bike", async () => {
  const file = fakeFileFromAoa([
    ["Category", "Brand", "Model", "Type"],
    ["Bike Battery", "Exide", "TEST-BIKE-1", "VRLA"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Bike" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].type, "Bike");
  assert.equal(batteries[0].batteryType, "VRLA");
  assert.notEqual(batteries[0].batteryType, "Bike");
});

test("TEST 3 — Inverter Battery Model Type comes from Excel", async () => {
  const file = fakeFileFromAoa([
    ["Category", "Brand", "Model", "Model Type"],
    ["Inverter Battery", "Luminous", "TEST-INV-1", "Tall Tubular"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: HOME_INVERTER_BATTERY_TYPE });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].model, "TEST-INV-1");
  assert.equal(batteries[0].modelType, "Tall Tubular");
});

test("TEST 4 — column order does not matter", async () => {
  const file = fakeFileFromAoa([
    ["Model Type", "Stock", "Brand", "Model", "Price"],
    ["Short Tubular", "4", "Exide", "IMTT1500", "12000"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: HOME_INVERTER_BATTERY_TYPE });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].brand, "Exide");
  assert.equal(batteries[0].model, "IMTT1500");
  assert.equal(batteries[0].modelType, "Short Tubular");
  assert.equal(batteries[0].quantity, 4);
});

test("TEST 5 — blank Type stays blank, not Car", async () => {
  const file = fakeFileFromAoa([
    ["Category", "Brand", "Model", "Type"],
    ["Car Battery", "Exide", "TEST-CAR-2", ""],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].type, "Car");
  assert.equal(batteries[0].batteryType, "");
});

test("TEST 6 — upsert does not overwrite existing Type/Model Type with blank", () => {
  const existing = { batteryType: "DIN", modelType: "Tall Tubular", inverterType: "Sine Wave", quantity: 2 };
  const incomingBlank = omitBlankAttributeUpdates({
    batteryType: "",
    modelType: "",
    inverterType: "",
    pl: "",
    quantity: 5,
  });
  assert.equal("batteryType" in incomingBlank, false);
  assert.equal("modelType" in incomingBlank, false);
  assert.equal("inverterType" in incomingBlank, false);
  assert.equal("pl" in incomingBlank, false);
  assert.equal(incomingBlank.quantity, 5);

  const incomingChanged = omitBlankAttributeUpdates({
    batteryType: "JIS",
    modelType: "Short Tubular",
    inverterType: "Pure Sine Wave",
    quantity: 5,
  });
  assert.equal(incomingChanged.batteryType, "JIS");
  assert.equal(incomingChanged.modelType, "Short Tubular");
  assert.equal(incomingChanged.inverterType, "Pure Sine Wave");

  const merged = { ...existing, ...incomingBlank };
  assert.equal(merged.batteryType, "DIN");
  assert.equal(merged.modelType, "Tall Tubular");
  assert.equal(merged.inverterType, "Sine Wave");
});

test("header mapping: inverter Type / Inverter Type → inverterType, not category", () => {
  for (const header of ["Type", " TYPE ", "TYPE", "type", "Inverter Type", "Product Type"]) {
    assert.equal(findColumnKey(header, "Inverter"), "inverterType", header);
  }
  assert.notEqual(findColumnKey("Type", "Inverter"), "type");
  assert.notEqual(findColumnKey("Type", "Inverter"), "batteryType");
});

test("TEST 7 — Inverter Type is copied from Excel as-is", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "Type"],
    ["Luminous", "Zelio 1100", "Pure Sine Wave"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Inverter" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].type, "Inverter");
  assert.equal(batteries[0].inverterType, "Pure Sine Wave");
  assert.notEqual(batteries[0].inverterType, "Inverter");
});

test("TEST 8 — blank Inverter Type stays blank, not Inverter", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "Type"],
    ["Luminous", "Zelio 1100", ""],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Inverter" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].type, "Inverter");
  assert.equal(batteries[0].inverterType, "");
});

test("TEST 9 — Battery Type column copies as-is (JIS)", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "Battery Type"],
    ["Exide", "TEST-CAR-3", "JIS"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].type, "Car");
  assert.equal(batteries[0].batteryType, "JIS");
});

test("TEST 10 — Home inverter Battery Type and Model Type stay independent", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "Model Type", "Battery Type"],
    ["Luminous", "RC18000", "Tall Tubular", "Tubular"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: HOME_INVERTER_BATTERY_TYPE });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].modelType, "Tall Tubular");
  assert.equal(batteries[0].batteryType, "Tubular");
  assert.notEqual(batteries[0].batteryType, batteries[0].modelType);
});
