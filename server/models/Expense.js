import mongoose from "mongoose";

export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salaries", "Transportation", "Miscellaneous"];

const expenseSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: "Miscellaneous", index: true },
    title: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, min: 0 },
    /** YYYY-MM-DD */
    date: { type: String, default: () => new Date().toISOString().slice(0, 10), index: true },
    paymentMode: { type: String, default: "Cash" },
    vendor: { type: String, default: "", trim: true },
    gstAmount: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Marks demo/sample records so they can be bulk-removed later. */
    isDemoData: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: "expenses" },
);

expenseSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export default mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
