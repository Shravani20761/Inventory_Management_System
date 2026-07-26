import mongoose from "mongoose";

/**
 * Optional catalog for home / inverter backup batteries (tubular etc.).
 * Quotations still resolve prices from {@link Product} by default.
 */
const inverterBatterySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.InverterBattery || mongoose.model("InverterBattery", inverterBatterySchema, "inverterBatteries");
