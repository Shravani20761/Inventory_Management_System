import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { navForRole } from "./constants/nav.js";
import { api, isApiAvailable, loadFromApi } from "./api/client.js";
import { HOME_INVERTER_BATTERY_TYPE, INVERTER_BATTERY_TYPE, TROLLEY_TYPE, LITHIUM_ION_BATTERY_TYPE, INVENTORY_SECTIONS, INVENTORY_FORM_TYPES, inventorySectionTabLabel, isHomeInverterBatterySection, isInverterBatterySection, isInverterOnlySection, isLithiumIonBatterySection, isTrolleySection, shouldShowOnHomeInvBatteryTab, shouldShowOnInverterInventoryTab } from "./constants/inventoryTypes.js";
import { COMBO_INVENTORY_TABLE_COLUMNS } from "./constants/comboInventoryImport.js";
import { INVERTER_INVENTORY_TABLE_COLUMNS, INVERTER_INVENTORY_TABLE_GROUPS } from "./constants/inverterInventoryImport.js";
import { TROLLEY_INVENTORY_TABLE_COLUMNS, TROLLEY_INVENTORY_TABLE_GROUPS } from "./constants/trolleyInventoryImport.js";
import { LITHIUM_ION_BATTERY_TABLE_COLUMNS, LITHIUM_ION_BATTERY_TABLE_GROUPS } from "./constants/lithiumIonBatteryImport.js";
import { HOME_INVERTER_BATTERY_TABLE_COLUMNS, HOME_INVERTER_BATTERY_TABLE_GROUPS } from "./constants/homeInverterBatteryImport.js";
import { inventoryRowsMatch, nextNumericInventoryId, removeInventoryRow, resolveInventoryUpdateId } from "./utils/inventoryIds.js";
import { sortInventoryForDisplay, inventoryDisplaySerial } from "./utils/inventoryDisplayOrder.js";
import { PurchaseAndSales } from "./purchaseSales.jsx";
import {
  SmartQuotationModal,
  SmartQuotationViewModal,
  qtCustomer,
  qtPhone,
  qtDate,
} from "./smartQuotation.jsx";
import { pdfHref } from "./utils/pdfLinks.js";
import { InvoiceConversionModal } from "./components/InvoiceConversionModal.jsx";
import { QuotationEditModal } from "./components/QuotationEditModal.jsx";
import { PrintableInvoiceDocument, printInvoiceElement } from "./components/PrintableInvoice.jsx";
import { QUOTATION_KIND_LABELS, QUOTATION_KINDS } from "./constants/quotationKinds.js";
import { normalizeQuotationForInvoice } from "./utils/invoiceConversion.js";
import { StockTransfersPage } from "./components/StockTransfers.jsx";
import AccountsReports from "./pages/AccountsReports.jsx";
import { GlobalInventorySearch } from "./components/GlobalInventorySearch.jsx";
import { InventoryCategoryNav } from "./components/InventoryCategoryNav.jsx";
import {
  getInventoryCategory,
  inventoryBrandCounts,
  inventoryBrandMatches,
  inventoryRowMatchesBrandSubcategory,
  inventoryRowMatchesCategory,
  normalizeInventoryBrand,
  automotiveBrandDisplayLabel,
  canonicalAutomotiveBrand,
  isAutomotiveInventoryCategory,
} from "./constants/inventoryCategories.js";
import { css } from "./appStyles.js";

/** Fresh install: no seed rows. Data loads from `/sync/all` when API is online, or you add/import items. */
const INITIAL_INVENTORY = [];
const INITIAL_QUOTATIONS = [];
const INITIAL_PURCHASES = [];
const INITIAL_SALES = [];
const INITIAL_INVOICES = [];

