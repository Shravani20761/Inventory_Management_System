import mongoose from "mongoose";

const vehicleModelSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleBrand", required: true, index: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "vehicle_models" },
);

vehicleModelSchema.index({ brandId: 1, name: 1 }, { unique: true });

export default mongoose.models.VehicleModel || mongoose.model("VehicleModel", vehicleModelSchema);
