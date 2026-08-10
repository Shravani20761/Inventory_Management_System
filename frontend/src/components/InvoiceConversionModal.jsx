import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import {
  INVOICE_CHARGE_FIELDS,
  calculateInvoiceTotals,
  buildInvoiceDraftFromQuotation,
  normalizeQuotationForInvoice,
} from "../utils/invoiceConversion.js";
import { PrintableInvoiceDocument, printInvoiceElement } from "./PrintableInvoice.jsx";

function invoicePdfHref(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

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

export function InvoiceConversionModal({ quotation, selectedOption, quotationOptionId, onClose, onGenerated }) {
  const [draft, setDraft] = useState(() =>
    buildInvoiceDraftFromQuotation(
      normalizeQuotationForInvoice(quotation, selectedOption, quotationOptionId),
      selectedOption,
    ),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const totals = useMemo(
    () =>
      calculateInvoiceTotals({
        inverterPrice: draft.inverter?.price,
        batteryWithOldPrice: draft.battery?.withOldPrice,
        batteryWithoutOldPrice: draft.battery?.withoutOldPrice,
        pricingMode: draft.pricing?.pricingMode ?? draft.pricingMode ?? "withOld",
        additionalCharges: draft.additionalCharges,
        gstRate: draft.gstRate,
        discount: draft.discount ?? 0,
      }),
    [draft],
  );

  const setCustomer = (key, val) =>
    setDraft((d) => ({ ...d, customerDetails: { ...d.customerDetails, [key]: val } }));

  const setCharge = (key, row) =>
    setDraft((d) => ({ ...d, additionalCharges: { ...d.additionalCharges, [key]: row } }));

  const setNote = (key, val) => setDraft((d) => ({ ...d, notes: { ...d.notes, [key]: val } }));

  const generateInvoice = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...draft,
        ...totals,
        discount: draft.discount ?? 0,
        pricingMode: totals.pricingMode,
        selectedOption: draft.selectedOption,
        quotationOptionId: quotationOptionId ?? draft.quotationOptionId ?? "",
        sendWhatsapp: draft.sendWhatsapp !== false,
      };
      const data = await api.generateInvoice(payload);
      setResult(data);
      onGenerated?.(data.invoice, quotation);
    } catch (e) {
      setError(e.message || "Invoice generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay invoice-modal-print">
      <div className="modal" style={{ width: 960, maxWidth: "96vw" }}>
        <div className="modal-header no-print">
          <div>
            <div className="modal-title">Invoice — Finalize Billing</div>
            <div style={{ fontSize: 15, color: "#6b7280", marginTop: 4 }}>
              Edit charges · Apply discount · Generate final tax invoice
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div className="modal-body scrollable" style={{ maxHeight: "72vh" }}>
          {error && <div className="profit-alert loss">{error}</div>}

          {result ? (
            <>
              <div className="profit-alert gain" style={{ marginBottom: 16 }}>
                Invoice <strong>{result.invoice?.invoiceNumber}</strong> generated (A4 PDF).
                {result.invoice?.invoicePdfUrl || result.invoice?.pdfUrl ? (
                  <>
                    {" "}
                    <a
                      href={invoicePdfHref(result.invoice.invoicePdfUrl || result.invoice.pdfUrl)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 600 }}
                    >
                      Download PDF
                    </a>
                  </>
                ) : null}
                {" · "}
                WhatsApp: {result.whatsapp?.sent ? "Sent" : result.whatsapp?.error || "Not sent"}
              </div>
              <div style={{ background: "#f3f4f6", padding: 12, borderRadius: 10 }}>
                <PrintableInvoiceDocument invoice={result.invoice} printId="invoice-conversion-print-area" />
              </div>
            </>
          ) : (
            <>
              <div className="section-title">Customer details</div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={draft.customerDetails?.name ?? ""} onChange={(e) => setCustomer("name", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={draft.customerDetails?.phone ?? ""} onChange={(e) => setCustomer("phone", e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} value={draft.customerDetails?.address ?? ""} onChange={(e) => setCustomer("address", e.target.value)} />
              </div>

              <div className="section-title" style={{ marginTop: 16 }}>
                Selected products
              </div>
              <div className="card" style={{ padding: 14, fontSize: 16, lineHeight: 1.7 }}>
                <div>
                  <strong>Inverter:</strong> {draft.inverter?.brand} {draft.inverter?.model} · {draft.inverter?.inverterVA} VA · ₹
                  {Number(draft.inverter?.price || 0).toLocaleString("en-IN")}
                </div>
                <div>
                  <strong>Battery:</strong> {draft.battery?.brand} {draft.battery?.model} · {draft.battery?.batteryAH} Ah ·{" "}
                  {draft.battery?.batteryType || "—"} · With old ₹{Number(draft.battery?.withOldPrice || 0).toLocaleString("en-IN")} · Without old ₹
                  {Number(draft.battery?.withoutOldPrice || 0).toLocaleString("en-IN")}
                </div>
                <div>
                  <strong>Sizing:</strong> {draft.calculations?.calculatedVA} VA · {draft.calculations?.calculatedAH} Ah · ~
                  {draft.calculations?.backupHours}h backup · {draft.calculations?.totalLoad}W load
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 16 }}>
                Battery exchange pricing
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                {[
                  { mode: "withOld", label: "With old battery (exchange)" },
                  { mode: "withoutOld", label: "Without old battery (full price)" },
                ].map(({ mode, label }) => (
                  <label
                    key={mode}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `2px solid ${totals.pricingMode === mode ? "#6B21D8" : "#e5e7eb"}`,
                      background: totals.pricingMode === mode ? "#faf5ff" : "#fff",
                      fontSize: 16,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="pricingMode"
                      checked={totals.pricingMode === mode}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          pricingMode: mode,
                          pricing: { ...d.pricing, pricingMode: mode },
                        }))
                      }
                      style={{ marginRight: 8 }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {totals.scrapAdjustment > 0 && (
                <div style={{ fontSize: 15, color: "#059669", marginBottom: 12 }}>
                  Old battery exchange credit: ₹{totals.scrapAdjustment.toLocaleString("en-IN")}
                </div>
              )}

              <div className="section-title">Additional charges</div>
              <div className="card" style={{ padding: 12 }}>
                {INVOICE_CHARGE_FIELDS.map(({ key, label }) => (
                  <ChargeRow
                    key={key}
                    chargeKey={key}
                    label={label}
                    row={draft.additionalCharges?.[key] ?? { enabled: false, amount: 0 }}
                    onChange={setCharge}
                  />
                ))}
              </div>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="form-group">
                  <label className="form-label">Payment mode</label>
                  <select className="form-input" value={draft.paymentMode} onChange={(e) => setDraft((d) => ({ ...d, paymentMode: e.target.value }))}>
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Bank Transfer</option>
                    <option>Cheque</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Paid amount (₹)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={draft.paidAmount || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, paidAmount: Number(e.target.value) || 0 }))}
                  />
                </div>
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
                    value={draft.gstRate}
                    onChange={(e) => setDraft((d) => ({ ...d, gstRate: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="section-title">Notes</div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Delivery notes</label>
                  <textarea className="form-input" rows={2} value={draft.notes?.delivery || ""} onChange={(e) => setNote("delivery", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Installation notes</label>
                  <textarea className="form-input" rows={2} value={draft.notes?.installation || ""} onChange={(e) => setNote("installation", e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Warranty notes</label>
                <textarea className="form-input" rows={2} value={draft.notes?.warranty || ""} onChange={(e) => setNote("warranty", e.target.value)} />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, marginTop: 8 }}>
                <input type="checkbox" checked={draft.sendWhatsapp !== false} onChange={(e) => setDraft((d) => ({ ...d, sendWhatsapp: e.target.checked }))} />
                Send invoice PDF on WhatsApp
              </label>

              <div
                className="card"
                style={{
                  marginTop: 20,
                  padding: 16,
                  background: "linear-gradient(135deg,#faf5ff,#f5f3ff)",
                  border: "1px solid #e9d5ff",
                }}
              >
                <div style={{ fontSize: 16, lineHeight: 1.9 }}>
                  <div>Product total: ₹{totals.productTotal.toLocaleString("en-IN")}</div>
                  <div>Additional charges: ₹{totals.additionalTotal.toLocaleString("en-IN")}</div>
                  {Number(draft.discount || 0) > 0 && (
                    <div>Discount: - ₹{Number(draft.discount || 0).toLocaleString("en-IN")}</div>
                  )}
                  <div>Subtotal: ₹{totals.subtotal.toLocaleString("en-IN")}</div>
                  <div>
                    GST ({totals.gstRate}%): ₹{totals.gstAmount.toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#6B21D8", marginTop: 8 }}>
                    Grand total: ₹{totals.finalTotal.toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: 15, color: "#6b7280" }}>
                    Pending: ₹{Math.max(0, totals.finalTotal - Number(draft.paidAmount || 0)).toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-secondary" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </button>
          {result ? (
            <>
              {(result.invoice?.invoicePdfUrl || result.invoice?.pdfUrl) && (
                <a
                  className="btn btn-outline"
                  href={invoicePdfHref(result.invoice.invoicePdfUrl || result.invoice.pdfUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="ti ti-file-download"></i> Download PDF (A4)
                </a>
              )}
              <button
                className="btn btn-primary"
                onClick={() => printInvoiceElement("invoice-conversion-print-area")}
              >
                <i className="ti ti-printer"></i> Print Invoice
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={generateInvoice} disabled={loading} style={{ background: "#059669" }}>
              {loading ? "Generating…" : (
                <>
                  <i className="ti ti-receipt"></i> Generate Final Invoice
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { buildInvoiceDraftFromQuotation, calculateInvoiceTotals };
