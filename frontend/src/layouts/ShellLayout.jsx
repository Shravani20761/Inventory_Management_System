import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useBranch } from "../context/BranchContext.jsx";
import { navForRole } from "../constants/nav.js";
import { branchBanner, displayRole } from "../utils/authRouting.js";

function linkClass({ isActive }) {
  return [
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
  ].join(" ");
}

export default function ShellLayout() {
  const { user, logout } = useAuth();
  const { isHq, branches, selectedBranchId, setSelectedBranchId, selectedBranch } = useBranch();
  const location = useLocation();
  const items = navForRole(user?.role);
  const inShop = location.pathname.startsWith("/shop");
  const banner = branchBanner(user, isHq ? selectedBranch : null);

  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-slate-100 text-slate-900">
      <aside className="sticky top-0 flex h-screen w-[230px] shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900 text-slate-100 max-md:h-auto max-md:w-full max-md:max-h-none max-md:border-b max-md:border-r-0">
        <div className="border-b border-slate-800 px-4 py-4">
          <div className="text-lg font-semibold tracking-tight leading-tight">{banner.title}</div>
          {banner.subtitle ? <div className="mt-0.5 text-xs text-slate-400">{banner.subtitle}</div> : null}
          {isHq && (
            <select
              className="mt-3 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
              value={selectedBranchId || "all"}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              title="Admin branch filter"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id || b._id} value={b.id || b._id}>
                  {b.name} ({b.businessName || "BatteryMela"})
                </option>
              ))}
            </select>
          )}
          {!isHq && (
            <div className="mt-2 rounded-md bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-400">
              Locked to your assigned branch
            </div>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          <NavLink to="/dashboard" className={linkClass} end>
            <span className="text-sm" aria-hidden>
              ◎
            </span>
            Dashboard
          </NavLink>
          {items
            .filter((n) => n.id !== "dashboard")
            .map((n) => (
              <NavLink key={n.id} to={n.path} className={linkClass}>
                <span className="text-sm" aria-hidden>
                  ▸
                </span>
                {n.label}
              </NavLink>
            ))}
          <NavLink to="/shop/dashboard" className={linkClass}>
            <span className="text-sm" aria-hidden>
              ▣
            </span>
            Classic overview
          </NavLink>
        </nav>
        <div className="mt-auto border-t border-slate-800 p-3 text-sm text-slate-400">
          <div className="font-medium text-slate-200">{user?.name || "Signed in"}</div>
          <div className="mb-2">{displayRole(user)}</div>
          {inShop && <div className="mb-2 text-[11px] text-slate-500">Workspace uses your original BatteryPro UI.</div>}
          <button
            type="button"
            className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </aside>
      <div className="min-h-screen min-w-0 flex-1 overflow-x-hidden">
        <Outlet />
      </div>
    </div>
  );
}
