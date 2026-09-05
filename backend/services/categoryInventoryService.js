/**
 * Category-scoped inventory: separate MongoDB collections per product family.
 * Legacy quotation/report code consumes {@link listAllCategoriesAsLegacyProducts} (Product-shaped view).
 */
import mongoose from "mongoose";
import CarBattery from "../models/inventory/CarBattery.js";
import BikeBattery from "../models/inventory/BikeBattery.js";
import InverterSku from "../models/inventory/InverterSku.js";
import InverterInventoryCatalog from "../models/inventory/InverterInventoryCatalog.js";
import InvBatteryCombo from "../models/inventory/InvBatteryCombo.js";
import HomeInvBattery from "../models/inventory/HomeInvBattery.js";
import HomeBackupBatteryInventory from "../models/inventory/HomeBackupBatteryInventory.js";
import TrolleyInventory from "../models/inventory/TrolleyInventory.js";
import LithiumIonBattery from "../models/inventory/LithiumIonBattery.js";
import { branchQuery } from "../utils/branchQuery.js";
import { enrichProductProfit } from "./profitService.js";
import {
  normalizeComboImportRow,
  normalizeHomeInvImportRow,
  normalizeInverterImportRow,
  normalizeTrolleyImportRow,
  normalizeLithiumIonImportRow,
} from "../utils/inventoryImportNormalize.js";

export const CATEGORY = {
  CAR: "car",
  BIKE: "bike",
  INVERTER: "inverter",
  INV_COMBO: "inv_combo",
  HOME_INV: "home_inv",
  TROLLEY: "trolley",
  LITHIUM_ION: "lithium_ion",
};

export const MODEL_BY_KEY = {
  [CATEGORY.CAR]: CarBattery,
  [CATEGORY.BIKE]: BikeBattery,
  [CATEGORY.INVERTER]: InverterInventoryCatalog,
  [CATEGORY.INV_COMBO]: InvBatteryCombo,
  [CATEGORY.HOME_INV]: HomeInvBattery,
  [CATEGORY.TROLLEY]: TrolleyInventory,
  [CATEGORY.LITHIUM_ION]: LithiumIonBattery,
};

/** All Mongo models searched for CRUD by id (includes legacy + dynamic catalog collections). */
export const ALL_INVENTORY_MODELS = [
  CarBattery,
  BikeBattery,
  InverterSku,
  InverterInventoryCatalog,
  InvBatteryCombo,
  HomeInvBattery,
  HomeBackupBatteryInventory,
  TrolleyInventory,
  LithiumIonBattery,
];

const MODEL_TO_CATEGORY = new Map([
  [CarBattery, CATEGORY.CAR],
  [BikeBattery, CATEGORY.BIKE],
  [InverterSku, CATEGORY.INVERTER],
  [InverterInventoryCatalog, CATEGORY.INVERTER],
  [InvBatteryCombo, CATEGORY.INV_COMBO],
  [HomeInvBattery, CATEGORY.HOME_INV],
  [HomeBackupBatteryInventory, CATEGORY.HOME_INV],
  [TrolleyInventory, CATEGORY.TROLLEY],
  [LithiumIonBattery, CATEGORY.LITHIUM_ION],
]);

export { MODEL_TO_CATEGORY };

/** Excel / UI “import type” tab label → category key (Truck shares car collection). */
export const IMPORT_TYPE_TO_CATEGORY = {
  Car: CATEGORY.CAR,
  Truck: CATEGORY.CAR,
  Bike: CATEGORY.BIKE,
  Inverter: CATEGORY.INVERTER,
  "Inverter+Battery": CATEGORY.INV_COMBO,
  "Home Inverter Battery": CATEGORY.HOME_INV,
  Trolley: CATEGORY.TROLLEY,
  "Lithium Ion Battery": CATEGORY.LITHIUM_ION,
};

export function inferCategoryKeyFromLegacyRow(row) {
  if (row?._inventoryCategory != null && MODEL_BY_KEY[row._inventoryCategory]) {
    return row._inventoryCategory;
  }
  const t = String(row?.type ?? row?.category ?? "").toLowerCase();
  if (t.includes("home") && t.includes("inverter")) return CATEGORY.HOME_INV;
  if (t.includes("lithium")) return CATEGORY.LITHIUM_ION;
  if (t.includes("inverter") && t.includes("battery")) return CATEGORY.INV_COMBO;
  if (t === "inverter") return CATEGORY.INVERTER;
  if (t === "bike") return CATEGORY.BIKE;
  if (t === "trolley") return CATEGORY.TROLLEY;
  if (t === "truck") return CATEGORY.CAR;
  return CATEGORY.CAR;
}

async function getBranchWideMaxLegacyId(branchIdStr) {
  if (!branchIdStr) return 0;
  const bid = new mongoose.Types.ObjectId(branchIdStr);
  const rows = await Promise.all(
    ALL_INVENTORY_MODELS.map((M) => M.find({ branchId: bid }).sort({ legacyId: -1 }).limit(1).lean()),
  );
  return rows.reduce((m, arr) => Math.max(m, Number(arr[0]?.legacyId) || 0), 0);
}

const COLLECTION_BY_KEY = {
  [CATEGORY.CAR]: "car_batteries",
  [CATEGORY.BIKE]: "bike_batteries",
  [CATEGORY.INVERTER]: "inverter_inventory",
  [CATEGORY.INV_COMBO]: "inv_battery_combos",
  [CATEGORY.HOME_INV]: "home_inverter_batteries",
  [CATEGORY.TROLLEY]: "trolley_inventory",
  [CATEGORY.LITHIUM_ION]: "lithium_ion_batteries",
};

export function categoryMeta(key) {
  const Model = MODEL_BY_KEY[key];
  return {
    key,
    collectionName: Model?.collection?.collectionName ?? COLLECTION_BY_KEY[key],
    mongooseModel: Model?.modelName ?? key,
  };
}

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v)
    .replace(/rs\.?/gi, "")
    .replace(/[₹$€£¥,\s]/g, "")
    .replace(/\/-?\s*$/g, "")
    .trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (m) return Number(m[0]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBrandToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Car/bike merge keys + saved brand — maps AMARON PRO → Amaron without deleting rows. */
function canonicalAutomotiveBrand(rawBrand) {
  const n = normalizeBrandToken(rawBrand);
  if (!n || n === "unknown") return "";
  if (n.startsWith("exide")) return "Exide";
  if (n.startsWith("amaron")) return "Amaron";
  return String(rawBrand ?? "").trim();
}

function automotiveMergeBrand(row, docShape) {
  const raw = String(row.brand ?? docShape?.brand ?? "").trim();
  const canon = canonicalAutomotiveBrand(raw);
  return (canon || raw).toLowerCase();
}

function parseVaFromProductCapacityText(cap) {
  const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*va\b/i);
  return m ? num(m[1]) : 0;
}

function parseAhFromProductCapacityText(cap) {
  const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*ah\b/i);
  return m ? num(m[1]) : 0;
}

