/** Home inverter battery types for dynamic recommendation filtering. */
export const HOME_BATTERY_TYPES = [
  "Jumbo Tubular",
  "Short Tubular",
  "Tall Tubular",
  "Flat Tubular",
];

export function normalizeBatteryTypeLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Normalize payload to canonical labels from {@link HOME_BATTERY_TYPES}. */
export function normalizeBatteryTypeSelection(input) {
  if (!Array.isArray(input)) return [];
  const canon = HOME_BATTERY_TYPES.map((t) => normalizeBatteryTypeLabel(t));
  const out = [];
  for (const raw of input) {
    const n = normalizeBatteryTypeLabel(raw);
    if (!n) continue;
    const idx = canon.findIndex((c) => c === n || c.includes(n) || n.includes(c));
    if (idx >= 0 && !out.includes(HOME_BATTERY_TYPES[idx])) out.push(HOME_BATTERY_TYPES[idx]);
  }
  return out;
}

/** True when no filter is active, or row batteryType matches a selected type. */
export function batteryTypeMatchesSelection(selectedTypes, batteryType) {
  const types = normalizeBatteryTypeSelection(selectedTypes);
  if (!types.length) return true;
  const bt = normalizeBatteryTypeLabel(batteryType);
  if (!bt) return false;
  return types.some((st) => {
    const sel = normalizeBatteryTypeLabel(st);
    return bt === sel || bt.includes(sel) || sel.includes(bt);
  });
}
