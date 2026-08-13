import { useState } from "react";
import { sb } from "../supabase.js";

const APP_PASSWORD = "searchmasters2025";

export default function Login({ onLogin }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    if (!name.trim()) { setError("اختاري اسمك"); return; }
    if (password !== APP_PASSWORD) { setError("كلمة المرور غلط"); return; }
    setLoading(true);
    const members = await sb(`team_members?name=eq.${encodeURIComponent(name.trim())}&is_active=eq.true`);
    if (!members || members.length === 0) { setError("الاسم مش موجود في التيم"); setLoading(false); return; }
    const member = members[0];
    localStorage.setItem("sm_user", JSON.stringify(member));
    onLogin(member);
    setLoading(false);
  }

  const inp = { background: "#FFFFFF", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "12px 16px", borderRadius: 10, fontSize: 15, outline: "none", width: "100%", direction: "rtl", transition: "border 0.2s" };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 50%, #F0FDF4 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: "linear-gradient(135deg, #2563EB, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, margin: "0 auto 16px", boxShadow: "0 8px 24px rgba(37,99,235,0.25)", color: "#fff" }}>S</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>Search Masters</h1>
          <p style={{ color: "#94A3B8", fontSize: 14 }}>Workspace — لوحة إدارة الفريق</p>
        </div>

        {/* Card */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 32, boxShadow: "0 4px 24px rgba(15,23,42,0.08)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, textAlign: "center", color: "#0F172A" }}>تسجيل الدخول</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: "#64748B", marginBottom: 6, display: "block", fontWeight: 600 }}>اسمك في الفريق</label>
              <input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="مثال: هدير" style={inp} list="names-list" onFocus={e => e.target.style.border = "1.5px solid #2563EB"} onBlur={e => e.target.style.border = "1.5px solid #E2E8F0"} />
              <datalist id="names-list">
                {["هدير","مينا","مريم","هدى","هند","د.محمد علي"].map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            <div>
              <label style={{ fontSize: 13, color: "#64748B", marginBottom: 6, display: "block", fontWeight: 600 }}>كلمة المرور</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ ...inp, paddingLeft: 44 }} onFocus={e => e.target.style.border = "1.5px solid #2563EB"} onBlur={e => e.target.style.border = "1.5px solid #E2E8F0"} />
                <button onClick={() => setShowPass(v => !v)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", color: "#94A3B8", fontSize: 16 }}>{showPass ? "🙈" : "👁"}</button>
              </div>
            </div>

            {error && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, textAlign: "center" }}>{error}</div>
            )}

            <button onClick={handleLogin} disabled={loading} style={{ background: loading ? "#94A3B8" : "linear-gradient(135deg, #2563EB, #7C3AED)", color: "#fff", padding: "13px", borderRadius: 12, fontSize: 15, fontWeight: 700, marginTop: 4, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
              {loading ? "جاري الدخول..." : "دخول →"}
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, color: "#083793", fontSize: 12 }}>Search Masters Workspace © 2026</p>
      </div>
    </div>
  );
}
