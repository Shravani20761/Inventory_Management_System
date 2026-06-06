export default function ProductCard({ product, onEdit, onDelete }) {
  const profit = Number(product.sellingRate ?? 0) - Number(product.purchaseRate ?? 0);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {product.imageUrl && <img src={product.imageUrl} alt="" className="mb-3 h-24 w-full rounded-lg object-cover" />}
      <h3 className="font-semibold text-slate-900">{product.modelName}</h3>
      <p className="text-sm text-slate-500">{product.brand} · {product.category}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-slate-500">Stock</span><p className="font-bold">{product.quantity}</p></div>
        <div><span className="text-slate-500">Sell</span><p className="font-bold text-sky-700">₹{Number(product.sellingRate).toLocaleString()}</p></div>
        <div><span className="text-slate-500">Ah/VA</span><p>{product.capacityAh || product.inverterVA || "—"}</p></div>
        <div><span className="text-slate-500">Profit</span><p className={profit >= 0 ? "text-emerald-600" : "text-red-600"}>₹{profit}</p></div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onEdit?.(product)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">Edit</button>
        <button type="button" onClick={() => onDelete?.(product)} className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">Delete</button>
      </div>
    </article>
  );
}
