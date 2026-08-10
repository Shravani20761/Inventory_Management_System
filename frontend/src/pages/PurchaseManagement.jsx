import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";

const PRODUCT_TYPES = ["Battery", "Inverter", "Trolley", "Bike", "Car", "Combo", "Lithium Ion Battery", "Home Inverter Battery"];
const PAYMENT_MODES = ["Full Cash", "Partial Payment", "Credit / Loan", "Cheque Payment", "Multiple Cheques"];
const CHEQUE_STATUSES = ["Pending", "Deposited", "Cleared", "Bounced", "Cancelled"];
const BRANCHES = ["Wakad", "Pimple Saudagar"];

const emptyCheque = () => ({
  chequeNumber: "",
  bankName: "",
  amount: "",
  chequeDate: "",
  depositDate: "",
  dueDate: "",
  status: "Pending",
});

const emptyLine = () => ({
  inventoryId: "",
  productType: "Battery",
  model: "",
  brand: "",
  qty: 1,
  purchaseRate: "",
});

function statusBadge(status) {
  const map = {
    Pending: "badge-yellow",
    Partial: "badge-yellow",
    Paid: "badge-green",
    Overdue: "badge-red",
    "Cheque Due Soon": "badge-yellow",
  };
  return map[status] || "badge-gray";
}

function matchProductType(row, productType) {
  const t = String(row.type ?? row.category ?? "").toLowerCase();
  const p = String(productType).toLowerCase();
  if (p === "battery") return t.includes("battery") && !t.includes("inverter") && !t.includes("lithium");
  if (p === "combo") return t.includes("inverter") && t.includes("battery");
  return t.includes(p) || t === p;
}

