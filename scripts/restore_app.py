from pathlib import Path
import re

path = Path(__file__).resolve().parent.parent / "src" / "App.jsx"
text = path.read_text(encoding="utf-8")

# 1. Imports
text = text.replace(
    'import { useState, useEffect, useRef } from "react";',
    '''import { useState, useEffect, useRef, useCallback } from "react";
import { api, isApiAvailable, loadFromApi } from "./api/client.js";
import { parseBatteryExcelFile, mergeBatteriesIntoInventory } from "./utils/excelParser.js";
import { PurchaseAndSales } from "./purchaseSales.jsx";
import { css } from "./appStyles.js";''',
)

# 2. Remove inline css block
text = re.sub(r"\nconst css = `[\s\S]*?`;\n", "\n", text, count=1)

# 3. Add purchases/sales after INITIAL_INVOICES
if "INITIAL_PURCHASES" not in text:
    insert = '''
const INITIAL_PURCHASES = [
  { id: "PUR-001", billDetails: "Invoice from Exide Dist.", billNo: "EX-9920", supplier: "Exide Dist.", place: "Pune", date: "2025-01-05", items: [{ model: "Exide FFS0-EXPLAQ60", qty: 10, purchaseRate: 3200, sellRate: 4200 }], total: 32000 },
];
const INITIAL_SALES = [];
'''
    text = text.replace(
        "const INITIAL_INVOICES = [",
        insert + "\nconst INITIAL_INVOICES = [",
    )

# 4. NAV_ITEMS
text = text.replace(
    """const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
  { id: "inventory", label: "Inventory", icon: "ti-box" },
  { id: "quotations", label: "Quotations", icon: "ti-file-text" },
  { id: "invoices", label: "Invoices", icon: "ti-receipt" },
];""",
    """const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
  { id: "inventory", label: "Inventory", icon: "ti-box" },
  { id: "purchases", label: "Purchase & Sales", icon: "ti-shopping-cart" },
  { id: "quotations", label: "Quotations", icon: "ti-file-text" },
  { id: "invoices", label: "Invoices", icon: "ti-receipt" },
];""",
)

# 5. Replace App component
old_app = re.search(
    r"export default function App\(\) \{[\s\S]*?\n\}\n\nfunction Dashboard",
    text,
)
if old_app:
    new_app = '''export default function App() {
  const [page, setPage] = useState("dashboard");
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [purchases, setPurchases] = useState(INITIAL_PURCHASES);
  const [sales, setSales] = useState(INITIAL_SALES);
  const [quotations, setQuotations] = useState(INITIAL_QUOTATIONS);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [modal, setModal] = useState(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const ok = await isApiAvailable();
      setApiOnline(ok);
      if (!ok) return;
      try {
        const data = await loadFromApi();
        if (data.inventory?.length) setInventory(data.inventory);
        if (data.purchases) setPurchases(data.purchases);
        if (data.sales) setSales(data.sales);
        if (data.quotations?.length) setQuotations(data.quotations);
        if (data.invoices?.length) setInvoices(data.invoices);
      } catch (e) {
        console.warn("Load from API failed:", e.message);
      }
    })();
  }, []);

  const persistToApi = useCallback(async (payload) => {
    if (!apiOnline) return;
    try {
      await api.saveAll(payload);
    } catch (e) {
      console.warn("Save to API failed:", e.message);
    }
  }, [apiOnline]);

  useEffect(() => {
    if (!apiOnline) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistToApi({ inventory, purchases, sales, quotations, invoices });
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [inventory, purchases, sales, quotations, invoices, apiOnline, persistToApi]);

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
            {NAV_ITEMS.map(n => (
              <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                <i className={`ti ${n.icon}`}></i>
                {n.label}
              </div>
            ))}
          </nav>
          <div style={{ padding: "16px", borderTop: "1px solid #e5e7eb" }}>
            <div className={`api-badge ${apiOnline ? "online" : "offline"}`}>
              <i className={`ti ${apiOnline ? "ti-plug-connected" : "ti-plug-off"}`}></i>
              {apiOnline ? "API connected" : "Offline mode"}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Shop Info</div>
            <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>Sharma Battery Store</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Pune, Maharashtra</div>
          </div>
        </aside>

        <main className="main">
          {page === "dashboard" && <Dashboard inventory={inventory} quotations={quotations} invoices={invoices} setPage={setPage} />}
          {page === "inventory" && <Inventory inventory={inventory} setInventory={setInventory} apiOnline={apiOnline} modal={modal} setModal={setModal} />}
          {page === "purchases" && <PurchaseAndSales purchases={purchases} setPurchases={setPurchases} sales={sales} setSales={setSales} inventory={inventory} setInventory={setInventory} />}
          {page === "quotations" && <Quotations quotations={quotations} setQuotations={setQuotations} inventory={inventory} invoices={invoices} setInvoices={setInvoices} modal={modal} setModal={setModal} />}
          {page === "invoices" && <Invoices invoices={invoices} setInvoices={setInvoices} inventory={inventory} modal={modal} setModal={setModal} />}
        </main>
      </div>
    </>
  );
}

function Dashboard'''
    text = text[: old_app.start()] + new_app + text[old_app.end() - len("function Dashboard") :]

