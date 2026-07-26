import mongoose from "mongoose";

export const TRANSFER_STATUSES = [
  "Requested",
  "Pending",
  "Approved",
  "Rejected",
  "In Transit",
  "Received",
  "Completed",
];

/** Statuses from which a request may still be approved / rejected. */
export const APPROVABLE_STATUSES = ["Requested", "Pending"];

const stockTransferRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true, trim: true },
    productId: { type: String, default: "" },
    inventoryDocId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productType: { type: String, default: "" },
    brand: { type: String, default: "" },
    model: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    fromBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    toBranch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    status: { type: String, enum: TRANSFER_STATUSES, default: "Pending", index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    driverName: { type: String, default: "" },
    vehicleNumber: { type: String, default: "" },
    dispatchDate: { type: Date, default: null },
    receivedDate: { type: Date, default: null },
    completedDate: { type: Date, default: null },
    /** Guards against double inventory movement; stock moves once, when received. */
    inventoryMoved: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "stockTransferRequests" },
);

stockTransferRequestSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.StockTransferRequest ||
  mongoose.model("StockTransferRequest", stockTransferRequestSchema);
