/** Editable additional charge fields for quotation → invoice conversion. */
import { OPTIONAL_SERVICE_FIELDS } from "../constants/optionalServices.js";

export const INVOICE_CHARGE_FIELDS = [
  { key: "inverterInstallation", label: "Inverter Installation" },
  { key: "batteryInstallation", label: "Battery Installation" },
  { key: "trolleyCharges", label: "Trolley" },
  { key: "transportationCharges", label: "Transportation" },
  { key: "wiringCharges", label: "Wiring" },
  { key: "deliveryCharges", label: "Delivery" },
  { key: "serviceCharges", label: "Service" },
  { key: "otherCharges", label: "Other" },
];

export function emptyAdditionalCharges() {
  const charges = {};
  for (const { key } of INVOICE_CHARGE_FIELDS) {
    charges[key] = { enabled: false, amount: 0 };
  }
  return charges;
}

/** Pre-fill invoice charges from quotation optional-service checkboxes. */
export function additionalChargesFromOptionalForm(form = {}) {
  const charges = emptyAdditionalCharges();
  for (const { key, chargeKey, defaultAmount } of OPTIONAL_SERVICE_FIELDS) {
    if (form[key]) {
      charges[chargeKey] = {
        enabled: true,
        amount: Number(form[`${key}Amount`] ?? defaultAmount) || 0,
      };
    }
  }
  return charges;
}

export function pricingModeFromExchangeMode(mode = "withOld") {
  if (mode === "withoutOld") return "withoutOld";
  return "withOld";
}

/** Merge saved quotation sheet + selected option + wizard form for invoice modal. */
export function mergeSheetForInvoice(sheet = {}, selectedOption = null, formData = {}) {
  const pricingMode = pricingModeFromExchangeMode(formData.batteryExchangeMode ?? sheet.batteryExchangeMode);
  const additionalCharges =
    sheet.additionalCharges && Object.keys(sheet.additionalCharges).length
      ? sheet.additionalCharges
      : additionalChargesFromOptionalForm(formData);

  return normalizeQuotationForInvoice(
    {
      ...sheet,
      customerName: formData.customerName ?? sheet.customerName ?? sheet.customer,
      customerPhone: formData.customerPhone ?? sheet.customerPhone ?? sheet.phone,
      customerAddress: formData.customerAddress ?? sheet.customerAddress ?? "",
      flatType: formData.flatType ?? sheet.flatType,
      backupHours: formData.backupHours ?? sheet.backupHours,
      totalLoad: formData.totalLoad ?? sheet.totalLoad,
      pricingMode,
      batteryExchangeMode: formData.batteryExchangeMode ?? sheet.batteryExchangeMode ?? "withOld",
      brandPairingPreference: formData.brandPairingPreference ?? sheet.brandPairingPreference,
      additionalCharges,
      selectedOption,
    },
    selectedOption,
  );
}

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sumEnabledCharges(additionalCharges = {}) {
  let total = 0;
  for (const { key } of INVOICE_CHARGE_FIELDS) {
    const row = additionalCharges[key] ?? {};
    if (row.enabled && num(row.amount) > 0) total += num(row.amount);
  }
  return total;
}

/**
 * Final billing math:
 * productTotal = inverter + battery (with/without old exchange pricing)
 * subtotal = productTotal + enabled additional charges
 * gstAmount = subtotal * gstRate / 100
 * finalTotal = subtotal + gstAmount
 */
export function calculateInvoiceTotals({
  inverterPrice = 0,
  batteryWithOldPrice = 0,
  batteryWithoutOldPrice = 0,
  pricingMode = "withOld",
  additionalCharges = {},
  gstRate = 18,
  discount = 0,
}) {
  const invPrice = num(inverterPrice);
  const batWith = num(batteryWithOldPrice);
  const batWithout = num(batteryWithoutOldPrice) || batWith;
  const withOld = pricingMode !== "withoutOld";
  const scrapAdjustment = withOld ? Math.max(0, batWithout - batWith) : 0;
  const batteryPrice = withOld ? batWith : batWithout;
  const productTotal = invPrice + batteryPrice;
  const additionalTotal = sumEnabledCharges(additionalCharges);
  const subtotal = Math.max(0, productTotal + additionalTotal - num(discount));
  const gstAmount = Number(((subtotal * num(gstRate)) / 100).toFixed(2));
  const finalTotal = Number((subtotal + gstAmount).toFixed(2));
  const paidAmount = 0;
  const pendingAmount = finalTotal;

  return {
    inverterPrice: invPrice,
    batteryPrice,
    scrapAdjustment,
    productTotal,
    additionalTotal,
    subtotal,
    gstRate: num(gstRate),
    gstAmount,
    finalTotal,
    paidAmount,
    pendingAmount,
    pricingMode: withOld ? "withOld" : "withoutOld",
  };
}

