import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  mergeProducts,
  countProducts,
  countProductsInBranch,
  resolveTenantBranchId,
} from "../services/inventoryService.js";
import {
  MODEL_BY_KEY,
  categoryMeta,
  CATEGORY,
  createCategoryInventoryRow,
} from "../services/categoryInventoryService.js";
import {
  searchBatteryController,
  searchInverterController,
  searchCarBatteryController,
  searchBikeBatteryController,
  searchComboController,
  searchTrolleyController,
} from "../controllers/inventorySearchController.js";
import { uploadInventoryProductImage } from "../services/cloudinaryService.js";
import InventoryStockHistory from "../models/InventoryStockHistory.js";
import {
  PRODUCT_IMAGE_FIELDS,
  imageFieldSetPayload,
} from "../shared/productImageFields.js";
import { findInventoryDocById } from "../services/categoryInventoryService.js";

const router = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function tenant(req) {
  return {
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
  };
}

router.get("/search/battery", searchBatteryController);
router.get("/search/inverter", searchInverterController);
router.get("/search/car-battery", searchCarBatteryController);
router.get("/search/bike-battery", searchBikeBatteryController);
router.get("/search/combo", searchComboController);
router.get("/search/trolley", searchTrolleyController);

router.get("/search-global", async (req, res, next) => {
  try {
    res.status(400).json({
      error: "Use type-specific search APIs: /inventory/search/battery, /inverter, /car-battery, /bike-battery, /combo",
    });
  } catch (e) {
    next(e);
  }
});

/** Legacy — redirects clients to typed search. */
router.get("/multi-branch", async (req, res, next) => {
  try {
    res.status(400).json({
      error: "Use type-specific search APIs: /inventory/search/battery, /inverter, /car-battery, /bike-battery, /combo",
    });
  } catch (e) {
    next(e);
  }
});

router.get("/", async (req, res, next) => {
  try {
    res.json(await listProducts(tenant(req)));
  } catch (e) {
    next(e);
  }
});

/** DB row count for the current tenant (debug / verify Atlas persistence). */
router.get("/stats", async (req, res, next) => {
  try {
    const t = tenant(req);
    const { branchId } = await resolveTenantBranchId(req);
    const productCount = await countProducts(t);
    const productsInAssignedBranch = branchId ? await countProductsInBranch(branchId) : 0;
    const bid = branchId ? new mongoose.Types.ObjectId(branchId) : null;
    const perCollection = await Promise.all(
      Object.entries(MODEL_BY_KEY).map(async ([key, M]) => ({
        category: key,
        ...categoryMeta(key),
        count: bid ? await M.countDocuments({ branchId: bid }) : await M.countDocuments({}),
      })),
    );
    res.json({
      ok: true,
      productCount,
      productsInAssignedBranch,
      resolvedBranchId: branchId || null,
      mongoDatabase: mongoose.connection?.db?.databaseName,
      collections: perCollection,
      note: "Inventory spans car_batteries, bike_batteries, inverter_inventory (+ legacy inverters), inv_battery_combos, home_inverter_batteries, battery_inventory.",
    });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.body?._id) {
      return res.status(400).json({
        error: "Use PUT /inventory/:id to update an existing row. POST creates new inventory only.",
      });
    }
    const { branchId } = await resolveTenantBranchId(req);
    console.log("[POST /inventory]", req.body);
    const saved = await createProduct(req.body, { branchId, ...tenant(req) });
    console.log("[POST /inventory] saved", saved?._id);
    res.status(201).json(saved);
  } catch (e) {
    next(e);
  }
});

/** Alias for home / backup battery ERP add form (persists to home_inverter_batteries). */
router.post("/battery-inventory", async (req, res, next) => {
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
    console.log("[POST /battery-inventory]", req.body);
    const payload = {
      ...req.body,
      type: req.body.type ?? "Home Inverter Battery",
      category: req.body.category ?? req.body.type ?? "Home Inverter Battery",
    };
    const saved = await createCategoryInventoryRow(CATEGORY.HOME_INV, payload, branchId);
    console.log("[POST /battery-inventory] saved", saved?._id);
    res.status(201).json(saved);
  } catch (e) {
    next(e);
  }
});

