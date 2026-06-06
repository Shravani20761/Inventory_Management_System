import { Router } from "express";
import {
  listPurchaseOrdersController,
  getPurchaseOrderController,
  createPurchaseOrderController,
  recordPaymentController,
  updateChequeStatusController,
  purchaseDashboardController,
  vendorLedgerController,
  outstandingReportController,
  monthlyPurchaseReportController,
  runRemindersController,
} from "../controllers/purchaseManagementController.js";

const router = Router();

router.get("/dashboard", purchaseDashboardController);
router.get("/reports/outstanding", outstandingReportController);
router.get("/reports/monthly", monthlyPurchaseReportController);
router.get("/reports/vendor/:vendorName", vendorLedgerController);
router.get("/reminders/run", runRemindersController);

router.get("/", listPurchaseOrdersController);
router.get("/:id", getPurchaseOrderController);
router.post("/", createPurchaseOrderController);
router.post("/:id/payments", recordPaymentController);
router.patch("/:id/cheques/:chequeId", updateChequeStatusController);

export default router;
