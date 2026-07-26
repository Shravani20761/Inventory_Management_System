import mongoose from "mongoose";

const quotationSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    /** combo | inverter | battery | car | bike */
    quotationKind: { type: String, default: "combo" },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, default: "" },
    customerRequirements: { type: String, default: "" },
    flatType: { type: String, enum: ["1RK", "1BHK", "2BHK", "3BHK", ""], default: "" },
    backupHours: { type: Number, default: 4 },
    budgetType: { type: String, enum: ["Budget", "Recommended", "Premium"], default: "Recommended" },
    preferredBrand: { type: String, default: "" },
    totalLoad: { type: Number, default: 0 },
    inverterRange: { type: String, default: "" },
    batteryRange: { type: String, default: "" },
    estimatedBackupRange: { type: String, default: "" },
    appliancesNote: { type: String, default: "" },
    recommendedOptionLabel: { type: String, default: "" },
    /** Tiered options — shape varies by quotationKind (Mixed for flexibility). */
    suggestedOptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    quotationPdfPath: { type: String, default: "" },
    quotationPdfUrl: { type: String, default: "" },
    quotationPublicUrl: { type: String, default: "" },
    /** Public HTTPS URL used for Meta WhatsApp document (Cloudinary when configured). */
    quotationCloudinaryUrl: { type: String, default: "" },
    whatsappSent: { type: Boolean, default: false },
    /** WhatsApp send audit trail. */
    sentAt: { type: Date, default: null },
    sentBy: { type: String, default: "" },
    whatsappStatus: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    /**
     * Workflow status. New flow uses Pending -> Sent -> Approved/Rejected -> Converted (Expired on lapse).
     * Legacy values (Draft/Finalized) kept in the enum so older saved docs stay valid.
     */
    status: {
      type: String,
      enum: ["Pending", "Sent", "Approved", "Rejected", "Expired", "Converted", "Draft", "Finalized"],
      default: "Pending",
    },
    requirements: { type: mongoose.Schema.Types.Mixed, default: {} },
    vehicleBrand: { type: String, default: "" },
    vehicleModel: { type: String, default: "" },
    fuelType: { type: String, default: "" },
    bikeBrand: { type: String, default: "" },
    bikeModel: { type: String, default: "" },
    roomNotes: { type: String, default: "" },
    /** Human-readable id for smart quotes (INV-QT-0001, COMBO-QT-0001, …) */
    quoteKey: { type: String, default: "" },
    /** Legacy list UI id (string) */
    externalId: { type: String, default: "" },
    /** recommendation | final | converted | legacy */
    documentStage: { type: String, default: "final" },
    recommendationSheetId: { type: mongoose.Schema.Types.ObjectId, ref: "RecommendationSheet", default: null },
    /**
     * Tier rows for one quotation (Budget / Recommended / …). One DB row per customer sheet.
     * Each entry: { id, title, clientOptionId, optionIndex, inverter, battery, selectedRow, totalAmount,
     * subtotal, gstAmount, quotationPdfUrl, quotationPdfPath, quotationCloudinaryUrl,
     * whatsappStatus, whatsappSent, sentAt, approved, status, invoiceId }
     */
    options: { type: [mongoose.Schema.Types.Mixed], default: [] },
    /** Stable id from preview card (e.g. option-1) — legacy / last-touched row. */
    clientOptionId: { type: String, default: "" },
    /** 0-based index in preview.suggestedOptions when the quotation was created. */
    optionIndex: { type: Number, default: null },
    selectedOption: { type: mongoose.Schema.Types.Mixed, default: null },
    recommendationMode: { type: String, default: "" },
    validTill: { type: String, default: "" },
    finalQuotationPdfUrl: { type: String, default: "" },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
    discount: { type: Number, default: 0 },
    gstRate: { type: Number, default: 18 },
    /** Editable service charges (Stage 2 negotiation). */
    additionalCharges: { type: mongoose.Schema.Types.Mixed, default: {} },
    pricingMode: { type: String, enum: ["withOld", "withoutOld"], default: "withOld" },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    finalTotal: { type: Number, default: 0 },
    pdfGenerated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

quotationSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret.externalId || ret.quoteKey || ret._id?.toString();
    ret.createdAt = ret.createdAt ?? ret.created_at;
    if (!ret.documentStage) ret.documentStage = "legacy";
    return ret;
  },
});

export default mongoose.models.Quotation || mongoose.model("Quotation", quotationSchema);
