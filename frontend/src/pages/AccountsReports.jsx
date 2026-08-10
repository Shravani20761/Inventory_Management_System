import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";

const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salaries", "Transportation", "Miscellaneous"];

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sales", label: "Sales Reports" },
  { id: "purchases", label: "Purchase Reports" },
  { id: "expenses", label: "Expense Reports" },
  { id: "inventory", label: "Inventory Reports" },
  { id: "gst", label: "GST Reports" },
  { id: "pnl", label: "Profit & Loss" },
  { id: "ca", label: "CA Profile" },
  { id: "reports", label: "Generate & Send" },
];

function inr(v) {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function DataTable({ columns, rows, empty = "No records for this period" }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={c.num ? { textAlign: "right" } : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {(!rows || rows.length === 0) ? (
            <tr><td colSpan={columns.length} style={{ textAlign: "center", color: "#9ca3af" }}>{empty}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} style={c.num ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : undefined}>
                    {c.render ? c.render(r) : (c.num ? inr(r[c.key]) : (r[c.key] ?? "—"))}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeading({ children }) {
  return <h3 className="section-title" style={{ marginTop: 24, marginBottom: 12, borderLeft: "4px solid #10b981", paddingLeft: 10 }}>{children}</h3>;
}

export default function AccountsReports({ user }) {
  const role = user?.role || "";
  const canEdit = ["superAdmin", "admin", "accountant"].includes(role);
  const readOnly = !canEdit;

  const [tab, setTab] = useState("dashboard");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [useMonth, setUseMonth] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const periodParams = useMemo(
    () => (useMonth ? { month } : { from, to }),
    [useMonth, month, from, to],
  );

  const periodLabel = useMonth ? month : `${from || "…"} → ${to || "…"}`;

  /* per-tab data */
  const [dashboard, setDashboard] = useState(null);
  const [sales, setSales] = useState(null);
  const [purchases, setPurchases] = useState(null);
  const [expenseRep, setExpenseRep] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [gst, setGst] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [caProfile, setCaProfile] = useState({ caName: "", firmName: "", email: "", mobile: "" });
  const [delivery, setDelivery] = useState(null);

  /* expense form */
  const [expenseForm, setExpenseForm] = useState({ category: "Rent", title: "", amount: "", date: new Date().toISOString().slice(0, 10), paymentMode: "Cash", vendor: "", gstAmount: "", notes: "" });

  const loadTab = useCallback(async (which) => {
    setError("");
    try {
      if (which === "dashboard") setDashboard(await api.accounts.dashboard(periodParams));
      else if (which === "sales") setSales(await api.accounts.salesReport(periodParams));
      else if (which === "purchases") setPurchases(await api.accounts.purchaseReport(periodParams));
      else if (which === "expenses") setExpenseRep(await api.accounts.expenseReport(periodParams));
      else if (which === "inventory") setInventory(await api.accounts.inventoryReport(periodParams));
      else if (which === "gst") setGst(await api.accounts.gstReport(periodParams));
      else if (which === "pnl") setPnl(await api.accounts.profitLossReport(periodParams));
      else if (which === "ca") setCaProfile(await api.accounts.getCaProfile());
      else if (which === "reports") setDelivery(await api.accounts.deliveryStatus());
    } catch (e) {
      setError(e.message || "Failed to load data");
    }
  }, [periodParams]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const refreshExpenses = useCallback(() => loadTab("expenses"), [loadTab]);

  async function handleAddExpense(e) {
    e.preventDefault();
    setBusy("expense");
    setError("");
    try {
      await api.accounts.createExpense({
        ...expenseForm,
        amount: Number(expenseForm.amount),
        gstAmount: Number(expenseForm.gstAmount) || 0,
      });
      setExpenseForm((f) => ({ ...f, title: "", amount: "", vendor: "", gstAmount: "", notes: "" }));
      await refreshExpenses();
    } catch (err) {
      setError(err.message || "Could not save expense");
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await api.accounts.deleteExpense(id);
      await refreshExpenses();
    } catch (err) {
      setError(err.message || "Could not delete expense");
    }
  }

  async function handleSaveCa(e) {
    e.preventDefault();
    setBusy("ca");
    setError("");
    try {
      const saved = await api.accounts.saveCaProfile(caProfile);
      setCaProfile(saved);
    } catch (err) {
      setError(err.message || "Could not save CA profile");
    } finally {
      setBusy("");
    }
  }

  async function generate(type) {
    setBusy(`gen-${type}`);
    setError("");
    try {
      const res = type === "package"
        ? await api.accounts.generatePackage(periodParams)
        : await api.accounts.generateReport(type, periodParams);
      const url = res.zipUrl || res.pdfUrl;
      if (url) window.open(url, "_blank");
    } catch (err) {
      setError(err.message || "Generation failed");
    } finally {
      setBusy("");
    }
  }

  async function sendEmail() {
    setBusy("email");
    setError("");
    try {
      const res = await api.accounts.emailToCa({ ...periodParams, reports: ["sales", "purchase", "gst", "profit-loss"] });
      window.alert(res.sent ? `Reports emailed to ${res.to}.` : `Email not sent: ${res.error || res.message || "unknown error"}`);
    } catch (err) {
      setError(err.message || "Email failed");
    } finally {
      setBusy("");
    }
  }

  async function sendWhatsapp() {
    setBusy("whatsapp");
    setError("");
    try {
      const res = await api.accounts.whatsappToCa({ ...periodParams, report: "profit-loss" });
      window.alert(res.sent ? "Report sent on WhatsApp." : `WhatsApp not sent: ${res.error || "unknown error"}`);
    } catch (err) {
      setError(err.message || "WhatsApp failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Accounts &amp; CA Reports</div>
          <div className="page-sub">
            Accounting &amp; taxation for your multi-branch battery, inverter &amp; trolley dealership
            {readOnly && <span className="badge badge-blue" style={{ marginLeft: 8 }}>Read-only (CA)</span>}
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ margin: 0 }}>Period</label>
          <select className="form-select" style={{ width: 160 }} value={useMonth ? "month" : "range"} onChange={(e) => setUseMonth(e.target.value === "month")}>
            <option value="month">Monthly</option>
            <option value="range">Custom range</option>
          </select>
          {useMonth ? (
            <input type="month" className="form-input" style={{ width: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : (
            <>
              <input type="date" className="form-input" style={{ width: 170 }} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span style={{ color: "#6b7280" }}>to</span>
              <input type="date" className="form-input" style={{ width: 170 }} value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => loadTab(tab)}>Apply</button>
          <span style={{ marginLeft: "auto", fontSize: 15, color: "#6b7280" }}>Showing: <b>{periodLabel}</b></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {error && <div className="profit-alert loss" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ---------- Dashboard ---------- */}
      {tab === "dashboard" && (
        <div>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <StatCard label="Total Sales" value={inr(dashboard?.totalSales)} accent="#0ea5e9" />
            <StatCard label="Total Purchases" value={inr(dashboard?.totalPurchases)} accent="#7c3aed" />
            <StatCard label="Total Expenses" value={inr(dashboard?.totalExpenses)} accent="#f59e0b" />
            <StatCard label="GST Collected" value={inr(dashboard?.gstCollected)} accent="#059669" />
            <StatCard label="GST Paid" value={inr(dashboard?.gstPaid)} accent="#dc2626" />
            <StatCard label="Net Profit" value={inr(dashboard?.netProfit)} accent={(dashboard?.netProfit ?? 0) >= 0 ? "#059669" : "#dc2626"} />
          </div>
          {dashboard && (
            <div className="card">
              <SectionHeading>Activity ({dashboard.period?.label})</SectionHeading>
              <div className="grid-4">
                <StatCard label="Sales Entries" value={dashboard.counts?.sales ?? 0} />
                <StatCard label="Tax Invoices" value={dashboard.counts?.invoices ?? 0} />
                <StatCard label="Purchase Orders" value={dashboard.counts?.purchaseOrders ?? 0} />
                <StatCard label="Expenses Logged" value={dashboard.counts?.expenses ?? 0} />
              </div>
              <div className="profit-alert gain" style={{ marginTop: 14 }}>
                Net GST payable for period: <b>{inr(dashboard.gstNetPayable)}</b> (Output {inr(dashboard.gstCollected)} − Input {inr(dashboard.gstPaid)})
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- Sales ---------- */}
      {tab === "sales" && sales && (
        <div>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <StatCard label="Total Sales" value={inr(sales.totals?.amount)} accent="#0ea5e9" />
            <StatCard label="GST Collected" value={inr(sales.totals?.gst)} accent="#059669" />
            <StatCard label="Transactions" value={sales.count ?? 0} />
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionHeading>Monthly Sales</SectionHeading>
            <DataTable columns={[{ key: "key", label: "Month" }, { key: "count", label: "Txns" }, { key: "gst", label: "GST", num: true }, { key: "amount", label: "Amount", num: true }]} rows={sales.monthly} />
          </div>
          <div className="grid-2">
            <div className="card">
              <SectionHeading>Branch-wise Sales</SectionHeading>
              <DataTable columns={[{ key: "branchName", label: "Branch" }, { key: "count", label: "Txns" }, { key: "amount", label: "Amount", num: true }]} rows={sales.branchWise} />
            </div>
            <div className="card">
              <SectionHeading>GST-wise Sales</SectionHeading>
              <DataTable columns={[{ key: "key", label: "GST Slab" }, { key: "count", label: "Txns" }, { key: "gst", label: "GST", num: true }, { key: "amount", label: "Amount", num: true }]} rows={sales.gstWise} />
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <SectionHeading>Daily Sales</SectionHeading>
            <DataTable columns={[{ key: "key", label: "Date" }, { key: "count", label: "Txns" }, { key: "amount", label: "Amount", num: true }]} rows={sales.daily} />
          </div>
        </div>
      )}

      {/* ---------- Purchases ---------- */}
      {tab === "purchases" && purchases && (
        <div>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <StatCard label="Total Purchases" value={inr(purchases.totals?.total)} accent="#7c3aed" />
            <StatCard label="Input GST" value={inr(purchases.totals?.gst)} accent="#059669" />
            <StatCard label="Outstanding" value={inr(purchases.outstanding?.totalOutstanding)} accent="#dc2626" />
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionHeading>Vendor-wise Purchases</SectionHeading>
            <DataTable columns={[{ key: "vendor", label: "Vendor" }, { key: "orders", label: "Orders" }, { key: "paid", label: "Paid", num: true }, { key: "outstanding", label: "Outstanding", num: true }, { key: "total", label: "Total", num: true }]} rows={purchases.vendorWise} />
          </div>
          <div className="grid-2">
            <div className="card">
              <SectionHeading>Outstanding Payments</SectionHeading>
              <DataTable
                columns={[
                  { key: "vendorName", label: "Vendor", render: (r) => r.vendorName || r.vendor || "—" },
                  { key: "purchaseId", label: "Purchase" },
                  { key: "nextDueDate", label: "Due" },
                  { key: "outstandingAmount", label: "Outstanding", num: true, render: (r) => inr(r.outstandingAmount ?? r.outstanding) },
                ]}
                rows={purchases.outstanding?.rows}
              />
            </div>
            <div className="card">
              <SectionHeading>Cheque Due Report</SectionHeading>
              <DataTable
                columns={[
                  { key: "dueDate", label: "Due Date" },
                  { key: "vendor", label: "Vendor" },
                  { key: "chequeNumber", label: "Cheque #" },
                  { key: "status", label: "Status", render: (r) => <span className="badge badge-yellow">{r.status}</span> },
                  { key: "amount", label: "Amount", num: true },
                ]}
                rows={purchases.chequeDue}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------- Expenses ---------- */}
      {tab === "expenses" && (
        <div>
          {expenseRep && (
            <div className="grid-3" style={{ marginBottom: 16 }}>
              {expenseRep.byCategory?.map((c) => (
                <StatCard key={c.category} label={`${c.category} (${c.count})`} value={inr(c.amount)} />
              ))}
              <StatCard label="Total Expenses" value={inr(expenseRep.total)} accent="#f59e0b" />
            </div>
          )}
          {canEdit && (
            <div className="card" style={{ marginBottom: 16 }}>
              <SectionHeading>Add Expense</SectionHeading>
              <form onSubmit={handleAddExpense}>
                <div className="grid-4">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                      {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Title / Note</label>
                    <input className="form-input" value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} placeholder="e.g. Shop rent April" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input className="form-input" type="number" min="0" step="0.01" required value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input className="form-input" type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Payment Mode</label>
                    <input className="form-input" value={expenseForm.paymentMode} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vendor / Payee</label>
                    <input className="form-input" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">GST (input, optional)</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={expenseForm.gstAmount} onChange={(e) => setExpenseForm({ ...expenseForm, gstAmount: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ display: "flex", alignItems: "flex-end" }}>
                    <button className="btn btn-primary" type="submit" disabled={busy === "expense"}>{busy === "expense" ? "Saving…" : "Add Expense"}</button>
                  </div>
                </div>
              </form>
            </div>
          )}
          <div className="card">
            <SectionHeading>Expense Ledger</SectionHeading>
            <DataTable
              columns={[
                { key: "date", label: "Date" },
                { key: "category", label: "Category", render: (r) => <span className="badge badge-gray">{r.category}</span> },
                { key: "title", label: "Title" },
                { key: "vendor", label: "Payee" },
                { key: "amount", label: "Amount", num: true },
                ...(canEdit ? [{ key: "_act", label: "", render: (r) => <button className="btn btn-danger btn-sm" onClick={() => handleDeleteExpense(r.id)}>Delete</button> }] : []),
              ]}
              rows={expenseRep?.rows}
              empty="No expenses logged for this period"
            />
          </div>
        </div>
      )}

      {/* ---------- Inventory ---------- */}
      {tab === "inventory" && inventory && (
        <div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <StatCard label="Opening Stock (units)" value={inventory.summary?.openingUnits ?? 0} />
            <StatCard label="Purchased (units)" value={inventory.summary?.purchasedUnits ?? 0} accent="#7c3aed" />
            <StatCard label="Sold (units)" value={inventory.summary?.soldUnits ?? 0} accent="#0ea5e9" />
            <StatCard label="Closing Stock (units)" value={inventory.summary?.closingUnits ?? 0} accent="#059669" />
          </div>
          <div className="card">
            <SectionHeading>Current Stock Valuation — Closing value {inr(inventory.summary?.closingValue)}</SectionHeading>
            <DataTable
              columns={[
                { key: "model", label: "Model" },
                { key: "brand", label: "Brand" },
                { key: "type", label: "Type" },
                { key: "quantity", label: "Qty" },
                { key: "purchaseRate", label: "Rate", num: true },
                { key: "stockValue", label: "Stock Value", num: true },
              ]}
              rows={inventory.products}
            />
          </div>
        </div>
      )}

      {/* ---------- GST ---------- */}
      {tab === "gst" && gst && (
        <div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <StatCard label="Taxable Amount" value={inr(gst.summary?.taxableAmount)} />
            <StatCard label="CGST" value={inr(gst.summary?.cgst)} accent="#0ea5e9" />
            <StatCard label="SGST" value={inr(gst.summary?.sgst)} accent="#0ea5e9" />
            <StatCard label="IGST" value={inr(gst.summary?.igst)} accent="#7c3aed" />
          </div>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <StatCard label="Output GST (Sales)" value={inr(gst.summary?.outputGst)} accent="#059669" />
            <StatCard label="Input GST (Purchases)" value={inr(gst.summary?.inputGst)} accent="#7c3aed" />
            <StatCard label="Net GST Payable" value={inr(gst.summary?.netPayable)} accent={(gst.summary?.netPayable ?? 0) >= 0 ? "#dc2626" : "#059669"} />
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionHeading>Output GST (on Sales / Tax Invoices)</SectionHeading>
            <DataTable columns={[{ key: "rate", label: "Slab" }, { key: "count", label: "Invoices" }, { key: "taxable", label: "Taxable", num: true }, { key: "cgst", label: "CGST", num: true }, { key: "sgst", label: "SGST", num: true }, { key: "igst", label: "IGST", num: true }, { key: "gst", label: "Total GST", num: true }]} rows={gst.output} />
          </div>
          <div className="card">
            <SectionHeading>Input GST (on Purchases)</SectionHeading>
            <DataTable columns={[{ key: "rate", label: "Slab" }, { key: "count", label: "Orders" }, { key: "taxable", label: "Taxable", num: true }, { key: "cgst", label: "CGST", num: true }, { key: "sgst", label: "SGST", num: true }, { key: "igst", label: "IGST", num: true }, { key: "gst", label: "Total GST", num: true }]} rows={gst.input} />
          </div>
        </div>
      )}

      {/* ---------- P&L ---------- */}
      {tab === "pnl" && pnl && (
        <div>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <StatCard label="Total Revenue" value={inr(pnl.totalRevenue)} accent="#0ea5e9" />
            <StatCard label="Total Expenses" value={inr(pnl.totalExpenses)} accent="#f59e0b" />
            <StatCard label={`Net ${(pnl.netProfit ?? 0) >= 0 ? "Profit" : "Loss"} (${pnl.margin}%)`} value={inr(pnl.netProfit)} accent={(pnl.netProfit ?? 0) >= 0 ? "#059669" : "#dc2626"} />
          </div>
          <div className="grid-2">
            <div className="card">
              <SectionHeading>Revenue</SectionHeading>
              <DataTable columns={[{ key: "label", label: "Source" }, { key: "amount", label: "Amount", num: true }]} rows={pnl.revenue} />
            </div>
            <div className="card">
              <SectionHeading>Expenses</SectionHeading>
              <DataTable columns={[{ key: "label", label: "Head" }, { key: "amount", label: "Amount", num: true }]} rows={pnl.expenses} />
            </div>
          </div>
        </div>
      )}

      {/* ---------- CA Profile ---------- */}
      {tab === "ca" && (
        <div className="card" style={{ maxWidth: 640 }}>
          <SectionHeading>Chartered Accountant Profile</SectionHeading>
          <form onSubmit={handleSaveCa}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">CA Name</label>
                <input className="form-input" value={caProfile.caName || ""} disabled={!canEdit} onChange={(e) => setCaProfile({ ...caProfile, caName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Firm Name</label>
                <input className="form-input" value={caProfile.firmName || ""} disabled={!canEdit} onChange={(e) => setCaProfile({ ...caProfile, firmName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={caProfile.email || ""} disabled={!canEdit} onChange={(e) => setCaProfile({ ...caProfile, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile</label>
                <input className="form-input" value={caProfile.mobile || ""} disabled={!canEdit} onChange={(e) => setCaProfile({ ...caProfile, mobile: e.target.value })} />
              </div>
            </div>
            {canEdit && <button className="btn btn-primary" type="submit" disabled={busy === "ca"}>{busy === "ca" ? "Saving…" : "Save CA Profile"}</button>}
            {!canEdit && <div className="page-sub">Read-only view. Contact an admin to update.</div>}
          </form>
        </div>
      )}

      {/* ---------- Generate & Send ---------- */}
      {tab === "reports" && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionHeading>Generate Report PDFs — {periodLabel}</SectionHeading>
            <div className="filter-row">
              {[
                { t: "sales", l: "Sales Report PDF" },
                { t: "purchase", l: "Purchase Report PDF" },
                { t: "gst", l: "GST Report PDF" },
                { t: "inventory", l: "Inventory Report PDF" },
                { t: "profit-loss", l: "Profit & Loss PDF" },
              ].map((b) => (
                <button key={b.t} className="btn btn-secondary" disabled={busy === `gen-${b.t}`} onClick={() => generate(b.t)}>
                  {busy === `gen-${b.t}` ? "Generating…" : b.l}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <SectionHeading>Monthly Report Package (ZIP)</SectionHeading>
            <div className="page-sub" style={{ marginBottom: 12 }}>Bundles Sales + Purchase + GST + Profit &amp; Loss reports into a single ZIP file.</div>
            <button className="btn btn-primary" disabled={busy === "gen-package"} onClick={() => generate("package")}>
              {busy === "gen-package" ? "Building ZIP…" : "Download Monthly Package (ZIP)"}
            </button>
          </div>

          <div className="card">
            <SectionHeading>Send to CA</SectionHeading>
            <div className="filter-row" style={{ marginBottom: 12 }}>
              <span className="api-badge" style={{ background: delivery?.email?.configured ? "#d1fae5" : "#fef3c7", color: delivery?.email?.configured ? "#059669" : "#d97706" }}>
                Email: {delivery?.email?.configured ? "Configured" : "Not configured"}
              </span>
              <span className="api-badge" style={{ background: delivery?.whatsapp?.configured ? "#d1fae5" : "#fef3c7", color: delivery?.whatsapp?.configured ? "#059669" : "#d97706" }}>
                WhatsApp: {delivery?.whatsapp?.configured ? "Configured" : "Not configured"}
              </span>
            </div>
            <div className="page-sub" style={{ marginBottom: 12 }}>
              Emails Sales, Purchase, GST &amp; P&amp;L PDFs to the CA on file ({caProfile.email || "no email set"}).
              WhatsApp requires a public HTTPS URL (PUBLIC_BASE_URL).
            </div>
            <div className="filter-row">
              <button className="btn btn-primary" disabled={busy === "email"} onClick={sendEmail}>{busy === "email" ? "Sending…" : "Email Reports to CA"}</button>
              <button className="btn btn-secondary" disabled={busy === "whatsapp"} onClick={sendWhatsapp}>{busy === "whatsapp" ? "Sending…" : "WhatsApp P&L to CA"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
