import mongoose from "mongoose";

const carBatterySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    brand: { type: String, default: "", trim: true },
    modelNumber: { type: String, required: true, trim: true },
    capacity: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    priceWithOldBattery: { type: Number, default: 0 },
    priceWithoutOldBattery: { type: Number, default: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    vehicleType: { type: String, default: "Car", trim: true },
    batteryType: { type: String, default: "", trim: true },
    productCapacity: { type: String, default: "" },
    weight: { type: Number, default: 0 },
    scrapRate: { type: Number, default: 0 },
    dpPlusGst: { type: Number, default: 0 },
    cd: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    notes: { type: String, default: "" },
    /** Excel P&L cell as-is (not computed from sell − buy). */
    pl: { type: String, default: "", trim: true },
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
  { timestamps: true, collection: "car_batteries" },
);

carBatterySchema.index({ branchId: 1, modelNumber: 1 });

export default mongoose.models.CarBattery || mongoose.model("CarBattery", carBatterySchema);
