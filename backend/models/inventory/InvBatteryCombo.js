import mongoose from "mongoose";

const invBatteryComboSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    comboId: { type: String, default: "", trim: true },
    brand: { type: String, default: "", trim: true },
    inverterModel: { type: String, default: "", trim: true },
    batteryModel: { type: String, default: "", trim: true },
    productCapacity: { type: String, default: "" },
    batteryType: { type: String, default: "" },
    scrapRate: { type: Number, default: 0 },
    batteryWeight: { type: Number, default: 0 },
    comboPrice: { type: Number, default: 0 },
    backupHours: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    quantity: { type: Number, default: 0, min: 0 },
    inverterPrice: { type: Number, default: 0 },
    batteryPrice: { type: Number, default: 0 },
    finalPriceWithOldBattery: { type: Number, default: 0 },
    finalPriceWithoutOldBattery: { type: Number, default: 0 },
    inverterVA: { type: Number, default: 0 },
    capacityAh: { type: Number, default: 0 },
    suitableFor: { type: String, default: "" },
    supplier: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    notes: { type: String, default: "" },
    /** Excel P&L cell as-is (not computed from sell − buy). */
    pl: { type: String, default: "", trim: true },
    /** Always "Inverter+Battery" for this collection — stored for API/exports (not raw Excel "type"). */
    productCategory: { type: String, default: "Inverter+Battery", trim: true },
    /** HTTPS URLs (e.g. Cloudinary) for quotation PDFs — optional. */
    inverterImage: { type: String, default: "" },
    batteryImage: { type: String, default: "" },
    brandLogo: { type: String, default: "" },
  },
  { timestamps: true, collection: "inv_battery_combos" },
);

invBatteryComboSchema.index({ branchId: 1, comboId: 1 });
invBatteryComboSchema.index({ branchId: 1, inverterModel: 1, batteryModel: 1 });

export default mongoose.models.InvBatteryCombo || mongoose.model("InvBatteryCombo", invBatteryComboSchema);
