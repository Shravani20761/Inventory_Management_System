import mongoose from "mongoose";
import Branch from "../models/Branch.js";
import HomeBackupBatteryInventory from "../models/inventory/HomeBackupBatteryInventory.js";
import {
  ALL_INVENTORY_MODELS,
  CATEGORY,
  MODEL_TO_CATEGORY,
  mapLeanToLegacyProduct,
  homeBackupBatteryCatalogToLegacy,
} from "./categoryInventoryService.js";

const LOW_STOCK_THRESHOLD = 2;

function branchLabel(b) {
  return b?.branchName || b?.name || b?.code || "Branch";
}

function productLabel(legacy) {
  const brand = legacy?.brand ? `${legacy.brand} ` : "";
  const model = legacy.modelName || legacy.model || legacy.batteryModel || legacy.inverterModel || "Product";
  return `${brand}${model}`.trim();
}

function productSearchKey(legacy) {
  const brand = String(legacy?.brand ?? "").toLowerCase();
  const model = String(legacy.modelName || legacy.model || legacy.batteryModel || "").toLowerCase();
  const ah = String(legacy.ah ?? legacy.capacityAh ?? legacy.batteryAH ?? "");
  const va = String(legacy.inverterVA ?? legacy.va ?? "");
  const type = String(legacy.batteryType ?? legacy.type ?? "").toLowerCase();
  const cat = String(legacy._inventoryCategory ?? legacy.type ?? "").toLowerCase();
  return `${cat}|${brand}|${model}|${ah}|${va}|${type}`;
}

