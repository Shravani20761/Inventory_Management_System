function n(v) {
  if (v == null || v === "") return null;
  const x = Number(String(v).replace(/[,₹]/g, "").trim());
  return Number.isFinite(x) ? x : null;
}

const TOL = 2;

/**
 * Financial checks only — never mutates extracted amounts.
 */
export function validatePurchaseBillMath(bill = {}) {
  const warnings = [];
  (bill.items || []).forEach((item, idx) => {
    const qty = n(item.quantity);
    const rate = n(item.rate);
    const taxable = n(item.taxableAmount);
    const lineTotal = n(item.total);
    const gstAmt = (n(item.cgst) || 0) + (n(item.sgst) || 0) + (n(item.igst) || 0) + (n(item.cess) || 0);
    if (qty != null && rate != null && taxable != null && Math.abs(qty * rate - taxable) > TOL + Math.abs(n(item.discount) || 0)) {
      warnings.push(`Line ${idx + 1}: Qty × Rate does not match taxable amount.`);
    }
    if (taxable != null && lineTotal != null && Math.abs(taxable + gstAmt - lineTotal) > TOL) {
      warnings.push(`Line ${idx + 1}: Taxable + GST does not match line total.`);
    }
  });

  const taxable = n(bill.taxableAmount) ?? n(bill.subtotal);
  const gst =
    (n(bill.cgst) || 0) + (n(bill.sgst) || 0) + (n(bill.igst) || 0) + (n(bill.cess) || 0);
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
        `Totals do not add up: taxable + GST + charges − discount ± round-off ≈ ${expected.toFixed(2)} vs grand total ${grand.toFixed(2)}.`,
      );
    }
  }
  return warnings;
}
