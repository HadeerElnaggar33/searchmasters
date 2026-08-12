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

  const inp = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.3)", color: "#E2E8F0", padding: "12px 16px", borderRadius: 12, fontSize: 15, outline: "none", width: "100%", direction: "rtl", transition: "border 0.2s" };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0F0C29 0%, #1a1060 50%, #0F0C29 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #6366F1, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, margin: "0 auto 16px", boxShadow: "0 0 40px rgba(99,102,241,0.4)" }}>S</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, background: "linear-gradient(90deg, #A5B4FC, #C4B5FD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>Search Masters</h1>
          <p style={{ color: "#6B7280", fontSize: 14 }}>Workspace — لوحة إدارة الفريق</p>
        </div>

        {/* Card */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, padding: 32, backdropFilter: "blur(20px)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>تسجيل الدخول</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" }}>اسمك في التيم</label>
              <input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="مثال: هدير" style={inp} list="names-list" />
              <datalist id="names-list">
                {["هدير","مينا","مريم","هدى","هند","د.محمد علي"].map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            <div>
              <label style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" }}>كلمة المرور</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ ...inp, paddingLeft: 44 }} />
                <button onClick={() => setShowPass(v => !v)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", color: "#6B7280", fontSize: 16 }}>{showPass ? "🙈" : "👁"}</button>
              </div>
            </div>

            {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#FCA5A5", fontSize: 13, textAlign: "center" }}>{error}</div>}

            <button onClick={handleLogin} disabled={loading} style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "#fff", padding: "13px", borderRadius: 12, fontSize: 15, fontWeight: 700, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
              {loading ? "جاري الدخول..." : "دخول →"}
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, color: "#4B5563", fontSize: 12 }}>Search Masters Workspace © 2025</p>
      </div>
    </div>
  );
}