export function buildInvoiceDraftFromQuotation(quotation = {}, selectedOption = null) {
  const opt =
    selectedOption ||
    quotation.selectedOption ||
    quotation.suggestedOptions?.find((o) => o.badge === "Recommended") ||
    quotation.suggestedOptions?.[0] ||
    quotation.options?.[0];

  const inv = opt?.inverter ?? quotation.inverter ?? {};
  const bat = opt?.battery ?? quotation.battery ?? {};
  const invPrice = num(inv.sellingRate ?? inv.inverterFinalPrice ?? inv.price ?? 0);
  const batWith = num(bat.withOldPrice ?? bat.sellingRate ?? 0);
  const batWithout = num(bat.withoutOldPrice ?? batWith);

  const calculations = {
    calculatedVA: num(inv.inverterVA ?? quotation.calculations?.calculatedVA ?? quotation.loadSizing?.roundedVA ?? quotation.requirements?.loadSizing?.roundedVA ?? 0),
    calculatedAH: num(bat.capacityAh ?? bat.batteryAH ?? quotation.calculations?.calculatedAH ?? quotation.loadSizing?.roundedAH ?? quotation.requirements?.loadSizing?.roundedAH ?? 0),
    backupHours: num(quotation.backupHours ?? quotation.calculations?.backupHours ?? opt?.estimatedBackup ?? 0),
    totalLoad: num(quotation.totalLoad ?? quotation.calculations?.totalLoad ?? opt?.totalLoad ?? 0),
  };

  const pricingMode = quotation.pricingMode ?? pricingModeFromExchangeMode(quotation.batteryExchangeMode) ?? "withOld";
  const savedCharges = quotation.additionalCharges && Object.keys(quotation.additionalCharges).length
    ? quotation.additionalCharges
    : emptyAdditionalCharges();
  const totals = calculateInvoiceTotals({
    inverterPrice: invPrice,
    batteryWithOldPrice: batWith,
    batteryWithoutOldPrice: batWithout,
    pricingMode,
    additionalCharges: savedCharges,
    gstRate: quotation.gstRate ?? 18,
    discount: quotation.discount ?? 0,
  });

  return {
    quotationId: String(quotation.id ?? quotation.quoteKey ?? quotation._id ?? ""),
    quoteKey: quotation.quoteKey ?? quotation.id,
    recommendationType: opt?.recommendationType ?? quotation.recommendationMode ?? "",
    customerDetails: {
      name: quotation.customerName ?? quotation.customer ?? "",
      phone: quotation.customerPhone ?? quotation.phone ?? "",
      address: quotation.customerAddress ?? "",
      place: quotation.flatType ?? quotation.houseType ?? "",
    },
    selectedOption: opt,
    inverter: {
      id: inv.id,
      brand: inv.brand ?? "",
      model: inv.modelName ?? inv.inverterModelNumber ?? "",
      inverterVA: calculations.calculatedVA,
      price: invPrice,
      warranty: inv.warranty ?? "",
    },
    battery: {
      id: bat.id,
      brand: bat.brand ?? "",
      model: bat.modelName ?? bat.batteryModelNumber ?? "",
      batteryAH: calculations.calculatedAH,
      batteryType: bat.batteryType ?? "",
      withOldPrice: batWith,
      withoutOldPrice: batWithout,
      warranty: bat.warranty ?? "",
    },
    calculations,
    pricing: {
      pricingMode,
      comboWithOld: num(opt?.comboWithOld ?? opt?.totalPrice ?? invPrice + batWith),
      comboWithoutOld: num(opt?.comboWithoutOld ?? opt?.totalPriceWithoutOld ?? invPrice + batWithout),
      withOldPrice: invPrice + batWith,
      withoutOldPrice: invPrice + batWithout,
    },
    additionalCharges: savedCharges,
    discount: num(quotation.discount ?? 0),
    gstRate: quotation.gstRate ?? 18,
    paymentMode: "Cash",
    paymentStatus: "Unpaid",
    paidAmount: 0,
    notes: {
      delivery: "",
      installation: "",
      warranty: opt?.note ?? "",
    },
    sendWhatsapp: true,
    ...totals,
  };
}

