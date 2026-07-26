import {
  badgeStyle,
  docFooter,
  docHeader,
  esc,
  loadCalculationPanel,
  money,
  partyBoxes,
  productCellHtml,
  renderDocumentHtml,
} from "./documentTemplateEngine.js";

const QUOTATION_TERMS = [
  "This is a quotation with multiple recommendation options — not a tax invoice.",
  "Prices include selected optional services where checked.",
  "Customer should select one option and click Create Invoice in the app.",
  "Prices valid for 7 days from issue date.",
  "Subject to stock availability at time of order.",
];

async function optionsTableRows(options) {
  const rows = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const inv = o.inverter ?? {};
    const bat = o.battery ?? {};
    const invPrice = Number(inv.inverterFinalPrice ?? inv.sellingRate ?? 0);
    const batPrice = Number(bat.withOldPrice ?? bat.sellingRate ?? 0);
    const total = Number(o.totalPrice ?? o.total ?? invPrice + batPrice);
    const badge = o.badge || o.type || "Option";
    rows.push(`<tr>
      <td class="td-c"><span class="option-num">${i + 1}</span><br/><span class="option-badge" style="${badgeStyle(badge)}">${esc(badge)}</span></td>
      <td>${await productCellHtml(o, "inverter")}</td>
      <td class="td-r">${money(invPrice)}</td>
      <td>${await productCellHtml(o, "battery")}</td>
      <td class="td-r">${money(batPrice)}</td>
      <td class="td-c">1</td>
      <td class="td-r td-total">${money(total)}</td>
    </tr>`);
  }
  return rows.join("");
}

async function optionCards(options) {
  const cards = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const badge = o.badge || o.type || "Option";
    const total = Number(o.totalPrice ?? o.total ?? 0);
    const color = o.color || badgeStyle(badge).match(/background:([^;]+)/)?.[1] || "#6B21D8";
    const serviceTotal = Number(o.optionalServicesTotal ?? 0);
    const base = Number(o.baseComboPrice ?? total - serviceTotal);
    cards.push(`<article class="option-card" style="border-color:${color}">
      <header class="option-card-head">
        <span class="option-num">${esc(o.optionLabel || `Option ${i + 1}`)}</span>
        <span class="option-badge" style="${badgeStyle(badge)}">${esc(badge)}</span>
      </header>
      <div class="option-card-products">
        ${await productCellHtml(o, "inverter")}
        ${await productCellHtml(o, "battery")}
      </div>
      <div class="muted">Backup: ${esc(o.backup || o.estimatedBackup || "—")} · ${esc(o.suitableFor || o.note || "")}</div>
      ${serviceTotal > 0 ? `<div class="muted">Base combo: ${money(base)} · Services: ${money(serviceTotal)}</div>` : ""}
      <footer class="option-card-total">${money(total)}</footer>
    </article>`);
  }
  return cards.join("");
}

function totalsRow(options) {
  return options
    .map((o, i) => {
      const total = Number(o.totalPrice ?? o.total ?? 0);
      return `<div class="total-box"><div class="lbl">${esc(o.optionLabel || `Option ${i + 1}`)}</div><div class="val">${money(total)}</div></div>`;
    })
    .join("");
}

function extraDetails(options) {
  const rows = options
    .map((o, i) => {
      const bat = o.battery ?? {};
      return `<tr>
        <td>${esc(o.optionLabel || `Option ${i + 1}`)}</td>
        <td>${esc(bat.batteryType || "—")}</td>
        <td>${esc(bat.warranty || o.warranty || "Standard")}</td>
        <td>${esc(o.backup || o.estimatedBackup || "—")}</td>
      </tr>`;
    })
    .join("");
  return `<table class="options-table">
    <thead><tr><th>Option</th><th>Battery Type</th><th>Warranty</th><th>Backup Support</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** Premium multi-option Recommendation Sheet PDF (Stage 1 — purple theme). */
export async function renderRecommendationHtml(sheet) {
  const options = sheet.suggestedOptions || sheet.options || [];
  const today = sheet.date || new Date(sheet.createdAt || Date.now()).toISOString().slice(0, 10);
  const docNumber = sheet.sheetKey || sheet.quoteKey || sheet.id || "REC-0001";
  const recommended =
    sheet.recommendedOptionLabel ||
    options.find((o) => o.badge === "Recommended")?.optionLabel ||
    options[0]?.optionLabel ||
    "";

  const body = `<main class="page">
    ${await docHeader({
      title: "Quotation / Estimate",
      docNumber,
      date: today,
      badgeLabel: "QUOTATION",
      shieldText: "Compare & Choose",
    })}
    ${partyBoxes(sheet)}
    ${loadCalculationPanel(sheet)}
    <h2 class="section-title">Recommended Packages</h2>
    <section class="options-grid">${await optionCards(options)}</section>
    <h2 class="section-title">Option Comparison</h2>
    <table class="options-table">
      <thead>
        <tr>
          <th>Option</th><th>Inverter</th><th>Inverter Price</th><th>Battery</th><th>Battery Price</th><th>Qty</th><th>Total Price</th>
        </tr>
      </thead>
      <tbody>${await optionsTableRows(options)}</tbody>
    </table>
    <h2 class="section-title">Product Details</h2>
    ${extraDetails(options)}
    <h2 class="section-title">Option Totals</h2>
    <div class="totals-row">${totalsRow(options)}</div>
    <div class="notice-box">
      <strong>★ Our Recommendation:</strong> We suggest <b>${esc(recommended)}</b> for your load and backup requirement.
      Select an option and click <b>Create Invoice</b> in the app to proceed.
    </div>
    ${docFooter({ terms: QUOTATION_TERMS })}
  </main>`;

  return renderDocumentHtml({
    docType: "recommendation",
    docTitle: `Recommendation ${docNumber}`,
    bodyHtml: body,
  });
}
