/**
 * Server-side quotation → invoice draft builder (mirrors src/utils/invoiceConversion.js).
 */
import {
  buildInvoiceDraftFromQuotation,
  calculateInvoiceTotals,
  draftToInvoiceProducts,
  emptyAdditionalCharges,
  sumEnabledCharges,
} from "../../src/utils/invoiceConversion.js";

export {
  buildInvoiceDraftFromQuotation,
  calculateInvoiceTotals,
  draftToInvoiceProducts,
  emptyAdditionalCharges,
  sumEnabledCharges,
};

export function normalizeInvoicePayload(payload = {}) {
  const draft = payload.draft ?? payload;
  const totals = calculateInvoiceTotals({
    inverterPrice: draft.inverter?.price,
    batteryWithOldPrice: draft.battery?.withOldPrice,
    batteryWithoutOldPrice: draft.battery?.withoutOldPrice,
    pricingMode: draft.pricing?.pricingMode ?? draft.pricingMode ?? "withOld",
    additionalCharges: draft.additionalCharges ?? emptyAdditionalCharges(),
    gstRate: draft.gstRate ?? 18,
    discount: draft.discount ?? 0,
  });

  const paidAmount = Number(draft.paidAmount ?? 0);
  const finalTotal = totals.finalTotal;
  const pendingAmount = Math.max(0, finalTotal - paidAmount);

  let paymentStatus = draft.paymentStatus ?? "Unpaid";
  if (paidAmount >= finalTotal && finalTotal > 0) paymentStatus = "Paid";
  else if (paidAmount > 0) paymentStatus = "Partial";

  const products = draftToInvoiceProducts({ ...draft, ...totals });

  return {
    quotationId: draft.quotationId ?? payload.quotationId ?? null,
    quoteKey: draft.quoteKey ?? "",
    recommendationType: draft.recommendationType ?? "",
    customerDetails: draft.customerDetails ?? {
      name: payload.customerName ?? payload.customer ?? "",
      phone: payload.customerPhone ?? payload.phone ?? "",
      address: payload.customerAddress ?? payload.address ?? "",
      place: payload.place ?? "",
    },
    inverter: draft.inverter ?? {},
    battery: draft.battery ?? {},
    calculatedVA: draft.calculations?.calculatedVA ?? draft.calculatedVA ?? 0,
    calculatedAH: draft.calculations?.calculatedAH ?? draft.calculatedAH ?? 0,
    backupHours: draft.calculations?.backupHours ?? draft.backupHours ?? 0,
    totalLoad: draft.calculations?.totalLoad ?? draft.totalLoad ?? 0,
    pricingMode: totals.pricingMode,
    scrapAdjustment: totals.scrapAdjustment,
    productTotal: totals.productTotal,
    additionalCharges: draft.additionalCharges ?? emptyAdditionalCharges(),
    additionalTotal: totals.additionalTotal,
    products,
    items: products,
    subtotal: totals.subtotal,
    gst: totals.gstAmount,
    gstAmount: totals.gstAmount,
    gstRate: totals.gstRate,
    totalAmount: finalTotal,
    finalTotal,
    total: finalTotal,
    paymentMode: draft.paymentMode ?? "Cash",
    paymentStatus,
    paidAmount,
    pendingAmount,
    notes: draft.notes ?? { delivery: "", installation: "", warranty: "" },
    selectedOptionSnapshot: draft.selectedOption ?? payload.selectedOption ?? null,
    quotationOptionId: draft.quotationOptionId ?? payload.quotationOptionId ?? "",
    sendWhatsapp: payload.sendWhatsapp !== false,
    date: new Date().toISOString().slice(0, 10),
  };
}
