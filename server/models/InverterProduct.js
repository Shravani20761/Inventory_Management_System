import mongoose from "mongoose";

/**
 * Inverter SKUs — collection `inverterProducts`.
 * Optional `productId` links to unified Product for legacy sync; quotations can use rows without it.
 */
const inverterProductSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    brand: { type: String, default: "", trim: true },
    inverterModelNumber: { type: String, default: "", trim: true },
    productCapacityVA: { type: Number, default: 0 },
    warranty: { type: String, default: "" },
    inverterFinalPrice: { type: Number, default: 0 },
    image: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 0 },
    active: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

inverterProductSchema.index({ branchId: 1, inverterModelNumber: 1 });

export default mongoose.models.InverterProduct ||
  mongoose.model("InverterProduct", inverterProductSchema, "inverterProducts");
