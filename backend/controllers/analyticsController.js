import { getMultiBranchAnalytics } from "../services/multiBranchAnalyticsService.js";
import { listAuditLogs } from "../services/auditService.js";
import { requireRoles, requirePermission } from "../middleware/authMiddleware.js";
import { isHqRole } from "../constants/roles.js";

/**
 * GET /api/analytics?preset=this_month&from=&to=
 * Branch scope from attachBranchScope (X-Branch-Id / all for HQ).
 */
export async function analyticsController(req, res, next) {
  try {
    const scope = req.branchScope;
    if (!scope) return res.status(500).json({ error: "Branch scope missing" });
    // Staff without analytics permission blocked via route middleware
    const data = await getMultiBranchAnalytics(scope, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function auditLogsController(req, res, next) {
  try {
    if (!isHqRole(req.user?.role)) {
      return res.status(403).json({ error: "Only Admin can view all audit logs" });
    }
    const rows = await listAuditLogs({
      branchId: req.branchScope?.mode === "one" ? req.branchScope.branchId : null,
      isHq: true,
      limit: req.query.limit,
      skip: req.query.skip,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

/** Mount helpers — used from routes/analytics.js */
export { requireRoles, requirePermission };
