import { useMemo, useState, useEffect } from "react";
import { api } from "../api/client.js";
import {
  INVENTORY_SEARCH_TYPES,
  SEARCH_FORM_CONFIG,
  inventoryTypeLabel,
} from "../constants/inventorySearchTypes.js";

function AvailabilityRow({ label, available, quantity }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, padding: "4px 0", gap: 12 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: available ? "#059669" : "#dc2626", whiteSpace: "nowrap" }}>
        {available ? `Available (Qty: ${quantity})` : "Out of stock"}
      </span>
    </div>
  );
}

function TypeBadge({ typeId }) {
  const meta = INVENTORY_SEARCH_TYPES.find((t) => t.id === typeId);
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: "#ede9fe",
        color: "#5b21b6",
        padding: "2px 8px",
        borderRadius: 999,
      }}
    >
      {meta?.badge || inventoryTypeLabel(typeId)}
    </span>
  );
}

function emptyFormForType(typeId) {
  const cfg = SEARCH_FORM_CONFIG[typeId];
  if (!cfg) return {};
  return Object.fromEntries(cfg.fields.map((f) => [f.key, ""]));
}

function pickBrandFields(prev, brand) {
  if (!brand || brand === "Other") return {};
  return {
    brand,
    brandPreference: brand,
  };
}

/**
 * Type-based real-time cross-branch search — dynamic form per inventory category.
 */
export function GlobalInventorySearch({
  userBranchId,
  userBranchName,
  onRequestTransfer,
  compact = false,
  initialType = "battery",
  initialQuery = {},
  syncSearchType,
  syncBrand,
}) {
  const [inventoryType, setInventoryType] = useState(syncSearchType || initialType);
  const [form, setForm] = useState({ ...emptyFormForType(syncSearchType || initialType), ...initialQuery });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!syncSearchType) return;
    setInventoryType(syncSearchType);
    setForm((prev) => ({ ...emptyFormForType(syncSearchType), ...pickBrandFields(prev, syncBrand) }));
    setResults(null);
  }, [syncSearchType]);

  useEffect(() => {
    if (!syncBrand) return;
    setForm((prev) => ({ ...prev, ...pickBrandFields(prev, syncBrand) }));
  }, [syncBrand]);

  const formConfig = SEARCH_FORM_CONFIG[inventoryType];
  const visibleFields = useMemo(() => {
    if (!formConfig) return [];
    if (compact) return formConfig.fields.slice(0, 3);
    return formConfig.fields;
  }, [formConfig, compact]);

  const onTypeChange = (nextType) => {
    setInventoryType(nextType);
    setForm(emptyFormForType(nextType));
    setResults(null);
    setError("");
  };

  const search = async (e) => {
    e?.preventDefault();
    if (!userBranchId) {
      setError("Your account has no branch assigned.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.inventorySearch.search(inventoryType, {
        ...form,
        currentBranchId: userBranchId,
      });
      setResults(data);
    } catch (err) {
      setError(err.message || "Search failed");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: compact ? 12 : 16 }}>
      <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>{compact ? "Find stock at other branches" : "Branch inventory search"}</span>
        {userBranchName && (
          <span style={{ fontSize: 14, color: "#2563eb", background: "#eff6ff", padding: "3px 10px", borderRadius: 999 }}>
            Your branch: {userBranchName}
          </span>
        )}
      </div>
      <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 12 }}>
        Select inventory type, fill the matching fields, then search live across branches. Other branch stock is never preloaded.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 15, fontWeight: 600, display: "block", marginBottom: 6 }}>Inventory type</label>
        <select
          className="form-input"
          value={inventoryType}
          onChange={(e) => onTypeChange(e.target.value)}
          style={{ maxWidth: compact ? "100%" : 280 }}
        >
          {INVENTORY_SEARCH_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={search}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "1fr 1fr" : "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          {visibleFields.map((field) => (
            <div key={field.key}>
              <label style={{ fontSize: 14, color: "#6b7280", display: "block", marginBottom: 4 }}>{field.label}</label>
              {field.type === "select" ? (
                <select
                  className="form-input"
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                >
                  {field.options.map((opt) => (
                    <option key={opt.value || "any"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  placeholder={field.placeholder}
                  inputMode={field.inputMode}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={loading}>
          {loading ? "Searching…" : `Search ${inventoryTypeLabel(inventoryType)}`}
        </button>
      </form>

      {error && <div className="profit-alert loss" style={{ marginTop: 12 }}>{error}</div>}

      {results && !results.results?.length && (
        <div style={{ marginTop: 12, fontSize: 16, color: "#6b7280" }}>
          {results.message || "No matching products found at any branch."}
        </div>
      )}

      {results?.results?.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {results.results.slice(0, compact ? 3 : 12).map((row) => (
            <div
              key={`${row.inventoryType}-${row.model}-${row.brand}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 14,
                background: row.canRequestTransfer ? "#eff6ff" : "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>{row.brand} {row.model}</div>
                <TypeBadge typeId={row.inventoryType || inventoryType} />
              </div>
              <AvailabilityRow
                label={row.currentBranch?.branchName || userBranchName || "Your branch"}
                available={row.currentBranch?.available}
                quantity={row.currentBranch?.quantity ?? 0}
              />
              {row.otherBranches.map((ob) => (
                <AvailabilityRow key={ob.branchId} label={ob.branchName} available quantity={ob.quantity} />
              ))}
              {row.canRequestTransfer && onRequestTransfer && row.transferSource && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ marginTop: 10, width: "100%" }}
                  onClick={() =>
                    onRequestTransfer({
                      inventoryDocId: row.transferSource.inventoryDocId,
                      fromBranch: row.transferSource.branchId,
                      fromBranchName: row.transferSource.branchName,
                      quantity: 1,
                      brand: row.brand,
                      model: row.model,
                      productType: row.productType,
                    })
                  }
                >
                  Request transfer from {row.transferSource.branchName}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
