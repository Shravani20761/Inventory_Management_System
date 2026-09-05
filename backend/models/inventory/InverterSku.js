import mongoose from "mongoose";

const inverterSkuSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    legacyId: { type: Number, sparse: true, index: true },
    brand: { type: String, default: "", trim: true },
    modelNumber: { type: String, required: true, trim: true },
    inverterVA: { type: Number, default: 0 },
    technology: { type: String, default: "", trim: true },
    inverterType: { type: String, default: "", trim: true },
    warranty: { type: String, default: "" },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    productCapacity: { type: String, default: "" },
    mrp: { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    notes: { type: String, default: "" },
    /** Excel P&L cell as-is (not computed from sell − buy). */
    pl: { type: String, default: "", trim: true },
    batteryImage: { type: String, default: "" },
    inverterImage: { type: String, default: "" },
    brandLogo: { type: String, default: "" },
    image: { type: String, default: "" },
    brandDefaultImage: { type: String, default: "" },
  },
  { timestamps: true, collection: "inverters" },
);

inverterSkuSchema.index({ branchId: 1, modelNumber: 1 });

export default mongoose.models.InverterSku || mongoose.model("InverterSku", inverterSkuSchema);
