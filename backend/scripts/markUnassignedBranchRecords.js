/**
 * Mark existing records with null branchId for admin review.
 * Does NOT assign a branch automatically.
 * Run: node scripts/markUnassignedBranchRecords.js
 */
import "dotenv/config";
import { connectMongo } from "../config/mongodb.js";
import Invoice from "../models/Invoice.js";
import Quotation from "../models/Quotation.js";
import Purchase from "../models/Purchase.js";
import Sale from "../models/Sale.js";
import Expense from "../models/Expense.js";

await connectMongo();

const filter = { $or: [{ branchId: null }, { branchId: { $exists: false } }] };

const counts = {};
for (const [name, Model] of [
  ["invoices", Invoice],
  ["quotations", Quotation],
  ["purchases", Purchase],
  ["sales", Sale],
  ["expenses", Expense],
]) {
  try {
    counts[name] = await Model.countDocuments(filter);
  } catch (e) {
    counts[name] = `error: ${e.message}`;
  }
}

console.log("Records without branchId (do not auto-assign — review in Admin UI):");
console.log(JSON.stringify(counts, null, 2));
console.log("\nInventory category collections may also have null branchId — check Atlas filters.");
process.exit(0);
