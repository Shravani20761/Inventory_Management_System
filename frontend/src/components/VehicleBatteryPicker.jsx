import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import {
  listCarBrands,
  listCarModels,
  listCarFuelsFromJson,
  listBikeBrands,
  listBikeModels,
} from "../utils/vehicleBrandModels.js";
import "./VehicleBatteryPicker.css";

const VEHICLE_TYPE = { car: "four-wheeler", bike: "two-wheeler" };

const FUEL_FALLBACK = ["Petrol", "Diesel", "CNG", "EV"];

/**
 * Dependent brand → model dropdowns (data from `src/data/vehicleBrandModels.json`).
 * Car/bike battery compatibility preview still uses `/vehicles/compatible-batteries` when logged in.
 */
export function VehicleBatteryPicker({ mode, form, set }) {
  const vehicleType = mode === "car" ? VEHICLE_TYPE.car : VEHICLE_TYPE.bike;
  const brandKey = mode === "car" ? "vehicleBrand" : "bikeBrand";
  const modelKey = mode === "car" ? "vehicleModel" : "bikeModel";

  const brand = form[brandKey] ?? "";
  const model = form[modelKey] ?? "";
  const fuel = form.fuelType ?? "";

  const carBrands = useMemo(() => listCarBrands(), []);
  const bikeBrands = useMemo(() => listBikeBrands(), []);
  const brands = mode === "car" ? carBrands : bikeBrands;

  const models = useMemo(() => {
    if (!brand) return [];
    return mode === "car" ? listCarModels(brand) : listBikeModels(brand);
  }, [mode, brand]);

  const jsonFuels = useMemo(() => {
    if (mode !== "car" || !brand || !model) return [];
    return listCarFuelsFromJson(brand, model);
  }, [mode, brand, model]);

  const [apiFuels, setApiFuels] = useState([]);

  useEffect(() => {
    if (mode !== "car" || !brand || !model) {
      setApiFuels([]);
      return;
    }
    if (jsonFuels.length) {
      setApiFuels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { fuels } = await api.vehicles.fuels({ vehicleType, brand, model });
        if (!cancelled) setApiFuels(fuels?.length ? fuels : FUEL_FALLBACK);
      } catch {
        if (!cancelled) setApiFuels(FUEL_FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, vehicleType, brand, model, jsonFuels.length]);

  const carFuelChoices = useMemo(() => {
    if (jsonFuels.length) return jsonFuels;
    if (apiFuels.length) return apiFuels;
    return FUEL_FALLBACK;
  }, [jsonFuels, apiFuels]);

  const [compatible, setCompatible] = useState([]);
  const [compatErr, setCompatErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setCompatErr("");
    if (!brand.trim() || !model.trim()) {
      setCompatible([]);
      return;
    }
    if (mode === "car" && !fuel.trim()) {
      setCompatible([]);
      return;
    }
    (async () => {
      try {
        const data = await api.vehicles.compatibleBatteries({
          vehicleType,
          brand,
          model,
          fuelType: mode === "car" ? fuel : "",
        });
        if (!cancelled) setCompatible(data.batteries || []);
      } catch (e) {
        if (!cancelled) {
          setCompatible([]);
          setCompatErr(e.message || "");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, vehicleType, brand, model, fuel]);

  const onBrandChange = (e) => {
    const v = e.target.value;
    set(brandKey, v);
    set(modelKey, "");
    if (mode === "car") set("fuelType", "");
  };

  const onModelChange = (e) => {
    set(modelKey, e.target.value);
    if (mode === "car") set("fuelType", "");
  };

  const gridClass = mode === "car" ? "vb-grid vb-grid--car" : "vb-grid";

  return (
    <div className="vb-wrap">
      <p className="vb-title">
        {mode === "car" ? "Vehicle" : "Two-wheeler"}{" "}
        <span>· brand &amp; model from catalog (JSON)</span>
      </p>

      {compatErr && !String(compatErr).includes("401") && (
        <p className="vb-err" role="alert">
          {compatErr}
        </p>
      )}

      <div className={gridClass}>
        <div className="vb-field">
          <label className="vb-label" htmlFor={`vb-brand-${mode}`}>
            Brand
          </label>
          <select id={`vb-brand-${mode}`} className="vb-select" value={brand} onChange={onBrandChange}>
            <option value="">Select brand…</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="vb-field">
          <label className="vb-label" htmlFor={`vb-model-${mode}`}>
            Model
          </label>
          <select
            id={`vb-model-${mode}`}
            className="vb-select"
            value={model}
            onChange={onModelChange}
            disabled={!brand}
            aria-disabled={!brand}
          >
            <option value="">{brand ? "Select model…" : "Select brand first"}</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {mode === "car" && (
          <div className="vb-field">
            <label className="vb-label" htmlFor={`vb-fuel-${mode}`}>
              Fuel type
            </label>
            <select
              id={`vb-fuel-${mode}`}
              className="vb-select"
              value={fuel}
              onChange={(e) => set("fuelType", e.target.value)}
              disabled={!brand || !model}
              aria-disabled={!brand || !model}
            >
              <option value="">{brand && model ? "Select fuel…" : "Select brand & model first"}</option>
              {carFuelChoices.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <p className="vb-hint">
        Edit mappings in <code style={{ fontSize: "0.7rem", color: "#64748b" }}>src/data/vehicleBrandModels.json</code>. Battery
        match preview uses your MongoDB <code style={{ fontSize: "0.7rem", color: "#64748b" }}>vehicleCompatibility</code>{" "}
        collection when available.
      </p>

      {compatible.length > 0 && (
        <div className="vb-compat">
          <strong>In-stock matches ({compatible.length}):</strong>{" "}
          {compatible.map((b) => `${b.batteryCode} (${b.qty} qty)`).join(" · ")}
        </div>
      )}
    </div>
  );
}