export function draftToInvoiceProducts(draft) {
  const products = [];
  if (draft.inverter?.model) {
    products.push({
      productId: String(draft.inverter.id ?? ""),
      modelName: `${draft.inverter.brand ? `${draft.inverter.brand} ` : ""}${draft.inverter.model} (${draft.inverter.inverterVA} VA)`.trim(),
      quantity: 1,
      rate: num(draft.inverter.price),
      amount: num(draft.inverter.price),
    });
  }
  if (draft.battery?.model) {
    products.push({
      productId: String(draft.battery.id ?? ""),
      modelName: `${draft.battery.brand ? `${draft.battery.brand} ` : ""}${draft.battery.model} (${draft.battery.batteryAH} Ah · ${draft.battery.batteryType || "Battery"})`.trim(),
      quantity: 1,
      rate: num(draft.batteryPrice ?? draft.battery?.withOldPrice),
      amount: num(draft.batteryPrice ?? draft.battery?.withOldPrice),
    });
  }
  return products;
}

/** Normalize any quotation/draft shape for the invoice conversion modal. */
export function normalizeQuotationForInvoice(quotation = {}, selectedOption = null, quotationOptionId = null) {
  const oid = quotationOptionId ?? quotation.quotationOptionId ?? "";
  let opt =
    selectedOption ||
    quotation.selectedOption ||
    quotation.suggestedOptions?.find((o) => o.optionLabel === quotation.recommendedOptionLabel) ||
    quotation.suggestedOptions?.find((o) => o.badge === "Recommended") ||
    quotation.suggestedOptions?.[0];

  if (!selectedOption && oid && Array.isArray(quotation.options) && quotation.options.length) {
    const tier = quotation.options.find(
      (o) =>
        String(o?.id || "").toUpperCase() === String(oid).toUpperCase() ||
        String(o?.clientOptionId || "") === String(oid),
    );
    opt = tier?.selectedRow ?? tier ?? opt;
  } else if (!selectedOption && Array.isArray(quotation.options) && quotation.options.length === 1) {
    const tier = quotation.options[0];
    opt = tier?.selectedRow ?? tier ?? opt;
  }

  return {
    ...quotation,
    customerName: quotation.customerName ?? quotation.customer ?? "",
    customerPhone: quotation.customerPhone ?? quotation.phone ?? "",
    customerAddress: quotation.customerAddress ?? "",
    quoteKey: quotation.quoteKey ?? quotation.id ?? quotation.quotationId ?? "",
    quotationOptionId: oid,
    selectedOption: opt,
    suggestedOptions: quotation.suggestedOptions?.length ? quotation.suggestedOptions : opt ? [opt] : [],
  };
}

function pickSelectedOption(source = {}, selectedOption = null) {
  return (
    selectedOption ||
    source.selectedOption ||
    source.suggestedOptions?.find((o) => o.badge === "Recommended") ||
    source.suggestedOptions?.[0] ||
    source.options?.[0]
  );
}