# 6. Light theme inline colors
replacements = {
    "#1e2130": "#e5e7eb",
    "#5a6080": "#6b7280",
    "#c8ccdd": "#374151",
    "#e8e9ed": "#111827",
    "#0f1117": "#f9fafb",
    "#4d9fff": "#0ea5e9",
    "#3dda84": "#10b981",
    "#ff6b6b": "#ef4444",
    "#8891b0": "#6b7280",
    "#3a1010": "#fee2e2",
    "#ffc107": "#d97706",
    'color: "#fff"': 'color: "#111827"',
}
for old, new in replacements.items():
    text = text.replace(old, new)

# 7. Inventory - add excel upload
if "parseBatteryExcelFile" not in text.split("function Inventory")[1][:2000]:
    text = text.replace(
        "function Inventory({ inventory, setInventory, modal, setModal }) {",
        "function Inventory({ inventory, setInventory, apiOnline, modal, setModal }) {",
    )
    excel_state = '''
  const fileRef = useRef(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleExcel = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const { batteries, errors } = await parseBatteryExcelFile(file);
      if (!batteries.length) {
        setUploadMsg(errors?.[0] || "No rows found in Excel");
        return;
      }
      setInventory((inv) => mergeBatteriesIntoInventory(inv, batteries));
      setUploadMsg(`Added/updated ${batteries.length} items` + (errors?.length ? ` (${errors.length} warnings)` : ""));
    } catch (e) {
      setUploadMsg(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };
'''
    text = text.replace(
        '  const types = ["All", "Car", "Bike", "Inverter", "Truck"];',
        excel_state + '\n  const types = ["All", "Car", "Bike", "Inverter", "Truck"];',
    )
    text = text.replace(
        """        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="ti ti-plus"></i> Add Battery</button>
      </div>

      <div className="filter-row">""",
        """        <div style={{ display: "flex", gap: 8 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => handleExcel(e.target.files?.[0])} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <i className="ti ti-upload"></i> {uploading ? "Uploading..." : "Upload Excel"}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="ti ti-plus"></i> Add Battery</button>
        </div>
      </div>

      {uploadMsg && <div style={{ marginBottom: 12, fontSize: 13, color: uploadMsg.includes("Added") ? "#059669" : "#dc2626" }}>{uploadMsg}</div>}

      <div
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleExcel(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <i className="ti ti-file-spreadsheet" style={{ fontSize: 28, color: "#0ea5e9" }}></i>
        <div style={{ marginTop: 8, fontWeight: 500 }}>Drop Excel here or click to upload batteries</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Columns: Model, Brand, Type, Ah, Quantity, Purchase Rate, Sell Rate</div>
      </div>

      <div className="filter-row">""",
    )
# 8. Quotations - filter in-stock only
text = text.replace(
    "{inventory.map(b => <option key={b.id} value={b.id}>{b.model} ({b.ah}Ah) — ₹{b.sellRate}</option>)}",
    "{inventory.filter(b => b.quantity > 0).map(b => <option key={b.id} value={b.id}>{b.model} ({b.ah}Ah) — Qty:{b.quantity} — ₹{b.sellRate}</option>)}",
)

# Fix any stray motion tags
text = re.sub(r"</?motion\b", lambda m: m.group(0).replace("motion", "div"), text)

path.write_text(text, encoding="utf-8")
print("App.jsx restored")
