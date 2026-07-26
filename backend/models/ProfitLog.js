import mongoose from "mongoose";

const profitLogSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    productId: { type: String, default: "" },
    modelName: { type: String, default: "" },
    purchaseRate: { type: Number, default: 0 },
    sellingRate: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    loss: { type: Number, default: 0 },
    marginPercentage: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    externalId: { type: String, default: "" },
  },
  { timestamps: true }
);

profitLogSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret.externalId || ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.ProfitLog || mongoose.model("ProfitLog", profitLogSchema);
