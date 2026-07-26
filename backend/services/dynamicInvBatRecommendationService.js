/**
 * Mode 1 — Dynamic Recommendation: pair separate `inverter_inventory` + `battery_inventory`
 * with intelligent same-brand logic, battery-type filtering, and exact VA/Ah matching.
 */
import { branchQuery } from "../utils/branchQuery.js";
import InverterInventoryCatalog from "../models/inventory/InverterInventoryCatalog.js";
import HomeBackupBatteryInventory from "../models/inventory/HomeBackupBatteryInventory.js";
import RecommendationRule from "../models/RecommendationRule.js";
import InverterSku from "../models/inventory/InverterSku.js";
import HomeInvBattery from "../models/inventory/HomeInvBattery.js";
import {
  computeComboLoadSizing,
  POWER_FACTOR,
  BATTERY_VOLTAGE,
  EFFICIENCY,
  STANDARD_INVERTER_VA,
  STANDARD_BATTERY_AH,
  roundUpStandardInverterVa,
  roundUpStandardBatteryAh,
} from "./comboLoadSizingService.js";
import { RECOMMENDATION_MODE_DYNAMIC } from "../shared/constants/recommendationModes.js";
import {
  batteryTypeMatchesSelection,
  normalizeBatteryTypeSelection,
} from "../shared/constants/batteryTypes.js";

export {
  STANDARD_INVERTER_VA,
  STANDARD_BATTERY_AH,
  POWER_FACTOR,
  BATTERY_VOLTAGE,
  EFFICIENCY,
  roundUpStandardInverterVa,
  roundUpStandardBatteryAh,
};

const INTELLIGENT_PROFILES = [
  { key: "Budget", optionLabel: "Option 1 - Budget", badge: "Budget", color: "#059669" },
  { key: "Recommended", optionLabel: "Option 2 - Recommended", badge: "Recommended", color: "#0f4aa2" },
  { key: "Premium", optionLabel: "Option 3 - Premium", badge: "Premium", color: "#7c3aed" },
  { key: "LongBackup", optionLabel: "Option 4 - Long Backup", badge: "Long Backup", color: "#ea580c" },
  { key: "HeavyLoad", optionLabel: "Option 5 - Heavy Load", badge: "Heavy Load", color: "#dc2626" },
];

const MIN_SAME_BRAND_OPTIONS = INTELLIGENT_PROFILES.length;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** VA from numeric field or text like "900 VA" / "900VA" (common when imports omit inverterVA). */
function parseVaFromText(text) {
  const s = String(text ?? "").trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*va\b/i) || s.match(/(\d{3,5})\s*va/i);
  return m ? num(m[1]) : 0;
}

function effectiveInverterVa(row) {
  const v = num(row.inverterVA);
  if (v > 0) return v;
  return parseVaFromText(row.productCapacity) || parseVaFromText(row.model);
}

/** Prefer sell price, then MRP / DP so rows with qty but empty `price` still pair. */
function effectiveInverterSellPrice(row) {
  return num(row.price) || num(row.mrp) || num(row.dp) || num(row.cd);
}

/** Ah from batteryAH / capacityAh / ah, or model text "200 Ah". */
function effectiveBatteryAh(row) {
  let ah = num(row.batteryAH) || num(row.capacityAh) || num(row.capacityAH) || num(row.ah);
  if (!ah) {
    const m = String(row.model ?? "").match(/(\d+)\s*ah\b/i);
    if (m) ah = num(m[1]);
  }
  return ah;
}

function effectiveBatteryWithOldPrice(row) {
  const w = num(row.priceWithOld);
  if (w > 0) return w;
  const p = num(row.price);
  if (p > 0) return p;
  return num(row.priceWithoutOld);
}

function warrantyMonthsHint(text) {
  const m = String(text ?? "").match(/(\d+)\s*(month|mo|mth)/i);
  return m ? Number(m[1]) : 0;
}

function pairKey(inv, bat) {
  return `${String(inv._id)}|${String(bat._id)}`;
}

function brandKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function brandsMatch(a, b) {
  const x = brandKey(a);
  const y = brandKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function mapInverterSkuLean(doc) {
  const price = effectiveInverterSellPrice(doc);
  const va = effectiveInverterVa(doc);
  return {
    _id: doc._id,
    brand: String(doc.brand ?? "").trim(),
    model: String(doc.modelNumber ?? "").trim(),
    inverterVA: va,
    warranty: String(doc.warranty ?? "").trim(),
    price,
    quantity: num(doc.quantity),
    image: "",
    brandDefaultImage: "",
    notes: String(doc.notes ?? "").trim(),
    type: "Inverter",
    _catalogSource: "legacy:inverters",
  };
}

function mapHomeInvBatteryLean(doc) {
  const p = num(doc.price);
  const wo = num(doc.priceWithoutOld);
  const ah = effectiveBatteryAh(doc);
  return {
    _id: doc._id,
    brand: String(doc.brand ?? "").trim(),
    model: String(doc.modelNumber ?? "").trim(),
    batteryAH: ah,
    batteryType: String(doc.batteryType ?? doc.homeSystemType ?? "").trim() || "Tubular",
    warranty: String(doc.warranty ?? "").trim(),
    price: p,
    priceWithOld: p,
    priceWithoutOld: wo > 0 ? wo : p,
    quantity: num(doc.quantity),
    image: "",
    brandDefaultImage: "",
    notes: String(doc.notes ?? "").trim(),
    type: "Battery",
    _catalogSource: "legacy:home_inverter_batteries",
  };
}

async function loadInverterRows(ctx) {
  const q = branchQuery(ctx.branchId, ctx.isSuperAdmin);
  const [primary, legacy] = await Promise.all([
    InverterInventoryCatalog.find(q).lean(),
    InverterSku.find(q).lean(),
  ]);
  const catalog = primary.map((d) => ({
    ...d,
    model: String(d.model ?? "").trim(),
    inverterVA: effectiveInverterVa(d),
    price: effectiveInverterSellPrice(d),
    _catalogSource: "inverter_inventory",
  }));
  const legacyRows = legacy.map(mapInverterSkuLean);
  return mergeInverterCatalogRows(catalog, legacyRows);
}

async function loadBatteryRows(ctx) {
  const q = branchQuery(ctx.branchId, ctx.isSuperAdmin);
  const [primary, legacyHome] = await Promise.all([
    HomeBackupBatteryInventory.find(q).lean(),
    HomeInvBattery.find(q).lean(),
  ]);
  const catalog = primary.map((d) => ({
    ...d,
    model: String(d.model ?? "").trim(),
    batteryAH: effectiveBatteryAh(d),
    batteryType: String(d.batteryType ?? "").trim() || "Tubular",
    priceWithOld: num(d.priceWithOld) > 0 ? num(d.priceWithOld) : num(d.price),
    priceWithoutOld: num(d.priceWithoutOld) > 0 ? num(d.priceWithoutOld) : num(d.price),
    _catalogSource: "battery_inventory",
  }));
  const legacyRows = legacyHome.map(mapHomeInvBatteryLean);
  return mergeBatteryCatalogRows(catalog, legacyRows);
}

function mergeInverterCatalogRows(catalog, legacy) {
  const seen = new Set();
  const out = [];
  for (const row of [...catalog, ...legacy]) {
    const k = `${brandKey(row.brand)}|${String(row.model ?? "").toLowerCase()}|${num(row.inverterVA)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

function mergeBatteryCatalogRows(catalog, legacy) {
  const seen = new Set();
  const out = [];
  for (const row of [...catalog, ...legacy]) {
    const k = `${brandKey(row.brand)}|${String(row.model ?? "").toLowerCase()}|${num(row.batteryAH)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

async function loadRules(ctx) {
  const q = branchQuery(ctx.branchId, ctx.isSuperAdmin);
  return RecommendationRule.find({ ...q, active: true }).lean();
}

function filterBrandInverters(rows, brandSel) {
  const b = brandKey(brandSel);
  if (!b || b === "any" || b === "any brand") return rows;
  return rows.filter((r) => brandKey(r.brand).includes(b) || b.includes(brandKey(r.brand)));
}

function filterBrandBatteries(rows, brandSel) {
  const b = brandKey(brandSel);
  if (!b || b === "any" || b === "any brand") return rows;
  return rows.filter((r) => brandKey(r.brand).includes(b) || b.includes(brandKey(r.brand)));
}

function filterByBatteryTypes(rows, selectedTypes) {
  const types = normalizeBatteryTypeSelection(selectedTypes);
  if (!types.length) return rows;
  return rows.filter((r) => batteryTypeMatchesSelection(types, r.batteryType));
}

function ruleBoost(inv, bat, rules) {
  let boost = 0;
  for (const r of rules) {
    const ib = brandKey(r.inverterBrand);
    const bb = brandKey(r.batteryBrand);
    if (ib && !brandKey(inv.brand).includes(ib)) continue;
    if (bb && !brandKey(bat.brand).includes(bb)) continue;
    const im = String(r.inverterModelHint ?? "").trim().toLowerCase();
    if (im && !String(inv.model ?? "").toLowerCase().includes(im)) continue;
    const bm = String(r.batteryModelHint ?? "").trim().toLowerCase();
    if (bm && !String(bat.model ?? "").toLowerCase().includes(bm)) continue;
    boost = Math.max(boost, num(r.boost));
  }
  return boost;
}

function estimatedBackupHours(bat, loadW) {
  const cap = num(bat.batteryAH);
  if (!cap || !loadW) return 0;
  return Number(((cap * BATTERY_VOLTAGE * EFFICIENCY) / loadW).toFixed(1));
}

function buildPairMeta(inv, bat, rules, filters) {
  const invPrice = effectiveInverterSellPrice(inv);
  const batPrice = effectiveBatteryWithOldPrice(bat);
  const total = invPrice + batPrice;
  const sameBrand = brandsMatch(inv.brand, bat.brand);
  const rb = ruleBoost(inv, bat, rules);
  const backupH = estimatedBackupHours(bat, filters.loadW);
  const batteryTypeMatch = batteryTypeMatchesSelection(filters.batteryTypes, bat.batteryType);
  const invBrandSel = brandKey(filters.inverterBrand);
  const batBrandSel = brandKey(filters.batteryBrand);

  let brandTier = 0;
  if (!invBrandSel && !batBrandSel) {
    brandTier = sameBrand ? 0 : 1;
  } else if (invBrandSel && !batBrandSel) {
    brandTier = brandsMatch(bat.brand, invBrandSel) ? 0 : 1;
  } else if (!invBrandSel && batBrandSel) {
    brandTier = brandsMatch(inv.brand, batBrandSel) ? 0 : 1;
  } else {
    brandTier = 0;
  }

  return {
    inv,
    bat,
    invPrice,
    batPrice,
    total,
    sameBrand,
    brandTier,
    batteryTypeMatch,
    ruleBoost: rb,
    warrantyScore: warrantyMonthsHint(bat.warranty) + warrantyMonthsHint(inv.warranty) * 0.5,
    backupScore: backupH,
  };
}

/** Lower score = higher priority. */
function recommendationScore(pair, filters) {
  let score = pair.brandTier * 10000;
  if (filters.batteryTypes?.length && !pair.batteryTypeMatch) score += 5000;
  score += pair.total * 0.01;
  score -= pair.ruleBoost * 2;
  score -= pair.warrantyScore * 15;
  score -= pair.backupScore * 8;
  if (filters.preferredBrand) {
    const pb = brandKey(filters.preferredBrand);
    const pref =
      brandKey(pair.inv.brand).includes(pb) ||
      brandKey(pair.bat.brand).includes(pb) ||
      pb.includes(brandKey(pair.inv.brand)) ||
      pb.includes(brandKey(pair.bat.brand));
    if (!pref) score += 800;
  }
  return score;
}

function sortRecommendations(list, filters) {
  return [...list].sort((a, b) => {
    const sa = recommendationScore(a, filters);
    const sb = recommendationScore(b, filters);
    if (sa !== sb) return sa - sb;
    return a.total - b.total;
  });
}

/**
 * Build candidate pairs with exact VA/Ah, battery-type filter, and intelligent brand tiers.
 */
function buildCandidatePairs(inverters, batteries, roundedVA, roundedAH, rules, filters) {
  const { inverterBrand, batteryBrand } = filters;

  let invPool = inverters.filter(
    (i) =>
      num(i.quantity) > 0 &&
      effectiveInverterVa(i) === roundedVA &&
      effectiveInverterSellPrice(i) >= 0 &&
      String(i.model ?? "").trim(),
  );
  let batPool = batteries.filter(
    (b) =>
      num(b.quantity) > 0 && effectiveBatteryAh(b) === roundedAH && String(b.model ?? "").trim(),
  );

  batPool = filterByBatteryTypes(batPool, filters.batteryTypes);
  if (inverterBrand) invPool = filterBrandInverters(invPool, inverterBrand);
  if (batteryBrand) batPool = filterBrandBatteries(batPool, batteryBrand);

  const allPairs = [];
  const invCap = Math.min(24, invPool.length);
  const batCap = Math.min(24, batPool.length);

  for (let i = 0; i < invCap; i++) {
    for (let j = 0; j < batCap; j++) {
      const inv = invPool[i];
      const bat = batPool[j];
      const invPrice = effectiveInverterSellPrice(inv);
      const batPrice = effectiveBatteryWithOldPrice(bat);
      allPairs.push(buildPairMeta(inv, bat, rules, filters));
    }
  }

  if (!allPairs.length) return [];

  const brandPairing = String(filters.brandPairingPreference ?? "mixedAllowed");
  let pool = allPairs;
  if (brandPairing === "sameBrandOnly") {
    pool = allPairs.filter((p) => p.sameBrand);
    if (!pool.length) return [];
  } else if (!inverterBrand && !batteryBrand) {
    const sameBrand = sortRecommendations(
      allPairs.filter((p) => p.sameBrand),
      filters,
    );
    const crossBrand = sortRecommendations(
      allPairs.filter((p) => !p.sameBrand),
      filters,
    );
    if (sameBrand.length >= MIN_SAME_BRAND_OPTIONS) return sameBrand;
    return [...sameBrand, ...crossBrand];
  }

  return sortRecommendations(pool, filters);
}

function availablePairs(candidates, used) {
  return candidates.filter((c) => !used.has(pairKey(c.inv, c.bat)));
}

function tierPool(candidates, used) {
  const pool = availablePairs(candidates, used);
  if (!pool.length) return pool;
  const same = pool.filter((c) => c.sameBrand || c.brandTier === 0);
  return same.length ? same : pool;
}

function pickBudget(candidates, used) {
  const pool = tierPool(candidates, used);
  return [...pool].sort((a, b) => a.total - b.total)[0];
}

function pickRecommended(candidates, used, filters) {
  const pool = tierPool(candidates, used);
  return [...pool].sort((a, b) => recommendationScore(a, filters) - recommendationScore(b, filters))[0];
}

function pickPremium(candidates, used) {
  const pool = tierPool(candidates, used);
  const tubular = pool.filter((c) => /tubular|jumbo|flat|opjt|opzv/i.test(c.bat.batteryType ?? ""));
  const tier = tubular.length ? tubular : pool;
  return [...tier].sort(
    (a, b) =>
      b.warrantyScore - a.warrantyScore || b.backupScore - a.backupScore || a.total - b.total,
  )[0];
}

function pickLongBackup(candidates, used) {
  const pool = tierPool(candidates, used);
  return [...pool].sort((a, b) => b.backupScore - a.backupScore || a.total - b.total)[0];
}

function pickHeavyLoad(candidates, used) {
  const pool = tierPool(candidates, used);
  return [...pool].sort(
    (a, b) => num(b.inv.inverterVA) - num(a.inv.inverterVA) || a.total - b.total,
  )[0];
}

export function mapDynamicPairToOption(inv, bat, profile, loadW, backupHours, appliancesNote, pairMeta = {}) {
  const va = effectiveInverterVa(inv);
  const cap = effectiveBatteryAh(bat);
  const invPrice = effectiveInverterSellPrice(inv);
  const batWith = effectiveBatteryWithOldPrice(bat);
  const batWithout = num(bat.priceWithoutOld) > 0 ? num(bat.priceWithoutOld) : batWith;
  const totalWithOld = invPrice + batWith;
  const totalWithoutOld = invPrice + batWithout;
  const invImg = String(inv.image ?? "").trim() || String(inv.brandDefaultImage ?? "").trim();
  const batImg = String(bat.image ?? "").trim() || String(bat.brandDefaultImage ?? "").trim();
  const estFromAh = estimatedBackupHours(bat, loadW);
  const estimatedBackup = estFromAh || backupHours;
  const invW = String(inv.warranty ?? "").trim();
  const batW = String(bat.warranty ?? "").trim();
  const sameBrand = pairMeta.sameBrand ?? brandsMatch(inv.brand, bat.brand);
  const brandNote = sameBrand
    ? `${inv.brand} + ${bat.brand} (same brand)`
    : `${inv.brand} inverter + ${bat.brand} battery`;

  return {
    optionLabel: profile.optionLabel,
    badge: profile.badge,
    color: profile.color,
    recommendationType: "Dynamic Recommendation",
    recommendationMode: RECOMMENDATION_MODE_DYNAMIC,
    sameBrandMatch: sameBrand,
    comboProductId: `${String(inv._id)}+${String(bat._id)}`,
    skuModelName: `${inv.brand} ${inv.model} + ${bat.brand} ${bat.model}`.trim(),
    inventoryRowType: "inverter+battery-dynamic",
    brandLogo: String(bat.brandDefaultImage || inv.brandDefaultImage || "").trim(),
    inverterImage: invImg,
    batteryImage: batImg,
    inverter: {
      id: inv._id,
      modelName: String(inv.model ?? "—").trim() || "—",
      inverterModelNumber: String(inv.model ?? "").trim(),
      brand: inv.brand ?? "",
      inverterVA: va || null,
      sellingRate: invPrice,
      inverterFinalPrice: invPrice,
      warranty: invW || batW || "—",
      imageUrl: invImg,
      inverterImage: invImg,
    },
    battery: {
      id: bat._id,
      modelName: String(bat.model ?? "—").trim() || "—",
      batteryModelNumber: String(bat.model ?? "").trim(),
      brand: bat.brand ?? "",
      capacityAh: cap || null,
      batteryType: bat.batteryType || "—",
      withOldPrice: batWith,
      withoutOldPrice: batWithout,
      sellingRate: batWith,
      warranty: batW || invW || "—",
      imageUrl: batImg,
      batteryImage: batImg,
    },
    comboWithOld: totalWithOld,
    comboWithoutOld: totalWithoutOld,
    totalPrice: totalWithOld,
    total: totalWithOld,
    totalPriceWithoutOld: totalWithoutOld,
    totalLoad: loadW,
    backupHoursFromRow: backupHours,
    estimatedBackup,
    backup: estimatedBackup ? `~${estimatedBackup} hrs` : `~${backupHours}h target`,
    suitableFor: appliancesNote || "",
    appliancesNote: appliancesNote || "",
    comparisonNote: `${brandNote} · ${inv._catalogSource || "?"} × ${bat._catalogSource || "?"}`,
    note: [inv.notes, bat.notes].filter(Boolean).join(" · ") || "",
    onlinePrices: {},
    catalogSource: "dynamic-inverter-battery-catalog",
  };
}

/**
 * Mode 1 — dynamic inverter + battery pairing for combo quotations.
 */
export async function previewDynamicComboQuotation(requirements = {}, context = {}) {
  const sizing = computeComboLoadSizing(requirements);
  const {
    totalWatts,
    flatType,
    backupHours,
    roundedVA,
    roundedAH,
    appliancesNote,
    loadSizing,
    warnings,
  } = sizing;

  const inverterBrand = String(requirements.inverterBrand ?? "").trim();
  const batteryBrand = String(requirements.batteryBrand ?? "").trim();
  const preferredBrand = String(requirements.preferredBrand ?? "").trim();
  const batteryTypes = normalizeBatteryTypeSelection(
    requirements.batteryTypes ?? requirements.selectedBatteryTypes,
  );

  console.log("Selected Inverter Brand", inverterBrand || "(any)");
  console.log("Selected Battery Brand", batteryBrand || "(any)");
  console.log("Selected Battery Types", batteryTypes.length ? batteryTypes : "(all types)");
  console.log("Rounded VA", roundedVA);
  console.log("Rounded AH", roundedAH);

  const filters = {
    inverterBrand,
    batteryBrand,
    preferredBrand,
    batteryTypes,
    brandPairingPreference: String(requirements.brandPairingPreference ?? "mixedAllowed"),
    loadW: totalWatts,
    backupHours,
  };

  let inverters = await loadInverterRows(context);
  let batteries = await loadBatteryRows(context);

  const matchingInverters = inverters.filter(
    (i) => num(i.quantity) > 0 && effectiveInverterVa(i) === roundedVA && String(i.model ?? "").trim(),
  );
  let matchingBatteries = batteries.filter(
    (b) => num(b.quantity) > 0 && effectiveBatteryAh(b) === roundedAH && String(b.model ?? "").trim(),
  );
  matchingBatteries = filterByBatteryTypes(matchingBatteries, batteryTypes);

  console.log("Matching Inverters", matchingInverters);
  console.log("Matching Batteries", matchingBatteries);

  const rules = await loadRules(context);
  const candidates = buildCandidatePairs(inverters, batteries, roundedVA, roundedAH, rules, filters);

  console.log("Generated Recommendations (candidate pairs)", candidates.length);

  if (!candidates.length) {
    const typeHint = batteryTypes.length ? ` and batteryType in [${batteryTypes.join(", ")}]` : "";
    const err = new Error(
      `No dynamic pairs with exact inverterVA === ${roundedVA} and batteryAH === ${roundedAH}${typeHint} (qty > 0). ` +
        `Check branch filter, brand filters, and that inverter rows use inverterVA or Product Capacity (e.g. "900 VA") and battery rows use batteryAH (or Ah in the model name).`,
    );
    err.status = 400;
    throw err;
  }

  const used = new Set();
  const suggestedOptions = [];

  for (const profile of INTELLIGENT_PROFILES) {
    let row;
    if (profile.key === "Budget") row = pickBudget(candidates, used);
    else if (profile.key === "Recommended") row = pickRecommended(candidates, used, filters);
    else if (profile.key === "Premium") row = pickPremium(candidates, used);
    else if (profile.key === "LongBackup") row = pickLongBackup(candidates, used);
    else if (profile.key === "HeavyLoad") row = pickHeavyLoad(candidates, used);
    if (!row) continue;
    const k = pairKey(row.inv, row.bat);
    if (used.has(k)) continue;
    used.add(k);
    suggestedOptions.push(
      mapDynamicPairToOption(row.inv, row.bat, profile, totalWatts, backupHours, appliancesNote, row),
    );
  }

  while (suggestedOptions.length < Math.min(INTELLIGENT_PROFILES.length, candidates.length)) {
    const c = candidates.find((x) => !used.has(pairKey(x.inv, x.bat)));
    if (!c) break;
    used.add(pairKey(c.inv, c.bat));
    const profile = INTELLIGENT_PROFILES[suggestedOptions.length % INTELLIGENT_PROFILES.length];
    suggestedOptions.push(
      mapDynamicPairToOption(c.inv, c.bat, profile, totalWatts, backupHours, appliancesNote, c),
    );
  }

  console.log("Generated Recommendations", suggestedOptions);

  if (warnings.length) {
    console.warn("[dynamic-inv-bat] appliance warnings:", warnings);
  }

  return {
    quotationKind: "combo",
    recommendationMode: RECOMMENDATION_MODE_DYNAMIC,
    flatType,
    houseType: requirements.houseType ?? flatType,
    numberOfRooms: requirements.numberOfRooms ?? "",
    backupHours,
    budgetType: requirements.budgetType ?? "Recommended",
    preferredBrand,
    inverterBrand,
    batteryBrand,
    batteryTypes,
    totalLoad: totalWatts,
    inverterRange: `${roundedVA} VA (exact standard size from load ÷ ${POWER_FACTOR})`,
    batteryRange: `${roundedAH} Ah (exact standard size for ${backupHours}h @ ${EFFICIENCY} efficiency, ${BATTERY_VOLTAGE}V)`,
    estimatedBackupRange: `${Math.max(1, backupHours - 1)} to ${backupHours + 3} Hours depending on usage`,
    appliancesNote,
    loadSizing,
    appliances: requirements.appliances,
    suggestedOptions,
    recommendedOptionLabel:
      suggestedOptions.find((o) => o.badge === "Recommended")?.optionLabel || suggestedOptions[0]?.optionLabel,
    inventoryStats: {
      inverterRows: inverters.length,
      batteryRows: batteries.length,
      matchingInverters: matchingInverters.length,
      matchingBatteries: matchingBatteries.length,
      candidatePairs: candidates.length,
      sameBrandPairs: candidates.filter((c) => c.sameBrand).length,
      optionsReturned: suggestedOptions.length,
      sizingMode: loadSizing.lines?.length ? "appliance-table" : "flat-load-estimate",
      catalogSource: "inverter_inventory × battery_inventory",
    },
  };
}
