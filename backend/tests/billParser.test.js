import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePurchaseBill, parseAmount, looksLikeInvoiceNumber, looksLikeGstin, parseBillDate, detectColumnLayout } from "../services/ocr/billParser.js";
import { validatePurchaseBillMath } from "../services/ocr/billValidation.js";
import { isInsufficientExtraction } from "../services/ocr/billParseHeuristics.js";
import { normalizeBillText } from "../services/ocr/textNormalizer.js";

describe("number / identity guards", () => {
  it("parses Indian money and ignores GSTIN/phone", () => {
    assert.equal(parseAmount("₹4,500"), 4500);
    assert.equal(parseAmount("4,500.00"), 4500);
    assert.equal(parseAmount("Rs. 4 500.00".replace(/\s+/g, "")), 4500);
    assert.equal(parseAmount("27AAACE1234A1Z5"), null);
    assert.equal(looksLikeGstin("27AAACE1234A1Z5"), true);
    assert.equal(looksLikeInvoiceNumber("27AAACE1234A1Z5"), false);
    assert.equal(looksLikeInvoiceNumber("EXP/24-25/1182"), true);
    assert.equal(parseBillDate("05 Sep 2025"), "05/09/2025");
    assert.equal(parseBillDate("12/08/2025"), "12/08/2025");
  });
});

describe("simple invoice", () => {
  it("reads supplier, invoice, qty, rate, amount", () => {
    const bill = parsePurchaseBill(`
ACME DISTRIBUTORS PVT LTD
GSTIN: 27AAACE1234A1Z5
Tax Invoice No: ACM-1001
Invoice Date: 12/08/2025
Description Qty Rate Amount
Car Battery 2 4500.00 9000.00
Subtotal 9000.00
Grand Total 9000.00
`);
    assert.equal(bill.invoiceNumber, "ACM-1001");
    assert.equal(bill.invoiceDate, "12/08/2025");
    assert.match(bill.supplierDetails.name, /ACME/i);
    assert.equal(bill.supplierDetails.gstin, "27AAACE1234A1Z5");
    assert.ok(bill.items.length >= 1);
    assert.equal(bill.items[0].quantity, 2);
    assert.equal(bill.items[0].rate, 4500);
    assert.equal(bill.grandTotal, 9000);
    assert.equal(isInsufficientExtraction(bill), false);
  });
});

describe("Exide-style battery invoice", () => {
  it("extracts models, HSN, CGST+SGST", () => {
    const bill = parsePurchaseBill(`
EXIDE INDUSTRIES LIMITED
GSTIN: 27AAACE1234A1Z5
Tax Invoice No: EXP/24-25/1182
Invoice Date: 12/08/2025
Bill To
BatteryMela
GSTIN: 29ABCDE1234F1Z5
Description of Goods    HSN    Qty    Rate    Amount
XLTZ4A EXIDE 12V 4AH    8507   4      1250.00  5000.00
MHD800 EXIDE            8507   2      8500.00 17000.00
Taxable Value  22000.00
CGST 9%        1980.00
SGST 9%        1980.00
Grand Total    25960.00
`);
    assert.equal(bill.invoiceNumber, "EXP/24-25/1182");
    assert.match(bill.supplierDetails.name, /EXIDE/i);
    assert.equal(bill.buyerDetails.gstin, "29ABCDE1234F1Z5");
    assert.ok(bill.items.length >= 2);
    assert.ok(bill.items.some((i) => /XLTZ4A/i.test(i.productName + i.sku)));
    assert.equal(bill.cgst, 1980);
    assert.equal(bill.sgst, 1980);
    assert.equal(bill.igst, null);
    assert.equal(bill.grandTotal, 25960);
  });
});

describe("Amaron-style invoice", () => {
  it("handles SKU first and GST percent column", () => {
    const bill = parsePurchaseBill(`
AMARON BATTERIES LIMITED
Invoice Number: AMR-9921
Date: 01-09-2025
SKU Description Quantity Unit Price GST Total
FLO DIN74 1 8500 18% 10030
Grand Total 10030
`);
    assert.equal(bill.invoiceNumber, "AMR-9921");
    assert.match(bill.supplierDetails.name, /AMARON/i);
    assert.ok(bill.items.length >= 1);
    assert.equal(bill.items[0].quantity, 1);
    assert.ok(bill.items[0].gstRate === 18 || bill.items[0].total === 10030);
  });
});

