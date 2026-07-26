/**
 * Type-based multi-branch inventory search — each category uses its own schema filters.
 */
import CarBattery from "../models/inventory/CarBattery.js";
import BikeBattery from "../models/inventory/BikeBattery.js";
import InverterSku from "../models/inventory/InverterSku.js";
import InverterInventoryCatalog from "../models/inventory/InverterInventoryCatalog.js";
import InvBatteryCombo from "../models/inventory/InvBatteryCombo.js";
import HomeInvBattery from "../models/inventory/HomeInvBattery.js";
import HomeBackupBatteryInventory from "../models/inventory/HomeBackupBatteryInventory.js";
import TrolleyInventory from "../models/inventory/TrolleyInventory.js";
import {
  carToLegacy,
  bikeToLegacy,
  inverterToLegacy,
  inverterCatalogToLegacy,
  invComboToLegacy,
  homeInvToLegacy,
  homeBackupBatteryCatalogToLegacy,
  trolleyToLegacy,
} from "./categoryInventoryService.js";
import { findVehicleCompatibilityRows } from "./vehicleBatteryCompatibilityService.js";
import { listActiveBranches, branchMeta as sharedBranchMeta } from "./multiBranchInventoryService.js";

export { listActiveBranches };

const LOW_STOCK_THRESHOLD = 2;

function branchLabel(b) {
  return b?.branchName || b?.name || b?.code || "Branch";
}

function normStr(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function normNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,₹]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function ciIncludes(hay, needle) {
  const h = normStr(hay);
  const n = normStr(needle);
  if (!n) return true;
  return h.includes(n);
}

function ciEqual(a, b) {
  const x = normStr(a);
  const y = normStr(b);
  if (!y) return true;
  return x === y;
}

function batteryTypeMatches(rowType, selected) {
  const sel = normStr(selected);
  if (!sel) return true;
  const rt = normStr(rowType);
  if (!rt) return false;
  return rt === sel || rt.includes(sel) || sel.includes(rt);
}

function productLabelFromLegacy(legacy) {
  const brand = legacy?.brand ? `${legacy.brand} ` : "";
  const model = legacy.modelName || legacy.model || legacy.batteryModel || legacy.inverterModel || "Product";
  return `${brand}${model}`.trim();
}

function matchesModelHints(modelNumber, hints) {
  if (!hints?.length) return true;
  const mn = normStr(modelNumber).replace(/\s+/g, "");
  return hints.some((hint) => {
    const h = normStr(hint).replace(/\s+/g, "");
    if (!h) return false;
    return mn === h || mn.includes(h) || h.includes(mn);
  });
}

