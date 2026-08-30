import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { DEFAULT_PERMISSIONS, isHqRole } from "../constants/roles.js";

/**
 * Create or update the branch login (manager/staff) tied to a branch.
 * Used when Admin creates/edits a branch with login credentials.
 *
 * Rules:
 * - Lookup by normalized email first.
 * - Never silently overwrite a different branch's manager when the email is new.
 * - Password is bcrypt-hashed exactly once on create/update.
 */
export async function upsertBranchLogin({
  branchId,
  name,
  email,
  password,
  role = "manager",
} = {}) {
  if (!branchId) {
    const err = new Error("branchId required for branch login");
    err.status = 400;
    throw err;
  }
  if (!email || !String(email).trim()) {
    const err = new Error("Login email is required");
    err.status = 400;
    throw err;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const loginRole = role === "staff" || role === "employee" ? role : "manager";
  if (isHqRole(loginRole)) {
    const err = new Error("Branch login cannot be Admin (HQ)");
    err.status = 400;
    throw err;
  }

  let user = await User.findOne({ email: normalizedEmail }).select("+password");

  if (user) {
    if (isHqRole(user.role)) {
      const err = new Error("Cannot convert Admin account into a branch login");
      err.status = 400;
      throw err;
    }
    if (user.branchId && String(user.branchId) !== String(branchId)) {
      const err = new Error("This email is already used by another branch");
      err.status = 409;
      throw err;
    }
    user.name = name || user.name;
    user.email = normalizedEmail;
    user.role = loginRole;
    user.branchId = branchId;
    user.permissions = DEFAULT_PERMISSIONS[loginRole] || user.permissions;
    user.active = true;
    if (password && String(password).length >= 6) {
      user.password = await bcrypt.hash(String(password), 10);
    }
    await user.save();
  } else {
    // New email — create a new user. Do NOT reuse/overwrite another manager on this branch.
    if (!password || String(password).length < 6) {
      const err = new Error("Password must be at least 6 characters");
      err.status = 400;
      throw err;
    }
    const hash = await bcrypt.hash(String(password), 10);
    user = await User.create({
      name: name || "Branch Manager",
      email: normalizedEmail,
      password: hash,
      role: loginRole,
      permissions: DEFAULT_PERMISSIONS[loginRole] || DEFAULT_PERMISSIONS.manager,
      branchId,
      active: true,
    });
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: String(branchId),
  };
}

export async function findBranchManager(branchId) {
  if (!branchId) return null;
  return User.findOne({
    branchId,
    role: { $in: ["manager", "admin", "staff", "employee", "warehouseManager"] },
    active: { $ne: false },
  })
    .select("name email role active")
    .sort({ role: 1, createdAt: 1 })
    .lean();
}
