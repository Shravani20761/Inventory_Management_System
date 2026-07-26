import mongoose from "mongoose";

/** Optional catalog link for bike batteries (`type: bike` in Product). */
const bikeBatterySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    bikeHints: { type: String, default: "" },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.BikeBatteryProduct || mongoose.model("BikeBatteryProduct", bikeBatterySchema, "bikeBatteries");