function collectVehicleModelHints(vehicleType, brand, model, fuelType = "") {
  return findVehicleCompatibilityRows(vehicleType, brand, model, fuelType).then((rows) =>
    [
      ...new Set(
        rows
          .flatMap((r) => (Array.isArray(r.compatibleBatteryModels) ? r.compatibleBatteryModels : []))
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
  );
}

function buildAvailabilityResponse({ inventoryType, filters, currentBranchId, branches, groupedRows }) {
  const branchMap = new Map(branches.map((b) => [String(b._id), b]));
  const currentBranchDoc = branches.find((b) => String(b._id) === String(currentBranchId));

  const results = groupedRows.map((row) => {
    const currentStock = row.stocks.find((s) => s.branchId === String(currentBranchId));
    const currentQty = currentStock?.quantity ?? 0;
    const currentBranch = {
      ...(sharedBranchMeta(currentBranchDoc) || {}),
      available: currentQty > 0,
      quantity: currentQty,
      inventoryDocId: currentStock?.inventoryDocId ?? null,
    };
    const otherBranches = row.stocks
      .filter((s) => s.branchId !== String(currentBranchId) && s.quantity > 0)
      .map((s) => ({
        branchId: s.branchId,
        branch: s.branch,
        branchName: s.branchName,
        quantity: s.quantity,
        inventoryDocId: s.inventoryDocId,
        available: true,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    return {
      inventoryType,
      brand: row.brand,
      model: row.model,
      productType: row.productType,
      ah: row.ah ?? null,
      va: row.va ?? null,
      batteryType: row.batteryType ?? "",
      currentBranch,
      otherBranches,
      canRequestTransfer: !currentBranch.available && otherBranches.length > 0,
      transferSource: otherBranches[0] ?? null,
    };
  });

  results.sort((a, b) => {
    if (a.canRequestTransfer !== b.canRequestTransfer) return a.canRequestTransfer ? -1 : 1;
    return a.model.localeCompare(b.model);
  });

  const primary = results[0] ?? null;
  return {
    inventoryType,
    query: filters,
    results,
    currentBranch: primary?.currentBranch ?? {
      ...(sharedBranchMeta(currentBranchDoc) || {}),
      available: false,
      quantity: 0,
    },
    otherBranches: primary?.otherBranches ?? [],
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };
}

function pushStock(grouped, key, meta, doc, branches) {
  if (!grouped.has(key)) grouped.set(key, { ...meta, stocks: [] });
  const bid = String(doc.branchId);
  const branch = branches.find((b) => String(b._id) === bid);
  grouped.get(key).stocks.push({
    branchId: bid,
    branch: branch?.branchId || branch?.code?.toLowerCase() || "",
    branchName: branchLabel(branch),
    quantity: Number(doc.quantity ?? 0),
    inventoryDocId: String(doc._id),
    available: Number(doc.quantity ?? 0) > 0,
  });
}

function emptyResponse(inventoryType, filters, message) {
  return { inventoryType, query: filters, results: [], message, currentBranch: null, otherBranches: [] };
}

function hasAnyFilter(values) {
  return values.some((v) => String(v ?? "").trim() !== "");
}

/** Home backup + home inverter battery collections. */
export async function searchBatteryInventory(filters = {}) {
  const inventoryType = "battery";
  const { currentBranchId, brand, capacityAh, batteryType, modelNumber } = filters;
  if (!hasAnyFilter([brand, capacityAh, batteryType, modelNumber])) {
    return emptyResponse(inventoryType, filters, "Enter brand, Ah, battery type, or model number.");
  }

  const ahN = normNum(capacityAh);
  const branches = await listActiveBranches();
  const grouped = new Map();

  const catalogDocs = await HomeBackupBatteryInventory.find({ branchId: { $ne: null } }).lean();
  for (const doc of catalogDocs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    if (ahN != null && normNum(doc.batteryAH) !== ahN) continue;
    if (!batteryTypeMatches(doc.batteryType, batteryType)) continue;
    if (modelNumber && !ciIncludes(doc.model, modelNumber)) continue;

    const legacy = homeBackupBatteryCatalogToLegacy(doc);
    const key = `bat|${normStr(doc.brand)}|${normStr(doc.model)}|${doc.batteryAH}|${normStr(doc.batteryType)}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Home Inverter Battery",
        ah: legacy.ah ?? legacy.capacityAh,
        batteryType: legacy.batteryType ?? "",
      },
      doc,
      branches,
    );
  }

  const homeDocs = await HomeInvBattery.find({ branchId: { $ne: null } }).lean();
  for (const doc of homeDocs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    const docAh = normNum(doc.capacityAH);
    if (ahN != null && docAh !== ahN) continue;
    if (!batteryTypeMatches(doc.batteryType, batteryType)) continue;
    const model = doc.modelNumber || doc.batteryModel || "";
    if (modelNumber && !ciIncludes(model, modelNumber)) continue;

    const legacy = homeInvToLegacy(doc);
    const key = `home|${normStr(doc.brand)}|${normStr(model)}|${doc.capacityAH}|${normStr(doc.batteryType)}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Home Inverter Battery",
        ah: legacy.ah ?? legacy.capacityAh,
        batteryType: legacy.batteryType ?? "",
      },
      doc,
      branches,
    );
  }

  return buildAvailabilityResponse({
    inventoryType,
    filters,
    currentBranchId,
    branches,
    groupedRows: [...grouped.values()],
  });
}

/** Inverter catalog + legacy inverter SKUs. */
export async function searchInverterInventory(filters = {}) {
  const inventoryType = "inverter";
  const { currentBranchId, brand, inverterVA, modelNumber, technology } = filters;
  if (!hasAnyFilter([brand, inverterVA, modelNumber, technology])) {
    return emptyResponse(inventoryType, filters, "Enter brand, VA, model number, or technology.");
  }

  const vaN = normNum(inverterVA);
  const branches = await listActiveBranches();
  const grouped = new Map();

  const catalogDocs = await InverterInventoryCatalog.find({ branchId: { $ne: null } }).lean();
  for (const doc of catalogDocs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    if (vaN != null && normNum(doc.inverterVA) !== vaN) continue;
    if (modelNumber && !ciIncludes(doc.model, modelNumber)) continue;

    const legacy = inverterCatalogToLegacy(doc);
    const key = `inv|${normStr(doc.brand)}|${normStr(doc.model)}|${doc.inverterVA}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Inverter",
        va: legacy.inverterVA,
        batteryType: "",
      },
      doc,
      branches,
    );
  }

  const skuDocs = await InverterSku.find({ branchId: { $ne: null } }).lean();
  for (const doc of skuDocs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    if (vaN != null && normNum(doc.inverterVA) !== vaN) continue;
    if (modelNumber && !ciIncludes(doc.modelNumber, modelNumber)) continue;
    if (technology && !ciIncludes(doc.technology, technology)) continue;

    const legacy = inverterToLegacy(doc);
    const key = `sku|${normStr(doc.brand)}|${normStr(doc.modelNumber)}|${doc.inverterVA}|${normStr(doc.technology)}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Inverter",
        va: legacy.inverterVA,
        batteryType: legacy.batteryType ?? "",
      },
      doc,
      branches,
    );
  }

  return buildAvailabilityResponse({
    inventoryType,
    filters,
    currentBranchId,
    branches,
    groupedRows: [...grouped.values()],
  });
}

/** Car batteries — optional vehicle compatibility narrowing. */
export async function searchCarBatteryInventory(filters = {}) {
  const inventoryType = "car-battery";
  const { currentBranchId, vehicleBrand, vehicleModel, fuelType, capacity, modelNumber, brand } = filters;

  const vehicleSearch = Boolean(String(vehicleBrand ?? "").trim() && String(vehicleModel ?? "").trim());
  if (!vehicleSearch && !hasAnyFilter([capacity, modelNumber, brand])) {
    return emptyResponse(
      inventoryType,
      filters,
      "Enter car brand + model (and fuel), or search by battery brand / model / Ah.",
    );
  }

  let modelHints = [];
  if (vehicleSearch) {
    if (!String(fuelType ?? "").trim()) {
      return emptyResponse(inventoryType, filters, "Fuel type is required for car battery vehicle search.");
    }
    modelHints = await collectVehicleModelHints("four-wheeler", vehicleBrand, vehicleModel, fuelType);
    if (!modelHints.length) {
      return emptyResponse(
        inventoryType,
        filters,
        `No compatible batteries mapped for ${vehicleBrand} ${vehicleModel} (${fuelType}).`,
      );
    }
  }

  const ahN = normNum(capacity);
  const branches = await listActiveBranches();
  const grouped = new Map();
  const docs = await CarBattery.find({ branchId: { $ne: null } }).lean();

  for (const doc of docs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    if (ahN != null && normNum(doc.capacity) !== ahN) continue;
    if (modelNumber && !ciIncludes(doc.modelNumber, modelNumber)) continue;
    if (vehicleSearch && !matchesModelHints(doc.modelNumber, modelHints)) continue;

    const legacy = carToLegacy(doc);
    const key = `car|${normStr(doc.brand)}|${normStr(doc.modelNumber)}|${doc.capacity}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: legacy.type ?? "Car",
        ah: legacy.ah ?? legacy.capacityAh,
        batteryType: legacy.batteryType ?? "",
      },
      doc,
      branches,
    );
  }

  if (!grouped.size) {
    return emptyResponse(inventoryType, filters, "No matching car batteries found at any branch.");
  }

  return buildAvailabilityResponse({
    inventoryType,
    filters,
    currentBranchId,
    branches,
    groupedRows: [...grouped.values()],
  });
}

/** Bike batteries — optional vehicle compatibility narrowing. */
export async function searchBikeBatteryInventory(filters = {}) {
  const inventoryType = "bike-battery";
  const { currentBranchId, bikeBrand, bikeModel, capacity, modelNumber, brand } = filters;

  const vehicleSearch = Boolean(String(bikeBrand ?? "").trim() && String(bikeModel ?? "").trim());
  if (!vehicleSearch && !hasAnyFilter([capacity, modelNumber, brand])) {
    return emptyResponse(
      inventoryType,
      filters,
      "Enter bike brand + model, or search by battery brand / model / Ah.",
    );
  }

  let modelHints = [];
  if (vehicleSearch) {
    modelHints = await collectVehicleModelHints("two-wheeler", bikeBrand, bikeModel);
    if (!modelHints.length) {
      return emptyResponse(
        inventoryType,
        filters,
        `No compatible batteries mapped for ${bikeBrand} ${bikeModel}.`,
      );
    }
  }

  const ahN = normNum(capacity);
  const branches = await listActiveBranches();
  const grouped = new Map();
  const docs = await BikeBattery.find({ branchId: { $ne: null } }).lean();

  for (const doc of docs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    if (ahN != null && normNum(doc.capacity) !== ahN) continue;
    if (modelNumber && !ciIncludes(doc.modelNumber, modelNumber)) continue;
    if (vehicleSearch && !matchesModelHints(doc.modelNumber, modelHints)) continue;

    const legacy = bikeToLegacy(doc);
    const key = `bike|${normStr(doc.brand)}|${normStr(doc.modelNumber)}|${doc.capacity}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Bike",
        ah: legacy.ah ?? legacy.capacityAh,
        batteryType: "",
      },
      doc,
      branches,
    );
  }

  if (!grouped.size) {
    return emptyResponse(inventoryType, filters, "No matching bike batteries found at any branch.");
  }

  return buildAvailabilityResponse({
    inventoryType,
    filters,
    currentBranchId,
    branches,
    groupedRows: [...grouped.values()],
  });
}

