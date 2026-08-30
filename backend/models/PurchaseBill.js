import mongoose from "mongoose";

const confidenceMap = { type: mongoose.Schema.Types.Mixed, default: {} };

const partySchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    address: { type: String, default: "" },
    billingAddress: { type: String, default: "" },
    shippingAddress: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    gstin: { type: String, default: "" },
    pan: { type: String, default: "" },
    state: { type: String, default: "" },
    stateCode: { type: String, default: "" },
  },
  { _id: false },
);

const lineItemSchema = new mongoose.Schema(
  {
    productName: { type: String, default: "" },
    modelNumber: { type: String, default: "" },
    sku: { type: String, default: "" },
    brand: { type: String, default: "" },
    category: { type: String, default: "" },
    description: { type: String, default: "" },
    hsn: { type: String, default: "" },
    quantity: { type: Number, default: null },
    unit: { type: String, default: "" },
    rate: { type: Number, default: null },
    discount: { type: Number, default: null },
    taxableAmount: { type: Number, default: null },
    gstRate: { type: Number, default: null },
    cgst: { type: Number, default: null },
    sgst: { type: Number, default: null },
    igst: { type: Number, default: null },
    cess: { type: Number, default: null },
    total: { type: Number, default: null },
    serialNumber: { type: String, default: "" },
    batchNumber: { type: String, default: "" },
    warranty: { type: String, default: "" },
    productId: { type: String, default: "" },
    matchStatus: { type: String, enum: ["matched", "new", "manual", "unmatched"], default: "unmatched" },
    matchedLabel: { type: String, default: "" },
    matchScore: { type: Number, default: 0 },
    createNewProduct: { type: Boolean, default: false },
    confidence: { type: Number, default: null },
    fieldConfidence: confidenceMap,
  },
  { _id: true },
);

const OCR_STATUSES = [
  "Processing",
  "OCR Completed",
  "Needs Review",
  "Confirmed",
  "Inventory Updated",
  "Failed",
];

const purchaseBillSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    supplierId: { type: String, default: "" },
    invoiceNumber: { type: String, default: "" },
    invoiceDate: { type: String, default: "" },
    purchaseOrderNumber: { type: String, default: "" },
    supplierDetails: { type: partySchema, default: () => ({}) },
    buyerDetails: { type: partySchema, default: () => ({}) },
    items: { type: [lineItemSchema], default: [] },
    subtotal: { type: Number, default: null },
    discount: { type: Number, default: null },
    taxableAmount: { type: Number, default: null },
    cgst: { type: Number, default: null },
    sgst: { type: Number, default: null },
    igst: { type: Number, default: null },
    cess: { type: Number, default: null },
    otherCharges: { type: Number, default: null },
    freight: { type: Number, default: null },
    transportation: { type: Number, default: null },
    installationCharges: { type: Number, default: null },
    roundOff: { type: Number, default: null },
    grandTotal: { type: Number, default: null },
    amountPaid: { type: Number, default: null },
    balanceDue: { type: Number, default: null },
    amountInWords: { type: String, default: "" },
    originalFileUrl: { type: String, default: "" },
    originalFileName: { type: String, default: "" },
    fileType: { type: String, default: "" },
    pageImageUrls: { type: [String], default: [] },
    ocrStatus: { type: String, enum: OCR_STATUSES, default: "Processing", index: true },
    ocrConfidence: { type: Number, default: null },
    fieldConfidence: confidenceMap,
    ocrEngine: { type: String, default: "" },
    rawOcrText: { type: String, default: "" },
    ocrError: { type: String, default: "" },
    pageCount: { type: Number, default: 1 },
    inventoryUpdated: { type: Boolean, default: false },
    purchaseOrderId: { type: String, default: "" },
    createdBy: { type: String, default: "" },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true, collection: "purchase_bills" },
);

purchaseBillSchema.index({ branchId: 1, invoiceNumber: 1, invoiceDate: 1 });
purchaseBillSchema.index({ "supplierDetails.gstin": 1, invoiceNumber: 1 });

purchaseBillSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export const PURCHASE_BILL_OCR_STATUSES = OCR_STATUSES;

export default mongoose.models.PurchaseBill || mongoose.model("PurchaseBill", purchaseBillSchema);
