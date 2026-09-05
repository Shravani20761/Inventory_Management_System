import {
  listPurchaseBills,
  getPurchaseBill,
  createAndProcessPurchaseBill,
  retryPurchaseBillOcr,
  createManualPurchaseBill,
  savePurchaseBillReview,
  confirmPurchaseBill,
  findDuplicateBills,
} from "../services/purchaseBillService.js";
import { tenantFromReq } from "../utils/tenant.js";
import { purchaseWriteTenant } from "../utils/purchaseBranch.js";
import PurchaseBill from "../models/PurchaseBill.js";

function readTenant(req) {
  return tenantFromReq(req);
}

async function writeTenantForBill(req, billId) {
  const peek = billId ? await PurchaseBill.findById(billId).select("branchId").lean() : null;
  return purchaseWriteTenant(req, { fallbackBranchId: peek?.branchId });
}

export async function listPurchaseBillsController(req, res, next) {
  try {
    res.json(await listPurchaseBills({ status: req.query.status, q: req.query.q }, readTenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function getPurchaseBillController(req, res, next) {
  try {
    const bill = await getPurchaseBill(req.params.id, readTenant(req));
    if (!bill) return res.status(404).json({ error: "Not found" });
    res.json(bill);
  } catch (e) {
    next(e);
  }
}

export async function uploadPurchaseBillController(req, res, next) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "No file uploaded" });
    const tenant = await purchaseWriteTenant(req);
    const file = {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      user: req.user,
    };
    const bill = await createAndProcessPurchaseBill(file, tenant, { wait: false });
    res.status(201).json(bill);
  } catch (e) {
    next(e);
  }
}

export async function retryOcrController(req, res, next) {
  try {
    const bill = await retryPurchaseBillOcr(
      req.params.id,
      { buffer: req.file?.buffer, mimetype: req.file?.mimetype },
      await writeTenantForBill(req, req.params.id),
      req.user,
    );
    if (!bill) return res.status(404).json({ error: "Not found" });
    res.json(bill);
  } catch (e) {
    next(e);
  }
}

export async function manualBillController(req, res, next) {
  try {
    const bill = await createManualPurchaseBill(req.body || {}, await purchaseWriteTenant(req), req.user);
    res.status(201).json(bill);
  } catch (e) {
    next(e);
  }
}

export async function saveReviewController(req, res, next) {
  try {
    const bill = await savePurchaseBillReview(req.params.id, req.body || {}, await writeTenantForBill(req, req.params.id), req.user);
    if (!bill) return res.status(404).json({ error: "Not found" });
    res.json(bill);
  } catch (e) {
    next(e);
  }
}

export async function confirmBillController(req, res, next) {
  try {
    const result = await confirmPurchaseBill(
      req.params.id,
      { force: req.body?.force === true },
      await writeTenantForBill(req, req.params.id),
      req.user,
    );
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (e) {
    if (e.status === 409) {
      return res.status(409).json({
        error: e.message,
        duplicate: true,
        existing: e.duplicates || [],
      });
    }
    next(e);
  }
}

export async function duplicateCheckController(req, res, next) {
  try {
    const existing = await findDuplicateBills(req.body || {}, readTenant(req), req.body?.excludeId);
    res.json({ duplicate: existing.length > 0, existing: existing });
  } catch (e) {
    next(e);
  }
}
