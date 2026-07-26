import { verifyUserToken } from "../services/authService.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = verifyUserToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Allow one or more roles; superAdmin always allowed */
export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role === "superAdmin") return next();
    if (roles.length === 0) return next();
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: "Forbidden for this role" });
  };
}

/** JWT must include one of these permission strings (or "*"). superAdmin bypasses. */
export function requirePermission(...required) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role === "superAdmin") return next();
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (perms.includes("*")) return next();
    if (required.length === 0) return next();
    const ok = required.some((r) => perms.includes(r));
    if (!ok) return res.status(403).json({ error: "Missing permission" });
    next();
  };
}
