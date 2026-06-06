import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import PurchasePayment from "../models/PurchasePayment.js";
import ReminderLog from "../models/ReminderLog.js";
import Branch from "../models/Branch.js";
import { incrementStockFromPurchaseItems } from "./categoryInventoryService.js";

const PAYMENT_MODES = ["Full Cash", "Partial Payment", "Credit / Loan", "Cheque Payment", "Multiple Cheques"];
const CHEQUE_STATUSES = ["Pending", "Deposited", "Cleared", "Bounced", "Cancelled"];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDateStr(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const da = parseDateStr(a);
  const db = parseDateStr(b);
  if (!da || !db) return null;
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

export async function nextPurchaseId(branchId) {
  const count = await PurchaseOrder.countDocuments(
    branchId ? { branchId: new mongoose.Types.ObjectId(branchId) } : {},
  );
  const year = new Date().getFullYear();
  return `PO-${year}-${String(count + 1).padStart(4, "0")}`;
}

export function computePurchaseTotals(payload) {
  const products = (payload.products || []).map((p) => {
    const qty = num(p.qty ?? p.quantity);
    const rate = num(p.purchaseRate ?? p.rate);
    return {
      ...p,
      qty,
      purchaseRate: rate,
      lineTotal: qty * rate,
    };
  });
  const subtotal = products.reduce((a, p) => a + p.lineTotal, 0);
  const gstPercent = num(payload.gstPercent);
  const gstAmount = num(payload.gstAmount) || (gstPercent ? (subtotal * gstPercent) / 100 : 0);
  const finalAmount = num(payload.finalAmount) || subtotal + gstAmount;
  return { products, subtotal, gstAmount, gstPercent, finalAmount };
}

export function computePaidAmount(paymentMode, cheques = [], explicitPaid = null) {
  if (paymentMode === "Full Cash") return null;
  if (explicitPaid != null && explicitPaid !== "") return num(explicitPaid);
  if (paymentMode === "Cheque Payment" || paymentMode === "Multiple Cheques") {
    return cheques.reduce((a, c) => a + num(c.amount), 0);
  }
  return num(explicitPaid);
}

export function derivePaymentStatus({ finalAmount, paidAmount, nextDueDate, cheques = [] }) {
  const outstanding = Math.max(0, finalAmount - paidAmount);
  const today = todayStr();
  if (outstanding <= 0) return { paymentStatus: "Paid", outstandingAmount: 0, status: "Closed" };
  const dueDates = cheques.map((c) => c.dueDate).filter(Boolean);
  if (nextDueDate) dueDates.push(nextDueDate);
  const earliestDue = dueDates.sort()[0] || nextDueDate;
  if (earliestDue && earliestDue < today) {
    return { paymentStatus: "Overdue", outstandingAmount: outstanding, status: "Open" };
  }
  const daysToDue = earliestDue ? daysBetween(today, earliestDue) : null;
  if (daysToDue != null && daysToDue >= 0 && daysToDue <= 3) {
    return { paymentStatus: "Cheque Due Soon", outstandingAmount: outstanding, status: "Open" };
  }
  if (paidAmount > 0 && outstanding > 0) {
    return { paymentStatus: "Partial", outstandingAmount: outstanding, status: "Open" };
  }
  return { paymentStatus: "Pending", outstandingAmount: outstanding, status: "Open" };
}

export function deriveNextDueDate(cheques = [], fallback = "") {
  const dates = cheques
    .filter((c) => c.status !== "Cleared" && c.status !== "Cancelled" && c.status !== "Bounced")
    .map((c) => c.dueDate)
    .filter(Boolean)
    .sort();
  return dates[0] || fallback || "";
}

export function orderToClient(doc, extras = {}) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: o.purchaseId,
    _id: o._id?.toString?.() ?? o._id,
    purchaseId: o.purchaseId,
    purchaseDate: o.purchaseDate,
    vendorName: o.vendorName,
    vendorMobile: o.vendorMobile,
    vendorWhatsApp: o.vendorWhatsApp,
    vendorGst: o.vendorGst,
    branchId: o.branchId?.toString?.() ?? o.branchId,
    branchName: o.branchName,
    billNo: o.billNo,
    billDetails: o.billDetails,
    products: o.products || [],
    productCount: (o.products || []).length,
    subtotal: o.subtotal,
    gstAmount: o.gstAmount,
    gstPercent: o.gstPercent,
    finalAmount: o.finalAmount,
    total: o.finalAmount,
    paidAmount: o.paidAmount,
    outstandingAmount: o.outstandingAmount,
    pendingAmount: o.outstandingAmount,
    paymentMode: o.paymentMode,
    cheques: o.cheques || [],
    nextDueDate: o.nextDueDate,
    paymentStatus: o.paymentStatus,
    inventoryUpdated: o.inventoryUpdated,
    status: o.status,
    notes: o.notes,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    ...extras,
  };
}

