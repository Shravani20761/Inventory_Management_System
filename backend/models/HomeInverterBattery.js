import mongoose from "mongoose";

/**
 * Home / inverter backup battery rows — collection `homeInverterBatteries`.
 * Used by combo quotations (separate from inverterProducts).
 */
const homeInverterBatterySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    brand: { type: String, default: "", trim: true },
    batteryModelNumber: { type: String, default: "", trim: true },
    productCapacityAH: { type: Number, default: 0 },
    batteryType: { type: String, default: "", trim: true },
    withOldPrice: { type: Number, default: 0 },
    withoutOldPrice: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    image: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 0 },
    active: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

homeInverterBatterySchema.index({ branchId: 1, batteryModelNumber: 1 });

export default mongoose.models.HomeInverterBattery ||
  mongoose.model("HomeInverterBattery", homeInverterBatterySchema, "homeInverterBatteries");
