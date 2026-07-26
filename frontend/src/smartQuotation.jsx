import { useState } from "react";
import { api } from "./api/client.js";
import { mapRecommendationRow } from "./utils/recommendationRows.js";
import { QUOTATION_KIND_LABELS } from "./constants/quotationKinds.js";
import {
  RECOMMENDATION_MODES,
  RECOMMENDATION_MODE_LABELS,
  RECOMMENDATION_MODE_DYNAMIC,
} from "./constants/recommendationModes.js";
import { HOME_BATTERY_TYPES } from "./constants/batteryTypes.js";
import {
  OPTIONAL_SERVICE_FIELDS,
  BATTERY_EXCHANGE_MODES,
  BRAND_PAIRING_PREFERENCES,
} from "./constants/optionalServices.js";
import { VehicleBatteryPicker } from "./components/VehicleBatteryPicker.jsx";
import { ApplianceLoadBuilder } from "./components/ApplianceLoadBuilder.jsx";
import { publicAssetHref, resolveProductImagePath } from "./utils/productImages.js";

export function qtCustomer(q) {
  return q?.customerName || q?.customer || "";
}

export function qtPhone(q) {
  return q?.customerPhone || q?.phone || "";
}

export function qtDate(q) {
  return q?.date || (q?.createdAt ? String(q.createdAt).slice(0, 10) : "");
}

export function qtSummary(q) {
  const kind = q?.quotationKind ? `${QUOTATION_KIND_LABELS[q.quotationKind] || q.quotationKind} · ` : "";
  if (q?.flatType) {
    const budget = q.budgetType || q.budgetTier || "";
    return `${kind}${q.flatType} · ${q.backupHours ?? "—"}h backup${budget ? ` · ${budget}` : ""}`;
  }
  if (q?.suggestedOptions?.length) return `${kind}${q.suggestedOptions.length} option(s)`;
  if (q?.options?.length) return `${kind}${q.options.length} option(s)`;
  if (q?.items?.length) return `${kind}${q.items.length} item(s)`;
  return q?.quotationKind ? `${QUOTATION_KIND_LABELS[q.quotationKind] || q.quotationKind}` : "—";
}

export function qtOptionsCount(q) {
  return q?.suggestedOptions?.length || q?.options?.length || q?.items?.length || 0;
}

import { pdfHref } from "./utils/pdfLinks.js";

function isMongoObjectId(s) {
  const t = String(s ?? "").trim();
  return /^[a-fA-F0-9]{24}$/.test(t);
}

/** Stable card id for React keys and per-card quotation state (never collide on shared `type`). */
export function stableOptionId(option, index) {
  return String(option?.optionId || `option-${index + 1}`);
}

function enrichPreviewSuggestedOptions(data) {
  if (!data?.suggestedOptions?.length) return data;
  /** Always positional ids so cards never share one key (API may repeat the same optionId on every row). */
  return {
    ...data,
    suggestedOptions: data.suggestedOptions.map((o, i) => ({
      ...o,
      optionId: `option-${i + 1}`,
    })),
  };
}

export function quotationToInvoiceItems(qt) {
  const opt = qt.selectedOption || qt.suggestedOptions?.[0] || qt.options?.[0];
  const kind = qt.quotationKind || "combo";
  if (opt?.battery || opt?.inverter) {
    const items = [];
    if (opt.inverter?.modelName || opt.inverterName) {
      items.push({
        model: opt.inverter.modelName || opt.inverterName,
        qty: 1,
        rate: Number(opt.inverter?.sellingRate ?? opt.inverter?.sellRate ?? opt.inverterRate ?? 0),
      });
    }
    if (opt.battery?.modelName || opt.batteryName) {
      const withOld = Number(opt.battery?.withOldPrice ?? 0);
      const baseRate = Number(opt.battery?.sellingRate ?? opt.battery?.sellRate ?? opt.batteryRate ?? 0);
      const rate =
        kind === "battery" || kind === "car" || kind === "bike"
          ? withOld || baseRate
          : baseRate;
      items.push({
        model: opt.battery.modelName || opt.batteryName,
        qty: 1,
        rate,
      });
    }
    if (items.length) return items;
    if (opt.totalPrice || opt.total) {
      return [{ model: opt.optionLabel || "Battery + Inverter combo", qty: 1, rate: Number(opt.totalPrice ?? opt.total) }];
    }
  }
  if (opt?.inverterName && opt?.batteryName) {
    return [{ model: `${opt.inverterName} + ${opt.batteryName}`, qty: 1, rate: Number(opt.total ?? 0) }];
  }
  if (qt.items?.length) {
    return qt.items.map((i) => ({ model: i.model, qty: Number(i.qty), rate: Number(i.rate) }));
  }
  return [];
}

function inventoryLabel(item) {
  const name = item.modelName || item.model;
  const rate = item.sellRate ?? item.sellingRate ?? 0;
  const qty = item.quantity ?? 0;
  const ahVal = item.ah || item.capacityAh;
  return `${name}${ahVal ? ` (${ahVal}Ah)` : ""} — Qty:${qty} — ₹${Number(rate).toLocaleString("en-IN")}`;
}

