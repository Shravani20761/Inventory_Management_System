import VehicleCompatibility from "../models/VehicleCompatibility.js";
import BatteryInventory from "../models/BatteryInventory.js";

function escapeRegex(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ciExactRx(value) {
  const t = String(value ?? "").trim();
  if (!t) return null;
  return new RegExp(`^${escapeRegex(t)}$`, "i");
}

/**
 * @param {"four-wheeler"|"two-wheeler"} vehicleType
 * @param {string} [search]
 */
export async function listVehicleBrands(vehicleType, search = "") {
  const s = String(search ?? "").trim();
  const pipeline = [
    { $match: { vehicleType, active: { $ne: false } } },
    {
      $addFields: {
        displayBrand: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ["$brand", ""] } }, 0] },
            "$brand",
            { $ifNull: ["$vehicleBrand", ""] },
          ],
        },
      },
    },
  ];
  if (s) pipeline.push({ $match: { displayBrand: new RegExp(escapeRegex(s), "i") } });
  pipeline.push({ $group: { _id: "$displayBrand" } });
  const rows = await VehicleCompatibility.aggregate(pipeline);
  return rows
    .map((r) => r._id)
    .filter((b) => String(b ?? "").trim())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * @param {"four-wheeler"|"two-wheeler"} vehicleType
 * @param {string} brand
 * @param {string} [search]
 */
export async function listVehicleModels(vehicleType, brand, search = "") {
  const brx = ciExactRx(brand);
  if (!brx) return [];
  const s = String(search ?? "").trim();
  const pipeline = [
    { $match: { vehicleType, active: { $ne: false }, $or: [{ brand: brx }, { vehicleBrand: brx }] } },
    {
      $addFields: {
        displayModel: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ["$model", ""] } }, 0] },
            "$model",
            { $ifNull: ["$vehicleModel", ""] },
          ],
        },
      },
    },
  ];
  if (s) pipeline.push({ $match: { displayModel: new RegExp(escapeRegex(s), "i") } });
  pipeline.push({ $group: { _id: "$displayModel" } });
  const rows = await VehicleCompatibility.aggregate(pipeline);
  return rows
    .map((r) => r._id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Distinct fuels for a four-wheeler brand + model (trim-level).
 */
export async function listVehicleFuels(vehicleType, brand, model) {
  if (vehicleType !== "four-wheeler") return [];
  const brx = ciExactRx(brand);
  const mrx = ciExactRx(model);
  if (!brx || !mrx) return [];
  const fuels = await VehicleCompatibility.distinct("fuelType", {
    vehicleType: "four-wheeler",
    active: { $ne: false },
    $and: [{ $or: [{ brand: brx }, { vehicleBrand: brx }] }, { $or: [{ model: mrx }, { vehicleModel: mrx }] }],
  });
  return fuels.filter((f) => String(f ?? "").trim().length > 0).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Find compatibility rows for vehicle (fuel optional for four-wheeler — narrows when provided).
 */
export async function findVehicleCompatibilityRows(vehicleType, brand, model, fuelType = "") {
  const brx = ciExactRx(brand);
  const mrx = ciExactRx(model);
  if (!brx || !mrx) return [];
  const base = {
    vehicleType,
    active: { $ne: false },
    $and: [{ $or: [{ brand: brx }, { vehicleBrand: brx }] }, { $or: [{ model: mrx }, { vehicleModel: mrx }] }],
  };
  if (vehicleType === "four-wheeler") {
    const ft = String(fuelType ?? "").trim();
    if (!ft) return [];
    const frx = ciExactRx(ft);
    if (!frx) return [];
    return VehicleCompatibility.find({ ...base, fuelType: frx }).lean();
  }
  return VehicleCompatibility.find(base).lean();
}

/**
 * Match free-text hints (e.g. "Amaron 55Ah") against in-stock {@link BatteryInventory} rows.
 */
export async function findBatteriesByModelHints(hints) {
  const hintList = [...new Set((hints || []).map((h) => String(h).trim()).filter(Boolean))];
  if (!hintList.length) return [];
  const pool = await BatteryInventory.find({ qty: { $gt: 0 }, active: { $ne: false } }).lean();
  const picked = [];
  const seen = new Set();
  for (const hint of hintList) {
    const hLower = hint.toLowerCase().trim();
    const hCompact = hLower.replace(/\s/g, "");
    const tokens = hLower.split(/\s+/).filter((t) => t.length >= 1);
    for (const b of pool) {
      if (seen.has(b.batteryCode)) continue;
      const blob = `${b.batteryCode} ${b.batteryBrand} ${b.modelNumber}`.toLowerCase().replace(/\s+/g, " ");
      const blobCompact = blob.replace(/\s/g, "");
      const substringHit =
        hLower.length >= 2 && (blob.includes(hLower) || (hCompact.length >= 2 && blobCompact.includes(hCompact)));
      const tokenHit = tokens.length > 0 && tokens.every((t) => blob.includes(t));
      if (substringHit || tokenHit) {
        seen.add(b.batteryCode);
        picked.push(b);
      }
    }
  }
  return picked.sort((a, c) => Number(a.price) - Number(c.price));
}

/**
 * Union of `compatibleBatteryCodes` and batteries resolved from `compatibleBatteryModels` hints.
 */
export async function resolveBatteriesByVehicle(vehicleType, brand, model, fuelType = "") {
  const rows = await findVehicleCompatibilityRows(vehicleType, brand, model, fuelType);
  const codesFromRows = [
    ...new Set(
      rows
        .flatMap((r) => (Array.isArray(r.compatibleBatteryCodes) ? r.compatibleBatteryCodes : []).map(String))
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
  const hints = [
    ...new Set(
      rows
        .flatMap((r) => (Array.isArray(r.compatibleBatteryModels) ? r.compatibleBatteryModels : []).map(String))
        .map((h) => h.trim())
        .filter(Boolean),
    ),
  ];

  const fromCodes =
    codesFromRows.length > 0
      ? await BatteryInventory.find({
          batteryCode: { $in: codesFromRows },
          qty: { $gt: 0 },
          active: { $ne: false },
        })
          .sort({ price: 1 })
          .lean()
      : [];

  const fromHints = hints.length ? await findBatteriesByModelHints(hints) : [];

  const byCode = new Map();
  for (const b of [...fromCodes, ...fromHints]) {
    if (!b?.batteryCode) continue;
    if (!byCode.has(b.batteryCode)) byCode.set(b.batteryCode, b);
  }
  const batteries = [...byCode.values()].sort((a, c) => Number(a.price) - Number(c.price));
  const codes = [...byCode.keys()];
  return { rows, codes, batteries };
}
