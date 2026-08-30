import { Router } from "express";
import multer from "multer";
import {
  listVehicleBrandsController,
  listVehicleModelsController,
  listVehicleFuelsController,
  compatibleBatteriesController,
} from "../controllers/vehicleController.js";
import {
  catalogTypesController,
  catalogBrandsController,
  catalogModelsController,
  catalogVariantsController,
  catalogFuelsController,
  catalogYearsController,
  catalogRecommendController,
  adminListVehiclesController,
  adminCreateVehicleController,
  adminUpdateVehicleController,
  adminDeleteVehicleController,
  adminDuplicateVehicleController,
  adminListFitmentsController,
  adminCreateFitmentController,
  adminUpdateFitmentController,
  adminDeleteFitmentController,
  adminImportFitmentsController,
  adminImportTemplateController,
} from "../controllers/vehicleFitmentController.js";
import { requireRoles } from "../middleware/authMiddleware.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const router = Router();

router.get("/brands", listVehicleBrandsController);
router.get("/models", listVehicleModelsController);
router.get("/fuels", listVehicleFuelsController);
router.get("/compatible-batteries", compatibleBatteriesController);

router.get("/catalog/types", catalogTypesController);
router.get("/catalog/brands", catalogBrandsController);
router.get("/catalog/models", catalogModelsController);
router.get("/catalog/variants", catalogVariantsController);
router.get("/catalog/fuel-types", catalogFuelsController);
router.get("/catalog/years", catalogYearsController);
router.get("/catalog/recommend", catalogRecommendController);

const admin = requireRoles("superAdmin", "admin");
router.get("/admin/vehicles", admin, adminListVehiclesController);
router.post("/admin/vehicles", admin, adminCreateVehicleController);
router.put("/admin/vehicles/:id", admin, adminUpdateVehicleController);
router.delete("/admin/vehicles/:id", admin, adminDeleteVehicleController);
router.post("/admin/vehicles/:id/duplicate", admin, adminDuplicateVehicleController);
router.get("/admin/fitment-groups", admin, adminListFitmentsController);
router.post("/admin/fitment-groups", admin, adminCreateFitmentController);
router.put("/admin/fitment-groups/:id", admin, adminUpdateFitmentController);
router.delete("/admin/fitment-groups/:id", admin, adminDeleteFitmentController);
router.get("/admin/import-template", admin, adminImportTemplateController);
router.post("/admin/import", admin, upload.single("file"), adminImportFitmentsController);

export default router;