function parseAhFromBatteryModelText(model) {
  const s = String(model ?? "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*ah\b/i) || s.match(/\b(\d{2,3})\s*ah\b/i);
  return m ? num(m[1]) : 0;
}

/** Stable id when Excel omits comboId — only [a-zA-Z0-9-], never raw headers. */
function slugComboId(brand, inv, bat) {
  const raw = [brand, inv, bat]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join("-");
  const slug = raw
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug;
}

/** Map DB doc → legacy Product-like row for quotations / dashboard. */
export function carToLegacy(d) {
  const sell = num(d.priceWithOldBattery);
  const dp = num(d.dpPlusGst ?? d.dp);
  const cd = num(d.cd);
  const cap = num(d.capacity);
  return {
    ...d,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Car",
    category: "Car",
    modelName: d.modelNumber,
    model: d.modelNumber,
    capacityAh: cap,
    ah: cap,
    productCapacity: String(d.productCapacity ?? "").trim() || (cap ? `${cap}Ah` : ""),
    weight: num(d.weight),
    scrapRate: num(d.scrapRate),
    dpPlusGst: dp,
    dp,
    dpPrice: dp,
    cd,
    cdPrice: cd,
    mrp: num(d.mrp),
    purchaseRate: dp,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: num(d.priceWithOldBattery),
    newRateWithoutOB: num(d.priceWithoutOldBattery),
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    vehicleType: d.vehicleType ?? "Car",
    batteryType: d.batteryType ?? "",
    _inventoryCategory: CATEGORY.CAR,
  };
}

export function bikeToLegacy(d) {
  const sell = num(d.price);
  const cap = num(d.capacity);
  const cd = num(d.cd);
  const notes = String(d.notes ?? "").trim();
  return {
    ...d,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Bike",
    category: "Bike",
    modelName: d.modelNumber,
    model: d.modelNumber,
    capacityAh: cap,
    ah: cap,
    productCapacity: notes || (cap ? `${cap} Ah` : ""),
    cd,
    cdPrice: cd,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: sell,
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    _inventoryCategory: CATEGORY.BIKE,
  };
}

export function inverterToLegacy(d) {
  const mrpN = num(d.mrp);
  const sell = num(d.price) || num(d.sellRate);
  const dp = num(d.dp ?? d.dpPrice ?? d.dpPlusGst ?? d.purchaseRate);
  const cd = num(d.cd ?? d.cdPrice);
  return {
    ...d,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Inverter",
    category: "Inverter",
    modelName: d.modelNumber,
    model: d.modelNumber,
    inverterVA: num(d.inverterVA),
    productCapacity: d.productCapacity ?? "",
    dp,
    cd,
    dpPrice: dp,
    cdPrice: cd,
    purchaseRate: dp,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: sell,
    mrp: mrpN,
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    batteryType: d.technology ?? "",
    imageUrl: String(d.image ?? "").trim(),
    _inventoryCategory: CATEGORY.INVERTER,
    _catalogSource: "legacy:inverters",
  };
}

/** Dynamic quotation catalog (`inverter_inventory`) → legacy row for Inventory UI + sync. */
export function inverterCatalogToLegacy(d) {
  const mrpN = num(d.mrp);
  const sell = num(d.price) || num(d.sellRate) || num(d.newRateWithOB);
  const va = num(d.inverterVA);
  const pc = String(d.productCapacity ?? "").trim() || (va ? `${va} VA` : "");
  const dp = num(d.dp ?? d.dpPrice ?? d.dpPlusGst);
  const cd = num(d.cd ?? d.cdPrice);
  const { dpPlusGst: _legacyDpGst, notes: _legacyNotes, srNo: _legacySrNo, ...rest } = d;
  return {
    ...rest,
    _id: d._id,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Inverter",
    category: "Inverter",
    modelName: d.model,
    model: d.model,
    inverterVA: va,
    productCapacity: pc,
    dp,
    cd,
    dpPrice: dp,
    cdPrice: cd,
    purchaseRate: dp,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: sell,
    mrp: mrpN,
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    amazonPrice: num(d.amazonPrice),
    flipkartPrice: num(d.flipkartPrice),
    batteryBhaiPrice: num(d.batteryBhaiPrice),
    batteryBossPrice: num(d.batteryBossPrice),
    imageUrl: String(d.image ?? d.brandDefaultImage ?? "").trim(),
    image: String(d.image ?? "").trim(),
    _inventoryCategory: CATEGORY.INVERTER,
    _catalogSource: "inverter_inventory",
  };
}

function legacyFieldHasValue(row, key) {
  const existing = row[key];
  if (typeof existing === "number") return Number.isFinite(existing) && existing !== 0;
  return String(existing ?? "").trim() !== "";
}

/** Fill missing catalog fields from legacy `inverters` rows — never overwrite catalog pricing. */
function fillLegacyField(row, key, val) {
  if (val === undefined || val === null || val === "") return;
  if (typeof val === "number" && !Number.isFinite(val)) return;
  if (legacyFieldHasValue(row, key)) return;
  row[key] = val;
}

function mergeInverterLegacyRowFields(target, source) {
  fillLegacyField(target, "inverterVA", num(source.inverterVA));
  fillLegacyField(target, "productCapacity", source.productCapacity);
  fillLegacyField(target, "dp", num(source.dp ?? source.dpPrice ?? source.dpPlusGst ?? source.purchaseRate));
  fillLegacyField(target, "cd", num(source.cd ?? source.cdPrice));
  fillLegacyField(target, "purchaseRate", num(source.purchaseRate ?? source.dp ?? source.dpPlusGst));
  fillLegacyField(target, "mrp", num(source.mrp));
  fillLegacyField(target, "sellRate", num(source.sellRate ?? source.sellingRate));
  fillLegacyField(target, "sellingRate", num(source.sellingRate ?? source.sellRate));
  fillLegacyField(target, "newRateWithOB", num(source.newRateWithOB ?? source.sellRate));
  fillLegacyField(target, "amazonPrice", num(source.amazonPrice));
  fillLegacyField(target, "flipkartPrice", num(source.flipkartPrice));
  fillLegacyField(target, "batteryBhaiPrice", num(source.batteryBhaiPrice));
  fillLegacyField(target, "batteryBossPrice", num(source.batteryBossPrice));
  fillLegacyField(target, "warranty", source.warranty);
  fillLegacyField(target, "quantity", num(source.quantity));
}

function inverterLegacyDedupeKey(row) {
  return [
    String(row.brand ?? "").trim().toLowerCase(),
    String(row.model ?? row.modelName ?? "").trim().toLowerCase(),
    String(num(row.inverterVA)),
  ].join("|");
}

function mergeInverterLegacyRows(legacySkuRows, catalogRows) {
  const byKey = new Map();
  for (const row of catalogRows) {
    byKey.set(inverterLegacyDedupeKey(row), { ...row });
  }
  for (const row of legacySkuRows) {
    const k = inverterLegacyDedupeKey(row);
    if (byKey.has(k)) mergeInverterLegacyRowFields(byKey.get(k), row);
    else byKey.set(k, { ...row });
  }
  return [...byKey.values()];
}

/** InvBatteryCombo → legacy row for comboRowQuotationService / isComboInventoryRow */
export function invComboToLegacy(d) {
  const withOld = num(d.finalPriceWithOldBattery);
  const withoutOld = num(d.finalPriceWithoutOldBattery);
  const comboPrice = num(d.comboPrice) || withOld;
  return {
    ...d,
    _id: d._id,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: d.productCategory?.trim() || "Inverter+Battery",
    category: d.productCategory?.trim() || "Inverter+Battery",
    modelName: [d.inverterModel, d.batteryModel].filter(Boolean).join(" + ") || d.comboId || "Combo",
    model: d.comboId || d.inverterModel,
    comboId: d.comboId ?? "",
    brand: d.brand ?? "",
    inverterModel: d.inverterModel ?? "",
    batteryModel: d.batteryModel ?? "",
    inverterVA: num(d.inverterVA),
    capacityAh: num(d.capacityAh),
    ah: num(d.capacityAh),
    batteryAH: num(d.capacityAh),
    productCapacity: (() => {
      const pc = String(d.productCapacity ?? "").trim();
      if (pc) return pc;
      const iv = num(d.inverterVA);
      const ah = num(d.capacityAh);
      const parts = [];
      if (iv) parts.push(`${iv} VA`);
      if (ah) parts.push(`${ah} Ah`);
      return parts.join(" | ");
    })(),
    batteryType: d.batteryType ?? "",
    scrapRate: num(d.scrapRate),
    batteryWeight: num(d.batteryWeight),
    comboPrice,
    inverterPrice: num(d.inverterPrice),
    batteryPrice: num(d.batteryPrice),
    finalPriceWithOldBattery: withOld,
    finalPriceWithoutOldBattery: withoutOld,
    newRateWithOB: withOld,
    newRateWithoutOB: withoutOld,
    sellingRate: withOld,
    sellRate: withOld,
    quantity: num(d.quantity),
    backupHours: num(d.backupHours),
    warranty: d.warranty ?? "",
    suitableFor: d.suitableFor ?? "",
    notes: d.notes ?? "",
    inverterImage: String(d.inverterImage ?? "").trim(),
    batteryImage: String(d.batteryImage ?? "").trim(),
    brandLogo: String(d.brandLogo ?? "").trim(),
    imageUrl: String(d.inverterImage || d.batteryImage || "").trim(),
    _inventoryCategory: CATEGORY.INV_COMBO,
  };
}

export function homeInvToLegacy(d) {
  const sell = num(d.price);
  const wo = num(d.priceWithoutOld);
  const ah = num(d.capacityAH);
  const model = String(d.batteryModel || d.modelNumber || "").trim();
  const cd = num(d.cdPrice);
  const dp = num(d.dpPrice) || num(d.purchaseRate);
  const mrpFinal = num(d.mrpFinal);
  return {
    ...d,
    _id: d._id,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Home Inverter Battery",
    category: "Home Inverter Battery",
    modelName: model,
    model,
    batteryModel: model,
    capacityAh: ah,
    ah,
    batteryAH: ah,
    weight: num(d.batteryWeight),
    scrapRate: num(d.scrapRate),
    cd,
    cdPrice: cd,
    dp,
    dpPrice: dp,
    dpPlusGst: dp,
    purchaseRate: dp,
    mrpFinal,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: sell,
    newRateWithoutOB: wo,
    mrp: mrpFinal,
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    batteryType: d.batteryType ?? "",
    amazonPrice: num(d.amazonPrice),
    flipkartPrice: num(d.flipkartPrice),
    batteryBhaiPrice: num(d.batteryBhaiPrice),
    batteryBossPrice: num(d.batteryBossPrice),
    _inventoryCategory: CATEGORY.HOME_INV,
    _catalogSource: "home_inverter_batteries",
  };
}

/** `battery_inventory` → legacy row (shown on Home Inv Bat tab + dynamic pairing). */
export function homeBackupBatteryCatalogToLegacy(d) {
  const sell = num(d.priceWithOld ?? d.price);
  const wo = num(d.priceWithoutOld);
  const dp = num(d.dpPrice ?? d.purchaseRate);
  const cd = num(d.cdPrice);
  const mrpFinal = num(d.mrpFinal);
  return {
    ...d,
    _id: d._id,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Home Inverter Battery",
    category: "Home Inverter Battery",
    modelName: d.model,
    model: d.model,
    batteryModel: d.model,
    capacityAh: num(d.batteryAH),
    ah: num(d.batteryAH),
    batteryAH: num(d.batteryAH),
    batteryType: d.batteryType ?? "Tubular",
    cd,
    cdPrice: cd,
    dp: dp || sell,
    dpPrice: dp || sell,
    dpPlusGst: dp || sell,
    purchaseRate: dp || sell,
    mrpFinal,
    mrp: mrpFinal,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: sell,
    newRateWithoutOB: wo,
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    imageUrl: String(d.image ?? d.brandDefaultImage ?? "").trim(),
    _inventoryCategory: CATEGORY.HOME_INV,
    _catalogSource: "battery_inventory",
  };
}

export function trolleyToLegacy(d) {
  const sell = num(d.price);
  const va = num(d.compatibleVA);
  const pc = String(d.productCapacity ?? "").trim() || (va ? `${va} VA` : "");
  const dp = num(d.dp ?? d.dpPrice ?? d.dpPlusGst);
  const cd = num(d.cd ?? d.cdPrice);
  const suitableBatteryType = String(d.suitableBatteryType ?? d.description ?? "").trim();
  return {
    ...d,
    _id: d._id,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Trolley",
    category: "Trolley",
    modelName: d.modelNumber,
    model: d.modelNumber,
    compatibleVA: va,
    inverterVA: va,
    productCapacity: pc,
    suitableBatteryType,
    description: suitableBatteryType,
    dp,
    cd,
    dpPrice: dp,
    cdPrice: cd,
    purchaseRate: dp,
    price: sell,
    sellingRate: sell,
    sellRate: sell,
    newRateWithOB: sell,
    quantity: num(d.quantity),
    notes: d.notes ?? "",
    brand: d.brand ?? "Luminous",
    _inventoryCategory: CATEGORY.TROLLEY,
  };
}

export function lithiumIonToLegacy(d) {
  const dp = num(d.dp ?? d.dpPrice ?? d.purchaseRate);
  const cd = num(d.cd ?? d.cdPrice);
  const ah = num(d.capacityAH);
  const voltage = num(d.voltage);
  const ob = num(d.price);
  const wo = num(d.priceWithoutOld);
  const mrpFinal = num(d.mrpFinal ?? d.mrp);
  const sell = ob;
  return {
    ...d,
    _id: d._id,
    id: d.legacyId != null ? d.legacyId : d._id.toString(),
    type: "Lithium Ion Battery",
    category: "Lithium Ion Battery",
    modelName: d.modelNumber,
    model: d.modelNumber,
    batteryModel: d.batteryModel || d.modelNumber,
    voltage,
    capacityAh: ah,
    ah,
    batteryAH: ah,
    weight: num(d.batteryWeight),
    batteryWeight: num(d.batteryWeight),
    batteryType: d.batteryType ?? "Lithium Ion",
    cd,
    cdPrice: cd,
    dp,
    dpPrice: dp,
    dpPlusGst: dp,
    purchaseRate: dp || num(d.purchaseRate),
    mrpFinal,
    mrp: mrpFinal,
    newRateWithOB: ob,
    newRateWithoutOB: wo,
    sellingRate: sell,
    sellRate: sell,
    scrapRate: num(d.scrapRate),
    amazonPrice: num(d.amazonPrice),
    flipkartPrice: num(d.flipkartPrice),
    batteryBhaiPrice: num(d.batteryBhaiPrice),
    batteryBossPrice: num(d.batteryBossPrice),
    quantity: num(d.quantity),
    warranty: d.warranty ?? "",
    supplier: d.supplier ?? "",
    invoiceNo: d.invoiceNo ?? "",
    notes: d.notes ?? "",
    brand: d.brand ?? "Unknown",
    _inventoryCategory: CATEGORY.LITHIUM_ION,
  };
}

export function mapLeanToLegacyProduct(categoryKey, lean) {
  if (categoryKey === CATEGORY.CAR) return carToLegacy(lean);
  if (categoryKey === CATEGORY.BIKE) return bikeToLegacy(lean);
  if (categoryKey === CATEGORY.TROLLEY) return trolleyToLegacy(lean);
  if (categoryKey === CATEGORY.LITHIUM_ION) return lithiumIonToLegacy(lean);
  if (categoryKey === CATEGORY.INVERTER) {
    if (lean.model != null && lean.modelNumber == null) return inverterCatalogToLegacy(lean);
    return inverterToLegacy(lean);
  }
  if (categoryKey === CATEGORY.INV_COMBO) return invComboToLegacy(lean);
  return homeInvToLegacy(lean);
}

export async function listCategory(categoryKey, { branchId = null, isSuperAdmin = false } = {}) {
  const Model = MODEL_BY_KEY[categoryKey];
  if (!Model) throw new Error("Unknown inventory category: " + categoryKey);
  const q = branchQuery(branchId, isSuperAdmin);
  const docs = sortDocsBySheetOrder(await Model.find(q).lean());
  return docs.map((d) => enrichProductProfit(mapLeanToLegacyProduct(categoryKey, d)));
}

export async function listInvCombosRaw({ branchId = null, isSuperAdmin = false } = {}) {
  const q = branchQuery(branchId, isSuperAdmin);
  return InvBatteryCombo.find(q).sort({ legacyId: 1, createdAt: 1 }).lean();
}

export async function listAllCategoriesAsLegacyProducts({
  branchId = null,
  isSuperAdmin = false,
  includeProfit = true,
  /** When true (e.g. sync read), only rows assigned to this branch — no unassigned `$or`. */
  strictBranch = false,
} = {}) {
  const q =
    strictBranch && branchId
      ? { branchId: new mongoose.Types.ObjectId(branchId) }
      : branchQuery(branchId, isSuperAdmin);
  const [cars, bikes, invsLegacy, invsCatalog, combos, homes, batsCatalog, trolleys, lithiumIons] = await Promise.all([
    CarBattery.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    BikeBattery.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    InverterSku.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    InverterInventoryCatalog.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    InvBatteryCombo.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    HomeInvBattery.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    HomeBackupBatteryInventory.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    TrolleyInventory.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
    LithiumIonBattery.find(q).sort({ legacyId: 1, createdAt: 1 }).lean(),
  ]);
  const inverterRows = mergeInverterLegacyRows(
    invsLegacy.map((d) => inverterToLegacy(d)),
    invsCatalog.map((d) => inverterCatalogToLegacy(d)),
  );
  const homeRows = homes.map((d) => homeInvToLegacy(d));
  const rows = [
    ...cars.map((d) => carToLegacy(d)),
    ...bikes.map((d) => bikeToLegacy(d)),
    ...inverterRows,
    ...combos.map((d) => invComboToLegacy(d)),
    ...homeRows,
    ...trolleys.map((d) => trolleyToLegacy(d)),
    ...lithiumIons.map((d) => lithiumIonToLegacy(d)),
  ];
  return includeProfit ? rows.map(enrichProductProfit) : rows;
}

function strictBranch(bid) {
  return bid ? { branchId: new mongoose.Types.ObjectId(bid) } : { branchId: null };
}

function matchKeyForHomeInvRow(row, docShape = null) {
  const model = String(
    row.batteryModel ?? row.model ?? row.modelName ?? docShape?.batteryModel ?? docShape?.modelNumber ?? "",
  )
    .trim()
    .toLowerCase();
  const brand = String(row.brand ?? docShape?.brand ?? "")
    .trim()
    .toLowerCase();
  const ah = num(row.batteryAH ?? row.ah ?? row.capacityAH ?? row.capacityAh ?? docShape?.capacityAH);
  if (model) return `m:${model}|b:${brand}|ah:${ah}`;
  if (brand && ah) return `b:${brand}|ah:${ah}`;
  return "";
}

function matchKeyForCategory(categoryKey, row, docShape = null) {
  if (categoryKey === CATEGORY.INV_COMBO) {
    const cid = String(row.comboId ?? "").trim().toLowerCase();
    if (cid) return `cid:${cid}`;
    return `pair:${String(row.inverterModel ?? "").trim().toLowerCase()}|${String(row.batteryModel ?? row.model ?? "").trim().toLowerCase()}`;
  }
  if (categoryKey === CATEGORY.HOME_INV) return matchKeyForHomeInvRow(row, docShape);
  if (categoryKey === CATEGORY.TROLLEY) {
    const model = String(row.model ?? row.modelName ?? row.modelNumber ?? docShape?.modelNumber ?? "").trim().toLowerCase();
    const brand = String(row.brand ?? docShape?.brand ?? "Luminous").trim().toLowerCase();
    return model ? `m:${model}|b:${brand}` : "";
  }
  if (categoryKey === CATEGORY.LITHIUM_ION) {
    const model = String(row.model ?? row.modelName ?? row.modelNumber ?? docShape?.modelNumber ?? "").trim().toLowerCase();
    const brand = String(row.brand ?? docShape?.brand ?? "").trim().toLowerCase();
    return model ? `m:${model}|b:${brand}` : "";
  }
  const model = String(row.model ?? row.modelName ?? row.modelNumber ?? docShape?.modelNumber ?? docShape?.model ?? "")
    .trim()
    .toLowerCase();
  const brand = String(row.brand ?? docShape?.brand ?? "").trim().toLowerCase();
  if (categoryKey === CATEGORY.INVERTER) {
    return model ? `m:${model}|b:${brand}` : "";
  }
  if (categoryKey === CATEGORY.CAR || categoryKey === CATEGORY.BIKE) {
    const brand = automotiveMergeBrand(row, docShape);
    return model ? `m:${model}|b:${brand}` : "";
  }
  return model ? `m:${model}` : "";
}

function rowToCarDoc(row, bid) {
  const modelNumber = String(row.model ?? row.modelName ?? "").trim() || "Unknown";
  const dp = num(row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate);
  const cd = num(row.cd ?? row.cdPrice);
  const brandRaw = String(row.brand ?? "Unknown").trim() || "Unknown";
  const brandCanon = canonicalAutomotiveBrand(brandRaw);
  return {
    branchId: bid,
    brand: brandCanon || brandRaw,
    modelNumber,
    capacity: num(row.ah ?? row.capacity ?? row.capacityAh),
    productCapacity: String(row.productCapacity ?? "").trim(),
    weight: num(row.weight ?? row.batteryWeight),
    scrapRate: num(row.scrapRate),
    dpPlusGst: dp,
    cd,
    mrp: num(row.mrp ?? row.mrpFinal),
    warranty: String(row.warranty ?? "").trim(),
    priceWithOldBattery: num(row.newRateWithOB ?? row.sellRate ?? row.sellingRate),
    priceWithoutOldBattery: num(row.newRateWithoutOB ?? row.priceWithoutOld),
    quantity: num(row.quantity) || 0,
    vehicleType: String(row.vehicleType ?? row.type ?? "Car").trim() || "Car",
    batteryType: String(row.batteryType ?? "").trim(),
    supplier: String(row.supplier ?? "").trim(),
    invoiceNo: String(row.invoiceNo ?? "").trim(),
    notes: String(row.notes ?? "").trim(),
  };
}

function rowToBikeDoc(row, bid) {
  const modelNumber = String(row.model ?? row.modelName ?? row.batteryModel ?? "").trim() || "Unknown";
  const pcStr = String(row.productCapacity ?? "").trim();
  const cap =
    num(row.ah ?? row.batteryAH ?? row.capacity ?? row.capacityAh) ||
    parseAhFromProductCapacityText(pcStr) ||
    parseAhFromBatteryModelText(modelNumber);
  const sell = num(row.newRateWithOB ?? row.sellRate ?? row.sellingRate);
  const noteParts = [String(row.notes ?? "").trim(), pcStr].filter(Boolean);
  const brandRaw = String(row.brand ?? "Unknown").trim() || "Unknown";
  const brandCanon = canonicalAutomotiveBrand(brandRaw);
  return {
    branchId: bid,
    brand: brandCanon || brandRaw,
    modelNumber,
    capacity: cap,
    warranty: String(row.warranty ?? "").trim(),
    cd: num(row.cd ?? row.cdPrice),
    price: sell,
    quantity: num(row.quantity) || 0,
    supplier: String(row.supplier ?? "").trim(),
    invoiceNo: String(row.invoiceNo ?? "").trim(),
    notes: noteParts.join(" | "),
  };
}

function rowToTrolleyDoc(row, bid) {
  const modelNumber = String(row.model ?? row.modelName ?? "").trim() || "Unknown";
  let va = num(row.compatibleVA ?? row.inverterVA);
  if (!va && row.compatibleVA != null && String(row.compatibleVA).trim() !== "") {
    const m = String(row.compatibleVA).match(/(\d+(?:\.\d+)?)\s*va\b/i);
    if (m) va = num(m[1]);
  }
  let pcStr = String(row.productCapacity ?? "").trim();
  if (!va && pcStr) va = parseVaFromProductCapacityText(pcStr);
  if (!pcStr && va) pcStr = `${va} VA`;
  const dp = num(row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate);
  const cd = num(row.cd ?? row.cdPrice);
  const sell = num(row.price ?? row.sellRate ?? row.sellingRate ?? row.newRateWithOB);
  const suitableBatteryType = String(row.suitableBatteryType ?? row.description ?? "").trim();
  return {
    branchId: bid,
    brand: String(row.brand ?? "Luminous").trim() || "Luminous",
    modelNumber,
    compatibleVA: va,
    productCapacity: pcStr,
    suitableBatteryType,
    dp,
    cd,
    price: sell,
    quantity: num(row.quantity) || 0,
    notes: String(row.notes ?? "").trim(),
  };
}

function rowToLithiumIonDoc(row, bid) {
  const brand = String(row.brand ?? "Unknown").trim() || "Unknown";
  const batteryModel = String(row.batteryModel ?? row.model ?? row.modelName ?? "").trim();
  const modelNumber = batteryModel || "Unknown";
  let voltage = num(row.voltage);
  if (!voltage && row.voltage != null && String(row.voltage).trim() !== "") {
    const m = String(row.voltage).match(/(\d+(?:\.\d+)?)\s*v\b/i);
    if (m) voltage = num(m[1]);
    else voltage = num(String(row.voltage).replace(/[^\d.]/g, ""));
  }
  const ah = num(row.batteryAH ?? row.ah ?? row.capacityAH ?? row.capacityAh);
  const dp = num(row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate);
  const cd = num(row.cd ?? row.cdPrice);
  const mrpFinal = num(row.mrpFinal ?? row.mrp);
  const ob = num(row.newRateWithOB ?? row.sellRate ?? row.sellingRate);
  const wo = num(row.newRateWithoutOB);
  return {
    branchId: bid,
    brand,
    modelNumber,
    batteryModel: batteryModel || modelNumber,
    voltage,
    capacityAH: ah,
    batteryWeight: num(row.weight ?? row.batteryWeight),
    scrapRate: num(row.scrapRate),
    batteryType: String(row.batteryType ?? "Lithium Ion").trim() || "Lithium Ion",
    dp,
    cd,
    mrpFinal,
    price: ob,
    priceWithoutOld: wo,
    purchaseRate: dp,
    warranty: String(row.warranty ?? "").trim(),
    quantity: num(row.quantity) || 0,
    amazonPrice: num(row.amazonPrice),
    flipkartPrice: num(row.flipkartPrice),
    batteryBhaiPrice: num(row.batteryBhaiPrice),
    batteryBossPrice: num(row.batteryBossPrice),
    supplier: String(row.supplier ?? "").trim(),
    invoiceNo: String(row.invoiceNo ?? "").trim(),
    notes: String(row.notes ?? "").trim(),
  };
}

function rowToInverterDoc(row, bid) {
  const model = String(row.model ?? row.modelName ?? "").trim() || "Unknown";
  let inva = num(row.inverterVA);
  if (!inva && row.inverterVA != null && String(row.inverterVA).trim() !== "") {
    const m = String(row.inverterVA).match(/(\d+(?:\.\d+)?)\s*va\b/i);
    if (m) inva = num(m[1]);
  }
  let pcStr = String(row.productCapacity ?? "").trim();
  if (!inva && pcStr) inva = parseVaFromProductCapacityText(pcStr);
  if (!pcStr && inva) pcStr = `${inva} VA`;
  const mrpN = num(row.mrp ?? row.mrpFinal);
  const dp = num(row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate);
  const cd = num(row.cd ?? row.cdPrice);
  const sell = num(row.sellRate ?? row.newRateWithOB ?? row.sellingRate ?? row.price);
  return {
    branchId: bid,
    type: "Inverter",
    brand: row.brand ?? "Unknown",
    model,
    inverterVA: inva,
    productCapacity: pcStr,
    warranty: String(row.warranty ?? "").trim(),
    dp,
    cd,
    mrp: mrpN,
    price: sell,
    quantity: num(row.quantity) || 0,
    amazonPrice: num(row.amazonPrice),
    flipkartPrice: num(row.flipkartPrice),
    batteryBhaiPrice: num(row.batteryBhaiPrice),
    batteryBossPrice: num(row.batteryBossPrice),
    image: String(row.image ?? row.imageUrl ?? "").trim(),
    brandDefaultImage: String(row.brandLogo ?? "").trim(),
  };
}

function rowToInvComboDoc(row, bid) {
  const parseVaFromPc = (cap) => {
    const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*va\b/i);
    return m ? num(m[1]) : 0;
  };
  let inva = num(row.inverterVA);
  if (!inva && row.inverterVA != null && String(row.inverterVA).trim() !== "") {
    const m = String(row.inverterVA).match(/(\d+(?:\.\d+)?)\s*va\b/i);
    if (m) inva = num(m[1]);
  }
  const pcStr = String(row.productCapacity ?? "").trim();
  if (!inva && pcStr) inva = parseVaFromPc(pcStr);

  let cap = num(row.capacityAh ?? row.ah ?? row.batteryAH);
  if (!cap && pcStr) cap = parseAhFromProductCapacityText(pcStr);
  if (!cap) cap = parseAhFromBatteryModelText(row.batteryModel ?? row.model);

  let productCapacity = pcStr;
  if (!productCapacity && (inva || cap)) {
    const parts = [];
    if (inva) parts.push(`${inva} VA`);
    if (cap) parts.push(`${cap} Ah`);
    productCapacity = parts.join(" | ");
  }

  const withOld = num(
    row.finalPriceWithOldBattery ?? row.newRateWithOB ?? row.sellRate ?? row.sellingRate,
  );
  const withoutOld = num(row.finalPriceWithoutOldBattery ?? row.newRateWithoutOB);
  const invPrice = num(row.inverterPrice);
  const batPrice = num(row.batteryPrice);
  const comboPriceLine = num(row.comboPrice) || withOld;

  let comboId = String(row.comboId ?? "").trim();
  const brand = String(row.brand ?? "").trim();
  const inverterModel = String(row.inverterModel ?? "").trim();
  const batteryModel = String(row.batteryModel ?? row.model ?? "").trim();
  if (!comboId && (inverterModel || batteryModel)) {
    comboId = slugComboId(brand, inverterModel, batteryModel);
  }

  const finalWith = num(row.finalPriceWithOldBattery) || withOld;
  const finalWithout = num(row.finalPriceWithoutOldBattery) || withoutOld;

  const qty = num(row.quantity);

  return {
    branchId: bid,
    productCategory: "Inverter+Battery",
    comboId,
    brand,
    inverterModel,
    batteryModel,
    comboPrice: comboPriceLine || finalWith,
    backupHours: num(row.backupHours),
    warranty: String(row.warranty ?? "").trim(),
    quantity: qty,
    inverterPrice: invPrice,
    batteryPrice: batPrice,
    finalPriceWithOldBattery: finalWith,
    finalPriceWithoutOldBattery: finalWithout,
    inverterVA: inva,
    capacityAh: cap,
    productCapacity,
    batteryType: String(row.batteryType ?? "").trim(),
    scrapRate: num(row.scrapRate),
    batteryWeight: num(row.batteryWeight ?? row.weight),
    suitableFor: String(row.suitableFor ?? "").trim(),
    supplier: String(row.supplier ?? "").trim(),
    invoiceNo: String(row.invoiceNo ?? "").trim(),
    notes: String(row.notes ?? "").trim(),
    inverterImage: String(row.inverterImage ?? "").trim(),
    batteryImage: String(row.batteryImage ?? "").trim(),
    brandLogo: String(row.brandLogo ?? "").trim(),
  };
}

