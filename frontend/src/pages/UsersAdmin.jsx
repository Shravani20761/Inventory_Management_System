import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { displayRole } from "../utils/authRouting.js";

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "employee", label: "Employee (legacy staff)" },
  { value: "accountant", label: "Accountant" },
  { value: "warehouseManager", label: "Warehouse Manager" },
  { value: "admin", label: "Manager (legacy admin)" },
  { value: "superAdmin", label: "Admin (HQ)" },
];

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "manager",
  branchId: "",
};

export default function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  async function refresh() {
    setError("");
    // Load independently so a branches failure cannot wipe a successful users load (and vice versa).
    const [usersResult, branchesResult] = await Promise.allSettled([api.users.list(), api.branches.list()]);

    if (usersResult.status === "fulfilled") {
      setUsers(Array.isArray(usersResult.value) ? usersResult.value : []);
    } else {
      setUsers([]);
      setError(`GET /api/users failed: ${usersResult.reason?.message || "Unknown error"}`);
    }

    if (branchesResult.status === "fulfilled") {
      setBranches(Array.isArray(branchesResult.value) ? branchesResult.value : []);
    } else {
      setBranches([]);
      const branchMsg = `GET /api/branches failed: ${branchesResult.reason?.message || "Unknown error"}`;
      setError((prev) => (prev ? `${prev} | ${branchMsg}` : branchMsg));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      if (editingId) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          branchId: form.role === "superAdmin" ? null : form.branchId || null,
        };
        await api.users.update(editingId, payload);
        setSuccess("User updated.");
      } else {
        await api.users.create({
          ...form,
          branchId: form.role === "superAdmin" ? null : form.branchId || null,
        });
        setSuccess(`User created. Password is hashed and cannot be viewed again — use Reset Password if needed.`);
      }
      setForm(emptyForm);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setSuccess("");
    setError("");
    setForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "manager",
      branchId: typeof u.branchId === "object" ? u.branchId?._id || u.branchId?.id || "" : u.branchId || "",
    });
  }

  async function toggleActive(u) {
    setError("");
    try {
      await api.users.update(u.id, { active: u.active === false });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setError("");
    try {
      await api.users.resetPassword(resetFor.id, newPassword);
      setSuccess(`Password reset for ${resetFor.email}. Share the new password securely — it is not stored in plain text.`);
      setResetFor(null);
      setNewPassword("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-full p-6 md:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      <p className="mt-1 text-slate-600">
        Assign managers and staff to branches. Passwords are hashed — Admin can only reset, never view stored passwords.
      </p>
      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <form onSubmit={onCreate} className="mt-6 grid max-w-3xl gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-base font-semibold">{editingId ? "Edit user" : "Add user"}</h2>
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {!editingId && (
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Password (min 6)"
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
          />
        )}
        <select className="rounded-lg border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border px-3 py-2 text-sm sm:col-span-2"
          value={form.branchId}
          onChange={(e) => setForm({ ...form, branchId: e.target.value })}
          required={form.role !== "superAdmin"}
        >
          <option value="">Assigned branch…</option>
          {branches.map((b) => (
            <option key={b.id || b._id} value={b.id || b._id}>
              {b.name} — {b.businessName || "BatteryMela"}
            </option>
          ))}
        </select>
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            {editingId ? "Save user" : "Create user"}
          </button>
          {editingId && (
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {resetFor && (
        <form onSubmit={submitReset} className="mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900">Reset password — {resetFor.name}</h3>
          <p className="mt-1 text-xs text-amber-800">Enter a new password. The old hash is replaced; the plaintext is never stored.</p>
          <input
            className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
            type="password"
            placeholder="New password (min 6)"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div className="mt-3 flex gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">
              Save new password
            </button>
            <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => { setResetFor(null); setNewPassword(""); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Password</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{displayRole(u)}</td>
                <td className="px-4 py-3">
                  {u.branchName || u.branchId?.name || "—"}
                  {u.businessName ? ` (${u.businessName})` : ""}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  ••••••••••
                  <button type="button" className="ml-2 text-indigo-600 hover:underline" onClick={() => { setResetFor(u); setNewPassword(""); setSuccess(""); }}>
                    Reset Password
                  </button>
                </td>
                <td className="px-4 py-3">{u.active === false ? "Inactive" : "Active"}</td>
                <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => startEdit(u)}>
                    Edit
                  </button>
                  <button type="button" className="text-slate-600 hover:underline" onClick={() => toggleActive(u)}>
                    {u.active === false ? "Activate" : "Deactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
