import mongoose from "mongoose";

/**
 * Chartered Accountant profile used as the default recipient for report
 * email / WhatsApp delivery. A single global profile is kept (branchId null);
 * branches may optionally store their own.
 */
const caProfileSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, unique: true, sparse: true },
    caName: { type: String, default: "", trim: true },
    firmName: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    mobile: { type: String, default: "", trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "ca_profiles" },
);

caProfileSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.CaProfile || mongoose.model("CaProfile", caProfileSchema);
