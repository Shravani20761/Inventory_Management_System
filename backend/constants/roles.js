export const ROLES = ["superAdmin", "admin", "employee", "accountant", "warehouseManager", "ca"];

export const DEFAULT_PERMISSIONS = {
  superAdmin: ["*"],
  admin: ["inventory", "quotations", "invoices", "purchases", "sales", "reports", "accounts", "users", "branches"],
  employee: ["inventory:read", "quotations"],
  accountant: ["invoices", "reports", "accounts"],
  warehouseManager: ["inventory"],
  /** Chartered Accountant: read-only access to Accounts & CA Reports (view + download). No edit. */
  ca: ["reports:read", "reports:download", "accounts:read", "accounts:download"],
};
