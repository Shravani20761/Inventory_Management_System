import mongoose from "mongoose";

const comboTemplateSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    rules: { type: mongoose.Schema.Types.Mixed, default: {} },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

comboTemplateSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.ComboTemplate || mongoose.model("ComboTemplate", comboTemplateSchema);
