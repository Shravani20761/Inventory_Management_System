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

function tenant(req) {
  let branchId = req.user?.branchId || null;
  if (branchId && typeof branchId === "object") {
    branchId = branchId._id?.toString?.() ?? branchId.toString?.() ?? null;
  }
  return { branchId, isSuperAdmin: req.user?.role === "superAdmin" };
}

export async function listPurchaseBillsController(req, res, next) {
  try {
    res.json(await listPurchaseBills({ status: req.query.status, q: req.query.q }, tenant(req)));
  } catch (e) {
    next(e);
  }
}

export async function getPurchaseBillController(req, res, next) {
  try {
    const bill = await getPurchaseBill(req.params.id, tenant(req));
    if (!bill) return res.status(404).json({ error: "Not found" });
    res.json(bill);
  } catch (e) {
    next(e);
  }
}

export async function uploadPurchaseBillController(req, res, next) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "No file uploaded" });
    const bill = await createAndProcessPurchaseBill(
      {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalName: req.file.originalname,
        user: req.user,
      },
      tenant(req),
    );
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
      tenant(req),
    );
    if (!bill) return res.status(404).json({ error: "Not found" });
    res.json(bill);
  } catch (e) {
    next(e);
  }
}

export async function manualBillController(req, res, next) {
  try {
    const bill = await createManualPurchaseBill(req.body || {}, tenant(req), req.user);
    res.status(201).json(bill);
  } catch (e) {
    next(e);
  }
}

export async function saveReviewController(req, res, next) {
  try {
    const bill = await savePurchaseBillReview(req.params.id, req.body || {}, tenant(req));
    if (!bill) return res.status(404).json({ error: "Not found" });
    res.json(bill);
  } catch (e) {
    next(e);
  }
}

export async function confirmBillController(req, res, next) {
  try {
    const result = await confirmPurchaseBill(req.params.id, { force: req.body?.force === true }, tenant(req), req.user);
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
    const existing = await findDuplicateBills(req.body || {}, tenant(req), req.body?.excludeId);
    res.json({ duplicate: existing.length > 0, existing });
  } catch (e) {
    next(e);
  }
}
