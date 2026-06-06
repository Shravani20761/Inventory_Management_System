import { useEffect, useState, useRef } from "react";
import { productsApi } from "../api/axiosClient.js";
import ProductCard from "../components/ProductCard.jsx";
import { parseBatteryExcelFile } from "../utils/excelParser.js";

const empty = {
  modelName: "", brand: "", category: "Battery", quantity: 1,
  purchaseRate: 0, sellingRate: 0, warranty: "", capacityAh: 0, inverterVA: 0, batteryType: "Tubular", imageUrl: "",
};

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);

  const load = () => productsApi.list().then(setProducts).catch(console.error);
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (editing) await productsApi.update(editing.id ?? editing._id, form);
    else await productsApi.create(form);
    setForm(empty);
    setEditing(null);
    load();
  };

  const onExcel = async (file) => {
    if (!file) return;
    const { batteries } = await parseBatteryExcelFile(file);
    await productsApi.bulk(batteries);
    load();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-slate-600">Products used by recommendation engine & quotations</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onExcel(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Upload Excel</button>
        </div>
      </div>

      <form onSubmit={save} className="mb-8 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Model name" value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        <select className="rounded border px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option>Battery</option><option>Inverter</option><option>UPS</option>
        </select>
        <input type="number" className="rounded border px-3 py-2 text-sm" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        <input type="number" className="rounded border px-3 py-2 text-sm" placeholder="Purchase rate" value={form.purchaseRate} onChange={(e) => setForm({ ...form, purchaseRate: Number(e.target.value) })} />
        <input type="number" className="rounded border px-3 py-2 text-sm" placeholder="Selling rate" value={form.sellingRate} onChange={(e) => setForm({ ...form, sellingRate: Number(e.target.value) })} />
        <input type="number" className="rounded border px-3 py-2 text-sm" placeholder="Ah or VA" value={form.capacityAh || form.inverterVA} onChange={(e) => setForm({ ...form, capacityAh: Number(e.target.value), inverterVA: Number(e.target.value) })} />
        <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">{editing ? "Update" : "Add"} Product</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard
            key={p.id ?? p._id}
            product={p}
            onEdit={(prod) => { setEditing(prod); setForm({ ...empty, ...prod }); }}
            onDelete={async (prod) => { await productsApi.remove(prod.id ?? prod._id); load(); }}
          />
        ))}
      </div>
    </div>
  );
}
