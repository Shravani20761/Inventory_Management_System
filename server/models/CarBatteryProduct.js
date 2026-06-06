import mongoose from "mongoose";

/** Optional catalog link for car batteries (`type: car` in Product). */
const carBatterySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    /** Free-text e.g. "Maruti Swift" for future strict matching */
    vehicleHints: { type: String, default: "" },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.CarBatteryProduct || mongoose.model("CarBatteryProduct", carBatterySchema, "carBatteries");
