import mongoose from "mongoose";

const reminderLogSchema = new mongoose.Schema(
  {
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", index: true },
    purchaseId: { type: String, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    vendorName: { type: String, default: "" },
    vendorPhone: { type: String, default: "" },
    message: { type: String, default: "" },
    type: { type: String, enum: ["whatsapp", "sms", "email"], default: "whatsapp" },
    channel: { type: String, default: "whatsapp" },
    daysBeforeDue: { type: Number, default: 0 },
    dueDate: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
    success: { type: Boolean, default: false },
    error: { type: String, default: "" },
  },
  { timestamps: true, collection: "reminder_logs" },
);

reminderLogSchema.index({ purchaseId: 1, daysBeforeDue: 1, dueDate: 1 });

export default mongoose.models.ReminderLog || mongoose.model("ReminderLog", reminderLogSchema);
