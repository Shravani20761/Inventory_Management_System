import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    /** Numeric id for legacy UI sync (stable across saves) */
    legacyId: { type: Number, sparse: true, index: true },
    modelName: { type: String, required: true, trim: true },
    brand: { type: String, default: "Unknown", trim: true },
    category: { type: String, default: "Battery" },
    quantity: { type: Number, default: 0, min: 0 },
    purchaseRate: { type: Number, default: 0 },
    sellingRate: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    capacityAh: { type: Number, default: 0 },
    inverterVA: { type: Number, default: 0 },
    batteryType: { type: String, default: "" },
    /** Inverter + Battery combo (price sheet) */
    comboId: { type: String, default: "" },
    inverterModel: { type: String, default: "" },
    batteryModel: { type: String, default: "" },
    backupHours: { type: Number, default: 0 },
    /** Free text from “Backup Support” column (home inverter battery sheet). */
    backupSupport: { type: String, default: "" },
    suitableFor: { type: String, default: "" },
    comboCategory: { type: String, default: "" },
    inverterPrice: { type: Number, default: 0 },
    batteryPrice: { type: Number, default: 0 },
    /** Combo totals (same row as inverter + battery); preferred over inferring from parts */
    finalPriceWithOldBattery: { type: Number, default: 0 },
    finalPriceWithoutOldBattery: { type: Number, default: 0 },
    /** Optional: battery line without old, when different from `batteryPrice` */
    batteryPriceWithoutOld: { type: Number, default: 0 },
    amazonPrice: { type: Number, default: 0 },
    flipkartPrice: { type: Number, default: 0 },
    batteryBhaiPrice: { type: Number, default: 0 },
    batteryBossPrice: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    availability: { type: Boolean, default: true },
    type: { type: String, default: "Battery" },
    supplier: { type: String, default: "" },
    place: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    /** Price sheet / inventory form (matches shop spreadsheet) */
    productCapacity: { type: String, default: "" },
    weight: { type: Number, default: 0 },
    scrapRate: { type: Number, default: 0 },
    dpPlusGst: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    newRateWithOB: { type: Number, default: 0 },
    newRateWithoutOB: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ branchId: 1, legacyId: 1 }, { sparse: true });
productSchema.index({ branchId: 1, modelName: 1 });

productSchema.virtual("sellRate").get(function () {
  return this.sellingRate;
});

productSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    ret.id = ret.legacyId != null ? ret.legacyId : ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Product || mongoose.model("Product", productSchema);