/**
 * Fetch a single inventory row by Mongo _id (or legacy numeric id) across every category.
 * Registered AFTER the literal GET routes (/, /stats, /search/*) so it never shadows them.
 * Always sends exactly one response on every path (doc, 404, or error via next()).
 */
router.get("/:id/stock-history", async (req, res, next) => {
  try {
    const found = await findInventoryDocById(req.params.id, tenant(req));
    if (!found) return res.status(404).json({ error: "Not found" });
    const rows = await InventoryStockHistory.find({ productId: found.lean._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/upload-image", imageUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "No file uploaded" });
    const imageField = String(req.body.imageField ?? "batteryImage").trim();
    if (!PRODUCT_IMAGE_FIELDS.includes(imageField)) {
      return res.status(400).json({ error: "imageField must be batteryImage, inverterImage, or brandLogo" });
    }
    const found = await findInventoryDocById(req.params.id, tenant(req));
    if (!found) return res.status(404).json({ error: "Inventory row not found" });
    const pid = `sku-${found.lean._id}-${imageField}`.replace(/[^a-zA-Z0-9_-]/g, "");
    const url = await uploadInventoryProductImage(req.file.buffer, req.file.mimetype, {
      publicId: pid,
      folder: "batterymela/inventory/sku-images",
    });
    const set = imageFieldSetPayload(imageField, url);
    await found.Model.updateOne({ _id: found.lean._id }, { $set: set });
    res.json({ ok: true, url, imageField, id: String(found.lean._id) });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id/images/:field", async (req, res, next) => {
  try {
    const imageField = String(req.params.field || "").trim();
    if (!PRODUCT_IMAGE_FIELDS.includes(imageField)) {
      return res.status(400).json({ error: "Invalid image field" });
    }
    const found = await findInventoryDocById(req.params.id, tenant(req));
    if (!found) return res.status(404).json({ error: "Inventory row not found" });
    await found.Model.updateOne({ _id: found.lean._id }, { $set: imageFieldSetPayload(imageField, "") });
    res.json({ ok: true, url: "", imageField, id: String(found.lean._id) });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    console.log("[GET /inventory/:id] called", req.params.id);
    const p = await getProductById(req.params.id, tenant(req));
    if (!p) {
      console.log("[GET /inventory/:id] not found", req.params.id);
      return res.status(404).json({ error: "Not found" });
    }
    console.log("[GET /inventory/:id] completed", req.params.id);
    return res.json(p);
  } catch (e) {
    return next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    console.log("[PUT /inventory/:id] called", req.params.id);
    const p = await updateProduct(req.params.id, req.body, tenant(req));
    if (!p) {
      console.log("[PUT /inventory/:id] not found", req.params.id);
      return res.status(404).json({ error: "Not found" });
    }
    console.log("[PUT /inventory/:id] completed", req.params.id, p?._id);
    return res.json(p);
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    console.log("[DELETE /inventory/:id] called", req.params.id);
    const ok = await deleteProduct(req.params.id, tenant(req));
    if (!ok) {
      console.log("[DELETE /inventory/:id] not found", req.params.id);
      return res.status(404).json({ error: "Not found" });
    }
    console.log("[DELETE /inventory/:id] completed", req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

router.post("/bulk", async (req, res, next) => {
  try {
    const { branchId } = await resolveTenantBranchId(req);
    if (!branchId) {
      return res.status(400).json({
        error:
          "No branch for this account. Assign branchId on the user or ensure a default Branch exists.",
      });
    }
    const items = req.body.items ?? [];
    const before = await countProductsInBranch(branchId);
    const inventory = await mergeProducts(items, { branchId });
    const after = await countProductsInBranch(branchId);
    console.log("[inventory/bulk] items:", items.length, "SKU count (branch):", before, "→", after);
    res.json({ count: items.length, inventory, productCount: after, productCountBefore: before });
  } catch (e) {
    next(e);
  }
});

export default router;
