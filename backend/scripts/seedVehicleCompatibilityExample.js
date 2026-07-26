/**
 * Upserts example vehicleCompatibility + batteryInventory rows for Honda City Petrol.
 * Run: node server/scripts/seedVehicleCompatibilityExample.js
 */
import "dotenv/config";
import { connectMongo } from "../config/mongodb.js";
import VehicleCompatibility from "../models/VehicleCompatibility.js";
import BatteryInventory from "../models/BatteryInventory.js";

await connectMongo();

const batteries = [
  {
    batteryCode: "SEED-AMARON-55AH",
    batteryBrand: "Amaron",
    modelNumber: "Flo 55Ah DIN55",
    qty: 6,
    price: 6200,
    priceWithOld: 5800,
    priceWithoutOld: 6500,
    capacityAh: 55,
    warranty: "55 months",
    active: true,
  },
  {
    batteryCode: "SEED-EXIDE-60AH",
    batteryBrand: "Exide",
    modelNumber: "EEZY 60Ah",
    qty: 4,
    price: 5900,
    priceWithOld: 5500,
    priceWithoutOld: 6200,
    capacityAh: 60,
    warranty: "48 months",
    active: true,
  },
];

for (const b of batteries) {
  await BatteryInventory.updateOne(
    { batteryCode: b.batteryCode },
    { $set: b },
    { upsert: true },
  );
}

const vc = await VehicleCompatibility.findOneAndUpdate(
  {
    vehicleType: "four-wheeler",
    brand: "Honda",
    model: "City",
    fuelType: "Petrol",
  },
  {
    $set: {
      vehicleType: "four-wheeler",
      brand: "Honda",
      model: "City",
      vehicleBrand: "Honda",
      vehicleModel: "City",
      fuelType: "Petrol",
      compatibleBatteryCodes: ["SEED-AMARON-55AH", "SEED-EXIDE-60AH"],
      compatibleBatteryModels: ["Amaron 55Ah", "Exide 60Ah"],
      notes: "Example seed — replace with your shop mappings.",
      active: true,
    },
  },
  { upsert: true, new: true, runValidators: true },
);

console.log("Seeded vehicleCompatibility:", vc._id.toString());
console.log("Seeded batteryInventory codes:", batteries.map((x) => x.batteryCode).join(", "));
process.exit(0);
