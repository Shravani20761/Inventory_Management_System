import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import {
  lowStockReportController,
  profitLossReportController,
  salesSummaryReportController,
} from "../controllers/reportController.js";

const router = Router();

router.use(requirePermission("reports"));

router.get("/profit-loss", profitLossReportController);
router.get("/low-stock", lowStockReportController);
router.get("/sales-summary", salesSummaryReportController);

export default router;