function rowToHomeInvDoc(row, bid) {
  const brand = String(row.brand ?? "Unknown").trim() || "Unknown";
  const ah = num(row.batteryAH ?? row.ah ?? row.capacityAH ?? row.capacityAh);
  let batteryModel = String(row.batteryModel ?? row.model ?? row.modelName ?? "").trim();
  if (!batteryModel && brand && ah) batteryModel = `${brand}-${ah}Ah`;
  const modelNumber = batteryModel || "Unknown";
  const ob = num(row.newRateWithOB ?? row.sellRate ?? row.sellingRate);
  const wo = num(row.newRateWithoutOB);
  const cd = num(row.cd ?? row.cdPrice);
  const dp = num(row.dp ?? row.dpPrice ?? row.dpPlusGst ?? row.purchaseRate);
  const mrpFinal = num(row.mrpFinal ?? row.mrp);
  return {
    branchId: bid,
    brand,
    modelNumber,
    batteryModel: batteryModel || modelNumber,
    capacityAH: ah,
    batteryWeight: num(row.weight ?? row.batteryWeight),
    scrapRate: num(row.scrapRate),
    cdPrice: cd,
    dpPrice: dp,
    mrpFinal,
    warranty: String(row.warranty ?? "").trim(),
    price: ob,
    priceWithoutOld: wo,
    purchaseRate: dp,
    quantity: num(row.quantity) || 0,
    batteryType: String(row.batteryType ?? "").trim(),
    amazonPrice: num(row.amazonPrice),
    flipkartPrice: num(row.flipkartPrice),
    batteryBhaiPrice: num(row.batteryBhaiPrice),
    batteryBossPrice: num(row.batteryBossPrice),
    supplier: String(row.supplier ?? "").trim(),
    invoiceNo: String(row.invoiceNo ?? "").trim(),
  };
}

