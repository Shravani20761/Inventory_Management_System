import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import { pdfHref } from "../utils/pdfLinks.js";
import {
  INVOICE_CHARGE_FIELDS,
  calculateInvoiceTotals,
  buildQuotationDraftFromQuotation,
  buildQuotationDraftFromRecommendation,
  normalizeQuotationForInvoice,
} from "../utils/invoiceConversion.js";

function ChargeRow({ chargeKey, label, row, onChange }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr 120px",
        gap: 10,
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid #f3f4f6",
      }}
    >
      <input
        type="checkbox"
        checked={Boolean(row.enabled)}
        onChange={(e) => onChange(chargeKey, { ...row, enabled: e.target.checked })}
      />
      <label style={{ fontSize: 16, color: "#374151" }}>{label}</label>
      <input
        className="form-input"
        type="number"
        min="0"
        disabled={!row.enabled}
        value={row.amount || ""}
        onChange={(e) => onChange(chargeKey, { ...row, amount: Number(e.target.value) || 0 })}
        placeholder="₹0"
      />
    </div>
  );
}

export function QuotationEditModal({
  quotation = null,
  recommendationSheet = null,
  selectedOption = null,
  onClose,
  onSaved,
  onConvertToInvoice,
}) {
  const [draft, setDraft] = useState(() => {
    if (quotation?._id || quotation?.quoteKey) return buildQuotationDraftFromQuotation(quotation);
    return buildQuotationDraftFromRecommendation(recommendationSheet ?? {}, selectedOption);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfResult, setPdfResult] = useState(null);
  const [whatsappResult, setWhatsappResult] = useState(null);

  const totals = useMemo(
    () =>
      calculateInvoiceTotals({
        inverterPrice: draft.inverter?.price,
        batteryWithOldPrice: draft.battery?.withOldPrice,
        batteryWithoutOldPrice: draft.battery?.withoutOldPrice,
        pricingMode: draft.pricingMode ?? "withOld",
        additionalCharges: draft.additionalCharges,
        gstRate: draft.gstRate,
        discount: draft.discount,
      }),
    [draft],
  );

  const convertToInvoice = () => {
    if (!onConvertToInvoice) return;
    const payload = normalizeQuotationForInvoice(
      {
        ...draft,
        ...totals,
        selectedOption: draft.selectedOption,
      },
      draft.selectedOption,
    );
    onConvertToInvoice(payload);
    persistDraft().catch(() => {});
  };

  async function persistDraft() {
    let current = { ...draft, ...totals };
    if (!draft._id && !draft.quoteKey && recommendationSheet) {
      const created = await api.createQuotationFromSheet({
        recommendationSheetId: recommendationSheet._id,
        sheetKey: recommendationSheet.sheetKey,
        selectedOption: draft.selectedOption ?? selectedOption,
      });
      current = buildQuotationDraftFromQuotation(created.quotation);
      setDraft(current);
      const quickPdf = pdfHref(
        created.pdf?.pdfUrl || created.quotation?.finalQuotationPdfUrl || created.quotation?.quotationPdfUrl,
      );
      if (quickPdf) window.open(quickPdf, "_blank", "noopener,noreferrer");
    }
    const id = current._id || current.quoteKey;
    if (!id) return current;
    try {
      const updated = await api.updateQuotation({
        id,
        customerName: current.customerName,
        customerPhone: current.customerPhone,
        customerAddress: current.customerAddress,
        validTill: current.validTill,
        discount: current.discount,
        gstRate: current.gstRate,
        pricingMode: current.pricingMode,
        additionalCharges: current.additionalCharges,
      });
      const merged = buildQuotationDraftFromQuotation(updated.quotation);
      setDraft(merged);
      onSaved?.(merged);
      return merged;
    } catch {
      return current;
    }
  }

  const saveDraft = async () => {
    setLoading(true);
    setError("");
    try {
      await persistDraft();
    } catch (e) {
      setError(e.message || "Could not save quotation");
    } finally {
      setLoading(false);
    }
  };

  const generatePdf = async () => {
    setLoading(true);
    setError("");
    try {
      const saved = await persistDraft();
      const pdfBody =
        Array.isArray(saved?.options) && saved.options.length === 1
          ? { optionId: saved.options[0].id }
          : Array.isArray(saved?.options) && saved.options.length > 1 && saved.optionIndex != null
            ? { optionId: String.fromCharCode(65 + Math.min(25, Math.floor(Number(saved.optionIndex)))) }
            : {};
      const data = await api.generateFinalQuotationPdf(saved._id || saved.quoteKey, pdfBody);
      setPdfResult(data);
      const merged = buildQuotationDraftFromQuotation(data.quotation);
      setDraft(merged);
      onSaved?.(merged);
    } catch (e) {
      setError(e.message || "PDF generation failed");
    } finally {
      setLoading(false);
    }
  };

  const shareWhatsApp = async () => {
    setLoading(true);
    setError("");
    try {
      const saved = await persistDraft();
      const pdfBody =
        Array.isArray(saved?.options) && saved.options.length === 1
          ? { optionId: saved.options[0].id }
          : Array.isArray(saved?.options) && saved.options.length > 1 && saved.optionIndex != null
            ? { optionId: String.fromCharCode(65 + Math.min(25, Math.floor(Number(saved.optionIndex)))) }
            : {};
      const data = await api.approveAndSendFinalQuotationWhatsApp(saved._id || saved.quoteKey, pdfBody);
      setWhatsappResult(data.whatsapp);
      if (data.quotation) {
        const merged = buildQuotationDraftFromQuotation(data.quotation);
        setDraft(merged);
        onSaved?.(merged);
      }
    } catch (e) {
      setError((e.message || "WhatsApp send failed") + (e.details ? `\n${String(e.details).slice(0, 800)}` : ""));
    } finally {
      setLoading(false);
    }
  };

  const pdfLink = pdfHref(pdfResult?.pdf?.pdfUrl || draft.finalQuotationPdfUrl);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 960, maxWidth: "96vw" }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ color: "#2563eb" }}>
              Quotation / Estimate
            </div>
            <div style={{ fontSize: 15, color: "#6b7280", marginTop: 4 }}>
              Stage 2 · Edit charges · Generate final PDF · Approve &amp; send WhatsApp · Convert to tax invoice
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div className="modal-body scrollable" style={{ maxHeight: "72vh" }}>
          {error && <div className="profit-alert loss">{error}</div>}

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Quotation #</label>
              <input className="form-input" value={draft.quoteKey || "Draft (save to assign)"} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Valid till</label>
              <input
                className="form-input"
                type="date"
                value={draft.validTill || ""}
                onChange={(e) => setDraft((d) => ({ ...d, validTill: e.target.value }))}
              />
            </div>
          </div>

          <div className="section-title">Customer details</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={draft.customerName || ""}
                onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                className="form-input"
                value={draft.customerPhone || ""}
                onChange={(e) => setDraft((d) => ({ ...d, customerPhone: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea
              className="form-input"
              rows={2}
              value={draft.customerAddress || ""}
              onChange={(e) => setDraft((d) => ({ ...d, customerAddress: e.target.value }))}
            />
          </div>

          <div className="section-title" style={{ marginTop: 16 }}>
            Selected products
          </div>
          <div className="card" style={{ padding: 14, fontSize: 16, lineHeight: 1.7, borderLeft: "4px solid #2563eb" }}>
            <div>
              <strong>Inverter:</strong> {draft.inverter?.brand} {draft.inverter?.model} · {draft.inverter?.inverterVA} VA · ₹
              {Number(draft.inverter?.price || 0).toLocaleString("en-IN")}
            </div>
            <div>
              <strong>Battery:</strong> {draft.battery?.brand} {draft.battery?.model} · {draft.battery?.batteryAH} Ah · ₹
              {Number(draft.battery?.withOldPrice || 0).toLocaleString("en-IN")} (with old)
            </div>
            <div>
              <strong>Sizing:</strong> {draft.calculations?.calculatedVA} VA · {draft.calculations?.calculatedAH} Ah · ~
              {draft.calculations?.backupHours}h backup
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 16 }}>
            Editable charges
          </div>
          <div className="card" style={{ padding: "8px 14px" }}>
            {INVOICE_CHARGE_FIELDS.map(({ key, label }) => (
              <ChargeRow
                key={key}
                chargeKey={key}
                label={label}
                row={draft.additionalCharges?.[key] ?? { enabled: false, amount: 0 }}
                onChange={(k, row) => setDraft((d) => ({ ...d, additionalCharges: { ...d.additionalCharges, [k]: row } }))}
              />
            ))}
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label">Discount (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={draft.discount || ""}
                onChange={(e) => setDraft((d) => ({ ...d, discount: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">GST %</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={draft.gstRate ?? 18}
                onChange={(e) => setDraft((d) => ({ ...d, gstRate: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, padding: 14, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginBottom: 6 }}>
              <span>Product subtotal</span>
              <span>₹{Number(totals.productTotal).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginBottom: 6 }}>
              <span>Additional charges</span>
              <span>₹{Number(totals.additionalTotal).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginBottom: 6 }}>
              <span>Discount</span>
              <span>- ₹{Number(draft.discount || 0).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginBottom: 6 }}>
              <span>Taxable subtotal</span>
              <span>₹{Number(totals.subtotal).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginBottom: 6 }}>
              <span>GST ({totals.gstRate}%)</span>
              <span>₹{Number(totals.gstAmount).toLocaleString("en-IN")}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 22,
                fontWeight: 700,
                color: "#2563eb",
                marginTop: 8,
                paddingTop: 8,
                borderTop: "1px solid #bfdbfe",
              }}
            >
              <span>Grand total</span>
              <span>₹{Number(totals.finalTotal).toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 16 }}>
            Quotation notes
          </div>
          <ul style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.8, paddingLeft: 18 }}>
            <li>{draft.notes?.validity || "Prices valid till the validity date mentioned above."}</li>
            <li>{draft.notes?.stock || "Subject to stock availability at time of order."}</li>
            <li>{draft.notes?.notInvoice || "This is a quotation / estimate — not a tax invoice."}</li>
            <li>{draft.notes?.advance || "Advance payment may be required to confirm the order."}</li>
          </ul>

          {pdfLink && (
            <div className="profit-alert gain" style={{ marginTop: 12 }}>
              Final quotation PDF ready —{" "}
              <a href={pdfLink} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                Open PDF
              </a>
            </div>
          )}
          {whatsappResult?.sent && (
            <div className="profit-alert gain" style={{ marginTop: 8 }}>
              Quotation shared on WhatsApp.
            </div>
          )}
          {whatsappResult && !whatsappResult.sent && (
            <div className="profit-alert loss" style={{ marginTop: 8 }}>
              WhatsApp: {whatsappResult.error || whatsappResult.message || "Not sent"}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Close
          </button>
          <button className="btn btn-outline" onClick={saveDraft} disabled={loading}>
            Save draft
          </button>
          <button className="btn btn-primary" onClick={generatePdf} disabled={loading} style={{ background: "#2563eb" }}>
            <i className="ti ti-file-download"></i> Generate Final Quotation PDF
          </button>
          <button className="btn btn-primary" onClick={shareWhatsApp} disabled={loading} style={{ background: "#16a34a" }}>
            <i className="ti ti-brand-whatsapp"></i> Approve &amp; send WhatsApp
          </button>
          {onConvertToInvoice && (
            <button className="btn btn-outline" onClick={convertToInvoice} disabled={loading}>
              <i className="ti ti-receipt"></i> Convert to Tax Invoice
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
