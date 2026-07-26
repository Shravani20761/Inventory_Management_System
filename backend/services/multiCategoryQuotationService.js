import { listProducts } from "./inventoryService.js";
import {
  ah,
  inverterVa,
  isHomeBattery,
  isHomeInverter,
  MAX_QUOTATION_COMBO_OPTIONS,
} from "./recommendationService.js";
import { normalizeQuotationKind } from "../constants/quotationKinds.js";
import { resolveBatteriesByVehicle } from "./vehicleBatteryCompatibilityService.js";
import { previewComboFromComboInventory } from "./comboRowQuotationService.js";
import { applyOptionalServicesToOptions } from "../utils/optionalServices.js";

const FLAT_LOAD = { "1RK": 400, "1BHK": 650, "2BHK": 850, "3BHK": 1200 };

function price(p) {
  return Number(p.sellingRate ?? p.sellRate ?? 0);
}

function requiredInverterVa(loadW) {
  if (loadW <= 900) return 900;
  if (loadW <= 1100) return 1100;
  if (loadW <= 1500) return 1500;
  return 1800;
}

function estimateBackupHoursFromBattery(battery, loadW) {
  const cap = ah(battery);
  if (!cap || !loadW) return 0;
  return Number(((cap * 12 * 0.8) / loadW).toFixed(1));
}

const FLAT_APPLIANCES = {
  "1RK": "2 fans, 4 lights, 1 TV",
  "1BHK": "2 fans, 6 lights, 1 TV, 1 refrigerator",
  "2BHK": "3 fans, 8 lights, 2 TVs, 1 refrigerator",
  "3BHK": "4 fans, 12 lights, 2 TVs, 1 refrigerator, 1 pump",
};

const TIER_PROFILES = [
  { key: "Budget", optionLabel: "Option 1 - Budget", badge: "Budget", color: "#059669", weight: 1.35 },
  { key: "Recommended", optionLabel: "Option 2 - Recommended", badge: "Recommended", color: "#0f4aa2", weight: 1 },
  { key: "Premium", optionLabel: "Option 3 - Premium", badge: "Premium", color: "#7c3aed", weight: 0.65 },
  { key: "LongBackup", optionLabel: "Option 4 - Long Backup", badge: "Long Backup", color: "#ea580c", weight: 0.85 },
  { key: "Solar", optionLabel: "Option 5 - Solar", badge: "Solar", color: "#0891b2", weight: 1.05 },
  { key: "HeavyLoad", optionLabel: "Option 6 - Heavy Load", badge: "Heavy Load", color: "#dc2626", weight: 0.75 },
];

function scoreInverterForTarget(p, targetVa, profile, preferredBrand) {
  if (Number(p.quantity ?? 0) <= 0) return Infinity;
  if (preferredBrand && !String(p.brand ?? "").toLowerCase().includes(preferredBrand.toLowerCase())) return Infinity;
  const va = inverterVa(p) || targetVa;
  if (va < 600) return Infinity;
  if (profile.key === "Solar" && !String(p.modelName ?? p.model ?? "").toLowerCase().includes("solar")) return 1e15;
  return Math.abs(va - targetVa) + price(p) * 0.00006 * profile.weight;
}

function pickInverters(pool, targetVa, profile, preferredBrand, limit = 1) {
  const sorted = [...pool].sort(
    (a, b) =>
      scoreInverterForTarget(a, targetVa, profile, preferredBrand) -
      scoreInverterForTarget(b, targetVa, profile, preferredBrand),
  );
  return sorted.filter((p) => scoreInverterForTarget(p, targetVa, profile, preferredBrand) < Infinity).slice(0, limit);
}

function scoreBatteryForBackup(p, targetAh, profile, preferredBrand) {
  if (Number(p.quantity ?? 0) <= 0) return Infinity;
  if (preferredBrand && !String(p.brand ?? "").toLowerCase().includes(preferredBrand.toLowerCase())) return Infinity;
  const cap = ah(p);
  if (cap < 40) return Infinity;
  return Math.abs(cap - targetAh) + price(p) * 0.00006 * profile.weight;
}

function pickBatteries(pool, targetAh, profile, preferredBrand, limit = 1) {
  const sorted = [...pool].sort(
    (a, b) =>
      scoreBatteryForBackup(a, targetAh, profile, preferredBrand) -
      scoreBatteryForBackup(b, targetAh, profile, preferredBrand),
  );
  return sorted.filter((p) => scoreBatteryForBackup(p, targetAh, profile, preferredBrand) < Infinity).slice(0, limit);
}