function matchesSearch(legacy, { q = "", brand = "", model = "", ah = "", va = "", batteryType = "" } = {}) {
  const hay = [
    legacy.brand,
    legacy.modelName,
    legacy.model,
    legacy.batteryModel,
    legacy.inverterModel,
    legacy.batteryType,
    legacy.type,
    legacy.ah,
    legacy.capacityAh,
    legacy.batteryAH,
    legacy.inverterVA,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tokens = String(q || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length && !tokens.every((t) => hay.includes(t))) return false;
  if (brand && !hay.includes(String(brand).toLowerCase())) return false;
  if (model && !hay.includes(String(model).toLowerCase())) return false;
  if (batteryType && !String(legacy.batteryType ?? "").toLowerCase().includes(String(batteryType).toLowerCase())) return false;
  if (ah && !hay.includes(String(ah))) return false;
  if (va && !hay.includes(String(va))) return false;
  return true;
}

export async function listActiveBranches() {
  return Branch.find({ active: { $ne: false } }).sort({ name: 1 }).lean();
}

export function branchMeta(branch) {
  if (!branch) return null;
  return {
    branchId: String(branch._id),
    branch: branch.branchId || branch.code?.toLowerCase() || "",
    branchName: branchLabel(branch),
    branchCode: branch.branchId || branch.code || "",
  };
}

function hasSearchCriteria(filters = {}) {
  return ["q", "model", "brand", "ah", "va", "batteryType"].some((k) => String(filters[k] ?? "").trim());
}

/**
 * Real-time global inventory search — only queries when user provides search terms.
 * Does NOT replicate or preload all branch inventory.
 */
export async function searchGlobalInventory(filters = {}) {
  const currentBranchId = filters.currentBranchId ? String(filters.currentBranchId) : null;
  if (!hasSearchCriteria(filters)) {
    return {
      query: filters,
      results: [],
      message: "Enter model, brand, Ah, VA, or battery type to search across branches.",
    };
  }

  const branches = await listActiveBranches();
  const branchMap = new Map(branches.map((b) => [String(b._id), b]));
  const currentBranchDoc = branches.find((b) => String(b._id) === currentBranchId);
  const grouped = new Map();

  for (const Model of ALL_INVENTORY_MODELS) {
    const docs = await Model.find({ branchId: { $ne: null } }).lean();
    const categoryKey = MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR;
    for (const doc of docs) {
      const legacy =
        Model === HomeBackupBatteryInventory
          ? homeBackupBatteryCatalogToLegacy(doc)
          : mapLeanToLegacyProduct(categoryKey, doc);
      if (!matchesSearch(legacy, filters)) continue;

      const key = productSearchKey(legacy);
      if (!grouped.has(key)) {
        grouped.set(key, {
          productKey: key,
          brand: legacy.brand ?? "",
          model: productLabel(legacy),
          productType: legacy.type ?? categoryKey,
          ah: legacy.ah ?? legacy.capacityAh ?? legacy.batteryAH ?? null,
          va: legacy.inverterVA ?? legacy.va ?? null,
          batteryType: legacy.batteryType ?? "",
          stocks: [],
        });
      }
      const bid = String(doc.branchId);
      const branch = branchMap.get(bid);
      grouped.get(key).stocks.push({
        branchId: bid,
        branch: branch?.branchId || branch?.code?.toLowerCase() || "",
        branchName: branchLabel(branch),
        quantity: Number(doc.quantity ?? 0),
        inventoryDocId: String(doc._id),
        available: Number(doc.quantity ?? 0) > 0,
      });
    }
  }

  const results = [...grouped.values()].map((row) => {
    const currentStock = row.stocks.find((s) => s.branchId === currentBranchId);
    const currentQty = currentStock?.quantity ?? 0;
    const currentBranch = {
      ...branchMeta(currentBranchDoc),
      available: currentQty > 0,
      quantity: currentQty,
      inventoryDocId: currentStock?.inventoryDocId ?? null,
    };
    const otherBranches = row.stocks
      .filter((s) => s.branchId !== currentBranchId && s.quantity > 0)
      .map((s) => {
        const b = branchMap.get(s.branchId);
        return {
          branchId: s.branchId,
          branch: s.branch,
          branchName: s.branchName,
          quantity: s.quantity,
          inventoryDocId: s.inventoryDocId,
          available: true,
        };
      })
      .sort((a, b) => b.quantity - a.quantity);

    return {
      brand: row.brand,
      model: row.model,
      productType: row.productType,
      ah: row.ah,
      va: row.va,
      batteryType: row.batteryType,
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
    query: filters,
    results,
    currentBranch: primary?.currentBranch ?? { ...branchMeta(currentBranchDoc), available: false, quantity: 0 },
    otherBranches: primary?.otherBranches ?? [],
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };
}

/** @deprecated Use searchGlobalInventory — loads full matrix (avoid on dashboards). */
export async function getMultiBranchStockMatrix(filters = {}) {
  const branches = await listActiveBranches();
  const branchMap = new Map(branches.map((b) => [String(b._id), b]));
  const currentBranchId = filters.currentBranchId ? String(filters.currentBranchId) : null;
  const grouped = new Map();

  for (const Model of ALL_INVENTORY_MODELS) {
    const docs = await Model.find({ branchId: { $ne: null } }).lean();
    const categoryKey = MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR;
    for (const doc of docs) {
      const legacy =
        Model === HomeBackupBatteryInventory
          ? homeBackupBatteryCatalogToLegacy(doc)
          : mapLeanToLegacyProduct(categoryKey, doc);
      const key = productSearchKey(legacy);
      if (!key || key === "|||") continue;
      if (!matchesSearch(legacy, filters)) continue;

      if (!grouped.has(key)) {
        grouped.set(key, {
          productKey: key,
          brand: legacy.brand ?? "",
          model: productLabel(legacy),
          productType: legacy.type ?? categoryKey,
          categoryKey,
          ah: legacy.ah ?? legacy.capacityAh ?? legacy.batteryAH ?? null,
          va: legacy.inverterVA ?? legacy.va ?? null,
          batteryType: legacy.batteryType ?? "",
          stocks: [],
        });
      }
      const bid = String(doc.branchId);
      const branch = branchMap.get(bid);
      grouped.get(key).stocks.push({
        branchId: bid,
        branchName: branchLabel(branch),
        branchCode: branch?.branchId || branch?.code || "",
        quantity: Number(doc.quantity ?? 0),
        inventoryDocId: String(doc._id),
        lowStock: Number(doc.quantity ?? 0) < LOW_STOCK_THRESHOLD,
      });
    }
  }

  const rows = [...grouped.values()].map((row) => {
    const current = row.stocks.find((s) => s.branchId === currentBranchId);
    const currentBranchQty = current?.quantity ?? 0;
    const otherBranches = row.stocks
      .filter((s) => s.branchId !== currentBranchId && s.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);
    return {
      ...row,
      currentBranchQty,
      lowStock: currentBranchQty < LOW_STOCK_THRESHOLD,
      otherBranches,
      availableElsewhere: otherBranches.length > 0 && currentBranchQty <= 0,
      availabilityHint:
        currentBranchQty <= 0 && otherBranches.length
          ? `Available at ${otherBranches[0].branchName} (${otherBranches[0].quantity} units)`
          : null,
    };
  });

  rows.sort((a, b) => {
    if (a.availableElsewhere !== b.availableElsewhere) return a.availableElsewhere ? -1 : 1;
    return a.model.localeCompare(b.model);
  });

  return { branches, rows, lowStockThreshold: LOW_STOCK_THRESHOLD };
}

export async function getProductAvailabilityAcrossBranches(inventoryDocId, { currentBranchId } = {}) {
  let source = null;
  for (const Model of ALL_INVENTORY_MODELS) {
    const lean = await Model.findById(inventoryDocId).lean();
    if (lean) {
      const categoryKey = MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR;
      const legacy =
        Model.modelName === "HomeBackupBatteryInventory"
          ? homeBackupBatteryCatalogToLegacy(lean)
          : mapLeanToLegacyProduct(categoryKey, lean);
      source = { lean, legacy, categoryKey, Model };
      break;
    }
  }
  if (!source) return null;

  const matrix = await searchGlobalInventory({
    q: productLabel(source.legacy),
    brand: source.legacy.brand,
    currentBranchId,
  });
  const match = matrix.results.find((r) =>
    r.otherBranches.some((o) => o.inventoryDocId === String(inventoryDocId)) ||
    r.currentBranch?.inventoryDocId === String(inventoryDocId),
  ) || matrix.results[0];
  return { product: source.legacy, availability: match, branches: await listActiveBranches() };
}

export async function getBranchDashboardStats(branchId) {
  if (!branchId) return { lowStock: [], pendingIncoming: 0, pendingOutgoing: 0 };
  const bid = new mongoose.Types.ObjectId(branchId);
  const lowStock = [];

  for (const Model of ALL_INVENTORY_MODELS) {
    const docs = await Model.find({ branchId: bid, quantity: { $lt: LOW_STOCK_THRESHOLD } }).limit(20).lean();
    const categoryKey = MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR;
    for (const doc of docs) {
      const legacy =
        Model === HomeBackupBatteryInventory
          ? homeBackupBatteryCatalogToLegacy(doc)
          : mapLeanToLegacyProduct(categoryKey, doc);
      lowStock.push({
        inventoryDocId: String(doc._id),
        brand: legacy.brand,
        model: productLabel(legacy),
        quantity: Number(doc.quantity ?? 0),
        productType: legacy.type,
      });
    }
  }

  return { lowStock, lowStockThreshold: LOW_STOCK_THRESHOLD };
}
