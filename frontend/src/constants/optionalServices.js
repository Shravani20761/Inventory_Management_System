/** Optional add-on services included in quotation option totals. */
export const OPTIONAL_SERVICE_FIELDS = [
  { key: "trolleyRequired", chargeKey: "trolleyCharges", label: "Trolley Required", defaultAmount: 700 },
  { key: "installationRequired", chargeKey: "inverterInstallation", label: "Installation Required", defaultAmount: 500 },
  { key: "wiringRequired", chargeKey: "wiringCharges", label: "Wiring Required", defaultAmount: 400 },
  { key: "transportationRequired", chargeKey: "transportationCharges", label: "Transportation Required", defaultAmount: 300 },
  { key: "deliveryRequired", chargeKey: "deliveryCharges", label: "Delivery Required", defaultAmount: 250 },
];

export const BATTERY_EXCHANGE_MODES = [
  { value: "withOld", label: "With Old Battery" },
  { value: "withoutOld", label: "Without Old Battery" },
  { value: "showBoth", label: "Show Both Prices" },
];

export const BRAND_PAIRING_PREFERENCES = [
  { value: "mixedAllowed", label: "Mixed Brand Allowed" },
  { value: "sameBrandOnly", label: "Same Brand Only" },
];

export function optionalServicesFromForm(form = {}) {
  const charges = {};
  let total = 0;
  for (const { key, chargeKey, defaultAmount } of OPTIONAL_SERVICE_FIELDS) {
    const enabled = Boolean(form[key]);
    const amount = Number(form[`${key}Amount`] ?? defaultAmount) || 0;
    charges[chargeKey] = { enabled, amount: enabled ? amount : 0 };
    if (enabled) total += amount;
  }
  return { charges, total };
}

export function optionBasePrice(option, pricingMode = "withOld") {
  const inv = option?.inverter ?? {};
  const bat = option?.battery ?? {};
  const invPrice = Number(inv.sellingRate ?? inv.inverterFinalPrice ?? 0);
  const withOld = Number(bat.withOldPrice ?? bat.sellingRate ?? option.comboWithOld ?? 0);
  const withoutOld = Number(bat.withoutOldPrice ?? option.comboWithoutOld ?? withOld);
  if (pricingMode === "withoutOld") return invPrice + withoutOld;
  if (pricingMode === "showBoth") return invPrice + withOld;
  return Number(option.comboWithOld ?? option.totalPrice ?? invPrice + withOld);
}

export function applyOptionalServicesToOptions(options = [], form = {}) {
  const { charges, total: serviceTotal } = optionalServicesFromForm(form);
  const pricingMode = form.batteryExchangeMode ?? "withOld";
  return options.map((opt) => {
    const base = optionBasePrice(opt, pricingMode === "showBoth" ? "withOld" : pricingMode);
    const totalPrice = base + serviceTotal;
    return {
      ...opt,
      optionalServices: charges,
      optionalServicesTotal: serviceTotal,
      baseComboPrice: base,
      totalPrice,
      total: totalPrice,
      pricingMode,
    };
  });
}
