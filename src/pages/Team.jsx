import { useState, useEffect } from "react";
import { sb } from "../supabase.js";

const ROLES = [{ v:"admin", l:"Admin" },{ v:"team_leader", l:"Team Leader" },{ v:"employee", l:"Employee" }];
const COLORS = ["#2563EB","#7C3AED","#059669","#DC2626","#D97706","#0891B2","#DB2777","#9333EA","#16A34A","#EA580C"];

export default function Team({ user }) {
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [winners, setWinners] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const isAdmin = user.role === "admin" || user.role === "team_leader";
  const [form, setForm] = useState({ name: "", role: "employee", email: "", job_title: "", avatar_color: "#2563EB" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [m, t, w] = await Promise.all([
      sb("team_members?order=created_at"),
      sb("tasks?select=id,assigned_to,status"),
      sb("eom_winners?select=member_name,month"),
    ]);
    if (m) setMembers(m);
    if (t) setTasks(t);
    if (w) setWinners(w);
    setLoading(false);
  }

  async function addMember() {
    if (!form.name.trim()) return;
    await sb("team_members", "POST", form);
    await loadAll();
    setShowAdd(false);
    setForm({ name: "", role: "employee", email: "", job_title: "", avatar_color: "#2563EB" });
  }

  async function updateRole(m, role) {
    await sb(`team_members?id=eq.${m.id}`, "PATCH", { role });
    await loadAll();
  }

  async function toggleActive(m) {
    await sb(`team_members?id=eq.${m.id}`, "PATCH", { is_active: !m.is_active });
    await loadAll();
  }

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>👥 الفريق</h2>
        {isAdmin && <button onClick={() => setShowAdd(true)} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+ عضو جديد</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "repeat(2,1fr)", gap: 14 }}>
        {members.filter(m => m.is_active).map(m => {
          const mt = tasks.filter(t => t.assigned_to === m.name);
          const done = mt.filter(t => t.status === "completed").length;
          const pending = mt.filter(t => t.status !== "completed" && t.status !== "cancelled").length;
          const pct = mt.length ? Math.round((done / mt.length) * 100) : 0;
          const wins = winners.filter(w => w.member_name === m.name).length;
          return (
            <div key={m.id} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div style={{ width: 50, height: 50, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, flexShrink: 0, color: "#fff" }}>{m.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {m.name}
                    {wins > 0 && (
                      <span title={`فاز بموظف الشهر ${wins} مرة`} style={{ fontSize: 11, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", padding: "1px 8px", borderRadius: 20, fontWeight: 700 }}>
                        🏆 {wins}
                      </span>
                    )}
                  </div>
                  {m.email && <div style={{ fontSize: 11, color: "#94A3B8" }}>{m.email}</div>}
                </div>
                {isAdmin ? (
                  <select value={m.role} onChange={e => updateRole(m, e.target.value)} style={{ fontSize: 11, background: m.role === "admin" ? "#EFF6FF" : "#F8FAFC", color: m.role === "admin" ? "#2563EB" : "#64748B", border: "1px solid #E2E8F0", borderRadius: 8, padding: "4px 8px", fontWeight: 600 }}>
                    {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#F1F5F9", color: "#64748B" }}>{ROLES.find(r => r.v === m.role)?.l}</span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                {[{ l:"الكل", v:mt.length, c:"#2563EB" },{ l:"منجز", v:done, c:"#059669" },{ l:"متبقي", v:pending, c:"#D97706" }].map(s => (
                  <div key={s.l} style={{ textAlign: "center", background: "#F8FAFC", borderRadius: 10, padding: "8px 4px", border: "1px solid #F1F5F9" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: isAdmin ? 10 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "#64748B" }}>الأداء</span>
                  <span style={{ color: pct >= 80 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626", fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ background: "#F1F5F9", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ width: pct+"%", height: "100%", background: pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444", borderRadius: 4, transition: "width 0.5s" }}></div>
                </div>
              </div>

              {isAdmin && (
                <button onClick={() => toggleActive(m)} style={{ width: "100%", marginTop: 10, background: m.is_active ? "#FEF2F2" : "#ECFDF5", border: `1px solid ${m.is_active ? "#FECACA" : "#A7F3D0"}`, color: m.is_active ? "#DC2626" : "#059669", padding: "6px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                  {m.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>+ عضو جديد</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="الاسم *" style={inp} />
              <input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="المسمى الوظيفي" style={inp} />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="البريد الإلكتروني" style={{ ...inp, direction: "ltr" }} />
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الصلاحية</div>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                  {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>اللون</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, avatar_color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: form.avatar_color === c ? "3px solid #0F172A" : "3px solid transparent" }}></button>)}
                </div>
              </div>
              <button onClick={addMember} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>إضافة العضو</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
