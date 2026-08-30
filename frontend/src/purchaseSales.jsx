import { useState } from "react";
import { INVENTORY_FORM_TYPES } from "./constants/inventoryTypes.js";
import { nextNumericInventoryId } from "./utils/inventoryIds.js";
import { PurchaseManagement } from "./pages/PurchaseManagement.jsx";
import { PurchaseBillsModule } from "./pages/PurchaseBills.jsx";

const genId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}`;

export function PurchaseAndSales({ purchases, setPurchases, sales, setSales, inventory, setInventory, apiOnline, user, onInventoryRefresh }) {
  const [tab, setTab] = useState("purchases");
  const [search, setSearch] = useState("");
  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [showNewSale, setShowNewSale] = useState(false);
  const [viewPur, setViewPur] = useState(null);

  const filteredPurchases = purchases.filter(
    (p) =>
      (p.supplier || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.id || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.billNo || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredSales = sales.filter(
    (s) =>
      (s.customer || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.id || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.billNo || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPurchases = purchases.reduce((a, b) => a + (b.total || 0), 0);
  const totalSales = sales.reduce((a, b) => a + (b.total || 0), 0);
  const totalProfit = sales.reduce((a, b) => a + (b.profit || 0), 0);

  return (
    <div>
      {tab === "sales" && (
        <>
          <div className="page-header">
            <div>
              <div className="page-title">Purchase & Sales</div>
              <div className="page-sub">
                {sales.length} sales · ₹{totalProfit.toLocaleString()} profit
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowNewSale(true)}>
              <i className="ti ti-plus"></i> New Sale
            </button>
          </div>
          <div className="grid-3" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-label">Total Sales</div>
              <div className="stat-value" style={{ color: "#10b981" }}>
                ₹{(totalSales / 1000).toFixed(1)}K
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sales Profit</div>
              <div className="stat-value" style={{ color: "#d97706" }}>
                ₹{totalProfit.toLocaleString()}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="tabs">
        <div className={`tab ${tab === "purchases" ? "active" : ""}`} onClick={() => setTab("purchases")}>
          Purchase Management
        </div>
        <div className={`tab ${tab === "bills" ? "active" : ""}`} onClick={() => setTab("bills")}>
          Purchase Bills
        </div>
        <div className={`tab ${tab === "sales" ? "active" : ""}`} onClick={() => setTab("sales")}>
          Sell Records
        </div>
      </div>

      {tab === "purchases" ? (
        <PurchaseManagement
          inventory={inventory}
          apiOnline={apiOnline}
          user={user}
          onInventoryRefresh={onInventoryRefresh}
        />
      ) : tab === "bills" ? (
        <PurchaseBillsModule
          inventory={inventory}
          apiOnline={apiOnline}
          user={user}
          onInventoryRefresh={onInventoryRefresh}
        />
      ) : (
        <>
          <div className="filter-row">
            <div className="search-bar" style={{ flex: 1 }}>
              <i className="ti ti-search"></i>
              <input
                placeholder="Search customer, bill no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Place</th>
                    <th>Bill No</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: "#0ea5e9" }}>{s.id}</td>
                      <td style={{ fontWeight: 500 }}>{s.customer}</td>
                      <td style={{ color: "#6b7280" }}>{s.phone}</td>
                      <td style={{ color: "#6b7280" }}>{s.place || "—"}</td>
                      <td style={{ color: "#6b7280" }}>{s.billNo || "—"}</td>
                      <td style={{ color: "#6b7280" }}>{s.date}</td>
                      <td style={{ fontWeight: 600 }}>₹{(s.total || 0).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${(s.profit || 0) >= 0 ? "badge-green" : "badge-red"}`}>
                          ₹{(s.profit || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSales.length === 0 && <div className="empty-state">No sell records yet</div>}
            </div>
          </div>
        </>
      )}

      {showNewSale && (
        <NewSaleModal
          inventory={inventory}
          setInventory={setInventory}
          onClose={() => setShowNewSale(false)}
          onSave={(sale) => {
            setSales((s) => [...s, sale]);
            setShowNewSale(false);
          }}
        />
      )}
      {viewPur && <ViewPurchaseModal pur={viewPur} onClose={() => setViewPur(null)} />}
    </div>
  );
}

