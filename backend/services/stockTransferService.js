import mongoose from "mongoose";
import StockTransferRequest, { TRANSFER_STATUSES, APPROVABLE_STATUSES } from "../models/StockTransferRequest.js";
import Branch from "../models/Branch.js";
import {
  ALL_INVENTORY_MODELS,
  transferStockBetweenBranches,
  mapLeanToLegacyProduct,
  homeBackupBatteryCatalogToLegacy,
  MODEL_TO_CATEGORY,
  CATEGORY,
} from "./categoryInventoryService.js";
import HomeBackupBatteryInventory from "../models/inventory/HomeBackupBatteryInventory.js";

/** Structured audit log for the transfer lifecycle. */
function logTransfer(event, doc, extra = {}) {
  const base = {
    requestId: doc?.requestId,
    status: doc?.status,
    from: String(doc?.fromBranch ?? ""),
    to: String(doc?.toBranch ?? ""),
    product: `${doc?.brand ?? ""} ${doc?.model ?? ""}`.trim(),
    qty: doc?.quantity,
  };
  console.log(`[stock-transfer] ${event}`, { ...base, ...extra });
}

async function nextRequestId() {
  const last = await StockTransferRequest.findOne().sort({ createdAt: -1 }).lean();
  const n = last?.requestId?.match(/(\d+)/)?.[1];
  const seq = n ? Number(n) + 1 : 1;
  return `TR-${String(seq).padStart(4, "0")}`;
}

function branchName(b) {
  return b?.branchName || b?.name || b?.code || "Branch";
}

function serializeTransfer(doc, branchesById = new Map()) {
  if (!doc) return null;
  const from = branchesById.get(String(doc.fromBranch)) || doc.fromBranch;
  const to = branchesById.get(String(doc.toBranch)) || doc.toBranch;
  return {
    ...doc,
    id: doc._id?.toString(),
    fromBranchName: typeof from === "object" ? branchName(from) : String(from),
    toBranchName: typeof to === "object" ? branchName(to) : String(to),
  };
}

async function loadBranchesMap() {
  const branches = await Branch.find().lean();
  return new Map(branches.map((b) => [String(b._id), b]));
}

export async function createTransferRequest(payload, { userId, userBranchId, isSuperAdmin = false } = {}) {
  const quantity = Math.max(1, Number(payload.quantity) || 0);
  const inventoryDocId = payload.inventoryDocId || payload.productId;
  if (!inventoryDocId) {
    const err = new Error("productId / inventoryDocId is required");
    err.status = 400;
    throw err;
  }

  const fromBranchId = payload.fromBranch || payload.fromBranchId;
  const toBranchId = payload.toBranch || payload.toBranchId || userBranchId;
  if (!fromBranchId || !toBranchId) {
    const err = new Error("fromBranch and toBranch are required");
    err.status = 400;
    throw err;
  }
  if (String(fromBranchId) === String(toBranchId)) {
    const err = new Error("Cannot transfer to the same branch");
    err.status = 400;
    throw err;
  }

  if (!isSuperAdmin && userBranchId && String(toBranchId) !== String(userBranchId)) {
    const err = new Error("You can only request transfers to your own branch");
    err.status = 403;
    throw err;
  }

  let found = null;
  const fromBid = new mongoose.Types.ObjectId(fromBranchId);
  for (const Model of ALL_INVENTORY_MODELS) {
    const lean = await Model.findOne({ _id: inventoryDocId, branchId: fromBid }).lean();
    if (lean) {
      found = { Model, lean, categoryKey: MODEL_TO_CATEGORY.get(Model) ?? CATEGORY.CAR };
      break;
    }
  }
  if (!found) {
    const err = new Error("Product not found at the source branch");
    err.status = 404;
    throw err;
  }
  if (Number(found.lean.quantity ?? 0) < quantity) {
    const err = new Error(`Source branch has only ${found.lean.quantity ?? 0} units available`);
    err.status = 400;
    throw err;
  }

  const legacy =
    found.Model === HomeBackupBatteryInventory
      ? homeBackupBatteryCatalogToLegacy(found.lean)
      : mapLeanToLegacyProduct(found.categoryKey, found.lean);

  const doc = await StockTransferRequest.create({
    requestId: await nextRequestId(),
    productId: String(found.lean._id),
    inventoryDocId: found.lean._id,
    productType: payload.productType || legacy.type || found.categoryKey,
    brand: payload.brand || legacy.brand || "",
    model: payload.model || legacy.modelName || legacy.model || "",
    quantity,
    fromBranch: new mongoose.Types.ObjectId(fromBranchId),
    toBranch: new mongoose.Types.ObjectId(toBranchId),
    status: "Pending",
    requestedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
    notes: String(payload.notes || "").trim(),
  });

  logTransfer("Request Created", doc, { requestedBy: String(userId ?? "") });

  const branches = await loadBranchesMap();
  return serializeTransfer(doc.toObject(), branches);
}

