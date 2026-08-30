import mongoose from "mongoose";

const vehicleVariantSchema = new mongoose.Schema(
  {
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleModel", required: true, index: true },
    name: { type: String, default: "", trim: true },
    fuelType: { type: String, default: "", trim: true, index: true },
    yearFrom: { type: Number, default: null },
    yearTo: { type: Number, default: null },
    fitmentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: "BatteryFitmentGroup", default: null, index: true },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "vehicle_variants" },
);

vehicleVariantSchema.index({ modelId: 1, name: 1, fuelType: 1, yearFrom: 1, yearTo: 1 });

export default mongoose.models.VehicleVariant || mongoose.model("VehicleVariant", vehicleVariantSchema);
