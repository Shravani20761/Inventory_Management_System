import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { GENERATED_DIR, publicBaseUrl } from "./quotationStorageService.js";
import {
  getSalesReport,
  getPurchaseReport,
  getGstReport,
  getInventoryReport,
  getProfitLossReport,
  getCaProfile,
} from "./accountsReportService.js";

const ACCOUNTS_DIR = path.join(GENERATED_DIR, "accounts");

async function ensureAccountsDir() {
  await fs.mkdir(ACCOUNTS_DIR, { recursive: true });
}

function relPath(fileName) {
  return `/generated/accounts/${fileName}`;
}

function publicUrl(fileName) {
  return `${publicBaseUrl()}${relPath(fileName)}`;
}

function safe(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, "");
}

function inr(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

async function puppeteerPdf(html, filePath) {
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    const err = new Error("Puppeteer is not installed. Run: npm install puppeteer");
    err.status = 501;
    throw err;
  }
  const browser = await puppeteer.default.launch({
    headless: true,
    timeout: 120000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 120000 });
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "16px", right: "16px", bottom: "20px", left: "16px" },
    });
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ */
/* HTML shell                                                          */
/* ------------------------------------------------------------------ */
function docShell({ title, period, ca, body }) {
  const generatedAt = new Date().toLocaleString("en-IN");
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 12px; margin: 0; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #047857; padding-bottom:10px; }
    .brand { font-size:22px; font-weight:800; color:#047857; letter-spacing:.5px; }
    .brand small { display:block; font-size:11px; font-weight:600; color:#6b7280; letter-spacing:.3px; }
    .doc-title { text-align:right; }
    .doc-title h1 { font-size:18px; margin:0; color:#111827; }
    .doc-title .meta { font-size:11px; color:#6b7280; }
    table { width:100%; border-collapse:collapse; margin-top:10px; }
    th, td { border:1px solid #e5e7eb; padding:6px 8px; text-align:left; }
    th { background:#ecfdf5; color:#065f46; font-weight:700; font-size:11px; text-transform:uppercase; }
    td.num, th.num { text-align:right; }
    h2.section { font-size:14px; color:#065f46; margin:18px 0 4px; border-left:4px solid #10b981; padding-left:8px; }
    .cards { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
    .card { flex:1 1 30%; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; background:#f9fafb; }
    .card .label { font-size:10px; text-transform:uppercase; color:#6b7280; }
    .card .value { font-size:18px; font-weight:800; color:#111827; }
    tr.total td { font-weight:800; background:#f3f4f6; }
    .footer { margin-top:24px; border-top:1px solid #e5e7eb; padding-top:8px; font-size:10px; color:#9ca3af; display:flex; justify-content:space-between; }
    .ca-box { margin-top:6px; font-size:11px; color:#374151; }
  </style></head><body>
  <div class="header">
    <div class="brand">BatteryMela ERP<small>Battery • Inverter • Trolley Dealership</small></div>
    <div class="doc-title">
      <h1>${title}</h1>
      <div class="meta">Period: ${period?.label || "All time"}</div>
      <div class="meta">Generated: ${generatedAt}</div>
    </div>
  </div>
  ${ca && (ca.caName || ca.firmName) ? `<div class="ca-box"><b>Prepared for CA:</b> ${ca.caName || "—"}${ca.firmName ? ` (${ca.firmName})` : ""}${ca.email ? ` · ${ca.email}` : ""}${ca.mobile ? ` · ${ca.mobile}` : ""}</div>` : ""}
  ${body}
  <div class="footer"><span>BatteryMela ERP — Accounts &amp; CA Reports</span><span>Confidential · For accounting use only</span></div>
  </body></html>`;
}

function rows(list, cols) {
  if (!list || !list.length) return `<tr><td colspan="${cols.length}" style="text-align:center;color:#9ca3af">No records for this period</td></tr>`;
  return list
    .map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.num ? inr(c.get(r)) : c.get(r) ?? ""}</td>`).join("")}</tr>`)
    .join("");
}

function table(cols, list, totalRow) {
  return `<table><thead><tr>${cols.map((c) => `<th class="${c.num ? "num" : ""}">${c.label}</th>`).join("")}</tr></thead>
    <tbody>${rows(list, cols)}${totalRow || ""}</tbody></table>`;
}

/* ------------------------------------------------------------------ */
/* Report builders                                                     */
/* ------------------------------------------------------------------ */
function salesBody(data) {
  return `
  <div class="cards">
    <div class="card"><div class="label">Total Sales</div><div class="value">${inr(data.totals.amount)}</div></div>
    <div class="card"><div class="label">GST Collected</div><div class="value">${inr(data.totals.gst)}</div></div>
    <div class="card"><div class="label">Transactions</div><div class="value">${data.count}</div></div>
  </div>
  <h2 class="section">Monthly Sales</h2>
  ${table([{ label: "Month", get: (r) => r.key }, { label: "Txns", get: (r) => r.count }, { label: "GST", num: true, get: (r) => r.gst }, { label: "Amount", num: true, get: (r) => r.amount }], data.monthly)}
  <h2 class="section">Branch-wise Sales</h2>
  ${table([{ label: "Branch", get: (r) => r.branchName }, { label: "Txns", get: (r) => r.count }, { label: "Amount", num: true, get: (r) => r.amount }], data.branchWise)}
  <h2 class="section">GST-wise Sales</h2>
  ${table([{ label: "GST Slab", get: (r) => r.key }, { label: "Txns", get: (r) => r.count }, { label: "GST", num: true, get: (r) => r.gst }, { label: "Amount", num: true, get: (r) => r.amount }], data.gstWise)}
  <h2 class="section">Daily Sales</h2>
  ${table([{ label: "Date", get: (r) => r.key }, { label: "Txns", get: (r) => r.count }, { label: "Amount", num: true, get: (r) => r.amount }], data.daily)}`;
}

function purchaseBody(data) {
  return `
  <div class="cards">
    <div class="card"><div class="label">Total Purchases</div><div class="value">${inr(data.totals.total)}</div></div>
    <div class="card"><div class="label">Input GST</div><div class="value">${inr(data.totals.gst)}</div></div>
    <div class="card"><div class="label">Outstanding</div><div class="value">${inr(data.outstanding?.totalOutstanding || 0)}</div></div>
  </div>
  <h2 class="section">Vendor-wise Purchases</h2>
  ${table([{ label: "Vendor", get: (r) => r.vendor }, { label: "Orders", get: (r) => r.orders }, { label: "Paid", num: true, get: (r) => r.paid }, { label: "Outstanding", num: true, get: (r) => r.outstanding }, { label: "Total", num: true, get: (r) => r.total }], data.vendorWise)}
  <h2 class="section">Outstanding Payments</h2>
  ${table([{ label: "Vendor", get: (r) => r.vendorName || r.vendor }, { label: "Purchase", get: (r) => r.purchaseId }, { label: "Due Date", get: (r) => r.nextDueDate || "—" }, { label: "Outstanding", num: true, get: (r) => r.outstandingAmount ?? r.outstanding }], data.outstanding?.rows || [])}
  <h2 class="section">Cheque Due Report</h2>
  ${table([{ label: "Due Date", get: (r) => r.dueDate }, { label: "Vendor", get: (r) => r.vendor }, { label: "Cheque #", get: (r) => r.chequeNumber }, { label: "Bank", get: (r) => r.bankName }, { label: "Status", get: (r) => r.status }, { label: "Amount", num: true, get: (r) => r.amount }], data.chequeDue)}`;
}

function gstBody(data) {
  const s = data.summary;
  return `
  <div class="cards">
    <div class="card"><div class="label">Taxable Amount</div><div class="value">${inr(s.taxableAmount)}</div></div>
    <div class="card"><div class="label">CGST</div><div class="value">${inr(s.cgst)}</div></div>
    <div class="card"><div class="label">SGST</div><div class="value">${inr(s.sgst)}</div></div>
    <div class="card"><div class="label">IGST</div><div class="value">${inr(s.igst)}</div></div>
    <div class="card"><div class="label">Output GST</div><div class="value">${inr(s.outputGst)}</div></div>
    <div class="card"><div class="label">Input GST</div><div class="value">${inr(s.inputGst)}</div></div>
    <div class="card"><div class="label">Net GST Payable</div><div class="value">${inr(s.netPayable)}</div></div>
  </div>
  <h2 class="section">Output GST (on Sales / Tax Invoices)</h2>
  ${table([{ label: "Slab", get: (r) => r.rate }, { label: "Invoices", get: (r) => r.count }, { label: "Taxable", num: true, get: (r) => r.taxable }, { label: "CGST", num: true, get: (r) => r.cgst }, { label: "SGST", num: true, get: (r) => r.sgst }, { label: "IGST", num: true, get: (r) => r.igst }, { label: "Total GST", num: true, get: (r) => r.gst }], data.output)}
  <h2 class="section">Input GST (on Purchases)</h2>
  ${table([{ label: "Slab", get: (r) => r.rate }, { label: "Orders", get: (r) => r.count }, { label: "Taxable", num: true, get: (r) => r.taxable }, { label: "CGST", num: true, get: (r) => r.cgst }, { label: "SGST", num: true, get: (r) => r.sgst }, { label: "IGST", num: true, get: (r) => r.igst }, { label: "Total GST", num: true, get: (r) => r.gst }], data.input)}`;
}

function inventoryBody(data) {
  const s = data.summary;
  return `
  <div class="cards">
    <div class="card"><div class="label">Opening Stock (units)</div><div class="value">${s.openingUnits}</div></div>
    <div class="card"><div class="label">Purchased (units)</div><div class="value">${s.purchasedUnits}</div></div>
    <div class="card"><div class="label">Sold (units)</div><div class="value">${s.soldUnits}</div></div>
    <div class="card"><div class="label">Closing Stock (units)</div><div class="value">${s.closingUnits}</div></div>
    <div class="card"><div class="label">Closing Stock Value</div><div class="value">${inr(s.closingValue)}</div></div>
  </div>
  <h2 class="section">Current Stock Valuation</h2>
  ${table([{ label: "Model", get: (r) => r.model }, { label: "Brand", get: (r) => r.brand }, { label: "Type", get: (r) => r.type }, { label: "Qty", get: (r) => r.quantity }, { label: "Rate", num: true, get: (r) => r.purchaseRate }, { label: "Stock Value", num: true, get: (r) => r.stockValue }], data.products.slice(0, 200))}`;
}

function pnlBody(data) {
  const revRows = data.revenue.map((r) => `<tr><td>${r.label}</td><td class="num">${inr(r.amount)}</td></tr>`).join("");
  const expRows = data.expenses.map((r) => `<tr><td>${r.label}</td><td class="num">${inr(r.amount)}</td></tr>`).join("");
  return `
  <div class="cards">
    <div class="card"><div class="label">Total Revenue</div><div class="value">${inr(data.totalRevenue)}</div></div>
    <div class="card"><div class="label">Total Expenses</div><div class="value">${inr(data.totalExpenses)}</div></div>
    <div class="card"><div class="label">Net ${data.netProfit >= 0 ? "Profit" : "Loss"} (${data.margin}%)</div><div class="value" style="color:${data.netProfit >= 0 ? "#047857" : "#dc2626"}">${inr(data.netProfit)}</div></div>
  </div>
  <h2 class="section">Revenue</h2>
  <table><thead><tr><th>Source</th><th class="num">Amount</th></tr></thead><tbody>${revRows}<tr class="total"><td>Total Revenue</td><td class="num">${inr(data.totalRevenue)}</td></tr></tbody></table>
  <h2 class="section">Expenses</h2>
  <table><thead><tr><th>Head</th><th class="num">Amount</th></tr></thead><tbody>${expRows}<tr class="total"><td>Total Expenses</td><td class="num">${inr(data.totalExpenses)}</td></tr></tbody></table>
  <h2 class="section">Net Result</h2>
  <table><tbody><tr class="total"><td>Net ${data.netProfit >= 0 ? "Profit" : "Loss"}</td><td class="num">${inr(data.netProfit)}</td></tr></tbody></table>`;
}

const BUILDERS = {
  sales: { title: "Sales Report", load: getSalesReport, body: salesBody },
  purchase: { title: "Purchase Report", load: getPurchaseReport, body: purchaseBody },
  gst: { title: "GST Report", load: getGstReport, body: gstBody },
  inventory: { title: "Inventory Report", load: getInventoryReport, body: inventoryBody },
  "profit-loss": { title: "Profit & Loss Statement", load: getProfitLossReport, body: pnlBody },
};

export const REPORT_TYPES = Object.keys(BUILDERS);

/** Generate a single report PDF and return its file metadata. */
export async function generateReportPdf(type, tenant, query = {}) {
  const builder = BUILDERS[type];
  if (!builder) {
    const err = new Error(`Unknown report type "${type}". Allowed: ${REPORT_TYPES.join(", ")}`);
    err.status = 400;
    throw err;
  }
  await ensureAccountsDir();
  const [data, ca] = await Promise.all([builder.load(tenant, query), getCaProfile(tenant)]);
  const html = docShell({ title: builder.title, period: data.period, ca, body: builder.body(data) });
  const stamp = (data.period?.label || "all").replace(/[^0-9A-Za-z]/g, "") || Date.now();
  const fileName = `${type}-report-${safe(stamp)}-${Date.now()}.pdf`;
  const filePath = path.join(ACCOUNTS_DIR, fileName);
  console.log("[accounts-pdf] Generating", type, "report:", fileName);
  await puppeteerPdf(html, filePath);
  return { type, fileName, filePath, pdfUrl: relPath(fileName), publicUrl: publicUrl(fileName), title: builder.title };
}

/** Generate the monthly package ZIP (Sales + Purchase + GST + P&L). */
export async function generateMonthlyPackageZip(tenant, query = {}) {
  let archiver;
  try {
    archiver = (await import("archiver")).default;
  } catch {
    const err = new Error("archiver is not installed. Run: npm install archiver");
    err.status = 501;
    throw err;
  }
  await ensureAccountsDir();
  const types = ["sales", "purchase", "gst", "profit-loss"];
  const pdfs = [];
  for (const t of types) {
    pdfs.push(await generateReportPdf(t, tenant, query));
  }

  const period = pdfs[0]?.title ? query : query;
  const label = (query.month || query.from || "package").replace(/[^0-9A-Za-z-]/g, "");
  const zipName = `monthly-report-package-${safe(label)}-${Date.now()}.zip`;
  const zipPath = path.join(ACCOUNTS_DIR, zipName);

  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    for (const p of pdfs) {
      archive.file(p.filePath, { name: `${p.title.replace(/[^0-9A-Za-z ]/g, "")}.pdf` });
    }
    archive.finalize();
  });

  console.log("[accounts-pdf] Monthly package created:", zipName);
  return {
    fileName: zipName,
    filePath: zipPath,
    zipUrl: relPath(zipName),
    publicUrl: publicUrl(zipName),
    includes: pdfs.map((p) => p.title),
    period,
  };
}
