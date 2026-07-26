import {
  createTransferRequest,
  listTransferRequests,
  updateTransferStatus,
  getTransferDashboardCounts,
} from "../services/stockTransferService.js";
import {
  getProductAvailabilityAcrossBranches,
  getBranchDashboardStats,
  listActiveBranches,
} from "../services/multiBranchInventoryService.js";
import { searchInventoryByType } from "../services/inventorySearchService.js";

function tenant(req) {
  return {
    userId: req.user?.sub || null,
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
    role: req.user?.role,
  };
}

export async function listBranchesController(_req, res, next) {
  try {
    const branches = await listActiveBranches();
    res.json(
      branches.map((b) => ({
        id: b._id?.toString(),
        branchId: b.branchId || b.code?.toLowerCase() || "",
        branchName: b.branchName || b.name,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
        managerName: b.managerName,
        city: b.city,
        active: b.active,
      })),
    );
  } catch (e) {
    next(e);
  }
}

export async function searchGlobalController(req, res, next) {
  try {
    const type = String(req.query.inventoryType || req.query.type || "").trim();
    if (!type) {
      return res.status(400).json({
        error: "inventoryType required. Use battery, inverter, car-battery, bike-battery, or combo.",
      });
    }
    const t = tenant(req);
    const filters = { ...req.query, currentBranchId: req.query.currentBranchId || t.branchId };
    const data = await searchInventoryByType(type, filters);
    res.json(data);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
}

export async function multiBranchStockController(req, res, next) {
  return searchGlobalController(req, res, next);
}

export async function productAvailabilityController(req, res, next) {
  try {
    const t = tenant(req);
    const data = await getProductAvailabilityAcrossBranches(req.params.productId, {
      currentBranchId: t.branchId,
    });
    if (!data) return res.status(404).json({ error: "Product not found" });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function branchDashboardController(req, res, next) {
  try {
    const t = tenant(req);
    const branchId = req.query.branchId || t.branchId;
    const [stats, transfers] = await Promise.all([
      getBranchDashboardStats(branchId),
      getTransferDashboardCounts(branchId),
    ]);
    res.json({ ...stats, transfers, branchId });
  } catch (e) {
    next(e);
  }
}

export async function listTransfersController(req, res, next) {
  try {
    const t = tenant(req);
    const rows = await listTransferRequests({
      branchId: t.branchId,
      isSuperAdmin: t.isSuperAdmin,
      direction: req.query.direction || "all",
      status: req.query.status,
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createTransferController(req, res, next) {
  try {
    const t = tenant(req);
    const row = await createTransferRequest(req.body, t);
    res.status(201).json(row);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
}

export async function transferActionController(req, res, next) {
  try {
    const t = tenant(req);
    const row = await updateTransferStatus(req.params.id, req.body.action, {
      ...t,
      rejectionReason: req.body.rejectionReason,
    });
    res.json(row);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
}
