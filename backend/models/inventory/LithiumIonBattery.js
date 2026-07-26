import mongoose from "mongoose";

/** Lithium-ion battery SKUs — collection `lithium_ion_batteries` (separate from home / automotive). */
const lithiumIonBatterySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    brand: { type: String, default: "", trim: true },
    modelNumber: { type: String, required: true, trim: true },
    batteryModel: { type: String, default: "", trim: true },
    /** Nominal voltage e.g. 12, 24, 48 */
    voltage: { type: Number, default: 0 },
    capacityAH: { type: Number, default: 0 },
    batteryWeight: { type: Number, default: 0 },
    scrapRate: { type: Number, default: 0 },
    batteryType: { type: String, default: "Lithium Ion", trim: true },
    dp: { type: Number, default: 0 },
    cd: { type: Number, default: 0 },
    mrpFinal: { type: Number, default: 0 },
    /** With old battery exchange */
    price: { type: Number, default: 0 },
    /** Without old battery */
    priceWithoutOld: { type: Number, default: 0 },
    purchaseRate: { type: Number, default: 0 },
    warranty: { type: String, default: "", trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    amazonPrice: { type: Number, default: 0 },
    flipkartPrice: { type: Number, default: 0 },
    batteryBhaiPrice: { type: Number, default: 0 },
    batteryBossPrice: { type: Number, default: 0 },
    supplier: { type: String, default: "", trim: true },
    invoiceNo: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true, collection: "lithium_ion_batteries" },
);

lithiumIonBatterySchema.index({ branchId: 1, brand: 1, modelNumber: 1 });

export default mongoose.models.LithiumIonBattery ||
  mongoose.model("LithiumIonBattery", lithiumIonBatterySchema);
