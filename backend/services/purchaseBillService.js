import mongoose from "mongoose";
import PurchaseBill from "../models/PurchaseBill.js";
import InventoryStockHistory from "../models/InventoryStockHistory.js";
import { extractPurchaseBill } from "./ocr/billOcrService.js";
import { matchBillItemsToInventory } from "./ocr/productMatchService.js";
import { emptyExtractedBill } from "./ocr/billParseHeuristics.js";
import { uploadPurchaseBillFile } from "./cloudinaryService.js";
import { incrementStockFromPurchaseItems, createCategoryInventoryRow, inferCategoryKeyFromLegacyRow } from "./categoryInventoryService.js";
import { createPurchaseOrder } from "./purchaseManagementService.js";

export const OCR_STATUS = {
  PROCESSING: "Processing",
  COMPLETED: "OCR Completed",
  NEEDS_REVIEW: "Needs Review",
  CONFIRMED: "Confirmed",
  INVENTORY_UPDATED: "Inventory Updated",
  FAILED: "Failed",
};

function branchFilter(branchId, isSuperAdmin) {
  if (isSuperAdmin || !branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

function toClient(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    ...o,
    id: o._id?.toString?.() ?? o.id,
    _id: o._id?.toString?.() ?? o._id,
    branchId: o.branchId?.toString?.() ?? o.branchId,
    itemCount: (o.items || []).length,
    supplierName: o.supplierDetails?.name || "",
    gstTotal: (Number(o.cgst) || 0) + (Number(o.sgst) || 0) + (Number(o.igst) || 0),
  };
}

function applyExtract(bill, extracted, { engine, rawText, pageCount, insufficient }) {
  const e = extracted || emptyExtractedBill();
  bill.invoiceNumber = e.invoiceNumber || "";
  bill.invoiceDate = e.invoiceDate || "";
  bill.purchaseOrderNumber = e.purchaseOrderNumber || "";
  bill.supplierDetails = e.supplierDetails || {};
  bill.buyerDetails = e.buyerDetails || {};
  bill.items = e.items || [];
  bill.subtotal = e.subtotal;
  bill.discount = e.discount;
  bill.taxableAmount = e.taxableAmount;
  bill.cgst = e.cgst;
  bill.sgst = e.sgst;
  bill.igst = e.igst;
  bill.cess = e.cess;
  bill.otherCharges = e.otherCharges;
  bill.freight = e.freight;
  bill.transportation = e.transportation;
  bill.installationCharges = e.installationCharges;
  bill.roundOff = e.roundOff;
  bill.grandTotal = e.grandTotal;
  bill.amountPaid = e.amountPaid;
  bill.balanceDue = e.balanceDue;
  bill.amountInWords = e.amountInWords || "";
  bill.fieldConfidence = e.fieldConfidence || {};
  bill.ocrConfidence = e.ocrConfidence;
  bill.ocrEngine = engine || "";
  bill.rawOcrText = rawText || "";
  bill.pageCount = pageCount || 1;
  if (insufficient) {
    bill.ocrStatus = OCR_STATUS.FAILED;
    bill.ocrError = "Unable to extract sufficient information from this document.";
  } else {
    const low = Number(e.ocrConfidence) > 0 && Number(e.ocrConfidence) < 75;
    bill.ocrStatus = low ? OCR_STATUS.NEEDS_REVIEW : OCR_STATUS.COMPLETED;
    bill.ocrError = "";
  }
}

export async function listPurchaseBills(filters = {}, tenant = {}) {
  const q = { ...branchFilter(tenant.branchId, tenant.isSuperAdmin) };
  if (filters.status) q.ocrStatus = filters.status;
  if (filters.q) {
    const rx = new RegExp(String(filters.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ invoiceNumber: rx }, { "supplierDetails.name": rx }, { "supplierDetails.gstin": rx }];
  }
  const docs = await PurchaseBill.find(q).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map(toClient);
}

export async function getPurchaseBill(id, tenant = {}) {
  const q = { _id: id, ...branchFilter(tenant.branchId, tenant.isSuperAdmin) };
  const doc = await PurchaseBill.findOne(q);
  return doc ? toClient(doc) : null;
}

export async function findDuplicateBills(payload, tenant = {}, excludeId = null) {
  const gstin = String(payload.supplierDetails?.gstin || payload.gstin || "").trim().toUpperCase();
  const invoiceNumber = String(payload.invoiceNumber || "").trim();
  const invoiceDate = String(payload.invoiceDate || "").trim();
  const supplierName = String(payload.supplierDetails?.name || payload.supplierName || "").trim();
  const grandTotal = payload.grandTotal != null ? Number(payload.grandTotal) : null;
  if (!invoiceNumber && !gstin) return [];

  const q = { ...branchFilter(tenant.branchId, tenant.isSuperAdmin) };
  if (excludeId) q._id = { $ne: excludeId };
  q.ocrStatus = { $nin: [OCR_STATUS.FAILED] };
  const clauses = [];
  if (invoiceNumber) clauses.push({ invoiceNumber });
  if (gstin) clauses.push({ "supplierDetails.gstin": new RegExp(`^${gstin}$`, "i") });
  if (clauses.length) q.$or = clauses;

  const docs = await PurchaseBill.find(q).limit(20).lean();
  return docs.filter((d) => {
    const sameInv = invoiceNumber && String(d.invoiceNumber || "").trim().toLowerCase() === invoiceNumber.toLowerCase();
    const sameGst = gstin && String(d.supplierDetails?.gstin || "").toUpperCase() === gstin;
    const sameName =
      supplierName &&
      String(d.supplierDetails?.name || "").trim().toLowerCase() === supplierName.toLowerCase();
    const sameDate = !invoiceDate || String(d.invoiceDate || "").trim() === invoiceDate;
    const sameTotal =
      grandTotal == null || d.grandTotal == null || Math.abs(Number(d.grandTotal) - grandTotal) < 1;
    const score = (sameInv ? 2 : 0) + (sameGst ? 2 : 0) + (sameName ? 1 : 0) + (sameDate ? 1 : 0) + (sameTotal ? 1 : 0);
    return score >= 4 && sameInv;
  });
}

export async function createAndProcessPurchaseBill({ buffer, mimetype, originalName, user }, tenant) {
  if (!buffer?.length) {
    const err = new Error("No file uploaded");
    err.status = 400;
    throw err;
  }
  const bid = tenant.branchId ? new mongoose.Types.ObjectId(tenant.branchId) : null;
  const stored = await uploadPurchaseBillFile(buffer, mimetype, {
    publicId: `pb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const bill = await PurchaseBill.create({
    branchId: bid,
    originalFileUrl: stored.url,
    originalFileName: originalName || "",
    fileType: mimetype || "",
    ocrStatus: OCR_STATUS.PROCESSING,
    createdBy: user?.sub || user?.id || user?._id || "",
    createdByName: user?.name || user?.email || "",
  });

  try {
    const result = await extractPurchaseBill(buffer, mimetype);
    applyExtract(bill, result.extracted, result);
    if (bill.ocrStatus !== OCR_STATUS.FAILED) {
      bill.items = await matchBillItemsToInventory(bill.items, tenant);
    }
    await bill.save();
  } catch (e) {
    bill.ocrStatus = OCR_STATUS.FAILED;
    bill.ocrError = e.message || "OCR processing failed";
    await bill.save();
  }
  return toClient(bill);
}

export async function retryPurchaseBillOcr(id, { buffer, mimetype } = {}, tenant) {
  const bill = await PurchaseBill.findOne({ _id: id, ...branchFilter(tenant.branchId, tenant.isSuperAdmin) });
  if (!bill) return null;
  if (["Confirmed", "Inventory Updated"].includes(bill.ocrStatus)) {
    const err = new Error("Confirmed bills cannot be re-processed");
    err.status = 400;
    throw err;
  }
  if (!buffer?.length) {
    const err = new Error("Upload the document again to retry OCR");
    err.status = 400;
    throw err;
  }
  bill.ocrStatus = OCR_STATUS.PROCESSING;
  bill.ocrError = "";
  await bill.save();
  try {
    const result = await extractPurchaseBill(buffer, mimetype || bill.fileType);
    applyExtract(bill, result.extracted, result);
    if (bill.ocrStatus !== OCR_STATUS.FAILED) {
      bill.items = await matchBillItemsToInventory(bill.items, tenant);
    }
    await bill.save();
  } catch (e) {
    bill.ocrStatus = OCR_STATUS.FAILED;
    bill.ocrError = e.message || "OCR processing failed";
    await bill.save();
  }
  return toClient(bill);
}

export async function createManualPurchaseBill(payload, tenant, user) {
  const bid = tenant.branchId ? new mongoose.Types.ObjectId(tenant.branchId) : null;
  const bill = await PurchaseBill.create({
    branchId: bid,
    invoiceNumber: payload.invoiceNumber || "",
    invoiceDate: payload.invoiceDate || "",
    supplierDetails: payload.supplierDetails || {},
    buyerDetails: payload.buyerDetails || {},
    items: payload.items || [],
    ocrStatus: OCR_STATUS.NEEDS_REVIEW,
    ocrEngine: "manual",
    createdBy: user?.sub || user?.id || user?._id || "",
    createdByName: user?.name || user?.email || "",
    originalFileUrl: payload.originalFileUrl || "",
    fileType: payload.fileType || "",
  });
  return toClient(bill);
}

export async function savePurchaseBillReview(id, payload, tenant) {
  const bill = await PurchaseBill.findOne({ _id: id, ...branchFilter(tenant.branchId, tenant.isSuperAdmin) });
  if (!bill) return null;
  if (["Confirmed", "Inventory Updated"].includes(bill.ocrStatus)) {
    const err = new Error("This purchase bill is already confirmed");
    err.status = 400;
    throw err;
  }
  const fields = [
    "invoiceNumber",
    "invoiceDate",
    "purchaseOrderNumber",
    "supplierDetails",
    "buyerDetails",
    "items",
    "subtotal",
    "discount",
    "taxableAmount",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "otherCharges",
    "freight",
    "transportation",
    "installationCharges",
    "roundOff",
    "grandTotal",
    "amountPaid",
    "balanceDue",
    "amountInWords",
  ];
  for (const f of fields) {
    if (payload[f] !== undefined) bill[f] = payload[f];
  }
  if (bill.ocrStatus === OCR_STATUS.FAILED) bill.ocrStatus = OCR_STATUS.NEEDS_REVIEW;
  else if (bill.ocrStatus === OCR_STATUS.PROCESSING) bill.ocrStatus = OCR_STATUS.NEEDS_REVIEW;
  await bill.save();
  return toClient(bill);
}

function inferTypeFromItem(item) {
  const t = String(item.category || item.productName || "").toLowerCase();
  if (t.includes("inverter") && t.includes("battery")) return "Inverter+Battery";
  if (t.includes("inverter")) return "Inverter";
  if (t.includes("trolley")) return "Trolley";
  if (t.includes("lithium")) return "Lithium Ion Battery";
  if (t.includes("bike")) return "Bike";
  if (t.includes("home")) return "Home Inverter Battery";
  return "Car";
}

export async function confirmPurchaseBill(id, { force = false } = {}, tenant, user) {
  const bill = await PurchaseBill.findOne({ _id: id, ...branchFilter(tenant.branchId, tenant.isSuperAdmin) });
  if (!bill) return null;
  if (bill.inventoryUpdated) {
    const err = new Error("Inventory was already updated for this bill");
    err.status = 400;
    throw err;
  }
  if (bill.ocrStatus === OCR_STATUS.FAILED) {
    const err = new Error("Cannot confirm a failed OCR bill. Retry OCR or enter details manually first.");
    err.status = 400;
    throw err;
  }

  const duplicates = await findDuplicateBills(bill, tenant, bill._id);
  if (duplicates.length && !force) {
    const err = new Error("Possible Duplicate Purchase Bill");
    err.status = 409;
    err.duplicates = duplicates.map(toClient);
    throw err;
  }

  const stockLines = [];
  for (const item of bill.items || []) {
    const qty = Number(item.quantity);
    if (!qty || qty <= 0) continue;
    let productId = item.productId;
    if (!productId && item.createNewProduct) {
      const type = inferTypeFromItem(item);
      const row = {
        type,
        category: type,
        brand: item.brand || "Unknown",
        model: item.modelNumber || item.sku || item.productName || "Unknown",
        modelNumber: item.modelNumber || item.sku || item.productName,
        quantity: 0,
        warranty: item.warranty || "",
      };
      const cat = inferCategoryKeyFromLegacyRow(row);
      const created = await createCategoryInventoryRow(cat, row, tenant.branchId);
      productId = String(created._id || created.id);
      item.productId = productId;
      item.matchStatus = "manual";
    }
    if (!productId) continue;
    stockLines.push({
      inventoryId: productId,
      qty,
      productName: item.productName,
      sku: item.sku || item.modelNumber,
      brand: item.brand,
    });
  }

  const stockResults = stockLines.length
    ? await incrementStockFromPurchaseItems(stockLines, {
        branchId: tenant.branchId,
        isSuperAdmin: tenant.isSuperAdmin,
      })
    : [];

  for (const r of stockResults) {
    if (!r.ok) continue;
    const line = stockLines.find((s) => String(s.inventoryId) === String(r.inventoryId));
    await InventoryStockHistory.create({
      branchId: tenant.branchId || null,
      productId: r.inventoryId,
      productName: line?.productName || "",
      sku: line?.sku || "",
      brand: line?.brand || "",
      type: "Purchase Received",
      previousStock: r.previousQty,
      quantityChange: r.addedQty,
      newStock: r.newQty,
      supplier: bill.supplierDetails?.name || "",
      invoiceNumber: bill.invoiceNumber || "",
      invoiceDate: bill.invoiceDate || "",
      purchaseBillId: bill._id,
      notes: `Purchase Received — Product: ${line?.productName || line?.sku || ""} Previous Stock: ${r.previousQty} Purchased: +${r.addedQty} New Stock: ${r.newQty}`,
      createdBy: user?.name || user?.email || "",
    });
  }

  let purchaseOrderId = "";
  try {
    const po = await createPurchaseOrder(
      {
        vendorName: bill.supplierDetails?.name || "",
        vendorGst: bill.supplierDetails?.gstin || "",
        vendorMobile: bill.supplierDetails?.phone || "",
        billNo: bill.invoiceNumber || "",
        billDetails: `OCR purchase bill ${bill._id}`,
        purchaseDate: bill.invoiceDate || new Date().toISOString().slice(0, 10),
        gstAmount: (Number(bill.cgst) || 0) + (Number(bill.sgst) || 0) + (Number(bill.igst) || 0),
        finalAmount: Number(bill.grandTotal) || 0,
        paidAmount: Number(bill.amountPaid) || 0,
        paymentMode: Number(bill.amountPaid) > 0 ? "Partial Payment" : "Credit / Loan",
        updateInventory: false,
        products: stockLines.map((s) => ({
          inventoryId: s.inventoryId,
          model: s.sku,
          brand: s.brand,
          qty: s.qty,
          purchaseRate: Number((bill.items || []).find((it) => String(it.productId) === String(s.inventoryId))?.rate) || 0,
          productType: "",
        })),
        notes: `From purchase bill OCR ${bill.invoiceNumber || bill._id}`,
      },
      tenant,
    );
    purchaseOrderId = po?.purchaseId || po?.id || "";
  } catch (e) {
    console.warn("[purchase-bill] PO create skipped:", e.message);
  }

  bill.inventoryUpdated = stockResults.some((r) => r.ok);
  bill.purchaseOrderId = purchaseOrderId;
  bill.ocrStatus = bill.inventoryUpdated ? OCR_STATUS.INVENTORY_UPDATED : OCR_STATUS.CONFIRMED;
  await bill.save();

  return {
    bill: toClient(bill),
    stockResults,
    purchaseOrderId,
  };
}
