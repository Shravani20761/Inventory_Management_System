import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

function confOf(bill, path) {
  const map = bill?.fieldConfidence || {};
  const n = Number(map[path]);
  return Number.isFinite(n) ? n : null;
}

function ConfBadge({ score }) {
  if (score == null) return null;
  const low = score < 75;
  return (
    <span className={`ocr-conf ${low ? "low" : "ok"}`} title="OCR confidence">
      {low ? "⚠" : "✓"} {Math.round(score)}%
    </span>
  );
}

function Field({ label, value, onChange, confidence, type = "text" }) {
  const low = confidence != null && confidence < 75;
  return (
    <div className={`form-group ${low ? "ocr-low" : ""}`}>
      <label className="form-label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{label}</span>
        <ConfBadge score={confidence} />
      </label>
      <input className="form-input" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function emptyItem() {
  return {
    productName: "",
    brand: "",
    sku: "",
    modelNumber: "",
    quantity: "",
    rate: "",
    gstRate: "",
    total: "",
    hsn: "",
    unit: "Nos",
    matchStatus: "unmatched",
    productId: "",
    createNewProduct: false,
  };
}

export function PurchaseBillsModule({ inventory = [], apiOnline, onInventoryRefresh, user }) {
  const [view, setView] = useState("history");
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [bill, setBill] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBlob, setCameraBlob] = useState(null);
  const [dupModal, setDupModal] = useState(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const streamRef = useRef(null);

  const catalogOptions = useMemo(
    () =>
      (inventory || []).map((r) => ({
        id: String(r._id || r.id || ""),
        label: `${r.brand || ""} ${r.model || r.batteryModel || r.inverterModel || ""}`.trim(),
      })).filter((r) => r.id),
    [inventory],
  );

  const load = useCallback(async () => {
    if (!apiOnline) return;
    setLoading(true);
    try {
      setBills(await api.purchaseBills.list());
      setMsg("");
    } catch (e) {
      setMsg(e.message || "Failed to load purchase bills");
    } finally {
      setLoading(false);
    }
  }, [apiOnline]);

  useEffect(() => {
    load();
  }, [load]);

  const stopCamera = () => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setCameraBlob(null);
      requestAnimationFrame(() => {
        if (camRef.current) camRef.current.srcObject = stream;
      });
    } catch {
      fileRef.current?.click();
    }
  };

  const capturePhoto = () => {
    const video = camRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      setCameraBlob(blob);
    }, "image/jpeg", 0.92);
  };

  const processFile = async (file) => {
    if (!file) return;
    setProcessing(true);
    setMsg("");
    try {
      const created = await api.purchaseBills.upload(file);
      setBill(created);
      setView("review");
      await load();
    } catch (e) {
      setMsg(e.message || "Upload failed");
    } finally {
      setProcessing(false);
      stopCamera();
      setCameraBlob(null);
    }
  };

  const openBill = async (id) => {
    try {
      setBill(await api.purchaseBills.get(id));
      setView("review");
    } catch (e) {
      setMsg(e.message || "Failed to open bill");
    }
  };

  const patch = (path, value) => {
    setBill((b) => {
      if (!b) return b;
      const next = { ...b };
      const parts = path.split(".");
      if (parts.length === 1) next[parts[0]] = value;
      else {
        const [a, c] = parts;
        next[a] = { ...(next[a] || {}), [c]: value };
      }
      return next;
    });
  };

  const patchItem = (idx, key, value) => {
    setBill((b) => {
      const items = [...(b.items || [])];
      items[idx] = { ...items[idx], [key]: value };
      return { ...b, items };
    });
  };

  const saveReview = async () => {
    if (!bill?.id && !bill?._id) return;
    const id = bill.id || bill._id;
    const saved = await api.purchaseBills.save(id, bill);
    setBill(saved);
    return saved;
  };

  const confirm = async (force = false) => {
    try {
      await saveReview();
      const id = bill.id || bill._id;
      const result = await api.purchaseBills.confirm(id, { force });
      setBill(result.bill);
      setDupModal(null);
      setMsg("Purchase confirmed. Inventory updated where products were matched.");
      setView("history");
      await load();
      onInventoryRefresh?.();
    } catch (e) {
      if (e.details?.duplicate || /duplicate/i.test(e.message || "")) {
        const existing = e.details?.existing || [];
        setDupModal({ existing });
        return;
      }
      setMsg(e.message || "Confirm failed");
    }
  };

  const retry = async (file) => {
    const id = bill?.id || bill?._id;
    if (!id || !file) return;
    setProcessing(true);
    try {
      setBill(await api.purchaseBills.retryOcr(id, file));
    } catch (e) {
      setMsg(e.message || "Retry failed");
    } finally {
      setProcessing(false);
    }
  };

  const startManual = async () => {
    const created = await api.purchaseBills.manual({
      invoiceNumber: "",
      supplierDetails: { name: "" },
      items: [emptyItem()],
    });
    setBill(created);
    setView("review");
  };

  if (view === "review" && bill) {
    const failed = bill.ocrStatus === "Failed";
    const locked = bill.ocrStatus === "Confirmed" || bill.ocrStatus === "Inventory Updated";
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Purchase Bill Review</div>
            <div className="page-sub">
              {bill.ocrStatus} · {bill.ocrEngine || "OCR"} · {bill.originalFileName || "Uploaded bill"}
            </div>
          </div>
          <div>
            <button className="btn btn-secondary" onClick={() => { setView("history"); load(); }}>
              Back to history
            </button>
            {!locked && (
              <button className="btn btn-primary" onClick={() => confirm(false)} disabled={!apiOnline}>
                Confirm & Add Purchase
              </button>
            )}
          </div>
        </div>
        {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
        {failed && (
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid #dc2626" }}>
            <strong>Unable to extract sufficient information from this document.</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="btn btn-secondary">
                Retry OCR
                <input type="file" accept={ACCEPT} style={{ display: "none" }} onChange={(e) => retry(e.target.files?.[0])} />
              </label>
              <button className="btn btn-secondary" type="button" onClick={startManual}>Enter Manually</button>
              <label className="btn btn-primary">
                Upload Better Image
                <input type="file" accept={ACCEPT} style={{ display: "none" }} onChange={(e) => retry(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        )}
        <div className="ocr-review">
          <div className="card ocr-preview">
            <div className="section-title">Original bill</div>
            {bill.originalFileUrl ? (
              String(bill.fileType || bill.originalFileUrl).includes("pdf") ? (
                <iframe title="Original bill" src={bill.originalFileUrl} style={{ width: "100%", minHeight: 520, border: "none" }} />
              ) : (
                <img src={bill.originalFileUrl} alt="Original bill" style={{ width: "100%", borderRadius: 8 }} />
              )
            ) : (
              <div className="empty-state">No original file stored</div>
            )}
            {bill.originalFileUrl && (
              <a className="btn btn-secondary" style={{ marginTop: 12 }} href={bill.originalFileUrl} target="_blank" rel="noreferrer">
                View Original Bill
              </a>
            )}
          </div>
          <div className="card ocr-fields">
            <div className="section-title">Supplier</div>
            <Field label="Supplier" value={bill.supplierDetails?.name} confidence={confOf(bill, "supplierDetails.name")} onChange={(v) => patch("supplierDetails.name", v)} />
            <Field label="Invoice No" value={bill.invoiceNumber} confidence={confOf(bill, "invoiceNumber")} onChange={(v) => patch("invoiceNumber", v)} />
            <Field label="Invoice Date" value={bill.invoiceDate} confidence={confOf(bill, "invoiceDate")} onChange={(v) => patch("invoiceDate", v)} />
            <Field label="GSTIN" value={bill.supplierDetails?.gstin} confidence={confOf(bill, "supplierDetails.gstin")} onChange={(v) => patch("supplierDetails.gstin", v)} />
            <Field label="Address" value={bill.supplierDetails?.address} onChange={(v) => patch("supplierDetails.address", v)} />
            <Field label="Phone" value={bill.supplierDetails?.phone} onChange={(v) => patch("supplierDetails.phone", v)} />
            <Field label="Email" value={bill.supplierDetails?.email} onChange={(v) => patch("supplierDetails.email", v)} />
            <Field label="PAN" value={bill.supplierDetails?.pan} onChange={(v) => patch("supplierDetails.pan", v)} />
            <div className="grid-2">
              <Field label="State" value={bill.supplierDetails?.state} onChange={(v) => patch("supplierDetails.state", v)} />
              <Field label="State code" value={bill.supplierDetails?.stateCode} onChange={(v) => patch("supplierDetails.stateCode", v)} />
            </div>
            <Field label="PO number" value={bill.purchaseOrderNumber} onChange={(v) => patch("purchaseOrderNumber", v)} />

            <div className="section-title" style={{ marginTop: 16 }}>Buyer</div>
            <Field label="Company" value={bill.buyerDetails?.name} onChange={(v) => patch("buyerDetails.name", v)} />
            <Field label="Billing address" value={bill.buyerDetails?.billingAddress || bill.buyerDetails?.address} onChange={(v) => patch("buyerDetails.billingAddress", v)} />
            <Field label="Shipping address" value={bill.buyerDetails?.shippingAddress} onChange={(v) => patch("buyerDetails.shippingAddress", v)} />
            <Field label="Buyer GSTIN" value={bill.buyerDetails?.gstin} onChange={(v) => patch("buyerDetails.gstin", v)} />

            <div className="section-title" style={{ marginTop: 16 }}>Totals</div>
            <div className="grid-3">
              <Field label="Subtotal" type="number" value={bill.subtotal ?? ""} confidence={confOf(bill, "subtotal")} onChange={(v) => patch("subtotal", v)} />
              <Field label="Taxable" type="number" value={bill.taxableAmount ?? ""} onChange={(v) => patch("taxableAmount", v)} />
              <Field label="Discount" type="number" value={bill.discount ?? ""} onChange={(v) => patch("discount", v)} />
              <Field label="CGST" type="number" value={bill.cgst ?? ""} onChange={(v) => patch("cgst", v)} />
              <Field label="SGST" type="number" value={bill.sgst ?? ""} onChange={(v) => patch("sgst", v)} />
              <Field label="IGST" type="number" value={bill.igst ?? ""} onChange={(v) => patch("igst", v)} />
              <Field label="Freight" type="number" value={bill.freight ?? ""} onChange={(v) => patch("freight", v)} />
              <Field label="Round off" type="number" value={bill.roundOff ?? ""} onChange={(v) => patch("roundOff", v)} />
              <Field label="Grand total" type="number" value={bill.grandTotal ?? ""} confidence={confOf(bill, "grandTotal")} onChange={(v) => patch("grandTotal", v)} />
            </div>
            <Field label="Amount in words" value={bill.amountInWords} onChange={(v) => patch("amountInWords", v)} />

            <div className="section-title" style={{ marginTop: 16 }}>Line items</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>GST %</th>
                    <th>Total</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {(bill.items || []).map((it, idx) => (
                    <tr key={it._id || idx}>
                      <td><input className="form-input" value={it.productName || ""} onChange={(e) => patchItem(idx, "productName", e.target.value)} /></td>
                      <td><input className="form-input" value={it.brand || ""} onChange={(e) => patchItem(idx, "brand", e.target.value)} /></td>
                      <td><input className="form-input" value={it.sku || it.modelNumber || ""} onChange={(e) => { patchItem(idx, "sku", e.target.value); patchItem(idx, "modelNumber", e.target.value); }} /></td>
                      <td><input className="form-input" type="number" value={it.quantity ?? ""} onChange={(e) => patchItem(idx, "quantity", e.target.value)} /></td>
                      <td><input className="form-input" type="number" value={it.rate ?? ""} onChange={(e) => patchItem(idx, "rate", e.target.value)} /></td>
                      <td><input className="form-input" type="number" value={it.gstRate ?? ""} onChange={(e) => patchItem(idx, "gstRate", e.target.value)} /></td>
                      <td><input className="form-input" type="number" value={it.total ?? ""} onChange={(e) => patchItem(idx, "total", e.target.value)} /></td>
                      <td>
                        {it.matchStatus === "matched" ? (
                          <div style={{ fontSize: 12, color: "#047857" }}>Matched: {it.matchedLabel}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#b45309" }}>New Product Detected</div>
                        )}
                        <select
                          className="form-select"
                          value={it.productId || ""}
                          onChange={(e) => {
                            const id = e.target.value;
                            const opt = catalogOptions.find((o) => o.id === id);
                            patchItem(idx, "productId", id);
                            patchItem(idx, "matchStatus", id ? "manual" : "new");
                            patchItem(idx, "matchedLabel", opt?.label || "");
                            patchItem(idx, "createNewProduct", false);
                          }}
                        >
                          <option value="">Select existing product</option>
                          {catalogOptions.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                        {!it.productId && (
                          <label style={{ display: "flex", gap: 6, fontSize: 12, marginTop: 6 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(it.createNewProduct)}
                              onChange={(e) => patchItem(idx, "createNewProduct", e.target.checked)}
                            />
                            Create New Product
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => setBill((b) => ({ ...b, items: [...(b.items || []), emptyItem()] }))}
            >
              Add line
            </button>
            {!locked && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => confirm(false)}>
                Confirm & Add Purchase
              </button>
            )}
          </div>
        </div>
        {dupModal && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header">
                <div className="modal-title">Possible Duplicate Purchase Bill</div>
              </div>
              <div className="modal-body">
                <p>A similar bill already exists. Inventory will not be updated twice unless you continue anyway.</p>
                {(dupModal.existing || []).slice(0, 3).map((d) => (
                  <div key={d.id} className="card" style={{ marginTop: 8 }}>
                    {d.invoiceNumber} · {d.supplierName} · ₹{Number(d.grandTotal || 0).toLocaleString("en-IN")}
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDupModal(null)}>Cancel</button>
                <button className="btn btn-secondary" onClick={() => { const id = dupModal.existing?.[0]?.id; if (id) openBill(id); setDupModal(null); }}>Review existing bill</button>
                <button className="btn btn-primary" onClick={() => confirm(true)}>Continue anyway</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Purchase Bills</div>
          <div className="page-sub">Upload a bill → OCR extract → review → confirm stock</div>
        </div>
        <div>
          <button className="btn btn-secondary" type="button" onClick={openCamera} disabled={!apiOnline || processing}>
            Take Photo
          </button>
          <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()} disabled={!apiOnline || processing}>
            {processing ? "Processing…" : "Upload Purchase Bill"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              processFile(f);
            }}
          />
        </div>
      </div>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      {processing && <div className="card" style={{ marginBottom: 12 }}>OCR processing — extracting all pages. Inventory is not updated yet.</div>}

      {cameraOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <video ref={camRef} autoPlay playsInline style={{ width: "100%", maxHeight: 360, borderRadius: 8, background: "#111" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {!cameraBlob ? (
              <button className="btn btn-primary" type="button" onClick={capturePhoto}>Use Photo</button>
            ) : (
              <>
                <button className="btn btn-primary" type="button" onClick={() => processFile(new File([cameraBlob], "capture.jpg", { type: "image/jpeg" }))}>
                  Process Bill
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setCameraBlob(null)}>Retake</button>
              </>
            )}
            <button className="btn btn-secondary" type="button" onClick={stopCamera}>Close camera</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">Purchase History</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Supplier</th>
                <th>Invoice Date</th>
                <th>Products</th>
                <th>Total Amount</th>
                <th>GST</th>
                <th>Status</th>
                <th>Uploaded Date</th>
                <th>Uploaded By</th>
                <th>OCR Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11}>Loading…</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={11} className="empty-state">No purchase bills yet.</td></tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.invoiceNumber || "—"}</td>
                    <td>{b.supplierName || b.supplierDetails?.name || "—"}</td>
                    <td>{b.invoiceDate || "—"}</td>
                    <td>{b.itemCount ?? (b.items || []).length}</td>
                    <td>₹{Number(b.grandTotal || 0).toLocaleString("en-IN")}</td>
                    <td>₹{Number(b.gstTotal || 0).toLocaleString("en-IN")}</td>
                    <td><span className="badge badge-blue">{b.ocrStatus}</span></td>
                    <td>{b.createdAt ? new Date(b.createdAt).toLocaleString() : "—"}</td>
                    <td>{b.createdByName || user?.name || "—"}</td>
                    <td>{b.ocrStatus}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" type="button" onClick={() => openBill(b.id)}>Review</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
