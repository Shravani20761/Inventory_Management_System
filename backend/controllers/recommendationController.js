import {
  listRecommendationSheets,
  saveRecommendationSheet,
  createQuotationFromSheet,
  finalizeQuotation,
} from "../services/salesDocumentService.js";
import RecommendationSheet from "../models/RecommendationSheet.js";
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

export async function listRecommendationsController(req, res, next) {
  try {
    res.json(await listRecommendationSheets(tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function saveRecommendationController(req, res, next) {
  try {
    res.status(201).json(await saveRecommendationSheet(req.body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function getRecommendationController(req, res, next) {
  try {
    const bf = branchFilter(req);
    let doc = await RecommendationSheet.findOne({ _id: req.params.id, ...bf }).lean();
    if (!doc) doc = await RecommendationSheet.findOne({ sheetKey: req.params.id, ...bf }).lean();
    if (!doc) return res.status(404).json({ error: "Recommendation sheet not found" });
    res.json({ ...doc, id: doc.externalId || doc.sheetKey || doc._id.toString(), documentStage: "recommendation" });
  } catch (err) {
    next(err);
  }
}

export async function createQuotationFromSheetController(req, res, next) {
  try {
    res.status(201).json(await createQuotationFromSheet(req.body, tenant(req)));
  } catch (err) {
    next(err);
  }
}

export async function finalizeQuotationController(req, res, next) {
  try {
    const b = req.body || {};
    console.log("[finalize-quotation]", {
      hasRecommendationSheetId: Boolean(b.recommendationSheetId),
      sheetKey: b.sheetKey || null,
      selectedOptionLabel: b.selectedOptionLabel || b.selectedOption?.optionLabel || null,
      optionIndex: b.optionIndex ?? null,
      clientOptionId: b.clientOptionId || b.optionId || null,
      generatePdf: b.generatePdf !== false,
    });
    res.status(201).json(await finalizeQuotation(req.body, tenant(req)));
  } catch (err) {
    console.error("[finalize-quotation] failed", err?.message, err?.stack);
    next(err);
  }
}
