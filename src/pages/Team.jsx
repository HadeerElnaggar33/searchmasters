import { useState, useEffect } from "react";
import { sb } from "../supabase.js";

const ROLES = [{ v: "admin", l: "Admin" }, { v: "team_leader", l: "Team Leader" }, { v: "employee", l: "Employee" }];
const COLORS = ["#6366F1","#8B5CF6","#EC4899","#EF4444","#F97316","#10B981","#3B82F6","#F59E0B","#14B8A6","#A855F7"];

export default function Team({ user }) {
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const isAdmin = user.role === "admin" || user.role === "team_leader";
  const [form, setForm] = useState({ name: "", role: "employee", email: "", job_title: "", avatar_color: "#6366F1" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [m, t] = await Promise.all([sb("team_members?order=created_at"), sb("tasks?select=id,assigned_to,status")]);
    if (m) setMembers(m);
    if (t) setTasks(t);
    setLoading(false);
  }

  async function addMember() {
    if (!form.name.trim()) return;
    await sb("team_members", "POST", form);
    await loadAll();
    setShowAdd(false);
    setForm({ name: "", role: "employee", email: "", job_title: "", avatar_color: "#6366F1" });
  }

  async function toggleActive(m) {
    await sb(`team_members?id=eq.${m.id}`, "PATCH", { is_active: !m.is_active });
    await loadAll();
  }

  const inp = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#E2E8F0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>👥 الفريق</h2>
        {isAdmin && <button onClick={() => setShowAdd(true)} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+ عضو جديد</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "repeat(2,1fr)", gap: 14 }}>
        {members.map(m => {
          const mt = tasks.filter(t => t.assigned_to === m.name);
          const done = mt.filter(t => t.status === "completed").length;
          const pending = mt.filter(t => t.status !== "completed" && t.status !== "cancelled").length;
          const pct = mt.length ? Math.round((done / mt.length) * 100) : 0;
          return (
            <div key={m.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${m.is_active ? "rgba(99,102,241,0.2)" : "rgba(107,114,128,0.2)"}`, borderRadius: 18, padding: 18, opacity: m.is_active ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: m.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, flexShrink: 0 }}>{m.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>{m.job_title || m.role}</div>
                  {m.email && <div style={{ fontSize: 11, color: "#6B7280" }}>{m.email}</div>}
                </div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: m.role === "admin" ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.08)", color: m.role === "admin" ? "#A5B4FC" : "#9CA3AF" }}>{ROLES.find(r => r.v === m.role)?.l}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                {[{ l: "الكل", v: mt.length, c: "#6366F1" }, { l: "منجز", v: done, c: "#10B981" }, { l: "متبقي", v: pending, c: "#F59E0B" }].map(s => (
                  <div key={s.l} style={{ textAlign: "center", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 4px" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>
                  <span>الأداء</span><span style={{ color: pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444" }}>{pct}%</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444", borderRadius: 4, transition: "width 0.5s" }}></div>
                </div>
              </div>
              {isAdmin && <button onClick={() => toggleActive(m)} style={{ width: "100%", background: m.is_active ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${m.is_active ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`, color: m.is_active ? "#FCA5A5" : "#6EE7B7", padding: "6px", borderRadius: 8, fontSize: 12 }}>{m.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}</button>}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, position: "relative" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>+ عضو جديد</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="الاسم *" style={inp} />
              <input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="المسمى الوظيفي" style={inp} />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="البريد الإلكتروني" style={{ ...inp, direction: "ltr" }} />
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الصلاحية</div>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                  {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6 }}>اللون</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, avatar_color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: form.avatar_color === c ? "3px solid #fff" : "3px solid transparent" }}></button>)}
                </div>
              </div>
              <button onClick={addMember} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>إضافة العضو</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
