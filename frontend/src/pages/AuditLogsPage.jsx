import { useEffect, useState } from "react";
import { api } from "../api/client.js";

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.analytics
      .auditLogs({ limit: 200 })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-full p-6 md:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Audit logs</h1>
      <p className="mt-1 text-slate-600">Important actions across branches (login, users, branches, invoices, imports).</p>
      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Entity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN") : "—"}</td>
                <td className="px-4 py-3 font-medium">{r.action}</td>
                <td className="px-4 py-3">{r.userId?.name || r.userId?.email || "—"}</td>
                <td className="px-4 py-3">{r.role}</td>
                <td className="px-4 py-3">{r.branchId?.name || "—"}</td>
                <td className="px-4 py-3">{r.entity} {r.entityId ? `#${r.entityId}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
