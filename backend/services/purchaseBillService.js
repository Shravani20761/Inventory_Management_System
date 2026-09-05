import mongoose from "mongoose";
import PurchaseBill from "../models/PurchaseBill.js";
import InventoryStockHistory from "../models/InventoryStockHistory.js";
import { extractPurchaseBill } from "./ocr/billOcrService.js";
import { matchBillItemsToInventory } from "./ocr/productMatchService.js";
import { emptyExtractedBill } from "./ocr/billParseHeuristics.js";
import { validatePurchaseBillMath } from "./ocr/billValidation.js";
import { uploadPurchaseBillFile } from "./cloudinaryService.js";
import { incrementStockFromPurchaseItems, createCategoryInventoryRow, inferCategoryKeyFromLegacyRow } from "./categoryInventoryService.js";
import { createPurchaseOrder } from "./purchaseManagementService.js";
import { recordAudit } from "./auditService.js";

export const OCR_STATUS = {
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  COMPLETED: "OCR Completed",
  NEEDS_REVIEW: "Needs Review",
  CONFIRMED: "Confirmed",
  INVENTORY_UPDATED: "Inventory Updated",
  FAILED: "Failed",
};

function branchFilter(branchId, isSuperAdmin) {
  if (branchId) return { branchId: new mongoose.Types.ObjectId(String(branchId)) };
  if (isSuperAdmin) return {};
  return { _id: { $in: [] } };
}

function audit(user, tenant, action, bill, metadata = {}) {
  return recordAudit({
    userId: user?.sub || user?.id || user?._id,
    role: user?.role || tenant?.role || "",
    branchId: tenant?.branchId || bill?.branchId,
    action,
    entity: "PurchaseBill",
    entityId: String(bill?._id || bill?.id || ""),
    metadata,
  });
}

function toClient(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const branch = o.branchId && typeof o.branchId === "object" ? o.branchId : null;
  return {
    ...o,
    id: o._id?.toString?.() ?? o.id,
    _id: o._id?.toString?.() ?? o._id,
    branchId: branch?._id?.toString?.() ?? o.branchId?.toString?.() ?? o.branchId,
    branchName: branch?.branchName || branch?.name || "",
    itemCount: (o.items || []).length,
    supplierName: o.supplierDetails?.name || "",
    gstTotal: (Number(o.cgst) || 0) + (Number(o.sgst) || 0) + (Number(o.igst) || 0),
    financialWarnings: o.financialWarnings?.length ? o.financialWarnings : validatePurchaseBillMath(o),
  };
}

function snapshotFromBill(bill) {
  return {
    invoiceNumber: bill.invoiceNumber,
    invoiceDate: bill.invoiceDate,
    purchaseOrderNumber: bill.purchaseOrderNumber,
    poDate: bill.poDate,
    dueDate: bill.dueDate,
    paymentTerms: bill.paymentTerms,
    placeOfSupply: bill.placeOfSupply,
    reverseCharge: bill.reverseCharge,
    vehicleNumber: bill.vehicleNumber,
    deliveryNote: bill.deliveryNote,
    supplierDetails: bill.supplierDetails,
    buyerDetails: bill.buyerDetails,
    items: bill.items,
    subtotal: bill.subtotal,
    discount: bill.discount,
    taxableAmount: bill.taxableAmount,
    cgst: bill.cgst,
    sgst: bill.sgst,
    igst: bill.igst,
    cess: bill.cess,
    otherCharges: bill.otherCharges,
    freight: bill.freight,
    transportation: bill.transportation,
    packingCharges: bill.packingCharges,
    installationCharges: bill.installationCharges,
    roundOff: bill.roundOff,
    grandTotal: bill.grandTotal,
    amountPaid: bill.amountPaid,
    balanceDue: bill.balanceDue,
    amountInWords: bill.amountInWords,
  };
}

function applyExtract(bill, extracted, { engine, rawText, pageCount, insufficient }) {
  const e = extracted || emptyExtractedBill();
  bill.invoiceNumber = e.invoiceNumber || "";
  bill.invoiceDate = e.invoiceDate || "";
  bill.purchaseOrderNumber = e.purchaseOrderNumber || "";
  bill.poDate = e.poDate || "";
  bill.dueDate = e.dueDate || "";
  bill.paymentTerms = e.paymentTerms || "";
  bill.placeOfSupply = e.placeOfSupply || "";
  bill.reverseCharge = e.reverseCharge || "";
  bill.vehicleNumber = e.vehicleNumber || "";
  bill.deliveryNote = e.deliveryNote || "";
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
  bill.packingCharges = e.packingCharges;
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
  bill.extractedSnapshot = snapshotFromBill(bill);
  bill.financialWarnings = validatePurchaseBillMath(bill);
  if (insufficient) {
    bill.ocrStatus = OCR_STATUS.FAILED;
    bill.ocrError = "Unable to extract sufficient information from this bill.";
  } else {
    const low = Number(e.ocrConfidence) > 0 && Number(e.ocrConfidence) < 75;
    bill.ocrStatus = low ? OCR_STATUS.NEEDS_REVIEW : OCR_STATUS.COMPLETED;
    bill.ocrError = "";
  }
}

