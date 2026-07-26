// Business Logic Rules for Battery/Inverter Recommendation Engine

const FLAT_RULES = {
  "1RK": { load: 400, inverterRange: "700 VA - 900 VA", batteryRange: "120Ah - 150Ah", suitableFor: "2 fans, 4 lights, 1 TV" },
  "1BHK": { load: 650, inverterRange: "900 VA - 1100 VA", batteryRange: "150Ah - 180Ah", suitableFor: "2 fans, 6 lights, 1 TV, 1 refrigerator" },
  "2BHK": { load: 850, inverterRange: "900 VA - 1500 VA", batteryRange: "150Ah - 220Ah", suitableFor: "3 fans, 8 lights, 1 TV, 1 refrigerator" },
  "3BHK": { load: 1200, inverterRange: "1500 VA - 1800 VA", batteryRange: "180Ah - 240Ah", suitableFor: "4 fans, 10 lights, 1 TV, 1 refrigerator, 1 geyser/pump" },
  "4BHK+": { load: 1600, inverterRange: "1800 VA - 2500 VA", batteryRange: "220Ah - 300Ah", suitableFor: "5 fans, 12 lights, 2 TVs, 1 refrigerator, 1 pump" },
};

const QUOTE_OPTION_RULES = [
  { type: "Budget", color: "#128044", va: 900, ah: 150, backupBoost: 0, note: "Best for basic backup and cost-effective solution." },
  { type: "Recommended", color: "#0f4aa2", va: 1100, ah: 180, backupBoost: 1, note: "Best balance of performance, reliability and price." },
  { type: "Premium", color: "#6f3aa8", va: 1500, ah: 220, backupBoost: 3, note: "High performance for longer backup and heavier load." },
  { type: "Long Backup", color: "#d75a10", va: 1800, ah: 220, backupBoost: 4, note: "Longer backup for extended power cuts." },
  { type: "Heavy Load", color: "#b4234a", va: 2000, ah: 240, backupBoost: 6, note: "For larger homes and heavier connected load." },
];

// Helper functions
function productPrice(product) {
  return Number(product?.sellingRate ?? product?.sellRate ?? 0);
}

function productAh(product) {
  return Number(product?.capacityAh ?? product?.ah ?? 0);
}

function estimateBackup(product, load, requested, boost) {
  const ah = productAh(product);
  if (!ah || !load) return `${requested + boost} to ${requested + boost + 1} Hours`;
  const backup = (ah * 12 * 0.8) / load;
  return `${Math.max(1, Math.floor(backup))} to ${Math.max(2, Math.ceil(backup + boost))} Hours`;
}

function findBatteryForOption(inventory, option, budgetTier, optionIndex = 0, preferredBrand = '') {
  const available = inventory.filter((item) => Number(item.quantity || 0) > 0 && item.availability !== false);
  const withAh = available.filter((item) => productAh(item) > 0);
  let pool = withAh.length ? withAh : available;
  
  // Filter by preferred brand if specified
  if (preferredBrand) {
    const brandMatch = pool.filter(item => item.brand.toLowerCase() === preferredBrand.toLowerCase());
    if (brandMatch.length > 0) pool = brandMatch;
  }
  
  const sorted = [...pool].sort((a, b) => {
    if (budgetTier === "Budget") return productPrice(a) - productPrice(b);
    if (budgetTier === "Premium") return productPrice(b) - productPrice(a);
    return Math.abs(productAh(a) - option.ah) - Math.abs(productAh(b) - option.ah);
  });
  return sorted[Math.min(optionIndex, sorted.length - 1)] || sorted[0] || null;
}

function findInverterForOption(inventory, option, optionIndex = 0, preferredBrand = '') {
  const matches = inventory.filter((item) => {
    const name = (item.modelName || item.model || '').toLowerCase();
    const type = String(item.category || item.type || "").toLowerCase();
    const hasVA = item.inverterVA || (name.includes(`${option.va}`) || name.includes("va"));
    return Number(item.quantity || 0) > 0 && item.availability !== false && hasVA;
  });
  
  // Filter by preferred brand if specified
  let pool = matches;
  if (preferredBrand) {
    const brandMatch = pool.filter(item => item.brand.toLowerCase() === preferredBrand.toLowerCase());
    if (brandMatch.length > 0) pool = brandMatch;
  }
  
  return pool[Math.min(optionIndex, pool.length - 1)] || pool[0] || null;
}

// Main recommendation function
function buildQuotationOptions(inventory, requirements) {
  const flatRule = FLAT_RULES[requirements.flatType] || FLAT_RULES["2BHK"];
  const requestedBackup = Number(requirements.backupHours || 5);
  const budgetTier = requirements.budgetType || "Recommended";
  const preferredBrand = requirements.preferredBrand || "";
  
  // Determine which options to show based on budget tier
  let allowed;
  if (budgetTier === "Budget") {
    allowed = QUOTE_OPTION_RULES.slice(0, 2);
  } else if (budgetTier === "Premium") {
    allowed = QUOTE_OPTION_RULES.slice(1);
  } else {
    allowed = QUOTE_OPTION_RULES.slice(0, 3);
  }

  return allowed.map((option, index) => {
    const battery = findBatteryForOption(inventory, option, budgetTier, index, preferredBrand);
    const inverter = findInverterForOption(inventory, option, index, preferredBrand);
    const batteryRate = productPrice(battery);
    const inverterRate = productPrice(inverter);
    const total = batteryRate + inverterRate;
    const alerts = [];
    
    if (!battery) alerts.push("No battery stock found for this option.");
    if (!inverter) alerts.push(`${option.va}VA inverter price pending: add/select inverter in inventory.`);
    if (requirements.maxBudget && total > Number(requirements.maxBudget)) alerts.push("This option is above customer budget.");

    return {
      optionId: `OPT-${index + 1}`,
      type: option.type,
      color: option.color,
      inverterName: inverter ? (inverter.modelName || inverter.model) : `Recommended ${option.va}VA inverter`,
      inverterId: inverter?._id || inverter?.id || "",
      inverterVA: option.va,
      inverterRate,
      batteryName: battery ? (battery.modelName || battery.model) : `Recommended ${option.ah}Ah battery`,
      batteryId: battery?._id || battery?.id || "",
      batteryAh: productAh(battery) || option.ah,
      batteryRate,
      backup: estimateBackup(battery, flatRule.load, requestedBackup, option.backupBoost),
      warranty: `${inverter ? "2 Years" : "As per inventory"} (Inverter) / ${battery?.warranty || "60 Months"} (Battery)`,
      suitableFor: flatRule.suitableFor,
      total,
      note: option.note,
      alerts,
    };
  });
}

module.exports = {
  FLAT_RULES,
  QUOTE_OPTION_RULES,
  buildQuotationOptions,
  estimateBackup,
  productPrice,
  productAh
};
