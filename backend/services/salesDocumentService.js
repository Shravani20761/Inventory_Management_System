import mongoose from "mongoose";
import RecommendationSheet from "../models/RecommendationSheet.js";
import Quotation from "../models/Quotation.js";
import Branch from "../models/Branch.js";
import { previewQuotationByKind } from "./multiCategoryQuotationService.js";
import { generateRecommendationPdf, generateFinalQuotationPdf } from "./pdfService.js";
import { sendQuotationWhatsApp, documentUrlIsWhatsAppReady } from "./whatsappService.js";
import { getQuotationPublicUrl, getExpiresAt } from "./quotationStorageService.js";
import { getCloudinaryConfigStatus, uploadQuotationPdfForWhatsApp } from "./cloudinaryService.js";
import { calculateInvoiceTotals, emptyAdditionalCharges } from "./invoiceConversionService.js";
import { normalizeQuotationKind } from "../constants/quotationKinds.js";
import { buildRequirementsFromPayload } from "../utils/quotationPayloadUtils.js";
import { resolveQuotationOptionForPdf } from "./finalQuotationTemplate.js";

async function nextSheetKey(kind) {
  const k = normalizeQuotationKind(kind);
  const prefix = `REC-${k.toUpperCase()}`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const n = await RecommendationSheet.countDocuments({ sheetKey: { $regex: new RegExp(`^${escaped}-\\d{4}$`) } });
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

async function nextQuoteKey() {
  // Year-based numbering (e.g. QT-2026-0008, QT-2026-0008-A, QT-2026-0008-B share stem 0008).
  const year = new Date().getFullYear();
  const prefix = `QT-${year}`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`^${escaped}-(\\d{4})(-[A-Z])?$`);
  const docs = await Quotation.find({ quoteKey: { $regex: rx } })
    .select("quoteKey")
    .lean();
  let max = 0;
  for (const d of docs) {
    const m = String(d.quoteKey || "").match(rx);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

async function findParentQuotationForRecommendationSheet(sheetId, tenant = {}) {
  if (!sheetId || !mongoose.Types.ObjectId.isValid(String(sheetId))) return null;
  const bid = tenant.branchId ? new mongoose.Types.ObjectId(tenant.branchId) : null;
  const base = { recommendationSheetId: sheetId, documentStage: { $in: ["final", "legacy", null] } };
  let doc;
  if (bid && !tenant.isSuperAdmin) {
    doc = await Quotation.findOne({ ...base, branchId: bid }).sort({ createdAt: -1 }).lean();
    if (!doc) doc = await Quotation.findOne({ ...base, branchId: null }).sort({ createdAt: -1 }).lean();
  } else {
    doc = await Quotation.findOne(base).sort({ createdAt: -1 }).lean();
  }
  if (doc && !tenant.isSuperAdmin && bid && doc.branchId != null && String(doc.branchId) !== String(bid)) {
    if (!tenantCanAccessQuotationForPdf(doc, tenant)) return null;
  }
  return doc;
}

function optionLetterFromIndex(idx) {
  const n = Number(idx);
  if (!Number.isFinite(n) || n < 0 || n > 25) return "A";
  return String.fromCharCode(65 + Math.floor(n));
}

function buildOptionSlot(option, optionIndexNum, pricing) {
  const id = optionLetterFromIndex(optionIndexNum ?? 0);
  let row;
  try {
    row = JSON.parse(JSON.stringify(option));
  } catch {
    row = { ...option };
  }
  const title = option.badge || option.optionLabel || option.type || `Option ${id}`;
  return {
    id,
    title,
    clientOptionId: String(option.optionId || "").slice(0, 64),
    optionIndex: optionIndexNum != null ? optionIndexNum : null,
    inverter: option.inverter ?? {},
    battery: option.battery ?? {},
    selectedRow: row,
    totalAmount: pricing.finalTotal,
    subtotal: pricing.subtotal,
    gstAmount: pricing.gstAmount,
    quotationPdfUrl: "",
    quotation_pdf_url: "",
    quotationPdfPath: "",
    quotationPublicUrl: "",
    quotationCloudinaryUrl: "",
    invoicePdfUrl: "",
    invoice_pdf_url: "",
    whatsappStatus: "",
    whatsappSent: false,
    sentAt: null,
    invoiceWhatsappStatus: "",
    invoiceWhatsappSent: false,
    invoiceSentAt: null,
    approved: false,
    status: "Pending",
    invoiceId: null,
    /** Pipeline: Generated (preview-only) → Quotation Created → … (see OPTION_WORKFLOW_STATUSES). */
    workflowStatus: "Quotation Created",
  };
}

function normalizeOptionLabelKey(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function optionLabelOnQuotationDoc(existing) {
  const sel = existing?.selectedOption;
  return normalizeOptionLabelKey(sel?.optionLabel || sel?.type || existing?.recommendedOptionLabel || "");
}

function isMeaningfulSelectedOption(sel) {
  if (!sel || typeof sel !== "object") return false;
  return Boolean(
    sel.optionLabel ||
      sel.type ||
      sel.badge ||
      sel.inverter?.modelName ||
      sel.battery?.modelName ||
      sel.inverterName ||
      sel.batteryName ||
      sel.totalPrice != null ||
      sel.total != null,
  );
}

export async function listRecommendationSheets({ branchId = null, isSuperAdmin = false } = {}) {
  const q = {};
  if (!isSuperAdmin && branchId) {
    const bid = new mongoose.Types.ObjectId(branchId);
    q.$or = [{ branchId: bid }, { branchId: null }, { branchId: { $exists: false } }];
  }
  const docs = await RecommendationSheet.find(q).sort({ createdAt: -1 }).lean();
  return docs.map((d) => ({
    ...d,
    _id: d._id?.toString(),
    id: d.sheetKey || d.externalId || d._id?.toString(),
    sheetKey: d.sheetKey || "",
    recommendationPdfUrl: d.recommendationPdfUrl?.includes("/generated/")
      ? d.recommendationPdfUrl.slice(d.recommendationPdfUrl.indexOf("/generated/"))
      : d.recommendationPdfUrl,
    documentStage: "recommendation",
  }));
}

export async function saveRecommendationSheet(payload, tenant = {}) {
  const branchId = tenant.branchId ?? null;
  const isSuperAdmin = tenant.isSuperAdmin ?? false;
  const context = { branchId, isSuperAdmin };
  const quotationKind = normalizeQuotationKind(payload.quotationKind ?? payload.kind);
  const requirements = buildRequirementsFromPayload(payload);

  let recommendation;
  const trustServerComboOnly = quotationKind === "combo";
  if (payload.suggestedOptions?.length && !trustServerComboOnly) {
    recommendation = {
      quotationKind,
      flatType: payload.flatType ?? requirements.flatType,
      backupHours: Number(payload.backupHours ?? requirements.backupHours ?? 4),
      budgetType: payload.budgetType ?? requirements.budgetType,
      preferredBrand: requirements.preferredBrand,
      totalLoad: payload.totalLoad ?? requirements.totalLoad ?? 0,
      inverterRange: payload.inverterRange ?? "",
      batteryRange: payload.batteryRange ?? "",
      estimatedBackupRange: payload.estimatedBackupRange ?? "",
      appliancesNote: payload.appliancesNote ?? payload.roomNotes ?? requirements.roomNotes ?? "",
      recommendedOptionLabel:
        payload.recommendedOptionLabel ||
        payload.suggestedOptions.find((o) => o.badge === "Recommended")?.optionLabel ||
        payload.suggestedOptions[0]?.optionLabel,
      suggestedOptions: payload.suggestedOptions,
      loadSizing: payload.loadSizing ?? requirements.loadSizing,
    };
  } else {
    recommendation = await previewQuotationByKind(quotationKind, { ...payload, ...requirements }, context);
  }

  const suggestedOptions = trustServerComboOnly
    ? recommendation.suggestedOptions
    : payload.suggestedOptions ?? recommendation.suggestedOptions;

  if (!suggestedOptions?.length) {
    const err = new Error("No compatible products in inventory for this requirement");
    err.status = 400;
    throw err;
  }

  const sheetKey = await nextSheetKey(quotationKind);
  const expiresAt = getExpiresAt();
  let bid = branchId ? new mongoose.Types.ObjectId(branchId) : payload.branchId ? new mongoose.Types.ObjectId(payload.branchId) : null;
  if (!bid && isSuperAdmin) {
    const defaultBranch = await Branch.findOne({ active: { $ne: false } }).sort({ createdAt: 1 }).lean();
    bid = defaultBranch?._id ?? null;
  }

  const sheet = {
    sheetKey,
    quotationKind,
    recommendationMode: payload.recommendationMode ?? requirements.recommendationMode ?? "dynamic",
    customerName: payload.customerName ?? payload.customer ?? "",
    customerPhone: payload.customerPhone ?? payload.phone ?? "",
    customerAddress: payload.customerAddress ?? "",
    customerRequirements: payload.customerRequirements ?? requirements.customerRequirements ?? "",
    flatType: recommendation.flatType ?? requirements.flatType,
    backupHours: recommendation.backupHours ?? requirements.backupHours,
    budgetType: recommendation.budgetType ?? requirements.budgetType,
    preferredBrand: recommendation.preferredBrand ?? requirements.preferredBrand,
    totalLoad: recommendation.totalLoad ?? requirements.totalLoad ?? 0,
    inverterRange: recommendation.inverterRange ?? "",
    batteryRange: recommendation.batteryRange ?? "",
    estimatedBackupRange: recommendation.estimatedBackupRange ?? "",
    appliancesNote: recommendation.appliancesNote ?? "",
    recommendedOptionLabel: recommendation.recommendedOptionLabel ?? "",
    suggestedOptions,
    requirements: {
      ...requirements,
      loadSizing: recommendation.loadSizing ?? payload.loadSizing ?? requirements.loadSizing,
      appliances: recommendation.appliances ?? payload.appliances ?? requirements.appliances,
    },
    extraItems: payload.extraItems ?? payload.manualItems ?? [],
    status: "AwaitingSelection",
    date: new Date().toISOString().slice(0, 10),
    id: sheetKey,
  };

  // PDF is optional — do not block saving the sheet or creating a quotation if Puppeteer fails.
  let pdf = null;
  try {
    pdf = await generateRecommendationPdf({ ...sheet, id: sheetKey });
    sheet.recommendationPdfPath = pdf.recommendationPdfPath;
    sheet.recommendationPdfUrl = pdf.pdfUrl;
    sheet.recommendationPublicUrl = getQuotationPublicUrl(pdf.fileName);
  } catch (err) {
    console.warn("[quotation] Recommendation PDF skipped:", err.message);
    sheet.recommendationPdfPath = "";
    sheet.recommendationPdfUrl = "";
    sheet.recommendationPublicUrl = "";
  }

  const doc = await RecommendationSheet.create({
    branchId: bid,
    sheetKey,
    quotationKind,
    recommendationMode: sheet.recommendationMode,
    customerName: sheet.customerName,
    customerPhone: sheet.customerPhone,
    customerAddress: sheet.customerAddress,
    customerRequirements: sheet.customerRequirements,
    flatType: sheet.flatType,
    backupHours: sheet.backupHours,
    budgetType: sheet.budgetType,
    preferredBrand: sheet.preferredBrand,
    totalLoad: sheet.totalLoad,
    inverterRange: sheet.inverterRange,
    batteryRange: sheet.batteryRange,
    estimatedBackupRange: sheet.estimatedBackupRange,
    appliancesNote: sheet.appliancesNote,
    recommendedOptionLabel: sheet.recommendedOptionLabel,
    suggestedOptions: sheet.suggestedOptions,
    requirements: sheet.requirements,
    extraItems: sheet.extraItems,
    recommendationPdfPath: sheet.recommendationPdfPath,
    recommendationPdfUrl: sheet.recommendationPdfUrl,
    recommendationPublicUrl: sheet.recommendationPublicUrl,
    recommendationCloudinaryUrl: "",
    whatsappSent: false,
    expiresAt,
    status: sheet.status,
    vehicleBrand: recommendation.vehicleBrand ?? payload.vehicleBrand ?? "",
    vehicleModel: recommendation.vehicleModel ?? payload.vehicleModel ?? "",
    fuelType: recommendation.fuelType ?? payload.fuelType ?? "",
    bikeBrand: recommendation.bikeBrand ?? payload.bikeBrand ?? "",
    bikeModel: recommendation.bikeModel ?? payload.bikeModel ?? "",
    roomNotes: payload.roomNotes ?? "",
  });

  sheet.id = doc._id.toString();
  sheet._id = doc._id.toString();
  sheet.sheetKey = sheetKey;

  return {
    recommendationSheet: {
      ...sheet,
      sheetKey,
      id: sheetKey,
      _id: doc._id.toString(),
    },
    quotation: { ...sheet, quoteKey: sheetKey, quotationPdfUrl: sheet.recommendationPdfUrl, pdfUrl: sheet.recommendationPdfUrl, documentStage: "recommendation" },
    pdf,
    recommendation,
    steps: {
      saved: true,
      pdfGenerated: Boolean(pdf?.pdfUrl),
      whatsappSent: false,
    },
  };
}

function quotationPricingTotals(quotationData) {
  const opt = quotationData.selectedOption ?? quotationData.suggestedOptions?.[0] ?? {};
  const inv = opt.inverter ?? {};
  const bat = opt.battery ?? {};
  return calculateInvoiceTotals({
    inverterPrice: inv.sellingRate ?? inv.inverterFinalPrice ?? 0,
    batteryWithOldPrice: bat.withOldPrice ?? bat.sellingRate ?? 0,
    batteryWithoutOldPrice: bat.withoutOldPrice ?? bat.withOldPrice ?? bat.sellingRate ?? 0,
    pricingMode: quotationData.pricingMode ?? "withOld",
    additionalCharges: quotationData.additionalCharges ?? emptyAdditionalCharges(),
    gstRate: quotationData.gstRate ?? 18,
    discount: quotationData.discount ?? 0,
  });
}

function branchFilterForTenant(tenant = {}) {
  const bf = {};
  if (!tenant.isSuperAdmin && tenant.branchId) {
    bf.branchId = new mongoose.Types.ObjectId(tenant.branchId);
  }
  return bf;
}

/** Branch-scoped users may still load quotations with null/mismatched branchId from older saves (PDF step). */
function tenantCanAccessQuotationForPdf(doc, tenant = {}) {
  if (!doc) return false;
  if (tenant.isSuperAdmin) return true;
  if (!tenant.branchId) return true;
  if (doc.branchId == null) return true;
  return String(doc.branchId) === String(tenant.branchId);
}

async function findQuotationById(id, tenant = {}) {
  const bf = branchFilterForTenant(tenant);

  const findWithFilter = async (extra) => {
    if (mongoose.isValidObjectId(String(id))) {
      return Quotation.findOne({ _id: id, ...extra }).lean();
    }
    return (
      (await Quotation.findOne({ quoteKey: id, ...extra }).lean()) ||
      (await Quotation.findOne({ externalId: id, ...extra }).lean())
    );
  };

  let doc = await findWithFilter(bf);
  if (doc) return doc;

  if (Object.keys(bf).length) {
    doc = await findWithFilter({});
    if (doc && tenantCanAccessQuotationForPdf(doc, tenant)) return doc;
  }

  return null;
}

/**
 * Resolve one embedded option row for multi-option quotations.
 * @returns {{ slot: object | null, letter: string | null }}
 */
function resolveEmbeddedOptionForAction(quotation, optionId) {
  const opts = quotation?.options;
  if (!Array.isArray(opts) || opts.length === 0) return { slot: null, letter: null };
  const raw = String(optionId ?? "").trim();
  if (raw) {
    const up = raw.toUpperCase();
    const slot =
      opts.find((o) => String(o?.id || "").toUpperCase() === up) ||
      opts.find((o) => String(o?.clientOptionId || "") === raw);
    if (slot) return { slot, letter: String(slot.id || "").toUpperCase() || up };
    const err = new Error(`Unknown option "${raw}" for this quotation. Use option id A–Z or the option's client id.`);
    err.status = 400;
    throw err;
  }
  if (opts.length === 1) {
    const slot = opts[0];
    return { slot, letter: String(slot?.id || "A").toUpperCase() };
  }
  const err = new Error("optionId is required when this quotation has multiple options (e.g. A, B, C).");
  err.status = 400;
  throw err;
}

/** Build / persist final quotation PDF (used by create flow and POST /quotations/:id/generate-pdf). */
export async function generateFinalQuotationDocument(id, tenant = {}, meta = {}) {
  const optionId = meta.optionId ?? meta.option_id ?? "";
  const existing = await findQuotationById(id, tenant);
  if (!existing) {
    const err = new Error(
      "Quotation not found for PDF generation. Log into the correct branch, or open this quotation from the Quotations page and use Generate PDF.",
    );
    err.status = 404;
    throw err;
  }

  const emb = Array.isArray(existing.options) && existing.options.length > 0;
  const multi = emb && existing.options.length > 1;
  if (multi && !String(optionId ?? "").trim()) {
    const err = new Error(
      "optionId is required for PDF generation when this quotation has multiple options (pass the card letter, e.g. A, B).",
    );
    err.status = 400;
    throw err;
  }

  const { slot, letter } = resolveEmbeddedOptionForAction(existing, optionId);
  let selectedRow;
  if (emb) {
    if (!slot?.selectedRow) {
      const err = new Error("Could not resolve the selected option row for this PDF.");
      err.status = 400;
      throw err;
    }
    selectedRow = slot.selectedRow;
  } else {
    selectedRow = resolveQuotationOptionForPdf(existing);
  }
  const pricing = quotationPricingTotals({ ...existing, selectedOption: selectedRow });
  const quotationData = {
    ...existing,
    ...pricing,
    selectedOption: selectedRow,
    suggestedOptions: [selectedRow],
    quoteKey: existing.quoteKey,
    id: existing.quoteKey,
    date: existing.date || new Date(existing.createdAt || Date.now()).toISOString().slice(0, 10),
    status: existing.status || "Pending",
    clientOptionId: slot?.clientOptionId ?? existing.clientOptionId,
    optionIndex: slot?.optionIndex ?? existing.optionIndex,
    pdfOptionId: letter || slot?.id || existing.clientOptionId || "1",
  };

  let pdf;
  try {
    pdf = await generateFinalQuotationPdf(quotationData);
  } catch (e) {
    console.error("[quotation] generateFinalQuotationDocument PDF failed", existing.quoteKey, e?.message, e?.stack);
    const err = new Error(e.message || "PDF generation failed");
    err.status = e.status || 500;
    throw err;
  }
  let cloudinaryUrl = slot?.quotationCloudinaryUrl || existing.quotationCloudinaryUrl || "";
  if (getCloudinaryConfigStatus().configured && pdf.finalQuotationPdfPath) {
    try {
      const uploadKey = letter ? `${existing.quoteKey}-${letter}` : existing.quoteKey;
      cloudinaryUrl = await uploadQuotationPdfForWhatsApp(pdf.finalQuotationPdfPath, uploadKey);
    } catch (err) {
      console.warn("[cloudinary] Final quotation upload failed:", err.message);
    }
  }

  const publicUrl = getQuotationPublicUrl(pdf.fileName);
  let doc;

  if (slot && letter) {
    await Quotation.updateOne(
      { _id: existing._id },
      {
        $set: {
          pdfGenerated: true,
          "options.$[opt].quotationPdfUrl": pdf.pdfUrl,
          "options.$[opt].quotation_pdf_url": pdf.pdfUrl,
          "options.$[opt].quotationPdfPath": pdf.finalQuotationPdfPath || "",
          "options.$[opt].quotationPublicUrl": publicUrl,
          "options.$[opt].quotationCloudinaryUrl": cloudinaryUrl,
          "options.$[opt].subtotal": pricing.subtotal,
          "options.$[opt].gstAmount": pricing.gstAmount,
          "options.$[opt].totalAmount": pricing.finalTotal,
          "options.$[opt].workflowStatus": "Quotation Created",
        },
      },
      { arrayFilters: [{ "opt.id": letter }] },
    );
    doc = await Quotation.findById(existing._id).lean();
  } else {
    doc = await Quotation.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          pdfGenerated: true,
          subtotal: pricing.subtotal,
          gstAmount: pricing.gstAmount,
          finalTotal: pricing.finalTotal,
          finalQuotationPdfUrl: pdf.pdfUrl,
          quotationPdfUrl: pdf.pdfUrl,
          quotation_pdf_url: pdf.pdfUrl,
          quotationPdfPath: pdf.finalQuotationPdfPath,
          quotationPublicUrl: publicUrl,
          quotationCloudinaryUrl: cloudinaryUrl,
        },
      },
      { new: true },
    ).lean();
  }

  if (!doc) {
    const err = new Error("Quotation update failed after PDF generation");
    err.status = 500;
    throw err;
  }

  return {
    quotation: { ...doc, id: doc.quoteKey, _id: doc._id.toString() },
    pdf,
  };
}

