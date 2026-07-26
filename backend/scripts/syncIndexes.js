/**
 * Ensures Mongoose schema indexes exist in MongoDB.
 * Run from Inventory_management: npm run db:sync-indexes
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongodb.js";
import Branch from "../models/Branch.js";
import StockTransferRequest from "../models/StockTransferRequest.js";
import User from "../models/User.js";
import CarBattery from "../models/inventory/CarBattery.js";
import BikeBattery from "../models/inventory/BikeBattery.js";
import InverterSku from "../models/inventory/InverterSku.js";
import InvBatteryCombo from "../models/inventory/InvBatteryCombo.js";
import HomeInvBattery from "../models/inventory/HomeInvBattery.js";
import Purchase from "../models/Purchase.js";
import Sale from "../models/Sale.js";
import Quotation from "../models/Quotation.js";
import Invoice from "../models/Invoice.js";
import ProfitLog from "../models/ProfitLog.js";
import ComboTemplate from "../models/ComboTemplate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env") });

const models = [
  Branch,
  StockTransferRequest,
  User,
  CarBattery,
  BikeBattery,
  InverterSku,
  InvBatteryCombo,
  HomeInvBattery,
  Purchase,
  Sale,
  Quotation,
  Invoice,
  ProfitLog,
  ComboTemplate,
];

await connectMongo();
for (const Model of models) {
  try {
    await Model.syncIndexes();
    console.log(`[indexes] ${Model.collection.name} — OK`);
  } catch (e) {
    console.error(`[indexes] ${Model.modelName} —`, e.message);
  }
}
await mongoose.connection.close();
console.log("[indexes] Done.");
process.exit(0);
