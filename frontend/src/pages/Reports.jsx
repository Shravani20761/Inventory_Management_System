import { useEffect, useState } from "react";
import api from "../api/axiosClient.js";

export default function Reports() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/reports/summary").then((r) => setData(r.data)).catch(() => setData(null));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Reports</h1>
      {!data ? (
        <p className="text-slate-600">No report data yet. Add sales and invoices to see profit summary.</p>
      ) : (
        <pre className="rounded-xl border bg-white p-4 text-base overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