/** Inverter + battery combo SKUs. */
export async function searchComboInventory(filters = {}) {
  const inventoryType = "combo";
  const { currentBranchId, inverterVA, batteryAH, batteryType, brandPreference, brandPairing } = filters;
  if (!hasAnyFilter([inverterVA, batteryAH, batteryType, brandPreference])) {
    return emptyResponse(inventoryType, filters, "Enter inverter VA, battery Ah, type, or brand preference.");
  }

  const vaN = normNum(inverterVA);
  const ahN = normNum(batteryAH);
  const sameBrandOnly = normStr(brandPairing) === "same" || normStr(brandPairing) === "samebrand";

  const branches = await listActiveBranches();
  const grouped = new Map();
  const docs = await InvBatteryCombo.find({ branchId: { $ne: null } }).lean();

  for (const doc of docs) {
    if (vaN != null && normNum(doc.inverterVA) !== vaN) continue;
    if (ahN != null && normNum(doc.capacityAh) !== ahN) continue;
    if (!batteryTypeMatches(doc.batteryType, batteryType)) continue;
    if (brandPreference && !ciIncludes(doc.brand, brandPreference)) continue;
    if (sameBrandOnly) {
      const invBrand = normStr(doc.brand);
      const batBrand = normStr(doc.batteryModel).split(/\s+/)[0];
      if (invBrand && batBrand && invBrand !== batBrand && !normStr(doc.batteryModel).includes(invBrand)) {
        continue;
      }
    }

    const legacy = invComboToLegacy(doc);
    const key = `combo|${normStr(doc.brand)}|${doc.inverterVA}|${doc.capacityAh}|${normStr(doc.batteryType)}|${normStr(doc.inverterModel)}|${normStr(doc.batteryModel)}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Inverter+Battery",
        ah: legacy.ah ?? legacy.capacityAh,
        va: legacy.inverterVA,
        batteryType: legacy.batteryType ?? "",
      },
      doc,
      branches,
    );
  }

  if (!grouped.size) {
    return emptyResponse(inventoryType, filters, "No matching combo SKUs found at any branch.");
  }

  return buildAvailabilityResponse({
    inventoryType,
    filters,
    currentBranchId,
    branches,
    groupedRows: [...grouped.values()],
  });
}

/** Luminous trolley accessory inventory. */
export async function searchTrolleyInventory(filters = {}) {
  const inventoryType = "trolley";
  const { currentBranchId, brand, modelNumber, compatibleVA } = filters;
  if (!hasAnyFilter([brand, modelNumber, compatibleVA])) {
    return emptyResponse(inventoryType, filters, "Enter brand, trolley model, or compatible VA.");
  }

  const vaN = normNum(compatibleVA);
  const branches = await listActiveBranches();
  const grouped = new Map();
  const docs = await TrolleyInventory.find({ branchId: { $ne: null } }).lean();

  for (const doc of docs) {
    if (brand && !ciIncludes(doc.brand, brand)) continue;
    if (modelNumber && !ciIncludes(doc.modelNumber, modelNumber)) continue;
    if (vaN != null && normNum(doc.compatibleVA) !== vaN) continue;

    const legacy = trolleyToLegacy(doc);
    const key = `trolley|${normStr(doc.brand)}|${normStr(doc.modelNumber)}|${doc.compatibleVA}`;
    pushStock(
      grouped,
      key,
      {
        brand: legacy.brand ?? "",
        model: productLabelFromLegacy(legacy),
        productType: "Trolley",
        va: legacy.compatibleVA ?? legacy.inverterVA,
        batteryType: "",
      },
      doc,
      branches,
    );
  }

  if (!grouped.size) {
    return emptyResponse(inventoryType, filters, "No matching trolley SKUs found at any branch.");
  }

  return buildAvailabilityResponse({
    inventoryType,
    filters,
    currentBranchId,
    branches,
    groupedRows: [...grouped.values()],
  });
}

export const SEARCH_HANDLERS = {
  battery: searchBatteryInventory,
  inverter: searchInverterInventory,
  "car-battery": searchCarBatteryInventory,
  "bike-battery": searchBikeBatteryInventory,
  combo: searchComboInventory,
  trolley: searchTrolleyInventory,
};

export async function searchInventoryByType(type, filters = {}) {
  const fn = SEARCH_HANDLERS[type];
  if (!fn) throw Object.assign(new Error(`Unknown inventory search type: ${type}`), { status: 400 });
  return fn(filters);
}
