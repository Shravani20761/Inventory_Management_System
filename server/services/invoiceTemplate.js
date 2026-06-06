import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { resolveBrandProductImagePath } from "../constants/brandImages.js";
import { resolveAssetDataUri } from "./documentTemplateEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_CANDIDATES = [
  path.resolve(__dirname, "../../public/assets/logos/batterymela-logo.png"),
  path.resolve(__dirname, "../../public/assets/logos/batterymela-logo.svg"),
];

let cachedLogoDataUri = null;

export async function getBatteryMelaLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const envUrl = String(process.env.BATTERYMELA_LOGO_URL ?? "").trim();
  if (envUrl) {
    cachedLogoDataUri = envUrl;
    return cachedLogoDataUri;
  }
  for (const logoPath of LOGO_CANDIDATES) {
    try {
      const buf = await fs.readFile(logoPath);
      const ext = path.extname(logoPath).toLowerCase();
      const mime = ext === ".svg" ? "image/svg+xml" : "image/png";
      cachedLogoDataUri = `data:${mime};base64,${buf.toString("base64")}`;
      return cachedLogoDataUri;
    } catch {
      /* try next */
    }
  }
  return "";
}

export const BATTERYMELA_BRAND = {
  primary: "#059669",
  secondary: "#10b981",
  dark: "#111827",
  white: "#FFFFFF",
  gstin: process.env.BATTERYMELA_GSTIN || "GSTIN — configure in .env",
  phone: process.env.BATTERYMELA_PHONE || "+91 98765 43210",
  email: process.env.BATTERYMELA_EMAIL || "support@batterymela.com",
  address: process.env.BATTERYMELA_ADDRESS || "BatteryMela — Power Backup Solutions",
};

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function chargeRows(additionalCharges = {}) {
  const labels = {
    inverterInstallation: "Inverter Installation",
    batteryInstallation: "Battery Installation",
    trolleyCharges: "Trolley",
    transportationCharges: "Transportation",
    wiringCharges: "Wiring",
    deliveryCharges: "Delivery",
    serviceCharges: "Service",
    otherCharges: "Other Charges",
  };
  return Object.entries(labels)
    .map(([key, label]) => {
      const row = additionalCharges[key];
      if (!row?.enabled || Number(row.amount) <= 0) return "";
      return `<tr><td>${label}</td><td style="text-align:right">₹ ${fmt(row.amount)}</td></tr>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * Professional BatteryMela tax invoice HTML for Puppeteer PDF + print.
 */
export async function renderInvoiceHtml(invoice) {
  const logoUrl = await getBatteryMelaLogoDataUri();
  const customer = invoice.customerDetails ?? {};
  const products = invoice.products ?? invoice.items ?? [];
  const chargesHtml = chargeRows(invoice.additionalCharges);
  const scrap = Number(invoice.scrapAdjustment ?? 0);
  const today = invoice.date ?? new Date(invoice.createdAt || Date.now()).toISOString().slice(0, 10);
  const b = BATTERYMELA_BRAND;

  let systemSpecsImages = "";
  if (invoice.inverter || invoice.battery) {
    const batPath = invoice.battery ? resolveBrandProductImagePath(invoice.battery.brand, "battery") : "";
    const invPath = invoice.inverter ? resolveBrandProductImagePath(invoice.inverter.brand, "inverter") : "";
    const batData = batPath ? await resolveAssetDataUri(batPath) : "";
    const invData = invPath ? await resolveAssetDataUri(invPath) : "";
    const batImg = batData
      ? `<img src="${batData}" alt="Battery" style="width:56px;height:56px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc"/>`
      : "";
    const invImg = invData
      ? `<img src="${invData}" alt="Inverter" style="width:56px;height:56px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc"/>`
      : "";
    if (batImg || invImg) {
      systemSpecsImages = `<div style="display:flex;flex-direction:row;gap:10px;align-items:center;margin-bottom:10px">${batImg}${invImg}</div>`;
    }
  }

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="BatteryMela Logo" class="company-logo" />`
    : `<div class="logo-fallback">BatteryMela</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: A4 portrait; margin: 10mm; }
    *{box-sizing:border-box}
    html,body{width:210mm;min-height:297mm;margin:0;padding:0;background:#fff}
    body{font-family:Segoe UI,Arial,sans-serif;color:${b.dark}}
    .wrap{padding:8mm 10mm 10mm;width:210mm;min-height:277mm}
    .header{display:grid;grid-template-columns:220px 1fr 200px;gap:16px;align-items:center;border-bottom:3px solid ${b.primary};padding-bottom:16px;margin-bottom:20px}
    .company-logo{width:220px;height:auto;max-height:80px;object-fit:contain;display:block}
    .logo-fallback{font-size:28px;font-weight:800;color:${b.primary};letter-spacing:-0.5px}
    .doc-title{text-align:center;font-size:26px;font-weight:800;color:${b.primary};letter-spacing:1px}
    .doc-meta{text-align:right;font-size:12px;line-height:1.7;color:#374151}
    .meta-label{color:#6b7280}
    .section{margin-bottom:18px}
    .section h3{margin:0 0 8px;font-size:13px;color:${b.primary};text-transform:uppercase;letter-spacing:0.6px}
    .customer-box{background:linear-gradient(135deg,#faf5ff,#f5f3ff);border:1px solid #e9d5ff;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #e5e7eb;padding:9px 10px;font-size:12px}
    th{background:linear-gradient(135deg,${b.primary},${b.secondary});color:#fff;text-align:left}
    td.amount,th.amount{text-align:right}
    .totals{margin-top:16px;display:flex;justify-content:flex-end}
    .totals-box{min-width:320px;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.8}
    .grand{font-size:20px;font-weight:800;color:${b.primary};margin-top:6px;padding-top:8px;border-top:2px solid ${b.primary}}
    .specs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
    .spec{padding:8px 10px;background:#f9fafb;border-radius:6px;font-size:12px}
    .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;line-height:1.7}
    .brand-line{height:4px;background:linear-gradient(90deg,${b.primary},${b.secondary});border-radius:2px;margin-bottom:20px}
  </style></head><body><div class="wrap">
    <div class="brand-line"></div>
    <div class="header">
      <div>${logoBlock}</div>
      <div class="doc-title">TAX INVOICE</div>
      <div class="doc-meta">
        <div><span class="meta-label">Invoice No:</span> <strong>${invoice.invoiceNumber ?? invoice.id ?? "—"}</strong></div>
        ${invoice.quotationId ? `<div><span class="meta-label">Quotation:</span> ${invoice.quotationId}</div>` : ""}
        <div><span class="meta-label">Date:</span> ${today}</div>
        <div><span class="meta-label">GSTIN:</span> ${b.gstin}</div>
      </div>
    </div>

    <div class="section">
      <h3>Bill To</h3>
      <div class="customer-box">
        <strong>${customer.name ?? ""}</strong><br/>
        ${customer.phone ? `Phone: ${customer.phone}<br/>` : ""}
        ${customer.address ? `${customer.address}<br/>` : ""}
        ${customer.place ? customer.place : ""}
      </div>
    </div>

    ${
      invoice.inverter || invoice.battery
        ? `<div class="section"><h3>System Specifications</h3>${systemSpecsImages}<div class="specs">
      ${invoice.inverter ? `<div class="spec"><strong>Inverter</strong><br/>${invoice.inverter.brand ?? ""} ${invoice.inverter.model ?? ""}<br/>${invoice.inverter.inverterVA ?? invoice.calculatedVA ?? "—"} VA</div>` : ""}
      ${invoice.battery ? `<div class="spec"><strong>Battery</strong><br/>${invoice.battery.brand ?? ""} ${invoice.battery.model ?? ""}<br/>${invoice.battery.batteryAH ?? invoice.calculatedAH ?? "—"} Ah · ${invoice.battery.batteryType ?? ""}</div>` : ""}
      <div class="spec"><strong>Backup</strong><br/>~${invoice.backupHours ?? invoice.calculations?.backupHours ?? "—"} hrs<br/>Load ${invoice.calculations?.totalLoad ?? invoice.totalLoad ?? "—"} W</div>
    </div></div>`
        : ""
    }

    <div class="section"><h3>Products</h3>
    <table><thead><tr><th>Product</th><th class="amount">Qty</th><th class="amount">Rate (₹)</th><th class="amount">Amount (₹)</th></tr></thead><tbody>
    ${products
      .map(
        (i) =>
          `<tr><td>${i.modelName ?? i.model ?? "—"}</td><td class="amount">${i.quantity ?? i.qty ?? 1}</td><td class="amount">${fmt(i.rate)}</td><td class="amount">${fmt(i.amount ?? (i.rate ?? 0) * (i.quantity ?? 1))}</td></tr>`,
      )
      .join("")}
    </tbody></table></div>

    ${
      chargesHtml || scrap > 0
        ? `<div class="section"><h3>Additional Charges</h3><table><thead><tr><th>Charge Type</th><th class="amount">Amount (₹)</th></tr></thead><tbody>
    ${chargesHtml}
    ${scrap > 0 ? `<tr><td>Old Battery Exchange Credit</td><td style="text-align:right;color:#059669">- ₹ ${fmt(scrap)}</td></tr>` : ""}
    </tbody></table></div>`
        : ""
    }

    <div class="totals"><div class="totals-box">
      <div>Product subtotal: ₹ ${fmt(invoice.productTotal ?? invoice.subtotal)}</div>
      ${Number(invoice.additionalTotal) > 0 ? `<div>Additional charges: ₹ ${fmt(invoice.additionalTotal)}</div>` : ""}
      <div>Taxable subtotal: ₹ ${fmt(invoice.subtotal)}</div>
      <div>GST (${invoice.gstRate ?? 18}%): ₹ ${fmt(invoice.gst ?? invoice.gstAmount)}</div>
      ${invoice.paymentMode ? `<div>Payment mode: ${invoice.paymentMode}</div>` : ""}
      <div class="grand">Grand Total: ₹ ${fmt(invoice.totalAmount ?? invoice.finalTotal ?? invoice.total)}</div>
      ${Number(invoice.paidAmount) > 0 ? `<div>Paid: ₹ ${fmt(invoice.paidAmount)} · Pending: ₹ ${fmt(invoice.pendingAmount ?? 0)}</div>` : ""}
    </div></div>

    ${
      invoice.notes?.delivery || invoice.notes?.installation || invoice.notes?.warranty
        ? `<div class="section" style="margin-top:20px;font-size:12px;color:#374151">
      ${invoice.notes.delivery ? `<div><strong>Delivery:</strong> ${invoice.notes.delivery}</div>` : ""}
      ${invoice.notes.installation ? `<div><strong>Installation:</strong> ${invoice.notes.installation}</div>` : ""}
      ${invoice.notes.warranty ? `<div><strong>Warranty:</strong> ${invoice.notes.warranty}</div>` : ""}
    </div>`
        : ""
    }

    <div class="footer">
      <strong style="color:${b.primary}">Thank you for choosing BatteryMela</strong><br/>
      ${b.phone} · ${b.email}<br/>${b.address}
    </div>
  </div></body></html>`;
}
