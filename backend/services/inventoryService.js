import Branch from "../models/Branch.js";
import mongoose from "mongoose";
import { branchQuery } from "../utils/branchQuery.js";
import { enrichProductProfit } from "./profitService.js";
import {
  CATEGORY,
  MODEL_BY_KEY,
  listAllCategoriesAsLegacyProducts,
  mergeCategoryRowsFromParsed,
  inferCategoryKeyFromLegacyRow,
  findInventoryDocById,
  deleteCategoryInventoryItem,
  deductStockAcrossCategories,
  importRowToCategoryDocument,
  mapLeanToLegacyProduct,
  createCategoryInventoryRow,
} from "./categoryInventoryService.js";

export { branchQuery };

function normalizeProduct(input, branchId) {
  const modelName = String(input.modelName ?? input.model ?? "").trim();
  const dp = Number(input.dp ?? input.dpPrice ?? input.dpPlusGst ?? input.purchaseRate ?? 0);
  const cd = Number(input.cd ?? input.cdPrice ?? 0);
  const mrpFinal = Number(input.mrpFinal ?? input.mrp ?? 0);
  const ob = Number(
    input.newRateWithOB != null && input.newRateWithOB !== ""
      ? input.newRateWithOB
      : input.sellRate ?? input.sellingRate ?? 0,
  );
  const wo = Number(input.newRateWithoutOB ?? 0);
  const sell = Number(input.sellRate ?? input.sellingRate ?? 0) || ob;

  return {
    branchId: branchId || input.branchId || null,
    legacyId: input.legacyId != null ? Number(input.legacyId) : undefined,
    modelName: modelName || "Unknown",
    brand: input.brand ?? "Unknown",
    category: input.category ?? input.type ?? "Battery",
    type: input.type ?? input.category ?? "Battery",
    quantity: Number(input.quantity ?? 0),
    purchaseRate: dp,
    sellingRate: sell,
    warranty: input.warranty ?? "",
    capacityAh: Number(input.capacityAh ?? input.ah ?? input.batteryAH ?? 0),
    inverterVA: Number(input.inverterVA ?? 0),
    batteryType: input.batteryType ?? "",
    comboId: String(input.comboId ?? "").trim(),
    inverterModel: String(input.inverterModel ?? "").trim(),
    batteryModel: String(input.batteryModel ?? "").trim(),
    backupHours: Number(input.backupHours ?? 0),
    backupSupport: String(input.backupSupport ?? "").trim(),
    suitableFor: String(input.suitableFor ?? "").trim(),
    comboCategory: String(input.comboCategory ?? "").trim(),
    inverterPrice: Number(input.inverterPrice ?? 0),
    batteryPrice: Number(input.batteryPrice ?? 0),
    finalPriceWithOldBattery: Number(input.finalPriceWithOldBattery ?? 0),
    finalPriceWithoutOldBattery: Number(input.finalPriceWithoutOldBattery ?? 0),
    batteryPriceWithoutOld: Number(input.batteryPriceWithoutOld ?? input.batteryWithoutOldPrice ?? 0),
    amazonPrice: Number(input.amazonPrice ?? 0),
    flipkartPrice: Number(input.flipkartPrice ?? 0),
    batteryBhaiPrice: Number(input.batteryBhaiPrice ?? 0),
    batteryBossPrice: Number(input.batteryBossPrice ?? 0),
    notes: String(input.notes ?? "").trim(),
    imageUrl: input.imageUrl ?? "",
    availability: Number(input.quantity ?? 0) > 0,
    supplier: input.supplier ?? "",
    place: input.place ?? "",
    invoiceNo: input.invoiceNo ?? "",
    productCapacity: String(input.productCapacity ?? "").trim(),
    weight: Number(input.weight ?? input.batteryWeight ?? 0),
    scrapRate: Number(input.scrapRate ?? 0),
    cd,
    cdPrice: cd,
    dp,
    dpPrice: dp,
    dpPlusGst: dp,
    mrpFinal,
    mrp: mrpFinal || Number(input.mrp ?? 0),
    newRateWithOB: ob,
    newRateWithoutOB: wo,
    voltage: Number(input.voltage ?? 0),
  };
}

