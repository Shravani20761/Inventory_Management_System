import VehicleType from "../../models/vehicleFitment/VehicleType.js";
import VehicleBrand from "../../models/vehicleFitment/VehicleBrand.js";
import VehicleModel from "../../models/vehicleFitment/VehicleModel.js";
import VehicleVariant from "../../models/vehicleFitment/VehicleVariant.js";
import BatteryFitmentGroup from "../../models/vehicleFitment/BatteryFitmentGroup.js";

export const DEFAULT_VEHICLE_TYPES = [
  { slug: "car", name: "Car", sortOrder: 1 },
  { slug: "bike", name: "Bike", sortOrder: 2 },
  { slug: "scooter", name: "Scooter", sortOrder: 3 },
  { slug: "commercial", name: "Commercial Vehicle", sortOrder: 4 },
  { slug: "other", name: "Other", sortOrder: 5 },
];

function escapeRegex(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function ensureVehicleTypes() {
  for (const t of DEFAULT_VEHICLE_TYPES) {
    await VehicleType.updateOne({ slug: t.slug }, { $setOnInsert: t }, { upsert: true });
  }
  return VehicleType.find({ active: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function listCatalogBrands(vehicleTypeId, q = "") {
  const filter = { vehicleTypeId, active: { $ne: false } };
  if (q.trim()) filter.name = new RegExp(escapeRegex(q.trim()), "i");
  return VehicleBrand.find(filter).sort({ name: 1 }).limit(80).lean();
}

export async function listCatalogModels(brandId, q = "") {
  const filter = { brandId, active: { $ne: false } };
  if (q.trim()) filter.name = new RegExp(escapeRegex(q.trim()), "i");
  return VehicleModel.find(filter).sort({ name: 1 }).limit(80).lean();
}

export async function listCatalogVariants(modelId) {
  return VehicleVariant.find({ modelId, active: { $ne: false } }).sort({ name: 1, fuelType: 1, yearFrom: 1 }).lean();
}

export async function listCatalogFuels(modelId) {
  const fuels = await VehicleVariant.distinct("fuelType", { modelId, active: { $ne: false } });
  return fuels.filter((f) => String(f ?? "").trim()).sort((a, b) => a.localeCompare(b));
}

export async function listCatalogYears(variantId) {
  const v = await VehicleVariant.findById(variantId).lean();
  if (!v) return [];
  const from = Number(v.yearFrom);
  const to = Number(v.yearTo);
  if (!Number.isFinite(from) && !Number.isFinite(to)) return [];
  const start = Number.isFinite(from) ? from : to;
  const end = Number.isFinite(to) ? to : from;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const years = [];
  for (let y = hi; y >= lo; y -= 1) years.push(y);
  return years;
}

export async function findOrCreateBrand(vehicleTypeId, name) {
  const n = String(name || "").trim();
  if (!n) throw Object.assign(new Error("Brand is required"), { status: 400 });
  const existing = await VehicleBrand.findOne({
    vehicleTypeId,
    name: new RegExp(`^${escapeRegex(n)}$`, "i"),
  });
  if (existing) return existing;
  return VehicleBrand.create({ vehicleTypeId, name: n });
}

export async function findOrCreateModel(brandId, name) {
  const n = String(name || "").trim();
  if (!n) throw Object.assign(new Error("Model is required"), { status: 400 });
  const existing = await VehicleModel.findOne({ brandId, name: new RegExp(`^${escapeRegex(n)}$`, "i") });
  if (existing) return existing;
  return VehicleModel.create({ brandId, name: n });
}

export async function findOrCreateFitmentGroup(payload) {
  const name = String(payload.name || payload.fitmentGroup || "").trim();
  if (!name) throw Object.assign(new Error("Fitment group name is required"), { status: 400 });
  let g = await BatteryFitmentGroup.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
  if (g) return g;
  g = await BatteryFitmentGroup.create({
    name,
    code: String(payload.code || "").trim(),
    voltage: payload.voltage !== "" ? Number(payload.voltage) || null : null,
    minAh: payload.minAh !== "" ? Number(payload.minAh) || null : null,
    maxAh: payload.maxAh !== "" ? Number(payload.maxAh) || null : null,
    batteryType: String(payload.batteryType || "").trim(),
    length: payload.length !== "" ? Number(payload.length) || null : null,
    width: payload.width !== "" ? Number(payload.width) || null : null,
    height: payload.height !== "" ? Number(payload.height) || null : null,
    terminalConfiguration: String(payload.terminalConfiguration || "").trim(),
    polarity: String(payload.polarity || "").trim(),
    mountingInformation: String(payload.mountingInformation || "").trim(),
    notes: String(payload.notes || "").trim(),
  });
  return g;
}

function nOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function upsertVehicleRecord(payload) {
  await ensureVehicleTypes();
  let type = null;
  if (payload.vehicleTypeId) type = await VehicleType.findById(payload.vehicleTypeId);
  if (!type && payload.vehicleType) {
    const tname = String(payload.vehicleType).trim();
    type = await VehicleType.findOne({
      $or: [{ name: new RegExp(`^${escapeRegex(tname)}$`, "i") }, { slug: tname.toLowerCase() }],
    });
  }
  if (!type) throw Object.assign(new Error("Vehicle type is required"), { status: 400 });
  const brand = await findOrCreateBrand(type._id, payload.brand);
  const model = await findOrCreateModel(brand._id, payload.model);
  let fitment = null;
  if (payload.fitmentGroupId) fitment = await BatteryFitmentGroup.findById(payload.fitmentGroupId);
  else if (payload.fitmentGroup || payload.fitmentName) {
    fitment = await findOrCreateFitmentGroup({ ...payload, name: payload.fitmentGroup || payload.fitmentName });
  }
  const variantDoc = {
    modelId: model._id,
    name: String(payload.variant ?? payload.variantName ?? "").trim(),
    fuelType: String(payload.fuelType || "").trim(),
    yearFrom: nOrNull(payload.yearFrom),
    yearTo: nOrNull(payload.yearTo),
    fitmentGroupId: fitment?._id || null,
    notes: String(payload.notes || "").trim(),
    active: payload.active !== false,
  };
  if (payload._id) {
    const updated = await VehicleVariant.findByIdAndUpdate(payload._id, { $set: variantDoc }, { new: true });
    if (!updated) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
    return populatedVehicle(updated._id);
  }
  const dup = await VehicleVariant.findOne({
    modelId: model._id,
    name: variantDoc.name,
    fuelType: variantDoc.fuelType,
    yearFrom: variantDoc.yearFrom,
    yearTo: variantDoc.yearTo,
  });
  if (dup) {
    const err = new Error("Duplicate vehicle combination");
    err.status = 409;
    err.existingId = String(dup._id);
    throw err;
  }
  const created = await VehicleVariant.create(variantDoc);
  return populatedVehicle(created._id);
}

export async function populatedVehicle(id) {
  const v = await VehicleVariant.findById(id).lean();
  if (!v) return null;
  const model = await VehicleModel.findById(v.modelId).lean();
  const brand = model ? await VehicleBrand.findById(model.brandId).lean() : null;
  const type = brand ? await VehicleType.findById(brand.vehicleTypeId).lean() : null;
  const fitment = v.fitmentGroupId ? await BatteryFitmentGroup.findById(v.fitmentGroupId).lean() : null;
  return {
    id: String(v._id),
    ...v,
    modelName: model?.name || "",
    brandName: brand?.name || "",
    brandId: brand?._id,
    vehicleTypeId: type?._id,
    vehicleTypeName: type?.name || "",
    fitmentGroupName: fitment?.name || "",
    fitment,
  };
}

export async function listAdminVehicles(filters = {}) {
  const q = {};
  if (filters.active === "false") q.active = false;
  let variants = await VehicleVariant.find(q).sort({ updatedAt: -1 }).limit(500).lean();
  const out = [];
  for (const v of variants) {
    const row = await populatedVehicle(v._id);
    if (!row) continue;
    if (filters.vehicleTypeId && String(row.vehicleTypeId) !== String(filters.vehicleTypeId)) continue;
    if (filters.q) {
      const blob = `${row.brandName} ${row.modelName} ${row.name} ${row.fuelType} ${row.fitmentGroupName}`.toLowerCase();
      if (!blob.includes(String(filters.q).toLowerCase())) continue;
    }
    out.push(row);
  }
  return out;
}

export async function deleteVehicleRecord(id) {
  const res = await VehicleVariant.deleteOne({ _id: id });
  return res.deletedCount === 1;
}

export async function duplicateVehicleRecord(id) {
  const src = await VehicleVariant.findById(id).lean();
  if (!src) return null;
  const copy = await VehicleVariant.create({
    modelId: src.modelId,
    name: src.name ? `${src.name} copy` : "copy",
    fuelType: src.fuelType,
    yearFrom: src.yearFrom,
    yearTo: src.yearTo,
    fitmentGroupId: src.fitmentGroupId,
    notes: src.notes,
  });
  return populatedVehicle(copy._id);
}

export async function listFitmentGroups() {
  return BatteryFitmentGroup.find({}).sort({ name: 1 }).lean();
}

export async function saveFitmentGroup(id, payload) {
  const doc = {
    name: String(payload.name || "").trim(),
    code: String(payload.code || "").trim(),
    voltage: nOrNull(payload.voltage),
    minAh: nOrNull(payload.minAh),
    maxAh: nOrNull(payload.maxAh),
    batteryType: String(payload.batteryType || "").trim(),
    length: nOrNull(payload.length),
    width: nOrNull(payload.width),
    height: nOrNull(payload.height),
    terminalConfiguration: String(payload.terminalConfiguration || "").trim(),
    polarity: String(payload.polarity || "").trim(),
    mountingInformation: String(payload.mountingInformation || "").trim(),
    notes: String(payload.notes || "").trim(),
    active: payload.active !== false,
  };
  if (!doc.name) throw Object.assign(new Error("Fitment name is required"), { status: 400 });
  if (id) {
    const updated = await BatteryFitmentGroup.findByIdAndUpdate(id, { $set: doc }, { new: true, runValidators: true });
    if (!updated) throw Object.assign(new Error("Fitment group not found"), { status: 404 });
    return updated;
  }
  return BatteryFitmentGroup.create(doc);
}

export async function deleteFitmentGroup(id) {
  const used = await VehicleVariant.countDocuments({ fitmentGroupId: id });
  if (used) {
    throw Object.assign(new Error(`Cannot delete: ${used} vehicle(s) use this fitment group`), { status: 400 });
  }
  const res = await BatteryFitmentGroup.deleteOne({ _id: id });
  return res.deletedCount === 1;
}
