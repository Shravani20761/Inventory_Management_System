/**
 * Demo seed for vehicleCompatibility + batteryInventory (car example).
 * Run: node server/scripts/seedVehicleBatteryDemo.js
 * Requires MONGODB_URI in .env (from project root Inventory_management).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectMongo } from "../config/mongodb.js";
import VehicleCompatibility from "../models/VehicleCompatibility.js";
import BatteryInventory from "../models/BatteryInventory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

async function main() {
  await connectMongo();

  await BatteryInventory.deleteMany({ batteryCode: { $in: ["CAR-BATTERY-014", "CAR-BATTERY-022", "BIKE-BATT-001"] } });
  await VehicleCompatibility.deleteMany({
    vehicleType: "four-wheeler",
    brand: /^Hyundai$/i,
    model: /^Creta$/i,
  });

  await BatteryInventory.insertMany([
    {
      batteryCode: "CAR-BATTERY-014",
      batteryBrand: "Amaron",
      modelNumber: "AAM-FL-00042B20L",
      qty: 5,
      price: 5721,
      priceWithOld: 5200,
      priceWithoutOld: 6400,
      capacityAh: 42,
      warranty: "48 Months",
    },
    {
      batteryCode: "CAR-BATTERY-022",
      batteryBrand: "Exide",
      modelNumber: "EEZY 44B20L",
      qty: 3,
      price: 5499,
      priceWithOld: 5000,
      priceWithoutOld: 6100,
      capacityAh: 44,
      warranty: "55 Months",
    },
    {
      batteryCode: "BIKE-BATT-001",
      batteryBrand: "Amaron",
      modelNumber: "PRO BIKE RIDER",
      qty: 10,
      price: 1180,
      priceWithOld: 980,
      priceWithoutOld: 1350,
      capacityAh: 5,
      warranty: "24 Months",
    },
  ]);

  await VehicleCompatibility.deleteMany({
    vehicleType: "two-wheeler",
    brand: /^Honda$/i,
    model: /^Activa 6G$/i,
  });

  await VehicleCompatibility.create({
    vehicleType: "four-wheeler",
    brand: "Hyundai",
    model: "Creta",
    fuelType: "Diesel",
    compatibleBatteryCodes: ["CAR-BATTERY-014", "CAR-BATTERY-022"],
    notes: "Demo mapping for Batterymela",
  });

  await VehicleCompatibility.create({
    vehicleType: "two-wheeler",
    brand: "Honda",
    model: "Activa 6G",
    fuelType: "",
    compatibleBatteryCodes: ["BIKE-BATT-001"],
    notes: "Demo bike mapping",
  });

  console.log("Seeded vehicleCompatibility + batteryInventory demo rows.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
