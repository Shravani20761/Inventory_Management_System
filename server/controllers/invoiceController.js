import Invoice from "../models/Invoice.js";
import { generateInvoice, listInvoices, prepareInvoiceFromQuotation } from "../services/invoiceService.js";
import mongoose from "mongoose";

function tenant(req) {
  return {
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
  };
}

function branchFilter(req) {
  const { branchId, isSuperAdmin } = tenant(req);
  if (isSuperAdmin || !branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

export async function listInvoicesController(req, res, next) {
  try {
    res.json(await listInvoices(tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function getInvoiceController(req, res, next) {
  try {
    const bf = branchFilter(req);
    let doc = await Invoice.findOne({ _id: req.params.id, ...bf }).lean();
    if (!doc) doc = await Invoice.findOne({ invoiceNumber: req.params.id, ...bf }).lean();
    if (!doc) doc = await Invoice.findOne({ externalId: req.params.id, ...bf }).lean();
    if (!doc) return res.status(404).json({ error: "Invoice not found" });
    res.json({ ...doc, id: doc.externalId || doc.invoiceNumber || doc._id.toString() });
  } catch (err) {
    next(err);
  }
}

export async function generateInvoiceController(req, res, next) {
  try {
    res.status(201).json(await generateInvoice(req.body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function prepareInvoiceFromQuotationController(req, res, next) {
  try {
    const { quotation, selectedOption } = req.body;
    res.json(prepareInvoiceFromQuotation(quotation, selectedOption));
  } catch (err) {
    next(err);
  }
}

export async function updateInvoiceController(req, res, next) {
  try {
    const bf = branchFilter(req);
    const query = mongoose.isValidObjectId(req.params.id)
      ? { _id: req.params.id, ...bf }
      : { invoiceNumber: req.params.id, ...bf };
    const doc = await Invoice.findOne(query);
    if (!doc) return res.status(404).json({ error: "Invoice not found" });

    const { paymentStatus, status, paidAmount } = req.body;
    if (paymentStatus !== undefined) doc.paymentStatus = paymentStatus;
    if (status !== undefined) doc.status = status;
    if (paidAmount !== undefined) {
      doc.paidAmount = Number(paidAmount) || 0;
      doc.pendingAmount = Math.max(0, Number(doc.totalAmount || 0) - doc.paidAmount);
    }
    // Keep document status in sync with payment when marking fully paid.
    if (paymentStatus === "Paid") {
      doc.status = "Paid";
      doc.paidAmount = Number(doc.totalAmount || 0);
      doc.pendingAmount = 0;
    } else if (paymentStatus === "Partial") {
      doc.status = "Partially Paid";
    }

    await doc.save();
    const obj = doc.toObject();
    res.json({ ...obj, id: obj.externalId || obj.invoiceNumber || obj._id.toString() });
  } catch (err) {
    next(err);
  }
}
