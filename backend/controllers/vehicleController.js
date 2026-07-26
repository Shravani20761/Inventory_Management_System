import {
  listVehicleBrands,
  listVehicleModels,
  listVehicleFuels,
  resolveBatteriesByVehicle,
} from "../services/vehicleBatteryCompatibilityService.js";
import { VEHICLE_COMPATIBILITY_TYPES } from "../models/VehicleCompatibility.js";

function validVehicleType(v) {
  return VEHICLE_COMPATIBILITY_TYPES.includes(v) ? v : null;
}

export async function listVehicleBrandsController(req, res, next) {
  try {
    const vehicleType = validVehicleType(req.query.vehicleType) || "four-wheeler";
    const q = String(req.query.q ?? req.query.search ?? "").trim();
    const brands = await listVehicleBrands(vehicleType, q);
    res.json({ vehicleType, brands });
  } catch (err) {
    next(err);
  }
}

export async function listVehicleModelsController(req, res, next) {
  try {
    const vehicleType = validVehicleType(req.query.vehicleType) || "four-wheeler";
    const brand = String(req.query.brand ?? "").trim();
    if (!brand) return res.status(400).json({ error: "Query parameter brand is required" });
    const q = String(req.query.q ?? req.query.search ?? "").trim();
    const models = await listVehicleModels(vehicleType, brand, q);
    res.json({ vehicleType, brand, models });
  } catch (err) {
    next(err);
  }
}

export async function listVehicleFuelsController(req, res, next) {
  try {
    const vehicleType = validVehicleType(req.query.vehicleType) || "four-wheeler";
    const brand = String(req.query.brand ?? "").trim();
    const model = String(req.query.model ?? "").trim();
    if (!brand || !model) return res.status(400).json({ error: "brand and model query parameters are required" });
    const fuels = await listVehicleFuels(vehicleType, brand, model);
    res.json({ vehicleType, brand, model, fuels });
  } catch (err) {
    next(err);
  }
}

export async function compatibleBatteriesController(req, res, next) {
  try {
    const vehicleType = validVehicleType(req.query.vehicleType) || "four-wheeler";
    const brand = String(req.query.brand ?? "").trim();
    const model = String(req.query.model ?? "").trim();
    const fuelType = String(req.query.fuelType ?? "").trim();
    if (!brand || !model) return res.status(400).json({ error: "brand and model are required" });
    if (vehicleType === "four-wheeler" && !fuelType) {
      return res.status(400).json({ error: "fuelType is required for four-wheeler" });
    }
    const result = await resolveBatteriesByVehicle(vehicleType, brand, model, fuelType);
    res.json({
      vehicleType,
      brand,
      model,
      fuelType: vehicleType === "four-wheeler" ? fuelType : "",
      matchedCompatibilityCount: result.rows.length,
      batteryCodes: result.codes,
      batteries: result.batteries.map((b) => ({
        id: b._id?.toString(),
        batteryCode: b.batteryCode,
        batteryBrand: b.batteryBrand,
        modelNumber: b.modelNumber,
        qty: b.qty,
        price: b.price,
        priceWithOld: b.priceWithOld,
        priceWithoutOld: b.priceWithoutOld,
        capacityAh: b.capacityAh,
        warranty: b.warranty,
        imageUrl: b.imageUrl,
      })),
    });
  } catch (err) {
    next(err);
  }
}
