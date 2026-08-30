import AuditLog from "../models/AuditLog.js";
import mongoose from "mongoose";

/**
 * Fire-and-forget audit write — never throws to callers.
 */
export async function recordAudit({
  userId = null,
  role = "",
  branchId = null,
  action,
  entity = "",
  entityId = "",
  metadata = {},
  ip = "",
} = {}) {
  try {
    if (!action) return null;
    const bid =
      branchId && mongoose.Types.ObjectId.isValid(String(branchId))
        ? new mongoose.Types.ObjectId(String(branchId))
        : null;
    const uid =
      userId && mongoose.Types.ObjectId.isValid(String(userId))
        ? new mongoose.Types.ObjectId(String(userId))
        : null;
    return await AuditLog.create({
      userId: uid,
      role: String(role || ""),
      branchId: bid,
      action: String(action),
      entity: String(entity || ""),
      entityId: String(entityId || ""),
      metadata: metadata || {},
      ip: String(ip || ""),
    });
  } catch (e) {
    console.warn("[audit]", e.message);
    return null;
  }
}

export async function listAuditLogs({ branchId = null, isHq = false, limit = 100, skip = 0 } = {}) {
  const q = {};
  if (!isHq && branchId) q.branchId = new mongoose.Types.ObjectId(String(branchId));
  const rows = await AuditLog.find(q)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.min(Number(limit) || 100, 500))
    .populate("userId", "name email role")
    .populate("branchId", "name code businessName")
    .lean();
  return rows.map((r) => ({ ...r, id: r._id.toString() }));
}
