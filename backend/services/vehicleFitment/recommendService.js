import VehicleType from "../../models/vehicleFitment/VehicleType.js";
import { listCategory, CATEGORY } from "../categoryInventoryService.js";
import { scoreProductAgainstFitment, rankLabel } from "./matchInventory.js";
import { populatedVehicle } from "./catalogService.js";

function inventoryKeysForType(typeSlug) {
  const s = String(typeSlug || "").toLowerCase();
  if (s === "bike" || s === "scooter") return [CATEGORY.BIKE];
  if (s === "car" || s === "commercial") return [CATEGORY.CAR];
  return [CATEGORY.CAR, CATEGORY.BIKE];
}

export async function recommendBatteriesForVariant(variantId, tenant, { includeOutOfStock = false, year } = {}) {
  const variant = await populatedVehicle(variantId);
  if (!variant) {
    const err = new Error("Vehicle variant not found");
    err.status = 404;
    throw err;
  }
  if (year) {
    const y = Number(year);
    const from = variant.yearFrom;
    const to = variant.yearTo;
    if ((from && y < from) || (to && y > to)) {
      return {
        vehicle: variant,
        fitment: null,
        unavailable: true,
        message: "Fitment data unavailable for the selected year. Please verify the vehicle specification before recommending a battery.",
        recommendations: [],
        outOfStockCompatible: [],
      };
    }
  }
  if (!variant.fitmentGroupId || !variant.fitment) {
    return {
      vehicle: variant,
      fitment: null,
      unavailable: true,
      message: "Fitment data unavailable. Please verify the vehicle specification before recommending a battery.",
      recommendations: [],
      outOfStockCompatible: [],
    };
  }

  const type = await VehicleType.findById(variant.vehicleTypeId).lean();
  const keys = inventoryKeysForType(type?.slug);
  const rows = [];
  for (const key of keys) {
    const list = await listCategory(key, tenant);
    rows.push(...(list || []));
  }

  const inStock = [];
  const outStock = [];
  for (const product of rows) {
    const scored = scoreProductAgainstFitment(product, variant.fitment, { includeOutOfStock: true });
    if (!scored.compatible) continue;
    const card = {
      productId: String(product._id || product.id),
      brand: product.brand,
      model: product.model || product.modelNumber,
      sku: product.comboId || product.model || product.modelNumber,
      category: product.type || product.category,
      voltage: product.voltage || null,
      ah: product.ah || product.capacityAh,
      batteryType: product.batteryType || product.type,
      sellingPrice: product.sellRate || product.sellingRate || product.mrp || product.newRateWithOB || 0,
      stockQuantity: Number(product.quantity ?? 0),
      image: product.batteryImage || product.imageUrl || product.brandLogo || "",
      rank: scored.rank,
      rankLabel: rankLabel(scored.rank),
      score: scored.score,
      maxScore: scored.maxScore,
      checks: scored.checks,
      reasons: scored.reasons,
      inStock: Number(product.quantity ?? 0) > 0,
      vehicle: {
        vehicleType: variant.vehicleTypeName,
        brand: variant.brandName,
        model: variant.modelName,
        variant: variant.name,
        fuelType: variant.fuelType,
        yearFrom: variant.yearFrom,
        yearTo: variant.yearTo,
        fitmentGroup: variant.fitmentGroupName,
        variantId: variant.id,
      },
    };
    if (card.inStock) inStock.push(card);
    else outStock.push(card);
  }

  const sortFn = (a, b) => {
    const order = { exact: 0, good: 1, alternative: 2 };
    return (order[a.rank] ?? 9) - (order[b.rank] ?? 9) || b.score - a.score;
  };
  inStock.sort(sortFn);
  outStock.sort(sortFn);

  const list = includeOutOfStock ? [...inStock, ...outStock] : inStock;
  return {
    vehicle: variant,
    fitment: variant.fitment,
    unavailable: false,
    verifiedFitment: true,
    message: list.length ? "" : "No compatible battery currently available in inventory.",
    recommendations: list,
    outOfStockCompatible: outStock,
  };
}
