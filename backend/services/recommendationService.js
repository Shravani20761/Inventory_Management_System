import { listProducts } from "./inventoryService.js";

export const MAX_QUOTATION_COMBO_OPTIONS = 15;

const FLAT_LOAD = {
  "1RK": 400,
  "1BHK": 650,
  "2BHK": 850,
  "3BHK": 1200,
};

const FLAT_APPLIANCES = {
  "1RK": "2 fans, 4 lights, 1 TV",
  "1BHK": "2 fans, 6 lights, 1 TV, 1 refrigerator",
  "2BHK": "3 fans, 8 lights, 2 TVs, 1 refrigerator",
  "3BHK": "4 fans, 12 lights, 2 TVs, 1 refrigerator, 1 pump",
};

const OPTION_PROFILES = [
  { key: "Budget", optionLabel: "Option 1 - Budget", badge: "Budget", color: "#059669", priceWeight: 1.4, ahBoost: 0, vaMultiplier: 1, preferTubular: false },
  { key: "Recommended", optionLabel: "Option 2 - Recommended", badge: "Recommended", color: "#0f4aa2", priceWeight: 1, ahBoost: 0, vaMultiplier: 1.1, preferTubular: false },
  { key: "Premium", optionLabel: "Option 3 - Premium", badge: "Premium", color: "#7c3aed", priceWeight: 0.6, ahBoost: 1, vaMultiplier: 1.2, preferTubular: true },
  { key: "LongBackup", optionLabel: "Option 4 - Long Backup", badge: "Long Backup", color: "#ea580c", priceWeight: 0.9, ahBoost: 2, vaMultiplier: 1.15, preferTubular: true },
  { key: "Solar", optionLabel: "Option 5 - Solar Compatible", badge: "Solar Compatible", color: "#0891b2", priceWeight: 1.1, ahBoost: 1, vaMultiplier: 1.2, preferSolar: true },
  { key: "HeavyLoad", optionLabel: "Option 6 - Heavy Load", badge: "Heavy Load", color: "#dc2626", priceWeight: 0.8, ahBoost: 2, vaMultiplier: 1.45, preferTubular: false },
  { key: "ValuePlus", optionLabel: "Option 7 - Value Plus", badge: "Value Plus", color: "#0d9488", priceWeight: 1.15, ahBoost: 0, vaMultiplier: 1.05, preferTubular: false },
  { key: "MaxBackup", optionLabel: "Option 8 - Max Backup", badge: "Max Backup", color: "#b45309", priceWeight: 0.85, ahBoost: 3, vaMultiplier: 1.1, preferTubular: true },
];

function categoryOf(p) {
  /** Prefer `type` — legacy rows often left `category` at default "Battery" while `type` is "Inverter". */
  return String(p.type ?? p.category ?? "").toLowerCase();
}

function productName(p) {
  return String(p.modelName ?? p.model ?? "").toLowerCase();
}

function price(p) {
  return Number(p.sellingRate ?? p.sellRate ?? 0);
}

/** Parse Ah from fields, productCapacity line, or model code (RC18000 → 180, ST1500 → 150). */
export function ah(p) {
  const fromField = Number(p.capacityAh ?? p.ah ?? 0);
  if (fromField > 0) return fromField;

  const cap = String(p.productCapacity ?? "");
  const fromPipe = cap.match(/(\d+(?:\.\d+)?)\s*ah\b/i);
  if (fromPipe) {
    const n = Number(fromPipe[1]);
    if (n >= 40 && n <= 300) return n;
  }

  const name = String(p.modelName ?? p.model ?? "");
  const patterns = [
    /(?:RC|ST|LG|IT|OPJT|OPZV|TUBULAR)[\s-]*(\d{2,3})/i,
    /(\d{2,3})\s*ah/i,
    /(?:RC|ST)(\d{4})/i,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) {
      let n = Number(m[1]);
      if (n > 400 && name.match(/RC|ST/i)) n = Math.round(n / 100);
      if (n >= 40 && n <= 300) return n;
    }
  }
  return 0;
}

/** e.g. "1100 VA", "12V|1100 VA|150 Ah" — many inverter rows only store VA in productCapacity. */
function parseVaFromProductCapacityText(cap) {
  const m = String(cap ?? "").match(/(\d+(?:\.\d+)?)\s*va\b/i);
  return m ? Number(m[1]) : 0;
}

