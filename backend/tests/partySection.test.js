import { test } from "node:test";
import assert from "node:assert/strict";
import { extractParties, splitLineBySectionLabels, looksLikeCompanyName } from "../services/ocr/partySectionParser.js";

test("splitLineBySectionLabels keeps Bill To and Authorised Distributors apart", () => {
  const parts = splitLineBySectionLabels(
    "KRISHNA SERVICES (PIMPLE SAUDAGAR) COD Authorised Distributors For: EXIDE INDUSTRIES LTD, JK TYRES",
  );
  const buyer = parts.find((p) => p.kind === "manufacturer")
    ? parts.find((p) => /KRISHNA/i.test(p.text))
    : parts[0];
  const mfg = parts.find((p) => p.kind === "manufacturer");
  assert.ok(mfg);
  assert.match(mfg.text, /EXIDE/i);
  assert.equal(/EXIDE/i.test(buyer.text), false);
  assert.match(buyer.text, /KRISHNA SERVICES/i);
  assert.equal(/Authorised Distributors/i.test(buyer.text), false);
});

test("looksLikeCompanyName accepts issuer names without Ltd", () => {
  assert.equal(looksLikeCompanyName("YANTRAYUG AUTOMOBILES"), true);
  assert.equal(looksLikeCompanyName("Authorised Distributors For"), false);
  assert.equal(looksLikeCompanyName("GST INVOICE"), false);
});

test("spatial columns: Bill To left, Authorised Distributors right", () => {
  const word = (text, x, y) => {
    const width = Math.max(10, String(text).length * 8);
    return { text, x, y, width, height: 18, cx: x + width / 2, cy: y + 9, page: 1 };
  };
  const words = [
    word("YANTRAYUG", 80, 20),
    word("AUTOMOBILES", 180, 20),
    word("GSTIN:", 80, 50),
    word("27AKOPP7668R1ZQ", 150, 50),
    word("Bill", 80, 120),
    word("to", 120, 120),
    word("Party:", 145, 120),
    word("KRISHNA", 80, 150),
    word("SERVICES", 160, 150),
    word("Authorised", 520, 120),
    word("Distributors", 620, 120),
    word("For:", 740, 120),
    word("EXIDE", 520, 150),
    word("INDUSTRIES", 580, 150),
    word("LTD", 700, 150),
  ];
  const parties = extractParties({ words, lines: [] });
  assert.equal(parties.supplierDetails.name, "YANTRAYUG AUTOMOBILES");
  assert.equal(parties.supplierDetails.gstin, "27AKOPP7668R1ZQ");
  assert.match(parties.buyerDetails.name, /KRISHNA SERVICES/i);
  assert.match(parties.manufacturerDetails.raw, /EXIDE/i);
  assert.doesNotMatch(parties.supplierDetails.name, /COD Authorised Distributors/i);
  assert.doesNotMatch(parties.supplierDetails.name, /EXIDE/i);
});
