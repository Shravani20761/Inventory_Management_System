/**
 * Seed sample rows into `inverterProducts` and `homeInverterBatteries` for combo quotation testing.
 * Run from repo root: node server/scripts/seedDedicatedComboCatalog.js
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongodb.js";
import "../config/registerCatalogModels.js";
import InverterProduct from "../models/InverterProduct.js";
import HomeInverterBattery from "../models/HomeInverterBattery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const SAMPLE_INVERTERS = [
  {
    brand: "Luminous",
    inverterModelNumber: "Zelio 1100",
    productCapacityVA: 1100,
    warranty: "24 months",
    inverterFinalPrice: 6200,
    image: "",
    quantity: 3,
  },
  {
    brand: "Microtek",
    inverterModelNumber: "UPS 24x7 HB 1275",
    productCapacityVA: 1275,
    warranty: "24 months",
    inverterFinalPrice: 7100,
    image: "",
    quantity: 2,
  },
  {
    brand: "V-Guard",
    inverterModelNumber: "Prime 1150",
    productCapacityVA: 1150,
    warranty: "24 months",
    inverterFinalPrice: 6800,
    image: "",
    quantity: 4,
  },
];

const SAMPLE_BATTERIES = [
  {
    brand: "Exide",
    batteryModelNumber: "Inva Tubular IT500",
    productCapacityAH: 150,
    batteryType: "Tubular",
    withOldPrice: 10500,
    withoutOldPrice: 11800,
    warranty: "36 months",
    image: "",
    quantity: 5,
  },
  {
    brand: "Amaron",
    batteryModelNumber: "Current AR150TT54",
    productCapacityAH: 150,
    batteryType: "Tubular",
    withOldPrice: 10200,
    withoutOldPrice: 11500,
    warranty: "36 months",
    image: "",
    quantity: 6,
  },
  {
    brand: "Luminous",
    batteryModelNumber: "Red Charge RC 18000",
    productCapacityAH: 150,
    batteryType: "Tubular",
    withOldPrice: 9900,
    withoutOldPrice: 11200,
    warranty: "36 months",
    image: "",
    quantity: 4,
  },
  {
    brand: "Exide",
    batteryModelNumber: "Inva Master IMTT1800",
    productCapacityAH: 180,
    batteryType: "Tubular",
    withOldPrice: 12800,
    withoutOldPrice: 14200,
    warranty: "36 months",
    image: "",
    quantity: 3,
  },
];

async function main() {
  await connectMongo();
  await InverterProduct.deleteMany({ notes: "seedDedicatedComboCatalog" });
  await HomeInverterBattery.deleteMany({ notes: "seedDedicatedComboCatalog" });
  const invDocs = SAMPLE_INVERTERS.map((r) => ({ ...r, notes: "seedDedicatedComboCatalog", active: true }));
  const batDocs = SAMPLE_BATTERIES.map((r) => ({ ...r, notes: "seedDedicatedComboCatalog", active: true }));
  await InverterProduct.insertMany(invDocs);
  await HomeInverterBattery.insertMany(batDocs);
  console.log("[seed] inverterProducts:", invDocs.length, "| homeInverterBatteries:", batDocs.length);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
