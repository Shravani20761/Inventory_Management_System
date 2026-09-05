import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyInvoiceLine, hasProductEvidence, isTableEndLine } from "../services/ocr/productTableGuard.js";
import { reconstructTables } from "../services/ocr/tableStructure.js";

test("GST bands and totals are table-end, not products", () => {
  assert.equal(classifyInvoiceLine("GST 5% 9.00 842").code, "TAX_SUMMARY_SECTION");
  assert.equal(classifyInvoiceLine("CGST 9% 842").code, "TAX_SUMMARY_SECTION");
  assert.equal(classifyInvoiceLine("GRAND TOTAL 14490").code, "TOTAL_SECTION");
  assert.equal(classifyInvoiceLine("Amount in Words: Fourteen Thousand").code, "FOOTER_SECTION");
  assert.equal(isTableEndLine("Terms & Conditions"), true);
  assert.equal(hasProductEvidence({ raw: "CGST 9% 842", description: "CGST", quantity: 9 }).ok, false);
});

test("positional reconstruction stops at GST summary", () => {
  function word(text, x, y, extra = {}) {
    const width = Math.max(10, String(text).length * 8);
    return { text, x, y, width, height: 20, cx: x + width / 2, cy: y + 10, page: 1, confidence: 90, ...extra };
  }
  const words = [
    word("DisplayName", 80, 40),
    word("Qty", 400, 40),
    word("Rate", 500, 40),
    word("Total", 650, 40),
    word("MLDIN40", 80, 80),
    word("BATTERY", 160, 80),
    word("EXIDE", 240, 80),
    word("2", 410, 80),
    word("5874", 510, 80),
    word("9358.58", 660, 80),
    word("XPLORE", 80, 120),
    word("12XLTZ4-A", 160, 120),
    word("4", 410, 120),
    word("1350", 510, 120),
    word("2928.82", 660, 120),
    word("GST", 80, 180),
    word("5%", 140, 180),
    word("9.00", 410, 180),
    word("842", 510, 180),
    word("GRAND", 80, 220),
    word("TOTAL", 140, 220),
    word("14490", 650, 220),
  ];
  const { items, debug } = reconstructTables(words);
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[1].quantity, 4);
  assert.ok((debug.rejected || []).some((r) => /TAX_SUMMARY|TABLE_END|TOTAL/i.test(r.reason || "")));
});