function legacyRowToNormalizeInput(legacy) {
  return {
    modelName: legacy.modelName ?? legacy.model,
    brand: legacy.brand,
    category: legacy.category,
    type: legacy.type,
    quantity: legacy.quantity,
    capacityAh: legacy.capacityAh ?? legacy.ah,
    ah: legacy.ah,
    inverterVA: legacy.inverterVA,
    warranty: legacy.warranty,
    batteryType: legacy.batteryType,
    comboId: legacy.comboId,
    inverterModel: legacy.inverterModel,
    batteryModel: legacy.batteryModel,
    backupHours: legacy.backupHours,
    backupSupport: legacy.backupSupport,
    comboCategory: legacy.comboCategory,
    inverterPrice: legacy.inverterPrice,
    batteryPrice: legacy.batteryPrice,
    finalPriceWithOldBattery: legacy.finalPriceWithOldBattery,
    finalPriceWithoutOldBattery: legacy.finalPriceWithoutOldBattery,
    purchaseRate: legacy.purchaseRate,
    dpPlusGst: legacy.dpPlusGst ?? legacy.purchaseRate,
    newRateWithOB: legacy.newRateWithOB ?? legacy.sellRate ?? legacy.sellingRate,
    newRateWithoutOB: legacy.newRateWithoutOB,
    sellRate: legacy.sellRate,
    sellingRate: legacy.sellingRate,
    mrp: legacy.mrp,
    productCapacity: legacy.productCapacity,
    supplier: legacy.supplier,
    invoiceNo: legacy.invoiceNo,
    place: legacy.place,
    notes: legacy.notes,
    suitableFor: legacy.suitableFor,
    weight: legacy.weight,
    scrapRate: legacy.scrapRate,
    cd: legacy.cd ?? legacy.cdPrice,
    dp: legacy.dp ?? legacy.dpPrice,
    mrpFinal: legacy.mrpFinal ?? legacy.mrp,
    voltage: legacy.voltage,
    imageUrl: legacy.imageUrl,
    amazonPrice: legacy.amazonPrice,
    flipkartPrice: legacy.flipkartPrice,
    batteryBhaiPrice: legacy.batteryBhaiPrice,
    batteryBossPrice: legacy.batteryBossPrice,
  };
}

function normalizedToImportRow(n) {
  return {
    model: n.modelName,
    modelName: n.modelName,
    brand: n.brand,
    type: n.type,
    category: n.category,
    ah: n.capacityAh,
    capacityAh: n.capacityAh,
    batteryAH: n.capacityAh,
    quantity: n.quantity ?? 0,
    vehicleType: n.type,
    weight: n.weight,
    scrapRate: n.scrapRate,
    cd: n.cd,
    cdPrice: n.cdPrice,
    dp: n.dp,
    dpPrice: n.dpPrice,
    mrpFinal: n.mrpFinal,
    newRateWithOB: n.newRateWithOB ?? n.sellingRate,
    newRateWithoutOB: n.newRateWithoutOB,
    sellRate: n.sellingRate,
    sellingRate: n.sellingRate,
    purchaseRate: n.purchaseRate,
    dpPlusGst: n.dpPlusGst,
    warranty: n.warranty,
    batteryType: n.batteryType,
    inverterVA: n.inverterVA,
    comboId: n.comboId,
    inverterModel: n.inverterModel,
    batteryModel: n.batteryModel,
    backupHours: n.backupHours,
    inverterPrice: n.inverterPrice,
    batteryPrice: n.batteryPrice,
    finalPriceWithOldBattery: n.finalPriceWithOldBattery,
    finalPriceWithoutOldBattery: n.finalPriceWithoutOldBattery,
    mrp: n.mrp,
    productCapacity: n.productCapacity,
    supplier: n.supplier,
    invoiceNo: n.invoiceNo,
    notes: n.notes,
    suitableFor: n.suitableFor,
    amazonPrice: n.amazonPrice,
    flipkartPrice: n.flipkartPrice,
    batteryBhaiPrice: n.batteryBhaiPrice,
    batteryBossPrice: n.batteryBossPrice,
    voltage: n.voltage,
  };
}

export async function countProducts({ branchId = null, isSuperAdmin = false } = {}) {
  const q = branchQuery(branchId, isSuperAdmin);
  const parts = await Promise.all(Object.values(MODEL_BY_KEY).map((M) => M.countDocuments(q)));
  return parts.reduce((a, b) => a + b, 0);
}

export async function countProductsInBranch(branchId) {
  if (!branchId) return 0;
  const bid = new mongoose.Types.ObjectId(branchId);
  const parts = await Promise.all(Object.values(MODEL_BY_KEY).map((M) => M.countDocuments({ branchId: bid })));
  return parts.reduce((a, b) => a + b, 0);
}

