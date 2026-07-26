import Quotation from "../models/Quotation.js";
import { generateFinalQuotationPdf } from "../services/pdfService.js";
import { sendQuotationWhatsApp, documentUrlIsWhatsAppReady } from "../services/whatsappService.js";
import { getQuotationPublicUrl } from "../services/quotationStorageService.js";
import { getCloudinaryConfigStatus, uploadQuotationPdfForWhatsApp } from "../services/cloudinaryService.js";
import mongoose from "mongoose";

function branchFilter(req) {
  const isSuperAdmin = req.user?.role === "superAdmin";
  const branchId = req.user?.branchId;
  if (isSuperAdmin || !branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

export async function generateQuotationPdfController(req, res, next) {
  try {
    const bf = branchFilter(req);
    let doc = await Quotation.findOne({ _id: req.params.id, ...bf });
    if (!doc) doc = await Quotation.findOne({ quoteKey: req.params.id, ...bf });
    if (!doc) return res.status(404).json({ error: "Quotation not found" });

    const plain = doc.toObject();
    const pdf = await generateFinalQuotationPdf({ ...plain, id: plain.quoteKey || plain._id.toString() });
    doc.finalQuotationPdfUrl = pdf.pdfUrl;
    doc.quotationPdfUrl = pdf.pdfUrl;
    doc.quotationPdfPath = pdf.finalQuotationPdfPath;
    doc.quotationPublicUrl = getQuotationPublicUrl(pdf.fileName);
    if (getCloudinaryConfigStatus().configured && pdf.finalQuotationPdfPath) {
      try {
        doc.quotationCloudinaryUrl = await uploadQuotationPdfForWhatsApp(
          pdf.finalQuotationPdfPath,
          plain.quoteKey || plain._id.toString()
        );
      } catch (err) {
        console.warn("[cloudinary] Regenerated quotation upload failed:", err.message);
      }
    }
    await doc.save();

    const absoluteUrl = doc.quotationPublicUrl;
    res.json({ ...pdf, quotation: doc.toJSON(), absoluteUrl });
  } catch (err) {
    next(err);
  }
}

export async function sendQuotationWhatsAppController(req, res, next) {
  try {
    const bf = branchFilter(req);
    let doc = await Quotation.findOne({ _id: req.params.id, ...bf });
    if (!doc) doc = await Quotation.findOne({ quoteKey: req.params.id, ...bf });
    if (!doc) return res.status(404).json({ error: "Quotation not found" });

    let publicUrl =
      doc.quotationCloudinaryUrl && documentUrlIsWhatsAppReady(doc.quotationCloudinaryUrl)
        ? doc.quotationCloudinaryUrl
        : doc.quotationPublicUrl;

    if (!publicUrl || !documentUrlIsWhatsAppReady(publicUrl)) {
      const pdf = await generateFinalQuotationPdf({ ...doc.toObject(), id: doc.quoteKey || doc._id.toString() });
      publicUrl = getQuotationPublicUrl(pdf.fileName);
      doc.finalQuotationPdfUrl = pdf.pdfUrl;
      doc.quotationPdfUrl = pdf.pdfUrl;
      doc.quotationPublicUrl = publicUrl;
      doc.quotationPdfPath = pdf.finalQuotationPdfPath;
      if (getCloudinaryConfigStatus().configured && pdf.finalQuotationPdfPath) {
        try {
          doc.quotationCloudinaryUrl = await uploadQuotationPdfForWhatsApp(
            pdf.finalQuotationPdfPath,
            doc.quoteKey || doc._id.toString()
          );
          if (documentUrlIsWhatsAppReady(doc.quotationCloudinaryUrl)) {
            publicUrl = doc.quotationCloudinaryUrl;
          }
        } catch (err) {
          console.warn("[cloudinary] Quotation upload before WhatsApp failed:", err.message);
        }
      }
      await doc.save();
    }

    const result = await sendQuotationWhatsApp({
      to: doc.customerPhone,
      customerName: doc.customerName,
      publicUrl,
      fileName: doc.quotationPdfUrl?.split("/").pop() || "quotation.pdf",
      optionCount: doc.suggestedOptions?.length,
    });

    doc.whatsappSent = Boolean(result.sent);
    await doc.save();
    res.json({ quotation: doc.toJSON(), whatsapp: result });
  } catch (err) {
    next(err);
  }
}
