import mongoose from "mongoose";
import Branch from "../models/Branch.js";
import Purchase from "../models/Purchase.js";
import {
  listAllCategoriesAsLegacyProducts,
  replaceAllCategoriesFromLegacyRows,
} from "./categoryInventoryService.js";
import Sale from "../models/Sale.js";
import Quotation from "../models/Quotation.js";
import Invoice from "../models/Invoice.js";

function strictBranchFilter(branchId) {
  if (!branchId) return {};
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

function inventoryRowToSyncClient(row) {
  const r = row && typeof row === "object" ? row : {};
  const dp = Number(r.dpPlusGst) || Number(r.purchaseRate ?? 0);
  const sellOb = Number(r.newRateWithOB) || Number(r.sellingRate ?? r.sellRate ?? 0);
  return {
    id: r.id ?? r.legacyId ?? (r._id != null ? String(r._id) : ""),
    _id: r._id != null ? String(r._id) : undefined,
    model: r.model ?? r.modelName,
    modelName: r.modelName ?? r.model,
    brand: r.brand ?? "",
    type: r.type || r.category,
    category: r.category ?? r.type,
    ah: r.ah ?? r.capacityAh ?? r.batteryAH ?? 0,
    batteryAH: r.batteryAH ?? r.ah ?? r.capacityAh ?? 0,
    homeSystemType: r.homeSystemType ?? r.comboCategory ?? "",
    inverterVA: Number(r.inverterVA ?? 0),
    warranty: r.warranty ?? "",
    batteryType: r.batteryType ?? "",
    productCapacity: r.productCapacity ?? "",
    weight: Number(r.weight ?? 0),
    scrapRate: Number(r.scrapRate ?? 0),
    dpPlusGst: dp,
    mrp: r.mrp ?? 0,
    newRateWithOB: sellOb,
    newRateWithoutOB: r.newRateWithoutOB ?? 0,
    purchaseRate: dp,
    sellRate: sellOb,
    sellingRate: sellOb,
    quantity: r.quantity ?? 0,
    supplier: r.supplier ?? "",
    place: r.place ?? "",
    invoiceNo: r.invoiceNo ?? "",
    comboId: r.comboId ?? "",
    inverterModel: r.inverterModel ?? "",
    batteryModel: r.batteryModel ?? "",
    backupHours: Number(r.backupHours ?? 0),
    suitableFor: r.suitableFor ?? "",
    comboCategory: r.comboCategory ?? r.homeSystemType ?? "",
    backupSupport: r.backupSupport ?? "",
    _catalogSource: r._catalogSource,
    inverterPrice: Number(r.inverterPrice ?? 0),
    batteryPrice: Number(r.batteryPrice ?? 0),
    amazonPrice: Number(r.amazonPrice ?? 0),
    flipkartPrice: Number(r.flipkartPrice ?? 0),
    batteryBhaiPrice: Number(r.batteryBhaiPrice ?? 0),
    batteryBossPrice: Number(r.batteryBossPrice ?? 0),
    notes: r.notes ?? "",
    _inventoryCategory: r._inventoryCategory,
  };
}

/** Newest quotation first (by createdAt / date, then id). */
export function sortQuotationsNewestFirst(list = []) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.createdAt || a.date || 0).getTime();
    const tb = new Date(b.createdAt || b.date || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(b.id || b.quoteKey || "").localeCompare(String(a.id || a.quoteKey || ""));
  });
}

export function quotationToClient(doc) {
  const d = doc.toObject ? doc.toObject() : { ...doc };
  const items = d.requirements?.legacyItems ?? [];
  const total = Number(d.requirements?.legacyTotal ?? d.suggestedOptions?.[0]?.totalPrice ?? d.finalTotal ?? 0);
  return {
    _id: d._id?.toString(),
    id: d.externalId || d.quoteKey || String(d._id),
    quoteKey: d.quoteKey,
    quotationKind: d.quotationKind,
    documentStage: d.documentStage,
    customer: d.customerName,
    customerName: d.customerName,
    phone: d.customerPhone,
    customerPhone: d.customerPhone,
    customerAddress: d.customerAddress ?? "",
    date: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
    createdAt: d.createdAt,
    items,
    status: d.status || "Pending",
    total,
    flatType: d.flatType,
    backupHours: d.backupHours,
    budgetType: d.budgetType,
    totalLoad: d.totalLoad,
    suggestedOptions: d.suggestedOptions,
    options: d.suggestedOptions,
    selectedOption: d.selectedOption ?? d.suggestedOptions?.[0] ?? null,
    recommendedOptionLabel: d.recommendedOptionLabel,
    recommendationMode: d.recommendationMode,
    additionalCharges: d.additionalCharges,
    discount: d.discount ?? 0,
    gstRate: d.gstRate ?? 18,
    pricingMode: d.pricingMode ?? "withOld",
    finalQuotationPdfUrl: d.finalQuotationPdfUrl ?? d.quotationPdfUrl,
    quotationPdfUrl: d.finalQuotationPdfUrl ?? d.quotationPdfUrl,
    pdfUrl: d.finalQuotationPdfUrl ?? d.quotationPdfUrl,
    appliancesNote: d.appliancesNote,
    requirements: d.requirements,
  };
}

