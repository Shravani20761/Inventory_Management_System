/**
 * Demo data seeder for the Accounts & CA Reports module — May 2026.
 *
 * Creates a realistic testing environment WITHOUT touching live inventory:
 *   - 50 sample Tax Invoices (Invoice collection) across Wakad + Pimple Saudagar
 *   - ~14 Purchase Orders (for COGS / input GST / vendor + cheque reports)
 *   - May operating Expenses (Rent, Electricity, Salaries, Transportation, Misc)
 *
 * Every generated record is flagged `isDemoData: true` so it can be removed:
 *   node --use-system-ca server/scripts/seedDemoMayInvoices.js          # seed
 *   node --use-system-ca server/scripts/seedDemoMayInvoices.js clear    # delete demo data
 *
 * IMPORTANT: This script only INSERTS into invoices / purchase_orders / expenses.
 * It never modifies inventory quantities or any existing records. CA Reports read
 * live from these collections, so the dashboards update automatically.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongodb.js";
import Invoice from "../models/Invoice.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Expense from "../models/Expense.js";
import Branch from "../models/Branch.js";

const MONTH = "2026-05";
const YEAR = 2026;
const MONTH_INDEX = 4; // May (0-based)

const BRANCH_DEFS = [
  { branchId: "wakad", branchName: "Wakad Branch", name: "Wakad Branch", code: "WAKAD", address: "Wakad, Pune", city: "Pune", active: true },
  { branchId: "pimple_saudagar", branchName: "Pimple Saudagar Branch", name: "Pimple Saudagar Branch", code: "PIMPLE", address: "Pimple Saudagar, Pune", city: "Pune", active: true },
];

/** Realistic product catalogue. GST: inverters/trolley 18%, lead-acid batteries 28%. */
const PRODUCTS = [
  { label: "Luminous Zelio 1100 Inverter + 150Ah Battery Combo", kind: "Inverter + Battery Combo", rate: 21500, gstRate: 18 },
  { label: "Microtek 950VA Inverter + 135Ah Battery Combo", kind: "Inverter + Battery Combo", rate: 18200, gstRate: 18 },
  { label: "Exide 150Ah Inverter Battery (Replacement)", kind: "Battery Replacement", rate: 13800, gstRate: 28 },
  { label: "Amaron 135Ah Inverter Battery (Replacement)", kind: "Battery Replacement", rate: 12600, gstRate: 28 },
  { label: "Amaron Go 35Ah Car Battery", kind: "Car Battery Sales", rate: 4200, gstRate: 28 },
  { label: "Exide Mileage 65Ah Car Battery", kind: "Car Battery Sales", rate: 6800, gstRate: 28 },
  { label: "Exide 9Ah Bike Battery", kind: "Bike Battery Sales", rate: 1450, gstRate: 28 },
  { label: "Amaron 5Ah Bike Battery", kind: "Bike Battery Sales", rate: 1150, gstRate: 28 },
  { label: "Luminous Inverter Trolley", kind: "Trolley Sales", rate: 1850, gstRate: 18 },
  { label: "Microtek Heavy-Duty Trolley", kind: "Trolley Sales", rate: 2200, gstRate: 18 },
];

