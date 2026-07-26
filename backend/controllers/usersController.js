import mongoose from "mongoose";
import User from "../models/User.js";
import { registerUser } from "../services/authService.js";

export async function listUsersController(req, res, next) {
  try {
    const q = {};
    if (req.user.role === "admin" && req.user.branchId) {
      q.branchId = new mongoose.Types.ObjectId(req.user.branchId);
    }
    const users = await User.find(q).select("-password").sort({ createdAt: -1 }).lean();
    res.json(users.map((u) => ({ ...u, id: u._id.toString() })));
  } catch (err) {
    next(err);
  }
}

export async function createUserController(req, res, next) {
  try {
    const { name, email, password, role, branchId, permissions } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role required" });
    }
    let bid = branchId || null;
    if (req.user.role === "admin") {
      bid = req.user.branchId;
    }
    const user = await registerUser({
      name,
      email,
      password,
      role,
      branchId: bid,
      permissions,
    });
    res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}
