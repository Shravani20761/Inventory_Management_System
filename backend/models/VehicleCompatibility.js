import mongoose from "mongoose";

const VEHICLE_TYPES = ["four-wheeler", "two-wheeler"];

const vehicleCompatibilitySchema = new mongoose.Schema(
  {
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true, index: true },
    /** Primary keys (legacy). Prefer filling these; `vehicleBrand` / `vehicleModel` are optional aliases. */
    brand: { type: String, default: "", trim: true, index: true },
    model: { type: String, default: "", trim: true, index: true },
    /** Optional camelCase aliases (e.g. imports). At least one of brand/vehicleBrand and model/vehicleModel should be set. */
    vehicleBrand: { type: String, default: "", trim: true, index: true },
    vehicleModel: { type: String, default: "", trim: true, index: true },
    /** Used for four-wheeler rows; optional / ignored for two-wheeler */
    fuelType: { type: String, default: "", trim: true, index: true },
    /** References {@link BatteryInventory} by `batteryCode` (not Product _id). */
    compatibleBatteryCodes: { type: [String], default: [] },
    /**
     * Human-readable hints (e.g. "Amaron 55Ah") matched in-app against `batteryInventory`
     * (code, brand, modelNumber). Use with or instead of `compatibleBatteryCodes`.
     */
    compatibleBatteryModels: { type: [String], default: [] },
    notes: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vehicleCompatibilitySchema.index({ vehicleType: 1, brand: 1, model: 1, fuelType: 1 });

/** Normalize alias fields so queries can keep using `brand` / `model`. */
vehicleCompatibilitySchema.pre("validate", function (next) {
  const vb = String(this.vehicleBrand ?? "").trim();
  const vm = String(this.vehicleModel ?? "").trim();
  const b = String(this.brand ?? "").trim();
  const m = String(this.model ?? "").trim();
  if (!b && vb) this.brand = vb;
  if (!m && vm) this.model = vm;
  if (!this.brand?.trim() || !this.model?.trim()) {
    return next(new Error("Vehicle compatibility requires brand (or vehicleBrand) and model (or vehicleModel)."));
  }
  next();
});

vehicleCompatibilitySchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    return ret;
  },
});

export const VEHICLE_COMPATIBILITY_TYPES = VEHICLE_TYPES;

export default mongoose.models.VehicleCompatibility || mongoose.model("VehicleCompatibility", vehicleCompatibilitySchema, "vehicleCompatibility");
