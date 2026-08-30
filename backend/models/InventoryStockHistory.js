import mongoose from "mongoose";

const inventoryStockHistorySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    productName: { type: String, default: "" },
    sku: { type: String, default: "" },
    brand: { type: String, default: "" },
    type: { type: String, default: "Purchase Received" },
    previousStock: { type: Number, default: 0 },
    quantityChange: { type: Number, default: 0 },
    newStock: { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    invoiceNumber: { type: String, default: "" },
    invoiceDate: { type: String, default: "" },
    purchaseBillId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseBill", default: null },
    purchaseOrderId: { type: String, default: "" },
    notes: { type: String, default: "" },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "inventory_stock_history" },
);

inventoryStockHistorySchema.index({ productId: 1, createdAt: -1 });

export default mongoose.models.InventoryStockHistory ||
  mongoose.model("InventoryStockHistory", inventoryStockHistorySchema);
