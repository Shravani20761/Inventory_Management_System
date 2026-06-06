import {
  getAccountsDashboard,
  getSalesReport,
  getPurchaseReport,
  getExpenseReport,
  getInventoryReport,
  getGstReport,
  getProfitLossReport,
  listExpenses,
  createExpense,
  deleteExpense,
  getCaProfile,
  upsertCaProfile,
} from "../services/accountsReportService.js";
import { generateReportPdf, generateMonthlyPackageZip, REPORT_TYPES } from "../services/accountsDocumentService.js";
import { emailReportsToCa, whatsappReportToCa, getEmailConfigStatus } from "../services/caDeliveryService.js";
import { getWhatsAppConfigStatus } from "../services/whatsappService.js";

function tenant(req) {
  let branchId = req.user?.branchId || null;
  if (branchId && typeof branchId === "object") {
    branchId = branchId._id?.toString?.() ?? branchId.toString?.() ?? null;
  }
  return {
    branchId,
    isSuperAdmin: req.user?.role === "superAdmin",
    userId: req.user?.id || req.user?._id || null,
  };
}

function periodQuery(req) {
  return { from: req.query.from, to: req.query.to, month: req.query.month };
}

/* ----- Reports (read) ----- */
export async function dashboardController(req, res, next) {
  try { res.json(await getAccountsDashboard(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}
export async function salesReportController(req, res, next) {
  try { res.json(await getSalesReport(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}
export async function purchaseReportController(req, res, next) {
  try { res.json(await getPurchaseReport(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}
export async function expenseReportController(req, res, next) {
  try { res.json(await getExpenseReport(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}
export async function inventoryReportController(req, res, next) {
  try { res.json(await getInventoryReport(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}
export async function gstReportController(req, res, next) {
  try { res.json(await getGstReport(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}
export async function profitLossReportController(req, res, next) {
  try { res.json(await getProfitLossReport(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}

/* ----- Expenses CRUD ----- */
export async function listExpensesController(req, res, next) {
  try { res.json(await listExpenses(tenant(req), { category: req.query.category })); } catch (e) { next(e); }
}
export async function createExpenseController(req, res, next) {
  try { res.status(201).json(await createExpense(req.body || {}, tenant(req))); } catch (e) { next(e); }
}
export async function deleteExpenseController(req, res, next) {
  try { res.json(await deleteExpense(req.params.id, tenant(req))); } catch (e) { next(e); }
}

/* ----- CA profile ----- */
export async function getCaProfileController(req, res, next) {
  try { res.json(await getCaProfile(tenant(req))); } catch (e) { next(e); }
}
export async function upsertCaProfileController(req, res, next) {
  try { res.json(await upsertCaProfile(req.body || {}, tenant(req))); } catch (e) { next(e); }
}

/* ----- Report generation (PDF / ZIP) ----- */
export async function generateReportController(req, res, next) {
  try {
    const type = req.params.type;
    res.json(await generateReportPdf(type, tenant(req), periodQuery(req)));
  } catch (e) { next(e); }
}
export async function generatePackageController(req, res, next) {
  try { res.json(await generateMonthlyPackageZip(tenant(req), periodQuery(req))); } catch (e) { next(e); }
}

/* ----- Send to CA ----- */
export async function emailToCaController(req, res, next) {
  try {
    const t = tenant(req);
    const types = Array.isArray(req.body?.reports) && req.body.reports.length ? req.body.reports : ["sales", "purchase", "gst", "profit-loss"];
    const valid = types.filter((x) => REPORT_TYPES.includes(x));
    const attachments = [];
    for (const type of valid) {
      attachments.push(await generateReportPdf(type, t, periodQuery(req)));
    }
    const result = await emailReportsToCa({
      to: req.body?.to,
      subject: req.body?.subject,
      message: req.body?.message,
      attachments,
      tenant: t,
    });
    res.json({ ...result, reports: attachments.map((a) => a.title) });
  } catch (e) { next(e); }
}
export async function whatsappToCaController(req, res, next) {
  try {
    const t = tenant(req);
    const type = req.body?.report || "profit-loss";
    if (!REPORT_TYPES.includes(type)) return res.status(400).json({ error: `Unknown report "${type}"` });
    const pdf = await generateReportPdf(type, t, periodQuery(req));
    const result = await whatsappReportToCa({
      to: req.body?.to,
      publicUrl: pdf.publicUrl,
      fileName: pdf.fileName,
      caption: req.body?.caption,
      tenant: t,
    });
    res.json({ ...result, report: pdf.title, pdfUrl: pdf.pdfUrl });
  } catch (e) { next(e); }
}

/* ----- Delivery channel status ----- */
export async function deliveryStatusController(req, res, next) {
  try {
    res.json({ email: getEmailConfigStatus(), whatsapp: getWhatsAppConfigStatus() });
  } catch (e) { next(e); }
}