/** Car/bike branch SKUs are often below 40Ah; home-battery scoring would drop them all. */
function scoreBatteryForVehicleLive(p, targetAh, profile, preferredBrand) {
  if (Number(p.quantity ?? 0) <= 0) return Infinity;
  if (preferredBrand && !String(p.brand ?? "").toLowerCase().includes(preferredBrand.toLowerCase())) return Infinity;
  const cap = ah(p);
  const label = String(p.modelName ?? p.model ?? "").trim();
  if (cap < 3 && !label) return Infinity;
  return Math.abs(cap - targetAh) + price(p) * 0.00006 * profile.weight;
}

function pickBatteriesVehicleLive(pool, targetAh, profile, preferredBrand, limit = 1) {
  const sorted = [...pool].sort(
    (a, b) =>
      scoreBatteryForVehicleLive(a, targetAh, profile, preferredBrand) -
      scoreBatteryForVehicleLive(b, targetAh, profile, preferredBrand),
  );
  return sorted
    .filter((p) => scoreBatteryForVehicleLive(p, targetAh, profile, preferredBrand) < Infinity)
    .slice(0, limit);
}

function rawBatteryAhNeeded(loadW, backupHours) {
  return (loadW * backupHours) / (12 * 0.8);
}

function requiredBatteryAh(loadW, backupHours) {
  const needed = rawBatteryAhNeeded(loadW, backupHours);
  if (needed <= 150) return 150;
  if (needed <= 180) return 180;
  if (needed <= 220) return 220;
  return Math.min(300, Math.ceil(needed / 30) * 30);
}

function mapInverterOption(inv, profile, loadW, appliancesNote) {
  const va = inverterVa(inv) || requiredInverterVa(loadW);
  const pr = price(inv);
  const ahHint = requiredBatteryAh(loadW, 4);
  const backupSuitability = `Inverter-only supply. For ~4h backup at ~${loadW}W load, typically pair with ${ahHint}Ah+ tubular (use Battery quote for exact SKU & exchange pricing).`;
  return {
    optionLabel: profile.optionLabel,
    badge: profile.badge,
    color: profile.color,
    inverter: {
      id: inv.id ?? inv._id,
      modelName: String(inv.inverterModel ?? inv.modelName ?? inv.model ?? "").trim() || "—",
      inverterModelNumber: String(inv.inverterModel ?? inv.modelName ?? inv.model ?? "").trim(),
      brand: inv.brand,
      inverterVA: va,
      sellingRate: pr,
      inverterFinalPrice: pr,
      warranty: inv.warranty || "2 Years",
      imageUrl: inv.imageUrl || "",
    },
    battery: null,
    totalLoad: loadW,
    estimatedBackup: null,
    backupSuitability,
    backup: backupSuitability,
    totalPrice: pr,
    total: pr,
    warranty: inv.warranty || "As per manufacturer",
    suitableFor: appliancesNote || "",
    comparisonNote: `Live inventory · ${inv.brand} · ${va} VA`,
    onlinePrices: {
      amazon: inv.amazonPrice,
      flipkart: inv.flipkartPrice,
      batteryBhai: inv.batteryBhaiPrice,
      batteryBoss: inv.batteryBossPrice,
    },
  };
}

