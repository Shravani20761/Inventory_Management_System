import { publicAssetHref, resolveProductImagePath } from "../utils/productImages.js";

function inventoryImageKind(product) {
  const c = String(product.category ?? "").trim().toLowerCase();
  if (c === "inverter" || c === "ups") return "inverter";
  return "battery";
}

export default function ProductCard({ product, onEdit, onDelete }) {
  const profit = Number(product.sellingRate ?? 0) - Number(product.purchaseRate ?? 0);
  const explicit = String(product.imageUrl ?? "").trim();
  const kind = inventoryImageKind(product);
  const mapped = resolveProductImagePath({
    brand: product.brand,
    model: product.modelName ?? product.model,
    product: kind,
    explicitUrl: explicit,
  });
  const pick = explicit || mapped.path;
  const imgSrc =
    !pick
      ? ""
      : pick.startsWith("http://") || pick.startsWith("https://") || pick.startsWith("data:")
        ? pick
        : publicAssetHref(pick);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {imgSrc ? <img src={imgSrc} alt="" className="mb-3 h-24 w-full rounded-lg object-contain bg-slate-50 p-1" /> : null}
      <h3 className="font-semibold text-slate-900">{product.modelName}</h3>
      <p className="text-base text-slate-500">{product.brand} · {product.category}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-base">
        <div><span className="text-slate-500">Stock</span><p className="font-bold">{product.quantity}</p></div>
        <div><span className="text-slate-500">Sell</span><p className="font-bold text-sky-700">₹{Number(product.sellingRate).toLocaleString()}</p></div>
        <div><span className="text-slate-500">Ah/VA</span><p>{product.capacityAh || product.inverterVA || "—"}</p></div>
        <div><span className="text-slate-500">Profit</span><p className={profit >= 0 ? "text-emerald-600" : "text-red-600"}>₹{profit}</p></div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onEdit?.(product)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-base">Edit</button>
        <button type="button" onClick={() => onDelete?.(product)} className="rounded-lg bg-red-50 px-3 py-1.5 text-base text-red-700">Delete</button>
      </div>
    </article>
  );
}
