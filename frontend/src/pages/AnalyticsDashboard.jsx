import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useBranch } from "../context/BranchContext.jsx";

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_year", label: "This Year" },
];

function inr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-sm text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const { isHq, selectedBranchId, setSelectedBranchId, branches, businessName } = useBranch();
  const [preset, setPreset] = useState("this_month");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const isStaff = ["staff", "employee"].includes(String(user?.role || ""));

  useEffect(() => {
    if (isStaff) {
      setLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    api.analytics
      .get({ preset })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preset, selectedBranchId, user?.branchId, isStaff]);

  const totals = data?.totals || {};
  const byBranch = data?.byBranch || [];

  return (
    <div className="min-h-full p-6 md:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {isHq ? "Admin dashboard" : "Branch dashboard"}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {isHq && selectedBranchId === "all" ? "All Branches" : businessName}
          </h1>
          <p className="mt-1 text-slate-600">
            {isHq
              ? "Admin dashboard — switch All Branches or a single branch. Figures come from live invoices, purchases, and expenses."
              : `${user?.branchName || "Your branch"} · ${businessName} — scoped to your assigned branch`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHq && (
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
              value={selectedBranchId || "all"}
              onChange={(e) => setSelectedBranchId(e.target.value)}
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id || b._id} value={b.id || b._id}>
                  {b.name} ({b.businessName || "BatteryMela"})
                </option>
              ))}
            </select>
          )}
          {!isStaff && (
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {isStaff && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">
            Welcome, <strong>{user?.name}</strong>. You are signed into{" "}
            <strong>{businessName}</strong>
            {user?.branchName ? ` (${user.branchName})` : ""}.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Use Inventory, Quotations, and Invoices from the sidebar. Profit and all-branch analytics are not available for Staff.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link className="font-medium text-indigo-600 hover:underline" to="/shop/inventory">
              Inventory →
            </Link>
            <Link className="font-medium text-indigo-600 hover:underline" to="/shop/quotations">
              Quotations →
            </Link>
            <Link className="font-medium text-indigo-600 hover:underline" to="/shop/invoices">
              Invoices →
            </Link>
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && !isStaff && <div className="text-slate-500">Loading analytics…</div>}

      {!loading && data && !isStaff && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total Sales" value={inr(totals.sales)} />
            <Stat label="Total Purchases" value={inr(totals.purchases)} />
            <Stat label="Gross Profit" value={inr(totals.grossProfit)} />
            <Stat label="Net Profit" value={inr(totals.netProfit)} sub={`Expenses ${inr(totals.expenses)}`} />
            <Stat label="Quotations" value={totals.quotations ?? 0} />
            <Stat label="Invoices" value={totals.invoices ?? 0} />
            <Stat label="Inventory Value" value={inr(totals.inventoryValue)} />
            <Stat label="Low Stock" value={totals.lowStockCount ?? 0} />
          </div>

          {data.topPerformingBranch && (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Top performing branch: <strong>{data.topPerformingBranch.name}</strong> (
              {data.topPerformingBranch.businessName}) — sales {inr(data.topPerformingBranch.sales)}
            </div>
          )}

          {byBranch.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3 text-right">Sales</th>
                    <th className="px-4 py-3 text-right">Purchases</th>
                    <th className="px-4 py-3 text-right">Expenses</th>
                    <th className="px-4 py-3 text-right">Net Profit</th>
                    <th className="px-4 py-3 text-right">Inventory</th>
                  </tr>
                </thead>
                <tbody>
                  {byBranch.map((b) => (
                    <tr key={b.branchId} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{b.name}</td>
                      <td className="px-4 py-3 text-slate-600">{b.businessName}</td>
                      <td className="px-4 py-3 text-right">{inr(b.sales)}</td>
                      <td className="px-4 py-3 text-right">{inr(b.purchases)}</td>
                      <td className="px-4 py-3 text-right">{inr(b.expenses)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{inr(b.netProfit)}</td>
                      <td className="px-4 py-3 text-right">{inr(b.inventoryValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
