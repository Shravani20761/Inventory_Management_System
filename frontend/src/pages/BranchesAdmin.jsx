import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const empty = {
  name: "",
  code: "",
  businessName: "BatteryMela",
  address: "",
  city: "Pune",
  phone: "",
  email: "",
  gstin: "",
  managerName: "",
  loginEmail: "",
  loginPassword: "",
  loginRole: "manager",
};

export default function BranchesAdmin() {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState(null);

  async function refresh() {
    setBranches(await api.branches.list());
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: form.name,
        code: form.code,
        businessName: form.businessName,
        address: form.address,
        city: form.city,
        phone: form.phone,
        email: form.email,
        gstin: form.gstin,
        managerName: form.managerName || `${form.name} Manager`,
        loginName: form.managerName || `${form.name} Manager`,
        loginEmail: form.loginEmail,
        loginPassword: form.loginPassword,
        loginRole: form.loginRole || "manager",
      };

      if (editingId) {
        // Password optional on edit — omit empty password so we don't wipe it
        if (!payload.loginPassword) delete payload.loginPassword;
        await api.branches.update(editingId, payload);
        setSuccess("Branch updated. Login credentials saved for this branch only.");
      } else {
        const created = await api.branches.create(payload);
        setSuccess(
          `Branch created. Sign in as ${created.createdLogin?.email || form.loginEmail} — only this branch data is visible.`,
        );
      }
      setForm(empty);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(b) {
    setEditingId(b.id || b._id);
    setSuccess("");
    setError("");
    setForm({
      name: b.name || "",
      code: b.code || "",
      businessName: b.businessName || "BatteryMela",
      address: b.address || "",
      city: b.city || "",
      phone: b.phone || "",
      email: b.email || "",
      gstin: b.gstin || "",
      managerName: b.managerName || b.managerLogin?.name || "",
      loginEmail: b.managerLogin?.email || "",
      loginPassword: "",
      loginRole: b.managerLogin?.role || "manager",
    });
  }

  async function deactivate(id) {
    if (!confirm("Deactivate this branch? Branch logins will be disabled. Historical data is kept.")) return;
    try {
      await api.branches.deactivate(id);
      setSuccess("Branch deactivated and its logins disabled.");
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="min-h-full p-6 md:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Branches</h1>
      <p className="mt-1 text-slate-600">
        Create a branch with its own login. That account can only access that branch’s inventory, sales, quotations, and invoices.
      </p>
      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <form onSubmit={onSubmit} className="mt-6 grid max-w-3xl gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-base font-semibold">{editingId ? "Edit branch" : "Add branch + login"}</h2>

        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Branch name (e.g. Wakad)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Code (e.g. WAKAD)" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
        <input className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" placeholder="Business name on PDFs (BatteryMela / Krishnaa Battery)" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Branch phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Branch contact email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />

        <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">Branch login credentials</h3>
          <p className="mt-1 text-xs text-slate-500">
            These credentials sign in only to this branch. Admin (HQ) keeps a separate account for all branches.
          </p>
        </div>
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Manager / user display name" value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
        <select className="rounded-lg border px-3 py-2 text-sm" value={form.loginRole} onChange={(e) => setForm({ ...form, loginRole: e.target.value })}>
          <option value="manager">Manager</option>
          <option value="staff">Staff</option>
        </select>
        <input
          className="rounded-lg border px-3 py-2 text-sm"
          type="email"
          placeholder="Login email"
          required={!editingId}
          value={form.loginEmail}
          onChange={(e) => setForm({ ...form, loginEmail: e.target.value })}
        />
        <input
          className="rounded-lg border px-3 py-2 text-sm"
          type="password"
          placeholder={editingId ? "New password (leave blank to keep)" : "Login password (min 6)"}
          required={!editingId}
          minLength={editingId ? undefined : 6}
          value={form.loginPassword}
          onChange={(e) => setForm({ ...form, loginPassword: e.target.value })}
          autoComplete="new-password"
        />

        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            {editingId ? "Save branch & login" : "Create branch & login"}
          </button>
          {editingId && (
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={() => {
                setEditingId(null);
                setForm(empty);
                setSuccess("");
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Login email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id || b._id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3">{b.code}</td>
                <td className="px-4 py-3">{b.businessName}</td>
                <td className="px-4 py-3">{b.managerLogin?.email || "—"}</td>
                <td className="px-4 py-3">{b.status || (b.active === false ? "inactive" : "active")}</td>
                <td className="px-4 py-3 space-x-2">
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => startEdit(b)}>
                    Edit
                  </button>
                  {b.active !== false && b.status !== "inactive" && (
                    <button type="button" className="text-red-600 hover:underline" onClick={() => deactivate(b.id || b._id)}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
