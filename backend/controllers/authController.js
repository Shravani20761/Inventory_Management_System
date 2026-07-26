import { authenticateUser, getUserById, registerUser } from "../services/authService.js";

export async function loginController(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const result = await authenticateUser(email, password);
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
    res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}
