import mongoose from "mongoose";

const vehicleTypeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "vehicle_types" },
);

export default mongoose.models.VehicleType || mongoose.model("VehicleType", vehicleTypeSchema);