/** Parse inverter VA from field or model (IMTT1500 → 1500 VA). */
export function inverterVa(p) {
  const fromField = Number(p.inverterVA ?? 0);
  if (fromField >= 600) return fromField;
  const fromCap = parseVaFromProductCapacityText(p.productCapacity);
  if (fromCap >= 600) return fromCap;

  const name = String(p.modelName ?? p.model ?? "");
  const imtt = name.match(/IMTT\s*(\d{3,4})/i);
  if (imtt) return Number(imtt[1]);
  const va = name.match(/(\d{3,4})\s*VA/i);
  if (va) return Number(va[1]);
  const zelio = name.match(/zelio\s*\+?\s*(\d{3,4})/i);
  if (zelio) return Number(zelio[1]);
  const cruze = name.match(/cruze\s*\+?\s*(\d{3,4})/i);
  if (cruze) return Number(cruze[1]);
  return 0;
}

function isInverterModelName(name) {
  if (/tubular|red\s*charge|rc\d{4,5}|st\d{3,4}|lg\d{3,4}tt|opjt|opzv|it\d{3}\b/.test(name)) return false;
  if (/invamaster|imtt|zelio|cruze|nxg|fusion|eco\s*watt|heavy\s*duty|solar\s*nxg/.test(name)) return true;
  if (/\d{3,4}\s*va/.test(name)) return true;
  return false;
}

function isBatteryModelName(name) {
  if (isInverterModelName(name)) return false;
  if (/tubular|red\s*charge|inva\s*tubular|it\d{3}|opjt|opzv/.test(name)) return true;
  if (/\b(rc|st|lg)\s*\d{3,4}/.test(name)) return true;
  if (/rc\d{4,5}|st\d{3,4}/.test(name)) return true;
  return false;
}

/** Inverter + battery combo sheet: one inventory row = one complete combo SKU. */
export function isComboInventoryRow(p) {
  const t = String(p.type ?? p.category ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s/g, "");
  if (t === "inverter+battery" || t === "inv+battery" || t.includes("inverter+battery")) return true;
  if (t === "combo" || t.includes("combokit") || t.includes("invbatcombo")) return true;
  const comboId = String(p.comboId ?? "").trim();
  const inv = String(p.inverterModel ?? "").trim();
  const bat = String(p.batteryModel ?? "").trim();
  if (comboId && (inv || bat)) return true;
  return false;
}

/**
 * Split combo SKUs into synthetic battery + inverter rows for the pairing engine.
 * Uses batteryModel / inverterModel, Ah, VA (field or productCapacity), and split prices when present.
 */
function expandComboRowsForRecommendation(comboRows) {
  const out = [];
  for (const p of comboRows) {
    if (Number(p.quantity ?? 0) <= 0) continue;
    const src =
      p.id != null && p.id !== ""
        ? String(p.id)
        : p._id != null
          ? String(p._id)
          : String(p.modelName ?? p.model ?? "combo");
    const ahVal = ah(p);
    const vaVal = Math.max(inverterVa(p), parseVaFromProductCapacityText(p.productCapacity));
    const totalSell = Number(p.sellingRate ?? p.sellRate ?? 0);
    const invPart = Number(p.inverterPrice ?? 0);
    const batPart = Number(p.batteryPrice ?? 0);
    const batRate = batPart > 0 ? batPart : invPart > 0 ? Math.max(0, totalSell - invPart) : totalSell > 0 ? totalSell * 0.55 : 0;
    const invRate = invPart > 0 ? invPart : batPart > 0 ? Math.max(0, totalSell - batPart) : totalSell > 0 ? totalSell * 0.45 : 0;

    if (ahVal >= 80) {
      const mname = String(p.batteryModel || p.modelName || p.model || "").trim();
      if (mname) {
        out.push({
          ...p,
          _quotationVirtual: "battery",
          id: `${src}::vbat`,
          modelName: mname,
          model: mname,
          type: "Battery",
          category: "Battery",
          capacityAh: ahVal,
          ah: ahVal,
          sellingRate: batRate || totalSell,
          sellRate: batRate || totalSell,
        });
      }
    }
    if (vaVal >= 600) {
      const invName = String(p.inverterModel || p.modelName || p.model || "").trim();
      if (invName) {
        out.push({
          ...p,
          _quotationVirtual: "inverter",
          id: `${src}::vinv`,
          modelName: invName,
          model: invName,
          type: "Inverter",
          category: "Inverter",
          inverterVA: vaVal,
          sellingRate: invRate || totalSell,
          sellRate: invRate || totalSell,
        });
      }
    }
  }
  return out;
}