export function invoiceToClient(doc) {
  const d = doc.toObject ? doc.toObject() : { ...doc };
  const items = (d.products || []).map((i) => ({
    model: i.modelName,
    modelName: i.modelName,
    qty: i.quantity,
    quantity: i.quantity,
    rate: i.rate,
    amount: i.amount,
  }));
  return {
    id: d.externalId || d.invoiceNumber || String(d._id),
    invoiceNumber: d.invoiceNumber,
    customer: d.customerDetails?.name ?? "",
    phone: d.customerDetails?.phone ?? "",
    address: d.customerDetails?.address ?? "",
    date: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
    createdAt: d.createdAt,
    quotationId: d.quotationId ?? "",
    items,
    products: d.products,
    subtotal: d.subtotal ?? 0,
    gst: d.gst ?? 0,
    gstRate: d.gstRate ?? 18,
    total: d.totalAmount ?? 0,
    totalAmount: d.totalAmount ?? 0,
    paid: d.paymentStatus === "Paid",
    paymentStatus: d.paymentStatus,
    paymentMode: d.paymentMode,
    invoicePdfUrl: d.invoicePdfUrl,
    pdfUrl: d.invoicePdfUrl,
    inverter: d.inverter,
    battery: d.battery,
    additionalCharges: d.additionalCharges,
  };
}

export function purchaseToClient(doc) {
  const p = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: p.externalId || String(p._id),
    billDetails: p.billDetails,
    billNo: p.billNo,
    supplier: p.supplier,
    place: p.place,
    date: p.date,
    items: p.items || [],
    total: p.total ?? 0,
  };
}

export function saleToClient(doc) {
  const s = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: s.externalId || String(s._id),
    customer: s.customer,
    phone: s.phone,
    date: s.date,
    items: s.items || [],
    total: s.total ?? 0,
  };
}

export async function getSyncPayload({ branchId, isSuperAdmin }) {
  let resolved = branchId;
  if (!resolved && isSuperAdmin) {
    const b = await Branch.findOne().sort({ createdAt: 1 });
    resolved = b?._id.toString() ?? null;
  }
  if (!resolved) {
    return { inventory: [], purchases: [], sales: [], quotations: [], invoices: [] };
  }
  const bf = strictBranchFilter(resolved);
  const [inventoryRows, purchases, sales, quotations, invoices] = await Promise.all([
    listAllCategoriesAsLegacyProducts({
      branchId: resolved,
      isSuperAdmin,
      includeProfit: false,
      strictBranch: true,
    }),
    Purchase.find(bf).sort({ createdAt: -1 }).lean(),
    Sale.find(bf).sort({ createdAt: -1 }).lean(),
    Quotation.find(bf).sort({ createdAt: -1 }).lean(),
    Invoice.find(bf).sort({ createdAt: -1 }).lean(),
  ]);

  return {
    inventory: inventoryRows.map((row) => inventoryRowToSyncClient(row)),
    purchases: purchases.map((p) => purchaseToClient(p)),
    sales: sales.map((s) => saleToClient(s)),
    quotations: sortQuotationsNewestFirst(quotations.map((q) => quotationToClient(q))),
    invoices: invoices.map((i) => invoiceToClient(i)),
  };
}

function parseBranchId(branchId) {
  if (!branchId) return null;
  try {
    return new mongoose.Types.ObjectId(branchId);
  } catch {
    return null;
  }
}

/**
 * Same branch resolution as {@link getSyncPayload} for reads: superAdmin without JWT/body
 * branch still targets the first Branch document so shop sync writes are not dropped with 400.
 */
async function resolveBranchIdForSyncWrite(body, { branchId, isSuperAdmin }) {
  if (isSuperAdmin) {
    const fromBody = parseBranchId(body.branchId);
    if (fromBody) return fromBody;
    const fromJwt = parseBranchId(branchId);
    if (fromJwt) return fromJwt;
    const b = await Branch.findOne().sort({ createdAt: 1 });
    return b?._id || null;
  }
  return parseBranchId(branchId);
}

