/**
 * Roles used by BatteryMela multi-branch RBAC.
 * Existing roles are preserved; manager/staff added for the branch model.
 *
 * Mapping (business → system):
 *   ADMIN   → superAdmin (all branches)
 *   MANAGER → manager (assigned branch; legacy "admin" treated as manager)
 *   STAFF   → staff / employee
 */
export const ROLES = [
  "superAdmin",
  "admin",
  "manager",
  "staff",
  "employee",
  "accountant",
  "warehouseManager",
  "ca",
];

export const DEFAULT_PERMISSIONS = {
  superAdmin: ["*"],
  admin: [
    "inventory",
    "quotations",
    "invoices",
    "purchases",
    "sales",
    "reports",
    "accounts",
    "users",
    "branches",
    "analytics",
  ],
  /** Branch manager — full ops on assigned branch only (no HQ / all-branch). */
  manager: [
    "inventory",
    "quotations",
    "invoices",
    "purchases",
    "sales",
    "reports",
    "accounts",
    "analytics:branch",
  ],
  staff: ["inventory:read", "quotations", "invoices:create", "customers:read", "sales:create"],
  employee: ["inventory:read", "quotations", "invoices:create", "customers:read"],
  accountant: ["invoices", "reports", "accounts"],
  warehouseManager: ["inventory", "purchases"],
  ca: ["reports:read", "reports:download", "accounts:read", "accounts:download"],
};

/** Roles that may see every branch (HQ). */
export const HQ_ROLES = new Set(["superAdmin"]);

/** Roles that are branch-scoped managers (legacy admin included). */
export const MANAGER_ROLES = new Set(["admin", "manager", "warehouseManager"]);

export function isHqRole(role) {
  return HQ_ROLES.has(String(role || ""));
}

export function isManagerRole(role) {
  return MANAGER_ROLES.has(String(role || ""));
}

export function displayRoleLabel(role) {
  const r = String(role || "");
  if (r === "superAdmin") return "Admin";
  if (r === "admin" || r === "manager") return "Manager";
  if (r === "staff" || r === "employee") return "Staff";
  return r;
}