/** Stage 2: create editable quotation draft from recommendation sheet (no PDF yet). */
export async function createQuotationFromSheet(payload, tenant = {}) {
  const {
    recommendationSheetId,
    sheetKey,
    selectedOption,
    selectedOptionLabel,
    optionIndex: rawOptionIndex,
    clientOptionId: rawClientOptionId,
    optionId: rawOptionId,
  } = payload;
  const optionIndexNum =
    typeof rawOptionIndex === "number" && Number.isInteger(rawOptionIndex)
      ? rawOptionIndex
      : typeof rawOptionIndex === "string" && /^\d+$/.test(String(rawOptionIndex).trim())
        ? Number.parseInt(String(rawOptionIndex).trim(), 10)
        : null;
  const clientOpt = String(rawClientOptionId || rawOptionId || "").trim().slice(0, 64);

  console.log("[quotation-create] createQuotationFromSheet", {
    recommendationSheetId: recommendationSheetId ? String(recommendationSheetId) : null,
    sheetKey: sheetKey || null,
    selectedOptionLabel: selectedOptionLabel || selectedOption?.optionLabel || null,
    optionIndex: optionIndexNum,
    clientOptionId: clientOpt || null,
    generatePdf: payload.generatePdf !== false,
  });
  const branchId = tenant.branchId ?? null;
  const isSuperAdmin = tenant.isSuperAdmin ?? false;
  const bf = {};
  if (!isSuperAdmin && branchId) bf.branchId = new mongoose.Types.ObjectId(branchId);

  let sheet = null;
  // When we have the Mongo id from a just-saved sheet, look up by id only (branch filter can hide null-branch sheets).
  if (recommendationSheetId && mongoose.isValidObjectId(String(recommendationSheetId))) {
    sheet = await RecommendationSheet.findById(recommendationSheetId).lean();
  }
  if (!sheet && sheetKey) {
    sheet = await RecommendationSheet.findOne({ sheetKey, ...bf }).lean();
  }
  if (!sheet && sheetKey) {
    sheet = await RecommendationSheet.findOne({ sheetKey }).lean();
  }
  if (!sheet) {
    const err = new Error("Recommendation sheet not found. Preview options and save again, then Create Quotation.");
    err.status = 404;
    throw err;
  }

  let optionFromIndex = null;
  if (optionIndexNum != null && optionIndexNum >= 0 && sheet.suggestedOptions?.[optionIndexNum]) {
    optionFromIndex = sheet.suggestedOptions[optionIndexNum];
  }

  let optionRaw;
  if (isMeaningfulSelectedOption(selectedOption)) {
    try {
      optionRaw = JSON.parse(JSON.stringify(selectedOption));
    } catch {
      optionRaw = { ...selectedOption };
    }
  } else {
    optionRaw =
      optionFromIndex ||
      sheet.suggestedOptions?.find((o) => o.optionLabel === selectedOptionLabel) ||
      sheet.suggestedOptions?.find((o) => o.badge === "Recommended") ||
      sheet.suggestedOptions?.[0];
  }

  if (!optionRaw) {
    const err = new Error("No option selected");
    err.status = 400;
    throw err;
  }

  let option;
  try {
    option = JSON.parse(JSON.stringify(optionRaw));
  } catch {
    option = { ...optionRaw };
  }
  option.optionId = String(
    option.optionId || clientOpt || (optionIndexNum != null ? `option-${optionIndexNum + 1}` : ""),
  ).slice(0, 64);

  const requestedLbl = optionLabelOnQuotationDoc({
    selectedOption: option,
    recommendedOptionLabel: option.optionLabel,
  });

  console.log("[quotation-create] resolved option row", {
    optionId: option.optionId,
    optionIndex: optionIndexNum,
    optionLabel: option.optionLabel,
    badge: option.badge,
    source: isMeaningfulSelectedOption(selectedOption) ? "payload.selectedOption" : "sheet.suggestedOptions",
    inv: option?.inverter?.modelName,
    bat: option?.battery?.modelName,
    requestedLbl,
  });

  const validTill = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const additionalCharges = emptyAdditionalCharges();
  const pricing = quotationPricingTotals({
    selectedOption: option,
    pricingMode: "withOld",
    additionalCharges,
    discount: 0,
    gstRate: 18,
  });
  const slot = buildOptionSlot(option, optionIndexNum, pricing);

  let quotationBranchId = sheet.branchId ?? null;
  if (!isSuperAdmin && branchId) {
    quotationBranchId = new mongoose.Types.ObjectId(branchId);
  } else if (quotationBranchId != null && !(quotationBranchId instanceof mongoose.Types.ObjectId)) {
    const s = String(quotationBranchId);
    quotationBranchId = mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
  }

  const parent = await findParentQuotationForRecommendationSheet(sheet._id, tenant);
  let doc;
  let alreadyExists = false;

  if (parent) {
    const opts = Array.isArray(parent.options) && parent.options.length ? [...parent.options] : [];
    const byId = opts.findIndex((o) => o.id === slot.id || String(o.clientOptionId || "") === String(slot.clientOptionId));
    if (byId >= 0) {
      opts[byId] = { ...opts[byId], ...slot };
      alreadyExists = true;
    } else {
      opts.push(slot);
    }
    const maxTot = Math.max(...opts.map((o) => Number(o.totalAmount) || 0), Number(pricing.finalTotal) || 0);
    doc = await Quotation.findByIdAndUpdate(
      parent._id,
      {
        $set: {
          options: opts,
          selectedOption: option,
          suggestedOptions: sheet.suggestedOptions || parent.suggestedOptions || [],
          recommendedOptionLabel: option.optionLabel,
          finalTotal: maxTot,
          clientOptionId: slot.clientOptionId,
          optionIndex: slot.optionIndex ?? parent.optionIndex,
          subtotal: pricing.subtotal,
          gstAmount: pricing.gstAmount,
        },
      },
      { new: true },
    ).lean();
  } else {
    const quoteKey = await nextQuoteKey();
    doc = await Quotation.create({
      branchId: quotationBranchId,
      clientOptionId: slot.clientOptionId,
      optionIndex: optionIndexNum != null ? optionIndexNum : null,
      quoteKey,
      quotationKind: sheet.quotationKind,
      documentStage: "final",
      recommendationSheetId: sheet._id,
      customerName: sheet.customerName,
      customerPhone: sheet.customerPhone,
      customerAddress: sheet.customerAddress,
      customerRequirements: sheet.customerRequirements,
      flatType: sheet.flatType,
      backupHours: sheet.backupHours,
      budgetType: sheet.budgetType,
      preferredBrand: sheet.preferredBrand,
      totalLoad: sheet.totalLoad,
      inverterRange: sheet.inverterRange,
      batteryRange: sheet.batteryRange,
      estimatedBackupRange: sheet.estimatedBackupRange,
      appliancesNote: sheet.appliancesNote,
      recommendedOptionLabel: option.optionLabel,
      selectedOption: option,
      suggestedOptions: sheet.suggestedOptions || [],
      options: [slot],
      requirements: sheet.requirements,
      recommendationMode: sheet.recommendationMode,
      validTill,
      status: "Pending",
      pricingMode: pricing.pricingMode,
      additionalCharges,
      discount: 0,
      gstRate: pricing.gstRate,
      subtotal: pricing.subtotal,
      gstAmount: pricing.gstAmount,
      finalTotal: pricing.finalTotal,
      pdfGenerated: false,
      expiresAt: getExpiresAt(),
    });
    doc = doc.toObject ? doc.toObject() : doc;
    await RecommendationSheet.updateOne(
      { _id: sheet._id },
      {
        $set: {
          status: "QuotationGenerated",
          finalQuotationId: doc._id,
          linkedFinalQuotationIds: [doc._id],
        },
      },
    );
  }

  if (parent) {
    await RecommendationSheet.updateOne(
      { _id: sheet._id },
      { $set: { status: "QuotationGenerated", finalQuotationId: doc._id }, $addToSet: { linkedFinalQuotationIds: doc._id } },
    );
  }

  const quotation = {
    ...doc,
    id: doc.quoteKey || doc._id.toString(),
    _id: doc._id.toString(),
    date: doc.createdAt ? new Date(doc.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  };

  const out = {
    quotation,
    recommendationSheet: { ...sheet, status: "QuotationGenerated" },
    alreadyExists,
  };

  if (payload.generatePdf !== false) {
    try {
      const gen = await generateFinalQuotationDocument(doc._id.toString(), tenant, { optionId: slot.id });
      out.quotation = {
        ...gen.quotation,
        id: gen.quotation.quoteKey || gen.quotation.id || quotation.id,
        quoteKey: gen.quotation.quoteKey || quotation.quoteKey,
      };
      out.pdf = gen.pdf;
    } catch (e) {
      console.error("[quotation] PDF on create failed:", e?.message, e?.stack);
      out.pdfError =
        (e.message || String(e)) +
        (String(e.message || "").includes("not found")
          ? " (If this persists, your user branch may not match the quotation record — try “PDF” from the list or contact admin.)"
          : "");
    }
  }

  return out;
}

export async function finalizeQuotation(payload, tenant = {}) {
  return createQuotationFromSheet(payload, tenant);
}

export async function updateQuotationDraft(id, payload, tenant = {}) {
  const existing = await findQuotationById(id, tenant);
  if (!existing) {
    const err = new Error("Quotation not found");
    err.status = 404;
    throw err;
  }

  const patch = {
    customerName: payload.customerName ?? existing.customerName,
    customerPhone: payload.customerPhone ?? existing.customerPhone,
    customerAddress: payload.customerAddress ?? existing.customerAddress,
    validTill: payload.validTill ?? existing.validTill,
    discount: Number(payload.discount ?? existing.discount ?? 0),
    gstRate: Number(payload.gstRate ?? existing.gstRate ?? 18),
    pricingMode: payload.pricingMode ?? existing.pricingMode ?? "withOld",
    additionalCharges: payload.additionalCharges ?? existing.additionalCharges ?? emptyAdditionalCharges(),
  };

  const pricing = quotationPricingTotals({ ...existing, ...patch });
  patch.subtotal = pricing.subtotal;
  patch.gstAmount = pricing.gstAmount;
  patch.finalTotal = pricing.finalTotal;

  const doc = await Quotation.findByIdAndUpdate(existing._id, { $set: patch }, { new: true }).lean();
  return {
    quotation: {
      ...doc,
      id: doc.quoteKey || doc._id.toString(),
      _id: doc._id.toString(),
    },
  };
}

export async function sendFinalQuotationWhatsApp(id, tenant = {}, meta = {}) {
  const optionId = meta.optionId ?? meta.option_id ?? "";
  let existing = await findQuotationById(id, tenant);
  if (!existing) {
    const err = new Error("Quotation not found");
    err.status = 404;
    throw err;
  }

  const { slot, letter } = resolveEmbeddedOptionForAction(existing, optionId);
  const slotPdf = slot?.quotationPdfUrl || slot?.quotation_pdf_url;
  const legacyReady = Boolean(existing.pdfGenerated && existing.finalQuotationPdfUrl);

  if (!slotPdf && !legacyReady) {
    try {
      const genMeta = letter ? { optionId: letter } : meta;
      const generated = await generateFinalQuotationDocument(id, tenant, genMeta);
      existing = generated.quotation;
    } catch (e) {
      console.error("[quotation] whatsapp: PDF generation/regeneration failed", e?.message, e?.stack);
      const err = new Error(`Cannot send WhatsApp until PDF is generated: ${e.message || e}`);
      err.status = e.status || 500;
      throw err;
    }
  }

  existing = await findQuotationById(id, tenant);
  const resolved = resolveEmbeddedOptionForAction(existing, optionId);
  const s = resolved.slot;
  const L = resolved.letter;

  const publicUrl =
    (s?.quotationCloudinaryUrl && documentUrlIsWhatsAppReady(s.quotationCloudinaryUrl)
      ? s.quotationCloudinaryUrl
      : null) ||
    (s?.quotationPublicUrl && documentUrlIsWhatsAppReady(s.quotationPublicUrl) ? s.quotationPublicUrl : null) ||
    (existing.quotationCloudinaryUrl && documentUrlIsWhatsAppReady(existing.quotationCloudinaryUrl)
      ? existing.quotationCloudinaryUrl
      : null) ||
    (existing.quotationPublicUrl && documentUrlIsWhatsAppReady(existing.quotationPublicUrl)
      ? existing.quotationPublicUrl
      : "");

  if (!publicUrl || !documentUrlIsWhatsAppReady(publicUrl)) {
    const err = new Error("Public HTTPS URL required for WhatsApp. Configure Cloudinary or PUBLIC_BASE_URL (ngrok).");
    err.status = 400;
    throw err;
  }

  const pdfPath = s?.quotationPdfUrl || s?.quotation_pdf_url || existing.finalQuotationPdfUrl || existing.quotationPdfUrl || "";
  const result = await sendQuotationWhatsApp({
    to: existing.customerPhone,
    customerName: existing.customerName,
    publicUrl,
    fileName: String(pdfPath).split("/").pop() || "quotation.pdf",
    optionCount: 1,
  });

  const sent = Boolean(result.sent);
  const sentAt = new Date();
  const sentBy = tenant.userName || tenant.user || "";
  const whatsappStatus = sent ? result.status || "sent" : result.status || "failed";

  const statusPatch = { whatsappSent: sent, whatsappStatus };
  if (sent) {
    statusPatch.sentAt = sentAt;
    statusPatch.sentBy = sentBy;
    if (["Pending", "Draft", "Finalized", "Approved", ""].includes(existing.status || "")) {
      statusPatch.status = "Sent";
    }
  }

  if (s && L) {
    const wf = sent ? "Quotation Sent" : undefined;
    await Quotation.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...statusPatch,
          "options.$[opt].whatsappSent": sent,
          "options.$[opt].whatsappStatus": whatsappStatus,
          "options.$[opt].sentAt": sent ? sentAt : null,
          ...(wf ? { "options.$[opt].workflowStatus": wf } : {}),
        },
      },
      { arrayFilters: [{ "opt.id": L }] },
    );
    if (sent && meta.customerApprovedAfterSend) {
      await Quotation.updateOne(
        { _id: existing._id },
        { $set: { "options.$[opt].workflowStatus": "Customer Approved" } },
        { arrayFilters: [{ "opt.id": L }] },
      );
    }
  } else {
    await Quotation.updateOne({ _id: existing._id }, { $set: statusPatch });
  }

  const fresh = await findQuotationById(id, tenant);
  return {
    quotation: { ...fresh, ...statusPatch, whatsappSent: sent },
    whatsapp: result,
  };
}