function FilterChips({ chips = [] }) {
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {chips.map((chip) => (
        <span
          key={chip}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 10px",
            borderRadius: 999,
            background: "#e0f2fe",
            color: "#0369a1",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function activeFilterChips(form, preview) {
  const chips = [];
  if (form.quotationKind !== "combo") return chips;
  if (!form.inverterBrandAny && form.inverterBrand.trim()) chips.push(form.inverterBrand.trim());
  if (!form.batteryBrandAny && form.batteryBrand.trim()) chips.push(form.batteryBrand.trim());
  if (form.batteryTypes?.length) form.batteryTypes.forEach((t) => chips.push(t));
  if (form.backupHours) chips.push(`${form.backupHours} Hour Backup`);
  if (preview?.loadSizing?.roundedVA) chips.push(`${preview.loadSizing.roundedVA} VA`);
  if (preview?.loadSizing?.roundedAH) chips.push(`${preview.loadSizing.roundedAH} Ah`);
  return chips;
}

function toggleBatteryType(current, type) {
  const set = new Set(current ?? []);
  if (set.has(type)) set.delete(type);
  else set.add(type);
  return [...set];
}

function badgeClass(label) {
  const map = {
    Budget: "badge-green",
    Recommended: "badge-blue",
    Premium: "badge-yellow",
    "Long Backup": "badge-gray",
    "Best Value": "badge-green",
    "Premium Choice": "badge-yellow",
  };
  return map[label] || "badge-gray";
}

function quotationStatusBadgeClass(status) {
  switch (status) {
    case "Approved":
    case "Converted":
      return "badge-green";
    case "Rejected":
    case "Expired":
      return "badge-red";
    case "Sent":
      return "badge-blue";
    default:
      return "badge-yellow";
  }
}

function OptionCard({
  option,
  selected,
  onSelect,
  batteryExchangeMode = "withOld",
  showQuotationActions = false,
  createdQuotation = null,
  onCreateQuotation,
  onDownloadPdf,
  onApproveAndSendWhatsApp,
  busy = false,
}) {
  const battery = option.battery ?? {};
  const inverter = option.inverter ?? {};
  const label = option.optionLabel || option.type || "Option";
  const price = option.totalPrice ?? option.total ?? 0;
  const base = option.baseComboPrice ?? price;
  const services = option.optionalServicesTotal ?? 0;
  const batWith = Number(battery.withOldPrice ?? battery.sellingRate ?? 0);
  const batWithout = Number(battery.withoutOldPrice ?? batWith);
  const borderColor = option.color || (selected ? "#0ea5e9" : "#e5e7eb");
  const hasInv = Boolean(inverter.modelName || option.inverterName);
  const hasBat = Boolean(battery.modelName || option.batteryName);
  const invModelStr = inverter.modelName || inverter.inverterModelNumber || option.inverterName || "";
  const batModelStr = battery.modelName || battery.batteryModelNumber || option.batteryName || "";
  const invThumbSrc = publicAssetHref(
    resolveProductImagePath({
      brand: inverter.brand || option.inverterBrand,
      model: invModelStr,
      product: "inverter",
      explicitUrl: inverter.imageUrl || inverter.inverterImage || option.inverterImage,
    }).path,
  );
  const batThumbSrc = publicAssetHref(
    resolveProductImagePath({
      brand: battery.brand || option.batteryBrand,
      model: batModelStr,
      product: "battery",
      explicitUrl: battery.imageUrl || battery.batteryImage || option.batteryImage,
    }).path,
  );
  const backupLine =
    hasBat && (option.estimatedBackup != null || option.estimatedBackup === 0)
      ? `~${option.estimatedBackup} hrs · Load ${option.totalLoad ?? "—"}W`
      : option.backup || option.suitableFor || "—";

  return (
    <div
      className={`option-card ${selected ? "recommended" : ""}`}
      onClick={() => onSelect?.(option)}
      style={{ cursor: onSelect ? "pointer" : "default", borderColor }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        <span className={`badge ${badgeClass(option.badge || option.type)}`}>{option.badge || option.type || "Option"}</span>
      </div>
      {(hasInv || hasBat) && (
        <div
          style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}
          onClick={(e) => e.stopPropagation()}
        >
          {hasInv ? (
            <img
              src={invThumbSrc}
              alt=""
              style={{
                width: 48,
                height: 48,
                objectFit: "contain",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            />
          ) : null}
          {hasBat ? (
            <img
              src={batThumbSrc}
              alt=""
              style={{
                width: 48,
                height: 48,
                objectFit: "contain",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            />
          ) : null}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
        {hasInv && (
          <div>
            <strong style={{ color: "#374151" }}>Inverter:</strong>{" "}
            {inverter.brand ? `${inverter.brand} · ` : ""}
            {inverter.modelName || option.inverterName || "—"} ({inverter.inverterVA || option.inverterVa || "—"} VA)
            {inverter.warranty && inverter.warranty !== "—" ? ` · ${inverter.warranty}` : ""}
          </div>
        )}
        {hasBat && (
          <div>
            <strong style={{ color: "#374151" }}>Battery:</strong>{" "}
            {battery.brand ? `${battery.brand} · ` : ""}
            {battery.modelName || option.batteryName || "—"} ({battery.capacityAh || option.batteryAh || "—"} Ah
            {battery.batteryType ? ` · ${battery.batteryType}` : ""})
            {(battery.withOldPrice || battery.withoutOldPrice) && batteryExchangeMode === "showBoth" && (
              <span style={{ display: "block", fontSize: 11, marginTop: 2 }}>
                With old: ₹{batWith.toLocaleString("en-IN")} · Without old: ₹{batWithout.toLocaleString("en-IN")}
              </span>
            )}
            {(battery.withOldPrice || battery.withoutOldPrice) && batteryExchangeMode === "withOld" && (
              <span style={{ display: "block", fontSize: 11, marginTop: 2 }}>With old battery: ₹{batWith.toLocaleString("en-IN")}</span>
            )}
            {(battery.withOldPrice || battery.withoutOldPrice) && batteryExchangeMode === "withoutOld" && (
              <span style={{ display: "block", fontSize: 11, marginTop: 2 }}>Without old battery: ₹{batWithout.toLocaleString("en-IN")}</span>
            )}
          </div>
        )}
        <div>
          <strong style={{ color: "#374151" }}>{hasBat ? "Backup / load:" : "Details:"}</strong> {backupLine}
        </div>
        {option.comparisonNote && <div style={{ marginTop: 6, fontStyle: "italic" }}>{option.comparisonNote}</div>}
        {option.recommendationType && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#0369a1" }}>
            <strong>Mode:</strong> {option.recommendationType}
          </div>
        )}
        {option.note && <div style={{ marginTop: 6 }}>{option.note}</div>}
      </div>
      {services > 0 && (
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
          Base combo ₹{Number(base - services).toLocaleString("en-IN")} + services ₹{Number(services).toLocaleString("en-IN")}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 20, fontWeight: 700, color: "#2563eb" }}>
        ₹{Number(price).toLocaleString("en-IN")}
      </div>
      {showQuotationActions ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {createdQuotation ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#374151", fontWeight: 600 }}>{createdQuotation.quoteKey || createdQuotation.id}</span>
              <span className={`badge ${quotationStatusBadgeClass(createdQuotation.status)}`}>{createdQuotation.status || "Pending"}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              style={{ flex: 1, opacity: createdQuotation ? 1 : 0.65 }}
              disabled={busy || !createdQuotation}
              title={
                createdQuotation
                  ? "Preview or regenerate this option’s final PDF"
                  : "Create quotation for this option first — each option keeps its own PDF on the server."
              }
              onClick={() => createdQuotation && onDownloadPdf?.()}
            >
              <i className="ti ti-file-download"></i> PDF
            </button>
            {createdQuotation ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ flex: 1, background: "#16a34a" }}
                disabled={busy}
                onClick={() => onApproveAndSendWhatsApp?.()}
              >
                <i className="ti ti-brand-whatsapp"></i> Approve &amp; Send
              </button>
            ) : null}
          </div>
          {!createdQuotation ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ width: "100%", background: "#2563eb" }}
              disabled={busy}
              onClick={() => onCreateQuotation?.()}
            >
              <i className="ti ti-file-invoice"></i> {busy ? "Working…" : "Create Quotation"}
            </button>
          ) : null}
        </div>
      ) : (
        onSelect && (
          <div style={{ marginTop: 8, fontSize: 11, color: selected ? "#0369a1" : "#9ca3af" }}>
            {selected ? "Selected for PDF" : "Click card to select"}
          </div>
        )
      )}
    </div>
  );
}

function OptionsTable({ options }) {
  if (!options?.length) return null;
  const showInv = options.some((o) => o.inverter?.modelName || o.inverterName);
  const showBat = options.some((o) => o.battery?.modelName || o.batteryName);
  return (
    <div className="table-wrap" style={{ marginTop: 16 }}>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            {showInv && <th>Inverter</th>}
            {showBat && <th>Battery</th>}
            <th>Backup / notes</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o, i) => (
            <tr key={o.optionLabel || o.id || i}>
              <td style={{ fontWeight: 600 }}>{o.optionLabel || o.type}</td>
              {showInv && (
                <td>
                  {o.inverter?.brand ? `${o.inverter.brand} · ` : ""}
                  {o.inverter?.modelName || o.inverterName || "—"} ({o.inverter?.inverterVA || o.inverterVa || "—"} VA)
                </td>
              )}
              {showBat && (
                <td>
                  {o.battery?.brand ? `${o.battery.brand} · ` : ""}
                  {o.battery?.modelName || o.batteryName || "—"} ({o.battery?.capacityAh || o.batteryAh || "—"} Ah
                  {o.battery?.batteryType ? ` · ${o.battery.batteryType}` : ""})
                </td>
              )}
              <td>{o.estimatedBackup != null ? `~${o.estimatedBackup}h` : ""} {o.backup || o.suitableFor || "—"}</td>
              <td style={{ fontWeight: 600 }}>₹{Number(o.totalPrice ?? o.total ?? 0).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SmartQuotationModal({
  inventory = [],
  onClose,
  onSaved,
  onQuotationCreated,
  initialQuotationKind = "combo",
  userBranchId,
  userBranchName,
}) {
  const [form, setForm] = useState({
    quotationKind: initialQuotationKind,
    recommendationMode: RECOMMENDATION_MODE_DYNAMIC,
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerRequirements: "",
    flatType: "2BHK",
    numberOfRooms: "",
    backupHours: 5,
    budgetType: "Recommended",
    preferredBrand: "",
    inverterBrand: "",
    batteryBrand: "",
    inverterBrandAny: true,
    batteryBrandAny: true,
    batteryTypes: [],
    batteryExchangeMode: "withOld",
    brandPairingPreference: "mixedAllowed",
    trolleyRequired: false,
    installationRequired: false,
    wiringRequired: false,
    transportationRequired: false,
    deliveryRequired: false,
    totalLoad: "",
    appliances: [],
    vehicleBrand: "",
    vehicleModel: "",
    fuelType: "Petrol",
    bikeBrand: "",
    bikeModel: "",
  });
  const [extraItems, setExtraItems] = useState([]);
  const [addItemId, setAddItemId] = useState("");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [transferMsg, setTransferMsg] = useState("");
  // Quotations created from individual options (keyed by optionLabel).
  const [createdQuotations, setCreatedQuotations] = useState({});
  const [actionBusyLabel, setActionBusyLabel] = useState("");
  /** { url, title } — url is already normalized for iframe (e.g. /generated/...) */
  const [pdfPreview, setPdfPreview] = useState(null);

  const inStock = inventory.filter((b) => Number(b.quantity) > 0);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const addFromInventory = () => {
    if (!addItemId) return;
    const item = inventory.find((b) => String(b.id) === String(addItemId));
    if (!item) return;
    const rate = Number(item.sellRate ?? item.sellingRate ?? 0);
    setExtraItems((list) => [
      ...list,
      {
        inventoryId: item.id,
        model: item.model ?? item.modelName,
        modelName: item.modelName ?? item.model,
        brand: item.brand,
        type: item.type ?? item.category,
        qty: 1,
        rate,
        sellingRate: rate,
      },
    ]);
    setAddItemId("");
  };

  const removeExtra = (idx) => setExtraItems((list) => list.filter((_, i) => i !== idx));

  const requestTransferFromHint = async (hint) => {
    const source = hint.transferSource;
    if (!source?.inventoryDocId || !userBranchId) {
      setTransferMsg("Assign a branch to your account to request transfers.");
      return;
    }
    setTransferMsg("");
    try {
      await api.stockTransfers.create({
        inventoryDocId: source.inventoryDocId,
        fromBranch: source.branchId,
        toBranch: userBranchId,
        quantity: 1,
        brand: hint.brand,
        model: hint.model,
        productType: hint.productType,
        notes: `Requested from quotation preview (${source.branchName})`,
      });
      setTransferMsg(`Transfer requested: ${hint.model} from ${source.branchName}`);
    } catch (e) {
      setTransferMsg(e.message || "Transfer request failed");
    }
  };

  const payload = () => ({
    quotationKind: form.quotationKind,
    recommendationMode: form.quotationKind === "combo" ? form.recommendationMode : undefined,
    customerName: form.customerName.trim(),
    customerPhone: form.customerPhone.trim(),
    customerAddress: form.customerAddress.trim(),
    customerRequirements: form.customerRequirements.trim(),
    flatType: form.flatType,
    houseType: form.flatType,
    numberOfRooms: form.numberOfRooms.trim(),
    backupHours: Number(form.backupHours) || 4,
    budgetType: form.budgetType,
    preferredBrand: form.preferredBrand.trim(),
    inverterBrand: form.inverterBrandAny ? "" : form.inverterBrand.trim(),
    batteryBrand: form.batteryBrandAny ? "" : form.batteryBrand.trim(),
    batteryTypes:
      form.quotationKind === "combo" && form.recommendationMode === RECOMMENDATION_MODE_DYNAMIC && form.batteryTypes?.length
        ? form.batteryTypes
        : undefined,
    roomNotes: form.customerRequirements.trim(),
    totalLoad: form.totalLoad ? Number(form.totalLoad) : undefined,
    appliances: form.quotationKind === "combo" && form.appliances?.length ? form.appliances : undefined,
    vehicleBrand: form.vehicleBrand.trim(),
    vehicleModel: form.vehicleModel.trim(),
    fuelType: form.fuelType,
    bikeBrand: form.bikeBrand.trim(),
    bikeModel: form.bikeModel.trim(),
    batteryExchangeMode: form.batteryExchangeMode,
    brandPairingPreference: form.brandPairingPreference,
    trolleyRequired: form.trolleyRequired,
    installationRequired: form.installationRequired,
    wiringRequired: form.wiringRequired,
    transportationRequired: form.transportationRequired,
    deliveryRequired: form.deliveryRequired,
    extraItems,
    branchId: userBranchId || undefined,
  });

  const optionLetterForApi = (optionStableId, optionIndex) => {
    if (optionIndex != null && Number.isFinite(Number(optionIndex)) && Number(optionIndex) >= 0) {
      return String.fromCharCode(65 + Math.min(25, Math.floor(Number(optionIndex))));
    }
    const m = /^option-(\d+)$/i.exec(String(optionStableId || ""));
    if (m) return String.fromCharCode(65 + Math.max(0, Number(m[1]) - 1));
    return "A";
  };

  const previewOptions = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      try {
        const health = await api.health();
        if (!health?.ok) throw new Error("API health check failed");
      } catch (he) {
        throw new Error(
          he.message?.includes("Bad Gateway") || he.message?.includes("Cannot reach")
            ? he.message
            : "Backend not running. Open terminal in Inventory_management folder and run: npm run dev",
          { cause: he },
        );
      }
      const data = await api.previewQuotationOptions(payload());
      if (!data?.suggestedOptions?.length) {
        throw new Error("No quotation options could be built. Check inventory for this category (stock & product types).");
      }
      const enriched = enrichPreviewSuggestedOptions(data);
      setPreview(enriched);
      setSelected(enriched.suggestedOptions.find((o) => o.badge === "Recommended") ?? enriched.suggestedOptions[0]);
    } catch (e) {
      setError(e.message || "Could not preview options");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const saveSheet = async (activePreview, chosen) => {
    const savePayload = await api.saveRecommendationSheet({
      ...payload(),
      quotationKind: activePreview.quotationKind ?? form.quotationKind,
      inverterRange: activePreview.inverterRange,
      batteryRange: activePreview.batteryRange,
      estimatedBackupRange: activePreview.estimatedBackupRange,
      appliancesNote: activePreview.appliancesNote,
      totalLoad: activePreview.totalLoad,
      loadSizing: activePreview.loadSizing,
      appliances: activePreview.appliances ?? form.appliances,
      numberOfRooms: activePreview.numberOfRooms ?? form.numberOfRooms,
      houseType: activePreview.houseType ?? form.flatType,
      inverterBrand: activePreview.inverterBrand,
      batteryBrand: activePreview.batteryBrand,
      recommendedOptionLabel: activePreview.recommendedOptionLabel,
      vehicleBrand: activePreview.vehicleBrand,
      vehicleModel: activePreview.vehicleModel,
      fuelType: activePreview.fuelType,
      bikeBrand: activePreview.bikeBrand,
      bikeModel: activePreview.bikeModel,
      suggestedOptions: activePreview.suggestedOptions,
      selectedOption: chosen,
    });
    setResult(savePayload);
    const raw = savePayload.recommendationSheet ?? savePayload.quotation ?? {};
    const q = mapRecommendationRow({
      ...raw,
      quotationKind: raw.quotationKind ?? activePreview?.quotationKind ?? form.quotationKind,
      selectedOption: chosen,
      extraItems,
      total:
        (chosen?.totalPrice ?? raw.suggestedOptions?.[0]?.totalPrice ?? 0) +
        extraItems.reduce((a, i) => a + Number(i.qty) * Number(i.rate), 0),
      items: extraItems,
      _id: raw._id,
    });
    onSaved?.(q);
    return savePayload.recommendationSheet ?? raw;
  };

  const ensurePreview = async () => {
    if (preview?.suggestedOptions?.length) return preview;
    const data = await api.previewQuotationOptions(payload());
    if (!data?.suggestedOptions?.length) {
      throw new Error("No quotation options could be built. Check inventory for this category (stock & product types).");
    }
    const enriched = enrichPreviewSuggestedOptions(data);
    setPreview(enriched);
    setSelected(enriched.suggestedOptions.find((o) => o.badge === "Recommended") ?? enriched.suggestedOptions[0]);
    return enriched;
  };

  const generate = async () => {
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setError("Customer name and phone are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const activePreview = await ensurePreview();
      const chosen = selected ?? activePreview.suggestedOptions?.[0];
      await saveSheet(activePreview, chosen);
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const openQuotationPdfPreview = (rawUrl, title) => {
    const base = pdfHref(rawUrl);
    if (!base) {
      setError("No PDF URL returned from the server.");
      return;
    }
    const sep = base.includes("?") ? "&" : "?";
    const url = `${base}${sep}cb=${Date.now()}`;
    setPdfPreview({ url, title: title || "Quotation PDF" });
  };

  /** Per-card create: always uses the `option` object from that row (not sheet[0]). */
  const handleCreateQuotation = async (option, optionStableId, optionIndex) => {
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setError("Customer name and phone are required");
      return;
    }
    console.log("Generating quotation for:", option.optionId);
    const key = optionStableId;
    setActionBusyLabel(key);
    setError("");
    try {
      const activePreview = await ensurePreview();
      let sheet = result?.recommendationSheet;
      if (!sheet?._id && !sheet?.sheetKey) {
        sheet = await saveSheet(activePreview, option);
      }
      if (!sheet?._id && !sheet?.sheetKey) {
        throw new Error("Could not save recommendation sheet. Click Preview options first, then try again.");
      }
      const sheetId = sheet._id ?? sheet.id;
      const created = await api.createQuotationFromSheet({
        generatePdf: true,
        ...(isMongoObjectId(sheetId) ? { recommendationSheetId: String(sheetId).trim() } : {}),
        sheetKey: sheet.sheetKey,
        selectedOption: option,
        selectedOptionLabel: option?.optionLabel || option?.type,
        optionIndex,
        clientOptionId: option.optionId,
        optionId: option.optionId,
      });
      console.log("[SmartQuotation] finalize-quotation response", {
        quoteKey: created?.quotation?.quoteKey,
        _id: created?.quotation?._id,
        hasPdfUrl: Boolean(created?.pdf?.pdfUrl || created?.quotation?.finalQuotationPdfUrl),
        pdfError: created?.pdfError || null,
        alreadyExists: created?.alreadyExists,
      });
      const baseQt = created.quotation ?? created;
      const pdfUrl =
        created.pdf?.pdfUrl ||
        baseQt.finalQuotationPdfUrl ||
        baseQt.quotationPdfUrl ||
        "";
      const letterFromServer = (created.quotation?.options ?? []).find(
        (o) => String(o?.clientOptionId || "") === String(option.optionId),
      )?.id;
      const optionApiId = letterFromServer || optionLetterForApi(option.optionId, optionIndex);
      const quotation = {
        ...baseQt,
        _id: baseQt._id ?? baseQt.id,
        customerName: baseQt.customerName || form.customerName,
        customerPhone: baseQt.customerPhone || form.customerPhone,
        finalTotal: baseQt.finalTotal ?? option?.totalPrice ?? option?.total ?? 0,
        selectedOption: baseQt.selectedOption ?? option,
        recommendedOptionLabel: option?.optionLabel || option?.type,
        status: baseQt.status || "Pending",
        optionId: option.optionId,
        optionApiId,
        optionIndexFromCard: optionIndex,
        quotationId: baseQt._id ?? baseQt.id,
        pdfUrl,
      };
      console.log("Selected Option:", option.optionId);
      console.log("Quotation Data:", quotation.selectedOption ?? option);
      console.log("Generated PDF:", pdfUrl || "(pending)");
      setCreatedQuotations((m) => ({ ...m, [key]: quotation }));
      if (created.recommendationSheet) {
        setResult((prev) => ({ ...(prev || {}), recommendationSheet: created.recommendationSheet }));
      }
      onQuotationCreated?.(quotation);

      if (created.pdfError) {
        const hint = created.quotation?._id ? ` Quotation id: ${created.quotation._id}.` : "";
        setError(`Quotation was created but PDF generation failed: ${created.pdfError}${hint}`);
      }

      const rawPdf =
        created.pdf?.pdfUrl || created.quotation?.finalQuotationPdfUrl || created.quotation?.quotationPdfUrl;
      const qtMongoId = quotation._id || created.quotation?._id || created.quotation?.id;
      const qtPublicId = quotation.quoteKey || quotation.id || qtMongoId;
      if (rawPdf) {
        openQuotationPdfPreview(rawPdf, `${quotation.quoteKey || quotation.id || "Quotation"} · ${option.optionId}`);
      } else if (!created.pdfError) {
        try {
          const data = await api.generateFinalQuotationPdf(qtMongoId || qtPublicId, {
            optionId: optionApiId,
          });
          const updated = data.quotation ?? quotation;
          const fallbackRaw = data.pdf?.pdfUrl || updated.finalQuotationPdfUrl || updated.quotationPdfUrl;
          const merged = { ...updated, pdfUrl: fallbackRaw || updated.pdfUrl || "" };
          setCreatedQuotations((m) => ({ ...m, [key]: merged }));
          onQuotationCreated?.(merged);
          console.log("Selected Option:", option.optionId);
          console.log("Quotation Data:", merged.selectedOption ?? option);
          console.log("Generated PDF:", fallbackRaw || "(pending)");
          if (fallbackRaw) openQuotationPdfPreview(fallbackRaw, `${updated.quoteKey || updated.id} · ${option.optionId}`);
          else setError("Quotation saved but the server did not return a PDF URL. Try “PDF” or check server logs.");
        } catch (e2) {
          console.error("[SmartQuotation] fallback generateFinalQuotationPdf", e2);
          setError(e2.message || e2.details || "PDF could not be generated after create.");
        }
      }
    } catch (e) {
      console.error("[SmartQuotation] handleCreateQuotation", e);
      const detail = e.details ? ` ${String(e.details).slice(0, 500)}` : "";
      setError((e.message || "Could not create quotation") + detail);
    } finally {
      setActionBusyLabel("");
    }
  };

  const downloadPdfForOption = async (optionStableId) => {
    const qt = createdQuotations[optionStableId];
    if (!qt) return;
    const selectedOption = qt.selectedOption || qt;
    const stored =
      qt.pdfUrl || qt.finalQuotationPdfUrl || qt.quotationPdfUrl;
    console.log("Selected Option:", optionStableId);
    console.log("Quotation Data:", selectedOption);
    console.log("Generated PDF:", stored || "(will regenerate)");
    if (stored) {
      openQuotationPdfPreview(stored, `${qt.quoteKey || qt.quotationId || qt.id || "Quotation"} · ${optionStableId}`);
      return;
    }
    setActionBusyLabel(optionStableId);
    setError("");
    try {
      const qid = qt._id || qt.quotationId || qt.id || qt.quoteKey;
      const letter = qt.optionApiId ?? optionLetterForApi(optionStableId, qt.optionIndexFromCard);
      const data = await api.generateFinalQuotationPdf(qid, { optionId: letter });
      const updated = data.quotation ?? qt;
      const raw = data.pdf?.pdfUrl || updated.finalQuotationPdfUrl || updated.quotationPdfUrl;
      const merged = { ...updated, pdfUrl: raw || updated.pdfUrl || "" };
      setCreatedQuotations((m) => ({ ...m, [optionStableId]: merged }));
      onQuotationCreated?.(merged);
      console.log("Selected Option:", optionStableId);
      console.log("Quotation Data:", merged.selectedOption || selectedOption);
      console.log("Generated PDF:", raw || "(pending)");
      if (raw) openQuotationPdfPreview(raw, `${merged.quoteKey || merged.id} · ${optionStableId}`);
    } catch (e) {
      console.error("[SmartQuotation] downloadPdfForOption", e);
      setError(e.message || e.details || "PDF generation failed");
    } finally {
      setActionBusyLabel("");
    }
  };

  const approveAndSendWhatsAppForOption = async (optionStableId) => {
    const qt = createdQuotations[optionStableId];
    if (!qt) return;
    setActionBusyLabel(optionStableId);
    setError("");
    try {
      const qid = qt.quotationId || qt._id || qt.id || qt.quoteKey;
      const letter = qt.optionApiId ?? optionLetterForApi(optionStableId, qt.optionIndexFromCard);
      const data = await api.approveAndSendFinalQuotationWhatsApp(qid, { optionId: letter });
      const updated = data.quotation ?? qt;
      const merged = {
        ...qt,
        ...updated,
        quotationId: updated._id || qt.quotationId,
        quoteKey: updated.quoteKey || qt.quoteKey,
        pdfUrl: updated.finalQuotationPdfUrl || updated.quotationPdfUrl || qt.pdfUrl,
        status: updated.status || qt.status,
      };
      setCreatedQuotations((m) => ({ ...m, [optionStableId]: merged }));
      onQuotationCreated?.(merged);
      if (data.whatsapp && !data.whatsapp.sent) {
        setError(`WhatsApp: ${data.whatsapp.error || data.whatsapp.message || "Not sent"}`);
      }
    } catch (e) {
      console.error("[SmartQuotation] approveAndSendWhatsAppForOption", e);
      setError(e.message || e.details || "Approve & send WhatsApp failed");
    } finally {
      setActionBusyLabel("");
    }
  };

  return (
    <>
    <div className="modal-overlay">
      <div className="modal" style={{ width: 920, maxWidth: "96vw" }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Quotation — Inverter + Battery Options</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Compare options · Create quotation (generates PDF) · Approve &amp; send on WhatsApp when ready
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="modal-body scrollable" style={{ maxHeight: "70vh" }}>
          <div className="section-title">Customer details</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Customer name</label>
              <input className="form-input" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone (WhatsApp)</label>
              <input className="form-input" value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Quotation type</label>
            <select
              className="form-select"
              value={form.quotationKind}
              onChange={(e) => {
                setForm((f) => ({ ...f, quotationKind: e.target.value }));
                setPreview(null);
                setSelected(null);
              }}
            >
              {Object.entries(QUOTATION_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Address (for PDF)</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Customer address"
              value={form.customerAddress}
              onChange={(e) => set("customerAddress", e.target.value)}
            />
          </div>

          {(form.quotationKind === "combo" || form.quotationKind === "inverter" || form.quotationKind === "battery") && (
            <>
              <div className="section-title" style={{ marginTop: 8 }}>
                Home load & backup
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">House / flat type</label>
                  <select className="form-select" value={form.flatType} onChange={(e) => set("flatType", e.target.value)}>
                    {["1RK", "1BHK", "2BHK", "3BHK"].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Number of rooms (optional)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 3"
                    value={form.numberOfRooms}
                    onChange={(e) => set("numberOfRooms", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Backup hours (target)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={12}
                    value={form.backupHours}
                    onChange={(e) => set("backupHours", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Budget type</label>
                  <select className="form-select" value={form.budgetType} onChange={(e) => set("budgetType", e.target.value)}>
                    <option>Budget</option>
                    <option>Recommended</option>
                    <option>Premium</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Preferred brand (optional)</label>
                  <input
                    className="form-input"
                    placeholder="Exide, Luminous, Amaron…"
                    value={form.preferredBrand}
                    onChange={(e) => set("preferredBrand", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Custom load (W) — optional fallback</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="Used when no appliances added (combo)"
                    value={form.totalLoad}
                    onChange={(e) => set("totalLoad", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {form.quotationKind === "combo" && (
            <>
              <div className="form-group">
                <label className="form-label">Recommendation mode</label>
                <select
                  className="form-input"
                  value={form.recommendationMode}
                  onChange={(e) => set("recommendationMode", e.target.value)}
                >
                  {RECOMMENDATION_MODES.map((m) => (
                    <option key={m} value={m}>
                      {RECOMMENDATION_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  {form.recommendationMode === RECOMMENDATION_MODE_DYNAMIC
                    ? "Pairs separate inverter + battery SKUs from inverter_inventory and battery_inventory (exact standard VA/Ah)."
                    : "Uses ready-made bundles from Inv + Battery combo inventory (promotional / festival offers)."}
                </div>
              </div>
              <div className="section-title" style={{ marginTop: 12 }}>
                Inverter & battery brand (combo SKU)
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Inverter brand</label>
                  <input
                    className="form-input"
                    disabled={form.inverterBrandAny}
                    placeholder="e.g. Luminous"
                    value={form.inverterBrand}
                    onChange={(e) => set("inverterBrand", e.target.value)}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={form.inverterBrandAny}
                      onChange={(e) => set("inverterBrandAny", e.target.checked)}
                    />
                    Any brand
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">Battery brand</label>
                  <input
                    className="form-input"
                    disabled={form.batteryBrandAny}
                    placeholder="e.g. Exide"
                    value={form.batteryBrand}
                    onChange={(e) => set("batteryBrand", e.target.value)}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={form.batteryBrandAny}
                      onChange={(e) => set("batteryBrandAny", e.target.checked)}
                    />
                    Any brand
                  </label>
                </div>
              </div>
              {form.recommendationMode === RECOMMENDATION_MODE_DYNAMIC && (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Brand pairing preference</label>
                  <select
                    className="form-select"
                    value={form.brandPairingPreference}
                    onChange={(e) => set("brandPairingPreference", e.target.value)}
                  >
                    {BRAND_PAIRING_PREFERENCES.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    Same brand only pairs Exide+Exide, Luminous+Luminous, etc. Mixed allows cross-brand combos.
                  </div>
                </div>
              )}
              <div className="section-title" style={{ marginTop: 12 }}>
                Optional services (included in option totals)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {OPTIONAL_SERVICE_FIELDS.map(({ key, label, defaultAmount }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      padding: "8px 10px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      background: form[key] ? "#f0fdf4" : "#fff",
                    }}
                  >
                    <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked)} />
                    {label}
                    {form[key] && (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#059669" }}>
                        ₹{Number(form[`${key}Amount`] ?? defaultAmount).toLocaleString("en-IN")}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Battery exchange mode</label>
                <select
                  className="form-select"
                  value={form.batteryExchangeMode}
                  onChange={(e) => set("batteryExchangeMode", e.target.value)}
                >
                  {BATTERY_EXCHANGE_MODES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {form.recommendationMode === RECOMMENDATION_MODE_DYNAMIC && (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Battery type (multi-select)</label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    {HOME_BATTERY_TYPES.map((type) => (
                      <label
                        key={type}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          padding: "8px 10px",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          background: form.batteryTypes.includes(type) ? "#f0f9ff" : "#fff",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.batteryTypes.includes(type)}
                          onChange={() =>
                            setForm((f) => ({ ...f, batteryTypes: toggleBatteryType(f.batteryTypes, type) }))
                          }
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                    Leave all unchecked to include every battery type. Select one or more to restrict recommendations.
                  </div>
                  <FilterChips chips={activeFilterChips(form, preview)} />
                </div>
              )}
              <ApplianceLoadBuilder
                appliances={form.appliances}
                onChange={(rows) => setForm((f) => ({ ...f, appliances: rows }))}
              />
            </>
          )}

          {(form.quotationKind === "inverter") && (
            <div className="form-group">
              <label className="form-label">Extra notes (optional)</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Any context for the customer PDF"
                value={form.customerRequirements}
                onChange={(e) => set("customerRequirements", e.target.value)}
              />
            </div>
          )}

          {form.quotationKind === "combo" && (
            <div className="form-group">
              <label className="form-label">Extra notes for PDF (optional)</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Special instructions — shown in addition to appliance summary"
                value={form.customerRequirements}
                onChange={(e) => set("customerRequirements", e.target.value)}
              />
            </div>
          )}

          {form.quotationKind === "battery" && (
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input
                className="form-input"
                placeholder="Any preference or constraints"
                value={form.customerRequirements}
                onChange={(e) => set("customerRequirements", e.target.value)}
              />
            </div>
          )}

          {form.quotationKind === "car" && <VehicleBatteryPicker mode="car" form={form} set={set} />}

          {form.quotationKind === "bike" && <VehicleBatteryPicker mode="bike" form={form} set={set} />}

          <div className="section-title" style={{ marginTop: 8 }}>
            Add items from inventory (optional)
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
            Pick extra batteries/accessories — prices are taken from your current stock sell rate.
          </p>
          <div className="item-row" style={{ marginBottom: 12 }}>
            <select className="form-select" style={{ flex: 1 }} value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
              <option value="">Select product from inventory...</option>
              {inStock.map((b) => (
                <option key={b.id} value={b.id}>
                  {inventoryLabel(b)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-outline" onClick={addFromInventory} disabled={!addItemId}>
              <i className="ti ti-plus"></i> Add item
            </button>
          </div>
          {extraItems.length > 0 && (
            <div className="card" style={{ marginBottom: 16, padding: 12 }}>
              {extraItems.map((it, idx) => (
                <div key={idx} className="item-row">
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {it.model} · ₹{Number(it.rate).toLocaleString("en-IN")} × {it.qty}
                  </span>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeExtra(idx)}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
              <div style={{ marginTop: 8, fontWeight: 600, textAlign: "right" }}>
                Extra items total: ₹{extraItems.reduce((a, i) => a + i.qty * i.rate, 0).toLocaleString("en-IN")}
              </div>
            </div>
          )}

          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Recommendation sheets are for comparing options only. WhatsApp sharing happens from the final quotation (Stage 2).
          </label>
          {!preview?.suggestedOptions?.length && !result && (
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Tip: click <strong>Preview options</strong> first, or save directly — options will be built automatically from inventory.
            </p>
          )}

          {error && (
            <div className="profit-alert loss" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          {preview && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  background: "linear-gradient(135deg, #0f172a 0%, #0369a1 100%)",
                  color: "#fff",
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {QUOTATION_KIND_LABELS[preview.quotationKind] || "Quotation"} — {form.customerName || "customer"}
                  {preview.recommendationMode && (
                    <span style={{ fontWeight: 500, fontSize: 13, marginLeft: 8, opacity: 0.9 }}>
                      · {RECOMMENDATION_MODE_LABELS[preview.recommendationMode] || preview.recommendationMode}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                  {(preview.flatType || preview.backupHours != null) && (
                    <>
                      {preview.flatType ? `${preview.flatType} · ` : ""}
                      {preview.backupHours != null ? `${preview.backupHours}h backup · ` : ""}
                      {preview.budgetType ? `${preview.budgetType} · ` : ""}
                      {preview.totalLoad != null ? `Est. load ~${preview.totalLoad}W` : ""}
                    </>
                  )}
                  {preview.quotationKind === "car" && (
                    <>
                      {preview.vehicleBrand || preview.vehicleModel
                        ? `${preview.vehicleBrand || ""} ${preview.vehicleModel || ""} · ${preview.fuelType || ""}`
                        : "Car battery match"}
                    </>
                  )}
                  {preview.quotationKind === "bike" && (
                    <>{preview.bikeBrand || preview.bikeModel ? `${preview.bikeBrand} ${preview.bikeModel}` : "Bike battery match"}</>
                  )}
                </div>
                {(preview.inverterRange || preview.batteryRange) && (
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                    {preview.inverterRange ? `Inverter: ${preview.inverterRange}` : ""}
                    {preview.inverterRange && preview.batteryRange ? " · " : ""}
                    {preview.batteryRange ? `Battery: ${preview.batteryRange}` : ""}
                  </div>
                )}
                {preview.quotationKind === "combo" && <FilterChips chips={activeFilterChips(form, preview)} />}
                {preview.loadSizing && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Appliance load breakdown</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ opacity: 0.85 }}>
                          <th style={{ textAlign: "left", padding: "4px 0" }}>Item</th>
                          <th style={{ textAlign: "right" }}>Qty</th>
                          <th style={{ textAlign: "right" }}>Line W</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.loadSizing.lines?.map((l, i) => (
                          <tr key={i}>
                            <td style={{ padding: "2px 0" }}>
                              {l.categoryLabel} — {l.typeLabel}
                            </td>
                            <td style={{ textAlign: "right" }}>{l.quantity}</td>
                            <td style={{ textAlign: "right" }}>{l.lineWatts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 8 }}>
                      <strong>Total:</strong> {preview.loadSizing.totalWatts} W · <strong>VA:</strong>{" "}
                      {preview.loadSizing.calculatedVA} → {preview.loadSizing.roundedVA} VA · <strong>Ah:</strong>{" "}
                      {preview.loadSizing.calculatedAH} → {preview.loadSizing.roundedAH} Ah
                    </div>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                Prices and tiers use your branch inventory first{userBranchName ? ` (${userBranchName})` : ""}. Other branches appear only when stock is unavailable here.
              </p>
              <p style={{ fontSize: 12, color: "#0369a1", marginBottom: 12, lineHeight: 1.5 }}>
                <strong>Per option:</strong> use <strong>Create quotation</strong> on each row you want to offer — each gets its own saved quotation and PDF.
                Use <strong>PDF</strong> to preview or regenerate that row&apos;s file. Use <strong>Approve &amp; send WhatsApp</strong> only for the quote you are sending to the customer.
              </p>
              {transferMsg && (
                <div
                  className={transferMsg.includes("requested") ? "profit-alert gain" : "profit-alert loss"}
                  style={{ marginBottom: 12 }}
                >
                  {transferMsg}
                </div>
              )}
              {preview.crossBranchHints?.length > 0 && (
                <div className="card" style={{ marginBottom: 12, padding: 12, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Available at other branches</div>
                  {preview.crossBranchHints.slice(0, 5).map((hint, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        marginBottom: 10,
                        paddingBottom: 10,
                        borderBottom: i < preview.crossBranchHints.slice(0, 5).length - 1 ? "1px solid #dbeafe" : "none",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {hint.brand} {hint.model}
                      </div>
                      <div style={{ color: "#6b7280", marginBottom: 4 }}>
                        {userBranchName || "Your branch"}: out of stock
                      </div>
                      {hint.otherBranches?.slice(0, 3).map((ob) => (
                        <div key={ob.branchId} style={{ color: "#059669", marginBottom: 2 }}>
                          {ob.branchName}: available (Qty: {ob.quantity})
                        </div>
                      ))}
                      {hint.transferSource && userBranchId && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          style={{ marginTop: 6 }}
                          onClick={() => requestTransferFromHint(hint)}
                        >
                          Request transfer from {hint.transferSource.branchName}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid-2">
                {preview.suggestedOptions?.map((opt, i) => {
                  const oid = stableOptionId(opt, i);
                  return (
                  <OptionCard
                    key={oid}
                    option={opt}
                    selected={selected?.optionId === oid || (!selected?.optionId && selected?.optionLabel === opt.optionLabel)}
                    onSelect={setSelected}
                    showQuotationActions
                    createdQuotation={createdQuotations[oid]}
                    onCreateQuotation={() => handleCreateQuotation(opt, oid, i)}
                    onDownloadPdf={() => downloadPdfForOption(oid)}
                    onApproveAndSendWhatsApp={() => approveAndSendWhatsAppForOption(oid)}
                    busy={actionBusyLabel === oid}
                    batteryExchangeMode={form.batteryExchangeMode}
                  />
                  );
                })}
              </div>
              <OptionsTable options={preview.suggestedOptions} />
            </div>
          )}

          {result && (
            <div className="profit-alert gain" style={{ marginTop: 16, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Quotation saved</div>
              <div>
                <strong>1. Saved</strong> — {result.recommendationSheet?.sheetKey || result.recommendationSheet?.id || "OK"}
              </div>
              <div>
                <strong>2. PDF (A4)</strong> —{" "}
                {result.recommendationSheet?.recommendationPdfUrl || result.pdf?.pdfUrl ? (
                  <a
                    href={pdfHref(result.recommendationSheet?.recommendationPdfUrl || result.pdf?.pdfUrl)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#6B21D8", fontWeight: 600 }}
                  >
                    Open / download quotation PDF
                  </a>
                ) : (
                  "Not generated"
                )}
              </div>
              <div>
                <strong>3. Next step</strong> — Click <strong>Create Quotation</strong> to generate the final PDF and open the preview.
                Use <strong>Approve &amp; Send WhatsApp</strong> only after the PDF looks correct. Convert to an invoice from the Quotations
                page once the customer approves.
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <>
              <button className="btn btn-outline" onClick={previewOptions} disabled={loading}>
                {loading ? "Working…" : "Preview options"}
              </button>
              <button
                className="btn btn-primary"
                onClick={generate}
                disabled={loading || !form.customerName.trim() || !form.customerPhone.trim()}
              >
                {loading ? (
                  "Saving…"
                ) : (
                  <>
                    <i className="ti ti-file-download"></i> Save Quotation &amp; PDF
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    {pdfPreview && (
      <div
        className="modal-overlay"
        style={{ zIndex: 10050, background: "rgba(15, 23, 42, 0.65)" }}
        onClick={() => setPdfPreview(null)}
        role="presentation"
      >
        <div
          className="modal"
          style={{ width: 920, maxWidth: "98vw", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header" style={{ flexShrink: 0 }}>
            <div className="modal-title">{pdfPreview.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a className="btn btn-sm btn-outline" href={pdfPreview.url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
              <button type="button" className="close-btn" onClick={() => setPdfPreview(null)} aria-label="Close PDF preview">
                <i className="ti ti-x"></i>
              </button>
            </div>
          </div>
          <div className="modal-body" style={{ padding: 0, flex: 1, minHeight: "70vh", background: "#525659" }}>
            <iframe title="Quotation PDF preview" src={pdfPreview.url} style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none" }} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export function SmartQuotationViewModal({ qt, onClose }) {
  const options = qt.suggestedOptions || qt.options || [];
  const pdf = pdfHref(qt.recommendationPdfUrl || qt.quotationPdfUrl || qt.pdfUrl);
  const sizing = qt.requirements?.loadSizing;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 820, maxWidth: "95vw" }}>
        <div className="modal-header">
          <div className="modal-title">
            {qt.id} — {qtCustomer(qt)}
          </div>
          <button className="close-btn" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="modal-body scrollable" style={{ maxHeight: "70vh" }}>
          <div style={{ marginBottom: 16, fontSize: 13, color: "#6b7280" }}>
            <div>
              <strong>Type:</strong>{" "}
              {qt.quotationKind ? QUOTATION_KIND_LABELS[qt.quotationKind] || qt.quotationKind : "—"}
            </div>
            <div>
              <strong>Phone:</strong> {qtPhone(qt)}
            </div>
            {qt.customerAddress && (
              <div>
                <strong>Address:</strong> {qt.customerAddress}
              </div>
            )}
            <div>
              <strong>Summary:</strong> {qtSummary(qt)}
            </div>
            {qt.totalLoad ? (
              <div>
                <strong>Load:</strong> ~{qt.totalLoad}W
              </div>
            ) : null}
            {sizing?.lines?.length ? (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <strong>Sized at:</strong> {sizing.roundedVA} VA / {sizing.roundedAH} Ah (from appliance table)
              </div>
            ) : null}
            {(qt.customerRequirements || qt.roomNotes) && (
              <div>
                <strong>Notes:</strong> {qt.customerRequirements || qt.roomNotes}
              </div>
            )}
          </div>

          {qt.extraItems?.length > 0 && (
            <div className="card" style={{ marginBottom: 16, padding: 12 }}>
              <div className="section-title" style={{ fontSize: 13 }}>Additional inventory items</div>
              {qt.extraItems.map((it, i) => (
                <div key={i} style={{ fontSize: 13, padding: "4px 0" }}>
                  {it.model} — ₹{Number(it.rate).toLocaleString("en-IN")} × {it.qty}
                </div>
              ))}
            </div>
          )}

          {options.length > 0 ? (
            <>
              <div className="grid-2">
                {options.map((opt, i) => (
                  <OptionCard
                    key={opt.optionLabel || opt.id || i}
                    option={opt}
                    batteryExchangeMode={qt.batteryExchangeMode ?? qt.pricingMode ?? "withOld"}
                  />
                ))}
              </div>
              <OptionsTable options={options} />
            </>
          ) : qt.items?.length > 0 ? (
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Qty</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {qt.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.model}</td>
                    <td>{it.qty}</td>
                    <td>₹{Number(it.rate).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No options stored on this quotation</div>
          )}

          {pdf && (
            <div style={{ marginTop: 20 }}>
              <a className="btn btn-primary" href={pdf} target="_blank" rel="noreferrer">
                <i className="ti ti-file-download"></i> Download Recommendation PDF (A4)
              </a>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
