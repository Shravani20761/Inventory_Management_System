import mongoose from "mongoose";

const bikeBatterySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    brand: { type: String, default: "", trim: true },
    modelNumber: { type: String, required: true, trim: true },
    capacity: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    cd: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    supplier: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    notes: { type: String, default: "" },
    batteryType: { type: String, default: "", trim: true },
    voltage: { type: Number, default: 12 },
    lengthMm: { type: Number, default: 0 },
    widthMm: { type: Number, default: 0 },
    heightMm: { type: Number, default: 0 },
    terminalConfiguration: { type: String, default: "" },
    polarity: { type: String, default: "" },
    batteryImage: { type: String, default: "" },
    inverterImage: { type: String, default: "" },
    brandLogo: { type: String, default: "" },
  },
  { timestamps: true, collection: "bike_batteries" },
);

bikeBatterySchema.index({ branchId: 1, modelNumber: 1 });

export default mongoose.models.BikeBattery || mongoose.model("BikeBattery", bikeBatterySchema);