function rowToDoc(categoryKey, row, bid) {
  if (categoryKey === CATEGORY.CAR) return rowToCarDoc(row, bid);
  if (categoryKey === CATEGORY.BIKE) return rowToBikeDoc(row, bid);
  if (categoryKey === CATEGORY.INVERTER) return rowToInverterDoc(row, bid);
  if (categoryKey === CATEGORY.INV_COMBO) return rowToInvComboDoc(row, bid);
  if (categoryKey === CATEGORY.TROLLEY) return rowToTrolleyDoc(row, bid);
  if (categoryKey === CATEGORY.LITHIUM_ION) return rowToLithiumIonDoc(row, bid);
  return rowToHomeInvDoc(row, bid);
}

function normalizeIncomingRow(categoryKey, row) {
  if (!row || typeof row !== "object") return {};
  if (categoryKey === CATEGORY.INV_COMBO) return normalizeComboImportRow(row);
  if (categoryKey === CATEGORY.INVERTER) return normalizeInverterImportRow(row);
  if (categoryKey === CATEGORY.HOME_INV) return normalizeHomeInvImportRow(row);
  if (categoryKey === CATEGORY.TROLLEY) return normalizeTrolleyImportRow(row);
  if (categoryKey === CATEGORY.LITHIUM_ION) return normalizeLithiumIonImportRow(row);
  return { ...row };
}

