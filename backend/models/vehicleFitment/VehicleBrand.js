import mongoose from "mongoose";

const vehicleBrandSchema = new mongoose.Schema(
  {
    vehicleTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "VehicleType", required: true, index: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "vehicle_brands" },
);

vehicleBrandSchema.index({ vehicleTypeId: 1, name: 1 }, { unique: true });

export default mongoose.models.VehicleBrand || mongoose.model("VehicleBrand", vehicleBrandSchema);
