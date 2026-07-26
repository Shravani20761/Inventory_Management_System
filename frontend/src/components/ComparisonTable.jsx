export default function ComparisonTable({ options = [] }) {
  if (!options.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900 text-left text-white">
          <tr>
            <th className="px-4 py-3">Option</th>
            <th className="px-4 py-3">Inverter</th>
            <th className="px-4 py-3">Battery</th>
            <th className="px-4 py-3">Backup</th>
            <th className="px-4 py-3">Price</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.optionLabel} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{o.optionLabel}</td>
              <td className="px-4 py-3">{o.inverter?.modelName || "—"} ({o.inverter?.inverterVA || "-"}VA)</td>
              <td className="px-4 py-3">{o.battery?.modelName} ({o.battery?.capacityAh}Ah)</td>
              <td className="px-4 py-3">{o.estimatedBackup}h</td>
              <td className="px-4 py-3 font-semibold">₹{Number(o.totalPrice).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