function sortDocsBySheetOrder(docs) {
  return [...docs].sort((a, b) => {
    const la = num(a.legacyId);
    const lb = num(b.legacyId);
    if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return String(a._id || "").localeCompare(String(b._id || ""));
  });
}

function rowMergeKeyForIncoming(categoryKey, clean, docShape) {
  if (categoryKey === CATEGORY.INV_COMBO) {
    const ok =
      String(clean.comboId ?? "").trim() ||
      String(clean.inverterModel ?? "").trim() ||
      String(clean.batteryModel ?? clean.model ?? "").trim();
    return ok ? matchKeyForCategory(categoryKey, clean) : "";
  }
  const mk =
    categoryKey === CATEGORY.HOME_INV
      ? matchKeyForHomeInvRow(clean, docShape)
      : matchKeyForCategory(categoryKey, clean, docShape);
  if (!mk || mk === "m:") return "";
  return mk;
}

function legacyRowForMergeKey(categoryKey, leanDoc) {
  if (categoryKey === CATEGORY.INV_COMBO) return invComboToLegacy(leanDoc);
  if (categoryKey === CATEGORY.INVERTER) return mapLeanToLegacyProduct(categoryKey, leanDoc);
  if (categoryKey === CATEGORY.TROLLEY) return trolleyToLegacy(leanDoc);
  if (categoryKey === CATEGORY.LITHIUM_ION) return lithiumIonToLegacy(leanDoc);
  if (categoryKey === CATEGORY.HOME_INV) return homeInvToLegacy(leanDoc);
  if (categoryKey === CATEGORY.CAR) return carToLegacy(leanDoc);
  if (categoryKey === CATEGORY.BIKE) return bikeToLegacy(leanDoc);
  return {
    model: leanDoc.modelNumber ?? leanDoc.model,
    modelName: leanDoc.modelNumber ?? leanDoc.model,
    brand: leanDoc.brand,
    batteryModel: leanDoc.batteryModel ?? leanDoc.modelNumber ?? leanDoc.model,
  };
}

