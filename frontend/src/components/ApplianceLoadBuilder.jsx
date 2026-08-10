import { useMemo } from "react";
import { getApplianceCategoryOptions } from "../constants/applianceConfig.js";

/**
 * Structured appliance rows: category + type + quantity (no free-text wattage).
 */
export function ApplianceLoadBuilder({ appliances, onChange }) {
  const categories = useMemo(() => getApplianceCategoryOptions(), []);

  const updateRow = (idx, patch) => {
    const next = appliances.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    onChange(next);
  };

  const addRow = () => {
    const first = categories[0];
    const firstType = first?.types?.[0]?.key ?? "normal";
    onChange([...(appliances || []), { category: first?.key ?? "fan", type: firstType, quantity: 1 }]);
  };

  const removeRow = (idx) => {
    onChange((appliances || []).filter((_, i) => i !== idx));
  };

  const typesFor = (categoryKey) => categories.find((c) => c.key === categoryKey)?.types ?? [];

  return (
    <div className="card" style={{ padding: 12, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Appliance load (structured)
        </div>
        <button type="button" className="btn btn-sm btn-outline" onClick={addRow}>
          + Add appliance
        </button>
      </div>
      <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 10 }}>
        Wattages come from the master appliance table — totals are calculated on the server for quotations.
      </p>
      {!appliances?.length && (
        <p style={{ fontSize: 16, color: "#92400e", marginBottom: 8 }}>
          Add appliances below, or leave empty to use <b>room size</b> estimated load instead.
        </p>
      )}
      {(appliances || []).map((row, idx) => (
        <div key={idx} className="item-row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <select
            className="form-select"
            style={{ minWidth: 160, flex: 1 }}
            value={row.category}
            onChange={(e) => {
              const cat = e.target.value;
              const t0 = typesFor(cat)[0]?.key ?? "";
              updateRow(idx, { category: cat, type: t0 });
            }}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ minWidth: 200, flex: 1 }}
            value={row.type}
            onChange={(e) => updateRow(idx, { type: e.target.value })}
          >
            {typesFor(row.category).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            type="number"
            min={1}
            max={99}
            style={{ width: 80 }}
            value={row.quantity}
            onChange={(e) => updateRow(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
          <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRow(idx)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
