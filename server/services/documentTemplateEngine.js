import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BADGE_COLORS, productImageForOption, BRAND_IMAGES } from "../constants/brandImages.js";
import { publicBaseUrl } from "./quotationStorageService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

let cssCache = null;
let logoCache = null;

export const BATTERYMELA_COMPANY = {
  name: process.env.BATTERYMELA_NAME || "BatteryMela",
  tagline: process.env.BATTERYMELA_TAGLINE || "Reliable Power • Trusted Solutions",
  gstin: process.env.BATTERYMELA_GSTIN || "",
  phone: process.env.BATTERYMELA_PHONE || "7798234598",
  email: process.env.BATTERYMELA_EMAIL || "support@batterymela.com",
  address:
    process.env.BATTERYMELA_ADDRESS ||
    "Datta Mandir Road, Oppo. of Datta Mandir Road, Wakad, Pune - 411057",
};

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

export function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function moneyDec(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function loadDesignCss() {
  if (cssCache) return cssCache;
  cssCache = await fs.readFile(path.join(TEMPLATES_DIR, "quotation-design.css"), "utf8");
  return cssCache;
}

export async function getLogoDataUri() {
  if (logoCache) return logoCache;
  const envUrl = String(process.env.BATTERYMELA_LOGO_URL ?? "").trim();
  if (envUrl) {
    logoCache = envUrl;
    return logoCache;
  }
  for (const name of ["batterymela-logo.png", "batterymela-logo.svg"]) {
    try {
      const logoPath = path.join(PUBLIC_DIR, "assets/logos", name);
      const buf = await fs.readFile(logoPath);
      const mime = name.endsWith(".svg") ? "image/svg+xml" : "image/png";
      logoCache = `data:${mime};base64,${buf.toString("base64")}`;
      return logoCache;
    } catch {
      /* try next */
    }
  }
  return "";
}

export function assetPublicUrl(assetPath) {
  const raw = String(assetPath ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) return raw;
  const rel = raw.startsWith("/") ? raw : `/${raw}`;
  return `${publicBaseUrl()}${rel}`;
}

export async function resolveAssetForPdf(assetPath) {
  const publicUrl = assetPublicUrl(assetPath);
  const isRemoteHttps = /^https:\/\//i.test(publicUrl) && !/localhost|127\.0\.0\.1/i.test(publicUrl);
  if (isRemoteHttps) return publicUrl;
  const embedded = await resolveAssetDataUri(assetPath);
  return embedded || publicUrl;
}

export async function resolveAssetDataUri(assetPath) {
  const raw = String(assetPath ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("http")) return raw;
  const rel = raw.replace(/^\//, "");
  const full = path.join(PUBLIC_DIR, rel);
  try {
    const buf = await fs.readFile(full);
    const ext = path.extname(full).toLowerCase();
    const mime = ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

export async function renderDocumentHtml({ docType = "recommendation", docTitle = "BatteryMela Document", bodyHtml }) {
  const shellPath = path.join(TEMPLATES_DIR, "quotation-template.html");
  const shell = await fs.readFile(shellPath, "utf8");
  const css = await loadDesignCss();
  return shell
    .replace("{{DOC_TITLE}}", esc(docTitle))
    .replace("{{DOC_TYPE}}", esc(docType))
    .replace("{{CSS}}", css)
    .replace("{{BODY}}", bodyHtml);
}

export function badgeStyle(badge) {
  const b = BADGE_COLORS[badge] || BADGE_COLORS.Recommended;
  return `background:${b.bg};color:${b.text}`;
}

export async function logoBlock() {
  const logo = await getLogoDataUri();
  return logo
    ? `<img class="company-logo" src="${escAttr(logo)}" alt="BatteryMela"/>`
    : `<div class="logo-fallback">BatteryMela</div>`;
}

export async function productImageHtml(option, product = "inverter", alt = "", sizeClass = "product-image") {
  const srcPath = productImageForOption(option, product);
  const src = srcPath ? await resolveAssetForPdf(srcPath) : "";
  if (src) {
    return `<img class="${esc(sizeClass)}" src="${escAttr(src)}" alt="${esc(alt)}"/>`;
  }
  const phClass = sizeClass === "product-image" ? "product-image-ph" : `${sizeClass}-ph`;
  return `<div class="${phClass}">${esc(alt || product)}</div>`;
}

export async function productCellHtml(option, product = "inverter") {
  const inv = option.inverter ?? {};
  const bat = option.battery ?? {};
  const isInv = product === "inverter";
  const model = isInv
    ? inv.inverterModelNumber || inv.modelName || option.inverterName || "—"
    : bat.batteryModelNumber || bat.modelName || option.batteryName || "—";
  const brand = isInv ? inv.brand : bat.brand;
  const spec = isInv
    ? `${inv.inverterVA || option.inverterVa || "—"} VA`
    : `${bat.capacityAh || option.batteryAh || "—"} Ah · ${bat.batteryType || "—"}`;
  const warranty = isInv ? inv.warranty : bat.warranty;
  const img = await productImageHtml(option, product, model);
  return `<div class="product-cell">${img}<div class="product-info"><strong class="product-name">${esc(model)}</strong><small>${esc(brand || "")}</small><small>${esc(spec)}</small>${warranty ? `<small>Warranty: ${esc(warranty)}</small>` : ""}</div></div>`;
}

export function partyBoxes(doc) {
  const co = BATTERYMELA_COMPANY;
  const addr = doc.customerAddress || doc.requirements?.customerAddress || "";
  return `<section class="party-grid">
    <div class="party-box">
      <h3 class="party-title">Customer Details</h3>
      <p><b>Name:</b> ${esc(doc.customerName)}</p>
      <p><b>Phone:</b> ${esc(doc.customerPhone)}</p>
      ${addr ? `<p><b>Address:</b> ${esc(addr)}</p>` : ""}
    </div>
    <div class="party-box company">
      <h3 class="party-title">Company Details</h3>
      <p><b>${esc(co.name)}</b></p>
      <p>${esc(co.address)}</p>
      <p><b>Phone:</b> ${esc(co.phone)}</p>
      <p><b>Email:</b> ${esc(co.email)}</p>
      <p><b>GSTIN:</b> ${esc(co.gstin)}</p>
    </div>
  </section>`;
}

export function loadCalculationPanel(doc) {
  const sizing = doc.requirements?.loadSizing || doc.loadSizing;
  const totalLoad = doc.totalLoad ?? sizing?.totalWatts ?? "—";
  const va = sizing?.roundedVA ?? doc.inverterRange ?? "—";
  const ah = sizing?.roundedAH ?? doc.batteryRange ?? "—";
  const backup = doc.backupHours ?? sizing?.backupHours ?? "—";
  const lines = sizing?.lines ?? doc.appliances ?? doc.requirements?.appliances ?? [];
  const tableRows = Array.isArray(lines)
    ? lines
        .map(
          (l) => `<tr>
            <td>${esc(l.categoryLabel || l.category || "Appliance")}</td>
            <td>${esc(l.typeLabel || l.type || l.name || "—")}</td>
            <td class="td-c">${esc(String(l.quantity ?? 1))}</td>
            <td class="td-r">${esc(String(l.lineWatts ?? l.watts ?? l.wattage ?? "—"))}</td>
          </tr>`,
        )
        .join("")
    : "";
  const applianceTable = tableRows
    ? `<table class="load-table">
        <thead><tr><th>Category</th><th>Appliance</th><th>Qty</th><th>Watts</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`
    : "";
  return `<section class="load-panel">
    <h3>Load Calculation Summary</h3>
    <div class="load-stats">
      <div class="load-stat"><span class="val">${esc(String(totalLoad))}W</span><span class="lbl">Total Load</span></div>
      <div class="load-stat"><span class="val">${esc(String(va))}</span><span class="lbl">Calculated VA</span></div>
      <div class="load-stat"><span class="val">${esc(String(ah))}Ah</span><span class="lbl">Required Battery</span></div>
      <div class="load-stat"><span class="val">${esc(String(backup))}h</span><span class="lbl">Backup Hours</span></div>
    </div>
    ${applianceTable}
  </section>`;
}

export async function docHeader({ title, docNumber, date, badgeLabel, shieldText }) {
  const logo = await logoBlock();
  return `<div class="brand-line"></div>
  <header class="doc-header">
    <div class="doc-header-left">${logo}</div>
    <div class="doc-title">${esc(title)}</div>
    <div class="doc-header-right">
      <div><span class="doc-meta-label">No:</span> <strong>${esc(docNumber)}</strong></div>
      <div><span class="doc-meta-label">Date:</span> ${esc(date)}</div>
      ${badgeLabel ? `<div class="doc-badge">${esc(badgeLabel)}</div>` : ""}
      ${shieldText ? `<div class="shield-badge">🛡 ${esc(shieldText)}</div>` : ""}
    </div>
  </header>`;
}

/** Battery Mela quotation header — logo, QUOTATION title, date, number, shield. */
export async function batteryMelaQuotationHeader({ docNumber, date }) {
  const logo = await getLogoDataUri();
  const logoHtml = logo
    ? `<img class="bm-logo-img" src="${escAttr(logo)}" alt="Battery Mela"/>`
    : `<div class="bm-logo-text">BATTERY<br/><span>MELA</span></div>`;
  const displayNo = String(docNumber || "").replace(/^QT-\d{4}-/, "") || docNumber || "—";
  const dateFmt = date
    ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `<header class="bm-header">
    <div class="bm-header-left">
      ${logoHtml}
      <div class="bm-tagline">${esc(BATTERYMELA_COMPANY.tagline)}</div>
    </div>
    <div class="bm-header-center">
      <div class="bm-title">QUOTATION</div>
      <div class="bm-title-dots">• • •</div>
      <div class="bm-meta-row"><span class="bm-meta-icon">📅</span> Date: <strong>${esc(dateFmt)}</strong></div>
      <div class="bm-meta-row"><span class="bm-meta-icon">📄</span> Quotation No.: <strong>${esc(displayNo)}</strong></div>
    </div>
    <div class="bm-header-right">
      <div class="bm-shield">
        <div class="bm-shield-icon">⚡</div>
        <div class="bm-shield-text">POWER YOU<br/>CAN TRUST</div>
      </div>
    </div>
  </header>`;
}

/** Load calculation strip (between party cards and item table). */
export function batteryMelaLoadSection(doc, option = {}) {
  const sizing = doc.requirements?.loadSizing || doc.loadSizing || {};
  const inv = option?.inverter ?? {};
  const connectedLoad = doc.totalLoad ?? sizing.totalWatts ?? doc.requirements?.totalLoad ?? "—";
  const requiredVa = sizing.roundedVA ?? doc.inverterRange ?? inv.inverterVA ?? option.inverterVa ?? "—";
  const recommendedInv =
    inv.inverterModelNumber ||
    inv.modelName ||
    option.inverterName ||
    (requiredVa !== "—" ? `${requiredVa} VA (recommended)` : "—");
  const batteryAh = sizing.roundedAH ?? doc.batteryRange ?? inv.capacityAh ?? option.batteryAh ?? "—";
  const backupHours = doc.backupHours ?? sizing.backupHours ?? doc.requirements?.backupHours ?? "—";
  const cells = [
    { label: "Connected Load (W)", value: connectedLoad },
    { label: "Required VA", value: requiredVa },
    { label: "Recommended Inverter", value: recommendedInv },
    { label: "Battery AH", value: batteryAh },
    { label: "Estimated Backup Hours", value: backupHours },
  ];
  const items = cells
    .map(
      (c) => `<div class="bm-load-cell">
        <span class="bm-load-label">${esc(c.label)}</span>
        <span class="bm-load-value">${esc(String(c.value))}</span>
      </div>`,
    )
    .join("");
  return `<section class="bm-load-section">
    <div class="bm-section-bar">Load Calculation</div>
    <div class="bm-load-grid">${items}</div>
  </section>`;
}

/** Customer + company boxes — equal height, aligned hero images (90×90). */
export async function batteryMelaPartySection(doc, option = {}) {
  const co = BATTERYMELA_COMPANY;
  const addr = doc.customerAddress || doc.requirements?.customerAddress || doc.customerDetails?.address || "";
  const inv = option?.inverter ?? {};
  const bat = option?.battery ?? {};
  const invImg =
    inv.modelName || inv.inverterModelNumber || option.inverterName
      ? await productImageHtml(option, "inverter", "Inverter", "bm-hero-img")
      : "";
  const batImg =
    bat.modelName || bat.batteryModelNumber || option.batteryName
      ? await productImageHtml(option, "battery", "Battery", "bm-hero-img")
      : "";
  const hero =
    invImg || batImg
      ? `<div class="bm-party-hero">${batImg}${invImg}</div>`
      : `<div class="bm-party-hero bm-party-hero-empty"></div>`;
  return `<section class="bm-party-grid">
    <div class="bm-party-box">
      <div class="bm-party-bar"><span class="bm-party-icon">👤</span> Customer Details</div>
      <div class="bm-party-body bm-party-fill">
        <p><b>Name:</b> ${esc(doc.customerName || doc.customer)}</p>
        <p><b>Phone No.:</b> ${esc(doc.customerPhone || doc.phone)}</p>
        ${addr ? `<p><b>Address:</b> ${esc(addr)}</p>` : ""}
      </div>
    </div>
    <div class="bm-party-box bm-party-company">
      <div class="bm-party-bar"><span class="bm-party-icon">🏢</span> Company Details</div>
      <div class="bm-party-body bm-party-body-split bm-party-fill">
        <div class="bm-party-text">
          <p><b>Name:</b> ${esc(co.name)}</p>
          <p><b>Address:</b> ${esc(co.address)}</p>
          <p><b>Phone:</b> ${esc(co.phone)}</p>
          ${co.email ? `<p><b>Email:</b> ${esc(co.email)}</p>` : ""}
        </div>
        ${hero}
      </div>
    </div>
  </section>`;
}

/** Table row with inline thumbnail + BATTERY / INVERTER label. */
export async function quotationItemRow({ sr, typeLabel, title, subtitle, brand, qty, rate, option, productKind }) {
  const img =
    option && productKind
      ? await productImageHtml(option, productKind, title, "bm-item-thumb")
      : `<div class="bm-item-thumb-ph"></div>`;
  const amount = qty * rate;
  return `<tr>
    <td class="td-c">${sr}</td>
    <td class="bm-item-desc">
      <div class="bm-item-desc-inner">
        ${img}
        <div>
          <span class="bm-item-type">${esc(typeLabel)}</span>
          <strong>${esc(title)}</strong>
          ${subtitle ? `<div class="bm-item-sub">${esc(subtitle)}</div>` : ""}
        </div>
      </div>
    </td>
    <td class="td-c">${esc(brand)}</td>
    <td class="td-c">${qty}</td>
    <td class="td-r">${moneyDec(rate)}</td>
    <td class="td-r">${rate > 0 ? moneyDec(amount) : "As Applicable"}</td>
  </tr>`;
}

export async function partnerLogosHtml() {
  const brands = [
    { name: "EXIDE", path: BRAND_IMAGES.battery.Exide },
    { name: "LUMINOUS", path: BRAND_IMAGES.inverter.Luminous },
    { name: "MICROTEK", path: BRAND_IMAGES.inverter.Microtek },
  ];
  const chips = await Promise.all(
    brands.map(async (b) => {
      const src = await resolveAssetForPdf(b.path);
      if (src) return `<img class="bm-partner-logo" src="${escAttr(src)}" alt="${esc(b.name)}"/>`;
      return `<span class="bm-partner-fallback">${esc(b.name)}</span>`;
    }),
  );
  return chips.join("");
}

export function batteryMelaQuotationFooter({ amountWords, terms, totals, grandTotal, partnersHtml = "" }) {
  const termsList = terms.map((t) => `<li>${esc(t)}</li>`).join("");
  const totalRows = totals
    .map(
      (t) => `<div class="bm-total-line">
        <span class="bm-total-label">${esc(t.label)}</span>
        <span class="bm-total-val">${t.applicable ? "As Applicable" : moneyDec(t.value)}</span>
      </div>`,
    )
    .join("");
  return `<section class="bm-closing">
    <div class="bm-closing-grid">
      <div class="bm-closing-left">
        <div class="bm-terms-box">
          <div class="bm-terms-title">Terms &amp; Conditions</div>
          <ul>${termsList}</ul>
        </div>
        <div class="bm-amount-words"><span class="bm-amount-label">Amount in Words:</span> ${esc(amountWords)}</div>
      </div>
      <div class="bm-totals-column">
        <div class="bm-totals-box">${totalRows}</div>
        <div class="bm-grand-total">
          <span class="bm-grand-label">GRAND TOTAL</span>
          <span class="bm-grand-val">${moneyDec(grandTotal)}</span>
        </div>
      </div>
    </div>
    <div class="bm-thanks">Thank you for choosing <em>Battery Mela</em></div>
    <footer class="bm-page-footer">
      <span class="bm-bottom-left">For any queries, feel free to contact us.</span>
      <div class="bm-partners">${partnersHtml}</div>
      <span class="bm-bottom-right">We are committed to power your life!</span>
    </footer>
  </section>`;
}

export function docFooter({ terms = [], thanks = "Thank you for choosing BatteryMela!", showSig = true }) {
  const co = BATTERYMELA_COMPANY;
  const termsList = terms.map((t) => `<li>${esc(t)}</li>`).join("");
  return `<footer class="doc-footer">
    <div class="footer-grid">
      <div class="footer-terms"><b>Terms &amp; Conditions</b><ul>${termsList}</ul></div>
      <div class="footer-contact">
        <b>Support</b><br/>${esc(co.phone)}<br/>${esc(co.email)}<br/>
        <span class="muted">Warranty as per manufacturer policy</span>
      </div>
    </div>
    <div class="footer-thanks">${esc(thanks)}</div>
    ${showSig ? `<div class="sig-block"><div class="sig-line">Authorised Signatory · ${esc(co.name)}</div></div>` : ""}
  </footer>`;
}

/** Sync logo for legacy quotationTemplate.js */
export function localBatteryMelaLogoDataUriSync() {
  if (logoCache) return logoCache;
  const envUrl = String(process.env.BATTERYMELA_LOGO_URL ?? "").trim();
  if (envUrl) return envUrl;
  for (const name of ["batterymela-logo.png", "batterymela-logo.svg"]) {
    try {
      const logoPath = path.join(PUBLIC_DIR, "assets/logos", name);
      const buf = fsSync.readFileSync(logoPath);
      const mime = name.endsWith(".svg") ? "image/svg+xml" : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return "";
}
