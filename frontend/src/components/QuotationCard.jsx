import RecommendationBadge from "./RecommendationBadge.jsx";

export default function QuotationCard({ option, selected, onSelect }) {
  const battery = option.battery ?? {};
  const inverter = option.inverter ?? {};
  const batLabel = battery.batteryModelNumber || battery.modelName || "—";
  const invLabel = inverter.inverterModelNumber || inverter.modelName || "—";
  const invPrice = Number(inverter.inverterFinalPrice ?? inverter.sellingRate ?? 0);
  const bOld = Number(battery.withOldPrice ?? 0);
  const bNew = Number(battery.withoutOldPrice ?? 0);
  const comboNoOld = option.totalPriceWithoutOld;

  return (
    <article
      onClick={() => onSelect?.(option)}
      className={`cursor-pointer rounded-xl border-2 p-4 transition ${selected ? "border-sky-600 bg-sky-50" : "border-slate-200 bg-white hover:border-sky-300"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{option.optionLabel}</h3>
        <RecommendationBadge label={option.badge} />
      </div>
      <div className="space-y-2 text-base text-slate-600">
        <p>
          <strong>Inverter:</strong> {invLabel} ({inverter.inverterVA || option.requiredInverterVa} VA)
          {invPrice > 0 ? <span className="text-slate-500"> · ₹{invPrice.toLocaleString("en-IN")}</span> : null}
        </p>
        <p>
          <strong>Battery:</strong> {batLabel} ({battery.capacityAh} Ah)
          {(bOld > 0 || bNew > 0) && (
            <span className="block text-sm text-slate-500">
              With old: ₹{(bOld || 0).toLocaleString("en-IN")} · Without old: ₹
              {(bNew > 0 ? bNew : bOld || 0).toLocaleString("en-IN")}
            </span>
          )}
        </p>
        <p>
          <strong>Backup:</strong> ~{option.estimatedBackup} hrs · Load {option.totalLoad}W
        </p>
        {comboNoOld != null && comboNoOld !== option.totalPrice && (
          <p className="text-sm text-slate-500">
            Combo without old: ₹{Number(comboNoOld).toLocaleString("en-IN")}
          </p>
        )}
        <p className="text-sm">{option.comparisonNote}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-sky-700">₹{Number(option.totalPrice).toLocaleString("en-IN")}</p>
    </article>
  );
}
