import { Router } from "express";
import {
  listBranchesController,
  searchGlobalController,
  multiBranchStockController,
  productAvailabilityController,
  branchDashboardController,
  listTransfersController,
  createTransferController,
  transferActionController,
} from "../controllers/stockTransferController.js";

const router = Router();

router.get("/branches", listBranchesController);
router.get("/search-global", searchGlobalController);
router.get("/multi-branch", multiBranchStockController);
router.get("/branch-dashboard", branchDashboardController);
router.get("/availability/:productId", productAvailabilityController);
router.get("/", listTransfersController);
router.post("/", createTransferController);
router.post("/:id/action", transferActionController);

export default router;