const genId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}`;

/** Normalize invoice row for shop UI list/preview. */
function mapInvoiceRow(inv = {}) {
  const items = (inv.items ?? inv.products ?? []).map((i) => ({
    model: i.model ?? i.modelName ?? "—",
    modelName: i.modelName ?? i.model ?? "—",
    qty: i.qty ?? i.quantity ?? 1,
    quantity: i.quantity ?? i.qty ?? 1,
    rate: Number(i.rate ?? 0),
    amount: Number(i.amount ?? (i.rate ?? 0) * (i.qty ?? i.quantity ?? 1)),
  }));
  return {
    ...inv,
    id: inv.invoiceNumber || inv.id,
    customer: inv.customer ?? inv.customerDetails?.name ?? "",
    phone: inv.phone ?? inv.customerDetails?.phone ?? "",
    address: inv.address ?? inv.customerDetails?.address ?? "",
    date: inv.date ?? (inv.createdAt ? String(inv.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10)),
    items,
    subtotal: Number(inv.subtotal ?? inv.productTotal ?? 0),
    gst: Number(inv.gst ?? inv.gstAmount ?? 0),
    total: Number(inv.total ?? inv.totalAmount ?? inv.finalTotal ?? 0),
    paid: inv.paid ?? inv.paymentStatus === "Paid",
    pdfUrl: inv.pdfUrl ?? inv.invoicePdfUrl ?? "",
  };
}

/** Newest quotation first (by createdAt / date, then id). */
function sortQuotationsNewestFirst(list = []) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.createdAt || a.date || 0).getTime();
    const tb = new Date(b.createdAt || b.date || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(b.id || b.quoteKey || "").localeCompare(String(a.id || a.quoteKey || ""));
  });
}

/** Optional per-model demo market rows for “Market Compare”; empty = modal uses generic online estimates. */
const MARKET_PRICES = {};

const NAV_ICONS = {
  dashboard: "ti-layout-dashboard",
  inventory: "ti-box",
  transfers: "ti-arrows-exchange",
  purchases: "ti-shopping-cart",
  recommendations: "ti-bulb",
  quotations: "ti-file-text",
  invoices: "ti-receipt",
};

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const contentOnly = location.pathname.startsWith("/shop");
  const [page, setPage] = useState("dashboard");
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [purchases, setPurchases] = useState(INITIAL_PURCHASES);
  const [sales, setSales] = useState(INITIAL_SALES);
  const [quotations, setQuotations] = useState(INITIAL_QUOTATIONS);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [modal, setModal] = useState(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [syncError, setSyncError] = useState("");
  const saveTimer = useRef(null);
  /** Always latest snapshot when debounced PUT /sync/all runs (avoids stale empty inventory wiping MongoDB). */
  const persistSnapshotRef = useRef({
    inventory,
    purchases,
    sales,
    quotations,
    invoices,
  });
  const userBranchIdRef = useRef(user?.branchId);
  /** When true, ignore late `/sync/all` inventory payloads so a slow first load cannot undo a delete. */
  const skipServerInventoryReplace = useRef(false);

  const setInventoryFromUser = useCallback((updater) => {
    skipServerInventoryReplace.current = true;
    setInventory(updater);
  }, []);

  const refreshInventoryFromApi = useCallback(async () => {
    if (!apiOnline) return;
    try {
      const all = mapInventoryFromServer(await api.inventory.list());
      setInventory(all);
    } catch (e) {
      console.warn("Inventory refresh failed:", e.message);
    }
  }, [apiOnline]);

  const navItems = useMemo(() => navForRole(user?.role), [user?.role]);

  const goPage = useCallback(
    (id) => {
      const item = navItems.find((n) => n.id === id);
      if (item?.path) navigate(item.path);
      else setPage(id);
    },
    [navItems, navigate]
  );

  useEffect(() => {
    if (!location.pathname.startsWith("/shop")) return;
    const m = location.pathname.match(/^\/shop\/?([^/]*)/);
    let seg = m?.[1] && m[1].length ? m[1] : "dashboard";
    if (seg === "recommendations") {
      navigate("/shop/quotations" + location.search, { replace: true });
      seg = "quotations";
    }
    if (navItems.some((n) => n.id === seg)) setPage(seg);
    else setPage("dashboard");
  }, [location.pathname, location.search, navItems, navigate]);

  useEffect(() => {
    if (!navItems.some((n) => n.id === page)) setPage("dashboard");
  }, [user, page, navItems]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isApiAvailable();
      if (cancelled) return;
      setApiOnline(ok);
      if (!ok) return;
      try {
        const data = await loadFromApi();
        if (cancelled) return;
        if (data.inventory?.length && !skipServerInventoryReplace.current) {
          setInventory(mapInventoryFromServer(data.inventory));
        }
        if (data.purchases) setPurchases(data.purchases);
        if (data.sales) setSales(data.sales);
        if (data.quotations) setQuotations(sortQuotationsNewestFirst(data.quotations));
        if (data.invoices) setInvoices(data.invoices.map(mapInvoiceRow));
        try {
          const finals = await api.listFinalQuotations();
          if (!cancelled && Array.isArray(finals) && finals.length) {
            setQuotations(sortQuotationsNewestFirst(finals));
          }
        } catch {
          /* optional */
        }
      } catch (e) {
        if (!cancelled) console.warn("Load from API failed:", e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistToApi = useCallback(
    async (payload) => {
      if (!apiOnline) return;
      try {
        setSyncError("");
        await api.saveAll(payload);
      } catch (e) {
        const msg = e.message || "Save failed";
        console.warn("Save to API failed:", msg);
        setSyncError(msg);
      }
    },
    [apiOnline],
  );

  persistSnapshotRef.current = { inventory, purchases, sales, quotations, invoices };
  userBranchIdRef.current = user?.branchId;

  useEffect(() => {
    if (!apiOnline) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snap = persistSnapshotRef.current;
      const ub = userBranchIdRef.current;
      const branchId = ub != null && String(ub).trim() !== "" ? String(ub) : undefined;
      persistToApi({
        inventory: snap.inventory,
        purchases: snap.purchases,
        sales: snap.sales,
        quotations: snap.quotations,
        invoices: snap.invoices,
        ...(branchId ? { branchId } : {}),
      });
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [inventory, purchases, sales, quotations, invoices, apiOnline, persistToApi, user?.branchId]);

  const mainBlock = (
    <main className="main">
      {syncError ? (
        <div
          role="alert"
          style={{
            margin: "0 0 12px",
            padding: "10px 12px",
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 16,
          }}
        >
          <strong>
            {syncError.includes("Cannot reach") || syncError.includes("Failed to fetch")
              ? "API unreachable — changes are not being saved."
              : "Sync to MongoDB failed."}
          </strong>{" "}
          {syncError} Check DevTools → Network → <code>PUT /api/sync/all</code> (or <code>PUT sync/all</code> relative
          to your API base). Run <code>npm run dev</code> so the API listens on port 3001. If you use{" "}
          <code>VITE_API_URL</code>, use <code>/api</code> for Vite dev proxy or the full URL of the machine running
          the API. SuperAdmin: ensure a Branch exists or assign your user a branch.
        </div>
      ) : null}
      {page === "dashboard" && (
        <Dashboard
          inventory={inventory}
          quotations={quotations}
          invoices={invoices}
          setPage={goPage}
          apiOnline={apiOnline}
          user={user}
        />
      )}
          {page === "inventory" && (
            <Inventory
              inventory={inventory}
              setInventory={setInventoryFromUser}
              apiOnline={apiOnline}
              modal={modal}
              setModal={setModal}
              user={user}
            />
          )}
          {page === "transfers" && (
            <StockTransfersPage
              userBranchId={user?.branchId}
              userBranchName={user?.branchName}
              userRole={user?.role}
            />
          )}
          {page === "purchases" && (
            <PurchaseAndSales
              purchases={purchases}
              setPurchases={setPurchases}
              sales={sales}
              setSales={setSales}
              inventory={inventory}
              setInventory={setInventoryFromUser}
              apiOnline={apiOnline}
              user={user}
              onInventoryRefresh={refreshInventoryFromApi}
            />
          )}
          {page === "quotations" && (
            <QuotationsPage
              setQuotations={setQuotations}
              setInvoices={setInvoices}
              inventory={inventory}
              userBranchId={user?.branchId}
              userBranchName={user?.branchName}
            />
          )}
          {page === "invoices" && <Invoices invoices={invoices} setInvoices={setInvoices} inventory={inventory} modal={modal} setModal={setModal} />}
          {page === "accounts" && <AccountsReports user={user} />}
    </main>
  );

  if (contentOnly) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ gridTemplateColumns: "1fr", minHeight: "100%" }}>
          {mainBlock}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-text">⚡ BatteryPro</div>
            <div className="logo-sub">Battery Shop Manager</div>
          </div>
          <nav className="nav">
            {navItems.map((n) => (
              <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => goPage(n.id)}>
                <i className={`ti ${NAV_ICONS[n.id] || "ti-layout-dashboard"}`}></i>
                {n.label}
              </div>
            ))}
          </nav>
          <div style={{ padding: "16px", borderTop: "1px solid #e5e7eb" }}>
            <div className={`api-badge ${apiOnline ? "online" : "offline"}`}>
              <i className={`ti ${apiOnline ? "ti-plug-connected" : "ti-plug-off"}`}></i>
              {apiOnline ? "API connected" : "Offline mode"}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 4 }}>{user?.name || "Signed in"}</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>{user?.role || ""}</div>
            <button type="button" className="btn btn-sm btn-outline" style={{ width: "100%" }} onClick={logout}>
              Log out
            </button>
            <div style={{ fontSize: 16, color: "#374151", fontWeight: 500 }}>Sharma Battery Store</div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>Pune, Maharashtra</div>
          </div>
        </aside>
        {mainBlock}
      </div>
    </>
  );
}

function Dashboard({ inventory, quotations, invoices, setPage, apiOnline, user }) {
  const [branchStats, setBranchStats] = useState(null);
  const [purchaseStats, setPurchaseStats] = useState(null);
  const totalItems = inventory.reduce((a, b) => a + b.quantity, 0);
  const totalValue = inventory.reduce((a, b) => a + b.purchaseRate * b.quantity, 0);
  const totalProfit = inventory.reduce((a, b) => a + (b.sellRate - b.purchaseRate) * b.quantity, 0);
  const lowStock = inventory.filter((b) => b.quantity <= 4);
  const topProfitItems = [...inventory].sort((a, b) => (b.sellRate - b.purchaseRate) - (a.sellRate - a.purchaseRate)).slice(0, 5);
  const pendingQt = quotations.filter((q) => q.status === "Pending").length;

  useEffect(() => {
    if (!apiOnline) return;
    let cancelled = false;
    api.stockTransfers
      .branchDashboard()
      .then((data) => {
        if (!cancelled) setBranchStats(data);
      })
      .catch(() => {});
    api.purchaseManagement
      .dashboard()
      .then((data) => {
        if (!cancelled) setPurchaseStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiOnline, user?.branchId]);

  const transfers = branchStats?.transfers || {};
  const branchLowStock = branchStats?.lowStock || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Branch Dashboard</div>
          <div className="page-sub">
            {user?.branchName ? (
              <>
                Logged in as <strong>{user.branchName}</strong>
                {user?.role === "superAdmin" ? " · Super admin" : ""}
              </>
            ) : (
              "Your branch overview · stock · transfers"
            )}
          </div>
        </div>
        <div style={{ fontSize: 15, color: "#6b7280" }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>

      <div className="grid-4">
        <StatCard label="Total Stock Items" value={totalItems.toLocaleString()} sub="units in your branch view" icon="ti-box" color="#0ea5e9" />
        <StatCard label="Inventory Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} sub="at purchase price" icon="ti-currency-rupee" color="#10b981" />
        <StatCard label="Pending Transfers In" value={transfers.pendingIncoming ?? 0} sub="awaiting your approval/receipt" icon="ti-arrows-exchange" color="#7c3aed" />
        <StatCard label="Pending Transfers Out" value={transfers.pendingOutgoing ?? 0} sub="requests from other branches" icon="ti-truck" color="#ef4444" />
      </div>

      {purchaseStats && (
        <div className="grid-4" style={{ marginTop: 16 }}>
          <StatCard
            label="Vendor Outstanding"
            value={`₹${Number(purchaseStats.totalOutstanding ?? 0).toLocaleString("en-IN")}`}
            sub="unpaid purchase balance"
            icon="ti-credit-card"
            color="#d97706"
          />
          <StatCard
            label="Upcoming Cheques"
            value={purchaseStats.upcomingCheques ?? 0}
            sub="due within 7 days"
            icon="ti-calendar"
            color="#eab308"
          />
          <StatCard
            label="Overdue Payments"
            value={purchaseStats.overdueCount ?? 0}
            sub="past due date"
            icon="ti-alert-triangle"
            color="#ef4444"
          />
          <StatCard
            label="This Month Purchases"
            value={`₹${Number(purchaseStats.monthPurchases ?? 0).toLocaleString("en-IN")}`}
            sub="wholesaler GRN total"
            icon="ti-shopping-cart"
            color="#0ea5e9"
          />
        </div>
      )}

      {(branchLowStock.length > 0 || lowStock.length > 0) && (
        <div className="card" style={{ marginTop: 16, marginBottom: 16 }}>
          <div className="section-title" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Low stock alerts</span>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setPage("transfers")}>
              Stock transfers
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(branchLowStock.length ? branchLowStock : lowStock.slice(0, 8)).map((item, i) => (
              <span key={item.inventoryDocId || item.id || i} className="badge badge-red" style={{ fontSize: 14 }}>
                {item.model || item.brand} · Qty {item.quantity ?? item.qty ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}

      {apiOnline && user?.branchId && (
        <GlobalInventorySearch userBranchId={user?.branchId} userBranchName={user?.branchName} compact />
      )}

      <div className="grid-2">
        <div className="card">
          <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Low Stock Alert</span>
            <span style={{ fontSize: 14, color: "#ef4444", background: "#fee2e2", padding: "3px 8px", borderRadius: 6 }}>{lowStock.length} items</span>
          </div>
          {lowStock.length === 0 ? (
            <div className="empty-state"><i className="ti ti-circle-check" style={{ color: "#10b981" }}></i>All items well stocked</div>
          ) : (
            <table>
              <thead><tr><th>Model</th><th>Type</th><th>Qty</th><th>Action</th></tr></thead>
              <tbody>
                {lowStock.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontSize: 15 }}>{item.model}</td>
                    <td><span className="badge badge-blue">{item.type}</span></td>
                    <td><span className="badge badge-red">{item.quantity}</span></td>
                    <td><button className="btn btn-sm btn-outline" onClick={() => setPage("inventory")}>Restock</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="section-title">Top Profit Margin Items</div>
          <table>
            <thead><tr><th>Model</th><th>Buy</th><th>Sell</th><th>Margin</th></tr></thead>
            <tbody>
              {topProfitItems.map(item => {
                const margin = item.sellRate - item.purchaseRate;
                const pct = ((margin / item.purchaseRate) * 100).toFixed(0);
                return (
                  <tr key={item.id}>
                    <td style={{ fontSize: 15 }}>{item.brand} {item.ah}Ah</td>
                    <td style={{ color: "#6b7280" }}>₹{item.purchaseRate.toLocaleString()}</td>
                    <td style={{ color: "#374151" }}>₹{item.sellRate.toLocaleString()}</td>
                    <td><span className="badge badge-green">+{pct}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 20 }} className="card">
        <div className="section-title">Recent Activity</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Recent Quotations</div>
            {quotations.slice(0, 4).map(q => (
              <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
                <div>
                  <div style={{ fontSize: 16, color: "#374151", fontWeight: 500 }}>{q.customer}</div>
                  <div style={{ fontSize: 14, color: "#6b7280" }}>{q.id} · {q.date}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>₹{q.total.toLocaleString()}</div>
                  <span className={`badge ${q.status === "Converted" ? "badge-green" : q.status === "Rejected" ? "badge-red" : "badge-yellow"}`}>{q.status}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Recent Invoices</div>
            {invoices.map(inv => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
                <div>
                  <div style={{ fontSize: 16, color: "#374151", fontWeight: 500 }}>{inv.customer}</div>
                  <div style={{ fontSize: 14, color: "#6b7280" }}>{inv.id} · {inv.date}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>₹{inv.total.toLocaleString()}</div>
                  <span className={`badge ${inv.paid ? "badge-green" : "badge-red"}`}>{inv.paid ? "Paid" : "Unpaid"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, color }) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value" style={{ color }}>{value}</div>
          <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>{sub}</div>
        </div>
        <div style={{ width: 40, height: 40, background: `${color}15`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={`ti ${icon}`} style={{ fontSize: 24, color }}></i>
        </div>
      </div>
    </div>
  );
}

/** Parse e.g. "12V|36W|35 AH|" for legacy Ah / sync */
function parseAhFromProductCapacitySheet(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*AH/i);
  return m ? Number(m[1]) : 0;
}

/** Parse VA / backup from spec line for table + summary when dedicated columns are empty. */
function parseVaFromSpec(s) {
  const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*va\b/i);
  return m ? Number(m[1]) : 0;
}

function parseBackupHoursFromSpec(s) {
  const raw = String(s || "");
  let m = raw.match(/(?:^|[|\s,])(~?\d+(?:\.\d+)?)\s*(?:hr|hrs|hours)\b/i);
  if (m) return Number(m[1].replace(/^~/, ""));
  m = raw.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hours)\b/i);
  return m ? Number(m[1]) : 0;
}

/** Typed "1100 VA" in a form field — Number() alone fails. */
function parseInverterVaFromForm(val) {
  const s = String(val ?? "").trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*va\b/i);
  if (m) return Number(m[1]);
  const n = Number(s.replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseBackupHoursFromForm(val) {
  const s = String(val ?? "").trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hours)\b/i);
  if (m) return Number(m[1]);
  const n = Number(s.replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Mongo `_id` for Inv+Battery rows (required by `POST /inv-combos/:id/upload-image`). Legacy numeric `id` is not valid. */
function comboInventoryMongoId(item) {
  const raw = item?._id;
  const s =
    raw != null && typeof raw === "object" && typeof raw.toString === "function"
      ? raw.toString()
      : String(raw ?? "");
  return /^[a-f\d]{24}$/i.test(s) ? s : "";
}

/** Inverter+Battery section: show VA · Ah · backup from Product Capacity (quotation-style line). */
function formatComboVaAhLine(item) {
  const raw = String(item?.productCapacity || "").trim();
  const ahM = raw.match(/(\d+(?:\.\d+)?)\s*ah\b/i);
  const vaFromField = Number(item?.inverterVA);
  const vaN =
    (Number.isFinite(vaFromField) && vaFromField > 0 ? vaFromField : 0) || parseVaFromSpec(raw);
  const va = vaN > 0 ? `${vaN} VA` : "";
  const ah = ahM ? `${ahM[1]} Ah` : item?.ah != null && item.ah !== "" ? `${Number(item.ah)} Ah` : "";
  const bkFromField = Number(item?.backupHours);
  const bkN =
    (Number.isFinite(bkFromField) && bkFromField > 0 ? bkFromField : 0) || parseBackupHoursFromSpec(raw);
  const bk = bkN > 0 ? `~${bkN} hr` : "";
  const parts = [va, ah, bk].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  if (raw) return raw;
  if (item?.ah != null && item.ah !== "") return `${Number(item.ah)} Ah`;
  return "—";
}

function formatTrolleyTableCell(col, item, serialNumber = null, branchName = "") {
  const key = col.key;
  if (key === "srNo") {
    return serialNumber != null ? String(serialNumber) : "—";
  }
  if (key === "branchName") {
    return branchName || "—";
  }
  if (key === "productCapacity") {
    const raw = String(item.productCapacity || "").trim();
    if (raw) return raw.length > 48 ? `${raw.slice(0, 48)}…` : raw;
    const va = Number(item.compatibleVA ?? item.inverterVA) > 0 ? Number(item.compatibleVA ?? item.inverterVA) : 0;
    return va > 0 ? `${va} VA` : "—";
  }
  if (key === "suitableBatteryType") {
    const s = String(item.suitableBatteryType ?? item.description ?? "").trim();
    return s || "—";
  }
  let v = item[key];
  if (key === "dp") v = item.dp ?? item.dpPrice ?? item.purchaseRate;
  if (key === "cd") v = item.cd ?? item.cdPrice;
  if (key === "price") v = item.price ?? item.sellRate ?? item.mrp;
  if (key === "quantity") {
    const q = Number(item.quantity ?? item.qty ?? 0);
    return (
      <span className={`badge ${q <= 3 ? "badge-red" : q <= 6 ? "badge-yellow" : "badge-green"}`}>
        {Number.isFinite(q) ? q : "—"}
      </span>
    );
  }
  if (v === "" || v == null) return "—";
  if (col.format === "rupee") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (col.format === "num") return Number(v).toLocaleString("en-IN");
  return String(v);
}

function trolleyCellStyle(col) {
  const base = {
    fontSize: 14,
    maxWidth: col.key === "notes" || col.key === "suitableBatteryType" ? 200 : 130,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  if (col.align === "center" || col.format === "rupee" || col.format === "num") {
    base.textAlign = "center";
    base.fontVariantNumeric = "tabular-nums";
  }
  if (col.group === "pricing") base.background = "#f8fafc";
  if (col.group === "stock") base.background = "#fefce8";
  return base;
}

function formatInverterTableCell(col, item, serialNumber = null) {
  const key = col.key;
  let v = item[key];
  if (key === "srNo") {
    return serialNumber != null ? String(serialNumber) : "—";
  }
  if (key === "productCapacity") {
    const raw = String(item.productCapacity || "").trim();
    if (raw) return raw.length > 48 ? `${raw.slice(0, 48)}…` : raw;
    const va = Number(item.compatibleVA ?? item.inverterVA) > 0 ? Number(item.compatibleVA ?? item.inverterVA) : 0;
    return va > 0 ? `${va} VA` : "—";
  }
  if (key === "quantity") {
    const q = Number(item.quantity ?? item.qty ?? 0);
    if (!Number.isFinite(q) && item.quantity !== 0) return "—";
    return (
      <span className={`badge ${q <= 3 ? "badge-red" : q <= 6 ? "badge-yellow" : "badge-green"}`}>
        {q}
      </span>
    );
  }
  if (key === "dp") v = item.dp ?? item.dpPrice ?? item.purchaseRate ?? item.dpPlusGst;
  if (key === "cd") v = item.cd ?? item.cdPrice;
  if (key === "mrp") v = item.mrp ?? item.mrpFinal ?? item.sellRate ?? item.price;
  if (v === "" || v == null) return "—";
  if (col.format === "rupee") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (col.format === "num") return Number(v).toLocaleString("en-IN");
  return String(v);
}

function inverterCellStyle(col) {
  const base = {
    fontSize: 14,
    maxWidth: 130,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  if (col.align === "center" || col.format === "rupee" || col.format === "num") {
    base.textAlign = "center";
    base.fontVariantNumeric = "tabular-nums";
  }
  if (col.group === "pricing") base.background = "#f8fafc";
  if (col.group === "market") base.background = "#f0fdf4";
  if (col.group === "stock") base.background = "#fefce8";
  return base;
}

function formatLithiumIonTableCell(col, item, serialNumber = null, branchName = "") {
  const key = col.key;
  if (key === "srNo") {
    return serialNumber != null ? String(serialNumber) : "—";
  }
  if (key === "branchName") {
    return branchName || "—";
  }
  let v = item[key];
  if (key === "batteryAH") v = item.batteryAH ?? item.ah ?? item.capacityAh ?? item.capacityAH;
  if (key === "batteryModel") v = item.batteryModel || item.model;
  if (key === "weight") v = item.weight ?? item.batteryWeight;
  if (key === "cd") v = item.cd ?? item.cdPrice;
  if (key === "dp") v = item.dp ?? item.dpPrice ?? item.purchaseRate ?? item.dpPlusGst;
  if (key === "mrpFinal") v = item.mrpFinal ?? item.mrp ?? item.newRateWithoutOB;
  if (key === "newRateWithOB") v = item.newRateWithOB ?? item.sellRate;
  if (key === "newRateWithoutOB") v = item.newRateWithoutOB;
  if (key === "quantity") {
    const q = Number(item.quantity ?? item.qty ?? 0);
    return (
      <span className={`badge ${q <= 3 ? "badge-red" : q <= 6 ? "badge-yellow" : "badge-green"}`}>
        {Number.isFinite(q) ? q : "—"}
      </span>
    );
  }
  if (v === "" || v == null) return "—";
  if (col.format === "rupee") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (col.format === "num") return Number(v).toLocaleString("en-IN");
  return String(v);
}

function lithiumIonCellStyle(col) {
  const base = {
    fontSize: 14,
    maxWidth: 130,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  if (col.align === "center" || col.format === "rupee" || col.format === "num") {
    base.textAlign = "center";
    base.fontVariantNumeric = "tabular-nums";
  }
  if (col.group === "pricing") base.background = "#f8fafc";
  if (col.group === "exchange") base.background = "#fffbeb";
  if (col.group === "market") base.background = "#f0fdf4";
  if (col.group === "stock") base.background = "#fefce8";
  return base;
}

function formatComboTableCell(col, item, serialNumber = null) {
  const key = col.key;
  let v = item[key];
  if (key === "srNo") {
    return serialNumber != null ? String(serialNumber) : "—";
  }
  if (key === "batteryAH") v = item.ah ?? item.batteryAH;
  if (key === "batteryWeight") v = item.batteryWeight ?? item.weight;
  if (key === "inverterVA") {
    const n = Number(v);
    if (v === "" || v == null || !Number.isFinite(n) || n <= 0) {
      const fromSpec = parseVaFromSpec(item.productCapacity);
      if (fromSpec > 0) v = fromSpec;
    }
  }
  if (key === "backupHours") {
    const n = Number(v);
    if (v === "" || v == null || !Number.isFinite(n) || n <= 0) {
      const fromSpec = parseBackupHoursFromSpec(item.productCapacity);
      if (fromSpec > 0) v = fromSpec;
    }
  }
  if (v === "" || v == null) return "—";
  if (col.format === "rupee") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (col.format === "num") return Number(v).toLocaleString("en-IN");
  return String(v);
}

function formatHomeInvBatTableCell(col, item, serialNumber = null) {
  const key = col.key;
  let v = item[key];
  if (key === "srNo") {
    return serialNumber != null ? String(serialNumber) : "—";
  }
  if (key === "batteryAH") v = item.batteryAH ?? item.ah ?? item.capacityAh;
  if (key === "batteryModel") v = item.batteryModel || item.model;
  if (key === "weight") v = item.weight ?? item.batteryWeight;
  if (key === "cd") v = item.cd ?? item.cdPrice;
  if (key === "dp") v = item.dp ?? item.dpPrice ?? item.purchaseRate ?? item.dpPlusGst;
  if (key === "mrpFinal") v = item.mrpFinal ?? item.mrp ?? item.newRateWithoutOB;
  if (v === "" || v == null) return "—";
  if (col.format === "rupee") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (col.format === "num") return Number(v).toLocaleString("en-IN");
  return String(v);
}

function homeInvBatCellStyle(col) {
  const base = {
    fontSize: 14,
    maxWidth: 130,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  if (col.align === "center" || col.format === "rupee" || col.format === "num") {
    base.textAlign = "center";
    base.fontVariantNumeric = "tabular-nums";
  }
  if (col.group === "pricing") base.background = "#f8fafc";
  if (col.group === "exchange") base.background = "#fffbeb";
  if (col.group === "market") base.background = "#f0fdf4";
  return base;
}

function inventoryFormFromItem(item, defaultTypeWhenAdding = "Car", defaultBrandWhenAdding = "") {
  const comboDefaults = {
    comboId: "",
    inverterModel: "",
    batteryModel: "",
    inverterVA: "",
    batteryType: "",
    warranty: "",
    backupHours: "",
    backupSupport: "",
    suitableFor: "",
    comboCategory: "",
    inverterPrice: "",
    batteryPrice: "",
    amazonPrice: "",
    flipkartPrice: "",
    batteryBhaiPrice: "",
    batteryBossPrice: "",
    notes: "",
    inverterImage: "",
    batteryImage: "",
    brandLogo: "",
  };
  if (!item) {
    const defaultBrand =
      String(defaultBrandWhenAdding || "").trim() ||
      (isHomeInverterBatterySection(defaultTypeWhenAdding)
        ? ""
        : isTrolleySection(defaultTypeWhenAdding)
          ? "Luminous"
          : "Unknown");
    return {
      model: "",
      brand: defaultBrand || "Unknown",
      productCapacity: "",
      compatibleVA: "",
      suitableBatteryType: "",
      price: "",
      type: defaultTypeWhenAdding || "Car",
      weight: "",
      scrapRate: "",
      cd: "",
      dp: "",
      dpPlusGst: "",
      mrp: "",
      mrpFinal: "",
      newRateWithOB: "",
      newRateWithoutOB: "",
      quantity: "",
      invoiceNo: "",
      supplier: "",
      ah: "",
      voltage: "",
      batteryType: isLithiumIonBatterySection(defaultTypeWhenAdding)
        ? "Lithium Ion"
        : isHomeInverterBatterySection(defaultTypeWhenAdding)
          ? "Tubular"
          : "",
      warranty: "",
      ...comboDefaults,
    };
  }
  const dpDisplay = item.dpPlusGst != null && item.dpPlusGst !== "" ? item.dpPlusGst : item.purchaseRate;
  const obDisplay = item.newRateWithOB != null && item.newRateWithOB !== "" ? item.newRateWithOB : item.sellRate;
  return {
    id: item.id,
    _id: item._id != null ? String(item._id) : "",
    model: item.model ?? item.batteryModel ?? "",
    brand: item.brand ?? "Unknown",
    productCapacity: item.productCapacity ?? "",
    compatibleVA: item.compatibleVA ?? item.inverterVA ?? "",
    suitableBatteryType: item.suitableBatteryType ?? item.description ?? "",
    price: item.price ?? item.sellRate ?? item.mrp ?? "",
    type: item.type ?? "Car",
    weight: item.weight ?? "",
    scrapRate: item.scrapRate ?? "",
    dpPlusGst: dpDisplay ?? "",
    mrp: item.mrpFinal ?? item.mrp ?? "",
    cd: item.cd ?? item.cdPrice ?? "",
    dp: item.dp ?? item.dpPrice ?? item.purchaseRate ?? item.dpPlusGst ?? "",
    mrpFinal: item.mrpFinal ?? item.mrp ?? "",
    newRateWithOB: obDisplay ?? "",
    newRateWithoutOB: item.newRateWithoutOB ?? "",
    quantity: item.quantity ?? "",
    invoiceNo: item.invoiceNo ?? "",
    supplier: item.supplier ?? "",
    ah: item.ah ?? item.batteryAH ?? "",
    voltage: item.voltage ?? "",
    comboId: item.comboId ?? "",
    inverterModel: item.inverterModel ?? "",
    batteryModel: item.batteryModel ?? item.model ?? "",
    inverterVA: item.inverterVA ?? "",
    batteryType: item.batteryType ?? "",
    warranty: item.warranty ?? "",
    backupHours: item.backupHours ?? "",
    backupSupport: item.backupSupport ?? "",
    suitableFor: item.suitableFor ?? "",
    comboCategory: item.comboCategory ?? "",
    inverterPrice: item.inverterPrice ?? "",
    batteryPrice: item.batteryPrice ?? "",
    amazonPrice: item.amazonPrice ?? "",
    flipkartPrice: item.flipkartPrice ?? "",
    batteryBhaiPrice: item.batteryBhaiPrice ?? "",
    batteryBossPrice: item.batteryBossPrice ?? "",
    notes: item.notes ?? "",
    inverterImage: item.inverterImage ?? "",
    batteryImage: item.batteryImage ?? "",
    brandLogo: item.brandLogo ?? "",
  };
}

function tagHomeInvBatteryRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    type: HOME_INVERTER_BATTERY_TYPE,
    category: HOME_INVERTER_BATTERY_TYPE,
    _inventoryCategory: row._inventoryCategory ?? "home_inv",
    _catalogSource: row._catalogSource ?? "home_inverter_batteries",
  };
}

function mapInventoryFromServer(rows) {
  return (rows || []).map((row) => {
    const mapped = {
      ...row,
      model: row.model ?? row.modelName ?? row.batteryModel ?? "",
      batteryModel: row.batteryModel ?? row.model ?? row.modelName ?? "",
      type: row.type ?? row.category ?? "",
      category: row.category ?? row.type ?? "",
      id: row.id ?? row.legacyId ?? (row._id != null ? String(row._id) : row.id),
      _id: row._id != null ? String(row._id) : row._id,
      quantity: Number(row.quantity ?? row.qty ?? 0),
      legacyId: row.legacyId ?? null,
      createdAt: row.createdAt ?? null,
      ah: row.ah ?? row.capacityAh ?? row.batteryAH ?? "",
      batteryAH: row.batteryAH ?? row.ah ?? row.capacityAh ?? "",
      homeSystemType: row.homeSystemType ?? row.comboCategory ?? "",
      comboCategory: row.comboCategory ?? row.homeSystemType ?? "",
      weight: row.weight ?? row.batteryWeight ?? "",
      sellRate: row.sellRate ?? row.sellingRate ?? row.newRateWithOB ?? "",
      purchaseRate: row.purchaseRate ?? row.dp ?? row.dpPrice ?? row.dpPlusGst ?? "",
      cd: row.cd ?? row.cdPrice ?? "",
      dp: row.dp ?? row.dpPrice ?? row.purchaseRate ?? row.dpPlusGst ?? "",
      mrpFinal: row.mrpFinal ?? row.mrp ?? "",
      newRateWithOB: row.newRateWithOB ?? row.sellRate ?? row.sellingRate ?? "",
      newRateWithoutOB: row.newRateWithoutOB ?? "",
      voltage: row.voltage ?? "",
      scrapRate: row.scrapRate ?? "",
      amazonPrice: row.amazonPrice ?? "",
      flipkartPrice: row.flipkartPrice ?? "",
      batteryBhaiPrice: row.batteryBhaiPrice ?? "",
      batteryBossPrice: row.batteryBossPrice ?? "",
      cdPrice: row.cdPrice ?? row.cd ?? "",
      dpPrice: row.dpPrice ?? row.dp ?? row.purchaseRate ?? "",
      _inventoryCategory: row._inventoryCategory,
      _catalogSource: row._catalogSource,
      suitableBatteryType: row.suitableBatteryType ?? row.description ?? "",
      price: row.price ?? row.sellRate ?? row.mrp ?? "",
    };
    return shouldShowOnHomeInvBatteryTab(mapped) ? tagHomeInvBatteryRow(mapped) : mapped;
  });
}

function inventoryRowMatchesSearch(item, q) {
  const cap = (item.productCapacity || "").toLowerCase();
  return (
    String(item.model || "")
      .toLowerCase()
      .includes(q) ||
    (item.brand || "").toLowerCase().includes(q) ||
    cap.includes(q) ||
    String(item.comboId || "")
      .toLowerCase()
      .includes(q) ||
    String(item.inverterModel || "")
      .toLowerCase()
      .includes(q) ||
    String(item.batteryModel || "")
      .toLowerCase()
      .includes(q) ||
    String(item.notes || "")
      .toLowerCase()
      .includes(q) ||
    String(item.backupSupport || "")
      .toLowerCase()
      .includes(q) ||
    String(item.comboCategory || "")
      .toLowerCase()
      .includes(q) ||
    String(item.homeSystemType || "")
      .toLowerCase()
      .includes(q) ||
    String(item.suitableFor || "")
      .toLowerCase()
      .includes(q) ||
    String(item.suitableBatteryType || item.description || "")
      .toLowerCase()
      .includes(q) ||
    String(item.warranty || "")
      .toLowerCase()
      .includes(q)
  );
}

function mergeCategoryRowsIntoInventory(prev, categoryRows, matchesCategory) {
  const incoming = mapInventoryFromServer(categoryRows);
  const rest = (prev || []).filter((row) => !matchesCategory(row));
  return [...rest, ...incoming];
}

/** After Excel upload, pick the brand chip that shows newly imported rows. */
function brandFilterAfterCategoryUpload(category, uploadedBrands) {
  if (!category?.brands?.length || !uploadedBrands?.length) return null;
  const automotive = isAutomotiveInventoryCategory(category);
  const brands = [
    ...new Set(
      uploadedBrands
        .map((b) => {
          const raw = String(b ?? "").trim();
          if (!raw) return "";
          return automotive ? canonicalAutomotiveBrand(raw) || raw : raw;
        })
        .filter(Boolean),
    ),
  ];
  if (!brands.length) return null;
  const known = brands.find((b) => category.brands.some((chip) => inventoryBrandMatches(b, chip)));
  if (known) return category.brands.find((chip) => inventoryBrandMatches(known, chip)) ?? null;
  if (brands.every((b) => normalizeInventoryBrand(b) === "unknown")) return "Other";
  return "Other";
}

function Inventory({ inventory, setInventory, apiOnline, modal, setModal, user }) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("car-battery");
  const [brandFilter, setBrandFilter] = useState("Exide");
  const category = getInventoryCategory(categoryId);
  const typeFilter = category.uploadType;
  const [editItem, setEditItem] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showComparison, setShowComparison] = useState(null);

  const isComboIvBat = category.tableKind === "combo";
  const isInvOnlyTab = category.tableKind === "inverter";
  const isHomeInvBatTab = category.tableKind === "home-inv-bat";
  const isTrolleyTab = category.tableKind === "trolley";
  const isLithiumIonTab = category.tableKind === "lithium-ion";
  const isCarBatteryTab = category.tableKind === "automotive-car";
  const isBikeBatteryTab = category.tableKind === "automotive-bike";
  const isAutomotiveTab = isCarBatteryTab || isBikeBatteryTab;
  const defaultTypeWhenAdding = typeFilter;

  const fileRef = useRef(null);
  const comboImgFileRef = useRef(null);
  const comboImgPickRef = useRef({ mongoId: "", imageField: "inverterImage" });
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [comboImgUploadBusy, setComboImgUploadBusy] = useState(false);
  const [homeTabRows, setHomeTabRows] = useState([]);
  const [homeTabLoading, setHomeTabLoading] = useState(false);
  const [automotiveTabRows, setAutomotiveTabRows] = useState([]);
  const [automotiveTabLoading, setAutomotiveTabLoading] = useState(false);

  const loadHomeTabRows = useCallback(async () => {
    if (!apiOnline) return [];
    const rows = await api.listInventoryCategory(HOME_INVERTER_BATTERY_TYPE);
    return mapInventoryFromServer(Array.isArray(rows) ? rows : []);
  }, [apiOnline]);

  const loadAutomotiveTabRows = useCallback(async () => {
    if (!apiOnline || !typeFilter) return [];
    if (!api.inventoryCategoryPath(typeFilter)) return [];
    const rows = await api.listInventoryCategory(typeFilter);
    return mapInventoryFromServer(Array.isArray(rows) ? rows : []);
  }, [apiOnline, typeFilter]);

  useEffect(() => {
    if (!apiOnline || !isHomeInvBatTab) return;
    let cancelled = false;
    setHomeTabLoading(true);
    loadHomeTabRows()
      .then((rows) => {
        if (!cancelled) setHomeTabRows(rows);
      })
      .catch((e) => {
        if (!cancelled) console.warn("Home Inv Bat tab refresh failed:", e.message);
      })
      .finally(() => {
        if (!cancelled) setHomeTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiOnline, isHomeInvBatTab, loadHomeTabRows]);

  useEffect(() => {
    if (!apiOnline || !isAutomotiveTab) return;
    let cancelled = false;
    setAutomotiveTabLoading(true);
    loadAutomotiveTabRows()
      .then((rows) => {
        if (!cancelled) setAutomotiveTabRows(rows);
      })
      .catch((e) => {
        if (!cancelled) console.warn("Automotive tab refresh failed:", e.message);
      })
      .finally(() => {
        if (!cancelled) setAutomotiveTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiOnline, isAutomotiveTab, loadAutomotiveTabRows]);

  // Single targeted refetch: only the collection backing the ACTIVE tab is queried.
  // Previously this always fired the heavy aggregate GET /inventory (all categories)
  // AND a second tab GET — doubling round-trips and, if the aggregate stalled, blocking
  // the tab refresh (root cause of "requires manual refresh" / pending requests).
  const fetchInventory = useCallback(async () => {
    if (!apiOnline) return;
    if (isHomeInvBatTab) {
      console.log("[inventory] API called: GET /home-inv-battery (refetch)");
      const rows = await loadHomeTabRows();
      setHomeTabRows(rows);
      console.log("[inventory] API completed + state updated: home rows =", rows.length);
      return;
    }
    if (isAutomotiveTab) {
      console.log("[inventory] API called: GET", api.inventoryCategoryPath(typeFilter), "(refetch)");
      const rows = await loadAutomotiveTabRows();
      setAutomotiveTabRows(rows);
      console.log("[inventory] API completed + state updated: automotive rows =", rows.length);
      return;
    }
    console.log("[inventory] API called: GET /inventory (refetch)");
    const all = mapInventoryFromServer(await api.inventory.list());
    setInventory(all);
    console.log("[inventory] API completed + state updated: inventory rows =", all.length);
  }, [apiOnline, isAutomotiveTab, isHomeInvBatTab, loadAutomotiveTabRows, loadHomeTabRows, setInventory, typeFilter]);

  const handleDeleteRow = async (item) => {
    const deleteId = resolveInventoryUpdateId(item, item?._id);
    try {
      if (apiOnline && deleteId) {
        // Remove from view immediately, then confirm with the server + a single refetch.
        setInventory((inv) => removeInventoryRow(inv, item));
        if (isHomeInvBatTab) setHomeTabRows((rows) => rows.filter((r) => !inventoryRowsMatch(r, item)));
        if (isAutomotiveTab) setAutomotiveTabRows((rows) => rows.filter((r) => !inventoryRowsMatch(r, item)));
        console.log("[inventory] state updated (optimistic delete):", deleteId);
        console.log("[inventory] API called: DELETE /inventory/" + deleteId);
        await api.inventory.remove(deleteId);
        console.log("[inventory] API completed: DELETE /inventory/" + deleteId);
        await fetchInventory();
        setUploadMsg("Inventory row deleted.");
      } else {
        setInventory((inv) => removeInventoryRow(inv, item));
        if (isHomeInvBatTab) {
          setHomeTabRows((rows) => rows.filter((r) => !inventoryRowsMatch(r, item)));
        }
        if (isAutomotiveTab) {
          setAutomotiveTabRows((rows) => rows.filter((r) => !inventoryRowsMatch(r, item)));
        }
      }
    } catch (e) {
      setUploadMsg(e.message || "Delete failed");
      // Roll back the optimistic removal by re-syncing the active tab from the server.
      try {
        await fetchInventory();
      } catch {
        /* leave message as-is */
      }
    }
  };

  const handleExcel = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      if (!apiOnline) {
        setUploadMsg("API offline — start the server (npm run dev) to save Excel to MongoDB.");
        return;
      }
      const res = await api.uploadInventoryCategory(typeFilter, file);
      const mappedCategory = Array.isArray(res.categoryRows) ? mapInventoryFromServer(res.categoryRows) : [];
      const uploadBrands = Array.isArray(res.uploadedBrands) ? res.uploadedBrands : [];
      const nextBrand = uploadBrands.length ? brandFilterAfterCategoryUpload(category, uploadBrands) : null;
      if (mappedCategory.length) {
        if (isHomeInvBatTab) {
          setHomeTabRows(mappedCategory);
        } else if (isAutomotiveTab) {
          setAutomotiveTabRows(mappedCategory);
        } else {
          setInventory((prev) =>
            mergeCategoryRowsIntoInventory(prev, res.categoryRows, (row) =>
              inventoryRowMatchesCategory(mapInventoryFromServer([row])[0], category),
            ),
          );
        }
        if (nextBrand) setBrandFilter(nextBrand);
      }
      await fetchInventory();
      const dbHint =
        res.mongoDatabase && res.mongoCollection
          ? ` In Atlas open database "${res.mongoDatabase}" → collection "${res.mongoCollection}".`
          : "";
      const rowCount = res.categoryRowCount ?? res.imported ?? 0;
      const merged = res.merged ?? {};
      const inserted = merged.inserted ?? 0;
      const updated = merged.updated ?? 0;
      const countHint =
        res.productCountBefore != null && res.productCountAfter != null
          ? ` Branch total SKUs: ${res.productCountBefore} → ${res.productCountAfter}.`
          : "";
      setUploadMsg(
        rowCount > 0
          ? `Merged ${res.imported} Excel row(s): ${inserted} new SKU(s) added, ${updated} existing updated (qty/pricing). Previous inventory kept.${countHint}${dbHint}${res.warnings?.length ? ` (${res.warnings.length} sheet warnings)` : ""}${nextBrand === "Other" ? ` Rows with missing Brand are under the ${automotiveBrandDisplayLabel(category, "Other")} chip.` : ""}`
          : `Parsed ${res.parsedRowCount ?? res.imported} row(s) but none were saved. Check model / brand columns and try again.${dbHint}`,
      );
    } catch (e) {
      setUploadMsg(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openComboImagePicker = (item, imageField) => {
    if (!apiOnline) {
      setUploadMsg("API offline — cannot upload images.");
      return;
    }
    const mongoId = comboInventoryMongoId(item);
    if (!mongoId) {
      setUploadMsg(
        "Image upload needs a MongoDB row id. Import or upload this tab’s Excel first, then refresh inventory from the server.",
      );
      return;
    }
    comboImgPickRef.current = { mongoId, imageField };
    comboImgFileRef.current?.click();
  };

  const onComboImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { mongoId, imageField } = comboImgPickRef.current;
    if (!mongoId) return;
    setComboImgUploadBusy(true);
    setUploadMsg("");
    try {
      const res = await api.uploadInvComboImage(mongoId, file, imageField);
      setInventory((inv) =>
        inv.map((i) => (comboInventoryMongoId(i) === mongoId ? { ...i, [imageField]: res.url } : i)),
      );
      setUploadMsg(`Quotation image saved (${imageField}).`);
    } catch (err) {
      setUploadMsg(err.message || "Image upload failed");
    } finally {
      setComboImgUploadBusy(false);
    }
  };

  const categorySourceRows = isHomeInvBatTab ? homeTabRows : isAutomotiveTab ? automotiveTabRows : inventory;

  const categoryScopedRows = useMemo(() => {
    const q = search.toLowerCase();
    return categorySourceRows.filter(
      (i) => inventoryRowMatchesCategory(i, category) && inventoryRowMatchesSearch(i, q),
    );
  }, [categorySourceRows, category, search]);

  const brandCounts = useMemo(
    () => inventoryBrandCounts(categoryScopedRows, category),
    [categoryScopedRows, category],
  );

  useEffect(() => {
    if (!category.brands?.length) {
      setBrandFilter("");
      return;
    }
    setBrandFilter((prev) => {
      if (prev && category.brands.includes(prev)) return prev;
      if (prev === "Other") return prev;
      const firstWithStock = brandCounts.find((b) => b.count > 0 && !b.isOther);
      return firstWithStock?.brand ?? category.brands[0];
    });
  }, [categoryId, category.brands, brandCounts]);

  const rowsForTable = useMemo(() => {
    const filtered = categoryScopedRows.filter((i) => inventoryRowMatchesBrandSubcategory(i, category, brandFilter));
    return sortInventoryForDisplay(filtered);
  }, [categoryScopedRows, category, brandFilter]);

  const handleCategoryChange = (nextId) => {
    setCategoryId(nextId);
    const next = getInventoryCategory(nextId);
    setBrandFilter(next.brands?.[0] ?? "");
  };

  const handleSave = async (item) => {
    const isEdit = Boolean(editItem);
    const editingMongoId = editItem?._id != null ? String(editItem._id) : null;
    const { srNo: _dropSrNo, ...itemWithoutSrNo } = item;
    const payload = { ...itemWithoutSrNo, quantity: Number(item.quantity) || 0 };

    try {
      if (apiOnline) {
        setUploadMsg("");
        if (isEdit) {
          const updateId = resolveInventoryUpdateId(item, editingMongoId);
          if (!updateId) {
            setUploadMsg("Cannot update: missing MongoDB id. Refresh the page and try again.");
            return;
          }
          console.log("[inventory] API called: PUT /inventory/" + updateId);
          const updated = await api.inventory.update(updateId, payload);
          console.log("[inventory] API completed: PUT /inventory/" + updateId, "->", updated?._id);
          const mapped = mapInventoryFromServer([updated])[0];
          if (mapped?._id) {
            // Replace the existing row in every list it could live in (no insert → no dupes).
            const patch = (rows) => rows.map((row) => (String(row._id) === String(mapped._id) ? mapped : row));
            setInventory(patch);
            if (isHomeInvBatTab) setHomeTabRows(patch);
            if (isAutomotiveTab) setAutomotiveTabRows(patch);
            console.log("[inventory] state updated (edit):", mapped._id);
          }
        } else {
          const { _id: _drop, ...createPayload } = payload;
          const useCategoryApi =
            isHomeInvBatTab ||
            isLithiumIonTab ||
            isInvOnlyTab ||
            isTrolleyTab ||
            isComboIvBat ||
            isCarBatteryTab ||
            category.tableKind === "automotive-bike";
          let created;
          if (useCategoryApi && api.inventoryCategoryPath(typeFilter)) {
            console.log("[inventory] API called: POST", api.inventoryCategoryPath(typeFilter));
            created = await api.createInventoryCategory(typeFilter, createPayload);
          } else {
            console.log("[inventory] API called: POST /inventory");
            created = await api.inventory.create(createPayload);
          }
          console.log("[inventory] API completed: create ->", created?._id);
          // Insert the returned row immediately so it shows without waiting for the refetch.
          // Guarded by _id so the subsequent refetch can never duplicate it.
          const mapped = created ? mapInventoryFromServer([created])[0] : null;
          if (mapped?._id) {
            const addUnique = (rows) =>
              rows.some((r) => String(r._id) === String(mapped._id)) ? rows : [...rows, mapped];
            if (isHomeInvBatTab) setHomeTabRows(addUnique);
            else if (isAutomotiveTab) setAutomotiveTabRows(addUnique);
            else setInventory(addUnique);
            console.log("[inventory] state updated (create):", mapped._id);
          }
        }
        await fetchInventory();
        setUploadMsg(isEdit ? "Inventory updated." : "Inventory saved.");
      } else {
        if (isEdit) {
          setInventory((inv) =>
            inv.map((i) => (inventoryRowsMatch(i, editItem) ? { ...payload, id: i.id, _id: i._id ?? payload._id } : i)),
          );
          if (isHomeInvBatTab) {
            setHomeTabRows((rows) =>
              rows.map((r) => (inventoryRowsMatch(r, editItem) ? { ...payload, id: r.id, _id: r._id ?? payload._id } : r)),
            );
          }
        } else {
          setInventory((inv) => [...inv, { ...payload, id: nextNumericInventoryId(inv) }]);
          if (isHomeInvBatTab) {
            setHomeTabRows((rows) => [...rows, { ...payload, id: nextNumericInventoryId(rows) }]);
          }
        }
      }
      setEditItem(null);
      setShowAdd(false);
    } catch (e) {
      setUploadMsg(e.message || "Failed to save inventory");
    }
  };

  // Persist only the competitor/marketplace prices edited from the comparison modal,
  // without touching any other field on the inventory row.
  const handleSaveMarketPrices = async (item, prices) => {
    const payload = {
      amazonPrice: Number(prices.amazonPrice) || 0,
      flipkartPrice: Number(prices.flipkartPrice) || 0,
      batteryBhaiPrice: Number(prices.batteryBhaiPrice) || 0,
      batteryBossPrice: Number(prices.batteryBossPrice) || 0,
    };
    try {
      if (apiOnline) {
        const updateId = resolveInventoryUpdateId(item, item?._id != null ? String(item._id) : null);
        if (!updateId) {
          setUploadMsg("Cannot save prices: missing MongoDB id. Refresh and try again.");
          return;
        }
        const updated = await api.inventory.update(updateId, payload);
        const mapped = mapInventoryFromServer([updated])[0];
        if (mapped?._id) {
          const patch = (row) => (String(row._id) === String(mapped._id) ? mapped : row);
          setInventory((prev) => prev.map(patch));
          if (isHomeInvBatTab) setHomeTabRows((prev) => prev.map(patch));
          if (isAutomotiveTab) setAutomotiveTabRows((prev) => prev.map(patch));
        }
        setUploadMsg("Comparison prices updated.");
      } else {
        const patch = (row) => (inventoryRowsMatch(row, item) ? { ...row, ...payload } : row);
        setInventory((prev) => prev.map(patch));
        if (isHomeInvBatTab) setHomeTabRows((prev) => prev.map(patch));
        if (isAutomotiveTab) setAutomotiveTabRows((prev) => prev.map(patch));
      }
      setShowComparison(null);
    } catch (e) {
      setUploadMsg(e.message || "Failed to save comparison prices");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Inventory</div>
          <div className="page-sub">
            {category.label}
            {brandFilter ? ` · ${automotiveBrandDisplayLabel(category, brandFilter)}` : ""} · {rowsForTable.length} shown · your branch only
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              handleExcel(f);
              e.target.value = "";
            }}
          />
          <input
            ref={comboImgFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={onComboImageFile}
          />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <i className="ti ti-upload"></i> {uploading ? "Uploading..." : "Upload Excel"}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <i className="ti ti-plus"></i>{" "}
            {isComboIvBat ? "Add combo SKU" : isInvOnlyTab ? "Add Inverter" : isTrolleyTab ? "Add Trolley" : isLithiumIonTab ? "Add Lithium Ion Battery" : isHomeInvBatTab ? "Add Home Inv Battery" : "Add Battery"}
          </button>
        </div>
      </div>

      {apiOnline && (
        <GlobalInventorySearch
          userBranchId={user?.branchId}
          userBranchName={user?.branchName}
          syncSearchType={category.searchType}
          syncBrand={category.brands?.length ? brandFilter : ""}
          onRequestTransfer={async (payload) => {
            try {
              await api.stockTransfers.create({
                inventoryDocId: payload.inventoryDocId,
                fromBranch: payload.fromBranch,
                toBranch: user?.branchId,
                quantity: payload.quantity || 1,
                brand: payload.brand,
                model: payload.model,
                productType: payload.productType,
                notes: `Requested from inventory search (${payload.fromBranchName})`,
              });
              setUploadMsg(`Transfer requested: ${payload.model} from ${payload.fromBranchName}`);
            } catch (e) {
              setUploadMsg(e.message || "Transfer request failed");
            }
          }}
        />
      )}

      {uploadMsg && <div style={{ marginBottom: 12, fontSize: 16, color: uploadMsg.includes("Added") ? "#059669" : "#dc2626" }}>{uploadMsg}</div>}

      <InventoryCategoryNav
        categoryId={categoryId}
        brandFilter={brandFilter}
        brandCounts={brandCounts}
        onCategoryChange={handleCategoryChange}
        onBrandChange={setBrandFilter}
      />

      <div className="filter-row">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="ti ti-search"></i>
          <input
            placeholder={
              isComboIvBat
                ? "Search model, combo ID, inverter/battery model, notes…"
                : isHomeInvBatTab
                  ? "Search battery model, brand, backup support, suitable for, notes…"
                  : isInvOnlyTab
                    ? "Search model, brand, warranty, capacity…"
                    : isTrolleyTab
                      ? "Search trolley model, compatibility, suitable battery type…"
                      : isLithiumIonTab
                        ? "Search lithium ion model, brand, voltage, capacity…"
                    : "Search model, brand, or product capacity…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isInvOnlyTab && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderLeft: "4px solid #8b5cf6",
            background: "#f5f3ff",
            fontSize: 16,
            color: "#5b21b6",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Inverter inventory</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            The table lists inverter SKUs with ERP pricing columns <strong>DP</strong>, <strong>CD</strong>, and <strong>MRP</strong>, plus <strong>Qty</strong> stock on hand.
          </div>
        </div>
      )}

      {isComboIvBat && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderLeft: "4px solid #0ea5e9",
            background: "#f0f9ff",
            fontSize: 16,
            color: "#0c4a6e",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Inverter + battery (combo)</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            The <strong>Inv + Battery</strong> table lists the same 24 columns as your master sheet (scroll horizontally on small screens). Optional: use{" "}
            <strong>Spec</strong> field (optional) for a single line like{" "}
            <code style={{ fontSize: 14 }}>1100 VA | 150 Ah | ~4 hr</code> helps quotations; hover Combo ID or Inverter Model for that preview. Use{" "}
            <strong>I / B / L</strong> in Actions to upload inverter, battery, and brand images to Cloudinary (requires <code>CLOUDINARY_*</code> in{" "}
            <code>.env</code>) — URLs are stored on the row for quotation PDFs.
          </div>
        </div>
      )}

      {isTrolleyTab && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderLeft: "4px solid #f59e0b",
            background: "#fffbeb",
            fontSize: 16,
            color: "#92400e",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Luminous trolley inventory</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            Upload and manage <strong>Luminous trolley</strong> SKUs separately from inverters and combos. Used for optional trolley charges in quotations.
          </div>
        </div>
      )}

      {isLithiumIonTab && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderLeft: "4px solid #06b6d4",
            background: "#ecfeff",
            fontSize: 16,
            color: "#155e75",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Lithium ion battery inventory</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            Separate collection for <strong>lithium-ion</strong> SKUs (Microtek and other brands). ERP table with compulsory <strong>DP</strong> and <strong>CD</strong>. Uploads append only — other inventory is never deleted.
          </div>
        </div>
      )}

      {isHomeInvBatTab && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderLeft: "4px solid #059669",
            background: "#ecfdf5",
            fontSize: 16,
            color: "#065f46",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Battery inventory</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            ERP pricing layout: <strong>CD</strong> (cash discount), <strong>DP</strong> (distributor price), <strong>MRP FINAL</strong>, exchange rates, and marketplace comparison — without quotation clutter fields.
          </div>
        </div>
      )}

      <div className="card inv-table-card">
        <div className="table-wrap">
          {isComboIvBat ? (
            <table>
              <thead>
                <tr>
                  {COMBO_INVENTORY_TABLE_COLUMNS.map((col) => (
                    <th key={col.key} style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {col.label}
                    </th>
                  ))}
                  <th style={{ fontSize: 13, whiteSpace: "nowrap" }} title="Inverter | Battery | Brand logo image URLs set">
                    PDF imgs
                  </th>
                  <th style={{ fontSize: 13, whiteSpace: "nowrap" }}>TYPE</th>
                  <th style={{ fontSize: 13, whiteSpace: "nowrap" }}>Dp+GST</th>
                  <th style={{ fontSize: 13, whiteSpace: "nowrap" }}>MRP</th>
                  <th style={{ fontSize: 13, whiteSpace: "nowrap" }}>P&amp;L</th>
                  <th style={{ fontSize: 13, whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rowsForTable.map((item, index) => {
                  const serial = inventoryDisplaySerial(index);
                  const dp = item.dpPlusGst != null && item.dpPlusGst !== "" ? Number(item.dpPlusGst) : Number(item.purchaseRate ?? 0);
                  const ob = item.newRateWithOB != null && item.newRateWithOB !== "" ? Number(item.newRateWithOB) : Number(item.sellRate ?? 0);
                  const sellForPl = ob || Number(item.sellRate ?? 0);
                  const buyForPl = dp || Number(item.purchaseRate ?? 0);
                  const profit = sellForPl - buyForPl;
                  const pct = buyForPl ? ((profit / buyForPl) * 100).toFixed(1) : "0.0";
                  const capTitle = String(item.productCapacity || "").trim() || formatComboVaAhLine(item);
                  return (
                    <tr key={`inv-${String(item.id ?? "x")}-${item.model}-${item.comboId || ""}`}>
                      {COMBO_INVENTORY_TABLE_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            fontSize: 14,
                            maxWidth: col.key === "notes" ? 200 : 120,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: col.key === "notes" ? "nowrap" : undefined,
                          }}
                          title={
                            col.key === "notes"
                              ? String(item.notes || "")
                              : col.key === "comboId" || col.key === "inverterModel"
                                ? capTitle
                                : undefined
                          }
                        >
                          {formatComboTableCell(col, item, serial)}
                        </td>
                      ))}
                      <td
                        style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap", fontFamily: "monospace" }}
                        title="Inverter | Battery | Brand logo (✓ = URL stored)"
                      >
                        {["inverterImage", "batteryImage", "brandLogo"].map((k) => (String(item[k] || "").trim() ? "✓" : "·")).join(" ")}
                      </td>
                      <td>
                        <span className="badge badge-blue">{item.type}</span>
                      </td>
                      <td style={{ color: "#6b7280", fontSize: 14 }}>₹{buyForPl.toLocaleString("en-IN")}</td>
                      <td style={{ color: "#374151", fontWeight: 500, fontSize: 14 }}>₹{Number(item.mrp || 0).toLocaleString("en-IN")}</td>
                      <td>
                        <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ padding: "3px 6px", fontSize: 13, display: "inline-block" }}>
                          {profit >= 0 ? "+" : ""}₹{profit.toLocaleString("en-IN")} ({pct}%)
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", maxWidth: 220 }}>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditItem(item)} title="Edit">
                            <i className="ti ti-edit"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            type="button"
                            disabled={comboImgUploadBusy}
                            onClick={() => openComboImagePicker(item, "inverterImage")}
                            title="Upload inverter image (Cloudinary)"
                            style={{ fontSize: 13, padding: "2px 6px" }}
                          >
                            I
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            type="button"
                            disabled={comboImgUploadBusy}
                            onClick={() => openComboImagePicker(item, "batteryImage")}
                            title="Upload battery image (Cloudinary)"
                            style={{ fontSize: 13, padding: "2px 6px" }}
                          >
                            B
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            type="button"
                            disabled={comboImgUploadBusy}
                            onClick={() => openComboImagePicker(item, "brandLogo")}
                            title="Upload brand logo (Cloudinary)"
                            style={{ fontSize: 13, padding: "2px 6px" }}
                          >
                            L
                          </button>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setShowComparison(item)} title="Market Compare">
                            <i className="ti ti-chart-bar"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteRow(item);
                            }}
                            title="Delete"
                          >
                            <i className="ti ti-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : isHomeInvBatTab ? (
            <div className="table-wrap" style={{ maxHeight: "72vh", overflow: "auto" }}>
            <table style={{ minWidth: 1280 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 3, background: "#fff", boxShadow: "0 1px 0 #e5e7eb" }}>
                <tr>
                  {HOME_INVERTER_BATTERY_TABLE_GROUPS.map((g) => (
                    <th
                      key={g.id}
                      colSpan={g.span}
                      style={{
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#64748b",
                        background: g.id === "pricing" ? "#f1f5f9" : "#fff",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "6px 8px",
                      }}
                    >
                      {g.label}
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    style={{ fontSize: 13, whiteSpace: "nowrap", verticalAlign: "bottom", background: "#fff" }}
                  >
                    Actions
                  </th>
                </tr>
                <tr>
                  {HOME_INVERTER_BATTERY_TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        textAlign: col.align === "center" ? "center" : "left",
                        background: col.group === "pricing" ? "#f8fafc" : col.group === "exchange" ? "#fffbeb" : col.group === "market" ? "#f0fdf4" : "#fff",
                        top: 28,
                        position: "sticky",
                        zIndex: 2,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {homeTabLoading ? (
                  <tr>
                    <td colSpan={HOME_INVERTER_BATTERY_TABLE_COLUMNS.length + 1} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                      Loading battery inventory…
                    </td>
                  </tr>
                ) : rowsForTable.length === 0 ? (
                  <tr>
                    <td colSpan={HOME_INVERTER_BATTERY_TABLE_COLUMNS.length + 1} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                      No battery rows yet. Upload your Excel on this tab, or check that your account branch matches the MongoDB branchId on saved rows.
                    </td>
                  </tr>
                ) : null}
                {rowsForTable.map((item, index) => {
                  const serial = inventoryDisplaySerial(index);
                  return (
                  <tr key={`inv-${String(item.id ?? "x")}-${item.model}-${item.batteryModel || ""}`}>
                    {HOME_INVERTER_BATTERY_TABLE_COLUMNS.map((col) => (
                      <td key={col.key} style={homeInvBatCellStyle(col)}>
                        {formatHomeInvBatTableCell(col, item, serial)}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditItem(item)} title="Edit">
                          <i className="ti ti-edit"></i>
                        </button>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => setShowComparison(item)} title="Market Compare">
                          <i className="ti ti-chart-bar"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteRow(item);
                          }}
                          title="Delete"
                        >
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          ) : isInvOnlyTab ? (
            <div className="table-wrap" style={{ maxHeight: "72vh", overflow: "auto" }}>
            <table style={{ minWidth: 1200 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 3, background: "#fff", boxShadow: "0 1px 0 #e5e7eb" }}>
                <tr>
                  {INVERTER_INVENTORY_TABLE_GROUPS.map((g) => (
                    <th
                      key={g.id}
                      colSpan={g.span}
                      style={{
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#64748b",
                        background:
                          g.id === "pricing" ? "#f1f5f9" : g.id === "market" ? "#ecfdf5" : g.id === "stock" ? "#fef9c3" : "#fff",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "6px 8px",
                      }}
                    >
                      {g.label}
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    style={{ fontSize: 13, whiteSpace: "nowrap", verticalAlign: "bottom", background: "#fff" }}
                  >
                    Actions
                  </th>
                </tr>
                <tr>
                  {INVERTER_INVENTORY_TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        textAlign: col.align === "center" ? "center" : "left",
                        background:
                          col.group === "pricing"
                            ? "#f8fafc"
                            : col.group === "market"
                              ? "#f0fdf4"
                              : col.group === "stock"
                                ? "#fefce8"
                                : "#fff",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForTable.map((item, index) => {
                  const serial = inventoryDisplaySerial(index);
                  return (
                    <tr key={`inv-${String(item.id ?? "x")}-${item.model}`}>
                      {INVERTER_INVENTORY_TABLE_COLUMNS.map((col) => (
                        <td key={col.key} style={inverterCellStyle(col)}>
                          {formatInverterTableCell(col, item, serial)}
                        </td>
                      ))}
                      <td>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditItem(item)} title="Edit">
                            <i className="ti ti-edit"></i>
                          </button>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setShowComparison(item)} title="Market Compare">
                            <i className="ti ti-chart-bar"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteRow(item);
                            }}
                            title="Delete"
                          >
                            <i className="ti ti-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          ) : isTrolleyTab ? (
            <div className="table-wrap" style={{ maxHeight: "72vh", overflow: "auto" }}>
            <table style={{ minWidth: 1180 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 3, background: "#fff", boxShadow: "0 1px 0 #e5e7eb" }}>
                <tr>
                  {TROLLEY_INVENTORY_TABLE_GROUPS.map((g) => (
                    <th
                      key={g.id}
                      colSpan={g.span}
                      style={{
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#64748b",
                        background: g.id === "pricing" ? "#f1f5f9" : g.id === "stock" ? "#fef9c3" : "#fff",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "6px 8px",
                      }}
                    >
                      {g.label}
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    style={{ fontSize: 13, whiteSpace: "nowrap", verticalAlign: "bottom", background: "#fff" }}
                  >
                    Actions
                  </th>
                </tr>
                <tr>
                  {TROLLEY_INVENTORY_TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        textAlign: col.align === "center" ? "center" : "left",
                        background:
                          col.group === "pricing" ? "#f8fafc" : col.group === "stock" ? "#fefce8" : "#fff",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForTable.length === 0 ? (
                  <tr>
                    <td colSpan={TROLLEY_INVENTORY_TABLE_COLUMNS.length + 1} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                      No Luminous trolley rows yet. Upload your trolley Excel on this tab.
                    </td>
                  </tr>
                ) : null}
                {rowsForTable.map((item, index) => (
                  <tr key={`inv-${String(item.id ?? "x")}-${item.model}`}>
                    {TROLLEY_INVENTORY_TABLE_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        style={trolleyCellStyle(col)}
                        title={
                          col.key === "notes"
                            ? String(item.notes || "")
                            : col.key === "suitableBatteryType"
                              ? String(item.suitableBatteryType || item.description || "")
                              : undefined
                        }
                      >
                        {formatTrolleyTableCell(col, item, inventoryDisplaySerial(index), user?.branchName || "")}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditItem(item)} title="Edit">
                          <i className="ti ti-edit"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteRow(item);
                          }}
                          title="Delete"
                        >
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : isLithiumIonTab ? (
            <div className="table-wrap" style={{ maxHeight: "72vh", overflow: "auto" }}>
            <table style={{ minWidth: 1680 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 3, background: "#fff", boxShadow: "0 1px 0 #e5e7eb" }}>
                <tr>
                  {LITHIUM_ION_BATTERY_TABLE_GROUPS.map((g) => (
                    <th
                      key={g.id}
                      colSpan={g.span}
                      style={{
                        fontSize: 13,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#64748b",
                        background: g.id === "pricing" ? "#f1f5f9" : g.id === "stock" ? "#fef9c3" : "#fff",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "6px 8px",
                      }}
                    >
                      {g.label}
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    style={{ fontSize: 13, whiteSpace: "nowrap", verticalAlign: "bottom", background: "#fff" }}
                  >
                    Actions
                  </th>
                </tr>
                <tr>
                  {LITHIUM_ION_BATTERY_TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        textAlign: col.align === "center" ? "center" : "left",
                        background:
                          col.group === "pricing" ? "#f8fafc" : col.group === "stock" ? "#fefce8" : "#fff",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForTable.length === 0 ? (
                  <tr>
                    <td colSpan={LITHIUM_ION_BATTERY_TABLE_COLUMNS.length + 1} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                      No lithium ion battery rows yet. Upload your Excel on this tab or click Add Lithium Ion Battery.
                    </td>
                  </tr>
                ) : null}
                {rowsForTable.map((item, index) => (
                  <tr key={`inv-${String(item.id ?? "x")}-${item.model}`}>
                    {LITHIUM_ION_BATTERY_TABLE_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        style={lithiumIonCellStyle(col)}
                      >
                        {formatLithiumIonTableCell(col, item, inventoryDisplaySerial(index), user?.branchName || "")}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditItem(item)} title="Edit">
                          <i className="ti ti-edit"></i>
                        </button>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => setShowComparison(item)} title="Market Compare">
                          <i className="ti ti-chart-bar"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteRow(item);
                          }}
                          title="Delete"
                        >
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>Sr.No.</th>
                  <th rowSpan={2}>Model Number</th>
                  <th rowSpan={2}>Product Capacity</th>
                  <th rowSpan={2}>TYPE</th>
                  <th rowSpan={2}>Weight</th>
                  <th rowSpan={2}>Scrap Rate</th>
                  <th rowSpan={2}>Dp + GST</th>
                  {isAutomotiveTab ? <th rowSpan={2}>CD</th> : null}
                  <th rowSpan={2}>MRP</th>
                  <th rowSpan={2}>Warranty</th>
                  <th colSpan={2}>NEW RATE</th>
                  <th rowSpan={2}>Qty</th>
                  <th rowSpan={2}>P&amp;L</th>
                  <th rowSpan={2}>Actions</th>
                </tr>
                <tr>
                  <th>WITH OB</th>
                  <th>W/O B</th>
                </tr>
              </thead>
              <tbody>
                {rowsForTable.map((item, rowIdx) => {
                  const dp = item.dpPlusGst != null && item.dpPlusGst !== "" ? Number(item.dpPlusGst) : Number(item.purchaseRate ?? item.dp ?? 0);
                  const cd = Number(item.cd ?? item.cdPrice ?? 0);
                  const ob = item.newRateWithOB != null && item.newRateWithOB !== "" ? Number(item.newRateWithOB) : Number(item.sellRate ?? 0);
                  const wo = Number(item.newRateWithoutOB ?? 0);
                  const sellForPl = ob || Number(item.sellRate ?? 0);
                  const buyForPl = dp || Number(item.purchaseRate ?? 0);
                  const profit = sellForPl - buyForPl;
                  const pct = buyForPl ? ((profit / buyForPl) * 100).toFixed(1) : "0.0";
                  const sr = inventoryDisplaySerial(rowIdx);
                  const cap = item.productCapacity || (item.ah ? `${item.ah}Ah` : "—");
                  return (
                    <tr key={`inv-${String(item.id ?? "x")}-${item.model}`}>
                      <td style={{ color: "#6b7280", fontSize: 15 }}>{sr}</td>
                      <td style={{ fontWeight: 500, color: "#111827" }}>{item.model}</td>
                      <td style={{ fontSize: 14, color: "#475569", maxWidth: 180 }} title={cap}>
                        {cap}
                      </td>
                      <td>
                        <span className="badge badge-blue">{item.type}</span>
                      </td>
                      <td style={{ color: "#6b7280", fontSize: 15 }}>{item.weight != null && item.weight !== "" ? item.weight : "—"}</td>
                      <td style={{ color: "#6b7280" }}>₹{Number(item.scrapRate || 0).toLocaleString()}</td>
                      <td style={{ color: "#6b7280" }}>₹{buyForPl.toLocaleString()}</td>
                      {isAutomotiveTab ? (
                        <td style={{ color: "#6b7280" }}>{cd > 0 ? `₹${cd.toLocaleString()}` : "—"}</td>
                      ) : null}
                      <td style={{ color: "#374151", fontWeight: 500 }}>₹{Number(item.mrp || 0).toLocaleString()}</td>
                      <td style={{ color: "#6b7280", fontSize: 15 }}>{String(item.warranty || "").trim() || "—"}</td>
                      <td style={{ color: "#0f766e", fontWeight: 600 }}>₹{ob.toLocaleString()}</td>
                      <td style={{ color: "#0369a1", fontWeight: 500 }}>₹{wo.toLocaleString()}</td>
                      <td>
                        <span className={`badge ${item.quantity <= 3 ? "badge-red" : item.quantity <= 6 ? "badge-yellow" : "badge-green"}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td>
                        <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ padding: "3px 8px", fontSize: 14, display: "inline-block" }}>
                          {profit >= 0 ? "+" : ""}₹{profit.toLocaleString()} ({pct}%)
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditItem(item)} title="Edit">
                            <i className="ti ti-edit"></i>
                          </button>
                          <button className="btn btn-sm btn-secondary" type="button" onClick={() => setShowComparison(item)} title="Market Compare">
                            <i className="ti ti-chart-bar"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteRow(item);
                            }}
                            title="Delete"
                          >
                            <i className="ti ti-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(showAdd || editItem) && (
        <InventoryModal
          item={editItem}
          editingMongoId={editItem?._id != null ? String(editItem._id) : null}
          defaultTypeWhenAdding={defaultTypeWhenAdding}
          defaultBrandWhenAdding={isHomeInvBatTab || isTrolleyTab || isLithiumIonTab || isAutomotiveTab ? brandFilter : ""}
          isCarBatteryTab={isCarBatteryTab}
          onSave={handleSave}
          onClose={() => {
            setShowAdd(false);
            setEditItem(null);
          }}
        />
      )}

      {showComparison && (
        <MarketComparisonModal
          item={showComparison}
          onSave={handleSaveMarketPrices}
          onClose={() => setShowComparison(null)}
        />
      )}
    </div>
  );
}

