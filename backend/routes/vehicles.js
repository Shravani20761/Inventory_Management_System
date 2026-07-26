import { Router } from "express";
import {
  listVehicleBrandsController,
  listVehicleModelsController,
  listVehicleFuelsController,
  compatibleBatteriesController,
} from "../controllers/vehicleController.js";

const router = Router();

router.get("/brands", listVehicleBrandsController);
router.get("/models", listVehicleModelsController);
router.get("/fuels", listVehicleFuelsController);
router.get("/compatible-batteries", compatibleBatteriesController);

export default router;