/** Home backup battery from inventory. */
export function isHomeBattery(p) {
  const c = categoryOf(p);
  const name = productName(p);
  const t = String(p.type ?? "").trim().toLowerCase();
  if (t.includes("home inverter battery") && Number(p.quantity ?? 0) > 0) {
    if (ah(p) >= 80 || isBatteryModelName(name)) return true;
  }
  if (["car", "bike", "truck"].includes(c) && ah(p) < 100) return false;
  if (name.includes("quanta") && name.includes("aq")) return false;
  if (isInverterModelName(name)) return false;
  if (isBatteryModelName(name)) return true;
  if (c.includes("battery") && ah(p) >= 80) return true;
  if (ah(p) >= 100) return true;
  return false;
}

/** True when DB row is clearly a standalone inverter/UPS (not combo / not home-battery sheet). */
function isStandaloneInverterSku(p) {
  const compact = String(p.type ?? p.category ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s/g, "");
  if (compact.includes("inverter+battery") || compact.includes("homeinverterbattery")) return false;
  const t = String(p.type ?? "").trim().toLowerCase();
  if (t === "inverter" || t === "ups") return true;
  if (compact === "inverter" || compact === "ups") return true;
  return false;
}

/** Inverter / UPS unit from inventory. */
export function isHomeInverter(p) {
  if (Number(p.quantity ?? 0) <= 0) return false;

  /** Trust explicit inverter/UPS rows even when VA is only in free text or missing (scoring substitutes target VA). */
  if (isStandaloneInverterSku(p)) return true;

  const c = categoryOf(p);
  const name = productName(p);
  if (isBatteryModelName(name) && !isInverterModelName(name)) return false;
  if (isInverterModelName(name)) return true;
  if (c.includes("inverter") || c.includes("ups")) {
    if (name.includes("tubular") || name.includes("rc18000") || name.includes("st1500")) return false;
    if (inverterVa(p) >= 600) return true;
    return isInverterModelName(name);
  }
  if (inverterVa(p) >= 600) return true;
  return false;
}

function requiredInverterVa(loadW) {
  if (loadW <= 900) return 900;
  if (loadW <= 1100) return 1100;
  if (loadW <= 1500) return 1500;
  return 1800;
}

function inverterRange(loadW) {
  const min = requiredInverterVa(loadW);
  const max = loadW <= 900 ? 1100 : loadW <= 1100 ? 1500 : loadW <= 1500 ? 1800 : 2500;
  return `${min} VA - ${max} VA`;
}

function rawBatteryAhNeeded(loadW, backupHours, boost = 0) {
  const hours = backupHours + boost;
  return (loadW * hours) / (12 * 0.8);
}

function requiredBatteryAh(loadW, backupHours, boost = 0) {
  const needed = rawBatteryAhNeeded(loadW, backupHours, boost);
  if (needed <= 150) return 150;
  if (needed <= 180) return 180;
  if (needed <= 220) return 220;
  return Math.min(300, Math.ceil(needed / 30) * 30);
}

function batteryRange(loadW, backupHours) {
  const min = 150;
  const max = requiredBatteryAh(loadW, backupHours, 2);
  return `${min}Ah - ${max}Ah`;
}

function estimateBackupHours(battery, loadW) {
  const capacity = ah(battery);
  if (!capacity || !loadW) return 0;
  return Number(((capacity * 12 * 0.8) / loadW).toFixed(1));
}

function brandMatch(product, preferredBrand) {
  if (!preferredBrand) return true;
  return String(product.brand ?? "").toLowerCase().includes(preferredBrand.toLowerCase());
}

function scoreBattery(product, targetAh, profile, preferredBrand) {
  if (!brandMatch(product, preferredBrand)) return Infinity;
  if (Number(product.quantity ?? 0) <= 0) return Infinity;
  const cap = ah(product);
  if (cap < 80) return Infinity;
  if (profile.preferSolar && !productName(product).includes("solar")) return Infinity + 40;
  const tubularBonus = profile.preferTubular && productName(product).includes("tubular") ? -15 : 0;
  const solarBonus = profile.preferSolar && productName(product).includes("solar") ? -25 : 0;
  return Math.abs(cap - targetAh) + price(product) * 0.00008 * profile.priceWeight + tubularBonus + solarBonus;
}