/** Stage 2 editable quotation draft from a recommendation sheet + chosen option. */
export function buildQuotationDraftFromRecommendation(sheet = {}, selectedOption = null) {
  const opt = pickSelectedOption(sheet, selectedOption);
  const inv = opt?.inverter ?? {};
  const bat = opt?.battery ?? {};
  const invPrice = num(inv.sellingRate ?? inv.inverterFinalPrice ?? 0);
  const batWith = num(bat.withOldPrice ?? bat.sellingRate ?? 0);
  const batWithout = num(bat.withoutOldPrice ?? batWith);
  const loadSizing = sheet.requirements?.loadSizing ?? sheet.loadSizing ?? {};
  const pricingMode = "withOld";
  const additionalCharges = emptyAdditionalCharges();
  const totals = calculateInvoiceTotals({
    inverterPrice: invPrice,
    batteryWithOldPrice: batWith,
    batteryWithoutOldPrice: batWithout,
    pricingMode,
    additionalCharges,
    gstRate: 18,
    discount: 0,
  });
  const validTill = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const calculations = {
    calculatedVA: num(inv.inverterVA ?? loadSizing.roundedVA ?? 0),
    calculatedAH: num(bat.capacityAh ?? loadSizing.roundedAH ?? 0),
    backupHours: num(sheet.backupHours ?? opt?.estimatedBackup ?? 0),
    totalLoad: num(sheet.totalLoad ?? opt?.totalLoad ?? loadSizing.totalWatts ?? 0),
  };

  return {
    recommendationSheetId: sheet._id ? String(sheet._id) : "",
    sheetKey: sheet.sheetKey ?? sheet.id ?? "",
    quotationKind: sheet.quotationKind ?? "combo",
    quoteKey: "",
    customerName: sheet.customerName ?? sheet.customer ?? "",
    customerPhone: sheet.customerPhone ?? sheet.phone ?? "",
    customerAddress: sheet.customerAddress ?? "",
    flatType: sheet.flatType ?? "",
    backupHours: sheet.backupHours ?? 4,
    totalLoad: calculations.totalLoad,
    loadSizing,
    calculations,
    selectedOption: opt,
    suggestedOptions: [opt],
    recommendedOptionLabel: opt?.optionLabel ?? "",
    recommendationMode: sheet.recommendationMode ?? "",
    requirements: sheet.requirements ?? {},
    inverter: {
      brand: inv.brand ?? "",
      model: inv.modelName ?? inv.inverterModelNumber ?? opt?.inverterName ?? "",
      inverterVA: calculations.calculatedVA,
      price: invPrice,
      warranty: inv.warranty ?? "",
    },
    battery: {
      brand: bat.brand ?? "",
      model: bat.modelName ?? bat.batteryModelNumber ?? opt?.batteryName ?? "",
      batteryAH: calculations.calculatedAH,
      batteryType: bat.batteryType ?? "",
      withOldPrice: batWith,
      withoutOldPrice: batWithout,
      warranty: bat.warranty ?? "",
    },
    pricingMode,
    additionalCharges,
    discount: 0,
    gstRate: 18,
    validTill,
    status: "Draft",
    documentStage: "final",
    date: new Date().toISOString().slice(0, 10),
    notes: {
      validity: "Prices valid till the validity date mentioned above.",
      stock: "Subject to stock availability at time of order.",
      notInvoice: "This is a quotation / estimate — not a tax invoice.",
      advance: "Advance payment may be required to confirm the order.",
    },
    ...totals,
  };
}

/** Hydrate Stage 2 editor from an existing quotation document. */
export function buildQuotationDraftFromQuotation(quotation = {}) {
  const opt = pickSelectedOption(quotation);
  const sheetLike = { ...quotation, selectedOption: opt, requirements: quotation.requirements ?? {} };
  const base = buildQuotationDraftFromRecommendation(sheetLike, opt);
  const charges =
    quotation.additionalCharges && Object.keys(quotation.additionalCharges).length
      ? quotation.additionalCharges
      : emptyAdditionalCharges();
  const totals = calculateInvoiceTotals({
    inverterPrice: base.inverter?.price,
    batteryWithOldPrice: base.battery?.withOldPrice,
    batteryWithoutOldPrice: base.battery?.withoutOldPrice,
    pricingMode: quotation.pricingMode ?? base.pricingMode ?? "withOld",
    additionalCharges: charges,
    gstRate: quotation.gstRate ?? 18,
    discount: quotation.discount ?? 0,
  });
  return {
    ...base,
    _id: quotation._id ? String(quotation._id) : undefined,
    quoteKey: quotation.quoteKey ?? quotation.id ?? "",
    quotationId: String(quotation.quoteKey ?? quotation.id ?? quotation._id ?? ""),
    quotationOptionId: quotation.quotationOptionId ?? "",
    customerName: quotation.customerName ?? base.customerName,
    customerPhone: quotation.customerPhone ?? base.customerPhone,
    customerAddress: quotation.customerAddress ?? base.customerAddress,
    validTill: quotation.validTill ?? base.validTill,
    status: quotation.status ?? "Draft",
    pdfGenerated: Boolean(quotation.pdfGenerated),
    finalQuotationPdfUrl: quotation.finalQuotationPdfUrl ?? quotation.quotationPdfUrl ?? "",
    additionalCharges: charges,
    discount: num(quotation.discount ?? 0),
    gstRate: quotation.gstRate ?? 18,
    pricingMode: quotation.pricingMode ?? "withOld",
    ...totals,
  };
}
