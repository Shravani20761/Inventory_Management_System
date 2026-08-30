import mongoose from "mongoose";

const homeInvBatterySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    brand: { type: String, default: "", trim: true },
    /** Battery model number (ERP: batteryModelNumber) */
    modelNumber: { type: String, required: true, trim: true },
    batteryModel: { type: String, default: "", trim: true },
    /** ERP: productCapacityAh */
    capacityAH: { type: Number, default: 0 },
    batteryWeight: { type: Number, default: 0 },
    scrapRate: { type: Number, default: 0 },
    /** Cash discount / dealer price (ERP: cd) */
    cdPrice: { type: Number, default: 0 },
    /** Distributor purchase price (ERP: dp) */
    dpPrice: { type: Number, default: 0 },
    /** Final customer MRP (ERP: mrpFinal) */
    mrpFinal: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    /** With old battery exchange (ERP: withOld) */
    price: { type: Number, default: 0 },
    /** Without old battery (ERP: withoutOld) */
    priceWithoutOld: { type: Number, default: 0 },
    purchaseRate: { type: Number, default: 0 },
    /** ERP: qty */
    quantity: { type: Number, default: 0, min: 0 },
    batteryType: { type: String, default: "", trim: true },
    amazonPrice: { type: Number, default: 0 },
    flipkartPrice: { type: Number, default: 0 },
    batteryBhaiPrice: { type: Number, default: 0 },
    batteryBossPrice: { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    batteryImage: { type: String, default: "" },
    inverterImage: { type: String, default: "" },
    brandLogo: { type: String, default: "" },
  },
  { timestamps: true, collection: "home_inverter_batteries" },
);

homeInvBatterySchema.index({ branchId: 1, modelNumber: 1 });

export default mongoose.models.HomeInvBattery || mongoose.model("HomeInvBattery", homeInvBatterySchema);