function mapBatteryOnlyOption(bat, profile, backupHours, loadW) {
  const cap = ah(bat);
  const pr = price(bat);
  const ob = Number(bat.newRateWithOB ?? bat.sellRate ?? pr);
  const wo = Number(bat.newRateWithoutOB ?? 0);
  const bk = loadW > 0 ? estimateBackupHoursFromBattery(bat, loadW) : backupHours;
  return {
    optionLabel: profile.optionLabel,
    badge: profile.badge,
    color: profile.color,
    inverter: null,
    battery: {
      id: bat.id ?? bat._id,
      modelName: String(bat.batteryModel ?? bat.modelName ?? bat.model ?? "").trim() || "—",
      batteryModelNumber: String(bat.batteryModel ?? bat.modelName ?? bat.model ?? "").trim(),
      brand: bat.brand,
      capacityAh: cap,
      batteryType: bat.batteryType || bat.type,
      sellingRate: pr,
      withOldPrice: ob,
      withoutOldPrice: wo > 0 ? wo : ob,
      warranty: bat.warranty || "60 Months",
      imageUrl: bat.imageUrl || "",
    },
    totalLoad: loadW || 0,
    estimatedBackup: bk,
    backup: bk ? `~${bk} hrs (estimated at ~${loadW || 650}W)` : `${backupHours}h target`,
    totalPrice: ob || pr,
    total: ob || pr,
    warranty: bat.warranty || "—",
    suitableFor: bat.suitableFor || "",
    comparisonNote: `Live inventory · ${bat.brand} · ${cap} Ah`,
    onlinePrices: {
      amazon: bat.amazonPrice,
      flipkart: bat.flipkartPrice,
      batteryBhai: bat.batteryBhaiPrice,
      batteryBoss: bat.batteryBossPrice,
    },
  };
}

function mapBatteryInventoryToOption(b, profile, kind) {
  const pr = Number(b.price ?? 0);
  const ob = Number(b.priceWithOld ?? b.price ?? pr);
  const wo = Number(b.priceWithoutOld ?? 0);
  const cap = Number(b.capacityAh ?? 0);
  return {
    optionLabel: profile.optionLabel,
    badge: profile.badge,
    color: profile.color,
    inverter: null,
    battery: {
      id: b._id?.toString() ?? b.batteryCode,
      batteryCode: b.batteryCode,
      modelName: b.modelNumber,
      brand: b.batteryBrand,
      capacityAh: cap,
      batteryType: kind,
      sellingRate: pr,
      withOldPrice: ob,
      withoutOldPrice: wo,
      warranty: b.warranty || "—",
      imageUrl: b.imageUrl || "",
    },
    totalPrice: ob || pr,
    total: ob || pr,
    comparisonNote: `vehicleCompatibility → ${b.batteryCode}`,
    onlinePrices: {
      amazon: b.amazonPrice,
      flipkart: b.flipkartPrice,
      batteryBhai: b.batteryBhaiPrice,
      batteryBoss: b.batteryBossPrice,
    },
  };
}

