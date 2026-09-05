import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";
const PENDING_STATUSES = new Set(["Uploaded", "Processing"]);
const LOCKED_STATUSES = new Set(["Confirmed", "Inventory Updated"]);

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
      {low ? "⚠ Verify" : "✓"} {Math.round(score)}%
    </span>
  );
}

function Field({ label, value, onChange, confidence, type = "text", disabled }) {
  const low = confidence != null && confidence < 75;
  return (
    <div className={`form-group ${low ? "ocr-low" : ""}`}>
      <label className="form-label" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{label}</span>
        <ConfBadge score={confidence} />
      </label>
      <input className="form-input" type={type} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function emptyItem() {
  return {
    productName: "",
    description: "",
    brand: "",
    sku: "",
    modelNumber: "",
    hsn: "",
    quantity: "",
    unit: "Nos",
    rate: "",
    mrp: "",
    discount: "",
    gstRate: "",
    taxableAmount: "",
    total: "",
    capacityAh: "",
    voltage: "",
    batteryType: "",
    matchStatus: "unmatched",
    productId: "",
    createNewProduct: false,
  };
}

function lineMathWarning(it) {
  const qty = Number(it.quantity);
  const rate = Number(it.rate);
  const taxable = it.taxableAmount === "" || it.taxableAmount == null ? null : Number(it.taxableAmount);
  if (!qty || !rate || taxable == null || Number.isNaN(taxable)) return "";
  if (Math.abs(qty * rate - taxable) > 2) return "Qty × Rate ≠ taxable";
  return "";
}

export function PurchaseBillsModule({ inventory = [], apiOnline, onInventoryRefresh, user }) {
  const [view, setView] = useState("history");
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [bill, setBill] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBlob, setCameraBlob] = useState(null);
  const [dupModal, setDupModal] = useState(null);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const camRef = useRef(null);
  const streamRef = useRef(null);

  const catalogOptions = useMemo(
    () =>
      (inventory || [])
        .map((r) => ({
          id: String(r._id || r.id || ""),
          label: `${r.brand || ""} ${r.model || r.batteryModel || r.inverterModel || ""}`.trim(),
        }))
        .filter((r) => r.id),
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

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
  }, [previewUrl]);

  const stageFile = (file) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setView("stage");
    setMsg("");
  };

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
      photoRef.current?.click();
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
      if (blob) stageFile(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      stopCamera();
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
      const done = PENDING_STATUSES.has(created.ocrStatus)
        ? await api.purchaseBills.waitForOcr(created.id || created._id)
        : created;
      setBill(done);
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
      if (!force) {
        const dup = await api.purchaseBills.checkDuplicate({
          ...bill,
          excludeId: bill.id || bill._id,
        });
        if (dup?.duplicate) {
          setDupModal({ existing: dup.existing || [] });
          return;
        }
      }
      const id = bill.id || bill._id;
      const result = await api.purchaseBills.confirm(id, { force });
      setBill(result.bill);
      setDupModal(null);
      const changes = result.inventoryChanges || result.bill?.inventoryChanges || [];
      setMsg(
        changes.length
          ? `Purchase confirmed. Inventory updated: ${changes.map((c) => `${c.productName || "item"} ${c.previousStock} → ${c.newStock}`).join("; ")}`
          : "Purchase confirmed.",
      );
      setView("review");
      await load();
      onInventoryRefresh?.();
    } catch (e) {
      if (e.details?.duplicate || /duplicate/i.test(e.message || "")) {
        setDupModal({ existing: e.details?.existing || [] });
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
      const started = await api.purchaseBills.retryOcr(id, file);
      const done = PENDING_STATUSES.has(started.ocrStatus) ? await api.purchaseBills.waitForOcr(id) : started;
      setBill(done);
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

  const locked = LOCKED_STATUSES.has(bill?.ocrStatus);
  const failed = bill?.ocrStatus === "Failed";
  const inProgress = processing || PENDING_STATUSES.has(bill?.ocrStatus);

  const previewSrc = bill?.originalFileUrl || previewUrl;
  const isPdfPreview = (file) =>
    String(file?.type || bill?.fileType || previewSrc || "").toLowerCase().includes("pdf") ||
    /\.pdf($|\?)/i.test(pendingFile?.name || bill?.originalFileName || previewSrc || "");

  if (view === "stage" && pendingFile) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Upload Purchase Bill</div>
            <div className="page-sub">Original file is shown as-is. Inventory is not updated until you confirm.</div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => { setPendingFile(null); setView("history"); }}>
            Cancel
          </button>
        </div>
        {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="ocr-review">
          <div className="card ocr-preview">
            <div className="section-title">Original bill</div>
            {isPdfPreview(pendingFile) ? (
              <iframe title="Original bill" src={previewUrl} style={{ width: "100%", minHeight: 520, border: "none" }} />
            ) : (
              <img src={previewUrl} alt="Original bill" style={{ width: "100%", borderRadius: 8 }} />
            )}
            <div className="page-sub" style={{ marginTop: 8 }}>{pendingFile.name} · {(pendingFile.size / 1024).toFixed(0)} KB</div>
          </div>
          <div className="card">
            <p>Check that the full bill is readable, then process. OCR will extract supplier, invoice, every item row, taxes, and totals. You will review before stock changes.</p>
            <button className="btn btn-primary" type="button" disabled={!apiOnline || processing} onClick={() => processFile(pendingFile)}>
              {processing ? "Processing purchase bill…" : "Process Bill"}
            </button>
            <button className="btn btn-secondary" type="button" style={{ marginLeft: 8 }} onClick={startManual}>
              Enter Manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "review" && bill) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Purchase Bill Review</div>
            <div className="page-sub">
              {bill.ocrStatus} · {bill.ocrEngine || "OCR"} · {bill.originalFileName || "Uploaded bill"}
              {bill.branchName ? ` · ${bill.branchName}` : ""}
            </div>
          </div>
          <div>
            <button className="btn btn-secondary" onClick={() => { setView("history"); load(); }}>
              Back to history
            </button>
            {!locked && (
              <button className="btn btn-primary" onClick={() => confirm(false)} disabled={!apiOnline || inProgress}>
                Confirm & Save Purchase
              </button>
            )}
          </div>
        </div>
        {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
        {inProgress && (
          <div className="card" style={{ marginBottom: 12 }}>Processing purchase bill… extracting all pages. Inventory is not updated yet.</div>
        )}
        {failed && (
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid #dc2626" }}>
            <strong>Unable to extract sufficient information from this bill.</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="btn btn-secondary">
                Retry OCR
                <input type="file" accept={ACCEPT} style={{ display: "none" }} onChange={(e) => retry(e.target.files?.[0])} />
              </label>
              <button className="btn btn-secondary" type="button" onClick={startManual}>Enter Purchase Manually</button>
              <label className="btn btn-primary">
                Upload Better Image
                <input type="file" accept={ACCEPT} style={{ display: "none" }} onChange={(e) => retry(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        )}
        {(bill.financialWarnings || []).length > 0 && (
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid #d97706" }}>
            <strong>Check these totals before confirming.</strong> Values were not changed automatically.
            <ul style={{ margin: "8px 0 0 18px" }}>
              {bill.financialWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {(bill.inventoryChanges || []).length > 0 && (
          <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid #047857" }}>
            <strong>Inventory changes</strong>
            <ul style={{ margin: "8px 0 0 18px" }}>
              {bill.inventoryChanges.map((c, i) => (
                <li key={c.productId || i}>
                  {c.productName || c.productId}: {c.previousStock} + {c.purchasedQty} = {c.newStock}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="ocr-review">
          <div className="card ocr-preview">
            <div className="section-title">Original bill</div>
            {previewSrc ? (
              isPdfPreview() ? (
                <iframe title="Original bill" src={previewSrc} style={{ width: "100%", minHeight: 520, border: "none" }} />
              ) : (
                <img src={previewSrc} alt="Original bill" style={{ width: "100%", borderRadius: 8 }} />
              )
            ) : (
              <div className="empty-state">No original file stored</div>
            )}
            {(bill.pageImageUrls || []).length > 1 && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {bill.pageImageUrls.map((u, i) => (
                  <img key={u} src={u} alt={`Page ${i + 1}`} style={{ width: "100%", borderRadius: 8 }} />
                ))}
              </div>
            )}
            {bill.originalFileUrl && (
              <a className="btn btn-secondary" style={{ marginTop: 12 }} href={bill.originalFileUrl} target="_blank" rel="noreferrer">
                View Original Bill
              </a>
            )}
          </div>
          <div className="card ocr-fields">
            <div className="section-title">Supplier details</div>
            <Field label="Supplier name" value={bill.supplierDetails?.name} confidence={confOf(bill, "supplierDetails.name")} onChange={(v) => patch("supplierDetails.name", v)} disabled={locked} />
            <Field label="Legal name" value={bill.supplierDetails?.legalName} onChange={(v) => patch("supplierDetails.legalName", v)} disabled={locked} />
            <Field label="GSTIN" value={bill.supplierDetails?.gstin} confidence={confOf(bill, "supplierDetails.gstin")} onChange={(v) => patch("supplierDetails.gstin", v)} disabled={locked} />
            <Field label="Address" value={bill.supplierDetails?.address} onChange={(v) => patch("supplierDetails.address", v)} disabled={locked} />
            <Field label="Phone" value={bill.supplierDetails?.phone} onChange={(v) => patch("supplierDetails.phone", v)} disabled={locked} />
            <Field label="Email" value={bill.supplierDetails?.email} onChange={(v) => patch("supplierDetails.email", v)} disabled={locked} />
            <Field label="PAN" value={bill.supplierDetails?.pan} onChange={(v) => patch("supplierDetails.pan", v)} disabled={locked} />
            <div className="grid-2">
              <Field label="State" value={bill.supplierDetails?.state} onChange={(v) => patch("supplierDetails.state", v)} disabled={locked} />
              <Field label="State code" value={bill.supplierDetails?.stateCode} onChange={(v) => patch("supplierDetails.stateCode", v)} disabled={locked} />
            </div>

            <div className="section-title" style={{ marginTop: 16 }}>Invoice details</div>
            <Field label="Invoice number" value={bill.invoiceNumber} confidence={confOf(bill, "invoiceNumber")} onChange={(v) => patch("invoiceNumber", v)} disabled={locked} />
            <Field label="Invoice date" value={bill.invoiceDate} confidence={confOf(bill, "invoiceDate")} onChange={(v) => patch("invoiceDate", v)} disabled={locked} />
            <Field label="PO number" value={bill.purchaseOrderNumber} onChange={(v) => patch("purchaseOrderNumber", v)} disabled={locked} />
            <Field label="PO date" value={bill.poDate} onChange={(v) => patch("poDate", v)} disabled={locked} />
            <Field label="Due date" value={bill.dueDate} onChange={(v) => patch("dueDate", v)} disabled={locked} />
            <Field label="Payment terms" value={bill.paymentTerms} onChange={(v) => patch("paymentTerms", v)} disabled={locked} />
            <Field label="Place of supply" value={bill.placeOfSupply} onChange={(v) => patch("placeOfSupply", v)} disabled={locked} />
            <Field label="Reverse charge" value={bill.reverseCharge} onChange={(v) => patch("reverseCharge", v)} disabled={locked} />
            <Field label="Vehicle number" value={bill.vehicleNumber} onChange={(v) => patch("vehicleNumber", v)} disabled={locked} />
            <Field label="Delivery note" value={bill.deliveryNote} onChange={(v) => patch("deliveryNote", v)} disabled={locked} />

            <div className="section-title" style={{ marginTop: 16 }}>Buyer</div>
            <Field label="Company" value={bill.buyerDetails?.name} onChange={(v) => patch("buyerDetails.name", v)} disabled={locked} />
            <Field label="Billing address" value={bill.buyerDetails?.billingAddress || bill.buyerDetails?.address} onChange={(v) => patch("buyerDetails.billingAddress", v)} disabled={locked} />
            <Field label="Shipping address" value={bill.buyerDetails?.shippingAddress} onChange={(v) => patch("buyerDetails.shippingAddress", v)} disabled={locked} />
            <Field label="Buyer GSTIN" value={bill.buyerDetails?.gstin} onChange={(v) => patch("buyerDetails.gstin", v)} disabled={locked} />

            <div className="section-title" style={{ marginTop: 16 }}>Totals and taxes</div>
            <div className="grid-3">
              <Field label="Subtotal" type="number" value={bill.subtotal ?? ""} confidence={confOf(bill, "subtotal")} onChange={(v) => patch("subtotal", v)} disabled={locked} />
              <Field label="Taxable" type="number" value={bill.taxableAmount ?? ""} onChange={(v) => patch("taxableAmount", v)} disabled={locked} />
              <Field label="Discount" type="number" value={bill.discount ?? ""} onChange={(v) => patch("discount", v)} disabled={locked} />
              <Field label="CGST" type="number" value={bill.cgst ?? ""} onChange={(v) => patch("cgst", v)} disabled={locked} />
              <Field label="SGST" type="number" value={bill.sgst ?? ""} onChange={(v) => patch("sgst", v)} disabled={locked} />
              <Field label="IGST" type="number" value={bill.igst ?? ""} onChange={(v) => patch("igst", v)} disabled={locked} />
              <Field label="Cess" type="number" value={bill.cess ?? ""} onChange={(v) => patch("cess", v)} disabled={locked} />
              <Field label="Freight" type="number" value={bill.freight ?? ""} onChange={(v) => patch("freight", v)} disabled={locked} />
              <Field label="Transport" type="number" value={bill.transportation ?? ""} onChange={(v) => patch("transportation", v)} disabled={locked} />
              <Field label="Packing" type="number" value={bill.packingCharges ?? ""} onChange={(v) => patch("packingCharges", v)} disabled={locked} />
              <Field label="Round off" type="number" value={bill.roundOff ?? ""} onChange={(v) => patch("roundOff", v)} disabled={locked} />
              <Field label="Grand total" type="number" value={bill.grandTotal ?? ""} confidence={confOf(bill, "grandTotal")} onChange={(v) => patch("grandTotal", v)} disabled={locked} />
              <Field label="Amount paid" type="number" value={bill.amountPaid ?? ""} onChange={(v) => patch("amountPaid", v)} disabled={locked} />
              <Field label="Balance due" type="number" value={bill.balanceDue ?? ""} onChange={(v) => patch("balanceDue", v)} disabled={locked} />
            </div>
            <Field label="Amount in words" value={bill.amountInWords} onChange={(v) => patch("amountInWords", v)} disabled={locked} />

            <div className="section-title" style={{ marginTop: 16 }}>Purchase items</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>HSN</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>GST %</th>
                    <th>Amount</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {(bill.items || []).map((it, idx) => (
                    <tr key={it._id || idx}>
                      <td>
                        <input className="form-input" disabled={locked} value={it.productName || ""} onChange={(e) => patchItem(idx, "productName", e.target.value)} />
                        <input className="form-input" disabled={locked} placeholder="Brand" style={{ marginTop: 4 }} value={it.brand || ""} onChange={(e) => patchItem(idx, "brand", e.target.value)} />
                        {(it.capacityAh || it.voltage || it.batteryType) && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                            {[it.brand, it.modelNumber, it.capacityAh ? `${it.capacityAh}Ah` : "", it.voltage ? `${it.voltage}V` : "", it.batteryType].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {lineMathWarning(it) && <div className="ocr-conf low">{lineMathWarning(it)} ⚠</div>}
                      </td>
                      <td><input className="form-input" disabled={locked} value={it.sku || it.modelNumber || ""} onChange={(e) => { patchItem(idx, "sku", e.target.value); patchItem(idx, "modelNumber", e.target.value); }} /></td>
                      <td><input className="form-input" disabled={locked} value={it.hsn || ""} onChange={(e) => patchItem(idx, "hsn", e.target.value)} /></td>
                      <td><input className="form-input" disabled={locked} type="number" value={it.quantity ?? ""} onChange={(e) => patchItem(idx, "quantity", e.target.value)} /></td>
                      <td><input className="form-input" disabled={locked} type="number" value={it.rate ?? ""} onChange={(e) => patchItem(idx, "rate", e.target.value)} /></td>
                      <td><input className="form-input" disabled={locked} type="number" value={it.gstRate ?? ""} onChange={(e) => patchItem(idx, "gstRate", e.target.value)} /></td>
                      <td><input className="form-input" disabled={locked} type="number" value={it.total ?? ""} onChange={(e) => patchItem(idx, "total", e.target.value)} /></td>
                      <td>
                        {it.matchStatus === "matched" ? (
                          <div style={{ fontSize: 12, color: "#047857" }}>Matched: {it.matchedLabel}{it.currentStock != null ? ` (stock ${it.currentStock})` : ""}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#b45309" }}>No match found</div>
                        )}
                        <select
                          className="form-select"
                          disabled={locked}
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
                        {!it.productId && !locked && (
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
            {!locked && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setBill((b) => ({ ...b, items: [...(b.items || []), emptyItem()] }))}
              >
                Add line
              </button>
            )}
            {!locked && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => confirm(false)}>
                Confirm & Save Purchase
              </button>
            )}
          </div>
        </div>
        {dupModal && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header">
                <div className="modal-title">Possible duplicate purchase bill.</div>
              </div>
              <div className="modal-body">
                <p>A similar bill already exists. Inventory will not be updated twice unless you continue.</p>
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
          <button className="btn btn-secondary" type="button" onClick={startManual} disabled={!apiOnline || processing}>
            Enter Manually
          </button>
          <button className="btn btn-secondary" type="button" onClick={openCamera} disabled={!apiOnline || processing}>
            Take Photo
          </button>
          <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()} disabled={!apiOnline || processing}>
            Upload Bill
          </button>
          <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; stageFile(f); }} />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; stageFile(f); }} />
        </div>
      </div>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      {processing && <div className="card" style={{ marginBottom: 12 }}>Processing purchase bill… extracting all pages. Inventory is not updated yet.</div>}

      {cameraOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <video ref={camRef} autoPlay playsInline style={{ width: "100%", maxHeight: 360, borderRadius: 8, background: "#111" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {!cameraBlob ? (
              <button className="btn btn-primary" type="button" onClick={capturePhoto}>Use Photo</button>
            ) : (
              <button className="btn btn-secondary" type="button" onClick={() => setCameraBlob(null)}>Retake</button>
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
                <th>Total</th>
                <th>Branch</th>
                <th>Created By</th>
                <th>OCR Status</th>
                <th>Purchase Status</th>
                <th>Bill</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10}>Loading…</td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={10} className="empty-state">No purchase bills yet.</td></tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.invoiceNumber || "—"}</td>
                    <td>{b.supplierName || b.supplierDetails?.name || "—"}</td>
                    <td>{b.invoiceDate || "—"}</td>
                    <td>₹{Number(b.grandTotal || 0).toLocaleString("en-IN")}</td>
                    <td>{b.branchName || "—"}</td>
                    <td>{b.createdByName || user?.name || "—"}</td>
                    <td><span className="badge badge-blue">{b.ocrStatus}</span></td>
                    <td>{b.inventoryUpdated ? "Inventory updated" : b.ocrStatus === "Confirmed" ? "Confirmed" : "Pending confirm"}</td>
                    <td>
                      {b.originalFileUrl ? (
                        <a href={b.originalFileUrl} target="_blank" rel="noreferrer">Preview</a>
                      ) : "—"}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" type="button" onClick={() => openBill(b.id)}>Open</button>
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
