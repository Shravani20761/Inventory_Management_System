import { useState } from "react";
import { quotationsApi } from "../api/axiosClient.js";
import QuotationTemplate from "../templates/QuotationTemplate.jsx";

export default function Quotations() {
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", flatType: "1BHK", backupHours: 4,
    budgetType: "Recommended", preferredBrand: "", sendWhatsapp: true,
  });
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const previewOptions = async () => {
    setLoading(true);
    try {
      const data = await quotationsApi.previewOptions(form);
      setPreview(data);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    try {
      const data = await quotationsApi.generate(form);
      setResult(data);
      setPreview({ suggestedOptions: data.quotation?.suggestedOptions, ...data.recommendation });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Smart Quotations</h1>
        <p className="text-slate-600">Dynamic options from inventory + rule engine → PDF → WhatsApp</p>
      </div>

      <form className="grid max-w-3xl gap-3 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        <input className="rounded border px-3 py-2" placeholder="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required />
        <input className="rounded border px-3 py-2" placeholder="Phone (WhatsApp)" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} required />
        <select className="rounded border px-3 py-2" value={form.flatType} onChange={(e) => setForm({ ...form, flatType: e.target.value })}>
          {["1RK", "1BHK", "2BHK", "3BHK"].map((f) => <option key={f}>{f}</option>)}
        </select>
        <input type="number" className="rounded border px-3 py-2" placeholder="Backup hours" value={form.backupHours} onChange={(e) => setForm({ ...form, backupHours: Number(e.target.value) })} />
        <select className="rounded border px-3 py-2" value={form.budgetType} onChange={(e) => setForm({ ...form, budgetType: e.target.value })}>
          <option>Budget</option><option>Recommended</option><option>Premium</option>
        </select>
        <input className="rounded border px-3 py-2" placeholder="Preferred brand (optional)" value={form.preferredBrand} onChange={(e) => setForm({ ...form, preferredBrand: e.target.value })} />
        <label className="flex items-center gap-2 text-base"><input type="checkbox" checked={form.sendWhatsapp} onChange={(e) => setForm({ ...form, sendWhatsapp: e.target.checked })} /> Send WhatsApp after PDF</label>
        <div className="flex gap-2 md:col-span-2">
          <button type="button" onClick={previewOptions} disabled={loading} className="rounded-lg border border-slate-300 px-4 py-2">Preview Options</button>
          <button type="button" onClick={generate} disabled={loading} className="rounded-lg bg-sky-600 px-4 py-2 text-white">{loading ? "Working…" : "Generate PDF + WhatsApp"}</button>
        </div>
      </form>

      {preview?.suggestedOptions && (
        <QuotationTemplate
          quotation={{ ...form, totalLoad: preview.totalLoad }}
          options={preview.suggestedOptions}
          selectedOption={selected}
          onSelectOption={setSelected}
        />
      )}

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-base text-emerald-900">
          Quotation saved · PDF: <a className="underline" href={result.quotation?.quotationPublicUrl || result.quotation?.quotationPdfUrl} target="_blank" rel="noreferrer">Open</a>
          · WhatsApp: {result.whatsapp?.sent ? "Sent" : result.whatsapp?.error || result.whatsapp?.message || "Not sent"}
        </div>
      )}
    </div>
  );
}
