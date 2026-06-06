import { useEffect, useState } from "react";
import { invoicesApi, productsApi } from "../api/axiosClient.js";
import InvoicePreview from "../components/InvoicePreview.jsx";

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", productId: "", quantity: 1, sendWhatsapp: true });
  const [last, setLast] = useState(null);

  useEffect(() => {
    invoicesApi.list().then(setInvoices).catch(() => {});
    productsApi.list().then(setProducts).catch(() => {});
  }, []);

  const generate = async (e) => {
    e.preventDefault();
    const product = products.find((p) => String(p.id ?? p._id) === String(form.productId));
    const payload = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      sendWhatsapp: form.sendWhatsapp,
      products: [{
        productId: form.productId,
        modelName: product?.modelName,
        quantity: form.quantity,
        rate: product?.sellingRate,
        purchaseRate: product?.purchaseRate,
      }],
    };
    const data = await invoicesApi.generate(payload);
    setLast(data);
    invoicesApi.list().then(setInvoices);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Invoices</h1>
      <p className="text-slate-600">Separate from quotation — confirms sale, reduces stock, PDF + WhatsApp</p>

      <form onSubmit={generate} className="grid max-w-xl gap-3 rounded-xl border bg-white p-4 md:grid-cols-2">
        <input className="rounded border px-3 py-2" placeholder="Customer" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required />
        <input className="rounded border px-3 py-2" placeholder="Phone" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} required />
        <select className="rounded border px-3 py-2 md:col-span-2" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
          <option value="">Select product</option>
          {products.filter((p) => p.quantity > 0).map((p) => (
            <option key={p.id ?? p._id} value={p.id ?? p._id}>{p.modelName} (stock {p.quantity}) — ₹{p.sellingRate}</option>
          ))}
        </select>
        <input type="number" min="1" className="rounded border px-3 py-2" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-white">Generate Invoice</button>
      </form>

      {last?.invoice && <InvoicePreview invoice={last.invoice} />}

      <div className="space-y-3">
        {invoices.map((inv) => (
          <div key={inv.id ?? inv.invoiceNumber} className="rounded-lg border bg-white p-4 text-sm">
            <strong>{inv.invoiceNumber}</strong> — {inv.customerDetails?.name} — ₹{Number(inv.totalAmount ?? inv.total).toLocaleString()}
            {(inv.cloudinaryInvoiceUrl || inv.invoicePdfUrl) && (
              <a href={inv.cloudinaryInvoiceUrl || inv.invoicePdfUrl} className="ml-2 text-sky-600 underline" target="_blank" rel="noreferrer">PDF</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
