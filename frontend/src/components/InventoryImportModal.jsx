import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";

const IGNORE = "__ignore__";

function buildMappingFromPreview(columns, userEdits) {
  const mapping = {};
  for (const col of columns || []) {
    const edit = userEdits[String(col.index)];
    if (edit === IGNORE) continue;
    const field = edit !== undefined ? edit : col.effectiveField;
    if (field && field !== IGNORE) mapping[String(col.index)] = field;
  }
  return mapping;
}

function resolveDuplicateSelections(columns, userEdits) {
  const byField = new Map();
  for (const col of columns || []) {
    const field = userEdits[String(col.index)] ?? col.effectiveField;
    if (!field || field === IGNORE) continue;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(col.index);
  }
  const selections = {};
  for (const [field, indices] of byField) {
    if (indices.length > 1) selections[field] = indices[0];
  }
  return selections;
}

export function InventoryImportModal({
  file,
  importType,
  defaultBrand,
  onClose,
  onComplete,
}) {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [userEdits, setUserEdits] = useState({});
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState(null);

  const refreshPreview = useCallback(
    async (edits) => {
      if (!file || !importType) return;
      setLoading(true);
      setError("");
      try {
        const priorColumns = preview?.columns;
        const columnMapping =
          priorColumns && (Object.keys(edits).length > 0 || priorColumns.some((c) => c.effectiveField))
            ? buildMappingFromPreview(priorColumns, edits)
            : undefined;
        const data = await api.previewInventoryCategoryUpload(importType, file, {
          columnMapping: columnMapping && Object.keys(columnMapping).length ? columnMapping : undefined,
        });
        setPreview(data);
      } catch (e) {
        setError(e.message || "Preview failed");
        setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [file, importType, preview?.columns],
  );

  useEffect(() => {
    refreshPreview({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, importType]);

  const fieldOptions = useMemo(() => {
    const opts = preview?.availableFields || [];
    return [{ key: IGNORE, label: "— Not mapped —" }, ...opts];
  }, [preview?.availableFields]);

  const displayColumns = useMemo(() => {
    if (!preview?.columns) return [];
    return preview.columns.filter((c) => c.displayStatus !== "empty" || userEdits[String(c.index)]);
  }, [preview?.columns, userEdits]);

  const effectiveMapping = useMemo(
    () => buildMappingFromPreview(preview?.columns, userEdits),
    [preview?.columns, userEdits],
  );

  const handleFieldChange = (index, fieldKey) => {
    const next = { ...userEdits, [String(index)]: fieldKey };
    setUserEdits(next);
    refreshPreview(next);
  };

  const handleDuplicatePick = (fieldKey, columnIndex) => {
    const next = { ...userEdits };
    for (const col of preview?.columns || []) {
      const cur = next[String(col.index)] ?? col.effectiveField;
      if (cur === fieldKey && col.index !== columnIndex) {
        next[String(col.index)] = IGNORE;
      }
    }
    if (!next[String(columnIndex)] || next[String(columnIndex)] === IGNORE) {
      next[String(columnIndex)] = fieldKey;
    }
    setUserEdits(next);
    refreshPreview(next);
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    setImporting(true);
    setError("");
    try {
      let columnMapping = buildMappingFromPreview(preview.columns, userEdits);
      if (!Object.keys(columnMapping).length && preview.columnMappingByIndex) {
        columnMapping = { ...preview.columnMappingByIndex };
      }
      const duplicateSelections = resolveDuplicateSelections(preview.columns, userEdits);
      const res = await api.uploadInventoryCategory(importType, file, {
        defaultBrand,
        columnMapping,
        duplicateSelections,
      });
      setImportResult(res);
      onComplete?.(res);
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const canImport = preview?.canImport !== false && !loading && !importResult;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 90 }}>
      <div
        className="modal"
        style={{ width: "min(920px, 96vw)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">Import Excel — column mapping</div>
          <button className="close-btn" type="button" onClick={onClose} aria-label="Close">
            <i className="ti ti-x"></i>
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
            Columns are matched by <strong>header name</strong>, not position. Verify the mapping below before importing.
            {preview?.sheetName ? (
              <>
                {" "}
                Sheet: <strong>{preview.sheetName}</strong>
                {preview.totalRows != null ? ` · ~${preview.totalRows} data rows` : ""}
              </>
            ) : null}
          </p>

          {loading && !preview && <div style={{ padding: 24, textAlign: "center" }}>Reading headers…</div>}

          {error && (
            <div className="profit-alert loss" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          {importResult && (
            <div
              className="card"
              style={{ marginBottom: 16, padding: 16, background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Import complete</div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <div>Total rows parsed: {importResult.parsedRowCount ?? importResult.imported ?? 0}</div>
                <div>
                  Successfully imported: {(importResult.merged?.inserted ?? 0) + (importResult.merged?.updated ?? 0)}
                  {" "}
                  ({importResult.merged?.inserted ?? 0} new, {importResult.merged?.updated ?? 0} updated)
                </div>
                {(importResult.merged?.skipped ?? 0) > 0 && (
                  <div>Skipped: {importResult.merged.skipped}</div>
                )}
                {(importResult.merged?.failed ?? 0) > 0 && (
                  <div style={{ color: "#b91c1c" }}>Failed: {importResult.merged.failed}</div>
                )}
              </div>
              {importResult.failedRows?.length > 0 && (
                <details style={{ marginTop: 8, fontSize: 13 }}>
                  <summary>View failed rows</summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {importResult.failedRows.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {preview?.requiredFields?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Required fields</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {preview.requiredFields.map((f) => (
                  <span
                    key={f.key}
                    style={{
                      fontSize: 13,
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: f.satisfied ? "#dcfce7" : "#fef3c7",
                      color: f.satisfied ? "#166534" : "#92400e",
                    }}
                  >
                    {f.satisfied ? "✓" : "⚠"} {f.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview?.duplicateFields?.length > 0 && (
            <div
              className="card"
              style={{ marginBottom: 16, padding: 12, background: "#fffbeb", borderLeft: "4px solid #f59e0b" }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Duplicate column warnings</div>
              {preview.duplicateFields.map((dup) => (
                <div key={dup.fieldKey} style={{ marginBottom: 10, fontSize: 14 }}>
                  Multiple columns match <strong>{dup.fieldLabel}</strong>. Choose one:
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                    {dup.columns.map((c) => (
                      <label key={c.index} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name={`dup-${dup.fieldKey}`}
                          checked={
                            (userEdits[String(c.index)] ?? preview.columnMappingByIndex?.[String(c.index)]) === dup.fieldKey ||
                            (!userEdits[String(c.index)] && dup.selectedIndex === c.index)
                          }
                          onChange={() => handleDuplicatePick(dup.fieldKey, c.index)}
                        />
                        {c.header}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {preview && !importResult && (
            <table className="inv-wide" style={{ width: "100%", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Uploaded column</th>
                  <th style={{ textAlign: "left" }}>→ Inventory field</th>
                </tr>
              </thead>
              <tbody>
                {displayColumns.map((col) => {
                  const selected = userEdits[String(col.index)] ?? col.effectiveField ?? IGNORE;
                  const label = fieldOptions.find((o) => o.key === selected)?.label ?? col.effectiveLabel ?? "Not mapped";
                  const isMapped = selected && selected !== IGNORE;
                  return (
                    <tr key={col.index}>
                      <td style={{ padding: "8px 6px", verticalAlign: "middle" }}>
                        <code style={{ fontSize: 13 }}>{col.header}</code>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <select
                            className="form-input"
                            style={{ minWidth: 200, maxWidth: "100%" }}
                            value={selected}
                            onChange={(e) => handleFieldChange(col.index, e.target.value)}
                          >
                            {fieldOptions.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {isMapped ? (
                            <span style={{ color: "#16a34a", fontSize: 13 }}>✓ {label}</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 13 }}>Not mapped</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {preview?.sampleRows?.length > 0 && !importResult && (
            <details style={{ marginTop: 16, fontSize: 13 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>Sample rows (first 3)</summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: "#f8fafc",
                  borderRadius: 8,
                  overflow: "auto",
                  maxHeight: 160,
                }}
              >
                {JSON.stringify(preview.sampleRows, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div className="modal-footer" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            {importResult ? "Close" : "Cancel"}
          </button>
          {!importResult && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canImport || importing || loading}
              onClick={handleImport}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
