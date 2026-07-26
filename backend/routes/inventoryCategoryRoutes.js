import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { parseInventoryExcelBuffer } from "../utils/inventoryExcelFromBuffer.js";
import { resolveTenantBranchId, countProductsInBranch } from "../services/inventoryService.js";
import {
  CATEGORY,
  listCategory,
  mergeCategoryRowsFromParsed,
  listAllCategoriesAsLegacyProducts,
  categoryMeta,
  createCategoryInventoryRow,
} from "../services/categoryInventoryService.js";
import InvBatteryCombo from "../models/inventory/InvBatteryCombo.js";
import { uploadInventoryProductImage } from "../services/cloudinaryService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function tenant(req) {
  return { branchId: req.user?.branchId || null, isSuperAdmin: req.user?.role === "superAdmin" };
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
  r.post("/upload", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const { branchId, isSuperAdmin } = await resolveTenantBranchId(req);
      if (!branchId) {
        return res.status(400).json({
          error:
            "No branch for this account. Assign branchId on the user or ensure a default Branch exists.",
        });
      }
      const { batteries, errors, mappedColumns, parsedRowCount } = await parseInventoryExcelBuffer(req.file.buffer, {
        importType: importTypeLabel,
      });
      if (!batteries.length) {
        return res.status(400).json({ error: errors?.[0] || "No valid rows found", errors, mappedColumns });
      }
      const countBefore = await countProductsInBranch(branchId);
      const mergeResult = await mergeCategoryRowsFromParsed(categoryKey, batteries, branchId, { quantityMode: "add" });
      const categoryRows = mergeResult.rows;
      const inventory = await listAllCategoriesAsLegacyProducts({
        branchId,
        isSuperAdmin,
        includeProfit: true,
      });
      const countAfter = await countProductsInBranch(branchId);
      const meta = categoryMeta(categoryKey);
      res.json({
        imported: batteries.length,
        parsedRowCount: parsedRowCount ?? batteries.length,
        categoryRowCount: categoryRows.length,
        merged: {
          inserted: mergeResult.inserted ?? 0,
          updated: mergeResult.updated ?? 0,
          skipped: mergeResult.skipped ?? 0,
        },
        productCount: countAfter,
        productCountBefore: countBefore,
        mongoDatabase: mongoose.connection?.db?.databaseName,
        mongoCollection: meta.collectionName,
        mongooseModel: meta.mongooseModel,
        category: categoryKey,
        categoryRows,
        inventory,
        uploadedBrands: [
          ...new Set(
            batteries
              .map((b) => String(b.brand ?? "").trim())
              .filter(Boolean),
          ),
        ],
        warnings: errors,
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