export async function resolveTenantBranchId(req) {
  // Prefer branch scope middleware when present (RBAC-safe).
  if (req.branchScope) {
    const scope = req.branchScope;
    return {
      branchId: scope.mode === "one" ? scope.branchId : scope.branchId,
      isSuperAdmin: scope.isHq || scope.isSuperAdmin,
      /** When HQ + all branches, callers should not default to first branch for reads. */
      allBranches: scope.mode === "all",
      branchScope: scope,
    };
  }

  let branchId = req.user?.branchId || null;
  if (branchId && typeof branchId === "object") {
    branchId = branchId._id?.toString?.() ?? branchId.toString?.() ?? null;
  }
  const isSuperAdmin = req.user?.role === "superAdmin";

  // HQ may act as a branch via header/query — never for non-HQ.
  if (isSuperAdmin) {
    const raw = req.headers["x-branch-id"] || req.query?.branchId || null;
    if (raw && String(raw) !== "all") {
      const s = String(raw).trim();
      if (mongoose.Types.ObjectId.isValid(s)) {
        return { branchId: s, isSuperAdmin: true, allBranches: false };
      }
    }
    if (raw === "all" || !raw) {
      return { branchId: null, isSuperAdmin: true, allBranches: true };
    }
  }

  if (!branchId && isSuperAdmin) {
    // Prefer explicit all-branches for HQ reads; keep first-branch only for writers that need an id.
    return { branchId: null, isSuperAdmin: true, allBranches: true };
  }
  return { branchId, isSuperAdmin, allBranches: false };
}

export async function listProducts({ includeProfit = true, branchId = null, isSuperAdmin = false, allBranches = false } = {}) {
  const hqAll = Boolean(isSuperAdmin && (allBranches || !branchId));
  return listAllCategoriesAsLegacyProducts({
    includeProfit,
    branchId: hqAll ? null : branchId,
    isSuperAdmin: hqAll || (isSuperAdmin && !branchId),
    strictBranch: Boolean(branchId) && !hqAll,
  });
}

export async function getProductById(id, { branchId = null, isSuperAdmin = false } = {}) {
  const found = await findInventoryDocById(id, { branchId, isSuperAdmin });
  if (!found) return null;
  const product = mapLeanToLegacyProduct(found.categoryKey, found.lean);
  return enrichProductProfit(product);
}

export async function createProduct(data, { branchId = null } = {}) {
  if (data?._id) {
    const err = new Error("Use PUT /inventory/:id to update existing inventory. POST is for new rows only.");
    err.status = 400;
    throw err;
  }
  const bid =
    branchId != null && String(branchId).trim() !== ""
      ? new mongoose.Types.ObjectId(branchId)
      : data.branchId != null && String(data.branchId).trim() !== ""
        ? new mongoose.Types.ObjectId(String(data.branchId))
        : null;
  if (!bid) throw new Error("branchId required to create inventory");
  console.log("[inventory/create] body:", {
    type: data?.type,
    category: data?.category,
    brand: data?.brand,
    model: data?.model ?? data?.batteryModel,
    ah: data?.ah ?? data?.batteryAH,
    qty: data?.quantity,
  });
  const n = normalizeProduct({ ...data }, bid);
  let row = normalizedToImportRow(n);
  row = {
    ...data,
    ...row,
    type: data.type ?? row.type,
    category: data.category ?? data.type ?? row.category,
    brand: data.brand ?? row.brand,
    model: data.model ?? row.model ?? data.batteryModel,
    batteryModel: data.batteryModel ?? row.batteryModel ?? data.model,
    batteryType: data.batteryType ?? row.batteryType,
    voltage: data.voltage ?? row.voltage,
    mrpFinal: data.mrpFinal ?? row.mrpFinal,
    newRateWithOB: data.newRateWithOB ?? row.newRateWithOB,
    newRateWithoutOB: data.newRateWithoutOB ?? row.newRateWithoutOB,
  };
  const cat = inferCategoryKeyFromLegacyRow(row);
  const created = await createCategoryInventoryRow(cat, row, String(bid));
  console.log("[inventory/create] saved:", created?._id, created?.model ?? created?.batteryModel);
  return created;
}

