/**
 * Multi-branch analytics for HQ Admin and branch managers.
 */
import mongoose from "mongoose";
import Branch from "../models/Branch.js";
import Invoice from "../models/Invoice.js";
import Quotation from "../models/Quotation.js";
import Purchase from "../models/Purchase.js";
import Expense from "../models/Expense.js";
import Sale from "../models/Sale.js";
import { listAllCategoriesAsLegacyProducts } from "./categoryInventoryService.js";
import { companyFromBranch } from "./branchScopeService.js";

function parseDateRange(query = {}) {
  const now = new Date();
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  const preset = String(query.preset || query.range || "this_month").toLowerCase();
  let from = query.from ? new Date(query.from) : null;
  let to = query.to ? new Date(query.to) : null;

  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    if (preset === "today") {
      from = startOfDay(now);
      to = endOfDay(now);
    } else if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
    } else if (preset === "this_week") {
      const d = new Date(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      from = startOfDay(d);
      to = endOfDay(now);
    } else if (preset === "last_month") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (preset === "this_year") {
      from = new Date(now.getFullYear(), 0, 1);
      to = endOfDay(now);
    } else {
      // this_month
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = endOfDay(now);
    }
  }

  return { from, to, preset };
}

function branchMatch(scope) {
  if (!scope || scope.mode === "all") return {};
  if (!scope.branchObjectId) return { branchId: { $exists: false } };
  return { branchId: scope.branchObjectId };
}

function dateMatch(from, to, field = "createdAt") {
  return { [field]: { $gte: from, $lte: to } };
}

async function sumInvoices(filter) {
  const rows = await Invoice.find(filter).select("total totalAmount finalTotal subtotal gstAmount").lean();
  let total = 0;
  for (const r of rows) {
    total += Number(r.total ?? r.totalAmount ?? r.finalTotal ?? 0) || 0;
  }
  return { count: rows.length, total };
}

async function sumPurchases(filter) {
  const rows = await Purchase.find(filter).select("totalAmount total").lean();
  let total = 0;
  for (const r of rows) total += Number(r.totalAmount ?? r.total ?? 0) || 0;
  return { count: rows.length, total };
}

async function sumExpenses(filter) {
  const rows = await Expense.find(filter).select("amount").lean();
  let total = 0;
  for (const r of rows) total += Number(r.amount ?? 0) || 0;
  return { count: rows.length, total };
}

async function sumSales(filter) {
  if (!Sale) return { count: 0, total: 0 };
  try {
    const rows = await Sale.find(filter).select("totalAmount total").lean();
    let total = 0;
    for (const r of rows) total += Number(r.totalAmount ?? r.total ?? 0) || 0;
    return { count: rows.length, total };
  } catch {
    return { count: 0, total: 0 };
  }
}

async function inventorySnapshot(branchId, isHqAll) {
  const rows = await listAllCategoriesAsLegacyProducts({
    branchId: isHqAll ? null : branchId,
    isSuperAdmin: Boolean(isHqAll),
    includeProfit: true,
    strictBranch: Boolean(branchId) && !isHqAll,
  });
  let units = 0;
  let value = 0;
  let lowStock = 0;
  for (const r of rows) {
    const q = Number(r.quantity ?? 0) || 0;
    units += q;
    const rate = Number(r.purchaseRate ?? r.dp ?? r.dpPlusGst ?? 0) || 0;
    value += q * rate;
    if (q > 0 && q <= 4) lowStock += 1;
  }
  return { productCount: rows.length, units, inventoryValue: value, lowStockCount: lowStock };
}

export async function getMultiBranchAnalytics(scope, query = {}) {
  const { from, to, preset } = parseDateRange(query);
  const base = { ...branchMatch(scope), ...dateMatch(from, to) };

  const branches = await Branch.find({ active: { $ne: false } })
    .sort({ name: 1 })
    .lean();

  const inv = await sumInvoices(base);
  const purchases = await sumPurchases(base);
  const expenses = await sumExpenses(base);
  const sales = await sumSales(base);
  const quotations = await Quotation.countDocuments(base);

  const salesTotal = inv.total || sales.total;
  const grossProfit = Math.max(0, salesTotal - purchases.total);
  const netProfit = grossProfit - expenses.total;

  const inventory = await inventorySnapshot(
    scope.mode === "one" ? scope.branchId : null,
    scope.mode === "all",
  );

  /** Per-branch breakdown (for HQ all view, or single branch detail). */
  const byBranch = [];
  const targets =
    scope.mode === "one"
      ? branches.filter((b) => String(b._id) === String(scope.branchId))
      : branches;

  for (const b of targets) {
    const bid = b._id;
    const f = { branchId: bid, ...dateMatch(from, to) };
    const bInv = await sumInvoices(f);
    const bPur = await sumPurchases(f);
    const bExp = await sumExpenses(f);
    const bSales = bInv.total;
    const bGross = Math.max(0, bSales - bPur.total);
    const bNet = bGross - bExp.total;
    const bStock = await inventorySnapshot(String(bid), false);
    byBranch.push({
      branchId: String(bid),
      name: b.name || b.branchName,
      code: b.code || b.branchId,
      businessName: b.businessName || "BatteryMela",
      sales: bSales,
      purchases: bPur.total,
      expenses: bExp.total,
      grossProfit: bGross,
      netProfit: bNet,
      invoices: bInv.count,
      inventoryValue: bStock.inventoryValue,
      lowStockCount: bStock.lowStockCount,
      company: companyFromBranch(b),
    });
  }

  byBranch.sort((a, b) => b.sales - a.sales);
  const topBranch = byBranch[0] || null;

  return {
    preset,
    from: from.toISOString(),
    to: to.toISOString(),
    scope: {
      mode: scope.mode,
      branchId: scope.branchId,
      isHq: scope.isHq,
    },
    totals: {
      sales: salesTotal,
      purchases: purchases.total,
      expenses: expenses.total,
      grossProfit,
      netProfit,
      quotations,
      invoices: inv.count,
      inventoryValue: inventory.inventoryValue,
      lowStockCount: inventory.lowStockCount,
      productCount: inventory.productCount,
      stockUnits: inventory.units,
    },
    byBranch,
    topPerformingBranch: topBranch
      ? { branchId: topBranch.branchId, name: topBranch.name, businessName: topBranch.businessName, sales: topBranch.sales, netProfit: topBranch.netProfit }
      : null,
    charts: {
      salesByBranch: byBranch.map((b) => ({ label: b.name, businessName: b.businessName, value: b.sales })),
      profitByBranch: byBranch.map((b) => ({ label: b.name, businessName: b.businessName, value: b.netProfit })),
      purchasesByBranch: byBranch.map((b) => ({ label: b.name, businessName: b.businessName, value: b.purchases })),
    },
  };
}