/**
 * @deprecated Excel uploads use mergeCategoryRowsFromParsed (append/merge). Never clears the collection.
 */
export async function replaceCategoryRowsFromParsed(categoryKey, incoming, branchId) {
  console.warn(
    `[category:${categoryKey}] replaceCategoryRowsFromParsed called — redirecting to merge (append-only).`,
  );
  const result = await mergeCategoryRowsFromParsed(categoryKey, incoming, branchId, { quantityMode: "add" });
  return result.rows;
}

/** Exposed for inventory CRUD merge with normalized payloads. */
export function importRowToCategoryDocument(categoryKey, row, branchIdStr) {
  const bid = new mongoose.Types.ObjectId(branchIdStr);
  const clean = normalizeIncomingRow(categoryKey, row);
  return rowToDoc(categoryKey, clean, bid);
}

function assertLithiumIonCreateIdentity(clean, legacyRow) {
  const brand = String(clean.brand ?? legacyRow?.brand ?? "").trim();
  const model = String(
    clean.batteryModel ?? clean.model ?? legacyRow?.batteryModel ?? legacyRow?.model ?? legacyRow?.modelName ?? "",
  ).trim();
  const dp = num(clean.dp ?? clean.dpPrice ?? legacyRow?.dp ?? legacyRow?.purchaseRate);
  const cd = num(clean.cd ?? clean.cdPrice ?? legacyRow?.cd);
  if (!brand) {
    const err = new Error("Brand is required for lithium ion battery inventory.");
    err.status = 400;
    throw err;
  }
  if (!model) {
    const err = new Error("Battery Model Number is required.");
    err.status = 400;
    throw err;
  }
  if (!dp || !cd) {
    const err = new Error("DP and CD are required for lithium ion battery inventory.");
    err.status = 400;
    throw err;
  }
}

