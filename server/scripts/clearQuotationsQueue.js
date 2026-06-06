/**
 * Remove all final quotation records from MongoDB (the "quotations queue" in the UI)
 * and clear dangling links on recommendation sheets.
 *
 * Usage (from Inventory_management folder):
 *   npm run clear:quotations-db
 *
 * Does not delete invoices. Optional: run `npm run clear:quotation-pdfs` to remove PDF files on disk.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongodb.js";
import Quotation from "../models/Quotation.js";
import RecommendationSheet from "../models/RecommendationSheet.js";

await connectMongo();

const result = await Quotation.deleteMany({});

await RecommendationSheet.updateMany(
  {},
  {
    $set: {
      finalQuotationId: null,
      linkedFinalQuotationIds: [],
      quotationFamilyKey: "",
    },
  },
);

await RecommendationSheet.updateMany({ status: "QuotationGenerated" }, { $set: { status: "AwaitingSelection" } });

const cleared = result.deletedCount ?? 0;
console.log(`[clear-quotations-queue] Deleted ${cleared} quotation document(s).`);
console.log("[clear-quotations-queue] Cleared finalQuotationId / linkedFinalQuotationIds on recommendation sheets.");
await mongoose.disconnect();
process.exit(0);
