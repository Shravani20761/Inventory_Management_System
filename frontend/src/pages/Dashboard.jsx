import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productsApi, quotationsApi, invoicesApi } from "../api/axiosClient.js";

export default function Dashboard() {
  const [stats, setStats] = useState({ products: 0, quotations: 0, invoices: 0, stock: 0 });

  useEffect(() => {
    Promise.all([productsApi.list(), quotationsApi.list(), invoicesApi.list()])
      .then(([products, quotations, invoices]) => {
        setStats({
          products: products.length,
          quotations: quotations.length,
          invoices: invoices.length,
          stock: products.reduce((s, p) => s + Number(p.quantity ?? 0), 0),
        });
      })
      .catch(() => {});
  }, []);

  const cards = [
    { label: "Products", value: stats.products, to: "/inventory" },
    { label: "Stock Units", value: stats.stock, to: "/inventory" },
    { label: "Quotations", value: stats.quotations, to: "/quotations" },
    { label: "Invoices", value: stats.invoices, to: "/invoices" },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Dashboard</h1>
      <p className="mb-6 text-slate-600">Rule-based battery & inverter quotation engine</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="text-3xl font-bold text-sky-800">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-sky-200 bg-sky-50 p-6">
        <h2 className="font-semibold text-sky-900">Quick start</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-sky-900">
          <li>Add batteries & inverters in <Link to="/inventory" className="underline">Inventory</Link></li>
          <li>Generate smart quotes in <Link to="/quotations" className="underline">Quotations</Link></li>
          <li>Confirm sale & invoice in <Link to="/invoices" className="underline">Invoices</Link></li>
        </ol>
      </div>
    </div>
  );
}