function assertHomeInvCreateIdentity(clean, legacyRow) {
  const brand = String(clean.brand ?? legacyRow?.brand ?? "").trim();
  const model = String(
    clean.batteryModel ?? clean.model ?? legacyRow?.batteryModel ?? legacyRow?.model ?? legacyRow?.modelName ?? "",
  ).trim();
  const ah = num(clean.batteryAH ?? clean.ah ?? legacyRow?.batteryAH ?? legacyRow?.ah ?? legacyRow?.capacityAh);
  if (!brand) {
    const err = new Error("Brand is required for home battery inventory.");
    err.status = 400;
    throw err;
  }
  if (!model && !(Number.isFinite(ah) && ah > 0)) {
    const err = new Error("Battery Model Number or Product Capacity (Ah) is required.");
    err.status = 400;
    throw err;
  }
  const batteryType = String(clean.batteryType ?? legacyRow?.batteryType ?? "").trim();
  if (!batteryType) {
    const err = new Error("Battery Type is required.");
    err.status = 400;
    throw err;
  }
}

/**
 * Insert one new inventory row (POST /inventory, category POST). Never merges into existing rows.
 */
export async function createCategoryInventoryRow(categoryKey, legacyRow, branchIdStr) {
  const Model = MODEL_BY_KEY[categoryKey];
  if (!Model || !branchIdStr) throw new Error("Invalid category or branchId");

  const bid = new mongoose.Types.ObjectId(branchIdStr);
  const clean = normalizeIncomingRow(categoryKey, legacyRow);

  if (categoryKey === CATEGORY.HOME_INV) {
    assertHomeInvCreateIdentity(clean, legacyRow);
  }
  if (categoryKey === CATEGORY.LITHIUM_ION) {
    assertLithiumIonCreateIdentity(clean, legacyRow);
  }

  let docShape = rowToDoc(categoryKey, clean, bid);

  const maxLegacy = await getBranchWideMaxLegacyId(branchIdStr);
  docShape.legacyId = maxLegacy + 1;
  docShape.branchId = bid;

  console.log(
    "[inventory/createCategoryRow]",
    categoryKey,
    COLLECTION_BY_KEY[categoryKey],
    {
      brand: docShape.brand,
      model: docShape.modelNumber ?? docShape.batteryModel ?? docShape.model,
      qty: docShape.quantity,
    },
  );

  const created = await Model.create(docShape);
  console.log("[inventory/createCategoryRow] saved", created._id?.toString());

  return enrichProductProfit(mapLeanToLegacyProduct(categoryKey, created.toObject()));
}

/**
 * Excel / bulk merge for one category: insertMany new keys, merge quantities into existing.
 * @param {{ quantityMode?: 'add' | 'set' }} opts — `add` accumulates qty (Excel dup rows); `set` replaces qty (sync / edit).
 */
export async function mergeCategoryRowsFromParsed(categoryKey, incoming, branchId, { quantityMode = "add" } = {}) {
  const setQuantity = quantityMode === "set";
  const Model = MODEL_BY_KEY[categoryKey];
  if (!Model || !branchId) throw new Error("Invalid category or branchId");
  const bid = new mongoose.Types.ObjectId(branchId);
  const filter = strictBranch(branchId);
  const existing = await Model.find(filter).lean();
  let maxLegacy = Math.max(
    await getBranchWideMaxLegacyId(branchId),
    existing.reduce((m, p) => Math.max(m, Number(p.legacyId) || 0), 0),
  );

  const byKey = new Map();
  for (const p of existing) {
    const temp = legacyRowForMergeKey(categoryKey, p);
    const mk = matchKeyForCategory(categoryKey, temp, p);
    if (!mk) continue;
    byKey.set(mk, p);
  }

  const pending = new Map();
  const aggUpdates = new Map();
  let skippedNoKey = 0;

  for (const row of incoming) {
    const clean = normalizeIncomingRow(categoryKey, row);
    const docShape = rowToDoc(categoryKey, clean, bid);
    const mk = rowMergeKeyForIncoming(categoryKey, clean, docShape);
    if (categoryKey === CATEGORY.INV_COMBO) {
      const ok =
        String(clean.comboId ?? "").trim() ||
        String(clean.inverterModel ?? "").trim() ||
        String(clean.batteryModel ?? clean.model ?? "").trim();
      if (!ok) {
        skippedNoKey++;
        continue;
      }
    } else if (!mk) {
      skippedNoKey++;
      continue;
    }

    const ex = byKey.get(mk);
    if (ex?._id) {
      let acc = aggUpdates.get(String(ex._id));
      const rowQty = num(clean.quantity);
      if (!acc) {
        acc = { qty: rowQty, docShape, setQuantity };
        aggUpdates.set(String(ex._id), acc);
      } else {
        acc.qty = setQuantity ? rowQty : acc.qty + rowQty;
        acc.docShape = docShape;
        acc.setQuantity = setQuantity;
      }
    } else if (pending.has(mk)) {
      const prev = pending.get(mk);
      prev.quantity = setQuantity ? num(clean.quantity) : num(prev.quantity) + num(clean.quantity);
    } else {
      pending.set(mk, { ...docShape, legacyId: ++maxLegacy });
    }
  }

  const toInsert = [...pending.values()];
  let insertManyCount = 0;
  if (toInsert.length) {
    await Model.insertMany(toInsert, { ordered: false });
    insertManyCount = toInsert.length;
    console.log(`[category:${categoryKey}] insertMany →`, insertManyCount, COLLECTION_BY_KEY[categoryKey]);
  } else if (incoming.length && !aggUpdates.size && skippedNoKey >= incoming.length) {
    console.warn(
      `[category:${categoryKey}] merge skipped all ${incoming.length} row(s) — no product identity (model / battery model).`,
    );
  }
  if (skippedNoKey > 0) {
    console.warn(`[category:${categoryKey}] skipped ${skippedNoKey} row(s) with no merge key`);
  }

  console.log(
    `[category:${categoryKey}] merge summary incoming=${incoming.length} insert=${insertManyCount} update=${aggUpdates.size} skipped=${skippedNoKey}`,
  );

  for (const [id, { qty, docShape, setQuantity: replaceQty }] of aggUpdates) {
    try {
      const existing = await Model.findOne({ _id: id, branchId: bid }).lean();
      if (!existing) {
        console.warn(`[category:${categoryKey}] skip update — missing _id ${id}`);
        continue;
      }
      const nextQty = replaceQty ? qty : num(existing.quantity) + qty;
      const { _id: _dropId, ...shapeWithoutId } = docShape;
      await Model.updateOne(
        { _id: id, branchId: bid },
        { $set: { ...shapeWithoutId, quantity: nextQty, branchId: bid } },
      );
    } catch (e) {
      console.warn(`[category:${categoryKey}] update failed for _id ${id}:`, e.message);
    }
  }

  const rows = await listCategory(categoryKey, { branchId, isSuperAdmin: false });
  return {
    rows,
    inserted: insertManyCount,
    updated: aggUpdates.size,
    skipped: skippedNoKey,
  };
}