export function PurchaseManagement({ inventory = [], apiOnline, onInventoryRefresh, user }) {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [filters, setFilters] = useState({
    vendor: "",
    branchName: "",
    productType: "",
    paymentStatus: "",
    dateFrom: "",
    dateTo: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [payModal, setPayModal] = useState(null);

  const load = useCallback(async () => {
    if (!apiOnline) return;
    setLoading(true);
    try {
      const [list, dash] = await Promise.all([
        api.purchaseManagement.list(filters),
        api.purchaseManagement.dashboard(),
      ]);
      setOrders(Array.isArray(list) ? list : []);
      setStats(dash);
      setMsg("");
    } catch (e) {
      setMsg(e.message || "Failed to load purchases");
    } finally {
      setLoading(false);
    }
  }, [apiOnline, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = useMemo(() => orders, [orders]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Purchase Management</div>
          <div className="page-sub">Vendor credit · cheques · stock GRN · WhatsApp reminders</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} disabled={!apiOnline}>
          <i className="ti ti-plus"></i> New Purchase Entry
        </button>
      </div>

      {msg && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: msg.includes("Failed") ? "#b91c1c" : "#065f46" }}>
          {msg}
        </div>
      )}

      <div className="grid-5" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <MiniStat label="Total Outstanding" value={`₹${(stats?.totalOutstanding ?? 0).toLocaleString("en-IN")}`} color="#d97706" />
        <MiniStat label="Upcoming Cheques (7d)" value={stats?.upcomingCheques ?? 0} color="#eab308" />
        <MiniStat label="Overdue" value={stats?.overdueCount ?? 0} color="#ef4444" />
        <MiniStat label="This Month Purchases" value={`₹${(stats?.monthPurchases ?? 0).toLocaleString("en-IN")}`} color="#0ea5e9" />
        <MiniStat label="Open Orders" value={stats?.openOrders ?? 0} color="#6366f1" />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input className="form-input" placeholder="Vendor" value={filters.vendor} onChange={(e) => setFilters((f) => ({ ...f, vendor: e.target.value }))} style={{ minWidth: 140 }} />
          <select className="form-select" value={filters.branchName} onChange={(e) => setFilters((f) => ({ ...f, branchName: e.target.value }))}>
            <option value="">All branches</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select className="form-select" value={filters.productType} onChange={(e) => setFilters((f) => ({ ...f, productType: e.target.value }))}>
            <option value="">All product types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="form-select" value={filters.paymentStatus} onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}>
            <option value="">All payment status</option>
            {["Pending", "Partial", "Paid", "Overdue", "Cheque Due Soon"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input type="date" className="form-input" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          <input type="date" className="form-input" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Purchase ID</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Branch</th>
                <th>Products</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Pending</th>
                <th>Next Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o.purchaseId || o.id}>
                  <td style={{ fontWeight: 600, color: "#0ea5e9" }}>{o.purchaseId}</td>
                  <td>{o.purchaseDate}</td>
                  <td>{o.vendorName}</td>
                  <td>{o.branchName || "—"}</td>
                  <td>{o.productCount ?? (o.products || []).length}</td>
                  <td>₹{Number(o.finalAmount ?? 0).toLocaleString("en-IN")}</td>
                  <td>₹{Number(o.paidAmount ?? 0).toLocaleString("en-IN")}</td>
                  <td style={{ color: o.outstandingAmount > 0 ? "#d97706" : "#6b7280" }}>
                    ₹{Number(o.outstandingAmount ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td>{o.nextDueDate || "—"}</td>
                  <td>
                    <span className={`badge ${statusBadge(o.paymentStatus)}`}>{o.paymentStatus}</span>
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" type="button" onClick={() => setDetail(o.purchaseId)}>
                      <i className="ti ti-eye"></i>
                    </button>
                    {o.outstandingAmount > 0 && (
                      <button className="btn btn-sm btn-outline" type="button" onClick={() => setPayModal(o.purchaseId)}>
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && <div className="empty-state">No purchase orders yet. Create your first wholesaler purchase.</div>}
        </div>
      </div>

      {showForm && (
        <PurchaseEntryModal
          inventory={inventory}
          user={user}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
            if (onInventoryRefresh) await onInventoryRefresh();
            setMsg("Purchase saved. Inventory stock increased for linked SKUs.");
          }}
        />
      )}
      {detail && (
        <PurchaseDetailModal
          purchaseId={detail}
          onClose={() => setDetail(null)}
          onRefresh={load}
        />
      )}
      {payModal && (
        <RecordPaymentModal
          purchaseId={payModal}
          onClose={() => setPayModal(null)}
          onSaved={() => {
            setPayModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="stat-card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color, fontSize: 22 }}>{value}</div>
    </div>
  );
}

function PurchaseEntryModal({ inventory, user, onClose, onSaved }) {
  const [form, setForm] = useState({
    purchaseDate: new Date().toISOString().slice(0, 10),
    vendorName: "",
    vendorMobile: "",
    vendorWhatsApp: "",
    vendorGst: "",
    branchName: user?.branchName?.includes("Pimple") ? "Pimple Saudagar" : "Wakad",
    billNo: "",
    billDetails: "",
    gstPercent: "",
    paymentMode: "Full Cash",
    paidAmount: "",
    products: [emptyLine()],
    cheques: [emptyCheque()],
    updateInventory: true,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i, k, v) =>
    setForm((f) => ({ ...f, products: f.products.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)) }));
  const setCheque = (i, k, v) =>
    setForm((f) => ({ ...f, cheques: f.cheques.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)) }));

  const subtotal = form.products.reduce((a, p) => a + Number(p.qty || 0) * Number(p.purchaseRate || 0), 0);
  const gstAmount = form.gstPercent ? (subtotal * Number(form.gstPercent)) / 100 : 0;
  const finalAmount = subtotal + gstAmount;
  const showCheques = form.paymentMode === "Cheque Payment" || form.paymentMode === "Multiple Cheques";

  const inventoryOptions = (productType, i) => {
    const line = form.products[i];
    return inventory.filter((row) => matchProductType(row, productType || line.productType));
  };

  const pickInventory = (i, invId) => {
    const row = inventory.find((r) => String(r._id) === String(invId));
    if (!row) return;
    setLine(i, "inventoryId", String(row._id));
    setLine(i, "model", row.model || row.batteryModel || "");
    setLine(i, "brand", row.brand || "");
    setLine(i, "productType", row.type || row.category || form.products[i].productType);
    if (row.purchaseRate || row.dp) setLine(i, "purchaseRate", row.purchaseRate || row.dp || row.dpPrice || "");
  };

  const handleSave = async () => {
    setErr("");
    if (!form.vendorName.trim()) {
      setErr("Vendor name is required.");
      return;
    }
    if (!form.products.some((p) => p.model || p.inventoryId)) {
      setErr("Add at least one product line.");
      return;
    }
    setBusy(true);
    try {
      await api.purchaseManagement.create({
        ...form,
        subtotal,
        gstAmount,
        finalAmount,
        cheques: showCheques ? form.cheques : [],
        paidAmount:
          form.paymentMode === "Full Cash"
            ? finalAmount
            : form.paymentMode === "Partial Payment"
              ? Number(form.paidAmount) || 0
              : undefined,
      });
      await onSaved();
    } catch (e) {
      setErr(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 860, maxHeight: "92vh", overflow: "auto" }}>
        <div className="modal-header">
          <div className="modal-title">Purchase Entry — Wholesaler / Vendor</div>
          <button className="close-btn" type="button" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          {err && <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Purchase Date</label>
              <input type="date" className="form-input" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Branch</label>
              <select className="form-select" value={form.branchName} onChange={(e) => set("branchName", e.target.value)}>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bill No.</label>
              <input className="form-input" value={form.billNo} onChange={(e) => set("billNo", e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Vendor / Wholesaler Name *</label>
              <input className="form-input" value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">GST Number</label>
              <input className="form-input" value={form.vendorGst} onChange={(e) => set("vendorGst", e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Vendor Mobile</label>
              <input className="form-input" value={form.vendorMobile} onChange={(e) => set("vendorMobile", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Vendor WhatsApp</label>
              <input className="form-input" value={form.vendorWhatsApp} onChange={(e) => set("vendorWhatsApp", e.target.value)} placeholder="For payment reminders" />
            </div>
          </div>

          <div className="section-title">Products</div>
          {form.products.map((line, i) => (
            <div key={i} className="item-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              <select className="form-select" style={{ width: 130 }} value={line.productType} onChange={(e) => setLine(i, "productType", e.target.value)}>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select className="form-select" style={{ flex: 2, minWidth: 180 }} value={line.inventoryId} onChange={(e) => pickInventory(i, e.target.value)}>
                <option value="">Link existing SKU (optional)</option>
                {inventoryOptions(line.productType, i).slice(0, 200).map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.brand} · {row.model || row.batteryModel} · Qty {row.quantity}
                  </option>
                ))}
              </select>
              <input className="form-input" style={{ width: 70 }} type="number" placeholder="Qty" value={line.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
              <input className="form-input" style={{ width: 90 }} type="number" placeholder="Rate" value={line.purchaseRate} onChange={(e) => setLine(i, "purchaseRate", e.target.value)} />
              {form.products.length > 1 && (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => set("products", form.products.filter((_, idx) => idx !== i))}>
                  <i className="ti ti-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline" onClick={() => set("products", [...form.products, emptyLine()])}>
            <i className="ti ti-plus"></i> Add product line
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", fontSize: 16 }}>
            <input type="checkbox" checked={form.updateInventory} onChange={(e) => set("updateInventory", e.target.checked)} />
            Auto-increase inventory stock for linked SKUs (append qty only — never deletes existing stock)
          </label>

          <div className="grid-3" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">GST %</label>
              <input type="number" className="form-input" value={form.gstPercent} onChange={(e) => set("gstPercent", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Subtotal</label>
              <input className="form-input" readOnly value={`₹${subtotal.toLocaleString("en-IN")}`} />
            </div>
            <div className="form-group">
              <label className="form-label">Final Amount</label>
              <input className="form-input" readOnly value={`₹${finalAmount.toLocaleString("en-IN")}`} style={{ fontWeight: 700 }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Payment Mode</label>
            <select className="form-select" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {form.paymentMode === "Partial Payment" && (
            <div className="form-group">
              <label className="form-label">Paid Amount (now)</label>
              <input type="number" className="form-input" value={form.paidAmount} onChange={(e) => set("paidAmount", e.target.value)} />
            </div>
          )}

          {showCheques && (
            <>
              <div className="section-title">Cheque Details</div>
              {form.cheques.map((ch, i) => (
                <div key={i} className="card" style={{ padding: 12, marginBottom: 8, background: "#fffbeb" }}>
                  <div className="grid-3">
                    <input className="form-input" placeholder="Cheque No." value={ch.chequeNumber} onChange={(e) => setCheque(i, "chequeNumber", e.target.value)} />
                    <input className="form-input" placeholder="Bank" value={ch.bankName} onChange={(e) => setCheque(i, "bankName", e.target.value)} />
                    <input type="number" className="form-input" placeholder="Amount ₹" value={ch.amount} onChange={(e) => setCheque(i, "amount", e.target.value)} />
                  </div>
                  <div className="grid-3" style={{ marginTop: 8 }}>
                    <input type="date" className="form-input" value={ch.chequeDate} onChange={(e) => setCheque(i, "chequeDate", e.target.value)} />
                    <input type="date" className="form-input" value={ch.depositDate} onChange={(e) => setCheque(i, "depositDate", e.target.value)} />
                    <input type="date" className="form-input" value={ch.dueDate} onChange={(e) => setCheque(i, "dueDate", e.target.value)} />
                  </div>
                  {form.paymentMode === "Multiple Cheques" && form.cheques.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" style={{ marginTop: 8 }} onClick={() => set("cheques", form.cheques.filter((_, idx) => idx !== i))}>
                      Remove cheque
                    </button>
                  )}
                </div>
              ))}
              {form.paymentMode === "Multiple Cheques" && (
                <button type="button" className="btn btn-sm btn-outline" onClick={() => set("cheques", [...form.cheques, emptyCheque()])}>
                  Add cheque row
                </button>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save Purchase & Update Stock"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchaseDetailModal({ purchaseId, onClose, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.purchaseManagement.get(purchaseId).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [purchaseId]);

  const updateCheque = async (chequeId, status) => {
    await api.purchaseManagement.updateCheque(purchaseId, chequeId, status);
    const d = await api.purchaseManagement.get(purchaseId);
    setData(d);
    onRefresh();
  };

  if (loading) return <div className="modal-overlay"><div className="modal"><div className="modal-body">Loading…</div></div></div>;
  if (!data) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 780, maxHeight: "90vh", overflow: "auto" }}>
        <div className="modal-header">
          <div className="modal-title">{data.purchaseId} — {data.vendorName}</div>
          <button className="close-btn" type="button" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div><strong>Branch:</strong> {data.branchName}</div>
            <div><strong>Date:</strong> {data.purchaseDate}</div>
            <div><strong>GST:</strong> {data.vendorGst || "—"}</div>
            <div><strong>WhatsApp:</strong> {data.vendorWhatsApp || data.vendorMobile || "—"}</div>
          </div>
          <div className="grid-3" style={{ margin: "12px 0" }}>
            <div className="stat-card"><div className="stat-label">Final</div><div className="stat-value">₹{Number(data.finalAmount).toLocaleString("en-IN")}</div></div>
            <div className="stat-card"><div className="stat-label">Paid</div><div className="stat-value" style={{ color: "#10b981" }}>₹{Number(data.paidAmount).toLocaleString("en-IN")}</div></div>
            <div className="stat-card"><div className="stat-label">Outstanding</div><div className="stat-value" style={{ color: "#d97706" }}>₹{Number(data.outstandingAmount).toLocaleString("en-IN")}</div></div>
          </div>

          <div className="section-title">Products / inventory affected</div>
          <table className="table-wrap"><thead><tr><th>Model</th><th>Type</th><th>Qty</th><th>Rate</th><th>Stock updated</th></tr></thead>
            <tbody>
              {(data.products || []).map((p, i) => (
                <tr key={i}>
                  <td>{p.model || p.batteryModel}</td>
                  <td>{p.productType}</td>
                  <td>{p.qty}</td>
                  <td>₹{Number(p.purchaseRate).toLocaleString("en-IN")}</td>
                  <td>{p.stockApplied ? <span className="badge badge-green">Yes</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(data.cheques || []).length > 0 && (
            <>
              <div className="section-title">Cheque history</div>
              <table><thead><tr><th>No.</th><th>Bank</th><th>Amount</th><th>Due</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {data.cheques.map((c) => (
                    <tr key={c._id}>
                      <td>{c.chequeNumber}</td>
                      <td>{c.bankName}</td>
                      <td>₹{Number(c.amount).toLocaleString("en-IN")}</td>
                      <td>{c.dueDate}</td>
                      <td><span className={`badge ${statusBadge(c.status === "Cleared" ? "Paid" : c.status === "Bounced" ? "Overdue" : "Pending")}`}>{c.status}</span></td>
                      <td>
                        <select className="form-select" style={{ width: 120 }} value={c.status} onChange={(e) => updateCheque(c._id, e.target.value)}>
                          {CHEQUE_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {(data.payments || []).length > 0 && (
            <>
              <div className="section-title">Payment history</div>
              <ul style={{ fontSize: 16 }}>
                {data.payments.map((p) => (
                  <li key={p._id}>{p.paymentDate} · {p.paymentMode} · ₹{Number(p.amount).toLocaleString("en-IN")} · {p.status}</li>
                ))}
              </ul>
            </>
          )}

          {(data.reminderLogs || []).length > 0 && (
            <>
              <div className="section-title">Reminder logs</div>
              <ul style={{ fontSize: 15, color: "#64748b" }}>
                {data.reminderLogs.slice(0, 10).map((r) => (
                  <li key={r._id}>{new Date(r.sentAt).toLocaleString()} · {r.daysBeforeDue}d before · {r.success ? "Sent" : "Failed"}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordPaymentModal({ purchaseId, onClose, onSaved }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Partial Payment");
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    setBusy(true);
    try {
      await api.purchaseManagement.addPayment(purchaseId, {
        amount: Number(amount),
        paymentMode: mode,
        paymentDate: new Date().toISOString().slice(0, 10),
      });
      onSaved();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-header"><div className="modal-title">Record payment</div><button className="close-btn" type="button" onClick={onClose}><i className="ti ti-x"></i></button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Amount ₹</label><input type="number" className="form-input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Mode</label>
            <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={busy}>Save payment</button>
        </div>
      </div>
    </div>
  );
}

export default PurchaseManagement;
