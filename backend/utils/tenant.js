/**
 * Resolve tenant context from req.branchScope (preferred) or JWT fallback.
 */
export function tenantFromReq(req) {
  const scope = req.branchScope;
  if (scope) {
    return {
      branchId: scope.mode === "one" ? scope.branchId : null,
      isSuperAdmin: Boolean(scope.isHq || scope.isSuperAdmin),
      allBranches: scope.mode === "all",
      userName: req.user?.email || req.user?.name || "",
      userId: req.user?.sub || null,
      role: req.user?.role || "",
      branchScope: scope,
    };
  }
  return {
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
    allBranches: req.user?.role === "superAdmin",
    userName: req.user?.email || req.user?.name || "",
    userId: req.user?.sub || null,
    role: req.user?.role || "",
    branchScope: null,
  };
}

/** Write target branch: managers forced; HQ must select via scope header. */
export function writeBranchIdFromReq(req, requested) {
  const scope = req.branchScope;
  if (!scope) return req.user?.branchId || requested || null;
  if (!scope.isHq) return scope.branchId;
  if (scope.mode === "one") return scope.branchId;
  if (requested && requested !== "all") return String(requested);
  return null;
}
