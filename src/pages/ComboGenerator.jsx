import { useState } from "react";
import { combosApi } from "../api/axiosClient.js";
import ComparisonTable from "../components/ComparisonTable.jsx";

export default function ComboGenerator() {
  const [req, setReq] = useState({ flatType: "1BHK", backupHours: 4, budgetTier: "Medium", customerType: "Retail" });
  const [result, setResult] = useState(null);

  const run = async () => {
    const data = await combosApi.recommend(req);
    setResult(data);
  };

  const options = result?.recommendations?.map((r) => ({
    optionLabel: r.comboName || r.optionType,
    badge: r.optionType,
    battery: { modelName: r.battery?.modelName ?? r.battery?.model, capacityAh: r.battery?.capacityAh ?? r.battery?.ah, brand: r.battery?.brand },
    inverter: { modelName: r.inverter?.modelName ?? r.inverter?.model, inverterVA: r.requiredInverterVa },
    estimatedBackup: r.estimatedBackup,
    totalLoad: r.totalLoad,
    totalPrice: r.totalPrice,
    comparisonNote: r.bestFor,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Combo Generator</h1>
      <div className="flex flex-wrap gap-3">
        <select className="rounded border px-3 py-2" value={req.flatType} onChange={(e) => setReq({ ...req, flatType: e.target.value })}>
          {["1RK", "1BHK", "2BHK", "3BHK"].map((f) => <option key={f}>{f}</option>)}
        </select>
        <input type="number" className="rounded border px-3 py-2 w-28" value={req.backupHours} onChange={(e) => setReq({ ...req, backupHours: Number(e.target.value) })} />
        <button type="button" onClick={run} className="rounded-lg bg-sky-600 px-4 py-2 text-white">Recommend</button>
      </div>
      {result && (
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-4 text-sm">Estimated load: <strong>{result.totalLoad}W</strong></p>
          <ComparisonTable options={options} />
        </div>
      )}
    </div>
  );
}