describe("Luminous / Microtek-style invoice", () => {
  it("uses IGST and does not invent CGST+SGST", () => {
    const bill = parsePurchaseBill(`
LUMINOUS POWER TECHNOLOGIES PVT LTD
Inv No: LUM/778
Dated: 05 Sep 2025
Product Qty Rate Amount
ILKT1500 Inverter 1 12500.00 12500.00
IGST 18% 2250.00
Invoice Total 14750.00
`);
    assert.equal(bill.invoiceNumber, "LUM/778");
    assert.match(bill.supplierDetails.name, /LUMINOUS/i);
    assert.equal(bill.igst, 2250);
    assert.equal(bill.cgst, null);
    assert.equal(bill.sgst, null);
    assert.ok(bill.items.some((i) => /ILKT1500/i.test(`${i.productName} ${i.sku}`)));
  });

  it("reads a Microtek inverter line", () => {
    const bill = parsePurchaseBill(`
MICROTEK INTERNATIONAL PRIVATE LIMITED
Bill Number: MIC-441
Invoice Date: 03/03/2025
Description Qty Rate Amount
Microtek JM1700 2 9800 19600
Grand Total 19600
`);
    assert.match(bill.supplierDetails.name, /MICROTEK/i);
    assert.equal(bill.items[0].quantity, 2);
  });
});

describe("multi-product / GST / discount / column orders", () => {
  it("extracts multiple products", () => {
    const bill = parsePurchaseBill(`
FOO INDUSTRIES LIMITED
Invoice No: M-1
Date: 01/01/2025
Item Qty Rate Amount
Alpha 1 100 100
Beta 3 200 600
Grand Total 700
`);
    assert.equal(bill.items.length, 2);
  });

  it("detects CGST + SGST rates", () => {
    const bill = parsePurchaseBill(`
BAR LIMITED
Invoice No: GST-1
Date: 02/02/2025
Item Qty Rate Amount
Bat 1 1000 1180
CGST 9% 90.00
SGST 9% 90.00
Grand Total 1180.00
`);
    assert.equal(bill.cgst, 90);
    assert.equal(bill.sgst, 90);
  });

  it("detects IGST only", () => {
    const bill = parsePurchaseBill(`
BAZ LIMITED
Invoice No: IG-1
Date: 02/02/2025
Item Qty Rate Amount
Inv 1 1000 1180
IGST 18% 180.00
Grand Total 1180
`);
    assert.equal(bill.igst, 180);
    assert.equal(bill.cgst, null);
  });

  it("reads discounted invoice", () => {
    const text = `
DISC LIMITED
Invoice No: D-1
Date: 02/02/2025
Description Qty Rate Discount Amount
Battery 2 1000 100 1900
Less Discount 100.00
Grand Total 1900
`;
    const bill = parsePurchaseBill(text);
    assert.ok(bill.items.length >= 1);
    assert.equal(bill.items[0].quantity, 2);
    assert.ok(bill.discount === 100 || bill.items[0].discount === 100 || bill.grandTotal === 1900);
  });

  it("detects different column orders from headers", () => {
    const a = detectColumnLayout(["Product | Qty | Rate | Amount".split("|").join("  ")]);
    const b = detectColumnLayout(["Description  HSN  Qty  Price  GST  Total"]);
    const c = detectColumnLayout(["SKU  Description  Quantity  Unit Price  Discount  Taxable Value"]);
    assert.ok(a || b || c);
    const bill = parsePurchaseBill(`
COL LIMITED
Invoice No: C-9
Date: 04/04/2025
SKU  Description  Quantity  Unit Price  Taxable Value
XLTZ4A  Bike battery  3  1100  3300
Grand Total 3300
`);
    assert.ok(bill.items.length >= 1);
    assert.equal(bill.items[0].quantity, 3);
  });
});

