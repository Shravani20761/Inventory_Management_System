import mongoose from "mongoose";

const invoiceProductSchema = new mongoose.Schema(
  {
    productId: String,
    modelName: String,
    quantity: Number,
    rate: Number,
    amount: Number,
    purchaseRate: Number,
  },
  { _id: false },
);

const chargeRowSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    invoiceNumber: { type: String, required: true, unique: true },
    quotationId: { type: String, default: null },
    quoteKey: { type: String, default: "" },
    recommendationType: { type: String, default: "" },
    customerDetails: {
      name: String,
      phone: String,
      place: String,
      address: String,
    },
    inverter: {
      id: String,
      brand: String,
      model: String,
      inverterVA: Number,
      price: Number,
      warranty: String,
    },
    battery: {
      id: String,
      brand: String,
      model: String,
      batteryAH: Number,
      batteryType: String,
      withOldPrice: Number,
      withoutOldPrice: Number,
      warranty: String,
    },
    calculatedVA: Number,
    calculatedAH: Number,
    backupHours: Number,
    totalLoad: Number,
    pricingMode: { type: String, enum: ["withOld", "withoutOld"], default: "withOld" },
    scrapAdjustment: { type: Number, default: 0 },
    productTotal: { type: Number, default: 0 },
    additionalCharges: {
      inverterInstallation: chargeRowSchema,
      batteryInstallation: chargeRowSchema,
      trolleyCharges: chargeRowSchema,
      transportationCharges: chargeRowSchema,
      wiringCharges: chargeRowSchema,
      deliveryCharges: chargeRowSchema,
      serviceCharges: chargeRowSchema,
      otherCharges: chargeRowSchema,
    },
    additionalTotal: { type: Number, default: 0 },
    products: [invoiceProductSchema],
    subtotal: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    gstRate: { type: Number, default: 18 },
    totalAmount: { type: Number, default: 0 },
    paymentMode: { type: String, default: "Cash" },
    /** Document lifecycle status (separate from payment status). */
    status: {
      type: String,
      enum: ["Draft", "Generated", "Paid", "Partially Paid", "Cancelled"],
      default: "Generated",
    },
    paymentStatus: { type: String, enum: ["Paid", "Unpaid", "Partial"], default: "Unpaid" },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    notes: {
      delivery: String,
      installation: String,
      warranty: String,
    },
    selectedOptionSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    cloudinaryInvoiceUrl: { type: String, default: "" },
    invoicePdfUrl: { type: String, default: "" },
    invoiceSent: { type: Boolean, default: false },
    sentToWhatsapp: { type: Boolean, default: false },
    sentAt: { type: Date, default: null },
    sentBy: { type: String, default: "" },
    externalId: { type: String, default: "" },
    /** Inter-state supply → IGST instead of CGST+SGST (defaults to local supply). */
    interState: { type: Boolean, default: false },
    /** Marks demo/sample records so they can be bulk-removed later. */
    isDemoData: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

invoiceSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret.externalId || ret.invoiceNumber || ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
