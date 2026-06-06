import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
  {
    branchId: { type: String, trim: true, lowercase: true, sparse: true, index: true },
    branchName: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    phone: { type: String, default: "" },
    managerName: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.pre("validate", function syncBranchFields() {
  if (!this.branchName && this.name) this.branchName = this.name;
  if (!this.name && this.branchName) this.name = this.branchName;
  if (!this.branchId && this.code) this.branchId = String(this.code).trim().toLowerCase();
  if (!this.code && this.branchId) this.code = String(this.branchId).trim().toUpperCase();
});

branchSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Branch || mongoose.model("Branch", branchSchema);
