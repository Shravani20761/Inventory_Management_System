import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import { DEFAULT_PERMISSIONS } from "../constants/roles.js";

const SALT_ROUNDS = 10;

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    console.warn("[auth] JWT_SECRET missing or short — set a strong secret in production");
    return s || "dev-only-change-me-in-env";
  }
  return s;
}

export function signUserToken(user) {
  let permissions = user.permissions;
  if (!permissions?.length) {
    permissions = DEFAULT_PERMISSIONS[user.role] || [];
  }
  const payload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    branchId: user.branchId?.toString() || null,
    permissions,
  };
  return jwt.sign(payload, jwtSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
}

export function verifyUserToken(token) {
  return jwt.verify(token, jwtSecret());
}

export async function registerUser({ name, email, password, role, branchId, permissions }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error("Email already registered");
    err.status = 409;
    throw err;
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const perms = permissions?.length ? permissions : DEFAULT_PERMISSIONS[role] || [];
  const bid = branchId ? (typeof branchId === "string" ? new mongoose.Types.ObjectId(branchId) : branchId) : null;
  const doc = await User.create({
    name,
    email: email.toLowerCase(),
    password: hash,
    role,
    permissions: perms,
    branchId: bid,
  });
  return doc;
}

export async function authenticateUser(email, password) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !user.active) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  const token = signUserToken(user);
  const populated = await User.findById(user._id).populate("branchId", "name branchName code branchId city").lean();
  const safe = user.toJSON();
  if (populated?.branchId) {
    const b = populated.branchId;
    safe.branchId = b._id?.toString() ?? safe.branchId;
    safe.branchName = b.branchName || b.name;
    safe.branchCode = b.branchId || b.code;
  }
  return { token, user: safe };
}

export async function getUserById(id) {
  return User.findById(id).populate("branchId", "name code city");
}

/** First-run: create default branch + superAdmin if no users exist */
export async function bootstrapAdminIfEmpty() {
  const count = await User.countDocuments();
  if (count > 0) {
    console.info(`[auth] ${count} user(s) in database — bootstrap skipped. Use an existing account (not BOOTSTRAP_* unless DB was empty on first start).`);
    return null;
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME || "Super Admin";
  if (!email || !password) {
    console.warn("[auth] No users in DB. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create first superAdmin.");
    return null;
  }

  let branch = await Branch.findOne({ branchId: "wakad" });
  if (!branch) {
    branch = await Branch.create({
      branchId: "wakad",
      branchName: "Wakad Branch",
      name: "Wakad Branch",
      code: "WAKAD",
      city: "Pune",
      address: "Wakad, Pune",
    });
    console.log("[auth] Created default branch:", branch.name);
  }
  if (!(await Branch.findOne({ branchId: "pimple_saudagar" }))) {
    await Branch.create({
      branchId: "pimple_saudagar",
      branchName: "Pimple Saudagar Branch",
      name: "Pimple Saudagar Branch",
      code: "PIMPLE",
      city: "Pune",
      address: "Pimple Saudagar, Pune",
    });
    console.log("[auth] Created Pimple Saudagar branch");
  }

  const user = await registerUser({
    name,
    email,
    password,
    role: "superAdmin",
    branchId: branch._id,
    permissions: ["*"],
  });
  console.log("[auth] Created bootstrap superAdmin:", email);
  return user;
}