export async function deleteAllForBranchInCategories(branchId) {
  if (!branchId) return;
  const bid = new mongoose.Types.ObjectId(branchId);
  await Promise.all([
    CarBattery.deleteMany({ branchId: bid }),
    BikeBattery.deleteMany({ branchId: bid }),
    InverterSku.deleteMany({ branchId: bid }),
    InverterInventoryCatalog.deleteMany({ branchId: bid }),
    InvBatteryCombo.deleteMany({ branchId: bid }),
    HomeInvBattery.deleteMany({ branchId: bid }),
    HomeBackupBatteryInventory.deleteMany({ branchId: bid }),
    TrolleyInventory.deleteMany({ branchId: bid }),
    LithiumIonBattery.deleteMany({ branchId: bid }),
  ]);
}

/**
 * Recreate all category collections from a legacy-shaped inventory[] (sync payload).
 */
export async function replaceAllCategoriesFromLegacyRows(rows, branchId) {
  if (!branchId || !rows?.length) return;

  const buckets = {
    [CATEGORY.CAR]: [],
    [CATEGORY.BIKE]: [],
    [CATEGORY.INVERTER]: [],
    [CATEGORY.INV_COMBO]: [],
    [CATEGORY.HOME_INV]: [],
    [CATEGORY.TROLLEY]: [],
    [CATEGORY.LITHIUM_ION]: [],
  };
  for (const row of rows) {
    const cat = inferCategoryKeyFromLegacyRow(row);
    buckets[cat].push(row);
  }

  const bid = new mongoose.Types.ObjectId(branchId);
  for (const [cat, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const Model = MODEL_BY_KEY[cat];
    if (!Model) continue;
    // Merge upsert only — do not deleteMany first (that wiped Excel uploads when client sync had fewer rows).
    await mergeCategoryRowsFromParsed(cat, list, branchId, { quantityMode: "set" });
  }
}

export async function findInventoryDocById(id, { branchId = null, isSuperAdmin = false } = {}) {
  const q = branchQuery(branchId, isSuperAdmin);
  const tryOid = mongoose.Types.ObjectId.isValid(String(id)) && String(id).length === 24;
  const numId = Number(id);

  for (const Model of ALL_INVENTORY_MODELS) {
    let lean = null;
    if (tryOid) lean = await Model.findOne({ _id: id, ...q }).lean();
    if (!lean && !Number.isNaN(numId)) lean = await Model.findOne({ ...q, legacyId: numId }).lean();
    if (lean) {
      const categoryKey = MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR;
      return { categoryKey, Model, lean };
    }
  }
  return null;
}

export async function deleteCategoryInventoryItem(id, tenant) {
  const found = await findInventoryDocById(id, tenant);
  if (!found) return false;
  const res = await found.Model.deleteOne({ _id: found.lean._id });
  return res.deletedCount === 1;
}

export async function deductStockAcrossCategories(items, { branchId = null, isSuperAdmin = false } = {}) {
  const q = branchQuery(branchId, isSuperAdmin);
  const flat = [];
  for (const Model of ALL_INVENTORY_MODELS) {
    const docs = await Model.find(q).lean();
    for (const doc of docs) flat.push({ Model, doc });
  }
  for (const { Model, doc } of flat) {
    const sold = items.find(
      (item) =>
        String(item.productId ?? item.inventoryId ?? item.id) === String(doc._id) ||
        String(item.productId ?? item.inventoryId ?? item.id) === String(doc.legacyId),
    );
    if (!sold) continue;
    const qty = Math.max(0, Number(doc.quantity ?? 0) - Number(sold.quantity ?? sold.qty ?? 0));
    await Model.updateOne({ _id: doc._id }, { $set: { quantity: qty } });
  }
}

/** Move stock from one branch to another (called only after transfer approval). */
export async function transferStockBetweenBranches({ inventoryDocId, quantity, fromBranchId, toBranchId }) {
  const qty = Math.max(1, Number(quantity) || 0);
  const fromBid = new mongoose.Types.ObjectId(fromBranchId);
  const toBid = new mongoose.Types.ObjectId(toBranchId);
  if (String(fromBid) === String(toBid)) throw new Error("Source and destination branch must differ");

  let found = null;
  for (const Model of ALL_INVENTORY_MODELS) {
    const lean = await Model.findOne({ _id: inventoryDocId, branchId: fromBid }).lean();
    if (lean) {
      found = { Model, lean, categoryKey: MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR };
      break;
    }
  }
  if (!found) {
    const err = new Error("Source product not found at the from branch");
    err.status = 404;
    throw err;
  }
  const available = Number(found.lean.quantity ?? 0);
  if (available < qty) {
    const err = new Error(`Insufficient stock at source branch (available ${available}, requested ${qty})`);
    err.status = 400;
    throw err;
  }

  await found.Model.updateOne({ _id: found.lean._id }, { $set: { quantity: available - qty } });

  if (found.Model === HomeBackupBatteryInventory) {
    const filter = {
      branchId: toBid,
      brand: found.lean.brand,
      model: found.lean.model,
      batteryAH: found.lean.batteryAH,
    };
    const dest = await HomeBackupBatteryInventory.findOne(filter);
    if (dest) {
      dest.quantity = Number(dest.quantity ?? 0) + qty;
      await dest.save();
    } else {
      const maxLegacy = await getBranchWideMaxLegacyId(toBranchId);
      await HomeBackupBatteryInventory.create({
        ...found.lean,
        _id: undefined,
        branchId: toBid,
        quantity: qty,
        legacyId: maxLegacy + 1,
      });
    }
  } else {
    const legacy = mapLeanToLegacyProduct(found.categoryKey, found.lean);
    legacy.quantity = qty;
    await mergeCategoryRowsFromParsed(found.categoryKey, [legacy], toBranchId);
  }

  return {
    ok: true,
    quantity: qty,
    categoryKey: found.categoryKey,
    productId: String(found.lean._id),
  };
}

/**
 * Increment stock for purchase GRN lines — only adds qty to existing Mongo rows by _id.
 * Never deletes, replaces, or bulk-merges inventory (safe for existing uploaded stock).
 */
export async function incrementStockFromPurchaseItems(items, { branchId = null, isSuperAdmin = false } = {}) {
  const results = [];
  for (const line of items || []) {
    const inventoryId = line.inventoryId || line.productId || line._id;
    if (!inventoryId) {
      results.push({ ok: false, reason: "missing inventoryId", line });
      continue;
    }
    const addQty = Math.max(0, Number(line.qty ?? line.quantity ?? 0));
    if (!addQty) {
      results.push({ ok: false, reason: "zero qty", inventoryId: String(inventoryId) });
      continue;
    }
    const found = await findInventoryDocById(inventoryId, { branchId, isSuperAdmin });
    if (!found) {
      results.push({ ok: false, reason: "not found", inventoryId: String(inventoryId) });
      continue;
    }
    const current = Number(found.lean.quantity ?? 0);
    const next = current + addQty;
    await found.Model.updateOne({ _id: found.lean._id }, { $set: { quantity: next } });
    results.push({
      ok: true,
      inventoryId: String(found.lean._id),
      categoryKey: found.categoryKey,
      previousQty: current,
      addedQty: addQty,
      newQty: next,
    });
  }
  return results;
}
