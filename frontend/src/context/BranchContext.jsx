import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

const BRANCH_KEY = "batterypro_act_as_branch";

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { user } = useAuth();
  const isHq = user?.role === "superAdmin";
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState(() => {
    try {
      return localStorage.getItem(BRANCH_KEY) || "all";
    } catch {
      return "all";
    }
  });

  useEffect(() => {
    if (!user) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    api.branches
      .list()
      .then((rows) => {
        if (!cancelled) setBranches(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.branchId]);

  const setSelectedBranchId = useCallback(
    (id) => {
      if (!isHq) return;
      const next = id || "all";
      setSelectedBranchIdState(next);
      try {
        localStorage.setItem(BRANCH_KEY, next);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent("branch:changed", { detail: { branchId: next } }));
    },
    [isHq],
  );

  const effectiveBranchId = isHq
    ? selectedBranchId === "all"
      ? null
      : selectedBranchId
    : user?.branchId || null;

  // Branch users: never keep a stale HQ "all" selection in localStorage for API headers
  useEffect(() => {
    if (!isHq) {
      try {
        localStorage.removeItem(BRANCH_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [isHq]);

  const selectedBranch = useMemo(() => {
    if (!effectiveBranchId) return null;
    return branches.find((b) => String(b.id || b._id) === String(effectiveBranchId)) || null;
  }, [branches, effectiveBranchId]);

  const businessName = isHq
    ? selectedBranch?.businessName || (selectedBranchId === "all" ? "All Branches" : "BatteryMela")
    : user?.businessName || selectedBranch?.businessName || "BatteryMela";

  const value = useMemo(
    () => ({
      isHq,
      branches,
      selectedBranchId: isHq ? selectedBranchId : user?.branchId || null,
      setSelectedBranchId,
      effectiveBranchId,
      selectedBranch,
      businessName,
      actAsHeader: isHq ? (selectedBranchId === "all" ? "all" : selectedBranchId) : null,
    }),
    [
      isHq,
      branches,
      selectedBranchId,
      setSelectedBranchId,
      effectiveBranchId,
      selectedBranch,
      businessName,
      user?.branchId,
    ],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