describe("OCR noise, pages, unknown rows, totals", () => {
  it("normalizes common OCR label noise without rewriting product codes", () => {
    const n = normalizeBillText("Invioce No: XLTZ4A\nQuantlty 2");
    assert.match(n, /Invoice/i);
    assert.match(n, /XLTZ4A/);
    const bill = parsePurchaseBill(`
NOISE LIMITED
Invioce No: NB-77
Date: 06/06/2025
Item Qty Rate Amount
XLTZ4A 1 500 500
Grand Total 500
`);
    assert.equal(bill.invoiceNumber, "NB-77");
    assert.match(bill.items[0].productName + bill.items[0].sku, /XLTZ4A/);
  });

  it("combines multi-page text", () => {
    const bill = parsePurchaseBill(`
PAGECO LIMITED
Invoice No: P-2
Date: 07/07/2025
Item Qty Rate Amount
First 1 10 10

----- PAGE 2 -----
Second 2 20 40
Grand Total 50
`);
    assert.ok(bill.items.length >= 2);
    assert.equal(bill.pages.length >= 2, true);
  });

  it("keeps unknown product text for review instead of dropping the row", () => {
    const bill = parsePurchaseBill(`
UNK LIMITED
Invoice No: U-1
Date: 08/08/2025
Item Qty Rate Amount
ZZZUNKNOWNMODEL 1 999 999
Grand Total 999
`);
    assert.equal(bill.items.length, 1);
    assert.match(bill.items[0].productName, /ZZZUNKNOWNMODEL/);
    assert.equal(bill.items[0].quantity, 1);
  });

  it("unknown supplier is not forced to Exide", () => {
    const bill = parsePurchaseBill(`
ORION POWER SOLUTIONS PVT LTD
Invoice No: O-3
Date: 09/09/2025
Item Qty Rate Amount
Cell 1 50 50
Grand Total 50
`);
    assert.match(bill.supplierDetails.name, /ORION/i);
    assert.equal(/exide/i.test(bill.supplierDetails.name), false);
  });

  it("flags grand total mismatch without changing totals", () => {
    const bill = parsePurchaseBill(`
MIS LIMITED
Invoice No: T-1
Date: 10/10/2025
Item Qty Rate Amount
Cell 1 100 100
Taxable Value 100
Grand Total 500
`);
    bill.parseWarnings = bill.parseWarnings || [];
    const warnings = validatePurchaseBillMath(bill);
    assert.ok(warnings.some((w) => /grand total/i.test(w)));
    assert.equal(bill.grandTotal, 500);
    assert.equal(bill.items[0].total, 100);
  });

  it("manual fallback when no text is detected", () => {
    const bill = parsePurchaseBill("   ");
    assert.equal(isInsufficientExtraction(bill), true);
    assert.ok((bill.parseWarnings || []).length >= 1);
  });
});

describe("Yantrayug invoice — supplier vs buyer vs manufacturer", () => {
  const YANTRAYUG_BILL = `
GST INVOICE
YANTRAYUG AUTOMOBILES
SR NO 143 JEEVAN NAGAR TATHAWADE PUNE 411033
Phone: 020-65368777 / 9890687777
Email: yantrayugautomobiles@gmail.com
GSTIN: 27AKOPP7668R1ZQ
Invoice No: YA/24-25/118
Date: 12/08/2025

Bill to Party:
KRISHNA SERVICES (PIMPLE SAUDAGAR) COD
SR NO 175, FRONT OF KUNAL ICON, PIMPLE SAUDAGAR
PUNE, MAHARASHTRA
GSTIN: 27AKOPP3502F1Z1

Authorised Distributors For:
EXIDE INDUSTRIES LTD, JK TYRES
& Deals in All Types of Two wheeler spares

Description Qty Rate Amount
XLTZ4A 2 4500 9000
Grand Total 9000
`;

  it("extracts Yantrayug as supplier and Krishna as buyer", () => {
    const bill = parsePurchaseBill(YANTRAYUG_BILL);
    assert.equal(bill.supplierDetails.name, "YANTRAYUG AUTOMOBILES");
    assert.equal(bill.supplierDetails.gstin, "27AKOPP7668R1ZQ");
    assert.match(bill.supplierDetails.address, /JEEVAN NAGAR TATHAWADE/i);
    assert.match(bill.supplierDetails.phone, /020-65368777/);
    assert.match(bill.supplierDetails.phone, /9890687777/);
    assert.match(bill.supplierDetails.email, /yantrayugautomobiles@gmail.com/i);
    assert.equal(bill.buyerDetails.name, "KRISHNA SERVICES (PIMPLE SAUDAGAR) COD");
    assert.equal(bill.buyerDetails.gstin, "27AKOPP3502F1Z1");
    assert.equal(/COD Authorised Distributors/i.test(bill.supplierDetails.name), false);
    assert.equal(/EXIDE/i.test(bill.supplierDetails.name), false);
    assert.equal(/JK TYRES/i.test(bill.supplierDetails.name), false);
    assert.match(bill.manufacturerDetails.raw, /EXIDE INDUSTRIES LTD/i);
    assert.match(bill.manufacturerDetails.raw, /JK TYRES/i);
  });

  it("does not join COD with Authorised Distributors when OCR dumps them adjacently", () => {
    const bill = parsePurchaseBill(`
GST INVOICE
YANTRAYUG AUTOMOBILES
SR NO 143 JEEVAN NAGAR TATHAWADE PUNE 411033
GSTIN: 27AKOPP7668R1ZQ
Bill to Party: KRISHNA SERVICES (PIMPLE SAUDAGAR) COD Authorised Distributors For: EXIDE INDUSTRIES LTD, JK TYRES
GSTIN: 27AKOPP3502F1Z1
Item Qty Rate Amount
XLTZ4A 1 100 100
Grand Total 100
`);
    assert.equal(bill.supplierDetails.name, "YANTRAYUG AUTOMOBILES");
    assert.equal(bill.supplierDetails.gstin, "27AKOPP7668R1ZQ");
    assert.match(bill.buyerDetails.name, /KRISHNA SERVICES/i);
    assert.equal(bill.buyerDetails.gstin, "27AKOPP3502F1Z1");
    assert.equal(bill.supplierDetails.name, "YANTRAYUG AUTOMOBILES");
    assert.doesNotMatch(bill.supplierDetails.name, /COD Authorised Distributors/i);
  });
});

