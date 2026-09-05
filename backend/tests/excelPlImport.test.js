import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { findColumnKey, parseBatteryExcelFile } from "../shared/utils/excelParser.js";

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

test("header mapping: P&L / Profit & Loss / PnL → pl, Place stays place", () => {
  for (const header of ["P&L", "P & L", "PnL", "PL", "Profit & Loss", "Profit and Loss", "Profit/Loss"]) {
    assert.equal(findColumnKey(header, "Car"), "pl", header);
  }
  assert.equal(findColumnKey("Place", "Car"), "place");
  assert.notEqual(findColumnKey("Place", "Car"), "pl");
});

test("Car sheet P&L is copied as-is, not sell minus DP", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "DP", "New Rate With OB", "P&L"],
    ["Exide", "TEST-PL-1", "1000", "1500", "250"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].pl, "250");
  assert.notEqual(batteries[0].pl, "500");
});

test("sheet without P&L column leaves pl blank (not calculated)", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "DP", "New Rate With OB"],
    ["Exide", "TEST-PL-2", "1000", "1500"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Car" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].pl, "");
});

test("Inverter sheet P&L is copied as-is", async () => {
  const file = fakeFileFromAoa([
    ["Brand", "Model", "DP", "Selling Price", "Profit & Loss"],
    ["Luminous", "INV-PL-1", "8000", "10000", "12%"],
  ]);
  const { batteries, errors } = await parseBatteryExcelFile(file, { importType: "Inverter" });
  assert.equal(batteries.length, 1, errors.join("; "));
  assert.equal(batteries[0].pl, "12%");
  assert.notEqual(batteries[0].pl, "2000");
});
