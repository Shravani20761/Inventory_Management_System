import mongoose from "mongoose";

/**
 * Optional business rules: preferred inverter/battery pairings, boosts — never full permutation storage.
 */
const recommendationRuleSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    name: { type: String, default: "", trim: true },
    inverterBrand: { type: String, default: "", trim: true },
    batteryBrand: { type: String, default: "", trim: true },
    inverterModelHint: { type: String, default: "", trim: true },
    batteryModelHint: { type: String, default: "", trim: true },
    /** Subtracted from pair score when matched (lower score = better). */
    boost: { type: Number, default: 25 },
    tag: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "recommendation_rules" },
);

recommendationRuleSchema.index({ branchId: 1, active: 1 });

export default mongoose.models.RecommendationRule || mongoose.model("RecommendationRule", recommendationRuleSchema);