function scoreInverter(product, targetVa, profile, preferredBrand) {
  if (!brandMatch(product, preferredBrand)) return Infinity;
  if (Number(product.quantity ?? 0) <= 0) return Infinity;
  const va = inverterVa(product) || targetVa;
  if (va < 600) return Infinity;
  if (profile.preferSolar && !productName(product).includes("solar")) return Infinity + 30;
  const solarBonus = profile.preferSolar && productName(product).includes("solar") ? -20 : 0;
  return Math.abs(va - targetVa) + price(product) * 0.00008 * profile.priceWeight + solarBonus;
}

function pickProduct(candidates, scorer) {
  const sorted = [...candidates].sort((a, b) => scorer(a) - scorer(b));
  return sorted.find((p) => scorer(p) < Infinity) ?? null;
}

function buildOptionFromPair(profile, loadW, backupHours, battery, inverter, flatType, preferredBrand) {
  const targetVa = requiredInverterVa(loadW * profile.vaMultiplier);
  const estimatedBackup = estimateBackupHours(battery, loadW);
  const backupLabel =
    estimatedBackup >= 1
      ? `${Math.max(1, Math.floor(estimatedBackup))} to ${Math.ceil(estimatedBackup + 1)} Hours`
      : `~${backupHours} Hours (check battery Ah in inventory)`;

  const batRate = price(battery);
  const invRate = price(inverter);
  const wOld = Number(battery.newRateWithOB ?? battery.sellingRate ?? batRate);
  const wNew = Number(battery.newRateWithoutOB ?? 0);
  const totalWithOld = invRate + (wOld || batRate);
  const totalWithoutOld = invRate + (wNew > 0 ? wNew : wOld || batRate);

  const batModel = String(battery.batteryModel ?? battery.modelName ?? battery.model ?? "").trim() || "—";
  const invModel = String(inverter.inverterModel ?? inverter.modelName ?? inverter.model ?? "").trim() || "—";

  return {
    optionLabel: profile.optionLabel,
    badge: profile.badge,
    color: profile.color,
    battery: {
      id: battery.id ?? battery._id,
      modelName: batModel,
      batteryModelNumber: battery.batteryModel ?? batModel,
      brand: battery.brand,
      capacityAh: ah(battery),
      batteryType: battery.batteryType ?? battery.type,
      sellingRate: batRate,
      withOldPrice: wOld,
      withoutOldPrice: wNew > 0 ? wNew : wOld,
      warranty: battery.warranty || "60 Months (Battery)",
      imageUrl: battery.imageUrl ?? "",
    },
    inverter: {
      id: inverter.id ?? inverter._id,
      modelName: invModel,
      inverterModelNumber: inverter.inverterModel ?? invModel,
      brand: inverter.brand,
      inverterVA: inverterVa(inverter) || targetVa,
      sellingRate: invRate,
      inverterFinalPrice: invRate,
      warranty: inverter.warranty || "2 Years (Inverter)",
      imageUrl: inverter.imageUrl ?? "",
    },
    totalLoad: loadW,
    estimatedBackup,
    backup: backupLabel,
    requiredInverterVa: targetVa,
    requiredBatteryAh: requiredBatteryAh(loadW, backupHours, profile.ahBoost),
    totalPrice: totalWithOld,
    total: totalWithOld,
    totalPriceWithoutOld: totalWithoutOld,
    warranty: `2 Years (Inverter) / 60 Months (Battery)`,
    suitableFor: FLAT_APPLIANCES[flatType] || `${flatType} load`,
    note:
      profile.key === "Budget"
        ? "Best value for essential backup needs."
        : profile.key === "Premium"
          ? "Higher backup & premium tubular preference."
          : profile.key === "LongBackup"
            ? "Extended backup duration for longer outages."
            : profile.key === "Solar"
              ? "Solar-ready combo when available in stock."
              : profile.key === "HeavyLoad"
                ? "Supports heavier loads like geysers / pumps."
                : "Balanced price, backup and reliability.",
    comparisonNote: `Prices from live inventory · ${inverter.brand} + ${battery.brand}`,
    catalogSource: "products",
  };
}