describe("product table boundaries — GST/footer are not products", () => {
  const TWO_LINE_GST_BILL = `
GST INVOICE
YANTRAYUG AUTOMOBILES
SR NO 143 JEEVAN NAGAR TATHAWADE PUNE 411033
GSTIN: 27AKOPP7668R1ZQ
Invoice No: YA-2001
Date: 12/08/2025

DisplayName    HSN Code    Qty    Rate    Disc Amt    Total
MLDIN40 BATTERY EXIDE    85071000    2    5874.00    6.00    9358.58
XPLORE 12XLTZ4-A    85071000    4    1350.00    36.00    2928.82

GST 5%     9.00     842
GST 12%    18.00    264
GST 18%    221.72   1105.86
GST 28%    0.00     0
TOTAL               14490
CGST 9%             842
SGST 9%             842
SUB TOTAL           12280
GRAND TOTAL         14490
Amount in Words: Fourteen Thousand Four Hundred Ninety Only
Due Balance With This Bill 0.00
Terms & Conditions
Cheque Bounce Charges 500
Bank Details HDFC 123456
For YANTRAYUG AUTOMOBILES
Authorized Signatory
`;

  it("keeps only the two product rows and ignores GST/footer lines", () => {
    const bill = parsePurchaseBill(TWO_LINE_GST_BILL);
    assert.equal(bill.items.length, 2);
    assert.match(bill.items[0].productName, /MLDIN/i);
    assert.equal(bill.items[0].quantity, 2);
    assert.equal(bill.items[0].rate, 5874);
    assert.equal(bill.items[0].discount, 6);
    assert.match(bill.items[1].productName, /12XLTZ4/i);
    assert.equal(bill.items[1].quantity, 4);
    assert.equal(bill.items[1].rate, 1350);
    assert.equal(bill.items.some((i) => /GST 5%/i.test(i.productName)), false);
    assert.equal(bill.items.some((i) => /GRAND TOTAL/i.test(i.productName)), false);
    assert.equal(bill.items.some((i) => /Authorized Signatory/i.test(i.productName)), false);
    assert.equal(bill.items.some((i) => i.quantity == null || i.quantity <= 0), false);
    assert.ok((bill.parseDebug.rejected || []).some((r) => /TAX_SUMMARY/i.test(r.reason || "")));
  });

  it("does not create a product from an HSN-only line", () => {
    const bill = parsePurchaseBill(`
HSN TRADERS LIMITED
Invoice No: H-1
Date: 01/01/2025
Item Qty Rate Amount
85071000 2 100 200
Grand Total 200
`);
    assert.equal(bill.items.some((i) => i.productName === "85071000" || i.sku === "85071000"), false);
  });

  it("reads ten product rows and stops at taxable value", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `Cell${i + 1}X 1 100 100`).join("\n");
    const bill = parsePurchaseBill(`
TEN LIMITED
Invoice No: T-10
Date: 01/01/2025
Item Qty Rate Amount
${rows}
Taxable Value 1000
CGST 9% 90
SGST 9% 90
Grand Total 1180
`);
    assert.equal(bill.items.length, 10);
    assert.equal(bill.cgst, 90);
  });
});


