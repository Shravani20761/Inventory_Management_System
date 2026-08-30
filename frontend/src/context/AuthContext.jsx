import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, getStoredUser, getToken, setSession } from "../api/client.js";

const BRANCH_KEY = "batterypro_act_as_branch";

const AuthContext = createContext(null);

function clearActAsBranch() {
  try {
    localStorage.removeItem(BRANCH_KEY);
  } catch {
    /* ignore */
  }
}

function flattenUser(raw) {
  if (!raw) return null;
  const u = { ...raw };
  const b = u.branchId && typeof u.branchId === "object" ? u.branchId : null;
  if (b) {
    u.branchId = b._id?.toString?.() || b.id || u.branchId;
    u.branchName = u.branchName || b.branchName || b.name || "";
    u.branchCode = u.branchCode || b.code || b.branchId || "";
    u.businessName = u.businessName || b.businessName || "BatteryMela";
  }
  if (u._id && !u.id) u.id = u._id.toString();
  delete u.password;
  return u;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState(() => flattenUser(getStoredUser()));
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(getToken()));

  const logout = useCallback(() => {
    clearSession();
    clearActAsBranch();
    setToken(null);
    setUser(null);
    setBootstrapping(false);
  }, []);

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, [logout]);

  /** Restore session: re-fetch profile so role/branchId always match backend. */
  useEffect(() => {
    if (!token) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    setBootstrapping(true);
    api
      .profile()
      .then((data) => {
        if (cancelled) return;
        const next = flattenUser(data.user || data);
        if (!next || next.active === false) {
          logout();
          return;
        }
        setUser(next);
        setSession(token, next);
      })
      .catch(() => {
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const applyLogin = useCallback((loginResult) => {
    const nextUser = flattenUser(loginResult.user);
    clearActAsBranch();
    setSession(loginResult.token, nextUser);
    setToken(loginResult.token);
    setUser(nextUser);
    setBootstrapping(false);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      setToken,
      setUser,
      logout,
      applyLogin,
      bootstrapping,
      isAuthenticated: Boolean(token),
      isHq: String(user?.role || "") === "superAdmin",
    }),
    [token, user, logout, applyLogin, bootstrapping],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
