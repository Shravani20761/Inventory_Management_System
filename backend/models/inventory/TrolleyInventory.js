import mongoose from "mongoose";

/** Luminous / accessory trolley SKUs — collection `trolley_inventory`. */
const trolleyInventorySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    brand: { type: String, default: "Luminous", trim: true },
    modelNumber: { type: String, required: true, trim: true },
    compatibleVA: { type: Number, default: 0 },
    /** Display compatibility text e.g. "1100 VA" */
    productCapacity: { type: String, default: "" },
    suitableBatteryType: { type: String, default: "", trim: true },
    /** Distributor purchase price */
    dp: { type: Number, default: 0 },
    /** Cash discount / cash payment price */
    cd: { type: Number, default: 0 },
    /** Final customer selling price */
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true, collection: "trolley_inventory" },
);

trolleyInventorySchema.index({ branchId: 1, brand: 1, modelNumber: 1 });

export default mongoose.models.TrolleyInventory ||
  mongoose.model("TrolleyInventory", trolleyInventorySchema);
