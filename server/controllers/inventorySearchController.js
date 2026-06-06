import { searchInventoryByType } from "../services/inventorySearchService.js";

function tenant(req) {
  return {
    branchId: req.user?.branchId || null,
    isSuperAdmin: req.user?.role === "superAdmin",
  };
}

function baseFilters(req) {
  const t = tenant(req);
  return {
    currentBranchId: req.query.currentBranchId || t.branchId,
  };
}

function pickQuery(req, keys) {
  const out = { ...baseFilters(req) };
  for (const k of keys) {
    if (req.query[k] != null && String(req.query[k]).trim() !== "") out[k] = req.query[k];
  }
  return out;
}

export async function searchBatteryController(req, res, next) {
  try {
    const filters = pickQuery(req, ["brand", "capacityAh", "batteryType", "modelNumber"]);
    if (req.query.ah && !filters.capacityAh) filters.capacityAh = req.query.ah;
    res.json(await searchInventoryByType("battery", filters));
  } catch (e) {
    next(e);
  }
}

export async function searchInverterController(req, res, next) {
  try {
    const filters = pickQuery(req, ["brand", "inverterVA", "modelNumber", "technology", "va"]);
    if (filters.va && !filters.inverterVA) filters.inverterVA = filters.va;
    res.json(await searchInventoryByType("inverter", filters));
  } catch (e) {
    next(e);
  }
}

export async function searchCarBatteryController(req, res, next) {
  try {
    const filters = pickQuery(req, [
      "vehicleBrand",
      "vehicleModel",
      "fuelType",
      "capacity",
      "modelNumber",
      "brand",
      "carBrand",
      "carModel",
    ]);
    if (filters.carBrand && !filters.vehicleBrand) filters.vehicleBrand = filters.carBrand;
    if (filters.carModel && !filters.vehicleModel) filters.vehicleModel = filters.carModel;
    if (req.query.ah && !filters.capacity) filters.capacity = req.query.ah;
    res.json(await searchInventoryByType("car-battery", filters));
  } catch (e) {
    next(e);
  }
}

export async function searchBikeBatteryController(req, res, next) {
  try {
    const filters = pickQuery(req, ["bikeBrand", "bikeModel", "capacity", "modelNumber", "brand"]);
    if (req.query.ah && !filters.capacity) filters.capacity = req.query.ah;
    res.json(await searchInventoryByType("bike-battery", filters));
  } catch (e) {
    next(e);
  }
}

export async function searchComboController(req, res, next) {
  try {
    const filters = pickQuery(req, [
      "inverterVA",
      "batteryAH",
      "batteryType",
      "brandPreference",
      "brandPairing",
      "va",
      "ah",
    ]);
    if (filters.va && !filters.inverterVA) filters.inverterVA = filters.va;
    if (filters.ah && !filters.batteryAH) filters.batteryAH = filters.ah;
    res.json(await searchInventoryByType("combo", filters));
  } catch (e) {
    next(e);
  }
}

export async function searchTrolleyController(req, res, next) {
  try {
    const filters = pickQuery(req, ["brand", "modelNumber", "compatibleVA", "model", "va"]);
    if (filters.model && !filters.modelNumber) filters.modelNumber = filters.model;
    if (filters.va && !filters.compatibleVA) filters.compatibleVA = filters.va;
    res.json(await searchInventoryByType("trolley", filters));
  } catch (e) {
    next(e);
  }
}
