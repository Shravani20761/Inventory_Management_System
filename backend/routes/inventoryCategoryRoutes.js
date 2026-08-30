import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { parseInventoryExcelBuffer, analyzeInventoryExcelUpload, validateImportColumnMapping } from "../utils/inventoryExcelFromBuffer.js";
import { resolveTenantBranchId, countProductsInBranch } from "../services/inventoryService.js";
import {
  CATEGORY,
  listCategory,
  mergeCategoryRowsFromParsed,
  categoryMeta,
  createCategoryInventoryRow,
} from "../services/categoryInventoryService.js";
import { applyAutomotiveUploadBrand } from "../shared/constants/inventoryCategories.js";
import InvBatteryCombo from "../models/inventory/InvBatteryCombo.js";
import { uploadInventoryProductImage } from "../services/cloudinaryService.js";
import { tenantFromReq, writeBranchIdFromReq } from "../utils/tenant.js";
import { recordAudit } from "../services/auditService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseJsonField(raw, fallback = {}) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function parseUploadMapping(req) {
  return {
    columnMappingByIndex: parseJsonField(req.body?.columnMapping ?? req.body?.columnMappingByIndex),
    duplicateSelections: parseJsonField(req.body?.duplicateSelections),
  };
}

function tenant(req) {
  return tenantFromReq(req);
}

function mountCategory(importTypeLabel, categoryKey) {
  const r = Router();
  r.get("/", async (req, res, next) => {
    try {
      const { branchId, isSuperAdmin } = await resolveTenantBranchId(req);
      res.json(await listCategory(categoryKey, { branchId, isSuperAdmin }));
    } catch (e) {
      next(e);
    }
  });
  r.post("/", async (req, res, next) => {
    try {
      if (req.body?._id) {
        return res.status(400).json({
          error: "Use PUT /inventory/:id to update an existing row. POST creates new inventory only.",
        });
      }
      const { branchId } = await resolveTenantBranchId(req);
      if (!branchId) {
        return res.status(400).json({
          error: "No branch for this account. Assign branchId on the user or ensure a default Branch exists.",
        });
      }
      console.log(`[POST /${importTypeLabel}]`, req.body);
      const payload = {
        ...req.body,
        type: req.body.type ?? importTypeLabel,
        category: req.body.category ?? req.body.type ?? importTypeLabel,
      };
      const saved = await createCategoryInventoryRow(categoryKey, payload, branchId);
      console.log(`[POST /${importTypeLabel}] saved`, saved?._id);
      res.status(201).json(saved);
    } catch (e) {
      next(e);
    }
  });
  r.post("/upload/preview", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const userMapping = parseJsonField(req.body?.columnMapping ?? req.body?.columnMappingByIndex);
      const analysis = await analyzeInventoryExcelUpload(req.file.buffer, importTypeLabel, {
        columnMappingByIndex: userMapping,
      });
      if (!analysis.ok) {
        return res.status(400).json({ error: analysis.errors?.[0] || "Preview failed", errors: analysis.errors });
      }
      res.json(analysis);
    } catch (e) {
      next(e);
    }
  });
  r.post("/upload", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      let { branchId, isSuperAdmin } = await resolveTenantBranchId(req);
      branchId = writeBranchIdFromReq(req, branchId || req.body?.branchId) || branchId;
      if (!branchId) {
        return res.status(400).json({
          error:
            "Select a target branch (Admin) or assign a branch to this user before importing inventory.",
        });
      }
      const { columnMappingByIndex, duplicateSelections } = parseUploadMapping(req);
      const hasExplicitMapping = columnMappingByIndex && Object.keys(columnMappingByIndex).length > 0;
      if (hasExplicitMapping) {
        const validation = validateImportColumnMapping(importTypeLabel, columnMappingByIndex, duplicateSelections);
        if (!validation.ok) {
          return res.status(400).json({
            error: validation.errors[0] || "Invalid column mapping",
            errors: validation.errors,
            requiredFields: validation.requiredFields,
          });
        }
      }
      const { batteries, errors, mappedColumns, parsedRowCount, validationFailed } =
        await parseInventoryExcelBuffer(req.file.buffer, {
          importType: importTypeLabel,
          columnMappingByIndex: hasExplicitMapping ? columnMappingByIndex : undefined,
          duplicateSelections,
        });
      if (validationFailed) {
        return res.status(400).json({ error: errors?.[0] || "Validation failed", errors });
      }
      if (!batteries.length) {
        return res.status(400).json({ error: errors?.[0] || "No valid rows found", errors, mappedColumns });
      }
      const defaultBrand = String(req.body?.defaultBrand ?? req.query?.defaultBrand ?? "").trim();
      const importRows =
        categoryKey === CATEGORY.CAR || categoryKey === CATEGORY.BIKE
          ? applyAutomotiveUploadBrand(batteries, defaultBrand)
          : batteries;
      const countBefore = await countProductsInBranch(branchId);
      const mergeResult = await mergeCategoryRowsFromParsed(categoryKey, importRows, branchId, { quantityMode: "add" });
      const countAfter = await countProductsInBranch(branchId);
      const meta = categoryMeta(categoryKey);
      const failedRows = (errors || []).filter((e) => /row \d+/i.test(String(e)));
      /** Slim JSON — full categoryRows + aggregate inventory bloated responses and caused proxy ECONNRESET. */
      res.json({
        imported: batteries.length,
        parsedRowCount: parsedRowCount ?? batteries.length,
        categoryRowCount: mergeResult.rows?.length ?? 0,
        merged: {
          inserted: mergeResult.inserted ?? 0,
          updated: mergeResult.updated ?? 0,
          skipped: mergeResult.skipped ?? 0,
          failed: failedRows.length,
        },
        productCount: countAfter,
        productCountBefore: countBefore,
        mongoDatabase: mongoose.connection?.db?.databaseName,
        mongoCollection: meta.collectionName,
        mongooseModel: meta.mongooseModel,
        category: categoryKey,
        uploadedBrands: [
          ...new Set(
            importRows
              .map((b) => String(b.brand ?? "").trim())
              .filter(Boolean),
          ),
        ],
        warnings: errors,
        failedRows,
        mappedColumns,
      });
    } catch (e) {
      next(e);
    }
  });
  return r;
}

