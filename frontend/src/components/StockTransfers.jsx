import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { GlobalInventorySearch } from "./GlobalInventorySearch.jsx";

const TRANSFER_STATUS_COLORS = {
  Requested: { bg: "#fef3c7", color: "#92400e" },
  Pending: { bg: "#fef3c7", color: "#92400e" },
  Approved: { bg: "#d1fae5", color: "#065f46" },
  Rejected: { bg: "#fee2e2", color: "#991b1b" },
  "In Transit": { bg: "#dbeafe", color: "#1e40af" },
  Received: { bg: "#ede9fe", color: "#5b21b6" },
  Completed: { bg: "#dcfce7", color: "#166534" },
};

function statusChip(status) {
  const s = TRANSFER_STATUS_COLORS[status] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
      {status}
    </span>
  );
}

const APPROVABLE_UI_STATUSES = ["Requested", "Pending"];

export function StockTransfersPage({ userBranchId, userBranchName, userRole }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api.stockTransfers.list({ direction: filter === "all" ? undefined : filter });
      setTransfers(Array.isArray(rows) ? rows : []);
    } catch (e) {
      const msgText = e.message || "Could not load transfers";
      setError(msgText.includes("Not Found") ? "Transfer API not loaded — restart npm run dev." : msgText);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, action, body) => {
    setMsg("");
    setError("");
    try {
      await api.stockTransfers.action(id, action, body);
      setMsg(`Transfer ${action} successful`);
      await load();
    } catch (e) {
      setError(e.message || "Action failed");
    }
  };

  const createTransfer = async (payload) => {
    if (!userBranchId) {
      setError("Your account has no branch assigned. Log in as a branch user.");
      return;
    }
    setError("");
    try {
      await api.stockTransfers.create({
        inventoryDocId: payload.inventoryDocId,
        fromBranch: payload.fromBranch,
        toBranch: userBranchId,
        quantity: payload.quantity || 1,
        brand: payload.brand,
        model: payload.model,
        productType: payload.productType,
        notes: payload.notes || `Requested from ${payload.fromBranchName}`,
      });
      setMsg(`Transfer requested: ${payload.model} from ${payload.fromBranchName}`);
      await load();
    } catch (e) {
      setError(e.message || "Could not create transfer request");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Stock Transfers</div>
          <div className="page-sub">
            {userBranchName ? (
              <>
                Branch: <strong>{userBranchName}</strong>
                {userRole === "superAdmin" ? " · search other branches on demand" : ""}
              </>
            ) : (
              "Search other branches in real time · request transfers"
            )}
          </div>
        </div>
      </div>

      <div className="filter-row" style={{ marginBottom: 16 }}>
        {[
          { id: "all", label: "All" },
          { id: "incoming", label: "Incoming" },
          { id: "outgoing", label: "Outgoing" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn btn-sm ${filter === f.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {msg && <div className="profit-alert gain" style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="profit-alert loss" style={{ marginBottom: 12 }}>{error}</div>}

      <GlobalInventorySearch
        userBranchId={userBranchId}
        userBranchName={userBranchName}
        onRequestTransfer={createTransfer}
      />

      <div className="card">
        <div className="section-title">Transfer requests</div>
        {loading ? (
          <div style={{ padding: 16, color: "#6b7280" }}>Loading…</div>
        ) : transfers.length === 0 ? (
          <div style={{ padding: 16, color: "#6b7280" }}>
            No transfer requests yet. Search a product above when it is out of stock at your branch.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {transfers.map((t) => (
              <div
                key={t.id || t.requestId}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 14,
                  background: t.status === "Pending" ? "#fffbeb" : "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.requestId}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      <strong>{t.quantity}×</strong> {t.brand} {t.model}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {t.fromBranchName} → {t.toBranchName}
                    </div>
                  </div>
                  <div>{statusChip(t.status)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {APPROVABLE_UI_STATUSES.includes(t.status) && (
                    <>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => act(t.requestId || t.id, "approve")}>
                        Approve
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => act(t.requestId || t.id, "reject", { rejectionReason: "Rejected" })}>
                        Reject
                      </button>
                    </>
                  )}
                  {t.status === "Approved" && (
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => act(t.requestId || t.id, "dispatch")}>
                      Dispatch
                    </button>
                  )}
                  {t.status === "In Transit" && (
                    <button type="button" className="btn btn-sm btn-primary" style={{ background: "#059669" }} onClick={() => act(t.requestId || t.id, "receive")}>
                      Mark Received
                    </button>
                  )}
                  {t.status === "Received" && (
                    <button type="button" className="btn btn-sm btn-primary" style={{ background: "#166534" }} onClick={() => act(t.requestId || t.id, "complete")}>
                      Complete Transfer
                    </button>
                  )}
                  {["Completed", "Rejected"].includes(t.status) && (
                    <span style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
                      Read only — {t.status.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { GlobalInventorySearch };
