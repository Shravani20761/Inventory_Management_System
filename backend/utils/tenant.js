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

function concreteBranchId(value) {
  const s = value == null ? "" : String(value).trim();
  if (!s || s.toLowerCase() === "all") return null;
  return s;
}

/**
 * Purchase writes must belong to exactly one branch.
 * Dashboard "All Branches" (X-Branch-Id: all) is never a purchase branch.
 * Manager/Staff always use JWT/scope branchId; a different client branchId is rejected.
 */
export function resolvePurchaseBranchId(req, requestedRaw) {
  const requested = concreteBranchId(requestedRaw);
  const scope = req.branchScope;
  const isHq = Boolean(scope?.isHq || req.user?.role === "superAdmin");

  if (!isHq) {
    const assigned = concreteBranchId(scope?.branchId || req.user?.branchId);
    if (!assigned) {
      const err = new Error("Your account is not assigned to a branch. Please contact an administrator.");
      err.status = 400;
      throw err;
    }
    if (requested && requested !== assigned) {
      const err = new Error("Forbidden: you cannot create purchases for another branch.");
      err.status = 403;
      throw err;
    }
    return assigned;
  }

  const header = concreteBranchId(req.headers?.["x-branch-id"] || req.headers?.["x-act-as-branch"]);
  const scoped = scope?.mode === "one" ? concreteBranchId(scope.branchId) : null;
  const pick = requested || header || scoped;
  if (!pick) {
    const err = new Error("Select the branch for this purchase before uploading the bill.");
    err.status = 400;
    throw err;
  }
  return pick;
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