function NewPurchaseModal({ inventory, setInventory, onSave, onClose }) {
  const [supplier, setSupplier] = useState("");
  const [place, setPlace] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDetails, setBillDetails] = useState("");
  const [billFileData, setBillFileData] = useState("");
  const [billFileName, setBillFileName] = useState("");
  const [items, setItems] = useState([
    { model: "", brand: "", type: "Car", ah: "", qty: 1, purchaseRate: 0, sellRate: 0 },
  ]);
  const [updateInventory, setUpdateInventory] = useState(true);

  const addItem = () =>
    setItems((its) => [...its, { model: "", brand: "", type: "Car", ah: "", qty: 1, purchaseRate: 0, sellRate: 0 }]);
  const removeItem = (i) => setItems((its) => its.filter((_, idx) => idx !== i));
  const setItem = (i, key, val) => setItems((its) => its.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));

  const total = items.reduce((a, it) => a + Number(it.qty || 0) * Number(it.purchaseRate || 0), 0);

  const handleBillUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBillFileData(reader.result);
      setBillFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const pur = {
      id: genId("PUR"),
      supplier,
      place,
      billNo,
      billDetails,
      billFileData,
      billFileName,
      date: new Date().toISOString().split("T")[0],
      items: items.map((it) => ({
        ...it,
        qty: Number(it.qty),
        purchaseRate: Number(it.purchaseRate),
        sellRate: Number(it.sellRate),
        ah: Number(it.ah),
      })),
      total,
    };
    if (updateInventory) {
      let nextId = nextNumericInventoryId(inventory);
      const merged = [...inventory];
      items.forEach((row) => {
        if (!row.model) return;
        const existing = merged.find((b) => b.model.toLowerCase() === row.model.toLowerCase());
        if (existing) {
          existing.quantity += Number(row.qty) || 0;
          if (row.purchaseRate) existing.purchaseRate = Number(row.purchaseRate);
          if (row.sellRate) existing.sellRate = Number(row.sellRate);
        } else {
          merged.push({
            id: nextId++,
            model: row.model,
            brand: row.brand || "Unknown",
            type: row.type || "Car",
            ah: Number(row.ah) || 0,
            purchaseRate: Number(row.purchaseRate) || 0,
            sellRate: Number(row.sellRate) || 0,
            quantity: Number(row.qty) || 1,
            invoiceNo: billNo,
            supplier,
            place,
          });
        }
      });
      setInventory(merged);
    }
    onSave(pur);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 720 }}>
        <div className="modal-header">
          <div className="modal-title">New Purchase Record</div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Supplier</label>
              <input className="form-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Place</label>
              <input className="form-input" value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Bill Number</label>
              <input className="form-input" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Upload Bill (PDF/Image)</label>
              <input type="file" accept="image/*,.pdf" onChange={handleBillUpload} />
              {billFileName && <div style={{ fontSize: 15, color: "#10b981", marginTop: 4 }}>{billFileName} attached</div>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Billing Notes</label>
            <input className="form-input" value={billDetails} onChange={(e) => setBillDetails(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 16 }}>
            <input type="checkbox" checked={updateInventory} onChange={(e) => setUpdateInventory(e.target.checked)} />
            Add items to inventory stock
          </label>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="form-label" style={{ marginBottom: 0 }}>
              Purchase Items
            </div>
            <button className="btn btn-sm btn-outline" onClick={addItem}>
              <i className="ti ti-plus"></i> Add Item
            </button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="item-row" style={{ flexWrap: "wrap" }}>
              <input className="form-input" style={{ flex: 2, minWidth: 140 }} placeholder="Model" value={it.model} onChange={(e) => setItem(i, "model", e.target.value)} />
              <input className="form-input" style={{ width: 90 }} placeholder="Brand" value={it.brand} onChange={(e) => setItem(i, "brand", e.target.value)} />
              <select className="form-select" style={{ width: 130 }} value={it.type} onChange={(e) => setItem(i, "type", e.target.value)}>
                {INVENTORY_FORM_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input className="form-input" style={{ width: 60 }} type="number" placeholder="Ah" value={it.ah} onChange={(e) => setItem(i, "ah", e.target.value)} />
              <input className="form-input" style={{ width: 55 }} type="number" placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
              <input className="form-input" style={{ width: 80 }} type="number" placeholder="Buy" value={it.purchaseRate} onChange={(e) => setItem(i, "purchaseRate", e.target.value)} />
              <input className="form-input" style={{ width: 80 }} type="number" placeholder="Sell" value={it.sellRate} onChange={(e) => setItem(i, "sellRate", e.target.value)} />
              {items.length > 1 && (
                <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>
                  <i className="ti ti-trash"></i>
                </button>
              )}
            </div>
          ))}
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: 14, marginTop: 12, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#6b7280" }}>Purchase Total</span>
            <span style={{ fontSize: 24, fontWeight: 700 }}>₹{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!supplier || !billNo || items.every((i) => !i.model)}>
            Save Purchase
          </button>
        </div>
      </div>
    </div>
  );
}