/**
 * Generate PDF, mark Approved (if not Rejected/Sent), then send WhatsApp.
 * WhatsApp runs only after PDF exists on disk / DB fields are set.
 */
export async function approveAndSendFinalQuotationWhatsApp(id, tenant = {}, meta = {}) {
  const idStr = String(id);
  const optionId = meta.optionId ?? meta.option_id ?? "";
  console.log("[quotation] approveAndSendFinalQuotationWhatsApp start", { quotationId: idStr, optionId });

  let existing = await findQuotationById(idStr, tenant);
  if (!existing) {
    const err = new Error("Quotation not found");
    err.status = 404;
    throw err;
  }
  if (existing.status === "Converted") {
    const err = new Error("Quotation already converted to an invoice and cannot be sent.");
    err.status = 400;
    throw err;
  }

  const { letter } = resolveEmbeddedOptionForAction(existing, optionId);

  try {
    const gen = await generateFinalQuotationDocument(existing._id.toString(), tenant, letter ? { optionId: letter } : meta);
    existing = gen.quotation;
  } catch (e) {
    console.error("[quotation] approve-send: PDF failed", e?.message, e?.stack);
    const err = new Error(`PDF generation failed: ${e.message || e}`);
    err.status = e.status || 500;
    throw err;
  }

  existing = await findQuotationById(idStr, tenant);
  const { slot, letter: L } = resolveEmbeddedOptionForAction(existing, optionId);
  const pdfStored = Boolean(
    slot?.quotationPdfUrl || slot?.quotation_pdf_url || existing.finalQuotationPdfUrl || existing.quotationPdfUrl,
  );
  if (!pdfStored) {
    const err = new Error("PDF was not stored. Check server logs, Puppeteer, and write access to the generated folder.");
    err.status = 500;
    throw err;
  }

  if (L) {
    await Quotation.updateOne(
      { _id: existing._id },
      { $set: { "options.$[opt].approved": true } },
      { arrayFilters: [{ "opt.id": L }] },
    );
  }

  const st = existing.status || "Pending";
  if (st !== "Rejected" && st !== "Sent") {
    await Quotation.updateOne({ _id: existing._id }, { $set: { status: "Approved" } });
  }

  return sendFinalQuotationWhatsApp(idStr, tenant, { ...meta, customerApprovedAfterSend: true });
}

