import { amountToWordsInr } from "../utils/amountInWords.js";
import {
  BATTERYMELA_COMPANY,
  batteryMelaLoadSection,
  batteryMelaPartySection,
  batteryMelaQuotationFooter,
  batteryMelaQuotationHeader,
  esc,
  partnerLogosHtml,
  quotationItemRow,
  renderDocumentHtml,
} from "./documentTemplateEngine.js";

const QUOTATION_TERMS = [
  "Prices are inclusive of all taxes.",
  "Installation charges extra (if applicable).",
  "Warranty as per manufacturer's policy.",
  "This quotation is valid for 7 days from the date of issue.",
];

const TABLE_COLGROUP = `<colgroup>
  <col class="col-sr"/>
  <col class="col-desc"/>
  <col class="col-brand"/>
  <col class="col-qty"/>
  <col class="col-rate"/>
  <col class="col-amt"/>
</colgroup>`;

function addDays(dateStr, days = 7) {
  const d = new Date(dateStr || Date.now());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildStructuredItems(quotation, option) {
  const inv = option?.inverter ?? {};
  const bat = option?.battery ?? {};
  const items = [];
  let sr = 1;
  let batteryTotal = 0;
  let inverterTotal = 0;
  let installationApplicable = false;

  if (bat.modelName || bat.batteryModelNumber || option.batteryName) {
    const rate = Number(bat.withOldPrice ?? bat.sellingRate ?? bat.withoutOldPrice ?? 0);
    batteryTotal = rate;
    items.push({
      sr: sr++,
      typeLabel: "BATTERY",
      title: bat.batteryModelNumber || bat.modelName || option.batteryName || "Battery",
      subtitle: `${bat.capacityAh || option.batteryAh || "—"} Ah ${bat.batteryType || "Battery"}`.trim(),
      brand: bat.brand || "—",
      qty: 1,
      rate,
      productKind: "battery",
    });
  }

  if (inv.modelName || inv.inverterModelNumber || option.inverterName) {
    const rate = Number(inv.inverterFinalPrice ?? inv.sellingRate ?? 0);
    inverterTotal = rate;
    items.push({
      sr: sr++,
      typeLabel: "INVERTER",
      title: inv.inverterModelNumber || inv.modelName || option.inverterName || "Inverter",
      subtitle: `${inv.inverterVA || option.inverterVa || "—"} VA Inverter`,
      brand: inv.brand || "—",
      qty: 1,
      rate,
      productKind: "inverter",
    });
  }

  const charges = quotation.additionalCharges || {};
  const chargeLabels = {
    inverterInstallation: "Inverter Installation",
    batteryInstallation: "Battery Installation",
    wiringCharges: "Wiring Charges",
    transportationCharges: "Transportation",
    trolleyCharges: "Trolley",
    deliveryCharges: "Delivery",
    serviceCharges: "Service Charges",
    otherCharges: "Other Charges",
  };
  for (const [key, label] of Object.entries(chargeLabels)) {
    const row = charges[key];
    if (row?.enabled) {
      installationApplicable = true;
      const amt = Number(row.amount) || 0;
      if (amt > 0) {
        items.push({
          sr: sr++,
          typeLabel: "SERVICE",
          title: label,
          subtitle: "",
          brand: "BatteryMela",
          qty: 1,
          rate: amt,
          productKind: null,
        });
      }
    }
  }

  if (!items.length) {
    const rate = Number(option?.totalPrice ?? option?.total ?? quotation.finalTotal ?? 0);
    items.push({
      sr: 1,
      typeLabel: "PACKAGE",
      title: option?.optionLabel || "Selected package",
      subtitle: quotation.recommendedOptionLabel || "",
      brand: "Combo",
      qty: 1,
      rate,
      productKind: null,
    });
    batteryTotal = rate;
  }

  const lineSubtotal = items.reduce((a, it) => a + it.qty * it.rate, 0);
  const grandTotal = Number(quotation.finalTotal) > 0 ? Number(quotation.finalTotal) : lineSubtotal;

  return {
    items,
    batteryTotal,
    inverterTotal,
    installationApplicable,
    lineSubtotal,
    grandTotal,
  };
}

function normOptionLabel(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Pick the option row used for final PDF line items (never silently fall back to the wrong tier).
 */
export function resolveQuotationOptionForPdf(quotation) {
  const sel = quotation?.selectedOption;
  const meaningful =
    sel &&
    typeof sel === "object" &&
    (sel.optionLabel ||
      sel.type ||
      sel.inverter?.modelName ||
      sel.battery?.modelName ||
      sel.totalPrice != null ||
      sel.total != null);
  if (meaningful) return sel;

  const want = normOptionLabel(quotation?.recommendedOptionLabel);
  if (want) {
    const found = quotation.suggestedOptions?.find(
      (o) =>
        normOptionLabel(o?.optionLabel) === want ||
        normOptionLabel(o?.type) === want ||
        normOptionLabel(o?.badge) === want,
    );
    if (found) return found;
  }

  const opts = quotation.suggestedOptions;
  if (Array.isArray(opts) && opts.length === 1) return opts[0];
  if (Array.isArray(opts) && opts.length > 1) {
    console.warn(
      "[final-quotation-template] Ambiguous PDF option: empty selectedOption with multiple suggestedOptions; using first.",
      quotation?.quoteKey,
    );
  }
  return opts?.[0] || {};
}

/** Final quotation PDF — full A4 Battery Mela layout. */
export async function renderFinalQuotationHtml(quotation) {
  const option = resolveQuotationOptionForPdf(quotation);

  const today = quotation.date || new Date(quotation.createdAt || Date.now()).toISOString().slice(0, 10);
  const validTill = quotation.validTill || addDays(today, 7);
  const docNumber = quotation.quoteKey || quotation.id || "QT-0001";
  const { items, batteryTotal, inverterTotal, installationApplicable, grandTotal } =
    buildStructuredItems(quotation, option);

  const tableRows = await Promise.all(
    items.map((it) =>
      quotationItemRow({
        sr: it.sr,
        typeLabel: it.typeLabel,
        title: it.title,
        subtitle: it.subtitle,
        brand: it.brand,
        qty: it.qty,
        rate: it.rate,
        option,
        productKind: it.productKind,
      }),
    ),
  );

  const partners = await partnerLogosHtml();
  const amountWords = amountToWordsInr(grandTotal);
  const totals = [
    { label: "TOTAL (BATTERY)", value: batteryTotal, applicable: false },
    { label: "TOTAL (INVERTER)", value: inverterTotal, applicable: false },
    {
      label: "INSTALLATION CHARGES",
      value: 0,
      applicable: installationApplicable && batteryTotal + inverterTotal > 0,
    },
  ];

  const closingHtml = batteryMelaQuotationFooter({
    amountWords,
    terms: QUOTATION_TERMS,
    totals,
    grandTotal,
    partnersHtml: partners,
  });

  const body = `<main class="page bm-quotation-page">
    <div class="bm-sheet">
      <div class="bm-sheet-main">
        ${await batteryMelaQuotationHeader({ docNumber, date: today })}
        ${await batteryMelaPartySection(quotation, option)}
        ${batteryMelaLoadSection(quotation, option)}
        <div class="bm-table-wrap">
          <table class="bm-product-table">
            ${TABLE_COLGROUP}
            <thead>
              <tr>
                <th>SR. NO.</th>
                <th class="th-left">ITEM &amp; DESCRIPTION</th>
                <th>BRAND</th>
                <th>QTY</th>
                <th>PRICE (₹)</th>
                <th>AMOUNT (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.join("")}
              ${
                installationApplicable && !items.some((i) => i.typeLabel === "SERVICE")
                  ? `<tr class="bm-install-row">
                      <td class="td-c">${items.length + 1}</td>
                      <td colspan="4"><strong>Installation Charges</strong></td>
                      <td class="td-r">As Applicable</td>
                    </tr>`
                  : ""
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="bm-sheet-bottom">
        ${closingHtml}
        <div class="bm-validity">Valid till ${esc(validTill)} · ${esc(BATTERYMELA_COMPANY.name)} · ${esc(BATTERYMELA_COMPANY.phone)}</div>
      </div>
    </div>
  </main>`;

  return renderDocumentHtml({
    docType: "quotation",
    docTitle: `Quotation ${docNumber}`,
    bodyHtml: body,
  });
}
