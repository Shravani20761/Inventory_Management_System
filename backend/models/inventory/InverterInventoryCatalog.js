import mongoose from "mongoose";

/**
 * Standalone inverter SKUs for dynamic inverter+battery quotations (no combo permutations).
 * Collection name: `inverter_inventory`
 */
const inverterInventoryCatalogSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    type: { type: String, default: "Inverter", trim: true },
    brand: { type: String, default: "", trim: true },
    model: { type: String, required: true, trim: true },
    inverterVA: { type: Number, default: 0 },
    productCapacity: { type: String, default: "" },
    warranty: { type: String, default: "" },
    /** Distributor purchase price */
    dp: { type: Number, default: 0 },
    /** Cash discount price */
    cd: { type: Number, default: 0 },
    /** Final customer MRP */
    mrp: { type: Number, default: 0 },
    /** Sell price used by quotations (typically MRP) */
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    amazonPrice: { type: Number, default: 0 },
    flipkartPrice: { type: Number, default: 0 },
    batteryBhaiPrice: { type: Number, default: 0 },
    batteryBossPrice: { type: Number, default: 0 },
    image: { type: String, default: "" },
    brandDefaultImage: { type: String, default: "" },
  },
  { timestamps: true, collection: "inverter_inventory" },
);

inverterInventoryCatalogSchema.index({ branchId: 1, inverterVA: 1 });
inverterInventoryCatalogSchema.index({ branchId: 1, brand: 1, model: 1 });

export default mongoose.models.InverterInventoryCatalog ||
  mongoose.model("InverterInventoryCatalog", inverterInventoryCatalogSchema);