function NewSaleModal({ inventory, setInventory, onSave, onClose }) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [place, setPlace] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDetails, setBillDetails] = useState("");
  const [items, setItems] = useState([{ inventoryId: "", model: "", qty: 1, purchaseRate: 0, sellRate: 0 }]);

  const inStock = inventory.filter((b) => b.quantity > 0);
  const addItem = () => setItems((its) => [...its, { inventoryId: "", model: "", qty: 1, purchaseRate: 0, sellRate: 0 }]);
  const removeItem = (i) => setItems((its) => its.filter((_, idx) => idx !== i));
  const setItem = (i, key, val) => setItems((its) => its.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));

  const selectBattery = (i, invId) => {
    const bat = inventory.find((b) => b.id === Number(invId));
    if (bat)
      setItems((its) =>
        its.map((it, idx) =>
          idx === i
            ? { ...it, inventoryId: bat.id, model: bat.model, purchaseRate: bat.purchaseRate, sellRate: bat.sellRate }
            : it
        )
      );
  };

  const total = items.reduce((a, it) => a + Number(it.qty || 0) * Number(it.sellRate || 0), 0);
  const profit = items.reduce((a, it) => a + Number(it.qty || 0) * (Number(it.sellRate || 0) - Number(it.purchaseRate || 0)), 0);

  const handleSave = () => {
    const sale = {
      id: genId("SAL"),
      customer,
      phone,
      place,
      billNo,
      billDetails,
      date: new Date().toISOString().split("T")[0],
      items: items.map((it) => ({
        ...it,
        qty: Number(it.qty),
        purchaseRate: Number(it.purchaseRate),
        sellRate: Number(it.sellRate),
      })),
      total,
      profit,
    };
    setInventory((inv) =>
      inv.map((b) => {
        const sold = items.find((it) => Number(it.inventoryId) === b.id);
        if (!sold) return b;
        return { ...b, quantity: Math.max(0, b.quantity - Number(sold.qty || 0)) };
      })
    );
    onSave(sale);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New Sell Record</div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Customer</label>
              <input className="form-input" value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Place</label>
              <input className="form-input" value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bill No</label>
              <input className="form-input" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Sell Notes</label>
            <input className="form-input" value={billDetails} onChange={(e) => setBillDetails(e.target.value)} />
          </div>
          {items.map((it, i) => (
            <div key={i} className="item-row">
              <select className="form-select" style={{ flex: 2 }} value={it.inventoryId} onChange={(e) => selectBattery(i, e.target.value)}>
                <option value="">Select from stock...</option>
                {inStock.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.model} (Qty: {b.quantity}) — ₹{b.sellRate}
                  </option>
                ))}
              </select>
              <input className="form-input" type="number" style={{ width: 70 }} value={it.qty} min="1" onChange={(e) => setItem(i, "qty", e.target.value)} />
              <input className="form-input" type="number" style={{ width: 90 }} value={it.sellRate} onChange={(e) => setItem(i, "sellRate", e.target.value)} />
              {items.length > 1 && (
                <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>
                  <i className="ti ti-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button className="btn btn-sm btn-outline" onClick={addItem} style={{ marginBottom: 12 }}>
            <i className="ti ti-plus"></i> Add Item
          </button>
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Total</span>
              <span style={{ fontWeight: 700 }}>₹{total.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Profit</span>
              <span style={{ fontWeight: 700, color: profit >= 0 ? "#059669" : "#dc2626" }}>₹{profit.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!customer || items.some((i) => !i.inventoryId)}>
            Save Sale
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewPurchaseModal({ pur, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{pur.id}</div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="modal-body">
          <p>
            <strong>Supplier:</strong> {pur.supplier} · <strong>Bill:</strong> {pur.billNo}
          </p>
          <p style={{ color: "#6b7280", marginTop: 8 }}>{pur.billDetails}</p>
          <table style={{ marginTop: 16, width: "100%" }}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Qty</th>
                <th>Buy</th>
                <th>Sell</th>
              </tr>
            </thead>
            <tbody>
              {(pur.items || []).map((it, i) => (
                <tr key={i}>
                  <td>{it.model}</td>
                  <td>{it.qty}</td>
                  <td>₹{it.purchaseRate?.toLocaleString()}</td>
                  <td>₹{it.sellRate?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, fontWeight: 700 }}>Total: ₹{(pur.total || 0).toLocaleString()}</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {pur.billFileData && (
            <a className="btn btn-outline" href={pur.billFileData} download={pur.billFileName || "purchase-bill"} target="_blank" rel="noreferrer">
              Download Bill
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
