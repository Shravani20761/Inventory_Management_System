import mongoose from "mongoose";
import User from "../models/User.js";
import { normalizeEmail, registerUser } from "../services/authService.js";
import { DEFAULT_PERMISSIONS, isHqRole, ROLES } from "../constants/roles.js";
import { recordAudit } from "../services/auditService.js";

export async function listUsersController(req, res, next) {
  try {
    const q = {};
    if (!isHqRole(req.user.role) && req.user.branchId) {
      q.branchId = new mongoose.Types.ObjectId(req.user.branchId);
    }
    const users = await User.find(q)
      .select("-password")
      .populate("branchId", "name code businessName branchName")
      .sort({ createdAt: -1 })
      .lean();
    res.json(
      users.map((u) => ({
        ...u,
        id: u._id.toString(),
        branchName: u.branchId?.branchName || u.branchId?.name || "",
        businessName: u.branchId?.businessName || "",
      })),
    );
  } catch (err) {
    next(err);
  }
}

export async function createUserController(req, res, next) {
  try {
    const { name, email, password, role, branchId, permissions, active } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role required" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${ROLES.join(", ")}` });
    }
    if (role === "superAdmin" && req.user.role !== "superAdmin") {
      return res.status(403).json({ error: "Only Admin can create Admin users" });
    }
    let bid = branchId || null;
    if (!isHqRole(req.user.role)) {
      bid = req.user.branchId;
    }
    if (role !== "superAdmin" && !bid) {
      return res.status(400).json({ error: "Assigned branch is required for this role" });
    }
    const user = await registerUser({
      name,
      email,
      password,
      role,
      branchId: bid,
      permissions: permissions?.length ? permissions : DEFAULT_PERMISSIONS[role],
    });
    if (active === false) {
      user.active = false;
      await user.save();
    }
    await recordAudit({
      userId: req.user?.sub,
      role: req.user?.role,
      branchId: bid,
      action: "user.create",
      entity: "User",
      entityId: user._id.toString(),
      metadata: { email, role, branchId: bid },
    });
    res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function updateUserController(req, res, next) {
  try {
    if (!isHqRole(req.user.role)) {
      return res.status(403).json({ error: "Only Admin can update users" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { name, email, password, role, branchId, permissions, active } = req.body;
    if (name != null) user.name = name;
    if (email != null) user.email = normalizeEmail(email);
    if (role != null) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
      if (role === "superAdmin" && req.user.role !== "superAdmin") {
        return res.status(403).json({ error: "Only Admin can assign Admin role" });
      }
      user.role = role;
      if (!permissions) user.permissions = DEFAULT_PERMISSIONS[role] || user.permissions;
    }
    if (branchId !== undefined) {
      user.branchId = branchId ? new mongoose.Types.ObjectId(branchId) : null;
    }
    if (role && role !== "superAdmin" && !user.branchId) {
      return res.status(400).json({ error: "Assigned branch is required for this role" });
    }
    if (permissions != null) user.permissions = permissions;
    if (active != null) user.active = Boolean(active);
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const bcrypt = await import("bcryptjs");
      user.password = await bcrypt.default.hash(password, 10);
    }
    await user.save();
    await recordAudit({
      userId: req.user?.sub,
      role: req.user?.role,
      branchId: user.branchId,
      action: password ? "user.reset_password" : "user.update",
      entity: "User",
      entityId: user._id.toString(),
      metadata: { fields: Object.keys(req.body || {}).filter((k) => k !== "password") },
    });
    const populated = await User.findById(user._id)
      .select("-password")
      .populate("branchId", "name code businessName branchName")
      .lean();
    res.json({
      user: {
        ...populated,
        id: populated._id.toString(),
        branchName: populated.branchId?.branchName || populated.branchId?.name || "",
        businessName: populated.branchId?.businessName || "",
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Admin-only password reset — never returns the new password from DB. */
export async function resetPasswordController(req, res, next) {
  try {
    if (!isHqRole(req.user.role)) {
      return res.status(403).json({ error: "Only Admin can reset passwords" });
    }
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ error: "User not found" });
    const bcrypt = await import("bcryptjs");
    user.password = await bcrypt.default.hash(String(password), 10);
    await user.save();
    await recordAudit({
      userId: req.user?.sub,
      role: req.user?.role,
      branchId: user.branchId,
      action: "user.reset_password",
      entity: "User",
      entityId: user._id.toString(),
      metadata: { email: user.email },
    });
    res.json({ ok: true, message: "Password updated. The previous password no longer works." });
  } catch (err) {
    next(err);
  }
}
