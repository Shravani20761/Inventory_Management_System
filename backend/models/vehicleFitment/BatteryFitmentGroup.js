import mongoose from "mongoose";

const batteryFitmentGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, default: "", trim: true, index: true },
    voltage: { type: Number, default: null },
    minAh: { type: Number, default: null },
    maxAh: { type: Number, default: null },
    batteryType: { type: String, default: "", trim: true },
    length: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    terminalConfiguration: { type: String, default: "", trim: true },
    polarity: { type: String, default: "", trim: true },
    mountingInformation: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "battery_fitment_groups" },
);

export default mongoose.models.BatteryFitmentGroup || mongoose.model("BatteryFitmentGroup", batteryFitmentGroupSchema);