export async function updateProduct(id, data, { branchId = null, isSuperAdmin = false } = {}) {
  const found = await findInventoryDocById(id, { branchId, isSuperAdmin });
  if (!found) return null;
  const bid = found.lean.branchId || (branchId ? new mongoose.Types.ObjectId(branchId) : null);
  if (!bid) return null;
  const legacy = mapLeanToLegacyProduct(found.categoryKey, found.lean);
  const merged = {
    ...legacyRowToNormalizeInput(legacy),
    ...data,
    cd: data.cd ?? data.cdPrice ?? legacy.cd ?? legacy.cdPrice,
    dp: data.dp ?? data.dpPrice ?? data.dpPlusGst ?? legacy.dp ?? legacy.dpPrice ?? legacy.purchaseRate,
    mrp: data.mrp ?? data.mrpFinal ?? legacy.mrp ?? legacy.mrpFinal,
    mrpFinal: data.mrpFinal ?? data.mrp ?? legacy.mrpFinal ?? legacy.mrp,
    voltage: data.voltage ?? legacy.voltage,
    newRateWithOB:
      data.newRateWithOB != null && data.newRateWithOB !== ""
        ? data.newRateWithOB
        : legacy.newRateWithOB ?? legacy.sellRate,
    newRateWithoutOB:
      data.newRateWithoutOB != null && data.newRateWithoutOB !== ""
        ? data.newRateWithoutOB
        : legacy.newRateWithoutOB,
    weight: data.weight ?? data.batteryWeight ?? legacy.weight ?? legacy.batteryWeight,
    scrapRate: data.scrapRate ?? legacy.scrapRate,
    amazonPrice: data.amazonPrice ?? legacy.amazonPrice,
    flipkartPrice: data.flipkartPrice ?? legacy.flipkartPrice,
    batteryBhaiPrice: data.batteryBhaiPrice ?? legacy.batteryBhaiPrice,
    batteryBossPrice: data.batteryBossPrice ?? legacy.batteryBossPrice,
    batteryType: data.batteryType ?? legacy.batteryType,
    warranty: data.warranty ?? legacy.warranty,
    batteryImage: data.batteryImage ?? legacy.batteryImage,
    inverterImage: data.inverterImage ?? legacy.inverterImage ?? legacy.image,
    brandLogo: data.brandLogo ?? legacy.brandLogo ?? legacy.brandDefaultImage,
  };
  const n = normalizeProduct(merged, bid);
  const row = normalizedToImportRow(n);
  const setDoc = importRowToCategoryDocument(found.categoryKey, row, String(bid));
  delete setDoc.legacyId;
  delete setDoc.srNo;
  const imgFields = ["batteryImage", "inverterImage", "brandLogo"];
  for (const f of imgFields) {
    const next = data[f] !== undefined ? String(data[f] ?? "").trim() : String(found.lean[f] ?? merged[f] ?? "").trim();
    if (next) setDoc[f] = next;
    else delete setDoc[f];
  }
  if (setDoc.inverterImage) setDoc.image = setDoc.inverterImage;
  if (setDoc.brandLogo) setDoc.brandDefaultImage = setDoc.brandLogo;
  const updateOp = { $set: setDoc };
  if (found.categoryKey === CATEGORY.INVERTER) {
    updateOp.$unset = { dpPlusGst: "", notes: "", srNo: "" };
  }
  const updated = await found.Model.findByIdAndUpdate(
    found.lean._id,
    updateOp,
    { new: true, runValidators: true },
  ).lean();
  if (!updated) return null;
  return enrichProductProfit(mapLeanToLegacyProduct(found.categoryKey, updated));
}

export async function deleteProduct(id, { branchId = null, isSuperAdmin = false } = {}) {
  return deleteCategoryInventoryItem(id, { branchId, isSuperAdmin });
}

export async function mergeProducts(incoming, { branchId = null } = {}) {
  const dbName = mongoose.connection?.db?.databaseName;
  if (!branchId) {
    console.warn("[mergeProducts] skipped — no branchId");
    return listProducts({ branchId: null, includeProfit: true, isSuperAdmin: true });
  }

  const buckets = new Map();
  for (const row of incoming) {
    const cat = inferCategoryKeyFromLegacyRow(row);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push(row);
  }

  for (const [cat, rows] of buckets) {
    if (!rows.length) continue;
    await mergeCategoryRowsFromParsed(cat, rows, String(branchId));
  }

  const out = await listProducts({ branchId, includeProfit: true, isSuperAdmin: false });
  console.log("[mergeProducts] category collections @", dbName, {
    branchId: String(branchId),
    incomingRows: incoming.length,
    bucketCount: buckets.size,
    listProductsReturned: out.length,
  });
  if (incoming.length > 0 && out.length === 0) {
    console.error("[mergeProducts] BUG: merges ran but listProducts returned 0 — check branchId.");
  }
  return out;
}

export async function deductStock(items, { branchId = null, isSuperAdmin = false } = {}) {
  await deductStockAcrossCategories(items, { branchId, isSuperAdmin });
}
