/**
 * Seed `inverter_inventory` + `battery_inventory` for dynamic combo quotations when both collections are empty.
 * Uses the first Branch from MongoDB (same pattern as server/scripts/seed.js).
 */
import "dotenv/config";
import "../config/registerCatalogModels.js";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";
import InverterInventoryCatalog from "../models/inventory/InverterInventoryCatalog.js";
import HomeBackupBatteryInventory from "../models/inventory/HomeBackupBatteryInventory.js";

await connectMongo();

const branch = await Branch.findOne().sort({ createdAt: 1 });
const bid = branch?._id ?? null;
const scope = bid ? { branchId: bid } : {};

const invCount = await InverterInventoryCatalog.countDocuments(scope);
const batCount = await HomeBackupBatteryInventory.countDocuments(scope);

if (invCount > 0 || batCount > 0) {
  console.log(
    "Skip seed: inverter_inventory or battery_inventory already has documents for this scope.",
    { invCount, batCount, branchId: bid?.toString() ?? null },
  );
  process.exit(0);
}

const inverterSamples = [
  {
    branchId: bid,
    type: "Inverter",
    brand: "Luminous",
    model: "Zelio 1100",
    inverterVA: 1100,
    warranty: "24 months",
    price: 7200,
    quantity: 5,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
  {
    branchId: bid,
    type: "Inverter",
    brand: "Microtek",
    model: "UPS 24x7 HB 1250",
    inverterVA: 1250,
    warranty: "24 months",
    price: 8900,
    quantity: 4,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
  {
    branchId: bid,
    type: "Inverter",
    brand: "Luminous",
    model: "Eco Volt+ 1500",
    inverterVA: 1500,
    warranty: "24 months",
    price: 11200,
    quantity: 3,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
];

const batterySamples = [
  {
    branchId: bid,
    type: "Battery",
    brand: "Exide",
    model: "Inva Tubular IT500",
    batteryAH: 150,
    batteryType: "Tubular",
    warranty: "36 months",
    price: 10500,
    priceWithOld: 10500,
    priceWithoutOld: 8200,
    quantity: 6,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
  {
    branchId: bid,
    type: "Battery",
    brand: "Amaron",
    model: "Current 150Ah",
    batteryAH: 150,
    batteryType: "Tubular",
    warranty: "36 months",
    price: 10200,
    priceWithOld: 10200,
    priceWithoutOld: 8000,
    quantity: 8,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
  {
    branchId: bid,
    type: "Battery",
    brand: "Luminous",
    model: "Red Charge RC 18000",
    batteryAH: 150,
    batteryType: "Tubular",
    warranty: "36 months",
    price: 9900,
    priceWithOld: 9900,
    priceWithoutOld: 7800,
    quantity: 5,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
  {
    branchId: bid,
    type: "Battery",
    brand: "Exide",
    model: "Inva Master IMTT1800",
    batteryAH: 180,
    batteryType: "Tubular",
    warranty: "42 months",
    price: 13800,
    priceWithOld: 13800,
    priceWithoutOld: 11200,
    quantity: 4,
    image: "",
    brandDefaultImage: "",
    notes: "Seeded for dynamic pairing",
  },
];

await InverterInventoryCatalog.insertMany(inverterSamples);
await HomeBackupBatteryInventory.insertMany(batterySamples);
console.log("Seeded inverter_inventory + battery_inventory rows.", { branchId: bid?.toString() ?? null });
process.exit(0);
