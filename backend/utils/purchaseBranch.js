import Branch from "../models/Branch.js";
import mongoose from "mongoose";
import { resolvePurchaseBranchId, tenantFromReq } from "./tenant.js";

function requestedBranchFromReq(req) {
  return req.body?.branchId || req.query?.branchId || null;
}

export async function assertActivePurchaseBranch(branchId) {
  if (!branchId) {
    const err = new Error("Select the branch for this purchase before uploading the bill.");
    err.status = 400;
    throw err;
  }
  if (!mongoose.Types.ObjectId.isValid(String(branchId))) {
    const err = new Error("Selected branch is invalid.");
    err.status = 400;
    throw err;
  }
  const branch = await Branch.findById(branchId).lean();
  if (!branch) {
    const err = new Error("Selected branch is invalid.");
    err.status = 400;
    throw err;
  }
  if (branch.active === false || branch.status === "inactive") {
    const err = new Error("Selected branch is inactive. Contact an administrator.");
    err.status = 400;
    throw err;
  }
  return branch;
}

/**
 * Tenant for creating/confirming a purchase bill — never "All Branches".
 * Prefer an explicit request branchId, then the existing bill's branch (confirm/retry/save).
 * Do not silently replace a bill's branch with the dashboard filter.
 * @param {{ fallbackBranchId?: string }} [opts]
 */
export async function purchaseWriteTenant(req, { fallbackBranchId } = {}) {
  const base = tenantFromReq(req);
  const t = {
    ...base,
    allBranches: false,
  };
  const requested = requestedBranchFromReq(req) || fallbackBranchId || null;
  const branchId = resolvePurchaseBranchId(req, requested);
  await assertActivePurchaseBranch(branchId);
  return { ...t, branchId };
}
