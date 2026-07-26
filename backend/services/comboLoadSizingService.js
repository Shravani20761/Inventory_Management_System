/**
 * Shared load sizing for combo quotations (dynamic + predefined modes).
 * Uses applianceConfig.js as the single wattage source.
 */
import { computeApplianceLoadLines } from "../shared/constants/applianceConfig.js";

export const STANDARD_INVERTER_VA = [600, 800, 900, 1100, 1250, 1450, 2000];
export const STANDARD_BATTERY_AH = [150, 180, 200, 220];

export const POWER_FACTOR = 0.8;
export const BATTERY_VOLTAGE = 12;
export const EFFICIENCY = 0.85;

const FLAT_LOAD = { "1RK": 400, "1BHK": 650, "2BHK": 850, "3BHK": 1200 };
const FLAT_APPLIANCES = {
  "1RK": "2 fans, 4 lights, 1 TV",
  "1BHK": "2 fans, 6 lights, 1 TV, 1 refrigerator",
  "2BHK": "3 fans, 8 lights, 2 TVs, 1 refrigerator",
  "3BHK": "4 fans, 12 lights, 2 TVs, 1 refrigerator, 1 pump",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Nearest standard VA ≥ calculated VA (exact ladder value returned). */
export function roundUpStandardInverterVa(watts) {
  const calculatedVA = watts / POWER_FACTOR;
  const selectedVA = STANDARD_INVERTER_VA.find((v) => v >= calculatedVA);
  return selectedVA ?? STANDARD_INVERTER_VA[STANDARD_INVERTER_VA.length - 1];
}

/** Nearest standard Ah ≥ calculated Ah (exact ladder value returned). */
export function roundUpStandardBatteryAh(loadWatts, backupHours) {
  const calculatedAH = (loadWatts * backupHours) / (BATTERY_VOLTAGE * EFFICIENCY);
  const selectedAH = STANDARD_BATTERY_AH.find((a) => a >= calculatedAH);
  return selectedAH ?? STANDARD_BATTERY_AH[STANDARD_BATTERY_AH.length - 1];
}

function buildAppliancesNote(lines, flatType) {
  const parts = lines.map((l) => `${l.quantity}× ${l.categoryLabel} (${l.typeLabel}) — ${l.lineWatts} W`);
  const tail = flatType ? ` · ${flatType}` : "";
  return parts.length ? `${parts.join("; ")}${tail}` : FLAT_APPLIANCES[flatType] || "";
}

/**
 * @param {Record<string, unknown>} requirements
 * @returns {{ totalWatts, lines, warnings, flatType, backupHours, calculatedVA, roundedVA, calculatedAH, roundedAH, appliancesNote, loadSizing }}
 */
export function computeComboLoadSizing(requirements = {}) {
  const flatType = requirements.flatType ?? requirements.houseType ?? "1BHK";
  const backupHours = Math.max(0.5, num(requirements.backupHours ?? 4));
  const appliances = requirements.appliances ?? [];
  let lines = [];
  let totalWatts;
  let warnings = [];

  if (Array.isArray(appliances) && appliances.length) {
    const res = computeApplianceLoadLines(appliances);
    lines = res.lines;
    totalWatts = res.totalWatts;
    warnings = res.warnings ?? [];
    if (!lines.length || totalWatts <= 0) {
      const err = new Error(
        "Add at least one appliance with a valid category, type, and quantity so total wattage can be calculated.",
      );
      err.status = 400;
      throw err;
    }
  } else {
    totalWatts = num(requirements.totalLoad) || FLAT_LOAD[flatType] || 0;
    if (totalWatts <= 0) {
      const err = new Error("totalLoad or flatType-based estimate is required when no appliances are provided.");
      err.status = 400;
      throw err;
    }
  }

  console.log("Calculated Watts", totalWatts);

  const calculatedVA = totalWatts / POWER_FACTOR;
  const roundedVA = roundUpStandardInverterVa(totalWatts);
  const calculatedAH = (totalWatts * backupHours) / (BATTERY_VOLTAGE * EFFICIENCY);
  const roundedAH = roundUpStandardBatteryAh(totalWatts, backupHours);

  console.log("Calculated VA", Number(calculatedVA.toFixed(2)));
  console.log("Rounded VA", roundedVA);
  console.log("Calculated AH", Number(calculatedAH.toFixed(2)));
  console.log("Rounded AH", roundedAH);

  const appliancesNote = [
    buildAppliancesNote(lines, flatType),
    [String(requirements.customerRequirements ?? "").trim(), String(requirements.roomNotes ?? "").trim()]
      .filter(Boolean)
      .join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");

  const loadSizing = {
    powerFactor: POWER_FACTOR,
    batteryVoltage: BATTERY_VOLTAGE,
    efficiency: EFFICIENCY,
    lines,
    totalWatts,
    calculatedVA: Number(calculatedVA.toFixed(1)),
    roundedVA,
    calculatedAH: Number(calculatedAH.toFixed(1)),
    roundedAH,
    backupHours,
    warnings,
  };

  return {
    totalWatts,
    lines,
    warnings,
    flatType,
    backupHours,
    calculatedVA,
    roundedVA,
    calculatedAH,
    roundedAH,
    appliancesNote,
    loadSizing,
  };
}
