import mongoose from "mongoose";

const chequeSchema = new mongoose.Schema(
  {
    chequeNumber: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    amount: { type: Number, default: 0 },
    chequeDate: { type: String, default: "" },
    depositDate: { type: String, default: "" },
    dueDate: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Pending", "Deposited", "Cleared", "Bounced", "Cancelled"],
      default: "Pending",
    },
  },
  { _id: true },
);

const productLineSchema = new mongoose.Schema(
  {
    inventoryId: { type: String, default: "" },
    productType: { type: String, default: "" },
    model: { type: String, default: "" },
    brand: { type: String, default: "" },
    batteryModel: { type: String, default: "" },
    qty: { type: Number, default: 0 },
    purchaseRate: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
    stockApplied: { type: Boolean, default: false },
  },
  { _id: false },
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", index: true },
    purchaseId: { type: String, required: true, unique: true, trim: true },
    purchaseDate: { type: String, default: "" },
    vendorName: { type: String, default: "", trim: true },
    vendorMobile: { type: String, default: "", trim: true },
    vendorWhatsApp: { type: String, default: "", trim: true },
    vendorGst: { type: String, default: "", trim: true },
    branchName: { type: String, default: "", trim: true },
    billNo: { type: String, default: "", trim: true },
    billDetails: { type: String, default: "" },
    products: { type: [productLineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    gstPercent: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 },
    paymentMode: {
      type: String,
      enum: ["Full Cash", "Partial Payment", "Credit / Loan", "Cheque Payment", "Multiple Cheques"],
      default: "Full Cash",
    },
    cheques: { type: [chequeSchema], default: [] },
    nextDueDate: { type: String, default: "" },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Partial", "Paid", "Overdue", "Cheque Due Soon"],
      default: "Pending",
    },
    inventoryUpdated: { type: Boolean, default: false },
    status: { type: String, enum: ["Open", "Closed"], default: "Open" },
    notes: { type: String, default: "" },
    /** Legacy sync id if migrated from old Purchase */
    externalId: { type: String, default: "", sparse: true },
    /** Marks demo/sample records so they can be bulk-removed later. */
    isDemoData: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: "purchase_orders" },
);

purchaseOrderSchema.index({ branchId: 1, purchaseDate: -1 });
purchaseOrderSchema.index({ vendorName: 1 });
purchaseOrderSchema.index({ paymentStatus: 1 });

export default mongoose.models.PurchaseOrder || mongoose.model("PurchaseOrder", purchaseOrderSchema);
