import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const emptyVehicle = {
  vehicleTypeId: "",
  brand: "",
  model: "",
  variant: "",
  fuelType: "",
  yearFrom: "",
  yearTo: "",
  fitmentGroupId: "",
};

const emptyFitment = {
  name: "",
  code: "",
  voltage: "",
  minAh: "",
  maxAh: "",
  batteryType: "",
  length: "",
  width: "",
  height: "",
  terminalConfiguration: "",
  polarity: "",
  mountingInformation: "",
  notes: "",
};

export function VehicleFitmentAdmin() {
  const [tab, setTab] = useState("vehicles");
  const [types, setTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState(emptyVehicle);
  const [editingId, setEditingId] = useState("");
  const [fitForm, setFitForm] = useState(emptyFitment);
  const [editingFit, setEditingFit] = useState("");
  const [msg, setMsg] = useState("");
  const [importSummary, setImportSummary] = useState(null);

  const load = async () => {
    const [t, g, v] = await Promise.all([
      api.vehicles.catalog.types(),
      api.vehicles.admin.fitmentGroups(),
      api.vehicles.admin.vehicles({ q, vehicleTypeId: typeFilter }),
    ]);
    setTypes(t.types || []);
    setGroups(Array.isArray(g) ? g : []);
    setVehicles(Array.isArray(v) ? v : []);
  };

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [q, typeFilter]);

  const saveVehicle = async () => {
    try {
      if (editingId) await api.vehicles.admin.updateVehicle(editingId, form);
      else await api.vehicles.admin.createVehicle(form);
      setForm(emptyVehicle);
      setEditingId("");
      setMsg("Vehicle saved");
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const saveFitment = async () => {
    try {
      if (editingFit) await api.vehicles.admin.updateFitment(editingFit, fitForm);
      else await api.vehicles.admin.createFitment(fitForm);
      setFitForm(emptyFitment);
      setEditingFit("");
      setMsg("Fitment group saved");
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Vehicle Compatibility</div>
          <div className="page-sub">Admin: vehicles, fitment groups, and CSV/XLSX import. No guessed mappings.</div>
        </div>
      </div>
      <div className="tabs">
        <div className={`tab ${tab === "vehicles" ? "active" : ""}`} onClick={() => setTab("vehicles")}>Vehicles</div>
        <div className={`tab ${tab === "fitments" ? "active" : ""}`} onClick={() => setTab("fitments")}>Battery Fitment Groups</div>
        <div className={`tab ${tab === "import" ? "active" : ""}`} onClick={() => setTab("import")}>Import Vehicle Fitments</div>
      </div>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}

      {tab === "vehicles" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">{editingId ? "Edit vehicle" : "Add vehicle"}</div>
            <div className="grid-3">
              <div className="form-group">
                <label className="form-label">Vehicle Type</label>
                <select className="form-select" value={form.vehicleTypeId} onChange={(e) => setForm({ ...form, vehicleTypeId: e.target.value })}>
                  <option value="">Select…</option>
                  {types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Brand</label><input className="form-input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Model</label><input className="form-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Variant</label><input className="form-input" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Fuel Type</label><input className="form-input" value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Year From</label><input className="form-input" type="number" value={form.yearFrom} onChange={(e) => setForm({ ...form, yearFrom: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Year To</label><input className="form-input" type="number" value={form.yearTo} onChange={(e) => setForm({ ...form, yearTo: e.target.value })} /></div>
              <div className="form-group">
                <label className="form-label">Battery Fitment Group</label>
                <select className="form-select" value={form.fitmentGroupId} onChange={(e) => setForm({ ...form, fitmentGroupId: e.target.value })}>
                  <option value="">None (fitment unavailable)</option>
                  {groups.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="button" onClick={saveVehicle}>{editingId ? "Save" : "+ Add Vehicle"}</button>
            {editingId && <button className="btn btn-secondary" type="button" style={{ marginLeft: 8 }} onClick={() => { setEditingId(""); setForm(emptyVehicle); }}>Cancel</button>}
          </div>
          <div className="card">
            <div className="filter-row">
              <input className="form-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
              <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th><th>Brand</th><th>Model</th><th>Variant</th><th>Fuel</th><th>Years</th><th>Fitment</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((row) => (
                    <tr key={row.id}>
                      <td>{row.vehicleTypeName}</td>
                      <td>{row.brandName}</td>
                      <td>{row.modelName}</td>
                      <td>{row.name || "—"}</td>
                      <td>{row.fuelType || "—"}</td>
                      <td>{[row.yearFrom, row.yearTo].filter(Boolean).join("–") || "—"}</td>
                      <td>{row.fitmentGroupName || "—"}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            vehicleTypeId: row.vehicleTypeId,
                            brand: row.brandName,
                            model: row.modelName,
                            variant: row.name || "",
                            fuelType: row.fuelType || "",
                            yearFrom: row.yearFrom || "",
                            yearTo: row.yearTo || "",
                            fitmentGroupId: row.fitmentGroupId || "",
                          });
                        }}>Edit</button>
                        <button className="btn btn-sm btn-secondary" type="button" onClick={async () => { await api.vehicles.admin.duplicateVehicle(row.id); load(); }}>Duplicate</button>
                        <button className="btn btn-sm btn-danger" type="button" onClick={async () => { await api.vehicles.admin.deleteVehicle(row.id); load(); }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "fitments" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">{editingFit ? "Edit fitment group" : "Add fitment group"}</div>
            <div className="grid-3">
              {Object.keys(emptyFitment).map((k) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{k}</label>
                  <input className="form-input" value={fitForm[k]} onChange={(e) => setFitForm({ ...fitForm, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" type="button" onClick={saveFitment}>{editingFit ? "Save" : "Create group"}</button>
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Name</th><th>V</th><th>Ah</th><th>Type</th><th></th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g._id}>
                    <td>{g.name}</td>
                    <td>{g.voltage ?? "—"}</td>
                    <td>{[g.minAh, g.maxAh].filter((n) => n != null).join("–") || "—"}</td>
                    <td>{g.batteryType || "—"}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" type="button" onClick={() => {
                        setEditingFit(g._id);
                        setFitForm({
                          name: g.name || "",
                          code: g.code || "",
                          voltage: g.voltage ?? "",
                          minAh: g.minAh ?? "",
                          maxAh: g.maxAh ?? "",
                          batteryType: g.batteryType || "",
                          length: g.length ?? "",
                          width: g.width ?? "",
                          height: g.height ?? "",
                          terminalConfiguration: g.terminalConfiguration || "",
                          polarity: g.polarity || "",
                          mountingInformation: g.mountingInformation || "",
                          notes: g.notes || "",
                        });
                      }}>Edit</button>
                      <button className="btn btn-sm btn-danger" type="button" onClick={async () => { await api.vehicles.admin.deleteFitment(g._id); load(); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "import" && (
        <div className="card">
          <p style={{ marginBottom: 12 }}>Import verified fitment rows only. Invalid and duplicate rows are reported, not guessed. The template is format-only — do not treat example rows as real vehicle data.</p>
          <button className="btn btn-secondary" type="button" style={{ marginRight: 12, marginBottom: 12 }} onClick={() => api.vehicles.admin.downloadTemplate().catch((e) => setMsg(e.message))}>
            Download CSV template
          </button>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setImportSummary(await api.vehicles.admin.importFitments(f));
                await load();
              } catch (err) {
                setMsg(err.message);
              }
            }}
          />
          {importSummary && (
            <div style={{ marginTop: 16 }}>
              <div>Total Rows: {importSummary.totalRows}</div>
              <div>Valid Rows: {importSummary.validRows}</div>
              <div>Invalid Rows: {importSummary.invalidRows}</div>
              <div>Duplicate Rows: {importSummary.duplicateRows}</div>
              <div>Imported Rows: {importSummary.importedRows}</div>
              {(importSummary.errors || []).length > 0 && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(importSummary.errors, null, 2)], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "vehicle-fitment-import-errors.json";
                    a.click();
                  }}
                >
                  Download error report
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
