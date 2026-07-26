import mongoose from "mongoose";
import { ROLES } from "../constants/roles.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "employee" },
    permissions: { type: [String], default: [] },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    delete ret.password;
    return ret;
  },
});

export default mongoose.models.User || mongoose.model("User", userSchema);
