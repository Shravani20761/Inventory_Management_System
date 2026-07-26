/**
 * Mode 2 — Predefined Combo: fetch ready-made bundles from `inv_battery_combos` (combo inventory).
 */
import { branchQuery } from "../utils/branchQuery.js";
import InvBatteryCombo from "../models/inventory/InvBatteryCombo.js";
import { invComboToLegacy } from "./categoryInventoryService.js";
import { computeComboLoadSizing, POWER_FACTOR, BATTERY_VOLTAGE, EFFICIENCY } from "./comboLoadSizingService.js";
import {
  ahFromComboRow,
  isQuotableComboRow,
  mapComboInventoryRowToOption,
  vaFromComboRow,
} from "./comboRowQuotationService.js";
import { normalizeRecommendationMode, RECOMMENDATION_MODE_PREDEFINED } from "../shared/constants/recommendationModes.js";

const INTELLIGENT_PROFILES = [
  { key: "Budget", optionLabel: "Option 1 - Budget", badge: "Budget", color: "#059669" },
  { key: "Recommended", optionLabel: "Option 2 - Recommended", badge: "Recommended", color: "#0f4aa2" },
  { key: "Premium", optionLabel: "Option 3 - Premium", badge: "Premium", color: "#7c3aed" },
  { key: "LongBackup", optionLabel: "Option 4 - Long Backup", badge: "Long Backup", color: "#ea580c" },
  { key: "HeavyLoad", optionLabel: "Option 5 - Heavy Load", badge: "Heavy Load", color: "#dc2626" },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function comboPrice(row) {
  return num(
    row.finalPriceWithOldBattery ?? row.newRateWithOB ?? row.sellingRate ?? row.comboPrice ?? row.sellRate ?? 0,
  );
}

function filterComboBrand(rows, brandSel) {
  const b = String(brandSel ?? "").trim().toLowerCase();
  if (!b || b === "any" || b === "any brand") return rows;
  return rows.filter((r) => String(r.brand ?? "").toLowerCase().includes(b));
}

async function loadComboInventoryRows(context) {
  const q = branchQuery(context.branchId, context.isSuperAdmin);
  const docs = await InvBatteryCombo.find(q).lean();
  return docs.map((d) => invComboToLegacy(d));
}

function pickBudget(rows, used) {
  return [...rows]
    .filter((r) => !used.has(String(r._id ?? r.id)))
    .sort((a, b) => comboPrice(a) - comboPrice(b))[0];
}

function pickRecommended(rows, used, roundedVA, roundedAH) {
  return [...rows]
    .filter((r) => !used.has(String(r._id ?? r.id)))
    .sort((a, b) => {
      const da =
        Math.abs(vaFromComboRow(a) - roundedVA) +
        Math.abs(ahFromComboRow(a) - roundedAH) * 0.2 +
        comboPrice(a) * 0.00002;
      const db =
        Math.abs(vaFromComboRow(b) - roundedVA) +
        Math.abs(ahFromComboRow(b) - roundedAH) * 0.2 +
        comboPrice(b) * 0.00002;
      return da - db;
    })[0];
}

function pickPremium(rows, used) {
  const tubular = rows.filter(
    (r) =>
      !used.has(String(r._id ?? r.id)) && /tubular|tall\s*tubular|opjt|opzv/i.test(r.batteryType ?? ""),
  );
  const pool = tubular.length ? tubular : rows.filter((r) => !used.has(String(r._id ?? r.id)));
  return [...pool].sort((a, b) => num(b.capacityAh ?? b.ah) - num(a.capacityAh ?? a.ah) || comboPrice(b) - comboPrice(a))[0];
}

function pickLongBackup(rows, used) {
  return [...rows]
    .filter((r) => !used.has(String(r._id ?? r.id)))
    .sort((a, b) => ahFromComboRow(b) - ahFromComboRow(a) || comboPrice(b) - comboPrice(a))[0];
}

function pickHeavyLoad(rows, used) {
  return [...rows]
    .filter((r) => !used.has(String(r._id ?? r.id)))
    .sort((a, b) => vaFromComboRow(b) - vaFromComboRow(a) || comboPrice(a) - comboPrice(b))[0];
}

/**
 * Predefined combo mode — exact VA/Ah match on inv_battery_combos rows only.
 */
export async function previewPredefinedComboQuotation(requirements = {}, context = {}) {
  const sizing = computeComboLoadSizing(requirements);
  const {
    totalWatts,
    flatType,
    backupHours,
    roundedVA,
    roundedAH,
    appliancesNote,
    loadSizing,
    warnings,
  } = sizing;

  const inverterBrand = String(requirements.inverterBrand ?? "").trim();
  const batteryBrand = String(requirements.batteryBrand ?? "").trim();
  const preferredBrand = String(requirements.preferredBrand ?? "").trim();

  let allRows = await loadComboInventoryRows(context);
  let matching = allRows.filter((row) => {
    if (!isQuotableComboRow(row)) return false;
    return vaFromComboRow(row) === roundedVA && ahFromComboRow(row) === roundedAH;
  });

  if (inverterBrand || batteryBrand) {
    if (inverterBrand) matching = filterComboBrand(matching, inverterBrand);
    if (batteryBrand) matching = filterComboBrand(matching, batteryBrand);
  } else if (preferredBrand) {
    matching = filterComboBrand(matching, preferredBrand);
  }

  console.log("Matching Predefined Combos (exact VA/Ah)", matching);

  if (!matching.length) {
    const err = new Error(
      `No predefined combo rows with exact inverterVA === ${roundedVA} and batteryAH === ${roundedAH} (qty > 0). ` +
        `Upload promotional bundles to inv_battery_combos or switch to Dynamic Recommendation mode.`,
    );
    err.status = 400;
    throw err;
  }

  matching.sort((a, b) => comboPrice(a) - comboPrice(b));

  const used = new Set();
  const suggestedOptions = [];

  for (const profile of INTELLIGENT_PROFILES) {
    let row;
    if (profile.key === "Budget") row = pickBudget(matching, used);
    else if (profile.key === "Recommended") row = pickRecommended(matching, used, roundedVA, roundedAH);
    else if (profile.key === "Premium") row = pickPremium(matching, used);
    else if (profile.key === "LongBackup") row = pickLongBackup(matching, used);
    else if (profile.key === "HeavyLoad") row = pickHeavyLoad(matching, used);
    if (!row) continue;
    used.add(String(row._id ?? row.id));
    const opt = mapComboInventoryRowToOption(row, profile, totalWatts, backupHours, appliancesNote);
    suggestedOptions.push({
      ...opt,
      recommendationType: "Predefined Combo",
      recommendationMode: RECOMMENDATION_MODE_PREDEFINED,
    });
  }

  while (suggestedOptions.length < Math.min(INTELLIGENT_PROFILES.length, matching.length)) {
    const row = matching.find((r) => !used.has(String(r._id ?? r.id)));
    if (!row) break;
    used.add(String(row._id ?? row.id));
    const profile = INTELLIGENT_PROFILES[suggestedOptions.length % INTELLIGENT_PROFILES.length];
    const opt = mapComboInventoryRowToOption(row, profile, totalWatts, backupHours, appliancesNote);
    suggestedOptions.push({
      ...opt,
      recommendationType: "Predefined Combo",
      recommendationMode: RECOMMENDATION_MODE_PREDEFINED,
    });
  }

  console.log("Generated Predefined Combos", suggestedOptions);

  if (warnings.length) {
    console.warn("[predefined-combo] appliance warnings:", warnings);
  }

  return {
    quotationKind: "combo",
    recommendationMode: RECOMMENDATION_MODE_PREDEFINED,
    flatType,
    houseType: requirements.houseType ?? flatType,
    numberOfRooms: requirements.numberOfRooms ?? "",
    backupHours,
    budgetType: requirements.budgetType ?? "Recommended",
    preferredBrand,
    inverterBrand,
    batteryBrand,
    totalLoad: totalWatts,
    inverterRange: `${roundedVA} VA (exact standard size from load ÷ ${POWER_FACTOR})`,
    batteryRange: `${roundedAH} Ah (exact standard size for ${backupHours}h @ ${EFFICIENCY} efficiency, ${BATTERY_VOLTAGE}V)`,
    estimatedBackupRange: `${Math.max(1, backupHours - 1)} to ${backupHours + 3} Hours depending on usage`,
    appliancesNote,
    loadSizing,
    appliances: requirements.appliances,
    suggestedOptions,
    recommendedOptionLabel:
      suggestedOptions.find((o) => o.badge === "Recommended")?.optionLabel || suggestedOptions[0]?.optionLabel,
    inventoryStats: {
      comboRowsTotal: allRows.length,
      comboRowsExactMatch: matching.length,
      optionsReturned: suggestedOptions.length,
      sizingMode: loadSizing.lines?.length ? "appliance-table" : "flat-load-estimate",
      catalogSource: "inv_battery_combos",
    },
  };
}

export { normalizeRecommendationMode };
