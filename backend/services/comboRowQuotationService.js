/**
 * Combo inventory row helpers (`mapComboInventoryRowToOption`, `vaFromComboRow`) for legacy imports / admin tools.
 * Live combo quotations route through `previewComboFromComboInventory` (dynamic or predefined mode).
 */
import { isComboInventoryRow } from "./recommendationService.js";

/** VA from row fields + `productCapacity` text only (never parse generic `modelName`). */
function parseVaFromProductCapacityText(cap) {
  const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*va\b/i);
  return m ? Number(m[1]) : 0;
}

/** Ah from row fields + `productCapacity` text only. */
function parseAhFromProductCapacityText(cap) {
  const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*ah\b/i);
  return m ? Number(m[1]) : 0;
}

/** Numeric VA for scoring (any positive value; do not clamp at 600 — that hid real SKUs from matching). */
export function vaFromComboRow(row) {
  let fromField = Number(row.inverterVA ?? 0);
  if ((!Number.isFinite(fromField) || fromField <= 0) && row.inverterVA != null && row.inverterVA !== "") {
    const m = String(row.inverterVA).match(/(\d+(?:\.\d+)?)\s*va\b/i);
    if (m) fromField = Number(m[1]);
  }
  if (fromField > 0) return fromField;
  return parseVaFromProductCapacityText(row.productCapacity);
}

/** Numeric Ah for scoring (any positive value; do not clamp at 40). */
export function ahFromComboRow(row) {
  const fromField = Number(row.capacityAh ?? row.ah ?? row.batteryAH ?? 0);
  if (Number.isFinite(fromField) && fromField > 0) return fromField;
  return parseAhFromProductCapacityText(row.productCapacity);
}

function comboRowKey(row) {
  return String(row._id ?? row.legacyId ?? row.id ?? row.comboId ?? row.modelName ?? "");
}

/** Row qualifies as a quotable combo SKU (single document). */
export function isQuotableComboRow(row) {
  if (!isComboInventoryRow(row)) return false;
  if (Number(row.quantity ?? 0) <= 0) return false;
  const invName = String(row.inverterModel ?? "").trim();
  const batName = String(row.batteryModel ?? "").trim();
  const sku = String(row.modelName ?? "").trim();
  if (!invName && !batName && !sku) return false;
  const va = vaFromComboRow(row);
  const cap = ahFromComboRow(row);
  const hasCapText = String(row.productCapacity ?? "").trim().length > 0;
  const hasPrice =
    Number(row.finalPriceWithOldBattery ?? row.newRateWithOB ?? row.sellingRate ?? row.sellRate ?? 0) > 0;
  // Need at least one usable spec *or* both models + a price (small VA / Ah kits are valid).
  if (va < 1 && cap < 1 && !hasCapText && !(hasPrice && invName && batName)) return false;
  return true;
}

/**
 * Map one Inv + Battery inventory row → one quotation option. **No derived pairing** — numeric fields are taken from the document as stored.
 */
export function mapComboInventoryRowToOption(row, profile, loadW, backupHours, appliancesNote) {
  const va = vaFromComboRow(row);
  const cap = ahFromComboRow(row);
  const invModel = String(row.inverterModel ?? "").trim();
  const batModel = String(row.batteryModel ?? "").trim();
  const skuName = String(row.modelName ?? "").trim();
  const comboId = String(row.comboId ?? "").trim();

  const comboWithOld = Number(
    row.finalPriceWithOldBattery ?? row.newRateWithOB ?? row.sellingRate ?? row.sellRate ?? 0,
  );
  const comboWithoutOld = Number(row.finalPriceWithoutOldBattery ?? row.newRateWithoutOB ?? 0);

  const invPrice = Number(row.inverterPrice ?? 0);
  const batPrice = Number(row.batteryPrice ?? 0);
  const batWithoutFromRow = Number(row.batteryPriceWithoutOld ?? 0);

  const totalWithOld = comboWithOld > 0 ? comboWithOld : invPrice + batPrice;
  const totalWithoutOld = comboWithoutOld > 0 ? comboWithoutOld : totalWithOld;

  const rowBackup = Number(row.backupHours ?? 0);
  const estFromAh = loadW > 0 && cap > 0 ? Number(((cap * 12 * 0.8) / loadW).toFixed(1)) : 0;
  const estimatedBackup = rowBackup > 0 ? rowBackup : estFromAh || backupHours;

  const w = row.warranty || "";
  const invImg = String(row.inverterImage ?? "").trim();
  const batImg = String(row.batteryImage ?? "").trim();
  const legacyImg = String(row.imageUrl ?? "").trim();
  const brandLogoOpt = String(row.brandLogo ?? "").trim();

  return {
    optionLabel: profile.optionLabel,
    badge: profile.badge,
    color: profile.color,
    comboProductId: row._id != null ? String(row._id) : String(row.id ?? ""),
    comboId: comboId || undefined,
    skuModelName: skuName,
    inventoryRowType: "inverter+battery",
    brandLogo: brandLogoOpt,
    inverterImage: invImg,
    batteryImage: batImg,
    inverter: {
      id: row.id ?? row._id,
      modelName: invModel || "—",
      inverterModelNumber: invModel || "—",
      brand: row.brand ?? "",
      inverterVA: va || null,
      sellingRate: invPrice,
      inverterFinalPrice: invPrice,
      warranty: w,
      imageUrl: invImg || legacyImg,
      inverterImage: invImg,
    },
    battery: {
      id: row.id ?? row._id,
      modelName: batModel || "—",
      batteryModelNumber: batModel || "—",
      brand: row.brand ?? "",
      capacityAh: cap || null,
      batteryType: row.batteryType || "",
      withOldPrice: batPrice,
      withoutOldPrice: batWithoutFromRow > 0 ? batWithoutFromRow : batPrice,
      sellingRate: batPrice,
      warranty: w,
      imageUrl: batImg || legacyImg,
      batteryImage: batImg,
    },
    comboWithOld: totalWithOld,
    comboWithoutOld: totalWithoutOld,
    totalPrice: totalWithOld,
    total: totalWithOld,
    totalPriceWithoutOld: totalWithoutOld,
    totalLoad: loadW,
    backupHoursFromRow: rowBackup,
    estimatedBackup,
    backup: row.backupSupport
      ? String(row.backupSupport)
      : estimatedBackup
        ? `~${estimatedBackup} hrs`
        : `~${backupHours}h target`,
    suitableFor: row.suitableFor || appliancesNote || "",
    appliancesNote: appliancesNote || "",
    comparisonNote: `Combo row ${comboId || skuName || comboRowKey(row)} · inv_battery_combos document`,
    note: row.notes || row.backupSupport || "",
    onlinePrices: {
      amazon: row.amazonPrice,
      flipkart: row.flipkartPrice,
      batteryBhai: row.batteryBhaiPrice,
      batteryBoss: row.batteryBossPrice,
    },
    catalogSource: "combo-inventory-row",
  };
}

/**
 * Combo preview router — Mode 1 (dynamic) or Mode 2 (predefined inv_battery_combos).
 */
export async function previewComboFromComboInventory(requirements = {}, context = {}) {
  const { isPredefinedComboMode } = await import("../shared/constants/recommendationModes.js");

  if (isPredefinedComboMode(requirements.recommendationMode ?? requirements.comboMode)) {
    const { previewPredefinedComboQuotation } = await import("./predefinedComboRecommendationService.js");
    return previewPredefinedComboQuotation(requirements, context);
  }

  const { previewDynamicComboQuotation } = await import("./dynamicInvBatRecommendationService.js");
  return previewDynamicComboQuotation(requirements, context);
}
