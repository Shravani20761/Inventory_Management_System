import Quotation from "../models/Quotation.js";
import { generateQuotation, listQuotations, deleteAllQuotations } from "../services/quotationService.js";
import { previewQuotationByKind } from "../services/multiCategoryQuotationService.js";
import {
  updateQuotationDraft,
  generateFinalQuotationDocument,
  sendFinalQuotationWhatsApp,
  approveAndSendFinalQuotationWhatsApp,
  setQuotationStatus,
} from "../services/salesDocumentService.js";
import mongoose from "mongoose";

function tenant(req) {
  return {
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
    userName: req.user?.email || req.user?.name || "",
  };
}

function branchFilter(req) {
  const { branchId, isSuperAdmin } = tenant(req);
  if (isSuperAdmin || !branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

export async function listQuotationsController(req, res, next) {
  try {
    res.json(await listQuotations(tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function previewQuotationOptionsController(req, res, next) {
  try {
    const body = { ...(req.body ?? {}) };
    const kind = body.quotationKind ?? body.kind;
    delete body.quotationKind;
    delete body.kind;
    res.json(await previewQuotationByKind(kind, body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function deleteAllQuotationsController(req, res, next) {
  try {
    res.json(await deleteAllQuotations(tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function getQuotationController(req, res, next) {
  try {
    const bf = branchFilter(req);
    let doc = await Quotation.findOne({ _id: req.params.id, ...bf }).lean();
    if (!doc) {
      doc = await Quotation.findOne({ quoteKey: req.params.id, ...bf }).lean();
    }
    if (!doc) {
      doc = await Quotation.findOne({ externalId: req.params.id, ...bf }).lean();
    }
    if (!doc) return res.status(404).json({ error: "Quotation not found" });
    res.json({ ...doc, id: doc.externalId || doc.quoteKey || doc._id.toString() });
  } catch (err) {
    next(err);
  }
}

export async function generateQuotationController(req, res, next) {
  try {
    res.status(201).json(await generateQuotation(req.body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function updateQuotationController(req, res, next) {
  try {
    res.json(await updateQuotationDraft(req.params.id, req.body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function generateQuotationPdfController(req, res, next) {
  try {
    res.json(await generateFinalQuotationDocument(req.params.id, tenant(req), req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function sendQuotationWhatsAppController(req, res, next) {
  try {
    res.json(await sendFinalQuotationWhatsApp(req.params.id, tenant(req), req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function approveAndSendQuotationWhatsAppController(req, res, next) {
  try {
    res.json(await approveAndSendFinalQuotationWhatsApp(req.params.id, tenant(req), req.body || {}));
  } catch (err) {
    next(err);
  }
}

export async function setQuotationStatusController(req, res, next) {
  try {
    const { status } = req.body;
    res.json(await setQuotationStatus(req.params.id, status, tenant(req)));
  } catch (err) {
    next(err);
  }
}
