import mongoose from "mongoose";

/**
 * Tenant filter: superAdmin sees all; branch users see their branch plus unassigned legacy rows.
 */
export function branchQuery(branchId, isSuperAdmin) {
  if (isSuperAdmin || !branchId) return {};
  const bid = new mongoose.Types.ObjectId(branchId);
  return { $or: [{ branchId: bid }, { branchId: null }, { branchId: { $exists: false } }] };
}
