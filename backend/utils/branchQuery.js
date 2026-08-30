import mongoose from "mongoose";

/**
 * Tenant filter for lists.
 * @param {string|null} branchId
 * @param {boolean} isSuperAdmin — when true and no branchId, no filter (all branches)
 * @param {{ strict?: boolean }} [opts] — strict=true excludes null/unassigned legacy rows
 */
export function branchQuery(branchId, isSuperAdmin, { strict = false } = {}) {
  if (isSuperAdmin && !branchId) return {};
  if (!branchId) {
    if (isSuperAdmin) return {};
    return { branchId: { $exists: false } }; // no branch → no rows for non-HQ
  }
  const bid = new mongoose.Types.ObjectId(branchId);
  if (strict) return { branchId: bid };
  // Soft isolation: include unassigned legacy rows only when reading own branch (migration).
  return { $or: [{ branchId: bid }, { branchId: null }, { branchId: { $exists: false } }] };
}
