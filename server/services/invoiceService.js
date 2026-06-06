import fs from "fs/promises";
import Invoice from "../models/Invoice.js";
import Quotation from "../models/Quotation.js";
import ProfitLog from "../models/ProfitLog.js";
import { deductStock } from "./inventoryService.js";
import { buildProfitLog } from "./profitService.js";
import { generateInvoicePdf } from "./pdfService.js";
import { uploadInvoicePdf, getCloudinaryConfigStatus } from "./cloudinaryService.js";
import { sendInvoiceWhatsApp } from "./whatsappService.js";
import {
  buildInvoiceDraftFromQuotation,
  normalizeInvoicePayload,
} from "./invoiceConversionService.js";
import mongoose from "mongoose";

async function nextInvoiceNumber() {
  // Year-based numbering for newly created invoices (e.g. INV-2026-0001).
  const year = new Date().getFullYear();
  const prefix = `INV-${year}`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const count = await Invoice.countDocuments({ invoiceNumber: { $regex: new RegExp(`^${escaped}-\\d{4}$`) } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function normalizeInvoiceItem(item, inventory) {
  const product = inventory.find((candidate) => {
    const candidateId = candidate.id ?? candidate._id;
    return String(candidateId) === String(item.productId ?? item.inventoryId ?? item.id);
  });
  const rate = Number(item.rate ?? item.sellingRate ?? item.sellRate ?? product?.sellingRate ?? product?.sellRate ?? 0);
  const qty = Number(item.quantity ?? item.qty ?? 1);

  return {
    productId: String(product?.id ?? product?._id ?? item.productId ?? ""),
    modelName: item.modelName ?? item.model ?? product?.modelName ?? product?.model ?? "",
    quantity: qty,
    rate,
    amount: qty * rate,
    purchaseRate: Number(item.purchaseRate ?? product?.purchaseRate ?? 0),
  };
}

export async function listInvoices({ branchId = null, isSuperAdmin = false } = {}) {
  const q = {};
  if (!isSuperAdmin && branchId) q.branchId = new mongoose.Types.ObjectId(branchId);
  const docs = await Invoice.find(q).sort({ createdAt: -1 }).lean();
  return docs.map((d) => ({
    ...d,
    id: d.externalId || d.invoiceNumber || d._id.toString(),
    customer: d.customerDetails?.name,
    phone: d.customerDetails?.phone,
    total: d.totalAmount,
    paid: d.paymentStatus === "Paid",
    date: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
    items: d.products,
    pdfUrl: d.invoicePdfUrl,
  }));
}

export function prepareInvoiceFromQuotation(quotation = {}, selectedOption = null) {
  return buildInvoiceDraftFromQuotation(quotation, selectedOption);
}

export async function generateInvoice(payload, { branchId = null, isSuperAdmin = false } = {}) {
  console.log("[invoice] Generate started");

  // Approval gate: when converting from a quotation, the linked quotation must be Approved
  // (or the specific tier option must be approved for multi-option quotations).
  if (payload.quotationId) {
    const qid = String(payload.quotationId);
    const or = [{ quoteKey: qid }, { externalId: qid }];
    if (mongoose.isValidObjectId(qid)) or.push({ _id: qid });
    const linkedQuotation = await Quotation.findOne({ $or: or }).lean();

    const hasOpts = Array.isArray(linkedQuotation?.options) && linkedQuotation.options.length > 0;
    const optId = String(payload.quotationOptionId ?? payload.optionId ?? "").trim();
    const multi = hasOpts && linkedQuotation.options.length > 1;

    if (linkedQuotation && hasOpts) {
      if (multi && !optId) {
        const err = new Error(
          "This quotation has multiple options. Pass quotationOptionId (e.g. A, B) to convert a single tier.",
        );
        err.status = 400;
        throw err;
      }
      const tier = multi
        ? linkedQuotation.options.find(
            (o) =>
              String(o?.id || "").toUpperCase() === optId.toUpperCase() ||
              String(o?.clientOptionId || "") === optId,
          )
        : linkedQuotation.options[0];
      if (multi && !tier) {
        const err = new Error(`Unknown quotation option "${optId}" for this quotation.`);
        err.status = 400;
        throw err;
      }
      const tierOk =
        Boolean(tier?.approved) ||
        Boolean(tier?.whatsappSent) ||
        linkedQuotation.status === "Approved" ||
        linkedQuotation.status === "Converted" ||
        ["Quotation Sent", "Customer Approved", "Invoice Created", "Invoice Sent", "Completed"].includes(
          tier?.workflowStatus,
        );
      if (!tierOk) {
        const err = new Error(
          `Quotation option ${optId || tier?.id || ""} must be approved (use Approve & Send on that option, or mark the full quotation Approved) before converting.`,
        );
        err.status = 400;
        throw err;
      }
    } else if (
      linkedQuotation &&
      linkedQuotation.status !== "Approved" &&
      linkedQuotation.status !== "Converted"
    ) {
      const err = new Error(
        `Quotation ${payload.quotationId} must be Approved before it can be converted to an invoice (current status: ${linkedQuotation.status || "Pending"}).`,
      );
      err.status = 400;
      throw err;
    }
  }

  const normalized = payload.inverter || payload.battery || payload.additionalCharges
    ? normalizeInvoicePayload(payload)
    : null;

  let invoice = normalized;
  const inventory = await import("./inventoryService.js").then((m) =>
    m.listProducts({ includeProfit: false, branchId, isSuperAdmin }),
  );

  if (!invoice) {
    const items = (payload.products ?? payload.items ?? []).map((item) => normalizeInvoiceItem(item, inventory));
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const gstRate = Number(payload.gstRate ?? 18);
    const gst = Number(((subtotal * gstRate) / 100).toFixed(2));
    const totalAmount = subtotal + gst;
    invoice = {
      invoiceNumber: payload.invoiceNumber ?? (await nextInvoiceNumber()),
      customerDetails: payload.customerDetails ?? {
        name: payload.customerName ?? payload.customer ?? "",
        phone: payload.customerPhone ?? payload.phone ?? "",
        place: payload.place ?? "",
        address: payload.address ?? "",
      },
      quotationId: payload.quotationId ?? null,
      products: items,
      items,
      subtotal,
      gst,
      gstRate,
      totalAmount,
      total: totalAmount,
      finalTotal: totalAmount,
      paymentStatus: payload.paymentStatus ?? "Unpaid",
      sendWhatsapp: payload.sendWhatsapp !== false,
      date: new Date().toISOString().slice(0, 10),
    };
  } else {
    invoice.invoiceNumber = payload.invoiceNumber ?? (await nextInvoiceNumber());
  }

  for (const item of invoice.products ?? []) {
    if (!item.productId) continue;
    const product = inventory.find((c) => String(c.id ?? c._id) === String(item.productId));
    if (product && Number(item.quantity) > Number(product.quantity ?? 0)) {
      throw new Error(`${item.modelName} has only ${product.quantity} units in stock`);
    }
  }

  const stockItems = (invoice.products ?? []).filter((i) => i.productId);
  if (stockItems.length) {
    await deductStock(stockItems, { branchId, isSuperAdmin });
    console.log("[invoice] Stock deducted for", stockItems.length, "line(s)");
  }

  const pdf = await generateInvoicePdf(invoice);

  let cloudinaryInvoiceUrl = "";
  if (getCloudinaryConfigStatus().configured) {
    try {
      cloudinaryInvoiceUrl = await uploadInvoicePdf(pdf.filePath, invoice.invoiceNumber);
      invoice.cloudinaryInvoiceUrl = cloudinaryInvoiceUrl;
      invoice.invoicePdfUrl = cloudinaryInvoiceUrl;
      invoice.pdfUrl = cloudinaryInvoiceUrl;
    } catch (err) {
      console.warn("[cloudinary] Invoice upload failed, using local PDF:", err.message);
      invoice.invoicePdfUrl = pdf.pdfUrl;
      invoice.pdfUrl = pdf.pdfUrl;
    }
  } else {
    invoice.invoicePdfUrl = pdf.pdfUrl;
    invoice.pdfUrl = pdf.pdfUrl;
  }

  let whatsapp = { sent: false };
  const whatsappUrl = cloudinaryInvoiceUrl || invoice.invoicePdfUrl;
  if (invoice.sendWhatsapp !== false && invoice.customerDetails?.phone && whatsappUrl) {
    console.log("[whatsapp] Sending invoice to", invoice.customerDetails.phone);
    whatsapp = await sendInvoiceWhatsApp({
      to: invoice.customerDetails.phone,
      customerName: invoice.customerDetails.name,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount ?? invoice.finalTotal,
      cloudinaryUrl: whatsappUrl.startsWith("http") ? whatsappUrl : undefined,
    });
    invoice.invoiceSent = Boolean(whatsapp.sent);
    invoice.sentToWhatsapp = invoice.invoiceSent;
  }

  const bid = branchId ? new mongoose.Types.ObjectId(branchId) : payload.branchId ? new mongoose.Types.ObjectId(payload.branchId) : null;

  const doc = await Invoice.create({
    branchId: bid,
    invoiceNumber: invoice.invoiceNumber,
    quotationId: invoice.quotationId,
    quoteKey: invoice.quoteKey ?? "",
    recommendationType: invoice.recommendationType ?? "",
    customerDetails: invoice.customerDetails,
    inverter: invoice.inverter,
    battery: invoice.battery,
    calculatedVA: invoice.calculatedVA,
    calculatedAH: invoice.calculatedAH,
    backupHours: invoice.backupHours,
    totalLoad: invoice.totalLoad,
    pricingMode: invoice.pricingMode,
    scrapAdjustment: invoice.scrapAdjustment,
    productTotal: invoice.productTotal,
    additionalCharges: invoice.additionalCharges,
    additionalTotal: invoice.additionalTotal,
    products: invoice.products,
    subtotal: invoice.subtotal,
    gst: invoice.gst ?? invoice.gstAmount,
    gstRate: invoice.gstRate,
    totalAmount: invoice.totalAmount ?? invoice.finalTotal,
    paymentMode: invoice.paymentMode,
    status: "Generated",
    paymentStatus: invoice.paymentStatus,
    paidAmount: invoice.paidAmount,
    pendingAmount: invoice.pendingAmount,
    notes: invoice.notes,
    selectedOptionSnapshot: invoice.selectedOptionSnapshot,
    cloudinaryInvoiceUrl: invoice.cloudinaryInvoiceUrl ?? "",
    invoicePdfUrl: invoice.invoicePdfUrl ?? pdf.pdfUrl,
    invoiceSent: invoice.invoiceSent ?? false,
    sentToWhatsapp: invoice.sentToWhatsapp ?? false,
  });

  if (invoice.quotationId) {
    const qKey = String(invoice.quotationId);
    const or = [{ quoteKey: qKey }, { externalId: qKey }];
    if (mongoose.isValidObjectId(qKey)) or.push({ _id: qKey });
    const qtDoc = await Quotation.findOne({ $or: or }).lean();
    const optId = String(payload.quotationOptionId ?? payload.optionId ?? "").trim();

    if (qtDoc && Array.isArray(qtDoc.options) && qtDoc.options.length) {
      const multi = qtDoc.options.length > 1;
      const tier = multi
        ? qtDoc.options.find(
            (o) =>
              String(o?.id || "").toUpperCase() === optId.toUpperCase() ||
              String(o?.clientOptionId || "") === optId,
          )
        : qtDoc.options[0];
      const letter = String((tier || qtDoc.options[0])?.id || "A").toUpperCase();
      const invPdf = String(invoice.invoicePdfUrl || pdf?.pdfUrl || "");
      const wfFinal = whatsapp.sent ? "Invoice Sent" : "Invoice Created";
      await Quotation.updateOne(
        { _id: qtDoc._id },
        {
          $set: {
            "options.$[opt].invoiceId": doc._id,
            "options.$[opt].status": "Converted",
            "options.$[opt].invoicePdfUrl": invPdf,
            "options.$[opt].invoice_pdf_url": invPdf,
            "options.$[opt].workflowStatus": wfFinal,
            "options.$[opt].invoiceWhatsappSent": Boolean(whatsapp.sent),
            "options.$[opt].invoiceWhatsappStatus": whatsapp.sent ? whatsapp.status || "sent" : "",
          },
        },
        { arrayFilters: [{ "opt.id": letter }] },
      );
      const refreshed = await Quotation.findById(qtDoc._id).lean();
      const allInvoiced = (refreshed?.options ?? []).length
        ? refreshed.options.every((o) => o?.invoiceId)
        : false;
      if (allInvoiced) {
        await Quotation.updateOne(
          { _id: qtDoc._id },
          { $set: { status: "Converted", documentStage: "converted", invoiceId: doc._id } },
        );
      }
    } else {
      await Quotation.updateMany(
        { $or: [{ quoteKey: invoice.quotationId }, { externalId: invoice.quotationId }] },
        { $set: { status: "Converted", documentStage: "converted", invoiceId: doc._id } },
      ).catch(() => {});
    }
  }

  invoice.id = doc._id.toString();
  invoice._id = doc._id.toString();
  invoice.createdAt = doc.createdAt;

  const logs = (invoice.products ?? [])
    .filter((item) => item.productId)
    .map((item) =>
      buildProfitLog(
        { id: item.productId, modelName: item.modelName, purchaseRate: item.purchaseRate, sellingRate: item.rate },
        item.quantity,
      ),
    );
  for (const log of logs) {
    await ProfitLog.create({
      branchId: bid,
      productId: String(log.productId),
      modelName: log.modelName,
      purchaseRate: log.purchaseRate,
      sellingRate: log.sellingRate,
      quantity: log.quantity,
      profit: log.profit,
      loss: log.loss,
      marginPercentage: log.marginPercentage,
      date: new Date(log.date),
      externalId: log.id,
    });
  }

  if (cloudinaryInvoiceUrl) {
    try {
      await fs.unlink(pdf.filePath);
    } catch {
      /* ignore */
    }
  }

  console.log("[invoice] Saved to MongoDB:", invoice.id);
  return {
    invoice: {
      ...invoice,
      customer: invoice.customerDetails?.name,
      phone: invoice.customerDetails?.phone,
      items: invoice.products,
      total: invoice.totalAmount,
      paid: invoice.paymentStatus === "Paid",
    },
    pdf: { pdfUrl: invoice.invoicePdfUrl, localPath: pdf.filePath },
    whatsapp,
  };
}
