/**
 * Dev-only shape for manual MongoDB write checks (Atlas visibility).
 * Collection: battery_write_tests — safe to drop after debugging.
 */
import mongoose from "mongoose";

const batteryWriteTestSchema = new mongoose.Schema(
  {
    brand: { type: String, default: "" },
    model: { type: String, default: "" },
    price: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "battery_write_tests" },
);

export default mongoose.models.BatteryWriteTest || mongoose.model("BatteryWriteTest", batteryWriteTestSchema);
