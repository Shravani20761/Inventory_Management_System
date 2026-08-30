import mongoose from "mongoose";
import Branch from "../models/Branch.js";
import { isHqRole } from "../constants/roles.js";

function oid(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function headerBranchId(req) {
  const raw =
    req.headers["x-branch-id"] ||
    req.headers["x-act-as-branch"] ||
    req.query?.branchId ||
    req.body?.actAsBranchId ||
    null;
  if (raw == null || raw === "" || raw === "all" || raw === "ALL") return raw === "all" || raw === "ALL" ? "all" : null;
  return String(raw).trim();
}

/**
 * Resolve authorized branch scope for the current request.
 * NEVER trust client branchId for non-HQ users.
 *
 * @returns {{
 *   isHq: boolean,
 *   mode: 'all'|'one',
 *   branchId: string|null,
 *   branchObjectId: import('mongoose').Types.ObjectId|null,
 *   branchIds: string[],
 *   isSuperAdmin: boolean,
 * }}
 */
export async function resolveBranchScope(req) {
  const role = req.user?.role || "";
  const isHq = isHqRole(role);
  const isSuperAdmin = role === "superAdmin";
  const userBranchId = req.user?.branchId ? String(req.user.branchId) : null;

  if (!isHq) {
    if (!userBranchId) {
      // No assigned branch → empty scope (no leakage). Cannot select another branch.
      return {
        isHq: false,
        mode: "one",
        branchId: null,
        branchObjectId: null,
        branchIds: [],
        isSuperAdmin: false,
      };
    }
    // Ignore any client-supplied other branch — force JWT branch.
    return {
      isHq: false,
      mode: "one",
      branchId: userBranchId,
      branchObjectId: oid(userBranchId),
      branchIds: [userBranchId],
      isSuperAdmin: false,
    };
  }

  // HQ / Admin: optional act-as / filter
  const requested = headerBranchId(req);
  if (!requested || requested === "all") {
    return {
      isHq: true,
      mode: "all",
      branchId: null,
      branchObjectId: null,
      branchIds: [],
      isSuperAdmin,
    };
  }

  const bid = oid(requested);
  if (!bid) {
    const err = new Error("Invalid branchId");
    err.status = 400;
    throw err;
  }
  const exists = await Branch.findById(bid).select("_id").lean();
  if (!exists) {
    const err = new Error("Branch not found");
    err.status = 404;
    throw err;
  }
  return {
    isHq: true,
    mode: "one",
    branchId: bid.toString(),
    branchObjectId: bid,
    branchIds: [bid.toString()],
    isSuperAdmin,
  };
}

/**
 * Mongo filter for branch-scoped lists.
 * @param {{ mode: string, branchObjectId: any, isHq: boolean }} scope
 * @param {{ includeUnassigned?: boolean }} [opts] — only for migration/legacy reads
 */
export function mongoBranchFilter(scope, { includeUnassigned = false } = {}) {
  if (!scope || scope.mode === "all") return {};
  const bid = scope.branchObjectId;
  if (!bid) return { branchId: { $exists: false } }; // impossible match
  if (includeUnassigned) {
    return { $or: [{ branchId: bid }, { branchId: null }, { branchId: { $exists: false } }] };
  }
  return { branchId: bid };
}

/** Assert a document's branchId is allowed for this user. */
export function assertBranchAccess(scope, docBranchId) {
  if (!scope || scope.mode === "all") return true;
  const allowed = scope.branchId;
  const got = docBranchId != null ? String(docBranchId) : null;
  if (got && allowed && got === allowed) return true;
  const err = new Error("Forbidden: branch access denied");
  err.status = 403;
  throw err;
}

/** Effective write branchId — managers forced to their branch; HQ may pick. */
export function resolveWriteBranchId(scope, requestedBranchId) {
  if (!scope.isHq) return scope.branchId;
  if (scope.mode === "one") return scope.branchId;
  if (requestedBranchId && requestedBranchId !== "all") return String(requestedBranchId);
  return null;
}

export async function getBranchLean(branchId) {
  if (!branchId) return null;
  return Branch.findById(branchId).lean();
}

/**
 * Attach company branding from Branch onto a document for PDF/WhatsApp.
 */
export async function enrichDocCompany(doc) {
  if (!doc || typeof doc !== "object") return doc;
  if (doc.company?.name) return doc;
  const branch = await getBranchLean(doc.branchId);
  doc.company = companyFromBranch(branch);
  return doc;
}

/**
 * Company block for PDFs / WhatsApp from Branch entity (not hard-coded BatteryMela).
 */
export function companyFromBranch(branch, fallback = {}) {
  if (!branch) {
    return {
      name: fallback.name || process.env.BATTERYMELA_NAME || "BatteryMela",
      tagline: fallback.tagline || process.env.BATTERYMELA_TAGLINE || "Reliable Power • Trusted Solutions",
      gstin: fallback.gstin || process.env.BATTERYMELA_GSTIN || "",
      phone: fallback.phone || process.env.BATTERYMELA_PHONE || "",
      email: fallback.email || process.env.BATTERYMELA_EMAIL || "",
      address: fallback.address || process.env.BATTERYMELA_ADDRESS || "",
      branchName: "",
      branchCode: "",
    };
  }
  return {
    name: branch.businessName || branch.name || "BatteryMela",
    tagline: process.env.BATTERYMELA_TAGLINE || "Reliable Power • Trusted Solutions",
    gstin: branch.gstin || "",
    phone: branch.phone || "",
    email: branch.email || "",
    address: [branch.address, branch.city].filter(Boolean).join(", "),
    branchName: branch.branchName || branch.name || "",
    branchCode: branch.code || branch.branchId || "",
  };
}
