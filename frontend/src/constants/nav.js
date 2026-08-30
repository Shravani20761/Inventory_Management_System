/** Sidebar / shell navigation — same rules as legacy workspace */
export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", path: "/shop/dashboard", roles: ["superAdmin", "admin", "employee", "accountant", "warehouseManager", "ca"] },
  { id: "inventory", label: "Inventory", path: "/shop/inventory", roles: ["superAdmin", "admin", "employee", "warehouseManager"] },
  { id: "transfers", label: "Stock Transfers", path: "/shop/transfers", roles: ["superAdmin", "admin", "employee", "warehouseManager"] },
  { id: "purchases", label: "Purchase Management", path: "/shop/purchases", roles: ["superAdmin", "admin", "warehouseManager"] },
  { id: "quotations", label: "Quotations", path: "/shop/quotations", roles: ["superAdmin", "admin", "employee"] },
  { id: "invoices", label: "Tax Invoices", path: "/shop/invoices", roles: ["superAdmin", "admin", "accountant"] },
  { id: "accounts", label: "Accounts & CA Reports", path: "/shop/accounts", roles: ["superAdmin", "admin", "accountant", "ca"] },
  { id: "vehicle-fitments", label: "Vehicle Compatibility", path: "/shop/vehicle-fitments", roles: ["superAdmin", "admin"] },
];

export function navForRole(role) {
  const r = role || "employee";
  return NAV_ITEMS.filter((n) => n.roles.includes(r));
}
