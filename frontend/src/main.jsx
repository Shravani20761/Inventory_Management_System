import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { BranchProvider } from "./context/BranchContext.jsx";
import ShellLayout from "./layouts/ShellLayout.jsx";
import Login from "./pages/Login.jsx";
import RoleHome from "./pages/RoleHome.jsx";
import AnalyticsDashboard from "./pages/AnalyticsDashboard.jsx";
import UsersAdmin from "./pages/UsersAdmin.jsx";
import BranchesAdmin from "./pages/BranchesAdmin.jsx";
import AuditLogsPage from "./pages/AuditLogsPage.jsx";
import App from "./App.jsx";
import { canAccessPath, homePathForUser, isHqUser } from "./utils/authRouting.js";

function ProtectedLayout() {
  const { token, user, bootstrapping } = useAuth();
  const location = useLocation();

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Restoring session…
      </div>
    );
  }
  if (user && !canAccessPath(user, location.pathname)) {
    return <Navigate to={homePathForUser(user)} replace />;
  }
  return (
    <BranchProvider>
      <Outlet />
    </BranchProvider>
  );
}

function GuestLogin() {
  const { token, user, bootstrapping } = useAuth();
  if (bootstrapping && token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Restoring session…
      </div>
    );
  }
  if (token && user) return <Navigate to={homePathForUser(user)} replace />;
  return <Login />;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (!isHqUser(user)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestLogin />} />
      <Route path="/admin/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/branch/*" element={<Navigate to="/dashboard" replace />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<ShellLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AnalyticsDashboard />} />
          <Route path="home" element={<RoleHome />} />
          <Route
            path="users"
            element={
              <AdminOnly>
                <UsersAdmin />
              </AdminOnly>
            }
          />
          <Route
            path="branches"
            element={
              <AdminOnly>
                <BranchesAdmin />
              </AdminOnly>
            }
          />
          <Route
            path="audit"
            element={
              <AdminOnly>
                <AuditLogsPage />
              </AdminOnly>
            }
          />
          <Route path="shop/*" element={<App />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
