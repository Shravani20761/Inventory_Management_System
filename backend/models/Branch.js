import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
  {
    branchId: { type: String, trim: true, lowercase: true, sparse: true, index: true },
    branchName: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
    /** Legal / trading name shown on PDFs & UI (BatteryMela vs Krishnaa Battery). */
    businessName: { type: String, trim: true, default: "BatteryMela" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    gstin: { type: String, default: "" },
    managerName: { type: String, default: "" },
    active: { type: Boolean, default: true },
    /** Prefer active/inactive over hard delete when transactions exist. */
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

branchSchema.pre("validate", function syncBranchFields() {
  if (!this.branchName && this.name) this.branchName = this.name;
  if (!this.name && this.branchName) this.name = this.branchName;
  if (!this.branchId && this.code) this.branchId = String(this.code).trim().toLowerCase().replace(/\s+/g, "_");
  if (!this.code && this.branchId) this.code = String(this.branchId).trim().toUpperCase();
  if (!this.businessName) this.businessName = "BatteryMela";
  if (this.status === "inactive") this.active = false;
  if (this.status === "active") this.active = true;
  if (this.active === false && this.status === "active") this.status = "inactive";
});

branchSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Branch || mongoose.model("Branch", branchSchema);
