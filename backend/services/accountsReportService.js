import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import Invoice from "../models/Invoice.js";
import Purchase from "../models/Purchase.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Expense, { EXPENSE_CATEGORIES } from "../models/Expense.js";
import CaProfile from "../models/CaProfile.js";
import Branch from "../models/Branch.js";
import { listProducts } from "./inventoryService.js";
import { getOutstandingReport } from "./purchaseManagementService.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function branchObjectId(branchId) {
  return branchId ? new mongoose.Types.ObjectId(branchId) : null;
}

/** Mongo filter restricting to the tenant branch unless super admin. */
function branchFilter({ branchId, isSuperAdmin } = {}) {
  if (isSuperAdmin || !branchId) return {};
  return { branchId: branchObjectId(branchId) };
}

/** Pull a usable YYYY-MM-DD date from a record (string date or createdAt). */
function recordDate(rec) {
  const d = rec?.date || rec?.purchaseDate || rec?.createdAt;
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function inRange(dateStr, from, to) {
  if (!dateStr) return !from && !to;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

/** Normalize {from,to,month} into {from,to,label}. */
export function resolvePeriod({ from, to, month } = {}) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, label: month };
  }
  const label = from || to ? `${from || "…"} → ${to || "…"}` : "All time";
  return { from: from || "", to: to || "", label };
}

async function branchesMap() {
  const branches = await Branch.find().lean();
  return new Map(branches.map((b) => [String(b._id), b.branchName || b.name || b.code || "Branch"]));
}

async function loadDataset(tenant, period) {
  const bf = branchFilter(tenant);
  const { from, to } = period;
  const [sales, invoices, legacyPurchases, purchaseOrders, expenses] = await Promise.all([
    Sale.find(bf).lean(),
    Invoice.find(bf).lean(),
    Purchase.find(bf).lean(),
    PurchaseOrder.find(bf).lean(),
    Expense.find(bf).lean(),
  ]);
  const keep = (rec) => inRange(recordDate(rec), from, to);
  return {
    sales: sales.filter(keep),
    invoices: invoices.filter(keep),
    legacyPurchases: legacyPurchases.filter(keep),
    purchaseOrders: purchaseOrders.filter(keep),
    expenses: expenses.filter(keep),
  };
}

function sumSales(ds) {
  const salesTotal = ds.sales.reduce((a, s) => a + num(s.total), 0);
  const invoiceTotal = ds.invoices.reduce((a, i) => a + num(i.totalAmount ?? i.total ?? i.finalTotal), 0);
  return { salesTotal, invoiceTotal, total: salesTotal + invoiceTotal };
}

function sumPurchases(ds) {
  const orderTotal = ds.purchaseOrders.reduce((a, p) => a + num(p.finalAmount), 0);
  const legacyTotal = ds.legacyPurchases.reduce((a, p) => a + num(p.total), 0);
  return { orderTotal, legacyTotal, total: orderTotal + legacyTotal };
}

function sumExpenses(ds) {
  return ds.expenses.reduce((a, e) => a + num(e.amount), 0);
}

function gstCollected(ds) {
  return ds.invoices.reduce((a, i) => a + num(i.gst ?? i.gstAmount), 0);
}

function gstPaid(ds) {
  const onPurchases = ds.purchaseOrders.reduce((a, p) => a + num(p.gstAmount), 0);
  const onExpenses = ds.expenses.reduce((a, e) => a + num(e.gstAmount), 0);
  return onPurchases + onExpenses;
}

