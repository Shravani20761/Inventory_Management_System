import { useState, useEffect, useRef } from "react";

const INITIAL_INVENTORY = [
  { id: 1, model: "Exide FFS0-EXPLAQ60", brand: "Exide", type: "Car", ah: 60, purchaseRate: 3200, sellRate: 4200, quantity: 8, invoiceNo: "PUR-001", supplier: "Exide Dist." },
  { id: 2, model: "Amaron BL-600LBH", brand: "Amaron", type: "Car", ah: 60, purchaseRate: 3500, sellRate: 4600, quantity: 5, invoiceNo: "PUR-002", supplier: "Amaron Dealer" },
  { id: 3, model: "Exide FFS0-EXPLAQ75", brand: "Exide", type: "Car", ah: 75, purchaseRate: 4100, sellRate: 5400, quantity: 6, invoiceNo: "PUR-001", supplier: "Exide Dist." },
  { id: 4, model: "SF Sonic Flash-Start FS1440", brand: "SF Sonic", type: "Car", ah: 44, purchaseRate: 2400, sellRate: 3200, quantity: 12, invoiceNo: "PUR-003", supplier: "SF Sonic Dist." },
  { id: 5, model: "Amaron BL-550LBH", brand: "Amaron", type: "Car", ah: 55, purchaseRate: 3000, sellRate: 3900, quantity: 9, invoiceNo: "PUR-002", supplier: "Amaron Dealer" },
  { id: 6, model: "Exide Biker EBR5-2.5L", brand: "Exide", type: "Bike", ah: 2.5, purchaseRate: 650, sellRate: 950, quantity: 20, invoiceNo: "PUR-004", supplier: "Exide Dist." },
  { id: 7, model: "Amaron Pro Bike Rider ABR-PR2.5LBH", brand: "Amaron", type: "Bike", ah: 2.5, purchaseRate: 700, sellRate: 1000, quantity: 15, invoiceNo: "PUR-005", supplier: "Amaron Dealer" },
  { id: 8, model: "Exide Inva Tubular IT500", brand: "Exide", type: "Inverter", ah: 150, purchaseRate: 8200, sellRate: 10500, quantity: 4, invoiceNo: "PUR-006", supplier: "Exide Dist." },
  { id: 9, model: "Luminous Red Charge RC 18000", brand: "Luminous", type: "Inverter", ah: 150, purchaseRate: 8500, sellRate: 11000, quantity: 3, invoiceNo: "PUR-007", supplier: "Luminous Dealer" },
  { id: 10, model: "SF Sonic Jumbo FJ1000", brand: "SF Sonic", type: "Truck", ah: 100, purchaseRate: 7000, sellRate: 9200, quantity: 3, invoiceNo: "PUR-003", supplier: "SF Sonic Dist." },
];

const INITIAL_QUOTATIONS = [
  { id: "QT-001", customer: "Rahul Sharma", phone: "9876543210", date: "2025-01-10", items: [{ inventoryId: 1, model: "Exide FFS0-EXPLAQ60", qty: 1, rate: 4200 }], status: "Pending", total: 4200 },
  { id: "QT-002", customer: "Priya Mehta", phone: "9765432109", date: "2025-01-11", items: [{ inventoryId: 2, model: "Amaron BL-600LBH", qty: 2, rate: 4600 }], status: "Converted", total: 9200 },
  { id: "QT-003", customer: "Suresh Patel", phone: "9654321098", date: "2025-01-12", items: [{ inventoryId: 3, model: "Exide FFS0-EXPLAQ75", qty: 1, rate: 5400 }, { inventoryId: 7, model: "Amaron Pro Bike Rider ABR-PR2.5LBH", qty: 1, rate: 1000 }], status: "Pending", total: 6400 },
  { id: "QT-004", customer: "Anita Desai", phone: "9543210987", date: "2025-01-13", items: [{ inventoryId: 8, model: "Exide Inva Tubular IT500", qty: 1, rate: 10500 }], status: "Rejected", total: 10500 },
  { id: "QT-005", customer: "Vikram Singh", phone: "9432109876", date: "2025-01-14", items: [{ inventoryId: 5, model: "Amaron BL-550LBH", qty: 3, rate: 3900 }], status: "Pending", total: 11700 },
  { id: "QT-006", customer: "Deepa Nair", phone: "9321098765", date: "2025-01-15", items: [{ inventoryId: 9, model: "Luminous Red Charge RC 18000", qty: 1, rate: 11000 }], status: "Converted", total: 11000 },
];

