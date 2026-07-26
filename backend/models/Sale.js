import mongoose from "mongoose";

const saleSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    customer: { type: String, default: "" },
    phone: { type: String, default: "" },
    date: { type: String, default: "" },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    total: { type: Number, default: 0 },
    externalId: { type: String, default: "" },
  },
  { timestamps: true }
);

saleSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret.externalId || ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Sale || mongoose.model("Sale", saleSchema);