function branchFilter(branchId, isSuperAdmin) {
  if (isSuperAdmin || !branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

export async function listPurchaseOrders(filters = {}, tenant = {}) {
  const q = { ...branchFilter(tenant.branchId, tenant.isSuperAdmin) };
  if (filters.vendor) q.vendorName = new RegExp(String(filters.vendor).trim(), "i");
  if (filters.branchName) q.branchName = filters.branchName;
  if (filters.productType) q["products.productType"] = filters.productType;
  if (filters.paymentStatus) q.paymentStatus = filters.paymentStatus;
  if (filters.status) q.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    q.purchaseDate = {};
    if (filters.dateFrom) q.purchaseDate.$gte = filters.dateFrom;
    if (filters.dateTo) q.purchaseDate.$lte = filters.dateTo;
  }
  const docs = await PurchaseOrder.find(q).sort({ purchaseDate: -1, createdAt: -1 }).lean();
  return docs.map((d) => orderToClient(d));
}

export async function getPurchaseOrderById(id, tenant = {}) {
  const bf = branchFilter(tenant.branchId, tenant.isSuperAdmin);
  let doc = await PurchaseOrder.findOne({ purchaseId: id, ...bf }).lean();
  if (!doc && mongoose.Types.ObjectId.isValid(id)) {
    doc = await PurchaseOrder.findOne({ _id: id, ...bf }).lean();
  }
  if (!doc) return null;
  const payments = await PurchasePayment.find({ purchaseOrderId: doc._id }).sort({ createdAt: -1 }).lean();
  const reminders = await ReminderLog.find({ purchaseOrderId: doc._id }).sort({ sentAt: -1 }).limit(50).lean();
  return orderToClient(doc, { payments, reminderLogs: reminders });
}

export async function createPurchaseOrder(payload, tenant = {}) {
  const branchId = tenant.branchId;
  if (!branchId) {
    const err = new Error("Branch is required to create a purchase order");
    err.status = 400;
    throw err;
  }
  const bid = new mongoose.Types.ObjectId(branchId);
  const branch = await Branch.findById(bid).lean();
  const { products, subtotal, gstAmount, gstPercent, finalAmount } = computePurchaseTotals(payload);
  const cheques = (payload.cheques || []).map((c) => ({
    chequeNumber: String(c.chequeNumber ?? "").trim(),
    bankName: String(c.bankName ?? "").trim(),
    amount: num(c.amount),
    chequeDate: c.chequeDate ?? "",
    depositDate: c.depositDate ?? "",
    dueDate: c.dueDate ?? "",
    status: CHEQUE_STATUSES.includes(c.status) ? c.status : "Pending",
  }));
  const paymentMode = PAYMENT_MODES.includes(payload.paymentMode) ? payload.paymentMode : "Full Cash";
  let paidAmount =
    paymentMode === "Full Cash"
      ? finalAmount
      : computePaidAmount(paymentMode, cheques, payload.paidAmount);
  if (paidAmount == null) paidAmount = num(payload.paidAmount);
  const nextDueDate = deriveNextDueDate(cheques, payload.nextDueDate);
  const { paymentStatus, outstandingAmount, status } = derivePaymentStatus({
    finalAmount,
    paidAmount,
    nextDueDate,
    cheques,
  });
  const purchaseId = payload.purchaseId || (await nextPurchaseId(branchId));
  const updateInventory = payload.updateInventory !== false;
  let stockResults = [];
  let inventoryUpdated = false;
  if (updateInventory && products.some((p) => p.inventoryId)) {
    stockResults = await incrementStockFromPurchaseItems(
      products.filter((p) => p.inventoryId),
      { branchId, isSuperAdmin: tenant.isSuperAdmin },
    );
    inventoryUpdated = stockResults.some((r) => r.ok);
  }
  const doc = await PurchaseOrder.create({
    branchId: bid,
    purchaseId,
    purchaseDate: payload.purchaseDate || todayStr(),
    vendorName: String(payload.vendorName ?? payload.supplier ?? "").trim(),
    vendorMobile: String(payload.vendorMobile ?? "").trim(),
    vendorWhatsApp: String(payload.vendorWhatsApp ?? payload.vendorMobile ?? "").trim(),
    vendorGst: String(payload.vendorGst ?? "").trim(),
    branchName: payload.branchName || branch?.branchName || branch?.name || "",
    billNo: String(payload.billNo ?? "").trim(),
    billDetails: String(payload.billDetails ?? "").trim(),
    products: products.map((p) => ({
      ...p,
      stockApplied: stockResults.some((r) => r.ok && String(r.inventoryId) === String(p.inventoryId)),
    })),
    subtotal,
    gstAmount,
    gstPercent,
    finalAmount,
    paidAmount,
    outstandingAmount,
    paymentMode,
    cheques,
    nextDueDate,
    paymentStatus,
    inventoryUpdated,
    status,
    notes: String(payload.notes ?? "").trim(),
  });
  if (paidAmount > 0) {
    await PurchasePayment.create({
      purchaseOrderId: doc._id,
      purchaseId: doc.purchaseId,
      branchId: bid,
      paymentMode,
      amount: paidAmount,
      paymentDate: payload.purchaseDate || todayStr(),
      status: paymentStatus === "Paid" ? "Completed" : "Pending",
      notes: "Initial payment on purchase entry",
    });
  }
  return orderToClient(doc.toObject(), { stockResults });
}

export async function recordPurchasePayment(purchaseId, payload, tenant = {}) {
  const order = await getPurchaseOrderById(purchaseId, tenant);
  if (!order) return null;
  const doc = await PurchaseOrder.findById(order._id);
  const amount = num(payload.amount);
  if (amount <= 0) {
    const err = new Error("Payment amount must be greater than zero");
    err.status = 400;
    throw err;
  }
  const payment = await PurchasePayment.create({
    purchaseOrderId: doc._id,
    purchaseId: doc.purchaseId,
    branchId: doc.branchId,
    paymentMode: payload.paymentMode || doc.paymentMode,
    amount,
    paymentDate: payload.paymentDate || todayStr(),
    chequeDetails: payload.chequeDetails || null,
    status: payload.status || "Completed",
    notes: String(payload.notes ?? "").trim(),
  });
  doc.paidAmount = num(doc.paidAmount) + amount;
  const derived = derivePaymentStatus({
    finalAmount: doc.finalAmount,
    paidAmount: doc.paidAmount,
    nextDueDate: doc.nextDueDate,
    cheques: doc.cheques,
  });
  doc.outstandingAmount = derived.outstandingAmount;
  doc.paymentStatus = derived.paymentStatus;
  doc.status = derived.status;
  await doc.save();
  return { order: orderToClient(doc.toObject()), payment };
}

export async function updateChequeStatus(purchaseId, chequeId, status, tenant = {}) {
  const doc = await PurchaseOrder.findOne({
    purchaseId,
    ...branchFilter(tenant.branchId, tenant.isSuperAdmin),
  });
  if (!doc) return null;
  const cheque = doc.cheques.id(chequeId);
  if (!cheque) {
    const err = new Error("Cheque not found");
    err.status = 404;
    throw err;
  }
  cheque.status = CHEQUE_STATUSES.includes(status) ? status : cheque.status;
  if (status === "Cleared") {
    doc.paidAmount = Math.min(doc.finalAmount, num(doc.paidAmount) + num(cheque.amount));
  }
  if (status === "Bounced") {
    doc.paymentStatus = "Overdue";
  }
  doc.nextDueDate = deriveNextDueDate(doc.cheques, doc.nextDueDate);
  const derived = derivePaymentStatus({
    finalAmount: doc.finalAmount,
    paidAmount: doc.paidAmount,
    nextDueDate: doc.nextDueDate,
    cheques: doc.cheques,
  });
  doc.outstandingAmount = derived.outstandingAmount;
  doc.paymentStatus = derived.paymentStatus;
  doc.status = derived.status;
  await doc.save();
  await PurchasePayment.create({
    purchaseOrderId: doc._id,
    purchaseId: doc.purchaseId,
    branchId: doc.branchId,
    paymentMode: "Cheque Payment",
    amount: num(cheque.amount),
    paymentDate: todayStr(),
    chequeDetails: {
      chequeNumber: cheque.chequeNumber,
      bankName: cheque.bankName,
      chequeDate: cheque.chequeDate,
      depositDate: cheque.depositDate,
      dueDate: cheque.dueDate,
      status: cheque.status,
    },
    status: status === "Cleared" ? "Completed" : status,
    notes: `Cheque status updated to ${status}`,
  });
  return orderToClient(doc.toObject());
}

export async function getPurchaseDashboardStats(tenant = {}) {
  const q = branchFilter(tenant.branchId, tenant.isSuperAdmin);
  const orders = await PurchaseOrder.find(q).lean();
  const today = todayStr();
  const monthStart = today.slice(0, 7) + "-01";
  let totalOutstanding = 0;
  let overdueCount = 0;
  let upcomingCheques = 0;
  const vendorPending = {};
  let monthPurchases = 0;
  for (const o of orders) {
    totalOutstanding += num(o.outstandingAmount);
    if (o.paymentStatus === "Overdue") overdueCount += 1;
    if (o.purchaseDate >= monthStart) monthPurchases += num(o.finalAmount);
    if (o.vendorName && num(o.outstandingAmount) > 0) {
      vendorPending[o.vendorName] = (vendorPending[o.vendorName] || 0) + num(o.outstandingAmount);
    }
    for (const c of o.cheques || []) {
      if (c.status === "Cleared" || c.status === "Cancelled" || c.status === "Bounced") continue;
      const d = daysBetween(today, c.dueDate);
      if (d != null && d >= 0 && d <= 7) upcomingCheques += 1;
    }
  }
  const topVendors = Object.entries(vendorPending)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendorName, amount]) => ({ vendorName, amount }));
  return {
    totalOutstanding,
    overdueCount,
    upcomingCheques,
    monthPurchases,
    openOrders: orders.filter((o) => o.status === "Open").length,
    topVendors,
  };
}

