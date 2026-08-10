import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { healthApi } from "../api/axiosClient.js";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/inventory", label: "Inventory" },
  { to: "/quotations", label: "Quotations" },
  { to: "/invoices", label: "Invoices" },
  { to: "/combo", label: "Combo Generator" },
  { to: "/reports", label: "Reports" },
];

export default function AppLayout() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    healthApi.check().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <h1 className="text-lg font-bold text-sky-800">⚡ BatteryPro</h1>
        <p className="mb-4 text-sm text-slate-500">Smart Quotation System</p>
        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-base ${isActive ? "bg-sky-100 font-semibold text-sky-800" : "text-slate-600 hover:bg-slate-100"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className={`mt-6 text-sm ${health?.ok ? "text-emerald-600" : "text-amber-600"}`}>
          {health?.ok ? `● API · ${health.database}` : "○ API offline — run npm run dev"}
        </p>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
