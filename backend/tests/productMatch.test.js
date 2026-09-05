import { test } from "node:test";
import assert from "node:assert/strict";
import { matchItemsToCatalog } from "../services/ocr/productMatchService.js";

const catalog = [
  { _id: "p1", brand: "Exide", model: "XLTZ4A", sku: "XLTZ4A", quantity: 12 },
  { _id: "p2", brand: "Amaron", model: "FLO DIN74", sku: "FLODIN74", quantity: 4 },
];

test("exact SKU / model matches Exide XLTZ4A", () => {
  const [row] = matchItemsToCatalog([{ sku: "XLTZ4A", productName: "XLTZ4A", quantity: 2, rate: 4500 }], catalog);
  assert.equal(row.matchStatus, "matched");
  assert.match(row.matchedLabel, /Exide XLTZ4A/i);
  assert.equal(row.productId, "p1");
});

test("OCR XLTZA is a suggestion, not a silent match", () => {
  const [row] = matchItemsToCatalog([{ sku: "XLTZA", productName: "XLTZA" }], catalog);
  assert.equal(row.matchStatus, "unmatched");
  assert.equal(row.productId, "");
  assert.match(row.matchedLabel, /Possible match: Exide XLTZ4A/i);
  assert.equal(row.needsReview, true);
});

test("math review is kept even when the product SKU matches", () => {
  const [row] = matchItemsToCatalog(
    [{ sku: "XLTZ4A", productName: "XLTZ4A", quantity: 2, rate: 4500, needsReview: true }],
    catalog,
  );
  assert.equal(row.matchStatus, "matched");
  assert.equal(row.needsReview, true);
});
