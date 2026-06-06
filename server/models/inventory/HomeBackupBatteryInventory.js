import mongoose from "mongoose";

/**
 * Standalone home / backup tubular (or flat) batteries for dynamic pairing with {@link InverterInventoryCatalog}.
 * Collection name: `battery_inventory` (distinct from automotive `batteryInventory`).
 */
const homeBackupBatteryInventorySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    type: { type: String, default: "Battery", trim: true },
    brand: { type: String, default: "", trim: true },
    model: { type: String, required: true, trim: true },
    batteryAH: { type: Number, default: 0 },
    batteryType: { type: String, default: "Tubular", trim: true },
    warranty: { type: String, default: "" },
    price: { type: Number, default: 0 },
    /** With old battery exchange — defaults to `price` when unset */
    priceWithOld: { type: Number, default: 0 },
    priceWithoutOld: { type: Number, default: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    image: { type: String, default: "" },
    brandDefaultImage: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true, collection: "battery_inventory" },
);

homeBackupBatteryInventorySchema.index({ branchId: 1, batteryAH: 1 });
homeBackupBatteryInventorySchema.index({ branchId: 1, brand: 1, model: 1 });

export default mongoose.models.HomeBackupBatteryInventory ||
  mongoose.model("HomeBackupBatteryInventory", homeBackupBatteryInventorySchema);