const router = Router();
router.use("/car-batteries", mountCategory("Car", CATEGORY.CAR));
router.use("/truck-batteries", mountCategory("Truck", CATEGORY.CAR));
router.use("/bike-batteries", mountCategory("Bike", CATEGORY.BIKE));
router.use("/inverters", mountCategory("Inverter", CATEGORY.INVERTER));

/**
 * Upload inverter / battery / brand logo image to Cloudinary and save URL on the combo row.
 * multipart: file + imageField = inverterImage | batteryImage | brandLogo
 * Registered before /inv-combos mount so :id paths are not swallowed by the category sub-router.
 */
router.post("/inv-combos/:id/upload-image", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "No file uploaded" });
    const imageField = String(req.body.imageField ?? "inverterImage").trim();
    if (!["inverterImage", "batteryImage", "brandLogo"].includes(imageField)) {
      return res.status(400).json({ error: "imageField must be inverterImage, batteryImage, or brandLogo" });
    }
    const { branchId, isSuperAdmin } = tenant(req);
    const docId = new mongoose.Types.ObjectId(req.params.id);
    const q = { _id: docId };
    if (!isSuperAdmin) {
      if (!branchId) return res.status(400).json({ error: "Branch is required to update inventory images" });
      q.branchId = new mongoose.Types.ObjectId(branchId);
    }
    const doc = await InvBatteryCombo.findOne(q);
    if (!doc) return res.status(404).json({ error: "Combo row not found for this branch" });
    const pid = `combo-${doc._id}-${imageField}`.replace(/[^a-zA-Z0-9_-]/g, "");
    const url = await uploadInventoryProductImage(req.file.buffer, req.file.mimetype, {
      publicId: pid,
      folder: "batterymela/inventory/combos",
    });
    doc.set(imageField, url);
    await doc.save();
    res.json({ ok: true, url, imageField, id: doc._id.toString() });
  } catch (e) {
    next(e);
  }
});

router.use("/inv-combos", mountCategory("Inverter+Battery", CATEGORY.INV_COMBO));
router.use("/home-inv-battery", mountCategory("Home Inverter Battery", CATEGORY.HOME_INV));
router.use("/trolleys", mountCategory("Trolley", CATEGORY.TROLLEY));
router.use("/lithium-ion-batteries", mountCategory("Lithium Ion Battery", CATEGORY.LITHIUM_ION));

export default router;
