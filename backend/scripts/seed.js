import "dotenv/config";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";
import CarBattery from "../models/inventory/CarBattery.js";
import InverterSku from "../models/inventory/InverterSku.js";
import InverterInventoryCatalog from "../models/inventory/InverterInventoryCatalog.js";

await connectMongo();

let branch = await Branch.findOne();
if (!branch) {
  branch = await Branch.create({ name: "Main Branch", code: "MAIN", city: "Mumbai", address: "" });
  console.log("Created branch", branch.name);
}

const bid = branch._id;

const carSamples = [
  {
    branchId: bid,
    legacyId: 1,
    brand: "Exide",
    modelNumber: "Exide Inva Tubular IT500",
    capacity: 150,
    warranty: "36 months",
    priceWithOldBattery: 10500,
    priceWithoutOldBattery: 8200,
    quantity: 5,
    vehicleType: "Car",
    batteryType: "Tubular",
  },
  {
    branchId: bid,
    legacyId: 3,
    brand: "Amaron",
    modelNumber: "Amaron Current 150Ah",
    capacity: 150,
    warranty: "36 months",
    priceWithOldBattery: 9800,
    priceWithoutOldBattery: 7800,
    quantity: 8,
    vehicleType: "Car",
    batteryType: "Tubular",
  },
  {
    branchId: bid,
    legacyId: 5,
    brand: "Exide",
    modelNumber: "Exide FFS0-EXPLAQ60",
    capacity: 60,
    warranty: "24 months",
    priceWithOldBattery: 4200,
    priceWithoutOldBattery: 3200,
    quantity: 10,
    vehicleType: "Car",
    batteryType: "Flat",
  },
];

const inverterSamples = [
  {
    branchId: bid,
    legacyId: 2,
    type: "Inverter",
    brand: "Luminous",
    model: "Zelio 1100",
    modelNumber: "Luminous Zelio 1100",
    inverterVA: 1100,
    warranty: "24 months",
    price: 7200,
    quantity: 4,
  },
  {
    branchId: bid,
    legacyId: 4,
    type: "Inverter",
    brand: "Microtek",
    model: "1500VA",
    modelNumber: "Microtek 1500VA",
    inverterVA: 1500,
    warranty: "24 months",
    price: 8400,
    quantity: 3,
  },
];

await CarBattery.deleteMany({ branchId: bid });
await InverterSku.deleteMany({ branchId: bid });
await InverterInventoryCatalog.deleteMany({ branchId: bid });
await CarBattery.insertMany(carSamples);
await InverterInventoryCatalog.insertMany(inverterSamples);
await InverterSku.insertMany(
  inverterSamples.map((s) => ({
    branchId: s.branchId,
    legacyId: s.legacyId,
    brand: s.brand,
    modelNumber: s.modelNumber,
    inverterVA: s.inverterVA,
    warranty: s.warranty,
    price: s.price,
    quantity: s.quantity,
    productCapacity: `${s.inverterVA} VA`,
  })),
);
console.log(
  "Seeded",
  carSamples.length,
  "car batteries and",
  inverterSamples.length,
  "inverters (inverter_inventory + legacy inverters) for branch",
  branch.name,
);
process.exit(0);
