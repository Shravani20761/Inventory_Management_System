import { Router } from "express";
import { requirePermission, requireRoles } from "../middleware/authMiddleware.js";
import {
  dashboardController,
  salesReportController,
  purchaseReportController,
  expenseReportController,
  inventoryReportController,
  gstReportController,
  profitLossReportController,
  listExpensesController,
  createExpenseController,
  deleteExpenseController,
  getCaProfileController,
  upsertCaProfileController,
  generateReportController,
  generatePackageController,
  emailToCaController,
  whatsappToCaController,
  deliveryStatusController,
} from "../controllers/accountsController.js";

const router = Router();

/** Anyone who can view accounts (admin, accountant, ca). */
const canView = requirePermission("accounts", "accounts:read", "reports", "reports:read");
/** Generate/download reports (ca allowed — download only, no data edits). */
const canDownload = requirePermission("accounts", "accounts:download", "reports", "reports:download");
/** Mutating endpoints — staff only, CA explicitly excluded. */
const canEdit = requireRoles("admin", "accountant");

/* Dashboard + report views (read) */
router.get("/dashboard", canView, dashboardController);
router.get("/reports/sales", canView, salesReportController);
router.get("/reports/purchase", canView, purchaseReportController);
router.get("/reports/expense", canView, expenseReportController);
router.get("/reports/inventory", canView, inventoryReportController);
router.get("/reports/gst", canView, gstReportController);
router.get("/reports/profit-loss", canView, profitLossReportController);

/* Expenses */
router.get("/expenses", canView, listExpensesController);
router.post("/expenses", canEdit, createExpenseController);
router.delete("/expenses/:id", canEdit, deleteExpenseController);

/* CA profile */
router.get("/ca-profile", canView, getCaProfileController);
router.put("/ca-profile", canEdit, upsertCaProfileController);

/* Report generation (PDF / ZIP) */
router.post("/generate/package", canDownload, generatePackageController);
router.post("/generate/:type", canDownload, generateReportController);

/* Send to CA (generates + delivers — treated as download/delivery, CA allowed for own copies) */
router.get("/delivery/status", canView, deliveryStatusController);
router.post("/send/email", canDownload, emailToCaController);
router.post("/send/whatsapp", canDownload, whatsappToCaController);

export default router;
