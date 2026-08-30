import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

function Select({ label, value, onChange, options, placeholder, disabled, getId = (o) => o._id || o.id || o, getLabel = (o) => o.name || o }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const id = String(getId(o));
          return (
            <option key={id} value={id}>
              {getLabel(o)}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function VehicleBatteryRecommend({ apiOnline }) {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [variants, setVariants] = useState([]);
  const [fuels, setFuels] = useState([]);
  const [years, setYears] = useState([]);
  const [typeId, setTypeId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [fuel, setFuel] = useState("");
  const [year, setYear] = useState("");
  const [brandQ, setBrandQ] = useState("");
  const [result, setResult] = useState(null);
  const [showOos, setShowOos] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const needVariant = variants.some((v) => String(v.name || "").trim());
  const fuelOptions = useMemo(() => {
    const src = variantId ? variants.filter((v) => String(v._id) === String(variantId)) : variants;
    return [...new Set(src.map((v) => v.fuelType).filter((f) => String(f || "").trim()))];
  }, [variants, variantId]);
  const needFuel = fuelOptions.length > 0;
  const needYear = years.length > 0;

  useEffect(() => {
    if (!apiOnline) return;
    api.vehicles.catalog.types().then((d) => setTypes(d.types || [])).catch((e) => setErr(e.message));
  }, [apiOnline]);

  useEffect(() => {
    if (!typeId) {
      setBrands([]);
      return;
    }
    const t = setTimeout(() => {
      api.vehicles.catalog.brands({ vehicleTypeId: typeId, q: brandQ }).then((d) => setBrands(d.brands || [])).catch(() => setBrands([]));
    }, 250);
    return () => clearTimeout(t);
  }, [typeId, brandQ]);

  useEffect(() => {
    if (!brandId) {
      setModels([]);
      return;
    }
    api.vehicles.catalog.models({ brandId }).then((d) => setModels(d.models || [])).catch(() => setModels([]));
  }, [brandId]);

  useEffect(() => {
    if (!modelId) {
      setVariants([]);
      setFuels([]);
      return;
    }
    Promise.all([api.vehicles.catalog.variants({ modelId }), api.vehicles.catalog.fuels({ modelId })])
      .then(([v, f]) => {
        setVariants(v.variants || []);
        setFuels(f.fuels || []);
      })
      .catch(() => {
        setVariants([]);
        setFuels([]);
      });
  }, [modelId]);

  useEffect(() => {
    if (!variantId) {
      setYears([]);
      return;
    }
    api.vehicles.catalog.years({ variantId }).then((d) => setYears(d.years || [])).catch(() => setYears([]));
  }, [variantId]);

  const resolvedVariantId = useMemo(() => {
    if (variantId) return variantId;
    if (!needVariant && variants.length) {
      const byFuel = fuel ? variants.filter((v) => !v.fuelType || v.fuelType === fuel) : variants;
      return String((byFuel[0] || variants[0])._id);
    }
    return "";
  }, [variantId, needVariant, variants, fuel]);

  const find = async (includeOutOfStock = false) => {
    setErr("");
    setShowOos(includeOutOfStock);
    if (needFuel && !fuel) {
      setErr("Select fuel type.");
      return;
    }
    if (needYear && !year) {
      setErr("Select year.");
      return;
    }
    const id = resolvedVariantId;
    if (!id) {
      setErr("Select the vehicle details first. If lists are empty, an admin must import verified fitment data.");
      return;
    }
    setLoading(true);
    try {
      const data = await api.vehicles.catalog.recommend({ variantId: id, includeOutOfStock, year });
      setResult(data);
    } catch (e) {
      setErr(e.message || "Recommendation failed");
    } finally {
      setLoading(false);
    }
  };

  const selectBattery = (card) => {
    const kind = /bike|scooter/i.test(card.vehicle?.vehicleType || card.category || "") ? "bike" : "car";
    const p = new URLSearchParams({
      create: kind,
      vehicleBrand: card.vehicle?.brand || "",
      vehicleModel: card.vehicle?.model || "",
      fuelType: card.vehicle?.fuelType || fuel,
      variant: card.vehicle?.variant || "",
      fitmentGroup: card.vehicle?.fitmentGroup || "",
      productId: card.productId,
    });
    if (kind === "bike") {
      p.set("bikeBrand", card.vehicle?.brand || "");
      p.set("bikeModel", card.vehicle?.model || "");
    }
    navigate(`/shop/quotations?${p}`);
  };

  const v = result?.vehicle;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Vehicle battery recommendation</div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          Recommendations use verified fitment groups stored in the database, then match current branch inventory. Nothing is guessed.
        </p>
        <div className="grid-3">
          <Select
            label="Vehicle Type"
            value={typeId}
            onChange={(id) => {
              setTypeId(id);
              setBrandId("");
              setModelId("");
              setVariantId("");
              setFuel("");
              setYear("");
              setResult(null);
            }}
            options={types}
            placeholder="Select type…"
            getId={(o) => o._id}
          />
          <div className="form-group">
            <label className="form-label">Vehicle Brand</label>
            <input className="form-input" placeholder="Search brand" value={brandQ} onChange={(e) => setBrandQ(e.target.value)} disabled={!typeId} style={{ marginBottom: 8 }} />
            <select
              className="form-select"
              value={brandId}
              disabled={!typeId}
              onChange={(e) => {
                setBrandId(e.target.value);
                setModelId("");
                setVariantId("");
                setFuel("");
                setYear("");
                setResult(null);
              }}
            >
              <option value="">Select brand…</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
          <Select
            label="Vehicle Model"
            value={modelId}
            onChange={(id) => {
              setModelId(id);
              setVariantId("");
              setFuel("");
              setYear("");
              setResult(null);
            }}
            options={models}
            placeholder={brandId ? "Select model…" : "Select brand first"}
            disabled={!brandId}
            getId={(o) => o._id}
          />
        </div>
        <div className="grid-3">
          {needVariant && (
            <Select
              label="Variant"
              value={variantId}
              onChange={(id) => {
                setVariantId(id);
                setYear("");
                setResult(null);
              }}
              options={variants.filter((x) => String(x.name || "").trim())}
              placeholder="Select variant…"
              disabled={!modelId}
              getId={(o) => o._id}
              getLabel={(o) => o.name}
            />
          )}
          {needFuel && (
            <Select
              label="Fuel Type"
              value={fuel}
              onChange={setFuel}
              options={fuelOptions}
              placeholder="Select fuel…"
              disabled={!modelId}
              getId={(o) => o}
              getLabel={(o) => o}
            />
          )}
          {needYear && (
            <Select
              label="Year"
              value={year}
              onChange={setYear}
              options={years}
              placeholder="Select year…"
              getId={(o) => o}
              getLabel={(o) => o}
            />
          )}
        </div>
        <button className="btn btn-primary" type="button" onClick={() => find(false)} disabled={!apiOnline || loading}>
          {loading ? "Finding…" : "Find Compatible Batteries"}
        </button>
        {err && <div className="profit-alert loss" style={{ marginTop: 12 }}>{err}</div>}
      </div>

      {result && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Vehicle selected</div>
            <div style={{ fontSize: 15 }}>
              {[v?.vehicleTypeName, v?.brandName, v?.modelName, v?.name, v?.fuelType, year].filter(Boolean).join(" · ") || "—"}
            </div>
            {result.unavailable && (
              <div className="profit-alert loss" style={{ marginTop: 12 }}>{result.message}</div>
            )}
            {result.verifiedFitment && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#047857" }}>Verified vehicle fitment (from admin data — not claimed as 100% compatible).</div>
            )}
          </div>

          {!result.unavailable && (
            <>
              <div className="section-title">Compatible batteries</div>
              {(showOos ? [...(result.recommendations || [])] : result.recommendations || []).length === 0 ? (
                <div className="card">
                  <p>No compatible battery currently available in inventory.</p>
                  {(result.outOfStockCompatible || []).length > 0 && (
                    <button className="btn btn-secondary" type="button" onClick={() => find(true)}>
                      View Out-of-Stock Compatible Products
                    </button>
                  )}
                  <button className="btn btn-secondary" type="button" style={{ marginLeft: 8 }} onClick={() => find(true)}>
                    View All Compatible Products
                  </button>
                </div>
              ) : (
                <div className="grid-3">
                  {(result.recommendations || []).map((c) => (
                    <div key={c.productId} className="card">
                      <div style={{ height: 120, background: "#f8fafc", borderRadius: 8, overflow: "hidden", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {c.image ? <img src={c.image} alt="" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} /> : <span style={{ color: "#94a3b8", fontSize: 12 }}>No image</span>}
                      </div>
                      <div style={{ fontWeight: 800, letterSpacing: "0.04em" }}>{c.brand}</div>
                      <div>Model: {c.model}</div>
                      <div style={{ color: "#64748b", fontSize: 13 }}>SKU: {c.sku}</div>
                      <div style={{ margin: "8px 0" }}>{c.voltage ? `${c.voltage}V` : "—"} | {c.ah ? `${c.ah}Ah` : "—"}</div>
                      <div style={{ fontWeight: 700 }}>₹{Number(c.sellingPrice || 0).toLocaleString("en-IN")}</div>
                      <div>Stock: {c.stockQuantity}</div>
                      <div className="badge badge-blue" style={{ marginTop: 8 }}>{c.rankLabel}</div>
                      <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13 }}>
                        {Object.values(c.checks || {})
                          .filter((x) => x.status === "pass")
                          .map((x) => (
                            <li key={x.label}>✓ {x.label}</li>
                          ))}
                      </ul>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => navigate("/shop/inventory")}>
                          View Product
                        </button>
                        <button className="btn btn-sm btn-primary" type="button" onClick={() => selectBattery(c)}>
                          Select Battery
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