export async function getVendorLedger(vendorName, tenant = {}) {
  const q = {
    ...branchFilter(tenant.branchId, tenant.isSuperAdmin),
    vendorName: new RegExp(`^${String(vendorName).trim()}$`, "i"),
  };
  const orders = await PurchaseOrder.find(q).sort({ purchaseDate: -1 }).lean();
  const payments = await PurchasePayment.find({
    purchaseId: { $in: orders.map((o) => o.purchaseId) },
  })
    .sort({ createdAt: -1 })
    .lean();
  return {
    vendorName,
    orders: orders.map((d) => orderToClient(d)),
    payments,
    totalPurchased: orders.reduce((a, o) => a + num(o.finalAmount), 0),
    totalPaid: orders.reduce((a, o) => a + num(o.paidAmount), 0),
    totalOutstanding: orders.reduce((a, o) => a + num(o.outstandingAmount), 0),
  };
}

export async function getOutstandingReport(tenant = {}) {
  const orders = await PurchaseOrder.find({
    ...branchFilter(tenant.branchId, tenant.isSuperAdmin),
    outstandingAmount: { $gt: 0 },
  })
    .sort({ nextDueDate: 1 })
    .lean();
  return orders.map((d) => orderToClient(d));
}

export async function getMonthlyPurchaseReport(month, tenant = {}) {
  const prefix = month || todayStr().slice(0, 7);
  const orders = await PurchaseOrder.find({
    ...branchFilter(tenant.branchId, tenant.isSuperAdmin),
    purchaseDate: new RegExp(`^${prefix}`),
  }).lean();
  return {
    month: prefix,
    count: orders.length,
    totalAmount: orders.reduce((a, o) => a + num(o.finalAmount), 0),
    totalGst: orders.reduce((a, o) => a + num(o.gstAmount), 0),
    orders: orders.map((d) => orderToClient(d)),
  };
}

export async function refreshOverdueStatuses() {
  const orders = await PurchaseOrder.find({
    outstandingAmount: { $gt: 0 },
    status: "Open",
  });
  let updated = 0;
  for (const doc of orders) {
    const derived = derivePaymentStatus({
      finalAmount: doc.finalAmount,
      paidAmount: doc.paidAmount,
      nextDueDate: doc.nextDueDate,
      cheques: doc.cheques,
    });
    if (derived.paymentStatus !== doc.paymentStatus) {
      doc.paymentStatus = derived.paymentStatus;
      doc.outstandingAmount = derived.outstandingAmount;
      await doc.save();
      updated += 1;
    }
  }
  return { updated };
}