const CUSTOMERS = [
  "Rahul Sharma", "Priya Deshmukh", "Amit Patil", "Sneha Kulkarni", "Vikram Joshi",
  "Anjali More", "Suresh Pawar", "Neha Gupta", "Rajesh Kale", "Pooja Shinde",
  "Manish Agarwal", "Kavita Bhosale", "Deepak Naik", "Swati Jadhav", "Nikhil Mehta",
  "Sonali Chavan", "Arjun Reddy", "Meena Iyer", "Sandeep Rao", "Aarti Salunke",
];
const PLACES = ["Wakad", "Pimple Saudagar", "Hinjewadi", "Baner", "Aundh", "Balewadi", "Tathawade", "Ravet"];
const PAYMENT_MODES = ["Cash", "UPI", "Card", "Cheque", "Credit"];
const VENDORS = [
  { name: "Exide Industries Pune", gst: "27AAACE1234F1Z5" },
  { name: "Luminous Power Distributor", gst: "27AAACL5678G1Z3" },
  { name: "Amaron Battery Depot", gst: "27AAACA9012H1Z1" },
  { name: "Microtek Wholesale", gst: "27AAACM3456J1Z9" },
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function round2(n) { return Math.round(n * 100) / 100; }

/** Build a Date inside May 2026 for the given day-of-month. */
function mayDate(day, hour = 11) {
  return new Date(YEAR, MONTH_INDEX, day, hour, randInt(0, 59), 0);
}
function ymd(d) { return d.toISOString().slice(0, 10); }

async function ensureBranches() {
  const out = [];
  for (const def of BRANCH_DEFS) {
    let b = await Branch.findOne({ $or: [{ branchId: def.branchId }, { code: def.code }, { name: def.name }] });
    if (!b) {
      b = await Branch.create(def);
      console.log("  + created branch:", def.branchName);
    }
    out.push(b);
  }
  return out;
}

async function clearDemoData() {
  const [inv, po, exp] = await Promise.all([
    Invoice.deleteMany({ isDemoData: true }),
    PurchaseOrder.deleteMany({ isDemoData: true }),
    Expense.deleteMany({ isDemoData: true }),
  ]);
  console.log(`[demo] Cleared — invoices: ${inv.deletedCount}, purchase orders: ${po.deletedCount}, expenses: ${exp.deletedCount}`);
}

function buildInvoices(branches) {
  const docs = [];
  for (let i = 1; i <= 50; i++) {
    const branch = branches[i % branches.length];
    const product = rand(PRODUCTS);
    const qty = product.kind.includes("Bike") || product.kind.includes("Car") ? randInt(1, 2) : 1;
    const rate = product.rate;
    const amount = qty * rate;
    const subtotal = amount;
    const gstRate = product.gstRate;
    const gst = round2((subtotal * gstRate) / 100);
    const totalAmount = round2(subtotal + gst);
    const interState = i % 11 === 0; // ~9% inter-state → demonstrates IGST
    const created = mayDate(randInt(1, 31));
    const paymentMode = rand(PAYMENT_MODES);
    const paid = paymentMode === "Credit" ? 0 : totalAmount;
    docs.push({
      branchId: branch._id,
      invoiceNumber: `INV-${YEAR}-D${String(i).padStart(3, "0")}`,
      customerDetails: { name: rand(CUSTOMERS), phone: `9${randInt(100000000, 999999999)}`, place: rand(PLACES), address: `${rand(PLACES)}, Pune` },
      recommendationType: product.kind,
      products: [{ modelName: product.label, quantity: qty, rate, amount }],
      productTotal: subtotal,
      subtotal,
      gst,
      gstRate,
      totalAmount,
      paymentMode,
      status: "Generated",
      paymentStatus: paid >= totalAmount ? "Paid" : "Unpaid",
      paidAmount: paid,
      pendingAmount: round2(totalAmount - paid),
      interState,
      isDemoData: true,
      createdAt: created,
      updatedAt: created,
    });
  }
  return docs;
}

function buildPurchaseOrders(branches, salesTotal) {
  const docs = [];
  // Target COGS ≈ 58% of sales so the demo shows a realistic gross margin.
  const targetCogs = round2(salesTotal * 0.58);
  const orderCount = 12;
  let allocated = 0;
  for (let i = 1; i <= orderCount; i++) {
    const branch = branches[i % branches.length];
    const vendor = rand(VENDORS);
    const product = rand(PRODUCTS);
    const gstPercent = product.gstRate;
    // Spread the target across orders with some variance; last order takes the remainder.
    let finalAmount;
    if (i === orderCount) finalAmount = round2(Math.max(0, targetCogs - allocated));
    else finalAmount = round2((targetCogs / orderCount) * (0.7 + Math.random() * 0.6));
    allocated += finalAmount;
    const subtotal = round2(finalAmount / (1 + gstPercent / 100));
    const gstAmount = round2(finalAmount - subtotal);
    const qty = randInt(2, 6);
    const purchaseRate = round2(subtotal / qty);
    const created = mayDate(randInt(1, 28));
    const mode = rand(["Full Cash", "Partial Payment", "Cheque Payment", "Credit / Loan"]);
    let paidAmount = finalAmount;
    let outstandingAmount = 0;
    let paymentStatus = "Paid";
    const cheques = [];
    if (mode === "Partial Payment") { paidAmount = round2(finalAmount * 0.5); outstandingAmount = round2(finalAmount - paidAmount); paymentStatus = "Partial"; }
    else if (mode === "Credit / Loan") { paidAmount = 0; outstandingAmount = finalAmount; paymentStatus = "Pending"; }
    else if (mode === "Cheque Payment") {
      paidAmount = 0; outstandingAmount = finalAmount; paymentStatus = "Pending";
      const due = new Date(YEAR, MONTH_INDEX, randInt(20, 31) + randInt(0, 20));
      cheques.push({ chequeNumber: `CHQ${randInt(100000, 999999)}`, bankName: rand(["HDFC", "ICICI", "SBI", "Axis"]), amount: finalAmount, chequeDate: ymd(created), dueDate: ymd(due), status: "Pending" });
    }
    docs.push({
      branchId: branch._id,
      purchaseId: `PO-${YEAR}-D${String(i).padStart(3, "0")}`,
      purchaseDate: ymd(created),
      vendorName: vendor.name,
      vendorGst: vendor.gst,
      branchName: branch.branchName,
      billNo: `BILL-${randInt(1000, 9999)}`,
      products: [{ model: product.label, brand: product.label.split(" ")[0], qty, purchaseRate, lineTotal: subtotal, stockApplied: false }],
      subtotal,
      gstAmount,
      gstPercent,
      finalAmount,
      paidAmount,
      outstandingAmount,
      paymentMode: mode,
      cheques,
      nextDueDate: cheques[0]?.dueDate || "",
      paymentStatus,
      inventoryUpdated: false,
      status: "Open",
      isDemoData: true,
      createdAt: created,
      updatedAt: created,
    });
  }
  return docs;
}

function buildExpenses(branches) {
  const rows = [];
  const add = (category, title, amount, day, branch, gstAmount = 0) => {
    const created = mayDate(day);
    rows.push({
      branchId: branch._id, category, title, amount, date: ymd(created),
      paymentMode: "Bank Transfer", vendor: title, gstAmount, isDemoData: true,
      createdAt: created, updatedAt: created,
    });
  };
  for (const branch of branches) {
    add("Rent", `Shop Rent (${branch.branchName})`, 18000, 1, branch);
    add("Electricity", `MSEB Electricity Bill (${branch.branchName})`, 6500, 7, branch);
    add("Salaries", `Staff Salaries (${branch.branchName})`, 38000, 1, branch);
    add("Transportation", "Delivery vehicle fuel & maintenance", randInt(3000, 4500), 12, branch);
    add("Transportation", "Battery transport freight", randInt(2000, 3500), 22, branch);
    add("Miscellaneous", "Office supplies & misc", randInt(1500, 2500), 15, branch);
    add("Miscellaneous", "Internet & phone", 1800, 5, branch);
  }
  return rows;
}

async function maybeGeneratePdfs() {
  try {
    const { generateReportPdf } = await import("../services/accountsDocumentService.js");
    const tenant = { branchId: null, isSuperAdmin: true };
    const out = [];
    for (const type of ["sales", "gst", "profit-loss"]) {
      const res = await generateReportPdf(type, tenant, { month: MONTH });
      out.push(res.pdfUrl);
      console.log("  + PDF:", res.title, "→", res.pdfUrl);
    }
    return out;
  } catch (err) {
    console.warn("[demo] PDF generation skipped:", err.message);
    return [];
  }
}

async function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  await connectMongo();

  if (mode === "clear") {
    await clearDemoData();
    await mongoose.connection.close();
    process.exit(0);
  }

  console.log(`[demo] Seeding May ${YEAR} testing environment…`);
  const branches = await ensureBranches();

  // Refresh: remove any previous demo data so the script is idempotent.
  await clearDemoData();

  const invoices = buildInvoices(branches);
  const salesTotal = invoices.reduce((a, i) => a + i.totalAmount, 0);
  const purchaseOrders = buildPurchaseOrders(branches, salesTotal);
  const expenses = buildExpenses(branches);

  await Invoice.insertMany(invoices, { timestamps: false });
  await PurchaseOrder.insertMany(purchaseOrders, { timestamps: false });
  await Expense.insertMany(expenses, { timestamps: false });

  const gstTotal = invoices.reduce((a, i) => a + i.gst, 0);
  const purchaseTotal = purchaseOrders.reduce((a, p) => a + p.finalAmount, 0);
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);

  console.log("[demo] Inserted:");
  console.log(`  • ${invoices.length} tax invoices  → sales ₹${salesTotal.toLocaleString("en-IN")}, GST ₹${gstTotal.toLocaleString("en-IN")}`);
  console.log(`  • ${purchaseOrders.length} purchase orders → ₹${purchaseTotal.toLocaleString("en-IN")}`);
  console.log(`  • ${expenses.length} expenses → ₹${expenseTotal.toLocaleString("en-IN")}`);
  console.log(`  • Net profit (rev - purchases - expenses): ₹${(salesTotal - purchaseTotal - expenseTotal).toLocaleString("en-IN")}`);

  console.log("[demo] Generating report PDFs for May 2026…");
  await maybeGeneratePdfs();

  console.log("[demo] Done. Open Accounts & CA Reports → period 2026-05.");
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("[demo] Seed failed:", err);
  process.exit(1);
});