export async function listTransferRequests({ branchId, isSuperAdmin = false, direction = "all", status } = {}) {
  const q = {};
  if (status && TRANSFER_STATUSES.includes(status)) q.status = status;
  if (!isSuperAdmin && branchId) {
    const bid = new mongoose.Types.ObjectId(branchId);
    if (direction === "incoming") q.toBranch = bid;
    else if (direction === "outgoing") q.fromBranch = bid;
    else q.$or = [{ fromBranch: bid }, { toBranch: bid }];
  }
  const docs = await StockTransferRequest.find(q).sort({ createdAt: -1 }).limit(200).lean();
  const branches = await loadBranchesMap();
  return docs.map((d) => serializeTransfer(d, branches));
}

export async function updateTransferStatus(requestId, action, { userId, isSuperAdmin = false, userBranchId, rejectionReason } = {}) {
  const doc = await StockTransferRequest.findOne({
    $or: [{ requestId }, mongoose.Types.ObjectId.isValid(requestId) ? { _id: requestId } : { requestId: "__none__" }],
  });
  if (!doc) {
    const err = new Error("Transfer request not found");
    err.status = 404;
    throw err;
  }

  const fromId = String(doc.fromBranch);
  if (!isSuperAdmin && userBranchId && fromId !== String(userBranchId)) {
    const err = new Error("Only the source branch can approve or reject outgoing transfers");
    err.status = 403;
    throw err;
  }

  if (action === "approve") {
    // Only freshly raised requests can be approved. Approval does NOT move stock;
    // inventory moves only when the destination branch marks the goods received.
    if (!APPROVABLE_STATUSES.includes(doc.status)) {
      const err = new Error(`Cannot approve request in status ${doc.status}`);
      err.status = 400;
      throw err;
    }
    doc.status = "Approved";
    doc.approvedBy = userId ? new mongoose.Types.ObjectId(userId) : null;
    await doc.save();
    logTransfer("Approved", doc, { approvedBy: String(userId ?? "") });
  } else if (action === "reject") {
    if (!APPROVABLE_STATUSES.includes(doc.status)) {
      const err = new Error(`Cannot reject request in status ${doc.status}`);
      err.status = 400;
      throw err;
    }
    doc.status = "Rejected";
    doc.rejectionReason = String(rejectionReason || "").trim();
    doc.approvedBy = userId ? new mongoose.Types.ObjectId(userId) : null;
    await doc.save();
    logTransfer("Rejected", doc, { reason: doc.rejectionReason });
  } else if (action === "dispatch") {
    if (doc.status !== "Approved") {
      const err = new Error(`Only approved transfers can be dispatched (current status: ${doc.status})`);
      err.status = 400;
      throw err;
    }
    doc.status = "In Transit";
    doc.dispatchDate = new Date();
    await doc.save();
    logTransfer("Dispatched", doc, { dispatchDate: doc.dispatchDate });
  } else if (action === "receive") {
    if (doc.status !== "In Transit") {
      const err = new Error(`Only in-transit transfers can be received (current status: ${doc.status})`);
      err.status = 400;
      throw err;
    }
    if (!isSuperAdmin && userBranchId && String(doc.toBranch) !== String(userBranchId)) {
      const err = new Error("Only the destination branch can mark received");
      err.status = 403;
      throw err;
    }
    // Inventory movement happens here — and only here — guarded so it runs exactly once.
    if (!doc.inventoryMoved) {
      await transferStockBetweenBranches({
        inventoryDocId: doc.inventoryDocId,
        quantity: doc.quantity,
        fromBranchId: doc.fromBranch,
        toBranchId: doc.toBranch,
      });
      doc.inventoryMoved = true;
    }
    doc.status = "Received";
    doc.receivedDate = new Date();
    await doc.save();
    logTransfer("Received", doc, { receivedDate: doc.receivedDate, inventoryMoved: doc.inventoryMoved });
  } else if (action === "complete") {
    if (doc.status !== "Received") {
      const err = new Error(`Only received transfers can be completed (current status: ${doc.status})`);
      err.status = 400;
      throw err;
    }
    doc.status = "Completed";
    doc.completedDate = new Date();
    await doc.save();
    logTransfer("Completed", doc, { completedDate: doc.completedDate });
  } else {
    const err = new Error("Unknown action");
    err.status = 400;
    throw err;
  }

  const branches = await loadBranchesMap();
  return serializeTransfer(doc.toObject(), branches);
}

export async function getTransferDashboardCounts(branchId) {
  if (!branchId) return { pendingIncoming: 0, pendingOutgoing: 0, approvedIncoming: 0, inTransit: 0 };
  const bid = new mongoose.Types.ObjectId(branchId);
  const [pendingIncoming, pendingOutgoing, approvedIncoming, inTransit] = await Promise.all([
    StockTransferRequest.countDocuments({ toBranch: bid, status: { $in: APPROVABLE_STATUSES } }),
    StockTransferRequest.countDocuments({ fromBranch: bid, status: { $in: APPROVABLE_STATUSES } }),
    StockTransferRequest.countDocuments({ toBranch: bid, status: { $in: ["Approved", "In Transit"] } }),
    StockTransferRequest.countDocuments({ $or: [{ fromBranch: bid }, { toBranch: bid }], status: "In Transit" }),
  ]);
  return { pendingIncoming, pendingOutgoing, approvedIncoming, inTransit };
}
