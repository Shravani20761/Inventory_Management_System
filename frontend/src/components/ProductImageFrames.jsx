import { useRef, useState } from "react";
import { api } from "../api/client.js";

const FRAME_DEFS = [
  { field: "batteryImage", label: "Battery", hint: "Product photo" },
  { field: "inverterImage", label: "Inverter", hint: "Product photo" },
  { field: "brandLogo", label: "Brand", hint: "Brand-specific image" },
];

export function framesForType(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("inverter") && t.includes("battery")) return ["inverterImage", "batteryImage", "brandLogo"];
  if (t === "inverter") return ["inverterImage", "brandLogo"];
  if (t.includes("trolley")) return ["batteryImage", "brandLogo"];
  return ["batteryImage", "brandLogo"];
}

/**
 * B/F image frames: preview, upload/replace, remove. Bound to a Mongo inventory row.
 */
export function ProductImageFrames({
  mongoId,
  type,
  values = {},
  onChange,
  compact = false,
  disabled = false,
}) {
  const fields = framesForType(type);
  const inputRef = useRef(null);
  const pickRef = useRef("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");

  const pick = (field) => {
    pickRef.current = field;
    inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const field = pickRef.current;
    if (!file || !field) return;
    if (!mongoId) {
      setMsg("Save the product first, then upload images.");
      return;
    }
    setBusy(field);
    setMsg("");
    try {
      const res = await api.uploadProductImage(mongoId, file, field);
      onChange?.(field, res.url);
    } catch (err) {
      setMsg(err.message || "Upload failed");
    } finally {
      setBusy("");
    }
  };

  const remove = async (field) => {
    if (!mongoId) {
      onChange?.(field, "");
      return;
    }
    setBusy(field);
    setMsg("");
    try {
      await api.removeProductImage(mongoId, field);
      onChange?.(field, "");
    } catch (err) {
      setMsg(err.message || "Remove failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="bf-frames">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={onFile} />
      <div className="bf-frames-grid">
        {FRAME_DEFS.filter((d) => fields.includes(d.field)).map((d) => {
          const url = String(values[d.field] || "").trim();
          return (
            <div key={d.field} className={`bf-frame ${compact ? "compact" : ""}`}>
              <div className="bf-frame-label">
                {d.label} <span>{d.hint}</span>
              </div>
              <div className="bf-frame-preview">
                {url ? (
                  <img src={url} alt={d.label} onClick={() => setPreview({ url, label: d.label })} />
                ) : (
                  <div className="bf-frame-empty">No image</div>
                )}
              </div>
              <div className="bf-frame-actions">
                <button type="button" className="btn btn-sm btn-secondary" disabled={disabled || busy === d.field} onClick={() => pick(d.field)}>
                  {url ? "Replace" : "Upload"}
                </button>
                {url ? (
                  <>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPreview({ url, label: d.label })}>
                      Preview
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" disabled={disabled || busy === d.field} onClick={() => remove(d.field)}>
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {msg ? <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 8 }}>{msg}</div> : null}
      {!mongoId ? (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Save this SKU once to enable Cloudinary image upload.</div>
      ) : null}
      {preview ? (
        <div className="modal-overlay" onClick={() => setPreview(null)} style={{ zIndex: 80 }}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{preview.label}</div>
              <button type="button" className="close-btn" onClick={() => setPreview(null)}>
                <i className="ti ti-x"></i>
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: "center" }}>
              <img src={preview.url} alt={preview.label} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
