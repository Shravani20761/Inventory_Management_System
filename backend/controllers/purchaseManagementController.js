import {
  listPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  recordPurchasePayment,
  updateChequeStatus,
  getPurchaseDashboardStats,
  getVendorLedger,
  getOutstandingReport,
  getMonthlyPurchaseReport,
} from "../services/purchaseManagementService.js";
import { runPurchaseReminderJob } from "../services/purchaseReminderService.js";

function tenant(req) {
  let branchId = req.user?.branchId || null;
  if (branchId && typeof branchId === "object") {
    branchId = branchId._id?.toString?.() ?? branchId.toString?.() ?? null;
  }
  return { branchId, isSuperAdmin: req.user?.role === "superAdmin" };
}

export async function listPurchaseOrdersController(req, res, next) {
  try {
    const filters = {
      vendor: req.query.vendor,
      branchName: req.query.branchName,
      productType: req.query.productType,
      paymentStatus: req.query.paymentStatus,
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };
    res.json(await listPurchaseOrders(filters, tenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function getPurchaseOrderController(req, res, next) {
  try {
    const doc = await getPurchaseOrderById(req.params.id, tenant(req));
    if (!doc) return res.status(404).json({ error: "Purchase order not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function createPurchaseOrderController(req, res, next) {
  try {
    const created = await createPurchaseOrder(req.body, tenant(req));
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

export async function recordPaymentController(req, res, next) {
  try {
    const result = await recordPurchasePayment(req.params.id, req.body, tenant(req));
    if (!result) return res.status(404).json({ error: "Purchase order not found" });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function updateChequeStatusController(req, res, next) {
  try {
    const updated = await updateChequeStatus(
      req.params.id,
      req.params.chequeId,
      req.body.status,
      tenant(req),
    );
    if (!updated) return res.status(404).json({ error: "Purchase order not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

export async function purchaseDashboardController(req, res, next) {
  try {
    res.json(await getPurchaseDashboardStats(tenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function vendorLedgerController(req, res, next) {
  try {
    const vendor = req.params.vendorName || req.query.vendor;
    if (!vendor) return res.status(400).json({ error: "vendor name required" });
    res.json(await getVendorLedger(vendor, tenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function outstandingReportController(req, res, next) {
  try {
    res.json(await getOutstandingReport(tenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function monthlyPurchaseReportController(req, res, next) {
  try {
    res.json(await getMonthlyPurchaseReport(req.query.month, tenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function runRemindersController(req, res, next) {
  try {
    const summary = await runPurchaseReminderJob({ dryRun: req.query.dryRun === "true" });
    res.json(summary);
  } catch (e) {
    next(e);
  }
}
