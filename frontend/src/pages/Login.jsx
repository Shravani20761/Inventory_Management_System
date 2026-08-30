import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { homePathForUser, displayRole } from "../utils/authRouting.js";
import { css } from "../appStyles.js";

export default function Login() {
  const navigate = useNavigate();
  const { applyLogin } = useAuth();
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
      const user = applyLogin(data);
      navigate(homePathForUser(user), { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div
        className="app"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
        }}
      >
        <div className="card" style={{ width: 400, maxWidth: "92vw", padding: 28 }}>
          <div className="page-title" style={{ marginBottom: 8 }}>BatteryMela</div>
          <div className="page-sub" style={{ marginBottom: 20 }}>
            Sign in — your branch opens automatically from your account
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#6b7280",
              marginBottom: 16,
              lineHeight: 1.6,
              background: "#f8fafc",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            One login for Admin and all branches. Branch is taken from your assigned account — there is no branch picker here.
          </div>
          {error && <div style={{ color: "#b91c1c", fontSize: 16, marginBottom: 12 }}>{error}</div>}
          <form onSubmit={submit} className="form-grid">
            <div>
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
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
