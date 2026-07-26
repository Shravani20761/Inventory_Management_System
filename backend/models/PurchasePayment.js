import mongoose from "mongoose";

const chequeDetailSchema = new mongoose.Schema(
  {
    chequeNumber: { type: String, default: "" },
    bankName: { type: String, default: "" },
    chequeDate: { type: String, default: "" },
    depositDate: { type: String, default: "" },
    dueDate: { type: String, default: "" },
    status: { type: String, default: "Pending" },
  },
  { _id: false },
);

const purchasePaymentSchema = new mongoose.Schema(
  {
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", index: true },
    purchaseId: { type: String, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", index: true },
    paymentMode: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    paymentDate: { type: String, default: "" },
    chequeDetails: { type: chequeDetailSchema, default: null },
    status: {
      type: String,
      enum: ["Pending", "Deposited", "Cleared", "Bounced", "Cancelled", "Completed"],
      default: "Completed",
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true, collection: "purchase_payments" },
);

export default mongoose.models.PurchasePayment || mongoose.model("PurchasePayment", purchasePaymentSchema);
