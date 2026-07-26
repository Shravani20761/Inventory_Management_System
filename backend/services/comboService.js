import { listProducts } from "./inventoryService.js";

const APPLIANCE_WATTS = {
  fan: 75,
  light: 15,
  led: 15,
  tv: 120,
  refrigerator: 250,
  fridge: 250,
  computer: 200,
  laptop: 65,
  router: 15,
  ac: 1500,
};

const FLAT_LOAD_RULES = {
  "1RK": { load: 400, suitableFor: "2 fans, 4 lights, 1 TV" },
  "1BHK": { load: 650, suitableFor: "2 fans, 6 lights, 1 TV, 1 refrigerator" },
  "2BHK": { load: 850, suitableFor: "3 fans, 8 lights, 1 TV, 1 refrigerator" },
  "3BHK": { load: 1200, suitableFor: "4 fans, 10 lights, 1 TV, 1 refrigerator, 1 geyser/pump" },
  "4BHK": { load: 1600, suitableFor: "5 fans, 12 lights, 2 TVs, 1 refrigerator, 1 pump" },
};

const OPTION_RULES = [
  { label: "Budget", multiplier: 0.85, backupBoost: 0, bestFor: "Basic backup" },
  { label: "Recommended", multiplier: 1, backupBoost: 1, bestFor: "Best balance" },
  { label: "Premium", multiplier: 1.25, backupBoost: 2, bestFor: "High performance" },
  { label: "Long Backup", multiplier: 1.45, backupBoost: 4, bestFor: "Longer backup" },
  { label: "Heavy Load", multiplier: 1.7, backupBoost: 5, bestFor: "Heavy load" },
];

function productType(product) {
  return String(product.type ?? product.category ?? "").toLowerCase();
}

function sellingRate(product) {
  return Number(product.sellingRate ?? product.sellRate ?? 0);
}

function loadFromAppliances(appliances = []) {
  return appliances.reduce((sum, appliance) => {
    if (typeof appliance === "string") return sum + (APPLIANCE_WATTS[appliance.toLowerCase()] ?? 0);
    const name = String(appliance.name ?? appliance.type ?? "").toLowerCase();
    const watts = Number(appliance.watts ?? APPLIANCE_WATTS[name] ?? 0);
    const quantity = Number(appliance.quantity ?? appliance.qty ?? 1);
    return sum + watts * quantity;
  }, 0);
}

function estimateBackupHours(battery, totalLoad) {
  const ah = Number(battery.capacityAh ?? battery.ah ?? 0);
  const voltage = Number(battery.voltage || 12);
  if (!ah || !totalLoad) return 0;
  return Number(((ah * voltage * 0.8) / totalLoad).toFixed(2));
}

function inverterVaForLoad(load, multiplier = 1) {
  const requiredVa = load * multiplier * 1.25;
  if (requiredVa <= 900) return 900;
  if (requiredVa <= 1100) return 1100;
  if (requiredVa <= 1500) return 1500;
  if (requiredVa <= 1800) return 1800;
  return 2000;
}

function batteryAhForBackup(load, backupHours, boost = 0) {
  const requiredAh = ((load * (backupHours + boost)) / (12 * 0.8));
  if (requiredAh <= 150) return 150;
  if (requiredAh <= 180) return 180;
  if (requiredAh <= 220) return 220;
  return 240;
}

function rankByCapacity(product, targetAh) {
  const ah = Number(product.capacityAh ?? product.ah ?? 0);
  return Math.abs((ah || targetAh) - targetAh);
}

export async function recommendCombo(requirements = {}, context = {}) {
  const inventory = await listProducts({
    includeProfit: false,
    branchId: context.branchId ?? null,
    isSuperAdmin: context.isSuperAdmin ?? false,
  });
  const flatRule = FLAT_LOAD_RULES[requirements.flatType];
  const totalLoad = Number(requirements.totalLoad ?? 0) || flatRule?.load || loadFromAppliances(requirements.appliances);
  const budget = Number(requirements.budget ?? Number.MAX_SAFE_INTEGER);
  const requestedBackup = Number(requirements.backupHours ?? 0);
  const budgetTier = requirements.budgetTier ?? "Medium";

  const batteries = inventory.filter((product) => {
    const type = productType(product);
    return Number(product.quantity ?? 0) > 0 && !type.includes("accessory");
  });
  const inverters = inventory.filter((product) => {
    const type = productType(product);
    const name = String(product.modelName ?? product.model ?? "").toLowerCase();
    return Number(product.quantity ?? 0) > 0 && (type.includes("inverter") || type.includes("ups") || name.includes("va"));
  });

  const recommendations = [];
  const filteredRules =
    budgetTier === "Low" ? OPTION_RULES.slice(0, 3) : budgetTier === "High" ? OPTION_RULES.slice(1) : [...OPTION_RULES];

  filteredRules.forEach((rule) => {
    const targetAh = batteryAhForBackup(totalLoad, requestedBackup || 4, rule.backupBoost);
    const requiredVa = inverterVaForLoad(totalLoad, rule.multiplier);
    const battery = [...batteries].sort((a, b) => {
      const priceDelta = sellingRate(a) - sellingRate(b);
      if (rule.label === "Budget" && priceDelta) return priceDelta;
      return rankByCapacity(a, targetAh) - rankByCapacity(b, targetAh);
    })[0];
    const inverter = inverters.find((item) => String(item.modelName ?? item.model ?? "").includes(String(requiredVa))) ?? inverters[0] ?? null;

    if (battery) {
      const totalPrice = sellingRate(battery) + (inverter ? sellingRate(inverter) : 0);
      const estimatedBackup = estimateBackupHours(battery, totalLoad);
      const alerts = [];

      if (totalPrice > budget) alerts.push("Combo exceeds customer budget");
      if (requestedBackup && estimatedBackup && estimatedBackup < requestedBackup) alerts.push("Estimated backup is below requirement");
      if (sellingRate(battery) < Number(battery.purchaseRate ?? 0)) alerts.push(`${battery.modelName ?? battery.model} is selling below purchase rate`);
      if (!inverter) alerts.push(`Add ${requiredVa}VA inverter product to inventory for live inverter pricing`);

      recommendations.push({
        comboName: `Option - ${rule.label}`,
        optionType: rule.label,
        customerType: requirements.customerType ?? "Retail",
        flatType: requirements.flatType ?? "",
        suitableFor: flatRule?.suitableFor ?? "",
        requiredInverterVa: requiredVa,
        requiredBatteryAh: targetAh,
        inverter,
        battery,
        totalLoad,
        estimatedBackup: estimatedBackup || requestedBackup + rule.backupBoost,
        totalPrice,
        bestFor: rule.bestFor,
        alerts,
      });
    }
  });

  recommendations.sort((a, b) => {
    const aBudgetPenalty = a.totalPrice > budget ? 1 : 0;
    const bBudgetPenalty = b.totalPrice > budget ? 1 : 0;
    if (aBudgetPenalty !== bBudgetPenalty) return aBudgetPenalty - bBudgetPenalty;
    if (requestedBackup) return Math.abs(requestedBackup - b.estimatedBackup) - Math.abs(requestedBackup - a.estimatedBackup);
    return a.totalPrice - b.totalPrice;
  });

  return {
    input: requirements,
    totalLoad,
    recommendations: recommendations.slice(0, 8),
  };
}
