import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { parseInventoryExcelBuffer } from "../utils/inventoryExcelFromBuffer.js";
import {
  mergeProducts,
  countProductsInBranch,
  resolveTenantBranchId,
} from "../services/inventoryService.js";
import {
  mergeCategoryRowsFromParsed,
  listAllCategoriesAsLegacyProducts,
  IMPORT_TYPE_TO_CATEGORY,
  categoryMeta,
} from "../services/categoryInventoryService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.post("/excel", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { branchId } = await resolveTenantBranchId(req);
    if (!branchId) {
      return res.status(400).json({
        error:
          "No branch for this account. Create a Branch in MongoDB, assign your user a branchId, or use the bootstrap admin (first user gets Main Branch).",
      });
    }

    const importTypeRaw = String(req.body?.importType ?? req.query?.importType ?? "All").trim();
    const importType = importTypeRaw === "" ? "All" : importTypeRaw;

    const { batteries, errors, mappedColumns } = await parseInventoryExcelBuffer(req.file.buffer, {
      importType,
    });
    if (!batteries.length) {
      return res.status(400).json({ error: errors?.[0] || "No valid rows found", errors, mappedColumns });
    }

    const countBefore = await countProductsInBranch(branchId);
    const catKey = IMPORT_TYPE_TO_CATEGORY[importType];
    let mergeSummary = { inserted: 0, updated: 0, skipped: 0 };
    if (catKey) {
      const mergeResult = await mergeCategoryRowsFromParsed(catKey, batteries, branchId, { quantityMode: "add" });
      mergeSummary = {
        inserted: mergeResult.inserted ?? 0,
        updated: mergeResult.updated ?? 0,
        skipped: mergeResult.skipped ?? 0,
      };
    } else {
      await mergeProducts(batteries, { branchId });
    }
    const merged = await listAllCategoriesAsLegacyProducts({
      branchId,
      isSuperAdmin: false,
      includeProfit: true,
    });
    const countAfter = await countProductsInBranch(branchId);

    console.log("[upload/excel] Parsed Excel rows:", batteries.length);
    console.log("[upload/excel] Branch SKU count:", countBefore, "→", countAfter);

    const meta = catKey ? categoryMeta(catKey) : { collectionName: "multi-category", mongooseModel: "mixed" };
    res.json({
      imported: batteries.length,
      merged: mergeSummary,
      productCount: countAfter,
      productCountBefore: countBefore,
      mongoDatabase: mongoose.connection?.db?.databaseName,
      mongoCollection: meta.collectionName,
      mongooseModel: meta.mongooseModel,
      inventory: merged,
      warnings: errors,
      mappedColumns,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/excel/preview", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const importTypeRaw = String(req.body?.importType ?? req.query?.importType ?? "All").trim();
    const importType = importTypeRaw === "" ? "All" : importTypeRaw;
    const result = await parseInventoryExcelBuffer(req.file.buffer, { importType });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