function buildOption(profile, loadW, backupHours, batteries, inverters, preferredBrand, flatType, usedKeys) {
  const targetAh = requiredBatteryAh(loadW, backupHours, profile.ahBoost);
  const targetVa = requiredInverterVa(loadW * profile.vaMultiplier);

  const pickBatt = () => {
    const pool = batteries.filter((b) => !usedKeys.has(`b-${b.id ?? b.model}`));
    return pickProduct(pool.length ? pool : batteries, (b) => scoreBattery(b, targetAh, profile, preferredBrand));
  };
  const pickInv = () => {
    const pool = inverters.filter((i) => !usedKeys.has(`i-${i.id ?? i.model}`));
    return pickProduct(pool.length ? pool : inverters, (i) => scoreInverter(i, targetVa, profile, preferredBrand));
  };

  const battery = pickBatt();
  const inverter = pickInv();

  if (!battery || !inverter) return null;

  usedKeys.add(`b-${battery.id ?? battery.model}`);
  usedKeys.add(`i-${inverter.id ?? inverter.model}`);

  return buildOptionFromPair(profile, loadW, backupHours, battery, inverter, flatType, preferredBrand);
}

function comboDedupeKey(opt) {
  return `${String(opt.battery?.batteryModelNumber ?? opt.battery?.modelName ?? "")}|${String(opt.inverter?.inverterModelNumber ?? opt.inverter?.modelName ?? "")}`;
}

/** Add ranked inverter×battery pairs until we reach min/max combo option counts. */
function appendPairRankedComboOptions(unique, seen, batteries, inverters, loadW, backupHours, preferredBrand, flatType, budgetType) {
  if (unique.length >= MAX_QUOTATION_COMBO_OPTIONS) return;

  let profiles = [...OPTION_PROFILES];
  if (budgetType === "Budget") profiles = profiles.filter((p) => ["Budget", "Recommended", "LongBackup", "ValuePlus"].includes(p.key));
  else if (budgetType === "Premium") profiles = profiles.filter((p) => p.key !== "Budget");

  const needVa = requiredInverterVa(loadW);
  const needAh = requiredBatteryAh(loadW, backupHours);
  const minAhForBackup = rawBatteryAhNeeded(loadW, backupHours) * 0.65;

  const topB = [...batteries]
    .filter((b) => ah(b) >= 80 && Number(b.quantity ?? 0) > 0)
    .sort((a, b) => Math.abs(ah(a) - needAh) - Math.abs(ah(b) - needAh))
    .slice(0, 20);
  const topI = [...inverters]
    .filter((i) => Number(i.quantity ?? 0) > 0)
    .sort(
      (a, b) =>
        Math.abs((inverterVa(a) || needVa) - needVa) - Math.abs((inverterVa(b) || needVa) - needVa),
    )
    .slice(0, 20);

  const pairs = [];
  for (const battery of topB) {
    for (const inverter of topI) {
      const va = inverterVa(inverter);
      if (!va || va < 600 || va < needVa * 0.88) continue;
      const cap = ah(battery);
      if (cap < minAhForBackup) continue;
      if (preferredBrand && !brandMatch(battery, preferredBrand) && !brandMatch(inverter, preferredBrand)) continue;
      pairs.push({
        battery,
        inverter,
        sc: Math.abs(va - needVa) * 0.2 + Math.abs(cap - needAh) * 2.5 + (price(battery) + price(inverter)) * 0.000015,
      });
    }
  }
  pairs.sort((a, b) => a.sc - b.sc);

  for (const { battery, inverter } of pairs) {
    if (unique.length >= MAX_QUOTATION_COMBO_OPTIONS) break;
    const profile = profiles[unique.length % profiles.length];
    const opt = buildOptionFromPair(profile, loadW, backupHours, battery, inverter, flatType, preferredBrand);
    const k = comboDedupeKey(opt);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(opt);
  }
}

/**
 * @deprecated Legacy helper. Combo quotations use `dynamicInvBatRecommendationService` via `previewComboFromComboInventory`.
 */
export async function generateQuotationOptions(_requirements = {}, _context = {}) {
  const err = new Error(
    "Legacy generateQuotationOptions is disabled. Combo quotations use inverter_inventory + battery_inventory (see dynamicInvBatRecommendationService).",
  );
  err.status = 501;
  throw err;
}