/** Mark a quotation Approved/Rejected/Expired (staff-recorded after customer confirmation). */
export async function setQuotationStatus(id, status, tenant = {}) {
  const allowed = ["Approved", "Rejected", "Expired", "Pending", "Sent"];
  if (!allowed.includes(status)) {
    const err = new Error(`Invalid status. Allowed: ${allowed.join(", ")}`);
    err.status = 400;
    throw err;
  }

  const existing = await findQuotationById(id, tenant);
  if (!existing) {
    const err = new Error("Quotation not found");
    err.status = 404;
    throw err;
  }

  if (existing.status === "Converted") {
    const err = new Error("Quotation already converted to an invoice and cannot change status.");
    err.status = 400;
    throw err;
  }

  const doc = await Quotation.findByIdAndUpdate(existing._id, { $set: { status } }, { new: true }).lean();
  return { quotation: { ...doc, id: doc.quoteKey || doc._id.toString(), _id: doc._id.toString() } };
}

export async function getQuotationById(id, tenant = {}) {
  const doc = await findQuotationById(id, tenant);
  if (!doc) {
    const err = new Error("Quotation not found");
    err.status = 404;
    throw err;
  }
  return { ...doc, id: doc.quoteKey || doc._id.toString(), _id: doc._id.toString() };
}

export { nextQuoteKey };
