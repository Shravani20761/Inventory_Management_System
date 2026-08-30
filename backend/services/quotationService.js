import Quotation from "../models/Quotation.js";
import { saveRecommendationSheet } from "./salesDocumentService.js";
import mongoose from "mongoose";

export { buildRequirementsFromPayload } from "../utils/quotationPayloadUtils.js";

export async function listQuotations({ branchId = null, isSuperAdmin = false, allBranches = false } = {}) {
  const q = { documentStage: { $in: ["final", "converted", "legacy", null] } };
  if (isSuperAdmin && (allBranches || !branchId)) {
    // HQ all-branches: no filter
  } else if (branchId) {
    const bid = new mongoose.Types.ObjectId(branchId);
    if (isSuperAdmin) {
      q.branchId = bid;
    } else {
      q.$or = [{ branchId: bid }, { branchId: null }, { branchId: { $exists: false } }];
    }
  }
  const docs = await Quotation.find(q).sort({ createdAt: -1 }).lean();

  const rank = (d) => {
    let r = new Date(d.createdAt || 0).getTime();
    if (Array.isArray(d.options) && d.options.length) r += 1e12;
    if (d.quoteKey && !/-[A-Z]$/.test(String(d.quoteKey))) r += 1e11;
    return r;
  };

  const bySheet = new Map();
  const noSheet = [];
  for (const d of docs) {
    const sid = d.recommendationSheetId ? String(d.recommendationSheetId) : "";
    if (!sid) {
      noSheet.push(d);
      continue;
    }
    const prev = bySheet.get(sid);
    if (!prev || rank(d) >= rank(prev)) bySheet.set(sid, d);
  }

  const merged = [...bySheet.values(), ...noSheet].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return merged.map((d) => ({
    ...d,
    id: d.externalId || d.quoteKey || d._id.toString(),
    documentStage: d.documentStage || "legacy",
  }));
}

export async function deleteAllQuotations({ branchId = null, isSuperAdmin = false } = {}) {
  const q = {};
  if (!isSuperAdmin && branchId) q.branchId = new mongoose.Types.ObjectId(branchId);
  const result = await Quotation.deleteMany(q);
  return { deleted: result.deletedCount ?? 0 };
}

/** Stage 1 — saves recommendation sheet + multi-option PDF. */
export async function generateQuotation(payload, tenant = {}) {
  return saveRecommendationSheet(payload, tenant);
}

export { renderQuotationHtml } from "./quotationTemplate.js";
