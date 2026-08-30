import { Router } from "express";
import { analyticsController, auditLogsController } from "../controllers/analyticsController.js";
import { requirePermission, requireRoles } from "../middleware/authMiddleware.js";

const router = Router();

router.get(
  "/",
  requireRoles("superAdmin", "admin", "manager", "accountant"),
  requirePermission("analytics", "analytics:branch", "reports", "accounts"),
  analyticsController,
);

router.get("/audit-logs", requireRoles("superAdmin"), auditLogsController);

export default router;
