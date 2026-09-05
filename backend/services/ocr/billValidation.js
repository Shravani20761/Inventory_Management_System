function n(v) {
  if (v == null || v === "") return null;
  const x = Number(String(v).replace(/[,₹]/g, "").trim());
  return Number.isFinite(x) ? x : null;
}

function isValidDate(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  return /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(t) || /^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(t);
}

const TOL = 2;

/**
 * Financial + completeness checks only — never mutates extracted amounts.
 */
export function validatePurchaseBillMath(bill = {}) {
  const warnings = [];
  (bill.items || []).forEach((item, idx) => {
    const qty = n(item.quantity);
    const rate = n(item.rate);
    const taxable = n(item.taxableAmount);
    const lineTotal = n(item.total);
    const gstAmt = (n(item.cgst) || 0) + (n(item.sgst) || 0) + (n(item.igst) || 0) + (n(item.cess) || 0);
    const name = String(item.productName || item.sku || "").trim();
    if (!name) warnings.push(`Line ${idx + 1}: Product description is missing.`);
    if (qty == null || qty <= 0) warnings.push(`Line ${idx + 1}: Quantity must be a number greater than 0.`);
    if (rate != null && rate < 0) warnings.push(`Line ${idx + 1}: Rate cannot be negative.`);
    if (qty != null && rate != null && taxable != null && Math.abs(qty * rate - (n(item.discount) || 0) - taxable) > TOL) {
      warnings.push(`Line ${idx + 1}: Qty × Rate does not match taxable amount.`);
    }
    if (taxable != null && lineTotal != null && gstAmt > 0 && Math.abs(taxable + gstAmt - lineTotal) > TOL) {
      warnings.push(`Line ${idx + 1}: Taxable + GST does not match line total.`);
    }
    if (qty != null && rate != null && lineTotal != null && gstAmt === 0 && Math.abs(qty * rate - (n(item.discount) || 0) - lineTotal) > TOL + Math.abs(lineTotal) * 0.2) {
      warnings.push(`Line ${idx + 1}: Qty × Rate is far from line total. Please verify.`);
    }
    const matched = item.matchStatus === "matched" || item.matchStatus === "manual" || item.productId || item.createNewProduct;
    if (qty > 0 && !matched) {
      warnings.push(`Line ${idx + 1}: Product not confidently matched. Select an existing product or create a new one.`);
    }
  });

  if (!String(bill.invoiceNumber || "").trim()) {
    warnings.push("Invoice number is missing. Please verify.");
  }
  if (!String(bill.supplierDetails?.name || bill.supplierDetails?.gstin || "").trim()) {
    warnings.push("Supplier is not identified. Please verify.");
  }
  if (bill.invoiceDate && !isValidDate(bill.invoiceDate)) {
    warnings.push("Invoice date does not look valid. Please verify.");
  } else if (!String(bill.invoiceDate || "").trim()) {
    warnings.push("Invoice date is missing. Please verify.");
  }

  const gstin = String(bill.supplierDetails?.gstin || "").trim();
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(gstin)) {
    warnings.push("Supplier GSTIN format looks invalid.");
  }

  const cgst = n(bill.cgst);
  const sgst = n(bill.sgst);
  const igst = n(bill.igst);
  if (igst > 0 && (cgst > 0 || sgst > 0)) {
    warnings.push("Bill shows both IGST and CGST/SGST. Please verify which tax applies.");
  }
  if (cgst != null && sgst != null && cgst > 0 && sgst > 0 && Math.abs(cgst - sgst) > Math.max(TOL, Math.abs(cgst) * 0.05)) {
    warnings.push("CGST and SGST amounts differ more than expected.");
  }

  const taxable = n(bill.taxableAmount) ?? n(bill.subtotal);
  const gst = (cgst || 0) + (sgst || 0) + (igst || 0) + (n(bill.cess) || 0);
  const extras =
    (n(bill.otherCharges) || 0) +
    (n(bill.freight) || 0) +
    (n(bill.transportation) || 0) +
    (n(bill.packingCharges) || 0) +
    (n(bill.installationCharges) || 0);
  const discount = n(bill.discount) || 0;
  const roundOff = n(bill.roundOff) || 0;
  const grand = n(bill.grandTotal);
  if (taxable != null && grand != null) {
    const expected = taxable + gst + extras - discount + roundOff;
    if (Math.abs(expected - grand) > Math.max(TOL, Math.abs(grand) * 0.01)) {
      warnings.push(
        `Grand total does not match calculated total. Please verify. Expected about ${expected.toFixed(2)} vs grand total ${grand.toFixed(2)}.`,
      );
    }
  }

  const itemSum = (bill.items || []).reduce((sum, it) => sum + (n(it.total) || 0), 0);
  if (itemSum > 0 && grand != null && Math.abs(itemSum - grand) > Math.max(5, Math.abs(grand) * 0.08) && taxable == null) {
    warnings.push("Sum of item totals does not match grand total. Please verify.");
  }

  for (const extra of bill.parseWarnings || []) {
    if (extra && !warnings.includes(extra)) warnings.push(extra);
  }
  return warnings;
}