const INITIAL_INVOICES = [
  { id: "INV-001", customer: "Priya Mehta", phone: "9765432109", date: "2025-01-11", quotationId: "QT-002", items: [{ model: "Amaron BL-600LBH", qty: 2, rate: 4600, amount: 9200 }], subtotal: 9200, gst: 1656, total: 10856, paid: true },
  { id: "INV-002", customer: "Deepa Nair", phone: "9321098765", date: "2025-01-15", quotationId: "QT-006", items: [{ model: "Luminous Red Charge RC 18000", qty: 1, rate: 11000, amount: 11000 }], subtotal: 11000, gst: 1980, total: 12980, paid: false },
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
  { id: "inventory", label: "Inventory", icon: "ti-box" },
  { id: "quotations", label: "Quotations", icon: "ti-file-text" },
  { id: "invoices", label: "Invoices", icon: "ti-receipt" },
];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #0f1117; color: #e8e9ed; min-height: 100vh; }
  .app { display: flex; min-height: 100vh; }
  .sidebar { width: 240px; background: #16181f; border-right: 1px solid #1e2130; display: flex; flex-direction: column; position: fixed; height: 100vh; z-index: 100; }
  .sidebar-logo { padding: 24px 20px 20px; border-bottom: 1px solid #1e2130; }
  .logo-text { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; color: #fff; }
  .logo-sub { font-size: 11px; color: #5a6080; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }
  .nav { padding: 16px 12px; flex: 1; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #8891b0; transition: all 0.15s; margin-bottom: 2px; }
  .nav-item:hover { background: #1e2130; color: #c8ccdd; }
  .nav-item.active { background: #1a2a4a; color: #4d9fff; }
  .nav-item i { font-size: 18px; }
  .main { margin-left: 240px; flex: 1; padding: 28px 32px; min-height: 100vh; }
  .page-header { margin-bottom: 28px; display: flex; align-items: center; justify-content: space-between; }
  .page-title { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; color: #fff; }
  .page-sub { font-size: 13px; color: #5a6080; margin-top: 4px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: #4d9fff; color: #fff; }
  .btn-primary:hover { background: #3a8ef0; }
  .btn-secondary { background: #1e2130; color: #c8ccdd; border: 1px solid #2a2f45; }
  .btn-secondary:hover { background: #252b3f; }
  .btn-danger { background: #ff4d4d; color: #fff; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-outline { background: transparent; color: #4d9fff; border: 1px solid #4d9fff; }
  .btn-outline:hover { background: #1a2a4a; }
  .card { background: #16181f; border: 1px solid #1e2130; border-radius: 12px; padding: 20px; }
  .stat-card { background: #16181f; border: 1px solid #1e2130; border-radius: 12px; padding: 20px; }
  .stat-label { font-size: 12px; color: #5a6080; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: #fff; }
  .stat-change { font-size: 12px; margin-top: 6px; }
  .stat-change.up { color: #3dda84; }
  .stat-change.down { color: #ff6b6b; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 14px; color: #5a6080; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #1e2130; }
  td { padding: 12px 14px; border-bottom: 1px solid #12141a; color: #c8ccdd; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1a1c24; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #0d3320; color: #3dda84; }
  .badge-red { background: #3a1010; color: #ff6b6b; }
  .badge-yellow { background: #3a2800; color: #ffc107; }
  .badge-blue { background: #0a1f3a; color: #4d9fff; }
  .badge-gray { background: #1e2130; color: #8891b0; }
  .profit-alert { padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; margin-top: 6px; }
  .profit-alert.gain { background: #0d3320; color: #3dda84; border: 1px solid #1a5535; }
  .profit-alert.loss { background: #3a1010; color: #ff6b6b; border: 1px solid #5a1a1a; }
  .form-group { margin-bottom: 16px; }
  .form-label { font-size: 12px; color: #8891b0; margin-bottom: 6px; display: block; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .form-input { width: 100%; background: #0f1117; border: 1px solid #1e2130; border-radius: 8px; padding: 9px 12px; color: #e8e9ed; font-size: 14px; outline: none; transition: border 0.15s; }
  .form-input:focus { border-color: #4d9fff; }
  .form-select { width: 100%; background: #0f1117; border: 1px solid #1e2130; border-radius: 8px; padding: 9px 12px; color: #e8e9ed; font-size: 14px; outline: none; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .modal { background: #16181f; border: 1px solid #1e2130; border-radius: 16px; width: 680px; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #1e2130; }
  .modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; color: #fff; }
  .modal-body { padding: 24px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid #1e2130; display: flex; gap: 10px; justify-content: flex-end; }
  .close-btn { background: #1e2130; border: none; color: #8891b0; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .section-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 16px; }
  .invoice-preview { background: #fff; color: #111; border-radius: 12px; padding: 40px; font-family: 'DM Sans', sans-serif; }
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .inv-shop-name { font-size: 22px; font-weight: 700; color: #111; }
  .inv-shop-sub { font-size: 12px; color: #666; margin-top: 2px; }
  .inv-meta { text-align: right; }
  .inv-id { font-size: 20px; font-weight: 700; color: #111; }
  .inv-date { font-size: 12px; color: #666; margin-top: 4px; }
  .inv-bill-to { background: #f5f5f5; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
  .inv-bill-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .inv-bill-name { font-size: 15px; font-weight: 600; color: #111; }
  .inv-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
  .inv-table th { background: #111; color: #fff; padding: 10px 12px; text-align: left; }
  .inv-table td { padding: 10px 12px; border-bottom: 1px solid #eee; color: #333; }
  .inv-totals { display: flex; justify-content: flex-end; }
  .inv-totals-box { width: 220px; }
  .inv-total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #444; }
  .inv-total-row.grand { font-weight: 700; font-size: 16px; color: #111; border-top: 2px solid #111; padding-top: 10px; margin-top: 6px; }
  .search-bar { display: flex; align-items: center; gap: 10px; background: #16181f; border: 1px solid #1e2130; border-radius: 8px; padding: 0 12px; }
  .search-bar i { color: #5a6080; font-size: 16px; }
  .search-bar input { background: none; border: none; outline: none; color: #e8e9ed; font-size: 14px; padding: 9px 0; flex: 1; }
  .filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .tabs { display: flex; gap: 4px; background: #0f1117; border-radius: 10px; padding: 4px; margin-bottom: 20px; }
  .tab { padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; color: #5a6080; transition: all 0.15s; }
  .tab.active { background: #1e2130; color: #fff; }
  .comparison-card { background: #0f1117; border: 1px solid #1e2130; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .comparison-title { font-size: 13px; font-weight: 600; color: #c8ccdd; margin-bottom: 10px; }
  .comparison-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 4px 0; }
  .comparison-source { color: #8891b0; }
  .comparison-price { font-weight: 600; }
  .comparison-price.cheaper { color: #3dda84; }
  .comparison-price.expensive { color: #ff6b6b; }
  .comparison-price.same { color: #ffc107; }
  .item-row { display: flex; align-items: center; gap: 10px; padding: 10px; background: #0f1117; border-radius: 8px; margin-bottom: 8px; }
  .scrollable { max-height: 320px; overflow-y: auto; }
  .empty-state { text-align: center; padding: 40px; color: #5a6080; }
  .empty-state i { font-size: 40px; margin-bottom: 12px; display: block; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e2130; border-radius: 4px; }
`;

const genId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}`;

const MARKET_PRICES = {
  "Exide FFS0-EXPLAQ60": [{ source: "BatteryBhai.com", price: 4350 }, { source: "BigBasket Auto", price: 4280 }, { source: "Amazon", price: 4450 }],
  "Amaron BL-600LBH": [{ source: "BatteryBhai.com", price: 4750 }, { source: "Amazon", price: 4800 }, { source: "Flipkart", price: 4700 }],
  "Exide FFS0-EXPLAQ75": [{ source: "BatteryBhai.com", price: 5600 }, { source: "Amazon", price: 5500 }, { source: "BigBasket Auto", price: 5450 }],
  "SF Sonic Flash-Start FS1440": [{ source: "BatteryBhai.com", price: 3100 }, { source: "Amazon", price: 3250 }, { source: "Flipkart", price: 3180 }],
  "Amaron BL-550LBH": [{ source: "BatteryBhai.com", price: 4000 }, { source: "Flipkart", price: 3950 }, { source: "Amazon", price: 4050 }],
  "Exide Inva Tubular IT500": [{ source: "BatteryBhai.com", price: 10800 }, { source: "Amazon", price: 10600 }, { source: "Flipkart", price: 10900 }],
  "Luminous Red Charge RC 18000": [{ source: "BatteryBhai.com", price: 11200 }, { source: "Amazon", price: 11400 }, { source: "Flipkart", price: 11100 }],
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [quotations, setQuotations] = useState(INITIAL_QUOTATIONS);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [modal, setModal] = useState(null);

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
          <div style={{ padding: "16px", borderTop: "1px solid #1e2130" }}>
            <div style={{ fontSize: 11, color: "#5a6080", marginBottom: 4 }}>Shop Info</div>
            <div style={{ fontSize: 13, color: "#c8ccdd", fontWeight: 500 }}>Sharma Battery Store</div>
            <div style={{ fontSize: 11, color: "#5a6080" }}>Pune, Maharashtra</div>
          </div>
        </aside>

        <main className="main">
          {page === "dashboard" && <Dashboard inventory={inventory} quotations={quotations} invoices={invoices} setPage={setPage} />}
          {page === "inventory" && <Inventory inventory={inventory} setInventory={setInventory} modal={modal} setModal={setModal} />}
          {page === "quotations" && <Quotations quotations={quotations} setQuotations={setQuotations} inventory={inventory} invoices={invoices} setInvoices={setInvoices} modal={modal} setModal={setModal} />}
          {page === "invoices" && <Invoices invoices={invoices} setInvoices={setInvoices} inventory={inventory} modal={modal} setModal={setModal} />}
        </main>
      </div>
    </>
  );
}

function Dashboard({ inventory, quotations, invoices, setPage }) {
  const totalItems = inventory.reduce((a, b) => a + b.quantity, 0);
  const totalValue = inventory.reduce((a, b) => a + b.purchaseRate * b.quantity, 0);
  const totalRevenue = invoices.reduce((a, b) => a + b.subtotal, 0);
  const totalProfit = inventory.reduce((a, b) => a + (b.sellRate - b.purchaseRate) * b.quantity, 0);
  const lowStock = inventory.filter(b => b.quantity <= 4);
  const topProfitItems = [...inventory].sort((a, b) => (b.sellRate - b.purchaseRate) - (a.sellRate - a.purchaseRate)).slice(0, 5);
  const pendingQt = quotations.filter(q => q.status === "Pending").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Welcome back — here's today's overview</div>
        </div>
        <div style={{ fontSize: 12, color: "#5a6080" }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>

      <div className="grid-4">
        <StatCard label="Total Stock Items" value={totalItems.toLocaleString()} sub="units in inventory" icon="ti-box" color="#4d9fff" />
        <StatCard label="Inventory Value" value={`₹${(totalValue/100000).toFixed(1)}L`} sub="at purchase price" icon="ti-currency-rupee" color="#3dda84" />
        <StatCard label="Potential Profit" value={`₹${(totalProfit/1000).toFixed(0)}K`} sub="if all sold at MRP" icon="ti-trending-up" color="#ffc107" />
        <StatCard label="Pending Quotations" value={pendingQt} sub="awaiting customer reply" icon="ti-file-text" color="#ff6b6b" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Low Stock Alert</span>
            <span style={{ fontSize: 11, color: "#ff6b6b", background: "#3a1010", padding: "3px 8px", borderRadius: 6 }}>{lowStock.length} items</span>
          </div>
          {lowStock.length === 0 ? (
            <div className="empty-state"><i className="ti ti-circle-check" style={{ color: "#3dda84" }}></i>All items well stocked</div>
          ) : (
            <table>
              <thead><tr><th>Model</th><th>Type</th><th>Qty</th><th>Action</th></tr></thead>
              <tbody>
                {lowStock.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontSize: 12 }}>{item.model}</td>
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
                    <td style={{ fontSize: 12 }}>{item.brand} {item.ah}Ah</td>
                    <td style={{ color: "#8891b0" }}>₹{item.purchaseRate.toLocaleString()}</td>
                    <td style={{ color: "#c8ccdd" }}>₹{item.sellRate.toLocaleString()}</td>
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
            <div style={{ fontSize: 12, color: "#5a6080", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Recent Quotations</div>
            {quotations.slice(0, 4).map(q => (
              <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e2130" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#c8ccdd", fontWeight: 500 }}>{q.customer}</div>
                  <div style={{ fontSize: 11, color: "#5a6080" }}>{q.id} · {q.date}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>₹{q.total.toLocaleString()}</div>
                  <span className={`badge ${q.status === "Converted" ? "badge-green" : q.status === "Rejected" ? "badge-red" : "badge-yellow"}`}>{q.status}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#5a6080", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Recent Invoices</div>
            {invoices.map(inv => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e2130" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#c8ccdd", fontWeight: 500 }}>{inv.customer}</div>
                  <div style={{ fontSize: 11, color: "#5a6080" }}>{inv.id} · {inv.date}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>₹{inv.total.toLocaleString()}</div>
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
          <div style={{ fontSize: 11, color: "#5a6080", marginTop: 4 }}>{sub}</div>
        </div>
        <div style={{ width: 40, height: 40, background: `${color}15`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={`ti ${icon}`} style={{ fontSize: 20, color }}></i>
        </div>
      </div>
    </div>
  );
}

function Inventory({ inventory, setInventory, modal, setModal }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [editItem, setEditItem] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showComparison, setShowComparison] = useState(null);
  const types = ["All", "Car", "Bike", "Inverter", "Truck"];

  const filtered = inventory.filter(i => {
    const matchSearch = i.model.toLowerCase().includes(search.toLowerCase()) || i.brand.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "All" || i.type === typeFilter;
    return matchSearch && matchType;
  });

  const handleSave = (item) => {
    if (item.id) {
      setInventory(inv => inv.map(i => i.id === item.id ? item : i));
    } else {
      setInventory(inv => [...inv, { ...item, id: Date.now() }]);
    }
    setEditItem(null);
    setShowAdd(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Inventory</div>
          <div className="page-sub">{inventory.length} products · {inventory.reduce((a, b) => a + b.quantity, 0)} total units</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="ti ti-plus"></i> Add Battery</button>
      </div>

      <div className="filter-row">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="ti ti-search"></i>
          <input placeholder="Search by model or brand..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {types.map(t => <button key={t} className={`btn btn-sm ${typeFilter === t ? "btn-primary" : "btn-secondary"}`} onClick={() => setTypeFilter(t)}>{t}</button>)}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Brand</th>
                <th>Type</th>
                <th>Ah</th>
                <th>Qty</th>
                <th>Purchase Rate</th>
                <th>Sell Rate</th>
                <th>Invoice</th>
                <th>P&L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const profit = item.sellRate - item.purchaseRate;
                const pct = ((profit / item.purchaseRate) * 100).toFixed(1);
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 500, color: "#e8e9ed" }}>{item.model}</td>
                    <td style={{ color: "#8891b0" }}>{item.brand}</td>
                    <td><span className="badge badge-blue">{item.type}</span></td>
                    <td style={{ color: "#8891b0" }}>{item.ah}Ah</td>
                    <td>
                      <span className={`badge ${item.quantity <= 3 ? "badge-red" : item.quantity <= 6 ? "badge-yellow" : "badge-green"}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td style={{ color: "#8891b0" }}>₹{item.purchaseRate.toLocaleString()}</td>
                    <td style={{ color: "#c8ccdd", fontWeight: 500 }}>₹{item.sellRate.toLocaleString()}</td>
                    <td style={{ fontSize: 11, color: "#5a6080" }}>{item.invoiceNo}</td>
                    <td>
                      <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ padding: "3px 8px", fontSize: 11, display: "inline-block" }}>
                        {profit >= 0 ? "+" : ""}₹{profit.toLocaleString()} ({pct}%)
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditItem(item)} title="Edit"><i className="ti ti-edit"></i></button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setShowComparison(item)} title="Market Compare"><i className="ti ti-chart-bar"></i></button>
                        <button className="btn btn-sm btn-danger" onClick={() => setInventory(inv => inv.filter(i => i.id !== item.id))} title="Delete"><i className="ti ti-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(showAdd || editItem) && (
        <InventoryModal item={editItem} onSave={handleSave} onClose={() => { setShowAdd(false); setEditItem(null); }} />
      )}

      {showComparison && (
        <MarketComparisonModal item={showComparison} onClose={() => setShowComparison(null)} />
      )}
    </div>
  );
}

function InventoryModal({ item, onSave, onClose }) {
  const [form, setForm] = useState(item || { model: "", brand: "", type: "Car", ah: "", purchaseRate: "", sellRate: "", quantity: "", invoiceNo: "", supplier: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const profit = Number(form.sellRate) - Number(form.purchaseRate);
  const pct = form.purchaseRate ? ((profit / form.purchaseRate) * 100).toFixed(1) : 0;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{item ? "Edit Battery" : "Add New Battery"}</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Model Name</label>
              <input className="form-input" value={form.model} onChange={e => set("model", e.target.value)} placeholder="e.g. Exide FFS0-EXPLAQ60" />
            </div>
            <div className="form-group">
              <label className="form-label">Brand</label>
              <input className="form-input" value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Exide, Amaron..." />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e => set("type", e.target.value)}>
                {["Car", "Bike", "Inverter", "Truck", "Other"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Capacity (Ah)</label>
              <input className="form-input" type="number" value={form.ah} onChange={e => set("ah", e.target.value)} placeholder="60" />
            </div>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input className="form-input" type="number" value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="10" />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Purchase Rate (₹)</label>
              <input className="form-input" type="number" value={form.purchaseRate} onChange={e => set("purchaseRate", e.target.value)} placeholder="3200" />
            </div>
            <div className="form-group">
              <label className="form-label">Sell Rate (₹)</label>
              <input className="form-input" type="number" value={form.sellRate} onChange={e => set("sellRate", e.target.value)} placeholder="4200" />
            </div>
          </div>
          {form.purchaseRate && form.sellRate && (
            <div className={`profit-alert ${profit >= 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
              <i className={`ti ${profit >= 0 ? "ti-trending-up" : "ti-trending-down"}`} style={{ marginRight: 6 }}></i>
              {profit >= 0 ? "You are gaining" : "You are at a loss of"} ₹{Math.abs(profit).toLocaleString()} per unit ({Math.abs(pct)}% {profit >= 0 ? "profit" : "loss"}) · Total stock {profit >= 0 ? "profit" : "loss"}: ₹{Math.abs(profit * (Number(form.quantity) || 0)).toLocaleString()}
            </div>
          )}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Purchase Invoice No.</label>
              <input className="form-input" value={form.invoiceNo} onChange={e => set("invoiceNo", e.target.value)} placeholder="PUR-001" />
            </div>
            <div className="form-group">
              <label className="form-label">Supplier</label>
              <input className="form-input" value={form.supplier} onChange={e => set("supplier", e.target.value)} placeholder="Exide Distributor" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, purchaseRate: Number(form.purchaseRate), sellRate: Number(form.sellRate), quantity: Number(form.quantity), ah: Number(form.ah) })}>
            {item ? "Save Changes" : "Add to Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketComparisonModal({ item, onClose }) {
  const marketPrices = MARKET_PRICES[item.model] || [
    { source: "BatteryBhai.com", price: item.sellRate * 1.05 },
    { source: "Amazon", price: item.sellRate * 1.08 },
    { source: "Flipkart", price: item.sellRate * 1.03 },
  ];
  const avgMarket = (marketPrices.reduce((a, b) => a + b.price, 0) / marketPrices.length).toFixed(0);
  const diff = item.sellRate - avgMarket;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Market Price Comparison</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div style={{ background: "#0f1117", borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#c8ccdd" }}>{item.model}</div>
            <div style={{ fontSize: 12, color: "#5a6080", marginTop: 4 }}>{item.brand} · {item.type} · {item.ah}Ah</div>
            <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
              <div><div style={{ fontSize: 11, color: "#5a6080" }}>Your Buy Price</div><div style={{ fontSize: 18, fontWeight: 700, color: "#ff6b6b" }}>₹{item.purchaseRate.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: "#5a6080" }}>Your Sell Price</div><div style={{ fontSize: 18, fontWeight: 700, color: "#4d9fff" }}>₹{item.sellRate.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: "#5a6080" }}>Market Average</div><div style={{ fontSize: 18, fontWeight: 700, color: "#ffc107" }}>₹{Number(avgMarket).toLocaleString()}</div></div>
            </div>
          </div>
          <div className={`profit-alert ${diff < 0 ? "gain" : "loss"}`} style={{ marginBottom: 16 }}>
            <i className={`ti ${diff < 0 ? "ti-trending-up" : "ti-trending-down"}`} style={{ marginRight: 6 }}></i>
            {diff < 0 ? `Your price is ₹${Math.abs(diff)} cheaper than market average — competitive advantage!` : `Your price is ₹${diff} above market average — consider adjusting.`}
          </div>
          <div className="section-title" style={{ fontSize: 13, marginBottom: 12 }}>Online Price Comparison</div>
          {marketPrices.map((mp, i) => {
            const mpDiff = item.sellRate - mp.price;
            return (
              <div key={i} className="comparison-card">
                <div className="comparison-row">
                  <span className="comparison-source"><i className="ti ti-world" style={{ marginRight: 6, fontSize: 14, verticalAlign: "-2px" }}></i>{mp.source}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#c8ccdd" }}>₹{mp.price.toLocaleString()}</span>
                    <span className={`badge ${mpDiff < -50 ? "badge-red" : mpDiff > 50 ? "badge-green" : "badge-yellow"}`}>
                      {mpDiff < 0 ? `₹${Math.abs(mpDiff)} cheaper than you` : mpDiff > 0 ? `₹${mpDiff} more than you` : "Same price"}
                    </span>
                  </div>
                </div>
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

function Quotations({ quotations, setQuotations, inventory, invoices, setInvoices, modal, setModal }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [viewQt, setViewQt] = useState(null);
  const [compareQt, setCompareQt] = useState(null);

  const filtered = quotations.filter(q => {
    const matchSearch = q.customer.toLowerCase().includes(search.toLowerCase()) || q.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleNewQuotation = (qt) => {
    setQuotations(qts => [...qts, qt]);
    setShowNew(false);
  };

  const convertToInvoice = (qt) => {
    const subtotal = qt.total;
    const gst = Math.round(subtotal * 0.18);
    const inv = {
      id: genId("INV"),
      customer: qt.customer,
      phone: qt.phone,
      date: new Date().toISOString().split("T")[0],
      quotationId: qt.id,
      items: qt.items.map(i => ({ ...i, amount: i.qty * i.rate })),
      subtotal,
      gst,
      total: subtotal + gst,
      paid: false,
    };
    setInvoices(invs => [...invs, inv]);
    setQuotations(qts => qts.map(q => q.id === qt.id ? { ...q, status: "Converted" } : q));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Quotations</div>
          <div className="page-sub">{quotations.length} total · {quotations.filter(q => q.status === "Pending").length} pending</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}><i className="ti ti-plus"></i> New Quotation</button>
      </div>

      <div className="filter-row">
        <div className="search-bar" style={{ flex: 1 }}>
          <i className="ti ti-search"></i>
          <input placeholder="Search by customer or ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {["All", "Pending", "Converted", "Rejected"].map(s => (
          <button key={s} className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-secondary"}`} onClick={() => setStatusFilter(s)}>{s}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Customer</th><th>Phone</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600, color: "#4d9fff" }}>{q.id}</td>
                  <td style={{ fontWeight: 500, color: "#e8e9ed" }}>{q.customer}</td>
                  <td style={{ color: "#8891b0" }}>{q.phone}</td>
                  <td style={{ color: "#8891b0" }}>{q.date}</td>
                  <td style={{ color: "#8891b0" }}>{q.items.length} item{q.items.length > 1 ? "s" : ""}</td>
                  <td style={{ fontWeight: 600, color: "#fff" }}>₹{q.total.toLocaleString()}</td>
                  <td><span className={`badge ${q.status === "Converted" ? "badge-green" : q.status === "Rejected" ? "badge-red" : "badge-yellow"}`}>{q.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setViewQt(q)} title="View"><i className="ti ti-eye"></i></button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setCompareQt(q)} title="Market Compare"><i className="ti ti-chart-bar"></i></button>
                      {q.status === "Pending" && (
                        <button className="btn btn-sm btn-primary" onClick={() => convertToInvoice(q)} title="Convert to Invoice">
                          <i className="ti ti-receipt"></i> Invoice
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewQuotationModal inventory={inventory} onSave={handleNewQuotation} onClose={() => setShowNew(false)} existingCount={quotations.length} />}
      {viewQt && <QuotationViewModal qt={viewQt} onClose={() => setViewQt(null)} onConvert={() => { convertToInvoice(viewQt); setViewQt(null); }} />}
      {compareQt && <QuotationCompareModal qt={compareQt} inventory={inventory} onClose={() => setCompareQt(null)} />}
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
                {inventory.map(b => <option key={b.id} value={b.id}>{b.model} ({b.ah}Ah) — ₹{b.sellRate}</option>)}
              </select>
              <input className="form-input" type="number" value={it.qty} onChange={e => setItem(i, "qty", e.target.value)} style={{ width: 70 }} min="1" placeholder="Qty" />
              <input className="form-input" type="number" value={it.rate} onChange={e => setItem(i, "rate", e.target.value)} style={{ width: 100 }} placeholder="Rate" />
              <div style={{ fontSize: 13, color: "#c8ccdd", fontWeight: 600, minWidth: 70 }}>₹{(Number(it.qty) * Number(it.rate)).toLocaleString()}</div>
              {items.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}><i className="ti ti-trash"></i></button>}
            </div>
          ))}
          <div style={{ background: "#0f1117", borderRadius: 8, padding: 14, marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#8891b0" }}>Quotation Total</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>₹{total.toLocaleString()}</span>
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
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Quotation</div>
                <div className="inv-id">{qt.id}</div>
                <div className="inv-date">Date: {qt.date}</div>
                <div className="inv-date">Valid for: 7 days</div>
              </div>
            </div>
            <div className="inv-bill-to">
              <div className="inv-bill-label">Quote To</div>
              <div className="inv-bill-name">{qt.customer}</div>
              <div style={{ fontSize: 12, color: "#666" }}>Ph: {qt.phone}</div>
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
            <div style={{ marginTop: 24, fontSize: 11, color: "#999", textAlign: "center" }}>Thank you for your enquiry · Prices subject to change · T&C apply</div>
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
          <div style={{ fontSize: 13, color: "#8891b0", marginBottom: 16 }}>
            Comparing your quotation prices for <strong style={{ color: "#c8ccdd" }}>{qt.customer}</strong> against live market prices:
          </div>
          {qt.items.map((it, i) => {
            const marketPrices = MARKET_PRICES[it.model] || [];
            const avg = marketPrices.length ? (marketPrices.reduce((a, b) => a + b.price, 0) / marketPrices.length) : it.rate;
            const diff = it.rate - avg;
            return (
              <div key={i} className="comparison-card">
                <div className="comparison-title">{it.model}</div>
                <div className="comparison-row" style={{ marginBottom: 8 }}>
                  <span style={{ color: "#5a6080" }}>Your quoted price</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#4d9fff" }}>₹{it.rate.toLocaleString()}</span>
                </div>
                {marketPrices.map((mp, j) => (
                  <div key={j} className="comparison-row">
                    <span className="comparison-source"><i className="ti ti-world" style={{ marginRight: 4, fontSize: 13, verticalAlign: "-2px" }}></i>{mp.source}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: "#c8ccdd" }}>₹{mp.price.toLocaleString()}</span>
                      <span className={`badge ${it.rate < mp.price ? "badge-green" : "badge-red"}`}>
                        {it.rate < mp.price ? `₹${mp.price - it.rate} cheaper` : `₹${it.rate - mp.price} more`}
                      </span>
                    </div>
                  </div>
                ))}
                {marketPrices.length > 0 && (
                  <div className={`profit-alert ${diff < 0 ? "gain" : "loss"}`} style={{ marginTop: 10, fontSize: 12 }}>
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

  const filtered = invoices.filter(inv =>
    inv.customer.toLowerCase().includes(search.toLowerCase()) || inv.id.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = invoices.reduce((a, b) => a + b.subtotal, 0);
  const totalGST = invoices.reduce((a, b) => a + b.gst, 0);
  const unpaid = invoices.filter(i => !i.paid).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Invoices</div>
          <div className="page-sub">{invoices.length} invoices · ₹{totalRevenue.toLocaleString()} revenue</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}><i className="ti ti-plus"></i> New Invoice</button>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard label="Total Revenue" value={`₹${(totalRevenue / 1000).toFixed(1)}K`} sub="excl. GST" icon="ti-currency-rupee" color="#3dda84" />
        <StatCard label="GST Collected" value={`₹${totalGST.toLocaleString()}`} sub="18% GST" icon="ti-receipt" color="#4d9fff" />
        <StatCard label="Unpaid Invoices" value={unpaid} sub="pending payment" icon="ti-alert-circle" color="#ff6b6b" />
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
            <thead><tr><th>Invoice ID</th><th>Customer</th><th>Phone</th><th>Date</th><th>Items</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: "#4d9fff" }}>{inv.id}</td>
                  <td style={{ fontWeight: 500, color: "#e8e9ed" }}>{inv.customer}</td>
                  <td style={{ color: "#8891b0" }}>{inv.phone}</td>
                  <td style={{ color: "#8891b0" }}>{inv.date}</td>
                  <td style={{ color: "#8891b0" }}>{inv.items.length}</td>
                  <td style={{ color: "#c8ccdd" }}>₹{inv.subtotal.toLocaleString()}</td>
                  <td style={{ color: "#8891b0" }}>₹{inv.gst.toLocaleString()}</td>
                  <td style={{ fontWeight: 700, color: "#fff" }}>₹{inv.total.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${inv.paid ? "badge-green" : "badge-red"}`}>{inv.paid ? "Paid" : "Unpaid"}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setViewInv(inv)}><i className="ti ti-eye"></i></button>
                      {!inv.paid && <button className="btn btn-sm btn-primary" onClick={() => setInvoices(invs => invs.map(i => i.id === inv.id ? { ...i, paid: true } : i))}>Mark Paid</button>}
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

function NewInvoiceModal({ inventory, onSave, onClose, existingCount }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState([{ inventoryId: "", model: "", qty: 1, rate: 0, amount: 0 }]);

  const addItem = () => setItems(its => [...its, { inventoryId: "", model: "", qty: 1, rate: 0, amount: 0 }]);
  const removeItem = (i) => setItems(its => its.filter((_, idx) => idx !== i));

  const selectBattery = (i, invId) => {
    const bat = inventory.find(b => b.id === Number(invId));
    if (bat) setItems(its => its.map((it, idx) => idx === i ? { ...it, inventoryId: bat.id, model: bat.model, rate: bat.sellRate, amount: bat.sellRate * it.qty } : it));
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
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="form-label" style={{ marginBottom: 0 }}>Battery Items</div>
            <button className="btn btn-sm btn-outline" onClick={addItem}><i className="ti ti-plus"></i> Add Item</button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="item-row">
              <select className="form-select" style={{ flex: 2 }} value={it.inventoryId} onChange={e => selectBattery(i, e.target.value)}>
                <option value="">Select Battery...</option>
                {inventory.map(b => <option key={b.id} value={b.id}>{b.model} (Qty: {b.quantity}) — ₹{b.sellRate}</option>)}
              </select>
              <input className="form-input" type="number" value={it.qty} min="1" onChange={e => setItemField(i, "qty", e.target.value)} style={{ width: 65 }} placeholder="Qty" />
              <input className="form-input" type="number" value={it.rate} onChange={e => setItemField(i, "rate", e.target.value)} style={{ width: 95 }} placeholder="Rate" />
              <div style={{ fontSize: 13, fontWeight: 600, color: "#c8ccdd", minWidth: 80 }}>₹{(Number(it.qty) * Number(it.rate)).toLocaleString()}</div>
              {items.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}><i className="ti ti-trash"></i></button>}
            </div>
          ))}
          <div style={{ background: "#0f1117", borderRadius: 10, padding: 16, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#8891b0" }}>
              <span>Subtotal</span><span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#8891b0" }}>
              <span>GST (18%)</span><span>₹{gst.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 5px", fontSize: 18, fontWeight: 700, color: "#fff", borderTop: "1px solid #1e2130", marginTop: 5 }}>
              <span>Total</span><span>₹{total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!customer || !phone || items.some(i => !i.inventoryId)}>
            <i className="ti ti-receipt"></i> Generate Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceViewModal({ inv, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 720 }}>
        <div className="modal-header">
          <div className="modal-title">{inv.id}</div>
          <button className="close-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="invoice-preview">
            <div className="inv-header">
              <div>
                <div className="inv-shop-name">⚡ Sharma Battery Store</div>
                <div className="inv-shop-sub">Near Bus Stand, Pune, Maharashtra 411001</div>
                <div className="inv-shop-sub">GSTIN: 27XXXXX1234Z1 · Ph: 9876543210</div>
              </div>
              <div className="inv-meta">
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Tax Invoice</div>
                <div className="inv-id">{inv.id}</div>
                <div className="inv-date">Date: {inv.date}</div>
                <div style={{ marginTop: 6, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: inv.paid ? "#e6f4ee" : "#fce8e8", color: inv.paid ? "#1a7a45" : "#c0392b", display: "inline-block" }}>
                  {inv.paid ? "✓ PAID" : "⚠ UNPAID"}
                </div>
              </div>
            </div>
            <div className="inv-bill-to">
              <div className="inv-bill-label">Bill To</div>
              <div className="inv-bill-name">{inv.customer}</div>
              <div style={{ fontSize: 12, color: "#666" }}>Ph: {inv.phone}</div>
              {inv.address && <div style={{ fontSize: 12, color: "#666" }}>{inv.address}</div>}
            </div>
            <table className="inv-table">
              <thead>
                <tr><th>#</th><th>Battery Model</th><th>Qty</th><th>Unit Rate</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
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
                <div className="inv-total-row"><span>Subtotal</span><span>₹{inv.subtotal.toLocaleString()}</span></div>
                <div className="inv-total-row"><span>CGST (9%)</span><span>₹{Math.round(inv.gst / 2).toLocaleString()}</span></div>
                <div className="inv-total-row"><span>SGST (9%)</span><span>₹{Math.round(inv.gst / 2).toLocaleString()}</span></div>
                <div className="inv-total-row grand"><span>Grand Total</span><span>₹{inv.total.toLocaleString()}</span></div>
              </div>
            </div>
            <div style={{ marginTop: 28, borderTop: "1px solid #eee", paddingTop: 16, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>Terms & Conditions</div>
                <div>· Battery warranty as per manufacturer policy</div>
                <div>· Old battery exchange available</div>
                <div>· No cash refund. Exchange only.</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ height: 48 }}></div>
                <div style={{ fontWeight: 600, color: "#333" }}>Authorised Signatory</div>
                <div>Sharma Battery Store</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}><i className="ti ti-printer"></i> Print Invoice</button>
        </div>
      </div>
    </div>
  );
}
