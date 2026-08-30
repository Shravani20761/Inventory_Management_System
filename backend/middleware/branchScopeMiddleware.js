import { resolveBranchScope } from "../services/branchScopeService.js";

/**
 * Attach req.branchScope after requireAuth.
 * Managers cannot escape their JWT branchId via query/body/header.
 */
export async function attachBranchScope(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    req.branchScope = await resolveBranchScope(req);
    next();
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Branch scope error" });
  }
}
