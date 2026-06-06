export default function RecommendationBadge({ label = "Recommended" }) {
  const styles = {
    Budget: "bg-emerald-100 text-emerald-800",
    Recommended: "bg-sky-100 text-sky-800",
    Premium: "bg-amber-100 text-amber-800",
    "Long Backup": "bg-violet-100 text-violet-800",
    "Best Value": "bg-emerald-100 text-emerald-800",
    "Premium Choice": "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[label] || "bg-slate-100 text-slate-700"}`}>
      {label}
    </span>
  );
}
