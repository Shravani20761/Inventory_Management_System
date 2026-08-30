/** Sidebar / shell navigation — role-aware multi-branch RBAC */
export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", roles: ["superAdmin", "admin", "manager", "staff", "employee", "accountant", "warehouseManager", "ca"] },
  { id: "inventory", label: "Inventory", path: "/shop/inventory", roles: ["superAdmin", "admin", "manager", "staff", "employee", "warehouseManager"] },
  { id: "transfers", label: "Stock Transfers", path: "/shop/transfers", roles: ["superAdmin", "admin", "manager", "employee", "warehouseManager"] },
  { id: "purchases", label: "Purchase Management", path: "/shop/purchases", roles: ["superAdmin", "admin", "manager", "warehouseManager"] },
  { id: "quotations", label: "Quotations", path: "/shop/quotations", roles: ["superAdmin", "admin", "manager", "staff", "employee"] },
  { id: "invoices", label: "Tax Invoices", path: "/shop/invoices", roles: ["superAdmin", "admin", "manager", "staff", "accountant"] },
  { id: "accounts", label: "Accounts & CA Reports", path: "/shop/accounts", roles: ["superAdmin", "admin", "manager", "accountant", "ca"] },
  { id: "vehicle-fitments", label: "Vehicle Compatibility", path: "/shop/vehicle-fitments", roles: ["superAdmin", "admin", "manager"] },
  { id: "users", label: "Users", path: "/users", roles: ["superAdmin"] },
  { id: "branches", label: "Branches", path: "/branches", roles: ["superAdmin"] },
  { id: "audit", label: "Audit Logs", path: "/audit", roles: ["superAdmin"] },
];

export function navForRole(role) {
  const r = role || "employee";
  return NAV_ITEMS.filter((n) => n.roles.includes(r));
}