async function previewCarBatteriesFromLiveInventory(requirements, context, kind) {
  const brand = String(kind === "bike" ? requirements.bikeBrand : requirements.vehicleBrand ?? "").trim();
  const model = String(kind === "bike" ? requirements.bikeModel : requirements.vehicleModel ?? "").trim();
  const flatType = requirements.flatType ?? "1BHK";
  const backupHours = Number(requirements.backupHours ?? 4);
  const loadW = Number(requirements.totalLoad) || FLAT_LOAD[flatType] || 650;
  const preferredBrand = requirements.preferredBrand ?? "";
  const targetAh = requiredBatteryAh(loadW, backupHours);

  const products = await listProducts({ includeProfit: false, ...context });
  const typeSet =
    kind === "car"
      ? new Set(["car", "truck"])
      : new Set(["bike", "two-wheeler", "two wheeler", "scooter"]);
  let pool = products.filter((p) => {
    const t = String(p.type || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const norm = t === "two wheeler" ? "two-wheeler" : t;
    return typeSet.has(norm) && Number(p.quantity ?? 0) > 0;
  });

  const brx = brand.toLowerCase();
  if (brand) {
    const byBrand = pool.filter((p) => String(p.brand || "").toLowerCase().includes(brx));
    if (byBrand.length) pool = byBrand;
  }
  const mrx = model.toLowerCase();
  if (model) {
    const byModel = pool.filter((p) =>
      String(p.modelName || p.model || "").toLowerCase().includes(mrx),
    );
    if (byModel.length) pool = byModel;
  }

  if (!pool.length) {
    const err = new Error(
      `No in-stock ${kind === "car" ? "Car/Truck" : "Bike"} batteries matched "${brand}" / "${model}" in branch inventory. Import the Car or Bike sheet for this branch, or add a vehicleCompatibility mapping.`,
    );
    err.status = 400;
    throw err;
  }

  const used = new Set();
  const options = [];
  for (const profile of TIER_PROFILES) {
    const ahTarget = Math.round(
      targetAh + (profile.key === "Premium" ? 30 : profile.key === "Budget" ? -20 : 0),
    );
    const candidates = pool.filter((p) => !used.has(String(p.id ?? p._id)));
    const picks = pickBatteriesVehicleLive(candidates, ahTarget, profile, preferredBrand, 1);
    const bat = picks[0];
    if (!bat) continue;
    used.add(String(bat.id ?? bat._id));
    options.push(mapBatteryOnlyOption(bat, profile, backupHours, loadW));
    if (options.length >= MAX_QUOTATION_COMBO_OPTIONS) break;
  }

  if (!options.length) {
    const err = new Error(
      "Car/bike rows are in stock but none produced quotation options; check Ah/capacity and selling prices on imported rows.",
    );
    err.status = 400;
    throw err;
  }

  return {
    quotationKind: kind,
    vehicleBrand: kind === "car" ? brand : "",
    vehicleModel: kind === "car" ? model : "",
    fuelType: kind === "car" ? String(requirements.fuelType ?? "").trim() : "",
    bikeBrand: kind === "bike" ? brand : "",
    bikeModel: kind === "bike" ? model : "",
    suggestedOptions: options,
    recommendedOptionLabel: options.find((o) => o.badge === "Recommended")?.optionLabel || options[0]?.optionLabel,
    inventoryStats: {
      vehicleMatches: 0,
      batteryCodes: 0,
      inStockBatteries: pool.length,
      liveInventoryFallback: true,
    },
    vehicleCompatibilitySource: false,
    liveInventoryFallback: true,
  };
}

async function previewCarBatteries(requirements, context, kind) {
  const vehicleType = kind === "car" ? "four-wheeler" : "two-wheeler";
  const brand = String(kind === "bike" ? requirements.bikeBrand : requirements.vehicleBrand ?? "").trim();
  const model = String(kind === "bike" ? requirements.bikeModel : requirements.vehicleModel ?? "").trim();
  const fuelType = kind === "car" ? String(requirements.fuelType ?? "").trim() : "";

  if (!brand || !model) {
    const err = new Error("Vehicle brand and model are required.");
    err.status = 400;
    throw err;
  }
  if (kind === "car" && !fuelType) {
    const err = new Error("Fuel type is required for four-wheeler battery quotation.");
    err.status = 400;
    throw err;
  }

  const { rows, codes, batteries } = await resolveBatteriesByVehicle(vehicleType, brand, model, fuelType);

  if (!rows.length) {
    try {
      return await previewCarBatteriesFromLiveInventory(requirements, context, kind);
    } catch {
      const err = new Error(
        `No vehicleCompatibility record for ${brand} ${model}${fuelType ? ` · ${fuelType}` : ""}, and no matching in-stock ${kind === "car" ? "Car/Truck" : "Bike"} batteries in branch inventory. Add vehicleCompatibility in MongoDB or import Car/Bike inventory for this branch.`,
      );
      err.status = 400;
      throw err;
    }
  }
  if (!batteries.length) {
    try {
      return await previewCarBatteriesFromLiveInventory(requirements, context, kind);
    } catch {
      const err = new Error(
        `Battery codes ${codes.join(", ")} are mapped for this vehicle, but none are in stock (batteryInventory · qty > 0), and no Car/Bike branch inventory matched brand/model.`,
      );
      err.status = 400;
      throw err;
    }
  }

  const used = new Set();
  const options = [];
  for (const profile of TIER_PROFILES) {
    const b = batteries.find((x) => !used.has(x.batteryCode));
    if (!b) break;
    used.add(b.batteryCode);
    options.push(mapBatteryInventoryToOption(b, profile, kind));
    if (options.length >= MAX_QUOTATION_COMBO_OPTIONS) break;
  }

  if (!options.length) {
    const err = new Error("Could not assemble quotation options from batteryInventory.");
    err.status = 400;
    throw err;
  }

  return {
    quotationKind: kind,
    vehicleBrand: kind === "car" ? brand : "",
    vehicleModel: kind === "car" ? model : "",
    fuelType: kind === "car" ? fuelType : "",
    bikeBrand: kind === "bike" ? brand : "",
    bikeModel: kind === "bike" ? model : "",
    suggestedOptions: options,
    recommendedOptionLabel: options.find((o) => o.badge === "Recommended")?.optionLabel || options[0]?.optionLabel,
    inventoryStats: {
      vehicleMatches: rows.length,
      batteryCodes: codes.length,
      inStockBatteries: batteries.length,
    },
    vehicleCompatibilitySource: true,
    liveInventoryFallback: false,
  };
}

async function previewInverterOnly(requirements, context) {
  const products = await listProducts({ includeProfit: false, ...context });
  const pool = products.filter((p) => isHomeInverter(p) && Number(p.quantity ?? 0) > 0);
  if (!pool.length) {
    const err = new Error("No inverter SKUs in stock for inverter-only quotation.");
    err.status = 400;
    throw err;
  }
  const flatType = requirements.flatType ?? "1BHK";
  const loadW = Number(requirements.totalLoad) || FLAT_LOAD[flatType] || 650;
  const preferredBrand = requirements.preferredBrand ?? "";
  const appliancesNote = requirements.roomNotes || requirements.customerRequirements || FLAT_APPLIANCES[flatType] || "";

  const used = new Set();
  const options = [];
  for (const profile of TIER_PROFILES) {
    const targetVa = Math.round(
      requiredInverterVa(loadW * (profile.key === "HeavyLoad" ? 1.2 : profile.key === "Budget" ? 0.95 : 1)),
    );
    const candidates = pool.filter((p) => !used.has(String(p.id ?? p._id)));
    const picks = pickInverters(candidates, targetVa, profile, preferredBrand, 1);
    const inv = picks[0];
    if (!inv) continue;
    used.add(String(inv.id ?? inv._id));
    options.push(mapInverterOption(inv, profile, loadW, appliancesNote));
    if (options.length >= MAX_QUOTATION_COMBO_OPTIONS) break;
  }

  if (!options.length) {
    const err = new Error("Could not build inverter options from current stock.");
    err.status = 400;
    throw err;
  }

  return {
    quotationKind: "inverter",
    flatType,
    totalLoad: loadW,
    appliancesNote,
    suggestedOptions: options,
    recommendedOptionLabel: options.find((o) => o.badge === "Recommended")?.optionLabel || options[0]?.optionLabel,
    inventoryStats: { inverters: pool.length },
  };
}

async function previewBatteryOnly(requirements, context) {
  const products = await listProducts({ includeProfit: false, ...context });
  const pool = products.filter((p) => isHomeBattery(p) && Number(p.quantity ?? 0) > 0);
  if (!pool.length) {
    const err = new Error("No home backup batteries in stock for battery-only quotation.");
    err.status = 400;
    throw err;
  }
  const flatType = requirements.flatType ?? "1BHK";
  const backupHours = Number(requirements.backupHours ?? 4);
  const loadW = Number(requirements.totalLoad) || FLAT_LOAD[flatType] || 650;
  const targetAh = requiredBatteryAh(loadW, backupHours);
  const preferredBrand = requirements.preferredBrand ?? "";

  const usedBat = new Set();
  const options = [];
  for (const profile of TIER_PROFILES) {
    const ahTarget = Math.round(targetAh + (profile.key === "Premium" ? 30 : profile.key === "Budget" ? -20 : 0));
    const candidates = pool.filter((p) => !usedBat.has(String(p.id ?? p._id)));
    const picks = pickBatteries(candidates, ahTarget, profile, preferredBrand, 1);
    const bat = picks[0];
    if (!bat) continue;
    usedBat.add(String(bat.id ?? bat._id));
    options.push(mapBatteryOnlyOption(bat, profile, backupHours, loadW));
    if (options.length >= MAX_QUOTATION_COMBO_OPTIONS) break;
  }
  if (!options.length) {
    const err = new Error("Could not build battery options from current stock.");
    err.status = 400;
    throw err;
  }

  return {
    quotationKind: "battery",
    flatType,
    backupHours,
    totalLoad: loadW,
    batteryRange: `${Math.min(100, targetAh - 30)}Ah – ${targetAh + 60}Ah`,
    suggestedOptions: options,
    recommendedOptionLabel: options.find((o) => o.badge === "Recommended")?.optionLabel || options[0]?.optionLabel,
    inventoryStats: { batteries: pool.length },
  };
}

/**
 * Preview quotation options for any supported `quotationKind`.
 * Car/bike prefer `vehicleCompatibility` + `batteryInventory`, then fall back to branch Car/Bike category inventory.
 */
export async function previewQuotationByKind(kindInput, requirements = {}, context = {}) {
  const kind = normalizeQuotationKind(kindInput);
  let result;
  switch (kind) {
    case "combo":
      result = { quotationKind: "combo", ...(await previewComboFromComboInventory(requirements, context)) };
      break;
    case "inverter":
      result = await previewInverterOnly(requirements, context);
      break;
    case "battery":
      result = await previewBatteryOnly(requirements, context);
      break;
    case "car":
      result = await previewCarBatteries(requirements, context, "car");
      break;
    case "bike":
      result = await previewCarBatteries(requirements, context, "bike");
      break;
    default:
      result = { quotationKind: "combo", ...(await previewComboFromComboInventory(requirements, context)) };
  }
  if (result?.suggestedOptions?.length) {
    result.suggestedOptions = applyOptionalServicesToOptions(result.suggestedOptions, requirements);
    result.batteryExchangeMode = requirements.batteryExchangeMode ?? "withOld";
    result.brandPairingPreference = requirements.brandPairingPreference ?? "mixedAllowed";
  }
  try {
    const {
      searchBatteryInventory,
      searchInverterInventory,
      searchCarBatteryInventory,
      searchBikeBatteryInventory,
      searchComboInventory,
    } = await import("./inventorySearchService.js");
    const hints = [];
    const seen = new Set();
    const kind = result.quotationKind || "combo";

    const pushFromSearch = (search, inventoryType) => {
      for (const row of search.results ?? []) {
        if (!row.canRequestTransfer || !row.transferSource) continue;
        const key = `${inventoryType}|${row.brand}|${row.model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hints.push({
          brand: row.brand,
          model: row.model,
          productType: row.productType,
          inventoryType,
          hint: `Available at ${row.transferSource.branchName} (Qty: ${row.transferSource.quantity})`,
          otherBranches: row.otherBranches,
          transferSource: row.transferSource,
        });
      }
    };

    if (kind === "car" || kind === "bike") {
      const searchFn = kind === "car" ? searchCarBatteryInventory : searchBikeBatteryInventory;
      const search = await searchFn({
        currentBranchId: context.branchId,
        vehicleBrand: requirements.vehicleBrand,
        vehicleModel: requirements.vehicleModel,
        bikeBrand: requirements.bikeBrand,
        bikeModel: requirements.bikeModel,
        fuelType: requirements.fuelType,
      });
      pushFromSearch(search, kind === "car" ? "car-battery" : "bike-battery");
    } else if (kind === "combo") {
      for (const opt of result?.suggestedOptions ?? []) {
        const inv = opt.inverter;
        const bat = opt.battery;
        if (inv) {
          const search = await searchInverterInventory({
            currentBranchId: context.branchId,
            brand: inv.brand,
            modelNumber: inv.modelName || inv.model || inv.inverterModelNumber,
            inverterVA: inv.inverterVA ?? inv.va,
          });
          pushFromSearch(search, "inverter");
        }
        if (bat) {
          const search = await searchBatteryInventory({
            currentBranchId: context.branchId,
            brand: bat.brand,
            modelNumber: bat.modelName || bat.model || bat.batteryModelNumber,
            capacityAh: bat.ah ?? bat.capacityAh ?? bat.batteryAH,
            batteryType: bat.batteryType,
          });
          pushFromSearch(search, "battery");
        }
        if (inv && bat) {
          const comboSearch = await searchComboInventory({
            currentBranchId: context.branchId,
            inverterVA: inv.inverterVA ?? inv.va,
            batteryAH: bat.ah ?? bat.capacityAh ?? bat.batteryAH,
            batteryType: bat.batteryType,
            brandPreference: opt.brand || inv.brand || bat.brand,
            brandPairing: requirements.brandPairingPreference,
          });
          pushFromSearch(comboSearch, "combo");
        }
      }
    } else {
      for (const opt of result?.suggestedOptions ?? []) {
        for (const part of [opt.inverter, opt.battery]) {
          if (!part) continue;
          const search = await searchBatteryInventory({
            currentBranchId: context.branchId,
            brand: part.brand,
            modelNumber: part.modelName || part.model,
            capacityAh: part.ah ?? part.capacityAh,
            batteryType: part.batteryType,
          });
          pushFromSearch(search, "battery");
        }
      }
    }
    if (hints.length) result.crossBranchHints = hints.slice(0, 8);
  } catch {
    /* optional */
  }
  return result;
}
