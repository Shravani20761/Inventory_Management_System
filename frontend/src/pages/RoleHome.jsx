import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { navForRole } from "../constants/nav.js";

function Card({ title, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 text-base text-slate-600">{children}</div>
    </div>
  );
}

export default function RoleHome() {
  const { user } = useAuth();
  const role = user?.role || "employee";
  const items = navForRole(role).filter((n) => n.id !== "dashboard");

  const intros = {
    superAdmin: "Tenant-wide access: users, branches, and all shop data.",
    admin: "Manage your branch: inventory, sales, quotations, and invoices.",
    employee: "Day-to-day selling: inventory lookup and quotations.",
    accountant: "Invoices and financial reports.",
    warehouseManager: "Stock, purchases, and dispatch.",
    ca: "Read-only access to Accounts & CA Reports — view and download statements.",
  };

  return (
    <div className="min-h-full p-6 md:p-8">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{intros[role] || intros.employee}</p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium capitalize text-white">{role}</span>
        {user?.email && <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700">{user.email}</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Quick actions">
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id}>
                <Link className="font-medium text-indigo-600 hover:text-indigo-500" to={n.path}>
                  {n.label} →
                </Link>
              </li>
            ))}
            <li>
              <Link className="font-medium text-indigo-600 hover:text-indigo-500" to="/shop/dashboard">
                Classic overview (charts) →
              </Link>
            </li>
          </ul>
        </Card>

        {role === "superAdmin" && (
          <Card title="Super admin">
            <p>Use the API or future UI to manage users and branches. Shop tools are available from the sidebar.</p>
          </Card>
        )}

        {role === "accountant" && (
          <Card title="Accountant">
            <p>Open Invoices and use reports from the workspace when exposed in the classic app.</p>
          </Card>
        )}

        {role === "warehouseManager" && (
          <Card title="Warehouse">
            <p>Inventory and purchase/sales flows live under the workspace links.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