export async function applySyncPayload(body, { branchId, isSuperAdmin }) {
  const bid = await resolveBranchIdForSyncWrite(body, { branchId, isSuperAdmin });
  if (!bid) {
    const err = new Error(
      "branchId required: assign this user to a branch (Users) or ensure at least one Branch exists.",
    );
    err.status = 400;
    throw err;
  }

  const inventory = body.inventory ?? [];
  const purchases = body.purchases ?? [];
  const sales = body.sales ?? [];
  const quotations = body.quotations ?? [];
  const invoices = body.invoices ?? [];

  /**
   * Never replace category inventory with zero rows — that wipes MongoDB after Excel upload
   * when the debounced client sync races with an empty `inventory` array.
   */
  if (inventory.length === 0) {
    console.warn(
      "[sync] SKIPPING inventory bulk replace — empty inventory[] (would delete all category stock for this branch).",
      {
        branchId: String(bid),
        database: mongoose.connection?.db?.databaseName,
      },
    );
  } else {
    console.log("[sync] Replacing category inventory collections from sync payload:", {
      rows: inventory.length,
      branchId: String(bid),
      database: mongoose.connection?.db?.databaseName,
    });
    await replaceAllCategoriesFromLegacyRows(inventory, bid.toString());
  }

  await Purchase.deleteMany({ branchId: bid });
  for (const p of purchases) {
    await Purchase.create({
      branchId: bid,
      externalId: String(p.id ?? ""),
      billDetails: p.billDetails ?? "",
      billNo: p.billNo ?? "",
      supplier: p.supplier ?? "",
      place: p.place ?? "",
      date: p.date ?? "",
      items: p.items ?? [],
      total: Number(p.total ?? 0),
    });
  }

  await Sale.deleteMany({ branchId: bid });
  for (const s of sales) {
    await Sale.create({
      branchId: bid,
      externalId: String(s.id ?? ""),
      customer: s.customer ?? "",
      phone: s.phone ?? "",
      date: s.date ?? "",
      items: s.items ?? [],
      total: Number(s.total ?? 0),
    });
  }

  await Quotation.deleteMany({ branchId: bid, "requirements.legacy": true });
  for (const q of quotations) {
    await Quotation.create({
      branchId: bid,
      customerName: q.customer ?? q.customerName ?? "",
      customerPhone: q.phone ?? q.customerPhone ?? "",
      flatType: "",
      backupHours: 0,
      budgetType: "Recommended",
      suggestedOptions: [],
      status: q.status ?? "Pending",
      requirements: {
        legacy: true,
        legacyItems: q.items ?? [],
        legacyTotal: Number(q.total ?? 0),
      },
      externalId: String(q.id ?? ""),
    });
  }

  // Only clear invoices that originated from this legacy shop-sync flow.
  // Never delete demo/sample invoices or invoices created via the Tax Invoice
  // workflow (those carry a real INV-* number, not an INV-SYNC-* one).
  await Invoice.deleteMany({ branchId: bid, isDemoData: { $ne: true }, invoiceNumber: /^INV-SYNC-/ });
  let invIdx = 0;
  for (const inv of invoices) {
    const products = (inv.items ?? []).map((i) => ({
      productId: String(i.inventoryId ?? i.productId ?? ""),
      modelName: i.model ?? i.modelName ?? "",
      quantity: Number(i.qty ?? i.quantity ?? 1),
      rate: Number(i.rate ?? 0),
      amount: Number(i.amount ?? (i.rate ?? 0) * (i.qty ?? i.quantity ?? 1)),
      purchaseRate: Number(i.purchaseRate ?? 0),
    }));
    const subtotal = Number(inv.subtotal ?? products.reduce((a, i) => a + i.amount, 0));
    const gst = Number(inv.gst ?? 0);
    const totalAmount = Number(inv.total ?? subtotal + gst);
    const invoiceNumber = `INV-SYNC-${Date.now()}-${invIdx++}`;
    await Invoice.create({
      branchId: bid,
      invoiceNumber,
      externalId: String(inv.id ?? ""),
      customerDetails: {
        name: inv.customer ?? "",
        phone: inv.phone ?? "",
        place: "",
        address: "",
      },
      quotationId: inv.quotationId ?? null,
      products,
      subtotal,
      gst,
      gstRate: 18,
      totalAmount,
      paymentStatus: inv.paid ? "Paid" : "Unpaid",
    });
  }

  return getSyncPayload({ branchId: bid.toString(), isSuperAdmin });
}
