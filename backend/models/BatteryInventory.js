import mongoose from "mongoose";

/**
 * Stand-alone automotive battery stock (car / bike SKUs).
 * Linked from {@link VehicleCompatibility} via `batteryCode`.
 */
const batteryInventorySchema = new mongoose.Schema(
  {
    batteryCode: { type: String, required: true, unique: true, trim: true, index: true },
    batteryBrand: { type: String, default: "", trim: true },
    modelNumber: { type: String, default: "", trim: true },
    qty: { type: Number, default: 0 },
    /** Primary sell / list price */
    price: { type: Number, default: 0 },
    priceWithOld: { type: Number, default: 0 },
    priceWithoutOld: { type: Number, default: 0 },
    capacityAh: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    amazonPrice: { type: Number, default: 0 },
    flipkartPrice: { type: Number, default: 0 },
    batteryBhaiPrice: { type: Number, default: 0 },
    batteryBossPrice: { type: Number, default: 0 },
    voltage: { type: Number, default: 12 },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

batteryInventorySchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.BatteryInventory || mongoose.model("BatteryInventory", batteryInventorySchema, "batteryInventory");