/* ------------------------------------------------------------------ */
/* 1. Dashboard                                                        */
/* ------------------------------------------------------------------ */
export async function getAccountsDashboard(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);
  const sales = sumSales(ds);
  const purchases = sumPurchases(ds);
  const expenses = sumExpenses(ds);
  const collected = gstCollected(ds);
  const paid = gstPaid(ds);
  const netProfit = sales.total - purchases.total - expenses;
  return {
    period,
    totalSales: sales.total,
    totalPurchases: purchases.total,
    totalExpenses: expenses,
    gstCollected: collected,
    gstPaid: paid,
    gstNetPayable: collected - paid,
    netProfit,
    counts: {
      sales: ds.sales.length,
      invoices: ds.invoices.length,
      purchaseOrders: ds.purchaseOrders.length,
      expenses: ds.expenses.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. Sales reports                                                    */
/* ------------------------------------------------------------------ */
export async function getSalesReport(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);
  const bmap = await branchesMap();

  const rows = [
    ...ds.sales.map((s) => ({
      date: recordDate(s),
      branchId: String(s.branchId ?? ""),
      customer: s.customer || "",
      amount: num(s.total),
      gst: 0,
      source: "Sale",
    })),
    ...ds.invoices.map((i) => ({
      date: recordDate(i),
      branchId: String(i.branchId ?? ""),
      customer: i.customerDetails?.name || "",
      amount: num(i.totalAmount ?? i.total),
      gst: num(i.gst ?? i.gstAmount),
      gstRate: num(i.gstRate),
      source: "Invoice",
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const groupSum = (keyFn) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      const cur = map.get(k) || { key: k, amount: 0, gst: 0, count: 0 };
      cur.amount += r.amount;
      cur.gst += r.gst;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()];
  };

  const daily = groupSum((r) => r.date || "—").sort((a, b) => (a.key < b.key ? 1 : -1));
  const monthly = groupSum((r) => (r.date ? r.date.slice(0, 7) : "—")).sort((a, b) => (a.key < b.key ? 1 : -1));
  const branchWise = groupSum((r) => r.branchId).map((g) => ({
    ...g,
    branchName: bmap.get(g.key) || "Unassigned",
  }));
  const gstWise = groupSum((r) => (r.source === "Invoice" ? `${num(r.gstRate) || 18}%` : "No GST (Sale)"));

  const totals = rows.reduce((a, r) => ({ amount: a.amount + r.amount, gst: a.gst + r.gst }), { amount: 0, gst: 0 });
  return { period, totals, count: rows.length, daily, monthly, branchWise, gstWise, rows };
}

/* ------------------------------------------------------------------ */
/* 3. Purchase reports                                                 */
/* ------------------------------------------------------------------ */
export async function getPurchaseReport(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);

  const vendorMap = new Map();
  for (const po of ds.purchaseOrders) {
    const key = po.vendorName || "Unknown vendor";
    const cur = vendorMap.get(key) || { vendor: key, total: 0, paid: 0, outstanding: 0, orders: 0, gst: 0 };
    cur.total += num(po.finalAmount);
    cur.paid += num(po.paidAmount);
    cur.outstanding += num(po.outstandingAmount);
    cur.gst += num(po.gstAmount);
    cur.orders += 1;
    vendorMap.set(key, cur);
  }
  const vendorWise = [...vendorMap.values()].sort((a, b) => b.total - a.total);

  let outstanding = { rows: [], totalOutstanding: 0 };
  try {
    outstanding = await getOutstandingReport(tenant);
  } catch {
    /* purchase-management may be empty */
  }

  const chequeDue = [];
  for (const po of ds.purchaseOrders.concat(await PurchaseOrder.find(branchFilter(tenant)).lean())) {
    for (const c of po.cheques || []) {
      if (["Pending", "Deposited"].includes(c.status) && c.dueDate) {
        chequeDue.push({
          purchaseId: po.purchaseId,
          vendor: po.vendorName,
          chequeNumber: c.chequeNumber,
          bankName: c.bankName,
          amount: num(c.amount),
          dueDate: c.dueDate,
          status: c.status,
        });
      }
    }
  }
  // De-dupe (concat above may repeat) and sort by due date.
  const seen = new Set();
  const chequeDueUnique = chequeDue
    .filter((c) => {
      const k = `${c.purchaseId}|${c.chequeNumber}|${c.dueDate}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const totals = sumPurchases(ds);
  return {
    period,
    totals: { total: totals.total, gst: ds.purchaseOrders.reduce((a, p) => a + num(p.gstAmount), 0) },
    vendorWise,
    outstanding,
    chequeDue: chequeDueUnique,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Expense reports                                                  */
/* ------------------------------------------------------------------ */
export async function getExpenseReport(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);
  const byCategory = EXPENSE_CATEGORIES.map((category) => {
    const rows = ds.expenses.filter((e) => e.category === category);
    return { category, amount: rows.reduce((a, e) => a + num(e.amount), 0), count: rows.length };
  });
  const total = sumExpenses(ds);
  const rows = ds.expenses
    .map((e) => ({
      id: e._id?.toString(),
      date: recordDate(e),
      category: e.category,
      title: e.title,
      vendor: e.vendor,
      amount: num(e.amount),
      gstAmount: num(e.gstAmount),
      paymentMode: e.paymentMode,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { period, total, byCategory, rows };
}

/* ------------------------------------------------------------------ */
/* 5. Inventory reports (opening / purchased / sold / closing)         */
/* ------------------------------------------------------------------ */
export async function getInventoryReport(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);
  const products = await listProducts({ ...tenant, includeProfit: false });

  const closingUnits = products.reduce((a, p) => a + num(p.quantity), 0);
  const closingValue = products.reduce((a, p) => a + num(p.quantity) * num(p.purchaseRate), 0);

  let purchasedUnits = 0;
  let purchasedValue = 0;
  for (const po of ds.purchaseOrders) {
    for (const it of po.products || []) {
      purchasedUnits += num(it.qty);
      purchasedValue += num(it.qty) * num(it.purchaseRate);
    }
  }

  let soldUnits = 0;
  const countItems = (items) => {
    for (const it of items || []) soldUnits += num(it.quantity ?? it.qty ?? 1);
  };
  ds.invoices.forEach((i) => countItems(i.products));
  ds.sales.forEach((s) => countItems(s.items));

  // Opening = Closing - Purchased + Sold (period reconciliation).
  const openingUnits = closingUnits - purchasedUnits + soldUnits;

  const productRows = products
    .map((p) => ({
      model: p.modelName ?? p.model ?? "—",
      brand: p.brand ?? "",
      type: p.type ?? p.category ?? "",
      quantity: num(p.quantity),
      purchaseRate: num(p.purchaseRate),
      stockValue: num(p.quantity) * num(p.purchaseRate),
    }))
    .sort((a, b) => b.stockValue - a.stockValue);

  return {
    period,
    summary: {
      openingUnits,
      purchasedUnits,
      purchasedValue,
      soldUnits,
      closingUnits,
      closingValue,
    },
    products: productRows,
  };
}

/* ------------------------------------------------------------------ */
/* 6. GST reports                                                      */
/* ------------------------------------------------------------------ */
export async function getGstReport(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);

  // Output GST (on sales / tax invoices) — split into CGST+SGST (intra-state) or IGST (inter-state).
  const outputMap = new Map();
  let outTaxable = 0, outCgst = 0, outSgst = 0, outIgst = 0;
  for (const i of ds.invoices) {
    const rate = `${num(i.gstRate) || 18}%`;
    const taxable = num(i.subtotal ?? i.productTotal);
    const gst = num(i.gst ?? i.gstAmount);
    const inter = Boolean(i.interState);
    const igst = inter ? gst : 0;
    const cgst = inter ? 0 : gst / 2;
    const sgst = inter ? 0 : gst / 2;
    const cur = outputMap.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, count: 0 };
    cur.taxable += taxable;
    cur.cgst += cgst;
    cur.sgst += sgst;
    cur.igst += igst;
    cur.gst += gst;
    cur.count += 1;
    outputMap.set(rate, cur);
    outTaxable += taxable; outCgst += cgst; outSgst += sgst; outIgst += igst;
  }
  const output = [...outputMap.values()];
  const outputTotal = outCgst + outSgst + outIgst;

  // Input GST (on purchases) — treated as intra-state CGST+SGST.
  const inputMap = new Map();
  let inTaxable = 0, inCgst = 0, inSgst = 0, inIgst = 0;
  for (const p of ds.purchaseOrders) {
    const rate = `${num(p.gstPercent) || 18}%`;
    const taxable = num(p.subtotal);
    const gst = num(p.gstAmount);
    const inter = Boolean(p.interState);
    const igst = inter ? gst : 0;
    const cgst = inter ? 0 : gst / 2;
    const sgst = inter ? 0 : gst / 2;
    const cur = inputMap.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, count: 0 };
    cur.taxable += taxable;
    cur.cgst += cgst;
    cur.sgst += sgst;
    cur.igst += igst;
    cur.gst += gst;
    cur.count += 1;
    inputMap.set(rate, cur);
    inTaxable += taxable; inCgst += cgst; inSgst += sgst; inIgst += igst;
  }
  const input = [...inputMap.values()];
  const inputTotal = inCgst + inSgst + inIgst;

  return {
    period,
    output,
    input,
    summary: {
      taxableAmount: outTaxable,
      cgst: outCgst,
      sgst: outSgst,
      igst: outIgst,
      outputGst: outputTotal,
      inputTaxable: inTaxable,
      inputCgst: inCgst,
      inputSgst: inSgst,
      inputIgst: inIgst,
      inputGst: inputTotal,
      netPayable: outputTotal - inputTotal,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 7. Profit & Loss                                                    */
/* ------------------------------------------------------------------ */
export async function getProfitLossReport(tenant, query = {}) {
  const period = resolvePeriod(query);
  const ds = await loadDataset(tenant, period);
  const sales = sumSales(ds);
  const purchases = sumPurchases(ds);
  const expenseTotal = sumExpenses(ds);

  const expenseByCategory = EXPENSE_CATEGORIES.map((category) => ({
    category,
    amount: ds.expenses.filter((e) => e.category === category).reduce((a, e) => a + num(e.amount), 0),
  }));

  const revenue = [
    { label: "Counter sales", amount: sales.salesTotal },
    { label: "Tax invoices", amount: sales.invoiceTotal },
  ];
  const totalRevenue = sales.total;
  const totalExpenses = purchases.total + expenseTotal;
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    period,
    revenue,
    totalRevenue,
    expenses: [{ label: "Purchases (COGS)", amount: purchases.total }, ...expenseByCategory.map((e) => ({ label: e.category, amount: e.amount }))],
    totalExpenses,
    netProfit,
    margin: Number(margin.toFixed(2)),
  };
}

/* ------------------------------------------------------------------ */
/* Expense CRUD                                                        */
/* ------------------------------------------------------------------ */
export async function listExpenses(tenant, query = {}) {
  const bf = branchFilter(tenant);
  if (query.category && EXPENSE_CATEGORIES.includes(query.category)) bf.category = query.category;
  const docs = await Expense.find(bf).sort({ date: -1, createdAt: -1 }).limit(500).lean();
  return docs.map((d) => ({ ...d, id: d._id.toString() }));
}

export async function createExpense(payload, tenant) {
  if (!EXPENSE_CATEGORIES.includes(payload.category)) {
    const err = new Error(`Invalid category. Allowed: ${EXPENSE_CATEGORIES.join(", ")}`);
    err.status = 400;
    throw err;
  }
  if (!(num(payload.amount) > 0)) {
    const err = new Error("Amount must be greater than 0");
    err.status = 400;
    throw err;
  }
  const doc = await Expense.create({
    branchId: tenant.branchId ? branchObjectId(tenant.branchId) : payload.branchId ? branchObjectId(payload.branchId) : null,
    category: payload.category,
    title: String(payload.title || "").trim(),
    amount: num(payload.amount),
    date: payload.date || new Date().toISOString().slice(0, 10),
    paymentMode: payload.paymentMode || "Cash",
    vendor: String(payload.vendor || "").trim(),
    gstAmount: num(payload.gstAmount),
    notes: String(payload.notes || "").trim(),
    createdBy: tenant.userId ? branchObjectId(tenant.userId) : null,
  });
  return { ...doc.toObject(), id: doc._id.toString() };
}

export async function deleteExpense(id, tenant) {
  const bf = branchFilter(tenant);
  const doc = await Expense.findOneAndDelete({ _id: id, ...bf });
  if (!doc) {
    const err = new Error("Expense not found");
    err.status = 404;
    throw err;
  }
  return { deleted: true, id };
}

/* ------------------------------------------------------------------ */
/* CA profile                                                          */
/* ------------------------------------------------------------------ */
export async function getCaProfile(tenant) {
  const branchId = tenant.isSuperAdmin ? null : tenant.branchId ? branchObjectId(tenant.branchId) : null;
  let doc = await CaProfile.findOne(branchId ? { branchId } : { branchId: null }).lean();
  if (!doc) doc = await CaProfile.findOne({ branchId: null }).lean();
  return doc ? { ...doc, id: doc._id.toString() } : { caName: "", firmName: "", email: "", mobile: "" };
}

export async function upsertCaProfile(payload, tenant) {
  const branchId = tenant.isSuperAdmin ? null : tenant.branchId ? branchObjectId(tenant.branchId) : null;
  const update = {
    caName: String(payload.caName || "").trim(),
    firmName: String(payload.firmName || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    mobile: String(payload.mobile || "").trim(),
    updatedBy: tenant.userId ? branchObjectId(tenant.userId) : null,
  };
  const doc = await CaProfile.findOneAndUpdate(
    { branchId: branchId || null },
    { $set: update, $setOnInsert: { branchId: branchId || null } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return { ...doc, id: doc._id.toString() };
}
