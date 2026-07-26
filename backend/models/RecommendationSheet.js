import mongoose from "mongoose";

const recommendationSheetSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    sheetKey: { type: String, default: "" },
    quotationKind: { type: String, default: "combo" },
    recommendationMode: { type: String, default: "dynamic" },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, default: "" },
    customerRequirements: { type: String, default: "" },
    flatType: { type: String, default: "" },
    backupHours: { type: Number, default: 4 },
    budgetType: { type: String, default: "Recommended" },
    preferredBrand: { type: String, default: "" },
    totalLoad: { type: Number, default: 0 },
    inverterRange: { type: String, default: "" },
    batteryRange: { type: String, default: "" },
    estimatedBackupRange: { type: String, default: "" },
    appliancesNote: { type: String, default: "" },
    recommendedOptionLabel: { type: String, default: "" },
    suggestedOptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    requirements: { type: mongoose.Schema.Types.Mixed, default: {} },
    extraItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    recommendationPdfPath: { type: String, default: "" },
    recommendationPdfUrl: { type: String, default: "" },
    recommendationPublicUrl: { type: String, default: "" },
    recommendationCloudinaryUrl: { type: String, default: "" },
    whatsappSent: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    /** AwaitingSelection | QuotationGenerated | Converted */
    status: { type: String, default: "AwaitingSelection" },
    vehicleBrand: { type: String, default: "" },
    vehicleModel: { type: String, default: "" },
    fuelType: { type: String, default: "" },
    bikeBrand: { type: String, default: "" },
    bikeModel: { type: String, default: "" },
    roomNotes: { type: String, default: "" },
    externalId: { type: String, default: "" },
    /** Shared stem for all final quotations from this sheet (e.g. QT-2026-0008 → QT-2026-0008-A, -B, …). */
    quotationFamilyKey: { type: String, default: "" },
    /** Linked final quotation after customer selects option (most recently created from this sheet). */
    finalQuotationId: { type: mongoose.Schema.Types.ObjectId, ref: "Quotation", default: null },
    /** Every final quotation created from this sheet (one per compared option). */
    linkedFinalQuotationIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Quotation" }],
      default: [],
    },
  },
  { timestamps: true },
);

recommendationSheetSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret.externalId || ret.sheetKey || ret._id?.toString();
    ret.documentStage = "recommendation";
    return ret;
  },
});

export default mongoose.models.RecommendationSheet ||
  mongoose.model("RecommendationSheet", recommendationSheetSchema);