async function storePageImages(pageBuffers, billId) {
  const urls = [];
  for (let i = 0; i < (pageBuffers || []).length; i += 1) {
    const buf = pageBuffers[i];
    if (!buf?.length) continue;
    try {
      const stored = await uploadPurchaseBillFile(buf, "image/jpeg", {
        publicId: `pb-page-${billId}-${i + 1}`,
      });
      if (stored?.url) urls.push(stored.url);
    } catch (e) {
      console.warn("[purchase-bill] page image store skipped:", e.message);
    }
  }
  return urls;
}

export async function listPurchaseBills(filters = {}, tenant = {}) {
  const q = { ...branchFilter(tenant.branchId, tenant.isSuperAdmin) };
  if (filters.status) q.ocrStatus = filters.status;
  if (filters.q) {
    const rx = new RegExp(String(filters.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ invoiceNumber: rx }, { "supplierDetails.name": rx }, { "supplierDetails.gstin": rx }];
  }
  const docs = await PurchaseBill.find(q)
    .populate("branchId", "name branchName code")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return docs.map(toClient);
}

export async function getPurchaseBill(id, tenant = {}) {
  const q = { _id: id, ...branchFilter(tenant.branchId, tenant.isSuperAdmin) };
  const doc = await PurchaseBill.findOne(q).populate("branchId", "name branchName code");
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
  q.ocrStatus = { $nin: [OCR_STATUS.FAILED, OCR_STATUS.UPLOADED, OCR_STATUS.PROCESSING] };
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

export async function createUploadedPurchaseBill({ buffer, mimetype, originalName, user, fileSize }, tenant) {
  if (!buffer?.length) {
    const err = new Error("No file uploaded");
    err.status = 400;
    throw err;
  }
  if (!tenant.branchId) {
    const err = new Error("Select a branch before uploading a purchase bill.");
    err.status = 400;
    throw err;
  }
  const bid = new mongoose.Types.ObjectId(tenant.branchId);
  const stored = await uploadPurchaseBillFile(buffer, mimetype, {
    publicId: `pb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const bill = await PurchaseBill.create({
    branchId: bid,
    originalFileUrl: stored.url,
    originalFileName: originalName || "",
    fileType: mimetype || "",
    fileSize: fileSize ?? buffer.length,
    uploadedAt: new Date(),
    uploadedBy: user?.name || user?.email || user?.sub || "",
    ocrStatus: OCR_STATUS.UPLOADED,
    createdBy: user?.sub || user?.id || user?._id || "",
    createdByName: user?.name || user?.email || "",
  });
  await audit(user, tenant, "purchase_bill.uploaded", bill, { originalFileName: originalName, fileType: mimetype });
  return toClient(bill);
}

export async function runPurchaseBillOcr(id, { buffer, mimetype, replaceOriginal = false } = {}, tenant, user) {
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
  try {
    if (replaceOriginal) {
      const stored = await uploadPurchaseBillFile(buffer, mimetype || bill.fileType, {
        publicId: `pb-${bill._id}-retry-${Date.now()}`,
      });
      if (stored?.url) {
        bill.originalFileUrl = stored.url;
        bill.fileType = mimetype || bill.fileType;
        bill.fileSize = buffer.length;
      }
    }
  } catch (e) {
    console.warn("[purchase-bill] retry file store skipped:", e.message);
  }
  bill.ocrStatus = OCR_STATUS.PROCESSING;
  bill.ocrError = "";
  await bill.save();
  await audit(user, tenant, "purchase_bill.ocr_started", bill, {});
  try {
    const result = await extractPurchaseBill(buffer, mimetype || bill.fileType);
    applyExtract(bill, result.extracted, result);
    if (result.pageBuffers?.length) {
      bill.pageImageUrls = await storePageImages(result.pageBuffers, bill._id);
    }
    if (bill.ocrStatus !== OCR_STATUS.FAILED) {
      bill.items = await matchBillItemsToInventory(bill.items, tenant);
    }
    await bill.save();
    await audit(user, tenant, bill.ocrStatus === OCR_STATUS.FAILED ? "purchase_bill.ocr_failed" : "purchase_bill.ocr_completed", bill, {
      engine: bill.ocrEngine,
      itemCount: (bill.items || []).length,
    });
  } catch (e) {
    bill.ocrStatus = OCR_STATUS.FAILED;
    bill.ocrError = e.message || "OCR processing failed";
    await bill.save();
    await audit(user, tenant, "purchase_bill.ocr_failed", bill, { error: e.message });
  }
  return toClient(bill);
}

/** Upload + start OCR. Caller may await or fire-and-forget after returning the uploaded bill. */
export async function createAndProcessPurchaseBill(file, tenant, { wait = false } = {}) {
  const uploaded = await createUploadedPurchaseBill(file, tenant);
  const job = runPurchaseBillOcr(
    uploaded.id,
    { buffer: file.buffer, mimetype: file.mimetype },
    tenant,
    file.user,
  );
  if (wait) return job;
  job.catch((e) => console.warn("[purchase-bill] background OCR failed:", e.message));
  return uploaded;
}

export async function retryPurchaseBillOcr(id, file, tenant, user) {
  return runPurchaseBillOcr(id, { ...file, replaceOriginal: Boolean(file?.buffer) }, tenant, user);
}

export async function createManualPurchaseBill(payload, tenant, user) {
  if (!tenant.branchId) {
    const err = new Error("Select a branch before creating a purchase bill.");
    err.status = 400;
    throw err;
  }
  const bid = new mongoose.Types.ObjectId(tenant.branchId);
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
    uploadedBy: user?.name || user?.email || "",
    originalFileUrl: payload.originalFileUrl || "",
    fileType: payload.fileType || "",
  });
  await audit(user, tenant, "purchase_bill.manual_created", bill, {});
  return toClient(bill);
}

export async function savePurchaseBillReview(id, payload, tenant, user) {
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
    "poDate",
    "dueDate",
    "paymentTerms",
    "placeOfSupply",
    "reverseCharge",
    "vehicleNumber",
    "deliveryNote",
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
    "packingCharges",
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
  bill.financialWarnings = validatePurchaseBillMath(bill);
  if (bill.ocrStatus === OCR_STATUS.FAILED) bill.ocrStatus = OCR_STATUS.NEEDS_REVIEW;
  else if (bill.ocrStatus === OCR_STATUS.PROCESSING || bill.ocrStatus === OCR_STATUS.UPLOADED) {
    bill.ocrStatus = OCR_STATUS.NEEDS_REVIEW;
  }
  await bill.save();
  await audit(user, tenant, "purchase_bill.fields_edited", bill, { fields: Object.keys(payload || {}).filter((k) => k !== "rawOcrText") });
  return toClient(bill);
}

function inferTypeFromItem(item) {
  const t = String(item.category || item.productName || item.batteryType || "").toLowerCase();
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

  const pending = (bill.items || []).filter(
    (item) => Number(item.quantity) > 0 && !item.productId && !item.createNewProduct,
  );
  if (pending.length) {
    const err = new Error("Match each purchased line to an existing product or choose Create New Product before confirming.");
    err.status = 400;
    throw err;
  }

  const duplicates = await findDuplicateBills(bill, tenant, bill._id);
  if (duplicates.length && !force) {
    const err = new Error("Possible duplicate purchase bill.");
    err.status = 409;
    err.duplicates = duplicates.map(toClient);
    throw err;
  }

  const confirmBranchId = tenant.branchId || bill.branchId;
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
      const created = await createCategoryInventoryRow(cat, row, confirmBranchId);
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
        branchId: confirmBranchId,
        isSuperAdmin: tenant.isSuperAdmin,
      })
    : [];

  const inventoryChanges = [];
  for (const r of stockResults) {
    if (!r.ok) continue;
    const line = stockLines.find((s) => String(s.inventoryId) === String(r.inventoryId));
    inventoryChanges.push({
      productId: r.inventoryId,
      productName: line?.productName || "",
      previousStock: r.previousQty,
      purchasedQty: r.addedQty,
      newStock: r.newQty,
    });
    await InventoryStockHistory.create({
      branchId: confirmBranchId || null,
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
      { ...tenant, branchId: confirmBranchId },
    );
    purchaseOrderId = po?.purchaseId || po?.id || "";
  } catch (e) {
    console.warn("[purchase-bill] PO create skipped:", e.message);
  }

  bill.inventoryUpdated = stockResults.some((r) => r.ok);
  bill.purchaseOrderId = purchaseOrderId;
  bill.inventoryChanges = inventoryChanges;
  bill.ocrStatus = bill.inventoryUpdated ? OCR_STATUS.INVENTORY_UPDATED : OCR_STATUS.CONFIRMED;
  await bill.save();
  await audit(user, tenant, "purchase_bill.confirmed", bill, { purchaseOrderId, inventoryUpdated: bill.inventoryUpdated });
  if (bill.inventoryUpdated) {
    await audit(user, tenant, "purchase_bill.inventory_updated", bill, { lines: inventoryChanges.length });
  }

  return {
    bill: toClient(bill),
    stockResults,
    inventoryChanges,
    purchaseOrderId,
  };
}