function InventoryModal({ item, editingMongoId = null, defaultTypeWhenAdding = "Car", defaultBrandWhenAdding = "", isCarBatteryTab = false, onSave, onClose }) {
  const [form, setForm] = useState(() => inventoryFormFromItem(item, defaultTypeWhenAdding, defaultBrandWhenAdding));
  // Guards against double-submit: a second click while the first save is in-flight
  // would POST twice (duplicate rows) or fire duplicate PUTs for the same _id.
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setForm(inventoryFormFromItem(item, defaultTypeWhenAdding, defaultBrandWhenAdding));
  }, [item, defaultTypeWhenAdding, defaultBrandWhenAdding]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isComboForm = isInverterBatterySection(form.type);
  const isInverterForm = String(form.type) === "Inverter";
  const isHomeInvBatForm = isHomeInverterBatterySection(form.type);
  const isTrolleyForm = isTrolleySection(form.type);
  const isLithiumIonForm = isLithiumIonBatterySection(form.type);
  const isCarBatteryForm =
    isCarBatteryTab && !isComboForm && !isInverterForm && !isHomeInvBatForm && !isTrolleyForm && !isLithiumIonForm && String(form.type).toLowerCase() !== "bike";
  const isBikeBatteryForm =
    !isComboForm && !isInverterForm && !isHomeInvBatForm && !isTrolleyForm && !isLithiumIonForm && String(form.type).toLowerCase() === "bike";
  // Car and bike batteries share the same ERP layout (incl. the CD / cash-discount field).
  const isAutomotiveBatteryForm = isCarBatteryForm || isBikeBatteryForm;
  const dpNum = Number(form.dp) || Number(form.dpPlusGst) || 0;
  const cdNum = Number(form.cd) || 0;
  const obNum = Number(form.newRateWithOB) || 0;
  const woNum = Number(form.newRateWithoutOB) || 0;
  const mrpFinalNum = Number(form.mrpFinal) || Number(form.mrp) || 0;
  const priceNum = Number(form.price) || Number(form.mrp) || 0;
  const purchaseForPl = isTrolleyForm || isHomeInvBatForm || isInverterForm || isLithiumIonForm ? dpNum : dpNum;
  const sellForPl = isTrolleyForm
    ? priceNum
    : isInverterForm
      ? mrpFinalNum
      : isHomeInvBatForm || isLithiumIonForm
        ? obNum || woNum || mrpFinalNum
        : obNum || mrpFinalNum;
  const profit = sellForPl - purchaseForPl;
  const pct = purchaseForPl ? ((profit / purchaseForPl) * 100).toFixed(1) : 0;

  const handleSaveClick = () => {
    if (submitting) return;
    const isHomeInvBatForm = isHomeInverterBatterySection(form.type);
    const isLithiumIonFormLocal = isLithiumIonBatterySection(form.type);
    const dp = Number(form.dp) || Number(form.dpPlusGst) || 0;
    const cd = Number(form.cd) || 0;
    if (isLithiumIonFormLocal && (!dp || !cd)) {
      window.alert("DP and CD are required for Lithium Ion Battery inventory.");
      return;
    }
    if (isLithiumIonFormLocal && !String(form.batteryModel || form.model || "").trim()) {
      window.alert("Battery Model Number is required.");
      return;
    }
    if (isHomeInvBatForm && !String(form.batteryType || "").trim()) {
      window.alert("Battery Type is required (e.g. Tubular, Flat Plate).");
      return;
    }
    if (
      isHomeInvBatForm &&
      !String(form.model || form.batteryModel || "").trim() &&
      !(Number(form.ah) > 0)
    ) {
      window.alert("Battery model number or Product Capacity (Ah) is required.");
      return;
    }
    const mrpFinalN = Number(form.mrpFinal) || Number(form.mrp) || 0;
    const mrpN = isInverterForm ? mrpFinalN : mrpFinalN;
    const ob = isInverterForm ? mrpN : Number(form.newRateWithOB) || 0;
    const wo = isInverterForm ? 0 : Number(form.newRateWithoutOB) || 0;
    const invP = Number(form.inverterPrice) || 0;
    const batP = Number(form.batteryPrice) || 0;
    const purchase = isInverterForm || isTrolleyForm || isLithiumIonForm ? dp : dp || (isComboForm ? invP + batP : 0);
    const sell = isTrolleyForm
      ? Number(form.price) || Number(form.mrp) || 0
      : isInverterForm
        ? mrpN
        : isHomeInvBatForm || isLithiumIonForm
          ? ob || wo || mrpFinalN
          : ob || mrpFinalN;
    const trolleyVa =
      parseInverterVaFromForm(form.compatibleVA) ||
      parseVaFromSpec(String(form.productCapacity || "")) ||
      0;
    const ahVal =
      parseAhFromProductCapacitySheet(String(form.productCapacity || "")) || Number(form.ah) || 0;
    let productCapacity = String(form.productCapacity || "").trim();
    let vaN =
      parseInverterVaFromForm(form.inverterVA) ||
      ((isComboForm || isInverterForm) ? parseVaFromSpec(productCapacity) : 0);
    let bkN =
      parseBackupHoursFromForm(form.backupHours) ||
      (isComboForm ? parseBackupHoursFromSpec(productCapacity) : 0) ||
      (isHomeInvBatForm ? 0 : 0);
    if ((isComboForm || isInverterForm) && !productCapacity && (vaN || (isComboForm && ahVal) || (isComboForm && bkN))) {
      const parts = [];
      if (vaN) parts.push(`${vaN} VA`);
      if (isComboForm && ahVal) parts.push(`${ahVal} Ah`);
      if (isComboForm && bkN) parts.push(`~${bkN} hr`);
      if (parts.length) productCapacity = parts.join(" | ");
    }
    if (isHomeInvBatForm && !productCapacity && ahVal) {
      productCapacity = `${ahVal} Ah`;
    }
    if (isTrolleyForm && !productCapacity && trolleyVa) {
      productCapacity = `${trolleyVa} VA`;
    }
    const battModel = String(
      isHomeInvBatForm || isLithiumIonForm ? form.batteryModel || form.model : form.batteryModel || "",
    ).trim();
    const modelOut = String(form.model || "").trim() || battModel;
    const resolvedType = isInverterForm
      ? "Inverter"
      : isHomeInvBatForm
        ? HOME_INVERTER_BATTERY_TYPE
        : isComboForm
          ? INVERTER_BATTERY_TYPE
          : isTrolleyForm
            ? TROLLEY_TYPE
            : isLithiumIonForm
              ? LITHIUM_ION_BATTERY_TYPE
            : form.type || "Car";
    setSubmitting(true);
    Promise.resolve(
      onSave({
      ...form,
      id: form.id ?? item?.id,
      _id: String(form._id || item?._id || editingMongoId || "").trim() || undefined,
      model: modelOut,
      brand: String(form.brand || "Unknown").trim() || "Unknown",
      productCapacity,
      type: resolvedType,
      category: resolvedType,
      weight: isInverterForm || isTrolleyForm ? 0 : Number(form.weight) || 0,
      scrapRate: isInverterForm || isTrolleyForm ? 0 : Number(form.scrapRate) || 0,
      dpPlusGst: isTrolleyForm ? dp : purchase,
      dp,
      dpPrice: dp,
      cd,
      cdPrice: cd,
      price: isTrolleyForm ? sell : undefined,
      mrpFinal: mrpFinalN,
      mrp: isTrolleyForm ? sell : mrpFinalN,
      newRateWithOB: isInverterForm ? sell : ob,
      newRateWithoutOB: wo,
      purchaseRate: purchase,
      sellRate: sell,
      quantity: Number(form.quantity) || 0,
      voltage: isLithiumIonForm ? Number(form.voltage) || 0 : undefined,
      ah: isInverterForm || isTrolleyForm ? 0 : ahVal,
      batteryAH: isInverterForm || isTrolleyForm ? 0 : ahVal,
      capacityAh: isInverterForm || isTrolleyForm ? 0 : ahVal,
      batteryModel: isHomeInvBatForm || isLithiumIonForm ? battModel || modelOut : battModel,
      inverterVA: isTrolleyForm ? trolleyVa : vaN,
      compatibleVA: isTrolleyForm ? trolleyVa : undefined,
      suitableBatteryType: isTrolleyForm ? String(form.suitableBatteryType || "").trim() : "",
      backupHours: bkN,
      inverterPrice: invP,
      batteryPrice: batP,
      amazonPrice: Number(form.amazonPrice) || 0,
      flipkartPrice: Number(form.flipkartPrice) || 0,
      batteryBhaiPrice: Number(form.batteryBhaiPrice) || 0,
      batteryBossPrice: Number(form.batteryBossPrice) || 0,
      comboId: String(form.comboId || "").trim(),
      inverterModel: String(form.inverterModel || "").trim(),
      batteryType: String(form.batteryType || "").trim(),
      warranty: String(form.warranty || "").trim(),
      suitableFor: String(form.suitableFor || "").trim(),
      comboCategory: String(form.comboCategory || "").trim(),
      backupSupport: String(form.backupSupport || "").trim(),
      notes: isInverterForm ? "" : String(form.notes || "").trim(),
      invoiceNo: String(form.invoiceNo || "").trim(),
      supplier: String(form.supplier || "").trim(),
      inverterImage: String(form.inverterImage || "").trim(),
      batteryImage: String(form.batteryImage || "").trim(),
      brandLogo: String(form.brandLogo || "").trim(),
      }),
    ).finally(() => setSubmitting(false));
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">
            {item
              ? isComboForm
                ? "Edit combo (Inverter + Battery)"
                : isHomeInvBatForm
                  ? "Edit Home Inverter Battery"
                  : isInverterForm
                    ? "Edit Inverter"
                    : "Edit Battery"
              : isComboForm
                ? "Add combo (Inverter + Battery)"
                : isHomeInvBatForm
                  ? "Add Home Inverter Battery"
                  : isInverterForm
                    ? "Add Inverter"
                    : "Add New Battery"}
          </div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div
          className="modal-body"
          style={isComboForm || isInverterForm || isHomeInvBatForm ? { maxHeight: "78vh", overflowY: "auto" } : undefined}
        >
          {isComboForm && (
            <>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Combo ID</label>
                  <input className="form-input" value={form.comboId} onChange={(e) => set("comboId", e.target.value)} placeholder="SKU / combo code" />
                </div>
                <div className="form-group">
                  <label className="form-label">Inverter model</label>
                  <input className="form-input" value={form.inverterModel} onChange={(e) => set("inverterModel", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery model</label>
                  <input className="form-input" value={form.batteryModel} onChange={(e) => set("batteryModel", e.target.value)} />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Inverter VA</label>
                  <input className="form-input" type="number" value={form.inverterVA} onChange={(e) => set("inverterVA", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery AH</label>
                  <input className="form-input" type="number" value={form.ah} onChange={(e) => set("ah", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Backup hours</label>
                  <input className="form-input" type="number" value={form.backupHours} onChange={(e) => set("backupHours", e.target.value)} />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Battery type</label>
                  <input className="form-input" value={form.batteryType} onChange={(e) => set("batteryType", e.target.value)} placeholder="Tubular, flat…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Warranty</label>
                  <input className="form-input" value={form.warranty} onChange={(e) => set("warranty", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Combo category</label>
                  <input className="form-input" value={form.comboCategory} onChange={(e) => set("comboCategory", e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Suitable for</label>
                  <input className="form-input" value={form.suitableFor} onChange={(e) => set("suitableFor", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>
              <p style={{ fontSize: 15, color: "#64748b", marginBottom: 8 }}>
                <strong>Quotation PDF images</strong> — paste HTTPS URLs, or use row actions <strong>I / B / L</strong> on the Inv + Battery table to upload to Cloudinary.
              </p>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Inverter image URL</label>
                  <input
                    className="form-input"
                    value={form.inverterImage}
                    onChange={(e) => set("inverterImage", e.target.value)}
                    placeholder="https://res.cloudinary.com/…"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery image URL</label>
                  <input
                    className="form-input"
                    value={form.batteryImage}
                    onChange={(e) => set("batteryImage", e.target.value)}
                    placeholder="https://res.cloudinary.com/…"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Brand logo URL</label>
                  <input
                    className="form-input"
                    value={form.brandLogo}
                    onChange={(e) => set("brandLogo", e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Inverter price (₹)</label>
                  <input className="form-input" type="number" value={form.inverterPrice} onChange={(e) => set("inverterPrice", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery price (₹)</label>
                  <input className="form-input" type="number" value={form.batteryPrice} onChange={(e) => set("batteryPrice", e.target.value)} />
                </div>
              </div>
            </>
          )}
          {isHomeInvBatForm && !isComboForm && (
            <>
              <p style={{ fontSize: 15, color: "#64748b", marginBottom: 12 }}>
                Product type: <strong>Battery</strong> — ERP pricing fields (CD, DP, MRP FINAL) plus exchange and marketplace rates.
              </p>
              <div className="form-group">
                <label className="form-label">Brand</label>
                <input className="form-input" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Battery model number</label>
                <input
                  className="form-input"
                  value={form.model}
                  onChange={(e) => {
                    set("model", e.target.value);
                    set("batteryModel", e.target.value);
                  }}
                  placeholder="e.g. RC18000 150Ah"
                />
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Product capacity (Ah)</label>
                  <input className="form-input" type="number" value={form.ah} onChange={(e) => set("ah", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery weight</label>
                  <input className="form-input" type="number" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery type</label>
                  <input className="form-input" value={form.batteryType} onChange={(e) => set("batteryType", e.target.value)} placeholder="Tubular, flat…" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Warranty</label>
                <input className="form-input" value={form.warranty} onChange={(e) => set("warranty", e.target.value)} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", margin: "12px 0 8px" }}>Pricing</div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">CD — cash discount (₹)</label>
                  <input className="form-input" type="number" value={form.cd} onChange={(e) => set("cd", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">DP — distributor price (₹)</label>
                  <input className="form-input" type="number" value={form.dp} onChange={(e) => set("dp", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">MRP FINAL (₹)</label>
                  <input className="form-input" type="number" value={form.mrpFinal} onChange={(e) => set("mrpFinal", e.target.value)} />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Scrap rate (₹)</label>
                  <input className="form-input" type="number" value={form.scrapRate} onChange={(e) => set("scrapRate", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">WITH OLD (₹)</label>
                  <input className="form-input" type="number" value={form.newRateWithOB} onChange={(e) => set("newRateWithOB", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">WITHOUT OLD (₹)</label>
                  <input className="form-input" type="number" value={form.newRateWithoutOB} onChange={(e) => set("newRateWithoutOB", e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Qty</label>
                <input className="form-input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
              </div>
              {purchaseForPl > 0 && sellForPl > 0 && (
                <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
                  <i className={`ti ${profit >= 0 ? "ti-trending-up" : "ti-trending-down"}`} style={{ marginRight: 6 }}></i>
                  Margin vs DP uses best sell (WITH OLD / WITHOUT OLD / MRP FINAL): ₹{Math.abs(profit).toLocaleString()} per unit ({Math.abs(pct)}%)
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Purchase Invoice No. (optional)</label>
                  <input className="form-input" value={form.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier (optional)</label>
                  <input className="form-input" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
                </div>
              </div>
            </>
          )}
          {isLithiumIonForm && !isComboForm && !isHomeInvBatForm && !isInverterForm && !isTrolleyForm && (
            <>
              <p style={{ fontSize: 15, color: "#64748b", marginBottom: 12 }}>
                Product type: <strong>Lithium Ion Battery</strong> — ERP layout (same as Home Battery + Voltage). <strong>DP and CD are required.</strong>
              </p>
              <div className="form-group">
                <label className="form-label">Brand</label>
                <input className="form-input" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Microtek" />
              </div>
              <div className="form-group">
                <label className="form-label">Battery Model Number</label>
                <input
                  className="form-input"
                  value={form.batteryModel || form.model}
                  onChange={(e) => {
                    set("batteryModel", e.target.value);
                    set("model", e.target.value);
                  }}
                  placeholder="e.g. Microtek Li-150-12"
                />
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Product Capacity (Ah)</label>
                  <input className="form-input" type="number" value={form.ah} onChange={(e) => set("ah", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Voltage (V)</label>
                  <input className="form-input" type="number" value={form.voltage} onChange={(e) => set("voltage", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Battery Type</label>
                  <input className="form-input" value={form.batteryType || "Lithium Ion"} onChange={(e) => set("batteryType", e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Battery Weight</label>
                  <input className="form-input" type="number" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Warranty</label>
                  <input className="form-input" value={form.warranty} onChange={(e) => set("warranty", e.target.value)} placeholder="36 months" />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">CD (₹) *</label>
                  <input className="form-input" type="number" required value={form.cd} onChange={(e) => set("cd", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">DP (₹) *</label>
                  <input className="form-input" type="number" required value={form.dp} onChange={(e) => set("dp", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">MRP FINAL (₹)</label>
                  <input className="form-input" type="number" value={form.mrpFinal || form.mrp} onChange={(e) => { set("mrpFinal", e.target.value); set("mrp", e.target.value); }} />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Scrap Rate (₹)</label>
                  <input className="form-input" type="number" value={form.scrapRate} onChange={(e) => set("scrapRate", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">WITH OLD (₹)</label>
                  <input className="form-input" type="number" value={form.newRateWithOB} onChange={(e) => set("newRateWithOB", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">WITHOUT OLD (₹)</label>
                  <input className="form-input" type="number" value={form.newRateWithoutOB} onChange={(e) => set("newRateWithoutOB", e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Qty</label>
                  <input className="form-input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>
              {purchaseForPl > 0 && sellForPl > 0 && (
                <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
                  Margin vs DP: ₹{Math.abs(profit).toLocaleString()} per unit ({pct}%)
                </div>
              )}
            </>
          )}
          {isTrolleyForm && !isComboForm && !isHomeInvBatForm && !isInverterForm && !isLithiumIonForm && (
            <>
              <p style={{ fontSize: 15, color: "#64748b", marginBottom: 12 }}>
                Product type: <strong>Trolley</strong> — distributor pricing (DP, CD) and final customer price.
              </p>
              <div className="form-group">
                <label className="form-label">Brand</label>
                <input className="form-input" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Luminous" />
              </div>
              <div className="form-group">
                <label className="form-label">Trolley Model</label>
                <input
                  className="form-input"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="e.g. Luminous Trolley 1100"
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Compatibility (VA)</label>
                  <input
                    className="form-input"
                    value={form.productCapacity}
                    onChange={(e) => set("productCapacity", e.target.value)}
                    placeholder="e.g. 1100 VA"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Compatible VA (numeric)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.compatibleVA}
                    onChange={(e) => set("compatibleVA", e.target.value)}
                    placeholder="1100"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Suitable Battery Type</label>
                <input
                  className="form-input"
                  value={form.suitableBatteryType}
                  onChange={(e) => set("suitableBatteryType", e.target.value)}
                  placeholder="e.g. Tubular 150Ah"
                />
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">DP (₹)</label>
                  <input className="form-input" type="number" value={form.dp} onChange={(e) => set("dp", e.target.value)} placeholder="Distributor price" />
                </div>
                <div className="form-group">
                  <label className="form-label">CD (₹)</label>
                  <input className="form-input" type="number" value={form.cd} onChange={(e) => set("cd", e.target.value)} placeholder="Cash price" />
                </div>
                <div className="form-group">
                  <label className="form-label">Price (₹)</label>
                  <input className="form-input" type="number" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="Customer price" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Qty</label>
                  <input className="form-input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional remarks" />
                </div>
              </div>
              {purchaseForPl > 0 && sellForPl > 0 && (
                <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
                  Margin: ₹{Math.abs(profit).toLocaleString()} per unit ({pct}%)
                </div>
              )}
            </>
          )}
          {isInverterForm && !isComboForm && !isHomeInvBatForm && !isLithiumIonForm ? (
            <>
              <p style={{ fontSize: 15, color: "#64748b", marginBottom: 12 }}>
                Product type: <strong>Inverter</strong> (matches your inverter price sheet — no battery weight / scrap / OB fields).
              </p>
              <div className="form-group">
                <label className="form-label">Brand</label>
                <input className="form-input" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Luminous, Microtek…" />
              </div>
              <div className="form-group">
                <label className="form-label">Inverter Model Number</label>
                <input
                  className="form-input"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="e.g. Luminous Zelio 1100"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Product Capacity (VA)</label>
                <input
                  className="form-input"
                  value={form.productCapacity}
                  onChange={(e) => set("productCapacity", e.target.value)}
                  placeholder="e.g. 1100 VA"
                />
                <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>
                  Parsed VA:{" "}
                  <strong>
                    {parseVaFromSpec(String(form.productCapacity || "")) ||
                      (Number(form.inverterVA) > 0 ? Number(form.inverterVA) : "—")}
                  </strong>
                  {" · "}
                  <span style={{ fontWeight: 500 }}>Optional numeric VA</span> if not in text:{" "}
                  <input
                    className="form-input"
                    type="number"
                    style={{ display: "inline-block", width: 120, marginLeft: 6, verticalAlign: "middle" }}
                    value={form.inverterVA}
                    onChange={(e) => set("inverterVA", e.target.value)}
                    placeholder="e.g. 1100"
                  />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Warranty</label>
                  <input className="form-input" value={form.warranty} onChange={(e) => set("warranty", e.target.value)} placeholder="e.g. 24 months" />
                </div>
                <div className="form-group">
                  <label className="form-label">DP (₹)</label>
                  <input className="form-input" type="number" value={form.dp} onChange={(e) => set("dp", e.target.value)} placeholder="Distributor price" />
                </div>
                <div className="form-group">
                  <label className="form-label">CD (₹)</label>
                  <input className="form-input" type="number" value={form.cd} onChange={(e) => set("cd", e.target.value)} placeholder="Cash price" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">MRP (₹)</label>
                  <input className="form-input" type="number" value={form.mrp} onChange={(e) => set("mrp", e.target.value)} placeholder="Final customer price" />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity (stock units)</label>
                  <input className="form-input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="10" />
                </div>
              </div>
              {purchaseForPl > 0 && sellForPl > 0 && (
                <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
                  <i className={`ti ${profit >= 0 ? "ti-trending-up" : "ti-trending-down"}`} style={{ marginRight: 6 }}></i>
                  Margin (MRP vs DP):{" "}
                  {profit >= 0 ? "You are gaining" : "You are at a loss of"} ₹{Math.abs(profit).toLocaleString()} per unit ({Math.abs(pct)}%{" "}
                  {profit >= 0 ? "profit" : "loss"}) · Total stock {profit >= 0 ? "profit" : "loss"}: ₹
                  {Math.abs(profit * (Number(form.quantity) || 0)).toLocaleString()}
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Purchase Invoice No. (optional)</label>
                  <input className="form-input" value={form.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} placeholder="PUR-001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier (optional)</label>
                  <input className="form-input" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Distributor name" />
                </div>
              </div>
            </>
          ) : !isComboForm && !isInverterForm && !isHomeInvBatForm && !isTrolleyForm && !isLithiumIonForm ? (
            <>
              <div className="form-group">
                <label className="form-label">
                  Model Number{" "}
                  {isComboForm && <span style={{ fontWeight: 400, color: "#64748b" }}>(combo SKU name)</span>}
                </label>
                  <input
                    className="form-input"
                    value={form.model}
                    onChange={(e) => set("model", e.target.value)}
                    placeholder={isComboForm ? "e.g. Zelio 1100 + RC18000 combo" : "e.g. AAM-PR-00050B20L"}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  {isComboForm ? "Combo spec (Inverter VA · Battery Ah · backup)" : "Product Capacity"}
                </label>
                <input
                  className="form-input"
                  value={form.productCapacity}
                  onChange={(e) => set("productCapacity", e.target.value)}
                  placeholder={
                    isComboForm
                      ? "e.g. 1100 VA | 150 Ah | ~4 hr (same idea as quotation options row)"
                      : "e.g. 12V|36W|35 AH|"
                  }
                />
                {isComboForm && (
                  <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>
                    Parsed preview: <strong>{formatComboVaAhLine(form)}</strong>
                  </div>
                )}
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">TYPE</label>
                  <select className="form-select" value={form.type} onChange={e => set("type", e.target.value)}>
                    {INVENTORY_FORM_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Weight</label>
                  <input className="form-input" type="number" value={form.weight} onChange={e => set("weight", e.target.value)} placeholder="10" />
                </div>
                <div className="form-group">
                  <label className="form-label">Scrap Rate (₹)</label>
                  <input className="form-input" type="number" value={form.scrapRate} onChange={e => set("scrapRate", e.target.value)} placeholder="1080" />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Dp + GST (₹)</label>
                  <input className="form-input" type="number" value={form.dpPlusGst} onChange={e => set("dpPlusGst", e.target.value)} placeholder="4431" />
                </div>
                {isAutomotiveBatteryForm ? (
                  <div className="form-group">
                    <label className="form-label">CD (₹)</label>
                    <input className="form-input" type="number" value={form.cd} onChange={(e) => set("cd", e.target.value)} placeholder="Cash price" />
                  </div>
                ) : null}
                <div className="form-group">
                  <label className="form-label">MRP (₹)</label>
                  <input className="form-input" type="number" value={form.mrp} onChange={e => set("mrp", e.target.value)} placeholder="5721" />
                </div>
                {!isAutomotiveBatteryForm ? (
                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input className="form-input" type="number" value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="10" />
                  </div>
                ) : null}
              </div>
              <div className={isAutomotiveBatteryForm ? "grid-3" : "grid-2"}>
                <div className="form-group">
                  <label className="form-label">NEW RATE — WITH OB (₹)</label>
                  <input className="form-input" type="number" value={form.newRateWithOB} onChange={e => set("newRateWithOB", e.target.value)} placeholder="4051" />
                </div>
                <div className="form-group">
                  <label className="form-label">NEW RATE — W/O B (₹)</label>
                  <input className="form-input" type="number" value={form.newRateWithoutOB} onChange={e => set("newRateWithoutOB", e.target.value)} placeholder="5131" />
                </div>
                {isAutomotiveBatteryForm ? (
                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input className="form-input" type="number" value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="10" />
                  </div>
                ) : null}
              </div>
              {purchaseForPl > 0 && sellForPl > 0 && (
                <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
                  <i className={`ti ${profit >= 0 ? "ti-trending-up" : "ti-trending-down"}`} style={{ marginRight: 6 }}></i>
                  {profit >= 0 ? "You are gaining" : "You are at a loss of"} ₹{Math.abs(profit).toLocaleString()} per unit ({Math.abs(pct)}% {profit >= 0 ? "profit" : "loss"}) · Total stock {profit >= 0 ? "profit" : "loss"}: ₹{Math.abs(profit * (Number(form.quantity) || 0)).toLocaleString()}
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <input className="form-input" value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Amaron, Exide…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Warranty</label>
                  <input className="form-input" value={form.warranty} onChange={e => set("warranty", e.target.value)} placeholder="e.g. 36 months" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Capacity (Ah) — optional if parsed from Product Capacity</label>
                  <input className="form-input" type="number" value={form.ah} onChange={e => set("ah", e.target.value)} placeholder="auto from 35 AH in text" />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Invoice No.</label>
                  <input className="form-input" value={form.invoiceNo} onChange={e => set("invoiceNo", e.target.value)} placeholder="PUR-001" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <input className="form-input" value={form.supplier} onChange={e => set("supplier", e.target.value)} placeholder="Distributor name" />
              </div>
            </>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveClick} disabled={submitting}>
            {submitting ? "Saving…" : item ? "Save Changes" : "Add to Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}

const MARKET_PRICE_SOURCES = [
  { key: "amazonPrice", label: "Amazon" },
  { key: "flipkartPrice", label: "Flipkart" },
  { key: "batteryBhaiPrice", label: "BatteryBhai.com" },
  { key: "batteryBossPrice", label: "BatteryBoss" },
];

function MarketComparisonModal({ item, onSave, onClose }) {
  const [prices, setPrices] = useState(() => ({
    amazonPrice: item.amazonPrice ? String(item.amazonPrice) : "",
    flipkartPrice: item.flipkartPrice ? String(item.flipkartPrice) : "",
    batteryBhaiPrice: item.batteryBhaiPrice ? String(item.batteryBhaiPrice) : "",
    batteryBossPrice: item.batteryBossPrice ? String(item.batteryBossPrice) : "",
  }));
  const [saving, setSaving] = useState(false);

  const setPrice = (key, value) => setPrices((p) => ({ ...p, [key]: value }));

  const entered = MARKET_PRICE_SOURCES
    .map((s) => ({ ...s, price: Number(prices[s.key]) || 0 }))
    .filter((s) => s.price > 0);
  const avgMarket = entered.length
    ? Math.round(entered.reduce((a, b) => a + b.price, 0) / entered.length)
    : 0;
  const sell = Number(item.sellRate) || 0;
  const diff = sell - avgMarket;

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(item, prices);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Market Price Comparison</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#374151" }}>{item.model}</div>
            <div style={{ fontSize: 15, color: "#6b7280", marginTop: 4 }}>
              {item.brand} · {item.type}
              {String(item.type || "").toLowerCase() === "inverter"
                ? ` · ${Number(item.inverterVA) > 0 ? `${item.inverterVA} VA` : parseVaFromSpec(String(item.productCapacity || "")) > 0 ? `${parseVaFromSpec(String(item.productCapacity || ""))} VA` : "—"}`
                : ` · ${item.ah}Ah`}
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
              <div><div style={{ fontSize: 14, color: "#6b7280" }}>Your Buy Price</div><div style={{ fontSize: 22, fontWeight: 700, color: "#ef4444" }}>₹{Number(item.purchaseRate || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 14, color: "#6b7280" }}>Your Sell Price</div><div style={{ fontSize: 22, fontWeight: 700, color: "#0ea5e9" }}>₹{sell.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 14, color: "#6b7280" }}>Market Average</div><div style={{ fontSize: 22, fontWeight: 700, color: "#d97706" }}>{avgMarket > 0 ? `₹${avgMarket.toLocaleString()}` : "—"}</div></div>
            </div>
          </div>
          {avgMarket > 0 && (
            <div className={`profit-alert ${diff < 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
              <i className={`ti ${diff < 0 ? "ti-trending-up" : "ti-trending-down"}`} style={{ marginRight: 6 }}></i>
              {diff < 0 ? `Your price is ₹${Math.abs(diff).toLocaleString()} cheaper than market average — competitive advantage!` : diff > 0 ? `Your price is ₹${diff.toLocaleString()} above market average — consider adjusting.` : `Your price matches the market average.`}
            </div>
          )}
          <div className="section-title" style={{ fontSize: 16, marginBottom: 4 }}>Online Price Comparison</div>
          <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 12 }}>
            Enter competitor prices to compare against your sell price. Changes are saved on this item.
          </div>
          {MARKET_PRICE_SOURCES.map((s) => {
            const price = Number(prices[s.key]) || 0;
            const mpDiff = price > 0 ? sell - price : null;
            return (
              <div key={s.key} className="comparison-card">
                <div className="comparison-row" style={{ alignItems: "center" }}>
                  <span className="comparison-source"><i className="ti ti-world" style={{ marginRight: 6, fontSize: 17, verticalAlign: "-2px" }}></i>{s.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "#6b7280", fontSize: 16 }}>₹</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        value={prices[s.key]}
                        onChange={(e) => setPrice(s.key, e.target.value)}
                        placeholder="0"
                        style={{ width: 110, padding: "6px 8px", textAlign: "right" }}
                      />
                    </div>
                    {mpDiff != null && (
                      <span className={`badge ${mpDiff < -50 ? "badge-red" : mpDiff > 50 ? "badge-green" : "badge-yellow"}`}>
                        {mpDiff < 0 ? `₹${Math.abs(mpDiff).toLocaleString()} cheaper than you` : mpDiff > 0 ? `₹${mpDiff.toLocaleString()} more than you` : "Same price"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save prices"}
          </button>
        </div>
      </div>
    </div>
  );
}

const QUOTATION_STATUS_FILTERS = ["All", "Pending", "Sent", "Approved", "Rejected", "Expired", "Converted"];

function quotationStatusClass(status) {
  switch (status) {
    case "Approved":
    case "Converted":
      return "badge-green";
    case "Rejected":
    case "Expired":
      return "badge-red";
    case "Sent":
      return "badge-blue";
    default:
      return "badge-yellow";
  }
}

/** Rows shown in quotation detail (embedded options[] or one legacy synthetic row). */
function expandQuotationOptionsForView(q) {
  if (Array.isArray(q?.options) && q.options.length) return q.options;
  return [
    {
      id: "A",
      title: q.recommendedOptionLabel || q.selectedOption?.optionLabel || q.selectedOption?.type || "Option",
      selectedRow: q.selectedOption || q.suggestedOptions?.[0] || {},
      inverter: q.selectedOption?.inverter,
      battery: q.selectedOption?.battery,
      totalAmount: q.finalTotal,
      quotationPdfUrl: q.finalQuotationPdfUrl || q.quotationPdfUrl,
      quotationPublicUrl: q.quotationPublicUrl,
      quotationCloudinaryUrl: q.quotationCloudinaryUrl,
      whatsappStatus: q.whatsappStatus,
      whatsappSent: q.whatsappSent,
      approved: q.status === "Approved" || q.status === "Converted",
      status: q.status,
      invoiceId: q.invoiceId,
    },
  ];
}

function QuotationsPage({
  setQuotations,
  setInvoices,
  inventory,
  userBranchId,
  userBranchName,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [newQuoteKind, setNewQuoteKind] = useState("combo");
  const [viewSheet, setViewSheet] = useState(null);
  const [editQt, setEditQt] = useState(null);
  const [invoiceConvert, setInvoiceConvert] = useState(null);
  const [finalQuotations, setFinalQuotations] = useState([]);
  const [actionMsg, setActionMsg] = useState("");
  const [actionMsgIsError, setActionMsgIsError] = useState(false);
  const [pdfPreviewModal, setPdfPreviewModal] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [detailQt, setDetailQt] = useState(null);
  const [detailBusy, setDetailBusy] = useState("");

  const refreshFinals = useCallback(async () => {
    try {
      const list = await api.listFinalQuotations();
      const rows = sortQuotationsNewestFirst(Array.isArray(list) ? list : []);
      setFinalQuotations(rows);
      setQuotations?.(rows);
    } catch (e) {
      console.warn("Could not load quotations:", e.message);
    }
  }, [setQuotations]);

  useEffect(() => {
    refreshFinals();
  }, [refreshFinals]);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get("create");
    if (!q || !QUOTATION_KINDS.includes(q)) return;
    setNewQuoteKind(q);
    setShowNew(true);
    navigate("/shop/quotations", { replace: true });
  }, [location.search, navigate]);

  const filtered = sortQuotationsNewestFirst(
    finalQuotations.filter((q) => {
      const name = qtCustomer(q).toLowerCase();
      const term = search.toLowerCase();
      const matchSearch =
        name.includes(term) ||
        String(q.id || "").toLowerCase().includes(term) ||
        String(q.quoteKey || "").toLowerCase().includes(term) ||
        qtPhone(q).toLowerCase().includes(term);
      const status = q.status || "Pending";
      const matchStatus = statusFilter === "All" || status === statusFilter;
      return matchSearch && matchStatus;
    }),
  );

  const qtId = (q) => q?.id || q?.quoteKey || q?._id;

  const handleQuotationCreated = async (quotation) => {
    if (quotation && (quotation.quoteKey || quotation.id || quotation._id)) {
      const qid = quotation.quoteKey || quotation.id || quotation._id;
      setFinalQuotations((prev) => {
        const rest = prev.filter((q) => (q.quoteKey || q.id || q._id) !== qid);
        return sortQuotationsNewestFirst([quotation, ...rest]);
      });
      setQuotations?.((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const rest = list.filter((q) => (q.quoteKey || q.id || q._id) !== qid);
        return sortQuotationsNewestFirst([quotation, ...rest]);
      });
    }
    await refreshFinals();
  };

  const handleSetStatus = async (q, status) => {
    setBusyId(qtId(q));
    setActionMsg("");
    setActionMsgIsError(false);
    try {
      await api.quotations.setStatus(qtId(q), status);
      setActionMsg(`Quotation ${q.quoteKey || q.id} marked ${status}.`);
      await refreshFinals();
      try {
        const list = await api.listFinalQuotations();
        const updated = (Array.isArray(list) ? list : []).find((x) => String(x._id) === String(q._id));
        if (updated) setDetailQt((prev) => (prev && String(prev._id) === String(q._id) ? updated : prev));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setActionMsgIsError(true);
      setActionMsg(e.message || "Could not update status");
    } finally {
      setBusyId("");
    }
  };

  const handleDetailPdf = async (q, opt) => {
    const oid = String(opt.id || "A");
    setDetailBusy(`${qtId(q)}-${oid}`);
    setActionMsg("");
    setActionMsgIsError(false);
    try {
      const data = await api.generateFinalQuotationPdf(qtId(q), { optionId: oid });
      const raw = data.pdf?.pdfUrl || data.quotation?.finalQuotationPdfUrl || data.quotation?.quotationPdfUrl;
      const url = pdfHref(raw);
      if (url) setPdfPreviewModal({ url, title: `${q.quoteKey || q.id} · Option ${oid}` });
      else {
        setActionMsgIsError(true);
        setActionMsg("PDF was generated but the server did not return a usable URL.");
      }
      await refreshFinals();
      const list = await api.listFinalQuotations();
      const updated = (Array.isArray(list) ? list : []).find(
        (x) => String(x._id) === String(q._id) || (x.quoteKey && x.quoteKey === q.quoteKey),
      );
      if (updated) setDetailQt(updated);
    } catch (e) {
      setActionMsgIsError(true);
      setActionMsg(e.message || "PDF generation failed");
    } finally {
      setDetailBusy("");
    }
  };

  const handleDetailApproveSend = async (q, opt) => {
    const oid = String(opt.id || "A");
    setDetailBusy(`${qtId(q)}-${oid}-wa`);
    setActionMsg("");
    setActionMsgIsError(false);
    try {
      const data = await api.approveAndSendFinalQuotationWhatsApp(qtId(q), { optionId: oid });
      if (data.whatsapp && !data.whatsapp.sent) {
        setActionMsgIsError(true);
        setActionMsg(`WhatsApp: ${data.whatsapp.error || data.whatsapp.message || "Not sent"}`);
      } else {
        setActionMsg(`Option ${oid} approved and sent on WhatsApp.`);
      }
      await refreshFinals();
      const list = await api.listFinalQuotations();
      const updated = (Array.isArray(list) ? list : []).find(
        (x) => String(x._id) === String(q._id) || (x.quoteKey && x.quoteKey === q.quoteKey),
      );
      if (updated) setDetailQt(updated);
    } catch (e) {
      setActionMsgIsError(true);
      setActionMsg(e.message || "Approve & send WhatsApp failed");
    } finally {
      setDetailBusy("");
    }
  };

  const handleDetailCreateTier = async (q, opt) => {
    if (!q.recommendationSheetId) {
      setActionMsgIsError(true);
      setActionMsg("This quotation has no linked recommendation sheet. Create it from New quotation.");
      return;
    }
    const oid = String(opt.id || "A");
    setDetailBusy(`${qtId(q)}-${oid}-create`);
    setActionMsg("");
    setActionMsgIsError(false);
    try {
      await api.createQuotationFromSheet({
        generatePdf: true,
        recommendationSheetId: String(q.recommendationSheetId),
        selectedOption: opt.selectedRow || opt,
        selectedOptionLabel: (opt.selectedRow || opt)?.optionLabel || (opt.selectedRow || opt)?.type,
        optionIndex: opt.optionIndex != null ? opt.optionIndex : null,
        clientOptionId: opt.clientOptionId || (opt.selectedRow || opt)?.optionId,
        optionId: opt.clientOptionId || (opt.selectedRow || opt)?.optionId,
      });
      setActionMsg(`Option ${oid} saved on quotation ${q.quoteKey || q.id}.`);
      await refreshFinals();
      const list = await api.listFinalQuotations();
      const updated = (Array.isArray(list) ? list : []).find(
        (x) => String(x._id) === String(q._id) || (x.quoteKey && x.quoteKey === q.quoteKey),
      );
      if (updated) setDetailQt(updated);
    } catch (e) {
      setActionMsgIsError(true);
      setActionMsg(e.message || "Could not create quotation tier");
    } finally {
      setDetailBusy("");
    }
  };

  const handleConvertOption = (q, opt) => {
    const tierApproved =
      opt.approved || (q.status || "Pending") === "Approved" || (q.status || "") === "Converted";
    if (!tierApproved) {
      setActionMsgIsError(true);
      setActionMsg("Approve this option (Approve & Send) or mark the full quotation Approved before converting.");
      return;
    }
    const row = opt.selectedRow || opt;
    const oid = String(opt.id || opt.clientOptionId || "");
    const normalized = normalizeQuotationForInvoice(q, row, oid);
    setInvoiceConvert({
      quotation: normalized,
      selectedOption: normalized.selectedOption,
      quotationOptionId: String(opt.id || "").toUpperCase() || oid,
    });
    setDetailQt(null);
  };

  const handleConvertFromEdit = (q) => {
    if ((q.status || "Pending") !== "Approved") {
      setActionMsgIsError(true);
      setActionMsg("Only Approved quotations can be converted to an invoice.");
      return;
    }
    const normalized = normalizeQuotationForInvoice(q, q.selectedOption);
    setInvoiceConvert({
      quotation: normalized,
      selectedOption: normalized.selectedOption,
      quotationOptionId: normalized.quotationOptionId || "",
    });
    setEditQt(null);
  };

  const handleInvoiceGenerated = async (invoice) => {
    setInvoices?.((invs) => [mapInvoiceRow(invoice), ...(invs || []).map(mapInvoiceRow)]);
    setInvoiceConvert(null);
    setActionMsgIsError(false);
    setActionMsg(`Invoice ${invoice?.invoiceNumber || ""} generated.`);
    await refreshFinals();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Quotations</div>
          <div className="page-sub">Create quotation · Preview PDF · Approve &amp; send WhatsApp · Convert to invoice</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setNewQuoteKind("combo");
            setShowNew(true);
          }}
        >
          <i className="ti ti-plus"></i> New quotation
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Create quotation
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {QUOTATION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn btn-outline"
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                textAlign: "left",
                minHeight: 72,
                borderColor: kind === "combo" ? "#0ea5e9" : "#e5e7eb",
                background: kind === "combo" ? "rgba(14,165,233,0.06)" : "#fff",
              }}
              onClick={() => {
                setNewQuoteKind(kind);
                setShowNew(true);
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{QUOTATION_KIND_LABELS[kind]}</span>
              <span style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Open wizard</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 14, color: "#9ca3af", marginTop: 10, marginBottom: 0 }}>
          Deep link: <code style={{ fontSize: 14 }}>/shop/quotations?create=inverter</code> (combo, inverter, battery, car, bike)
        </p>
      </div>

      {actionMsg && (
        <div className={`profit-alert ${actionMsgIsError ? "loss" : "gain"}`} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {actionMsg}
        </div>
      )}

      <div className="filter-row">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="ti ti-search"></i>
          <input placeholder="Search by customer, phone or quotation no..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {QUOTATION_STATUS_FILTERS.map(s => (
          <button key={s} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatusFilter(s)}>{s}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quotation No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
                    No quotations yet. Click <strong>New quotation</strong>, preview options, then <strong>Create Quotation</strong> on the chosen option.
                  </td>
                </tr>
              ) : (
                filtered.map((q) => {
                  const status = q.status || "Pending";
                  const isBusy = busyId === qtId(q);
                  return (
                    <tr key={qtId(q)}>
                      <td style={{ fontWeight: 600, color: "#6B21D8" }}>{q.quoteKey || q.id}</td>
                      <td style={{ color: "#6b7280" }}>{qtDate(q)}</td>
                      <td style={{ fontWeight: 500, color: "#111827" }}>{qtCustomer(q)}</td>
                      <td style={{ color: "#6b7280" }}>{qtPhone(q)}</td>
                      <td>
                        <span className={`badge ${quotationStatusClass(status)}`}>{status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={isBusy}
                          onClick={() => setDetailQt(q)}
                          title="View options, PDF, WhatsApp, invoice"
                        >
                          <i className="ti ti-eye"></i> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailQt && (
        <div className="modal-overlay" style={{ zIndex: 10040 }} onClick={() => setDetailQt(null)} role="presentation">
          <div
            className="modal"
            style={{ width: 960, maxWidth: "98vw", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <div className="modal-title">Quotation {detailQt.quoteKey || detailQt.id}</div>
                <div style={{ fontSize: 15, color: "#6b7280", marginTop: 4 }}>
                  {qtCustomer(detailQt)} · {qtPhone(detailQt)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditQt(detailQt)}>
                  Edit details
                </button>
                <button type="button" className="close-btn" onClick={() => setDetailQt(null)} aria-label="Close">
                  <i className="ti ti-x"></i>
                </button>
              </div>
            </div>
            <div className="modal-body scrollable" style={{ flex: 1, minHeight: 0 }}>
              <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 12 }}>
                Each row is one recommendation tier. PDF, WhatsApp, and invoice actions apply only to that tier.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Option</th>
                      <th>Battery</th>
                      <th>Inverter</th>
                      <th>Amount</th>
                      <th style={{ minWidth: 220 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expandQuotationOptionsForView(detailQt).map((opt) => {
                      const row = opt.selectedRow || opt;
                      const bat = row?.battery?.modelName || row?.batteryName || "—";
                      const inv = row?.inverter?.modelName || row?.inverterName || "—";
                      const amt = Number(opt.totalAmount ?? row?.totalPrice ?? row?.total ?? 0);
                      const oid = String(opt.id || "A");
                      const busy = detailBusy.startsWith(`${qtId(detailQt)}-${oid}`);
                      const canInv =
                        opt.approved || (detailQt.status || "Pending") === "Approved" || detailQt.status === "Converted";
                      return (
                        <tr key={oid}>
                          <td style={{ fontWeight: 600 }}>
                            {oid}: {opt.title || row?.optionLabel || row?.badge || "Option"}
                          </td>
                          <td style={{ fontSize: 15, color: "#374151" }}>{bat}</td>
                          <td style={{ fontSize: 15, color: "#374151" }}>{inv}</td>
                          <td style={{ fontWeight: 600 }}>₹{amt.toLocaleString("en-IN")}</td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                disabled={busy}
                                onClick={() => handleDetailPdf(detailQt, opt)}
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                disabled={busy}
                                onClick={() => handleDetailCreateTier(detailQt, opt)}
                              >
                                Create quotation
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                                style={{ background: "#16a34a", borderColor: "#16a34a" }}
                                onClick={() => handleDetailApproveSend(detailQt, opt)}
                              >
                                Approve &amp; Send
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={busy || !canInv}
                                style={{ background: canInv ? "#2563eb" : "#9ca3af" }}
                                onClick={() => handleConvertOption(detailQt, opt)}
                              >
                                Convert to invoice
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: "1px solid #e5e7eb",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 15, color: "#6b7280" }}>Whole document status:</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={busyId === qtId(detailQt) || Boolean(detailBusy)}
                  onClick={() => handleSetStatus(detailQt, "Approved")}
                >
                  Mark Approved
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={busyId === qtId(detailQt) || Boolean(detailBusy)}
                  onClick={() => handleSetStatus(detailQt, "Rejected")}
                >
                  Mark Rejected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <SmartQuotationModal
          key={newQuoteKind}
          initialQuotationKind={newQuoteKind}
          inventory={inventory}
          userBranchId={userBranchId}
          userBranchName={userBranchName}
          onClose={() => {
            setShowNew(false);
            refreshFinals();
          }}
          onQuotationCreated={handleQuotationCreated}
        />
      )}
      {viewSheet && (
        <SmartQuotationViewModal qt={viewSheet} onClose={() => setViewSheet(null)} />
      )}
      {editQt && (
        <QuotationEditModal
          quotation={editQt}
          onClose={() => setEditQt(null)}
          onSaved={() => refreshFinals()}
          onConvertToInvoice={
            (editQt.status || "Pending") === "Approved" ? () => handleConvertFromEdit(editQt) : undefined
          }
        />
      )}
      {invoiceConvert && (
        <InvoiceConversionModal
          quotation={invoiceConvert.quotation}
          selectedOption={invoiceConvert.selectedOption}
          quotationOptionId={invoiceConvert.quotationOptionId}
          onClose={() => setInvoiceConvert(null)}
          onGenerated={handleInvoiceGenerated}
        />
      )}
      {pdfPreviewModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 10050, background: "rgba(15, 23, 42, 0.65)" }}
          onClick={() => setPdfPreviewModal(null)}
          role="presentation"
        >
          <div
            className="modal"
            style={{ width: 920, maxWidth: "98vw", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div className="modal-title">{pdfPreviewModal.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a className="btn btn-sm btn-outline" href={pdfPreviewModal.url} target="_blank" rel="noreferrer">
                  Open in new tab
                </a>
                <button type="button" className="close-btn" onClick={() => setPdfPreviewModal(null)} aria-label="Close PDF preview">
                  <i className="ti ti-x"></i>
                </button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: 0, flex: 1, minHeight: "70vh", background: "#525659" }}>
              <iframe title="Quotation PDF preview" src={pdfPreviewModal.url} style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewQuotationModal({ inventory, onSave, onClose, existingCount }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ inventoryId: "", model: "", qty: 1, rate: 0 }]);

  const addItem = () => setItems(its => [...its, { inventoryId: "", model: "", qty: 1, rate: 0 }]);
  const removeItem = (i) => setItems(its => its.filter((_, idx) => idx !== i));
  const setItem = (i, key, val) => setItems(its => its.map((it, idx) => idx === i ? { ...it, [key]: val } : it));

  const selectBattery = (i, invId) => {
    const bat = inventory.find(b => b.id === Number(invId));
    if (bat) setItems(its => its.map((it, idx) => idx === i ? { ...it, inventoryId: bat.id, model: bat.model, rate: bat.sellRate } : it));
  };

  const total = items.reduce((a, it) => a + (Number(it.qty) * Number(it.rate)), 0);

  const handleSave = () => {
    const qt = {
      id: `QT-${String(existingCount + 1).padStart(3, "0")}`,
      customer, phone,
      date: new Date().toISOString().split("T")[0],
      items: items.map(it => ({ ...it, qty: Number(it.qty), rate: Number(it.rate) })),
      status: "Pending",
      total,
    };
    onSave(qt);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New Quotation</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input className="form-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" />
            </div>
          </div>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="form-label" style={{ marginBottom: 0 }}>Battery Items</div>
            <button className="btn btn-sm btn-outline" onClick={addItem}><i className="ti ti-plus"></i> Add Item</button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="item-row">
              <select className="form-select" style={{ flex: 2 }} value={it.inventoryId} onChange={e => selectBattery(i, e.target.value)}>
                <option value="">Select Battery...</option>
                {inventory.filter(b => b.quantity > 0).map(b => <option key={b.id} value={b.id}>{b.model} ({b.ah}Ah) — Qty:{b.quantity} — ₹{b.sellRate}</option>)}
              </select>
              <input className="form-input" type="number" value={it.qty} onChange={e => setItem(i, "qty", e.target.value)} style={{ width: 70 }} min="1" placeholder="Qty" />
              <input className="form-input" type="number" value={it.rate} onChange={e => setItem(i, "rate", e.target.value)} style={{ width: 100 }} placeholder="Rate" />
              <div style={{ fontSize: 16, color: "#374151", fontWeight: 600, minWidth: 70 }}>₹{(Number(it.qty) * Number(it.rate)).toLocaleString()}</div>
              {items.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}><i className="ti ti-trash"></i></button>}
            </div>
          ))}
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: 14, marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 17, color: "#6b7280" }}>Quotation Total</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>₹{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!customer || !phone || items.some(i => !i.inventoryId)}>Generate Quotation</button>
        </div>
      </div>
    </div>
  );
}

function QuotationViewModal({ qt, onClose, onConvert }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{qt.id} — {qt.customer}</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="invoice-preview">
            <div className="inv-header">
              <div>
                <div className="inv-shop-name">⚡ Sharma Battery Store</div>
                <div className="inv-shop-sub">Near Bus Stand, Pune · GST: 27XXXXX1234Z1</div>
                <div className="inv-shop-sub">Ph: 9876543210</div>
              </div>
              <div className="inv-meta">
                <div style={{ fontSize: 14, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Quotation</div>
                <div className="inv-id">{qt.id}</div>
                <div className="inv-date">Date: {qt.date}</div>
                <div className="inv-date">Valid for: 7 days</div>
              </div>
            </div>
            <div className="inv-bill-to">
              <div className="inv-bill-label">Quote To</div>
              <div className="inv-bill-name">{qt.customer}</div>
              <div style={{ fontSize: 15, color: "#666" }}>Ph: {qt.phone}</div>
            </div>
            <table className="inv-table">
              <thead><tr><th>#</th><th>Model</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>
                {qt.items.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{it.model}</td>
                    <td>{it.qty}</td>
                    <td>₹{it.rate.toLocaleString()}</td>
                    <td>₹{(it.qty * it.rate).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="inv-totals">
              <div className="inv-totals-box">
                <div className="inv-total-row"><span>Subtotal</span><span>₹{qt.total.toLocaleString()}</span></div>
                <div className="inv-total-row"><span>GST (18%)</span><span>₹{Math.round(qt.total * 0.18).toLocaleString()}</span></div>
                <div className="inv-total-row grand"><span>Total</span><span>₹{(qt.total + Math.round(qt.total * 0.18)).toLocaleString()}</span></div>
              </div>
            </div>
            <div style={{ marginTop: 24, fontSize: 14, color: "#999", textAlign: "center" }}>Thank you for your enquiry · Prices subject to change · T&C apply</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {qt.status === "Pending" && <button className="btn btn-primary" onClick={() => { onConvert(); onClose(); }}><i className="ti ti-receipt"></i> Convert to Invoice</button>}
        </div>
      </div>
    </div>
  );
}

function QuotationCompareModal({ qt, inventory, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Market Price Alert — {qt.id}</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 16 }}>
            Comparing your quotation prices for <strong style={{ color: "#374151" }}>{qt.customer}</strong> against live market prices:
          </div>
          {qt.items.map((it, i) => {
            const marketPrices = MARKET_PRICES[it.model] || [];
            const avg = marketPrices.length ? (marketPrices.reduce((a, b) => a + b.price, 0) / marketPrices.length) : it.rate;
            const diff = it.rate - avg;
            return (
              <div key={i} className="comparison-card">
                <div className="comparison-title">{it.model}</div>
                <div className="comparison-row" style={{ marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>Your quoted price</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#0ea5e9" }}>₹{it.rate.toLocaleString()}</span>
                </div>
                {marketPrices.map((mp, j) => (
                  <div key={j} className="comparison-row">
                    <span className="comparison-source"><i className="ti ti-world" style={{ marginRight: 4, fontSize: 16, verticalAlign: "-2px" }}></i>{mp.source}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, color: "#374151" }}>₹{mp.price.toLocaleString()}</span>
                      <span className={`badge ${it.rate < mp.price ? "badge-green" : "badge-red"}`}>
                        {it.rate < mp.price ? `₹${mp.price - it.rate} cheaper` : `₹${it.rate - mp.price} more`}
                      </span>
                    </div>
                  </div>
                ))}
                {marketPrices.length > 0 && (
                  <div className={`profit-alert ${diff < 0 ? "gain" : "loss"}`} style={{ marginTop: 10, fontSize: 15 }}>
                    <i className={`ti ${diff < 0 ? "ti-thumb-up" : "ti-alert-circle"}`} style={{ marginRight: 6 }}></i>
                    {diff < 0 ? `Your price is ₹${Math.abs(diff).toFixed(0)} below market avg — great competitive pricing!` : `Your price is ₹${Math.abs(diff).toFixed(0)} above market average.`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Invoices({ invoices, setInvoices, inventory, modal, setModal }) {
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [viewInv, setViewInv] = useState(null);
  // Read-only authoritative list straight from the Invoice collection
  // (all branches for superAdmin). This shows every tax invoice — including
  // directly-created / demo ones — without touching the legacy auto-sync state.
  const [serverInvoices, setServerInvoices] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.invoices.list();
        if (!cancelled && Array.isArray(list)) setServerInvoices(list);
      } catch (e) {
        console.warn("Invoice list load failed:", e.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Merge server invoices with any local (unsynced) ones, de-duped by invoice id.
  const mergedById = new Map();
  for (const inv of [...serverInvoices, ...(invoices || [])].map(mapInvoiceRow)) {
    const key = inv.id || inv.invoiceNumber;
    if (!mergedById.has(key)) mergedById.set(key, inv);
  }
  const rows = [...mergedById.values()].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const filtered = rows.filter((inv) => {
    const name = String(inv.customer || "").toLowerCase();
    const id = String(inv.id || "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  const totalRevenue = rows.reduce((a, b) => a + Number(b.subtotal || 0), 0);
  const totalGST = rows.reduce((a, b) => a + Number(b.gst || 0), 0);
  const unpaid = rows.filter((i) => !i.paid).length;

  const markInvoicePaid = async (inv) => {
    // Optimistic update on both local + server-sourced lists.
    const matches = (i) => (i.invoiceNumber || i.id) === inv.id;
    setInvoices((invs) => invs.map((i) => (matches(i) ? { ...i, paid: true, paymentStatus: "Paid", status: "Paid" } : i)));
    setServerInvoices((invs) => invs.map((i) => (matches(i) ? { ...i, paid: true, paymentStatus: "Paid", status: "Paid" } : i)));
    try {
      await api.invoices.update(inv.id, { paymentStatus: "Paid" });
    } catch (e) {
      console.warn("Mark paid failed to persist:", e.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tax Invoices</div>
          <div className="page-sub">Stage 3 · Final billing · GST · Print &amp; WhatsApp</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}><i className="ti ti-plus"></i> New Invoice</button>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard label="Total Revenue" value={`₹${(totalRevenue / 1000).toFixed(1)}K`} sub="excl. GST" icon="ti-currency-rupee" color="#10b981" />
        <StatCard label="GST Collected" value={`₹${totalGST.toLocaleString()}`} sub="18% GST" icon="ti-receipt" color="#0ea5e9" />
        <StatCard label="Unpaid Invoices" value={unpaid} sub="pending payment" icon="ti-alert-circle" color="#ef4444" />
      </div>

      <div className="filter-row">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="ti ti-search"></i>
          <input placeholder="Search by customer or invoice ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice ID</th><th>Customer</th><th>Phone</th><th>Date</th><th>Items</th><th>Subtotal</th><th>GST</th><th>Total</th><th>PDF</th><th>Doc Status</th><th>Payment</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: "#6B21D8" }}>{inv.id}</td>
                  <td style={{ fontWeight: 500, color: "#111827" }}>{inv.customer || "—"}</td>
                  <td style={{ color: "#6b7280" }}>{inv.phone || "—"}</td>
                  <td style={{ color: "#6b7280" }}>{inv.date}</td>
                  <td style={{ color: "#6b7280" }}>{inv.items?.length ?? 0}</td>
                  <td style={{ color: "#374151" }}>₹{Number(inv.subtotal || 0).toLocaleString("en-IN")}</td>
                  <td style={{ color: "#6b7280" }}>₹{Number(inv.gst || 0).toLocaleString("en-IN")}</td>
                  <td style={{ fontWeight: 700, color: "#111827" }}>₹{Number(inv.total || 0).toLocaleString("en-IN")}</td>
                  <td>
                    {pdfHref(inv.pdfUrl) ? (
                      <a className="btn btn-sm btn-outline" href={pdfHref(inv.pdfUrl)} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : (
                      <span style={{ color: "#9ca3af", fontSize: 15 }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${inv.paid ? "badge-green" : "badge-blue"}`}>{inv.status || (inv.paid ? "Paid" : "Generated")}</span>
                  </td>
                  <td>
                    <span className={`badge ${inv.paid ? "badge-green" : "badge-red"}`}>{inv.paid ? "Paid" : "Unpaid"}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setViewInv(inv)}><i className="ti ti-eye"></i></button>
                      {!inv.paid && <button className="btn btn-sm btn-primary" onClick={() => markInvoicePaid(inv)}>Mark Paid</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewInvoiceModal inventory={inventory} onSave={(inv) => { setInvoices(invs => [...invs, inv]); setShowNew(false); }} onClose={() => setShowNew(false)} existingCount={invoices.length} />}
      {viewInv && <InvoiceViewModal inv={viewInv} onClose={() => setViewInv(null)} />}
    </div>
  );
}

/** VA / AH accessors that tolerate the various inventory field names. */
function invVA(b = {}) {
  return Number(b.inverterVA ?? b.va ?? b.VA ?? 0) || 0;
}
function invAH(b = {}) {
  return Number(b.batteryAH ?? b.ah ?? b.capacityAh ?? b.AH ?? 0) || 0;
}
function invQty(b = {}) {
  return Number(b.quantity ?? b.qty ?? 0) || 0;
}
function invSellRate(b = {}) {
  return Number(b.sellRate ?? b.sellingRate ?? b.newRateWithOB ?? b.mrp ?? 0) || 0;
}
function invModelName(b = {}) {
  return b.model ?? b.modelName ?? "Item";
}

/**
 * Suggest in-stock batteries closest to a required VA / AH.
 * Items that meet-or-exceed the requirement are preferred (never under-spec);
 * within that, the closest (smallest over-spec) wins.
 */
function suggestInStockBatteries(inventory = [], { va = 0, ah = 0 } = {}, limit = 5) {
  const reqVa = Number(va) || 0;
  const reqAh = Number(ah) || 0;
  if (!reqVa && !reqAh) return [];
  const UNDER = 1_000_000; // heavy penalty so under-spec items rank last
  return (inventory || [])
    .filter((b) => invQty(b) > 0 && (invVA(b) > 0 || invAH(b) > 0))
    .map((b) => {
      const v = invVA(b);
      const a = invAH(b);
      let score = 0;
      if (reqVa) score += Math.abs(v - reqVa) + (v >= reqVa ? 0 : UNDER);
      if (reqAh) score += Math.abs(a - reqAh) + (a >= reqAh ? 0 : UNDER);
      return { battery: b, score, va: v, ah: a, meets: (!reqVa || v >= reqVa) && (!reqAh || a >= reqAh) };
    })
    .sort((x, y) => x.score - y.score)
    .slice(0, limit);
}

function NewInvoiceModal({ inventory, onSave, onClose, existingCount }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState([{ inventoryId: "", model: "", qty: 1, rate: 0, amount: 0 }]);
  // Optional load target used to suggest a nearby in-stock battery.
  const [reqVA, setReqVA] = useState("");
  const [reqAH, setReqAH] = useState("");

  const suggestions = useMemo(
    () => suggestInStockBatteries(inventory, { va: reqVA, ah: reqAH }),
    [inventory, reqVA, reqAH],
  );

  const addItem = () => setItems(its => [...its, { inventoryId: "", model: "", qty: 1, rate: 0, amount: 0 }]);
  const removeItem = (i) => setItems(its => its.filter((_, idx) => idx !== i));

  const applyBattery = (i, bat) => {
    if (!bat) return;
    setItems(its => its.map((it, idx) => idx === i
      ? { ...it, inventoryId: bat.id, model: invModelName(bat), rate: invSellRate(bat), amount: invSellRate(bat) * Number(it.qty || 1) }
      : it));
  };

  const selectBattery = (i, invId) => {
    // Match on string so both numeric (legacy) and string (category) IDs work.
    const bat = inventory.find(b => String(b.id) === String(invId));
    applyBattery(i, bat);
  };

  /** Append a new line item pre-filled from a suggested battery. */
  const addSuggested = (bat) => {
    setItems(its => [...its, { inventoryId: bat.id, model: invModelName(bat), qty: 1, rate: invSellRate(bat), amount: invSellRate(bat) }]);
  };

  const setItemField = (i, key, val) => {
    setItems(its => its.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [key]: val };
      updated.amount = Number(updated.qty) * Number(updated.rate);
      return updated;
    }));
  };

  const subtotal = items.reduce((a, it) => a + (Number(it.qty) * Number(it.rate)), 0);
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const handleSave = () => {
    const inv = {
      id: genId("INV"),
      customer, phone, address,
      date: new Date().toISOString().split("T")[0],
      items: items.map(it => ({ ...it, qty: Number(it.qty), rate: Number(it.rate), amount: Number(it.qty) * Number(it.rate) })),
      subtotal, gst, total, paid: false,
    };
    onSave(inv);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New Invoice</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input className="form-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address (optional)</label>
            <input className="form-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Customer address" />
          </div>
          {/* Find a nearby in-stock battery by required load (VA / AH). */}
          <div className="comparison-card" style={{ marginBottom: 14 }}>
            <div className="comparison-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-bolt"></i> Find battery by load (in-stock matches)
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="form-input" type="number" value={reqVA} onChange={e => setReqVA(e.target.value)} style={{ width: 130 }} placeholder="Required VA" />
              <input className="form-input" type="number" value={reqAH} onChange={e => setReqAH(e.target.value)} style={{ width: 130 }} placeholder="Required AH" />
              <span style={{ fontSize: 15, color: "#6b7280" }}>Suggests closest stock matching or exceeding the load.</span>
            </div>
            {(reqVA || reqAH) && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.length === 0 && <div style={{ fontSize: 15, color: "#dc2626" }}>No in-stock batteries match this load.</div>}
                {suggestions.map((s) => (
                  <div key={s.battery.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
                    <span className={`badge ${s.meets ? "badge-green" : "badge-yellow"}`}>{s.meets ? "Fits" : "Under-spec"}</span>
                    <span style={{ fontWeight: 600, color: "#111827", flex: 1 }}>{invModelName(s.battery)}</span>
                    <span style={{ color: "#6b7280" }}>{s.va || "—"} VA · {s.ah || "—"} AH · Qty {invQty(s.battery)} · ₹{invSellRate(s.battery).toLocaleString("en-IN")}</span>
                    <button className="btn btn-sm btn-outline" onClick={() => addSuggested(s.battery)}><i className="ti ti-plus"></i> Add</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="form-label" style={{ marginBottom: 0 }}>Battery Items</div>
            <button className="btn btn-sm btn-outline" onClick={addItem}><i className="ti ti-plus"></i> Add Item</button>
          </div>
          {items.map((it, i) => {
            const selected = inventory.find(b => String(b.id) === String(it.inventoryId));
            const outOfStock = selected && invQty(selected) <= 0;
            const alt = outOfStock ? suggestInStockBatteries(inventory, { va: invVA(selected), ah: invAH(selected) }, 1)[0] : null;
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div className="item-row" style={{ marginBottom: 0 }}>
                  <select className="form-select" style={{ flex: 2 }} value={it.inventoryId} onChange={e => selectBattery(i, e.target.value)}>
                    <option value="">Select Battery...</option>
                    {inventory.map(b => (
                      <option key={b.id} value={b.id}>
                        {invModelName(b)} · {invVA(b) || "—"}VA/{invAH(b) || "—"}AH · {invQty(b) > 0 ? `Qty ${invQty(b)}` : "OUT OF STOCK"} — ₹{invSellRate(b)}
                      </option>
                    ))}
                  </select>
                  <input className="form-input" value={it.model} onChange={e => setItemField(i, "model", e.target.value)} style={{ flex: 1, minWidth: 90 }} placeholder="Model / description" />
                  <input className="form-input" type="number" value={it.qty} min="1" onChange={e => setItemField(i, "qty", e.target.value)} style={{ width: 60 }} placeholder="Qty" />
                  <input className="form-input" type="number" value={it.rate} onChange={e => setItemField(i, "rate", e.target.value)} style={{ width: 90 }} placeholder="Rate" />
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", minWidth: 80 }}>₹{(Number(it.qty) * Number(it.rate)).toLocaleString()}</div>
                  {items.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}><i className="ti ti-trash"></i></button>}
                </div>
                {outOfStock && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 15 }}>
                    <span className="badge badge-red">Out of stock</span>
                    {alt ? (
                      <>
                        <span style={{ color: "#6b7280" }}>
                          Suggested: <strong>{invModelName(alt.battery)}</strong> ({alt.va || "—"}VA/{alt.ah || "—"}AH · Qty {invQty(alt.battery)})
                        </span>
                        <button className="btn btn-sm btn-outline" onClick={() => applyBattery(i, alt.battery)}>Use this</button>
                      </>
                    ) : (
                      <span style={{ color: "#dc2626" }}>No in-stock alternative found.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: 16, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 16, color: "#6b7280" }}>
              <span>Subtotal</span><span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 16, color: "#6b7280" }}>
              <span>GST (18%)</span><span>₹{gst.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 5px", fontSize: 22, fontWeight: 700, color: "#111827", borderTop: "1px solid #e5e7eb", marginTop: 5 }}>
              <span>Total</span><span>₹{total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!customer || !phone || items.some(i => !(i.inventoryId || (String(i.model || "").trim() && Number(i.rate) > 0)))}>
            <i className="ti ti-receipt"></i> Generate Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceViewModal({ inv, onClose }) {
  const row = mapInvoiceRow(inv);
  const pdf = pdfHref(row.pdfUrl);
  return (
    <div className="modal-overlay invoice-modal-print">
      <div className="modal" style={{ width: "min(920px, 96vw)" }}>
        <div className="modal-header no-print">
          <div className="modal-title">{row.id}</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body scrollable" style={{ maxHeight: "75vh", background: "#f3f4f6", padding: 16 }}>
          <PrintableInvoiceDocument invoice={row} />
        </div>
        <div className="modal-footer no-print">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {pdf && (
            <a className="btn btn-outline" href={pdf} target="_blank" rel="noreferrer">
              <i className="ti ti-file-download"></i> Download PDF (A4)
            </a>
          )}
          <button className="btn btn-primary" onClick={() => printInvoiceElement("invoice-print-area")}>
            <i className="ti ti-printer"></i> Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
