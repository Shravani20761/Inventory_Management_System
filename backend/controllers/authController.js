import { authenticateUser, getUserById, registerUser } from "../services/authService.js";
import { recordAudit } from "../services/auditService.js";

export async function loginController(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const result = await authenticateUser(email, password);
    await recordAudit({
      userId: result.user?.id || result.user?._id,
      role: result.user?.role,
      branchId: result.user?.branchId,
      action: "auth.login",
      entity: "User",
      entityId: String(result.user?.id || result.user?._id || ""),
      ip: req.ip || "",
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function registerController(req, res, next) {
  try {
    const { name, email, password, role, branchId, permissions } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role required" });
    }
    const user = await registerUser({ name, email, password, role, branchId, permissions });
    res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function profileController(req, res, next) {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found" });
    // getUserById already returns plain JSON without password
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
