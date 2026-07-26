import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { QUOTATION_KIND_LABELS, normalizeQuotationKind } from "../constants/quotationKinds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function localBatteryMelaLogoDataUri() {
  const envUrl = String(process.env.BATTERYMELA_LOGO_URL ?? "").trim();
  if (envUrl) return envUrl;
  for (const name of ["batterymela-logo.png", "batterymela-logo.svg"]) {
    try {
      const logoPath = path.resolve(__dirname, "../public/assets/logos", name);
      const buf = fs.readFileSync(logoPath);
      const mime = name.endsWith(".svg") ? "image/svg+xml" : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return "";
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Whole rupees for combo reference tables (matches printed shop quotations). */
function moneyInt(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Safe for HTML attribute values (e.g. img src). */
function escAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

function onlinePricesRow(online) {
  if (!online || typeof online !== "object") return "";
  const parts = [];
  if (online.amazon) parts.push(`Amazon: ${money(online.amazon)}`);
  if (online.flipkart) parts.push(`Flipkart: ${money(online.flipkart)}`);
  if (online.batteryBhai) parts.push(`BatteryBhai: ${money(online.batteryBhai)}`);
  if (online.batteryBoss) parts.push(`BatteryBoss: ${money(online.batteryBoss)}`);
  if (!parts.length) return "";
  return `<p class="online-row"><b>Online ref:</b> ${esc(parts.join(" · "))}</p>`;
}

function productThumb(url, alt) {
  if (!url) return `<div class="thumb ph">${esc(alt || "No image")}</div>`;
  return `<div class="thumb"><img src="${escAttr(url)}" alt="${esc(alt || "")}" crossorigin="anonymous"/></div>`;
}

function optionCard(option, index, kind) {
  const battery = option.battery ?? {};
  const inverter = option.inverter ?? {};
  const color = option.color || ["#059669", "#0f4aa2", "#7c3aed", "#ea580c", "#0891b2", "#dc2626"][index % 6];
  const invName = inverter.inverterModelNumber || inverter.modelName || option.inverterName || "—";
  const batName = battery.batteryModelNumber || battery.modelName || option.batteryName || "—";
  const invVa = inverter.inverterVA || option.inverterVa || option.requiredInverterVa || "—";
  const batAh = battery.capacityAh || option.batteryAh || "—";
  const backup = option.backup || (option.estimatedBackup != null ? `~${option.estimatedBackup} hrs` : "—");
  const warranty = option.warranty || "Standard warranty";
  const suitable = option.suitableFor || option.note || "";
  const total = option.totalPrice ?? option.total ?? 0;
  const invPrice = Number(inverter.inverterFinalPrice ?? inverter.sellingRate ?? 0);
  const bWithOld = Number(battery.withOldPrice ?? 0);
  const bWithoutOld = Number(battery.withoutOldPrice ?? 0);
  const showInv = Boolean(inverter?.inverterModelNumber || inverter?.modelName || option.inverterName);
  const showBat = Boolean(battery?.batteryModelNumber || battery?.modelName || option.batteryName);
  const invImg = String(inverter.imageUrl || inverter.inverterImage || option.inverterImage || "").trim();
  const batImg = String(battery.imageUrl || battery.batteryImage || option.batteryImage || "").trim();
  const brandLogoChip = String(option.brandLogo || "").trim();
  const comboPriceBreakdown =
    kind === "combo" && showInv && showBat
      ? `<small class="price-sub">Inverter: ${money(invPrice)} · Battery with old: ${money(bWithOld || total)} · Battery without old: ${money(bWithoutOld > 0 ? bWithoutOld : bWithOld || total)} · <b>Combo (with old):</b> ${money(total)}${
          option.totalPriceWithoutOld != null && option.totalPriceWithoutOld !== total
            ? ` · Combo (without old): ${money(option.totalPriceWithoutOld)}`
            : ""
        }</small>`
      : "";

  const invBlock = showInv
    ? `<div class="prod">
          ${productThumb(invImg, invName)}
          <div class="prod-body">
            <span class="lbl">INVERTER</span>
            <strong>${esc(invName)}</strong>
            <small>${esc(invVa)} VA · ${esc(inverter.brand || "")}</small>
            <small>Warranty: ${esc(inverter.warranty || warranty)}</small>
            <small class="price-sub">Price: ${money(invPrice)}</small>
          </div>
        </div>`
    : "";

  const batBlock = showBat
    ? `<div class="prod">
          ${productThumb(batImg, batName)}
          <div class="prod-body">
            <span class="lbl">BATTERY</span>
            <strong>${esc(batName)}</strong>
            <small>${esc(batAh)} Ah · ${esc(battery.brand || "")} · ${esc(battery.batteryType || "")}</small>
            <small>Warranty: ${esc(battery.warranty || warranty)}</small>
            ${
              bWithOld || bWithoutOld
                ? `<small class="price-sub">With old: ${money(bWithOld)} · Without old: ${money(bWithoutOld > 0 ? bWithoutOld : bWithOld)}</small>`
                : ""
            }
          </div>
        </div>`
    : "";

  const gridCols = showInv && showBat ? "1fr 1fr" : "1fr";
  const productsHtml =
    showInv || showBat
      ? `<div class="products" style="grid-template-columns:${gridCols}">${invBlock}${batBlock}</div>`
      : `<p class="muted">No product rows for this option.</p>`;

  return `
    <article class="opt-card" style="border-color:${color}">
      <h3 style="color:${color}">${esc(option.optionLabel || `Option ${index + 1}`)}</h3>
      <p class="tier" style="background:${color}">${esc(option.badge || "")}</p>
      ${brandLogoChip ? `<div class="opt-brand-logo"><img src="${escAttr(brandLogoChip)}" alt="Brand" crossorigin="anonymous"/></div>` : ""}
      ${productsHtml}
      <ul class="meta">
        ${kind === "inverter" ? `<li><b>Backup suitability:</b> ${esc(option.backupSuitability || option.backup || backup)}</li>` : `<li><b>Backup:</b> ${esc(backup)}</li>`}
        <li><b>Warranty:</b> ${esc(warranty)}</li>
        <li><b>Notes:</b> ${esc(suitable)}</li>
      </ul>
      ${onlinePricesRow(option.onlinePrices)}
      ${comboPriceBreakdown}
      <div class="price" style="color:${color}">${money(total)}</div>
    </article>`;
}

function extraItemsTable(items) {
  if (!items?.length) return "";
  const rows = items
    .map(
      (it, i) =>
        `<tr><td>${i + 1}</td><td>${esc(it.model || it.modelName)}</td><td>${esc(it.brand || "")}</td><td>${it.qty ?? 1}</td><td>${money(it.rate ?? it.sellingRate ?? it.sellRate)}</td><td>${money((it.qty ?? 1) * (it.rate ?? it.sellingRate ?? 0))}</td></tr>`
    )
    .join("");
  return `
    <section class="extra-block">
      <h2>Additional Items (from inventory)</h2>
      <table class="cmp"><thead><tr><th>#</th><th>Model</th><th>Brand</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
}

function customerInfoBoxes(quotation, kind) {
  const addr = quotation.customerAddress || quotation.requirements?.customerAddress || "";
  const reqText =
    quotation.customerRequirements ||
    quotation.appliancesNote ||
    quotation.roomNotes ||
    quotation.requirements?.roomNotes ||
    "";

  const box1 = `<div class="box">
      <h2>Customer</h2>
      <p><b>Name:</b> ${esc(quotation.customerName)}</p>
      <p><b>Phone:</b> ${esc(quotation.customerPhone)}</p>
      ${addr ? `<p><b>Address:</b> ${esc(addr)}</p>` : ""}
    </div>`;

  let box2 = "";
  if (kind === "combo" || kind === "inverter" || kind === "battery") {
    box2 = `<div class="box">
      <h2>Home requirement</h2>
      <p><b>Room size:</b> ${esc(quotation.flatType || "—")}</p>
      <p><b>Backup target:</b> ${esc(quotation.backupHours)} h (where applicable)</p>
      <p><b>Est. load:</b> ~${esc(quotation.totalLoad || "—")} W</p>
      ${reqText ? `<p><b>Appliances / notes:</b> ${esc(reqText)}</p>` : ""}
    </div>`;
  } else if (kind === "car") {
    box2 = `<div class="box">
      <h2>Vehicle</h2>
      <p><b>Brand:</b> ${esc(quotation.vehicleBrand || quotation.requirements?.vehicleBrand || "—")}</p>
      <p><b>Model:</b> ${esc(quotation.vehicleModel || quotation.requirements?.vehicleModel || "—")}</p>
      <p><b>Fuel:</b> ${esc(quotation.fuelType || quotation.requirements?.fuelType || "—")}</p>
    </div>`;
  } else if (kind === "bike") {
    box2 = `<div class="box">
      <h2>Bike</h2>
      <p><b>Brand:</b> ${esc(quotation.bikeBrand || quotation.requirements?.bikeBrand || "—")}</p>
      <p><b>Model:</b> ${esc(quotation.bikeModel || quotation.requirements?.bikeModel || "—")}</p>
    </div>`;
  }

  const box3 = `<div class="box">
      <h2>Quotation</h2>
      <p><b>Type:</b> ${esc(QUOTATION_KIND_LABELS[kind] || kind)}</p>
      <p><b>Prepared by:</b> ${esc(quotation.preparedBy || "Sales")}</p>
      <p><b>Valid till:</b> ${esc(quotation.validTill || quotation.date || "")}</p>
      <p><b>Budget tier:</b> ${esc(quotation.budgetType || "—")}</p>
    </div>`;

  return `<section class="info-grid">${box1}${box2}${box3}</section>`;
}

function loadSummaryBox(quotation, kind) {
  if (kind === "inverter" || kind === "combo") {
    return `<section class="box" style="margin-top:8px;border:1px solid #94a3b8;border-radius:8px;padding:10px;background:#f8fafc">
      <h2>Technical summary</h2>
      <p><b>Inverter band:</b> ${esc(quotation.inverterRange || "—")}</p>
      <p><b>Battery band:</b> ${esc(quotation.batteryRange || "—")}</p>
      <p><b>Estimated backup:</b> ${esc(quotation.estimatedBackupRange || "—")}</p>
    </section>`;
  }
  if (kind === "battery") {
    return `<section class="box" style="margin-top:8px;border:1px solid #94a3b8;border-radius:8px;padding:10px;background:#f8fafc">
      <h2>Battery summary</h2>
      <p><b>Target range:</b> ${esc(quotation.batteryRange || "—")}</p>
      <p><b>Backup hours (customer):</b> ${esc(quotation.backupHours)} h</p>
    </section>`;
  }
  return `<section class="box" style="margin-top:8px;border:1px solid #94a3b8;border-radius:8px;padding:10px;background:#f8fafc">
      <h2>Inventory match</h2>
      <p>Options ranked for compatibility with the vehicle or bike details you provided. Prices are from live stock.</p>
    </section>`;
}

/** Brand for grouping combo rows (same field as inventory row). */
function comboOptionBrand(o) {
  const b = String(o.inverter?.brand || o.battery?.brand || "").trim();
  return b || "Other";
}

/** Group combo options by brand → sort brand A–Z (reference: LUMINOUS, EXIDE, MICROTEK sections). */
function groupComboOptionsByBrand(options) {
  const map = new Map();
  for (const o of options) {
    const k = comboOptionBrand(o);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
}

/**
 * Reference-style combo layout: one table per brand, columns Sr. No. | Inverter | Inverter ₹ | Battery | Battery ₹ | Total ₹.
 * Values are taken only from each option object (one inventory row per row).
 */
function comboBrandGroupedTablesHtml(options) {
  const groups = groupComboOptionsByBrand(options);
  return groups
    .map(([brand, rows]) => {
      const body = rows
        .map((o, idx) => {
          const inv = o.inverter ?? {};
          const bat = o.battery ?? {};
          const invName = String(inv.inverterModelNumber || inv.modelName || "—").trim();
          const batName = String(bat.batteryModelNumber || bat.modelName || "—").trim();
          const invP = Number(inv.inverterFinalPrice ?? inv.sellingRate ?? 0);
          const batP = Number(bat.withOldPrice ?? bat.sellingRate ?? 0);
          const total = Number(o.totalPrice ?? o.total ?? o.comboWithOld ?? invP + batP);
          return `<tr>
          <td class="td-c">${idx + 1}</td>
          <td>${esc(invName)} <span class="combo-suffix">(Inverter)</span></td>
          <td class="td-r">${moneyInt(invP)}</td>
          <td>${esc(batName)} <span class="combo-suffix">(Battery)</span></td>
          <td class="td-r">${moneyInt(batP)}</td>
          <td class="td-r td-total"><b>${moneyInt(total)}</b></td>
        </tr>`;
        })
        .join("");
      return `<section class="combo-brand-section">
      <h2 class="combo-brand-heading">${esc(brand.toUpperCase())}</h2>
      <table class="combo-ref-table">
        <thead>
          <tr>
            <th>Sr. No.</th>
            <th>Inverter</th>
            <th>Inverter Price (₹)</th>
            <th>Battery</th>
            <th>Battery Price (₹)</th>
            <th>Total Price (₹)</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
    })
    .join("");
}

/** Purple / gradient letterhead for professional combo PDFs. */
function comboBrandedHeader(quotation, logoUrl, today) {
  const id = esc(quotation.id);
  const safeLogo = String(logoUrl ?? "").trim();
  const logoBlock = safeLogo
    ? `<img class="combo-pro-logo-img" src="${escAttr(safeLogo)}" alt="BatteryMela" crossorigin="anonymous"/>`
    : `<div class="combo-pro-logo-fallback" aria-hidden="true">BM</div>`;
  return `<header class="combo-pro-header">
    <div class="combo-pro-header-left">
      ${logoBlock}
      <div>
        <div class="combo-pro-title">Battery<span>Mela</span></div>
        <p class="combo-pro-tag">Inverter + battery · Home &amp; commercial · ${esc(QUOTATION_KIND_LABELS.combo || "Combo")}</p>
        <p class="combo-pro-slogan">Power you can trust — sizing from your actual inventory rows.</p>
      </div>
    </div>
    <div class="combo-pro-header-right">
      <div class="combo-pro-pill">QUOTATION</div>
      <p class="combo-pro-ref"><b>Quotation no.</b> ${id}</p>
      <p class="combo-pro-ref"><b>Date</b> ${esc(today)}</p>
    </div>
  </header>`;
}

/** Customer + company blocks like the reference quotation. */
function comboCustomerCompanyRow(quotation) {
  const addr = quotation.customerAddress || quotation.requirements?.customerAddress || "";
  const companyName = quotation.companyName || "BatteryMela";
  const companyAddr =
    quotation.companyAddress || "Datta Mandir Road, Opposite of Datta Mandir, Wakad.";
  const companyPhone = quotation.companyPhone || "7798234598";
  return `<section class="combo-party-grid">
    <div class="party-box">
      <h3 class="party-title">Customer Details</h3>
      <p><b>Name:</b> ${esc(quotation.customerName)}</p>
      <p><b>Phone No.:</b> ${esc(quotation.customerPhone)}</p>
      ${addr ? `<p><b>Address:</b> ${esc(addr)}</p>` : ""}
    </div>
    <div class="party-box party-from">
      <h3 class="party-title">From</h3>
      <p><b>${esc(companyName)}</b></p>
      <p>${esc(companyAddr)}</p>
      <p><b>Phone:</b> ${esc(companyPhone)}</p>
    </div>
  </section>`;
}

function comboTechnicalStrip(quotation) {
  const req =
    quotation.customerRequirements ||
    quotation.appliancesNote ||
    quotation.roomNotes ||
    quotation.requirements?.roomNotes ||
    "";
  const sizing = quotation.requirements?.loadSizing;
  let sizingBlock = "";
  if (sizing?.lines?.length) {
    const rows = sizing.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.categoryLabel)}</td><td>${esc(l.typeLabel)}</td><td style="text-align:center">${esc(
            String(l.quantity),
          )}</td><td style="text-align:right">${esc(String(l.wattsEach))} W</td><td style="text-align:right"><b>${esc(
            String(l.lineWatts),
          )} W</b></td></tr>`,
      )
      .join("");
    const summaryList = sizing.lines
      .map(
        (l) =>
          `<li><span class="load-line-qty">${esc(String(l.quantity))}×</span> ${esc(l.typeLabel)} <span class="load-line-w">= ${esc(String(l.lineWatts))} W</span></li>`,
      )
      .join("");
    sizingBlock = `<section class="combo-load-panel">
      <h3 class="combo-load-title">Load calculation</h3>
      <table class="cmp load-calc-table"><thead><tr><th>Category</th><th>Type</th><th class="td-c">Qty</th><th class="td-r">Unit</th><th class="td-r">Line</th></tr></thead><tbody>${rows}</tbody></table>
      <ul class="load-line-summary">${summaryList}</ul>
      <p class="load-total-line"><b>Total load</b> = ${esc(String(sizing.totalWatts))} W</p>
      <p class="load-engineering-line">
      <b>VA</b> (÷${esc(String(sizing.powerFactor ?? 0.8))} PF): ${esc(String(sizing.calculatedVA))} → <b>${esc(String(sizing.roundedVA))} VA</b>
      &nbsp;·&nbsp;
      <b>Battery Ah</b> (${esc(String(sizing.backupHours ?? quotation.backupHours))}h @ 12V × ${esc(String(sizing.efficiency ?? 0.85))} η): ${esc(String(sizing.calculatedAH))} → <b>${esc(String(sizing.roundedAH))} Ah</b>
      </p>
    </section>`;
  }
  return `<section class="combo-req-strip">
    <p><b>Room / house:</b> ${esc(quotation.flatType || quotation.requirements?.houseType || "—")} &nbsp;·&nbsp; <b>Rooms:</b> ${esc(String(quotation.requirements?.numberOfRooms || "—"))} &nbsp;·&nbsp; <b>Backup:</b> ${esc(String(quotation.backupHours ?? "—"))} h &nbsp;·&nbsp; <b>Est. load:</b> ~${esc(String(quotation.totalLoad || "—"))} W</p>
    ${req ? `<p><b>Notes:</b> ${esc(req)}</p>` : ""}
  </section>${sizingBlock}`;
}

function comparisonTable(quotation, options, kind) {
  if (kind === "inverter") {
    const rows = options
      .map(
        (o) => `<tr>
        <td>${esc(o.optionLabel)}</td>
        <td>${esc(o.inverter?.inverterModelNumber || o.inverter?.modelName || "—")}</td>
        <td>${o.inverter?.inverterVA || "—"}</td>
        <td>${esc(o.inverter?.warranty || o.warranty || "—")}</td>
        <td><b>${money(o.totalPrice ?? o.total)}</b></td>
      </tr>`
      )
      .join("");
    return `<table class="cmp">
      <thead><tr><th>Option</th><th>Model</th><th>VA</th><th>Warranty</th><th>Price</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  if (kind === "battery" || kind === "car" || kind === "bike") {
    const rows = options
      .map(
        (o) => `<tr>
        <td>${esc(o.optionLabel)}</td>
        <td>${esc(o.battery?.batteryModelNumber || o.battery?.modelName || "—")}</td>
        <td>${o.battery?.capacityAh || "—"}</td>
        <td>${money(o.battery?.withOldPrice || o.total)}</td>
        <td>${money(o.battery?.withoutOldPrice || o.battery?.withOldPrice || o.total)}</td>
        <td><b>${money(o.totalPrice ?? o.total)}</b></td>
      </tr>`
      )
      .join("");
    return `<table class="cmp">
      <thead><tr><th>Option</th><th>Battery</th><th>Ah</th><th>With old</th><th>Without old</th><th>Listed</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  const rows = options
    .map(
      (o) => `<tr>
        <td>${esc(o.optionLabel)}</td>
        <td>${esc(o.inverter?.inverterModelNumber || o.inverter?.modelName || "—")}</td>
        <td>${o.inverter?.inverterVA || "—"}</td>
        <td>${money(o.inverter?.inverterFinalPrice ?? o.inverter?.sellingRate ?? 0)}</td>
        <td>${esc(o.battery?.batteryModelNumber || o.battery?.modelName || "—")}</td>
        <td>${o.battery?.capacityAh || "—"}</td>
        <td>${money(o.battery?.withOldPrice ?? 0)}</td>
        <td>${money(o.battery?.withoutOldPrice ?? o.battery?.withOldPrice ?? 0)}</td>
        <td>${esc(o.backup || o.estimatedBackup || "—")}</td>
        <td><b>${money(o.totalPrice ?? o.total)}</b></td>
      </tr>`
    )
    .join("");
  return `<table class="cmp">
    <thead><tr><th>Option</th><th>Inverter model</th><th>VA</th><th>Inv. ₹</th><th>Battery model</th><th>Ah</th><th>With old</th><th>W/o old</th><th>Backup</th><th>Combo ₹</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderQuotationHtml(quotation) {
  const kind = normalizeQuotationKind(quotation.quotationKind);
  const options = quotation.suggestedOptions || quotation.options || [];
  const isComboReference = kind === "combo" && options.length > 0;

  const OPTIONS_PER_PAGE = 6;
  const chunks = [];
  for (let i = 0; i < options.length; i += OPTIONS_PER_PAGE) {
    chunks.push(options.slice(i, i + OPTIONS_PER_PAGE));
  }
  if (!chunks.length) chunks.push([]);

  const today = quotation.date || new Date().toISOString().slice(0, 10);
  const extraItems = quotation.extraItems || quotation.manualItems || [];
  const recommended =
    quotation.recommendedOptionLabel ||
    options.find((o) => o.badge === "Recommended")?.optionLabel ||
    options[1]?.optionLabel ||
    options[0]?.optionLabel ||
    "";

  const cmp = comparisonTable(quotation, options, kind);
  const optionsClass = kind === "combo" ? "options options-combo" : "options";
  const totalOptPages = chunks.length;

  const fullHeader = `<header class="brand">
      <div class="brand-left">
        <div class="logo">⚡</div>
        <div>
          <h1>BATTERY<span>MELA</span></h1>
          <p class="tagline">Multi-category quotations · Inverter · Home battery · Car · Bike</p>
        </div>
      </div>
      <div class="brand-right">
        <div class="quote-badge">QUOTATION</div>
        <div class="ref"><b>Ref:</b> ${esc(quotation.id)}<br/><b>Date:</b> ${esc(today)}</div>
      </div>
    </header>`;

  const miniHeader = `<header class="brand">
      <div class="brand-left">
        <div class="logo">⚡</div>
        <div>
          <h1>BATTERY<span>MELA</span></h1>
          <p class="tagline">${esc(QUOTATION_KIND_LABELS[kind] || "")} · ${esc(quotation.id)}</p>
        </div>
      </div>
    </header>`;

  const comparisonFooter = `
    <h2 style="font-size:12px;color:#08235b;margin-top:12px">Comparison summary</h2>
    ${cmp}
    <div class="recommend">
      <h3>★ Recommendation</h3>
      <p>We suggest <b>${esc(recommended)}</b> for the best match to your requirement.</p>
    </div>
    <div class="footer-grid">
      <div class="terms">
        <b>Terms &amp; Conditions</b>
        <ul>
          <li>Prices from live inventory; GST as applicable.</li>
          <li>Installation / cabling extra if required.</li>
          <li>Valid 7 days from issue date.</li>
          <li>Old battery exchange subject to inspection.</li>
        </ul>
      </div>
      <div>
        <div class="whatsapp">
          <b>WhatsApp</b><br/>
          ${esc(quotation.customerPhone)}
          ${quotation.whatsappSent ? " — <b>Sent</b>" : ""}
        </div>
        <div class="sig">Authorised signatory<br/><b>Batterymela</b></div>
      </div>
    </div>`;

  const comparisonFooterComboRef = `
    <p class="thank-you-ref">Thank you for choosing <b>BATTERY MELA</b>!</p>
    <div class="recommend">
      <h3>★ Recommendation</h3>
      <p>We suggest <b>${esc(recommended)}</b> for your requirement.</p>
    </div>
    <div class="footer-grid">
      <div class="terms">
        <b>Terms &amp; Conditions</b>
        <ul>
          <li>Prices are inclusive of all taxes.</li>
          <li>Installation charges extra (if applicable).</li>
          <li>Warranty as per manufacturer's policy.</li>
          <li>Quotation valid for 7 days.</li>
        </ul>
      </div>
      <div>
        <div class="whatsapp">
          <b>WhatsApp</b><br/>
          ${esc(quotation.customerPhone)}
          ${quotation.whatsappSent ? " — <b>Sent</b>" : ""}
        </div>
        <div class="sig"><b>BatteryMela Team</b></div>
      </div>
    </div>`;

  const footerBlock = isComboReference ? comparisonFooterComboRef : comparisonFooter;

  let optionPagesHtml = "";
  if (isComboReference) {
    const logoUrl =
      localBatteryMelaLogoDataUri() ||
      options.map((o) => o.brandLogo).find((x) => String(x || "").trim()) ||
      "";
    const cards =
      options.map((o, i) => optionCard(o, i, kind)).join("") || "<p class='muted'>No combo options.</p>";
    optionPagesHtml = `<main class="page page-combo-pro">
    ${comboBrandedHeader(quotation, logoUrl, today)}
    ${comboCustomerCompanyRow(quotation)}
    ${comboTechnicalStrip(quotation)}
    ${extraItemsTable(extraItems)}
    <p class="section-title-pro">Recommended packages</p>
    <section class="options options-combo-pro">${cards}</section>
    <p class="section-title-pro">Price summary (by brand)</p>
    ${comboBrandGroupedTablesHtml(options)}
    ${comparisonFooterComboRef}
  </main>`;
  } else {
    chunks.forEach((chunk, pi) => {
      const globalStart = pi * OPTIONS_PER_PAGE;
      const cards =
        chunk.map((o, idx) => optionCard(o, globalStart + idx, kind)).join("") ||
        "<p class='muted'>No options in this page.</p>";
      const title =
        totalOptPages > 1 ? `Quotation options (${pi + 1} / ${totalOptPages})` : "Quotation options";
      if (pi === 0) {
        optionPagesHtml += `<main class="page">
    ${fullHeader}
    ${customerInfoBoxes(quotation, kind)}
    ${loadSummaryBox(quotation, kind)}
    ${extraItemsTable(extraItems)}
    <p class="section-title">${esc(title)}</p>
    <section class="${optionsClass}">${cards}</section>
  </main>`;
      } else {
        optionPagesHtml += `<main class="page">
    ${miniHeader}
    <p class="section-title">${esc(title)}</p>
    <section class="${optionsClass}">${cards}</section>
  </main>`;
      }
    });
  }

  const comboProCss = `
    .page-combo-pro{background:linear-gradient(180deg,#faf5ff 0%,#fff 24%)}
    .combo-pro-header{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;margin:-12mm -10mm 16px -10mm;background:linear-gradient(125deg,#4c1d95 0%,#6d28d9 45%,#5b21b6 100%);color:#fff;border-radius:0 0 14px 14px;box-shadow:0 10px 28px rgba(76,29,149,0.28)}
    .combo-pro-header-left{display:flex;gap:14px;align-items:center;max-width:72%}
    .combo-pro-logo-img{width:58px;height:58px;object-fit:contain;border-radius:12px;background:#fff;padding:5px}
    .combo-pro-logo-fallback{width:58px;height:58px;border-radius:12px;background:#fff;color:#4c1d95;font-weight:900;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .combo-pro-title{font-size:23px;font-weight:800;letter-spacing:-0.4px;margin:0;line-height:1.1}
    .combo-pro-title span{color:#fde68a}
    .combo-pro-tag{margin:6px 0 0;font-size:10px;opacity:0.93}
    .combo-pro-slogan{margin:8px 0 0;font-size:10px;opacity:0.88;max-width:440px;line-height:1.45}
    .combo-pro-header-right{text-align:right;flex-shrink:0}
    .combo-pro-pill{display:inline-block;background:#fde68a;color:#1e1b4b;font-weight:800;font-size:11px;padding:7px 16px;border-radius:999px;letter-spacing:1.2px}
    .combo-pro-ref{margin:8px 0 0;font-size:11px;opacity:0.95}
    .section-title-pro{font-size:13px;font-weight:800;color:#5b21b6;margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid #e9d5ff;letter-spacing:0.3px}
    .options-combo-pro{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .page-combo-pro .opt-card{border-radius:14px;box-shadow:0 4px 16px rgba(15,23,42,0.07);border-width:2px;background:#fff}
    .page-combo-pro .thumb{width:78px;height:78px;border-radius:10px;border:1px solid #ede9fe;background:#faf5ff}
    .opt-brand-logo{text-align:center;margin:0 0 8px}
    .opt-brand-logo img{max-height:40px;max-width:140px;object-fit:contain}
    .combo-load-panel{margin:12px 0;border:1px solid #ddd6fe;border-radius:12px;padding:12px 14px;background:linear-gradient(135deg,#faf5ff,#fff)}
    .combo-load-title{margin:0 0 8px;font-size:12px;color:#5b21b6;font-weight:800;text-transform:uppercase;letter-spacing:0.5px}
    .load-calc-table{margin-top:0}
    .load-line-summary{margin:10px 0 0;padding-left:18px;color:#334155;font-size:11px;line-height:1.55}
    .load-line-qty{font-weight:700;color:#6d28d9;margin-right:4px}
    .load-line-w{font-weight:600}
    .load-total-line{margin:8px 0 0;font-size:12px;color:#1e1b4b}
    .load-engineering-line{margin:6px 0 0;font-size:11px;color:#475569}
    .combo-party-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:12px 0 14px}
    .party-box{border:1px solid #e9d5ff;border-radius:10px;padding:10px 12px;background:#fff}
    .party-title{margin:0 0 8px;font-size:11px;color:#5b21b6;text-transform:uppercase;letter-spacing:0.6px}
    .party-box p{margin:4px 0;font-size:11px;line-height:1.45}
    .party-from{background:#faf5ff}
    .combo-req-strip{border:1px dashed #c4b5fd;border-radius:10px;padding:10px 12px;margin-bottom:12px;background:#fff;font-size:10px;color:#334155}
    .combo-brand-section{margin-bottom:16px;page-break-inside:avoid}
    .combo-brand-heading{margin:0 0 6px;font-size:12px;font-weight:800;color:#5b21b6;letter-spacing:1px;border-bottom:2px solid #7c3aed;padding-bottom:4px}
    .combo-ref-table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}
    .combo-ref-table th{background:linear-gradient(90deg,#5b21b6,#7c3aed);color:#fff;padding:7px 6px;text-align:left;font-weight:700}
    .combo-ref-table td{border:1px solid #e9d5fe;padding:6px;vertical-align:top}
    .combo-ref-table .td-c{text-align:center;width:36px}
    .combo-ref-table .td-r{text-align:right;white-space:nowrap}
    .combo-ref-table .td-total{background:#faf5ff}
    .combo-suffix{color:#64748b;font-size:9px;font-weight:400}
    .thank-you-ref{text-align:center;font-size:12px;color:#5b21b6;margin:16px 0 8px}
    .cmp .td-c{text-align:center}
    .cmp .td-r{text-align:right}
  `;

  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#071334;font-size:11px;background:#f1f5f9}
    .page{width:100%;max-width:190mm;min-height:260mm;margin:0 auto;padding:12mm 10mm;page-break-after:always;background:#fff;position:relative}
    .page:last-child{page-break-after:auto}
    .brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #08235b;padding-bottom:10px;margin-bottom:12px}
    .brand-left{display:flex;gap:10px;align-items:center}
    .logo{width:44px;height:44px;background:linear-gradient(135deg,#08235b,#dc2626);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px}
    .brand h1{margin:0;font-size:22px;color:#08235b;letter-spacing:-0.5px}
    .brand h1 span{color:#dc2626}
    .tagline{margin:2px 0 0;font-size:10px;color:#64748b}
    .brand-right{text-align:right}
    .quote-badge{background:#08235b;color:#fff;font-weight:800;padding:6px 14px;border-radius:6px;font-size:12px}
    .ref{margin-top:4px;font-size:10px;color:#475569}
    .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px}
    .box{border:1px solid #94a3b8;border-radius:8px;padding:10px;background:#f8fafc}
    .box.full-width{grid-column:1/-1}
    .box h2{margin:0 0 6px;font-size:11px;color:#08235b;text-transform:uppercase;letter-spacing:0.5px}
    .box p{margin:3px 0;line-height:1.45}
    .section-title{font-size:12px;font-weight:700;color:#08235b;margin:0 0 8px}
    .options{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:10px}
    .options-combo{grid-template-columns:1fr 1fr}
    .opt-card{border:2px solid #ccc;border-radius:8px;padding:10px;background:#fff}
    .opt-card h3{margin:0 0 4px;font-size:12px;text-align:center}
    .tier{display:block;color:#fff;font-size:9px;padding:3px 8px;border-radius:6px;margin:0 0 8px;text-align:center;width:100%}
    .products{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;align-items:start}
    .prod{display:flex;gap:8px;background:#f1f5f9;border-radius:6px;padding:6px;font-size:10px;align-items:flex-start}
    .prod-body{flex:1;min-width:0}
    .thumb{width:56px;height:56px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#e2e8f0;display:flex;align-items:center;justify-content:center}
    .thumb img{width:100%;height:100%;object-fit:contain}
    .thumb.ph{font-size:8px;color:#64748b;text-align:center;padding:4px}
    .lbl{font-size:8px;color:#64748b;display:block}
    .meta{list-style:none;padding:0;margin:0 0 6px;font-size:9px;color:#475569}
    .meta li{margin:2px 0}
    .price{font-size:17px;font-weight:900;text-align:center;margin-top:4px}
    .price-sub{display:block;margin-top:4px;color:#0f172a}
    .online-row{margin:4px 0 0;font-size:9px;color:#475569}
    .muted{color:#94a3b8;font-size:10px;text-align:center}
    .cmp{width:100%;border-collapse:collapse;margin-top:8px;font-size:10px}
    .cmp th{background:#08235b;color:#fff;padding:6px;text-align:left}
    .cmp td{border:1px solid #cbd5e1;padding:5px 6px}
    .recommend{background:#eff6ff;border:2px solid #0f4aa2;border-radius:8px;padding:10px;margin:12px 0}
    .recommend h3{margin:0 0 4px;color:#0f4aa2;font-size:12px}
    .footer-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .terms{font-size:9px;color:#475569;line-height:1.55}
    .whatsapp{background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:8px;font-size:10px;color:#166534}
    .extra-block{margin-top:10px}
    .sig{margin-top:18px;text-align:right;font-size:10px}
    ${isComboReference ? comboProCss : ""}
  </style></head><body>
  ${optionPagesHtml}
  ${isComboReference ? "" : `<main class="page">
    ${miniHeader}
    ${footerBlock}
  </main>`}
  </body></html>`;

  return html;
}
