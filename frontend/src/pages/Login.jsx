import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession, getToken, getStoredUser } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { css } from "../appStyles.js";

export default function Login() {
  const navigate = useNavigate();
  const { setToken, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(email.trim(), password);
      setSession(data.token, data.user);
      setToken(getToken());
      setUser(getStoredUser());
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="app" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div className="card" style={{ width: 400, maxWidth: "92vw", padding: 28 }}>
          <div className="page-title" style={{ marginBottom: 8 }}>BatteryPro</div>
          <div className="page-sub" style={{ marginBottom: 20 }}>Sign in with your branch account</div>
          <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 16, lineHeight: 1.7, background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Branch logins (run npm run seed:branch-users once):</div>
            <div>Wakad — <code>wakad@batterymela.com</code> / <code>Wakad@123</code></div>
            <div>Pimple Saudagar — <code>pimple@batterymela.com</code> / <code>Pimple@123</code></div>
            <div style={{ marginTop: 6 }}>Super admin — <code>shravanijadhav921@gmail.com</code> / <code>password@123</code></div>
          </div>
          {error && <div style={{ color: "#b91c1c", fontSize: 16, marginBottom: 12 }}>{error}</div>}
          <form onSubmit={submit} className="form-grid">
            <div>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input className="form-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
