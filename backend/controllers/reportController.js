import { listProducts } from "../services/inventoryService.js";
import { calculateProfit } from "../services/profitService.js";
import Sale from "../models/Sale.js";
import Invoice from "../models/Invoice.js";
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

export async function profitLossReportController(req, res, next) {
  try {
    const inventory = await listProducts(tenant(req));
    const products = inventory.map((product) => {
      const analysis = calculateProfit({
        purchaseRate: product.purchaseRate,
        sellingRate: product.sellingRate ?? product.sellRate,
      });
      return {
        productId: product.id ?? product._id,
        modelName: product.modelName ?? product.model,
        ...analysis,
      };
    });
    const totals = products.reduce(
      (acc, product) => ({
        profit: acc.profit + Math.max(0, product.profit),
        loss: acc.loss + product.loss,
      }),
      { profit: 0, loss: 0 }
    );

    res.json({ totals, products });
  } catch (err) {
    next(err);
  }
}

export async function lowStockReportController(req, res, next) {
  try {
    const inventory = await listProducts(tenant(req));
    res.json(inventory.filter((product) => Number(product.quantity ?? 0) <= Number(product.lowStockThreshold ?? 3)));
  } catch (err) {
    next(err);
  }
}

export async function salesSummaryReportController(req, res, next) {
  try {
    const bf = branchFilter(req);
    const sales = await Sale.find(bf).lean();
    const invoices = await Invoice.find(bf).lean();
    const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
    const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount ?? 0), 0);
    res.json({
      salesCount: sales.length,
      invoiceCount: invoices.length,
      totalRevenue: salesTotal + invoiceTotal,
    });
  } catch (err) {
    next(err);
  }
}
