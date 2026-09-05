import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructTables, uniqueQtyRateAmount, synthesizeWordsFromText } from "../services/ocr/tableStructure.js";
import { parsePurchaseBill } from "../services/ocr/billParser.js";

function word(text, x, y, extra = {}) {
  const width = Math.max(10, String(text).length * 8);
  return { text, x, y, width, height: 20, cx: x + width / 2, cy: y + 10, page: 1, confidence: 90, ...extra };
}

test("positional columns: XLTZ4A 2 4500 9000 maps by X, not by guessing order", () => {
  const words = [
    word("Product", 100, 100),
    word("Qty", 400, 100),
    word("Rate", 500, 100),
    word("Amount", 650, 100),
    word("XLTZ4A", 120, 450),
    word("2", 410, 450),
    word("4500", 510, 450),
    word("9000", 660, 450),
  ];
  const { items, debug } = reconstructTables(words);
  assert.equal(items.length, 1);
  assert.match(items[0].description, /XLTZ4A/);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].rate, 4500);
  assert.equal(items[0].total, 9000);
  assert.ok(debug.columns.some((c) => c.key === "qty"));
});

test("GSTIN and phone are not product rows", () => {
  const words = [
    word("Product", 100, 40),
    word("Qty", 400, 40),
    word("Rate", 500, 40),
    word("Amount", 650, 40),
    word("GSTIN", 100, 80),
    word("27AAACE1234A1Z5", 220, 80),
    word("Phone", 100, 110),
    word("9876543210", 220, 110),
    word("XLTZ4A", 120, 200),
    word("1", 410, 200),
    word("100", 510, 200),
    word("100", 660, 200),
  ];
  const { items } = reconstructTables(words);
  assert.equal(items.length, 1);
  assert.match(items[0].description, /XLTZ4A/);
  assert.equal(items.some((i) => /27AAACE1234A1Z5/.test(i.description + i.sku)), false);
});

test("repeated table header on page 2 is not a product", () => {
  const words = [
    word("Item", 100, 40, { page: 1 }),
    word("Qty", 400, 40, { page: 1 }),
    word("Rate", 500, 40, { page: 1 }),
    word("Amount", 650, 40, { page: 1 }),
    word("First", 120, 80, { page: 1 }),
    word("1", 410, 80, { page: 1 }),
    word("10", 510, 80, { page: 1 }),
    word("10", 660, 80, { page: 1 }),
    word("Item", 100, 40, { page: 2 }),
    word("Qty", 400, 40, { page: 2 }),
    word("Rate", 500, 40, { page: 2 }),
    word("Amount", 650, 40, { page: 2 }),
    word("Second", 120, 80, { page: 2 }),
    word("2", 410, 80, { page: 2 }),
    word("20", 510, 80, { page: 2 }),
    word("40", 660, 80, { page: 2 }),
  ];
  const { items } = reconstructTables(words);
  assert.equal(items.length, 2);
  assert.equal(items.some((i) => /^item$/i.test(i.description.trim())), false);
});

test("unique math triple is accepted only when a×b uniquely equals c", () => {
  const hit = uniqueQtyRateAmount([2, 4500, 9000]);
  assert.equal(hit.quantity, 2);
  assert.equal(hit.rate, 4500);
  assert.equal(hit.total, 9000);
  assert.equal(uniqueQtyRateAmount([2, 3, 7]), null);
});

test("parsePurchaseBill uses reconstructed table for Exide-like row", () => {
  const bill = parsePurchaseBill(`
EXIDE INDUSTRIES LIMITED
Invoice No: EXP/1
Date: 12/08/2025
Product    Qty    Rate    Amount
XLTZ4A     2      4500    9000
Grand Total 9000
`);
  assert.ok(bill.items.length >= 1);
  const row = bill.items.find((i) => /XLTZ4A/i.test(`${i.productName} ${i.sku}`));
  assert.ok(row);
  assert.equal(row.quantity, 2);
  assert.equal(row.rate, 4500);
  assert.equal(row.total, 9000);
  assert.equal(bill.parseDebug?.usedPositional, true);
});

test("uncertain numbers stay empty instead of filling fields", () => {
  const words = [
    word("Product", 100, 40),
    word("Qty", 400, 40),
    word("Rate", 500, 40),
    word("Amount", 650, 40),
    word("Mystery", 120, 90),
    word("abc", 200, 90),
  ];
  const { items } = reconstructTables(words);
  assert.equal(items.length, 0);
});

test("column X order Amount-Qty-Rate is not guessed as Qty-Rate-Amount", () => {
  const words = [
    word("Product", 80, 40),
    word("Amount", 280, 40),
    word("Qty", 480, 40),
    word("Rate", 600, 40),
    word("XLTZ4A", 90, 90),
    word("9000", 290, 90),
    word("2", 490, 90),
    word("4500", 610, 90),
  ];
  const { items } = reconstructTables(words);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].rate, 4500);
  assert.equal(items[0].total, 9000);
});

test("GST and discount columns assign by X position", () => {
  const words = [
    word("Product", 80, 40),
    word("Qty", 280, 40),
    word("Rate", 380, 40),
    word("Discount", 500, 40),
    word("GST", 620, 40),
    word("Amount", 740, 40),
    word("MFXL40", 90, 90),
    word("3", 290, 90),
    word("5200", 390, 90),
    word("200", 510, 90),
    word("18%", 630, 90),
    word("15400", 750, 90),
  ];
  const { items } = reconstructTables(words);
  assert.equal(items.length, 1);
  assert.match(items[0].description, /MFXL40/);
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].rate, 5200);
  assert.equal(items[0].discount, 200);
  assert.equal(items[0].gstRate, 18);
  assert.equal(items[0].total, 15400);
  assert.equal(items[0].needsReview, false);
});

test("synthesizeWordsFromText keeps column gaps", () => {
  const words = synthesizeWordsFromText("Product  Qty  Rate\nXLTZ4A  2  4500");
  assert.ok(words.some((w) => w.text === "XLTZ4A"));
  assert.ok(words.some((w) => w.text === "2"));
});
