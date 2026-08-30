/** Role / branch routing helpers — branchId comes from authenticated user, never from URL. */

export function isHqUser(user) {
  return String(user?.role || "") === "superAdmin";
}

export function displayRole(userOrRole) {
  const r = typeof userOrRole === "string" ? userOrRole : userOrRole?.role;
  if (r === "superAdmin") return "Admin";
  if (r === "admin" || r === "manager") return "Manager";
  if (r === "staff" || r === "employee") return "Staff";
  return r || "User";
}

/** After login / refresh — single dashboard; branding comes from Branch entity on the user. */
export function homePathForUser(_user) {
  return "/dashboard";
}

const ADMIN_ONLY = ["/users", "/branches", "/audit"];

export function canAccessPath(user, pathname) {
  if (!user) return false;
  const path = String(pathname || "");
  if (ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) {
    return isHqUser(user);
  }
  if (path.startsWith("/admin") || /^\/branch\//i.test(path)) {
    return isHqUser(user);
  }
  return true;
}

export function branchBanner(user, selectedBranch) {
  if (isHqUser(user)) {
    if (!selectedBranch) return { title: "All Branches", subtitle: "Admin · HQ" };
    return {
      title: selectedBranch.businessName || "BatteryMela",
      subtitle: selectedBranch.name || selectedBranch.branchName || "",
    };
  }
  return {
    title: user?.businessName || selectedBranch?.businessName || "BatteryMela",
    subtitle: user?.branchName || selectedBranch?.name || "",
  };
}
