import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ShellLayout from "./layouts/ShellLayout.jsx";
import Login from "./pages/Login.jsx";
import RoleHome from "./pages/RoleHome.jsx";
import App from "./App.jsx";

function ProtectedLayout() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function GuestLogin() {
  const { token } = useAuth();
  if (token) return <Navigate to="/dashboard" replace />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestLogin />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<ShellLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<RoleHome />} />
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
  </StrictMode>
);
