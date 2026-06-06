import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    billDetails: { type: String, default: "" },
    billNo: { type: String, default: "" },
    supplier: { type: String, default: "" },
    place: { type: String, default: "" },
    date: { type: String, default: "" },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    total: { type: Number, default: 0 },
    /** Stable id from legacy UI (e.g. PUR-001) */
    externalId: { type: String, default: "" },
  },
  { timestamps: true }
);

purchaseSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret.externalId || ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Purchase || mongoose.model("Purchase", purchaseSchema);
