import {
  ensureVehicleTypes,
  listCatalogBrands,
  listCatalogModels,
  listCatalogVariants,
  listCatalogFuels,
  listCatalogYears,
  listAdminVehicles,
  upsertVehicleRecord,
  deleteVehicleRecord,
  duplicateVehicleRecord,
  listFitmentGroups,
  saveFitmentGroup,
  deleteFitmentGroup,
} from "../services/vehicleFitment/catalogService.js";
import { recommendBatteriesForVariant } from "../services/vehicleFitment/recommendService.js";
import { importVehicleFitments, fitmentTemplateCsv } from "../services/vehicleFitment/importService.js";

function tenant(req) {
  let branchId = req.user?.branchId || null;
  if (branchId && typeof branchId === "object") branchId = branchId._id?.toString?.() ?? branchId.toString?.() ?? null;
  return { branchId, isSuperAdmin: req.user?.role === "superAdmin" };
}

export async function catalogTypesController(req, res, next) {
  try {
    res.json({ types: await ensureVehicleTypes() });
  } catch (e) {
    next(e);
  }
}

export async function catalogBrandsController(req, res, next) {
  try {
    const vehicleTypeId = req.query.vehicleTypeId;
    if (!vehicleTypeId) return res.status(400).json({ error: "vehicleTypeId is required" });
    const brands = await listCatalogBrands(vehicleTypeId, req.query.q);
    res.json({ brands });
  } catch (e) {
    next(e);
  }
}

export async function catalogModelsController(req, res, next) {
  try {
    const brandId = req.query.brandId;
    if (!brandId) return res.status(400).json({ error: "brandId is required" });
    res.json({ models: await listCatalogModels(brandId, req.query.q) });
  } catch (e) {
    next(e);
  }
}

export async function catalogVariantsController(req, res, next) {
  try {
    const modelId = req.query.modelId;
    if (!modelId) return res.status(400).json({ error: "modelId is required" });
    const variants = await listCatalogVariants(modelId);
    res.json({
      variants,
      required: variants.some((v) => String(v.name || "").trim()),
    });
  } catch (e) {
    next(e);
  }
}

export async function catalogFuelsController(req, res, next) {
  try {
    const modelId = req.query.modelId;
    if (!modelId) return res.status(400).json({ error: "modelId is required" });
    res.json({ fuels: await listCatalogFuels(modelId) });
  } catch (e) {
    next(e);
  }
}

export async function catalogYearsController(req, res, next) {
  try {
    const variantId = req.query.variantId;
    if (!variantId) return res.status(400).json({ error: "variantId is required" });
    res.json({ years: await listCatalogYears(variantId) });
  } catch (e) {
    next(e);
  }
}

export async function catalogRecommendController(req, res, next) {
  try {
    const variantId = req.query.variantId || req.query.vehicleVariantId;
    if (!variantId) return res.status(400).json({ error: "variantId is required" });
    const includeOutOfStock = String(req.query.includeOutOfStock || "") === "true";
    const result = await recommendBatteriesForVariant(variantId, tenant(req), {
      includeOutOfStock,
      year: req.query.year,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function adminListVehiclesController(req, res, next) {
  try {
    res.json(await listAdminVehicles({ q: req.query.q, vehicleTypeId: req.query.vehicleTypeId }));
  } catch (e) {
    next(e);
  }
}

export async function adminCreateVehicleController(req, res, next) {
  try {
    const row = await upsertVehicleRecord(req.body || {});
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateVehicleController(req, res, next) {
  try {
    const row = await upsertVehicleRecord({ ...req.body, _id: req.params.id });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteVehicleController(req, res, next) {
  try {
    const ok = await deleteVehicleRecord(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function adminDuplicateVehicleController(req, res, next) {
  try {
    const row = await duplicateVehicleRecord(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function adminListFitmentsController(req, res, next) {
  try {
    res.json(await listFitmentGroups());
  } catch (e) {
    next(e);
  }
}

export async function adminCreateFitmentController(req, res, next) {
  try {
    res.status(201).json(await saveFitmentGroup(null, req.body || {}));
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateFitmentController(req, res, next) {
  try {
    res.json(await saveFitmentGroup(req.params.id, req.body || {}));
  } catch (e) {
    next(e);
  }
}

export async function adminDeleteFitmentController(req, res, next) {
  try {
    const ok = await deleteFitmentGroup(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function adminImportFitmentsController(req, res, next) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "No file uploaded" });
    const summary = await importVehicleFitments(req.file.buffer);
    res.json(summary);
  } catch (e) {
    next(e);
  }
}

export async function adminImportTemplateController(_req, res, next) {
  try {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=vehicle-fitment-template.csv");
    res.send(fitmentTemplateCsv());
  } catch (e) {
    next(e);
  }
}
