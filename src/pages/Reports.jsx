import { useState, useEffect } from "react";
import { sb, STATUS_CONFIG, PRIORITY_CONFIG, formatDate, MONTHS } from "../supabase.js";

export default function Reports({ user }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()] + " " + new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("overview");

  useEffect(() => { loadAll(); }, [selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const [t, p, m] = await Promise.all([
      sb(`tasks?month=eq.${encodeURIComponent(selectedMonth)}&order=created_at`),
      sb("projects?order=name"),
      sb("team_members?is_active=eq.true&order=name"),
    ]);
    if (t) setTasks(t);
    if (p) setProjects(p);
    if (m) setMembers(m);
    setLoading(false);
  }

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const pending = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length;
  const today = new Date().toISOString().split("T")[0];
  const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== "completed" && t.status !== "cancelled").length;
  const shifted = tasks.filter(t => t.shift_count > 0).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>📊 التقارير</h2>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#083793", padding: "8px 12px", borderRadius: 10, fontSize: 13, outline: "none", direction: "rtl" }}>
          {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
        </select>
      </div>

      {/* View Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
        {[["overview","📊 نظرة عامة"],["by_project","📁 حسب المشروع"],["by_member","👤 حسب الموظف"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: view === v ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "transparent", color: view === v ? "#fff" : "#9CA3AF", fontSize: 12, fontWeight: view === v ? 700 : 400 }}>{l}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>جاري التحميل...</div> : (
        <>
          {/* Overview */}
          {view === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { l: "إجمالي التاسكات", v: total, c: "#6366F1", i: "📋" },
                  { l: "مكتملة", v: completed, c: "#10B981", i: "✅" },
                  { l: "متبقية", v: pending, c: "#F59E0B", i: "⏳" },
                  { l: "متأخرة", v: overdue, c: "#EF4444", i: "🔴" },
                  { l: "أُجّلت", v: shifted, c: "#F97316", i: "⏩" },
                  { l: "معدل الإنجاز", v: completionRate + "%", c: completionRate >= 80 ? "#10B981" : "#F59E0B", i: "📈" },
                ].map(s => (
                  <div key={s.l} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${s.c}33`, borderRadius: 14, padding: "14px 12px", borderTop: `3px solid ${s.c}` }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{s.i}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Status breakdown */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>توزيع التاسكات حسب الحالة</h3>
                {Object.entries(STATUS_CONFIG).map(([k, s]) => {
                  const count = tasks.filter(t => t.status === k).length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={k} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span>{s.icon} {s.label}</span>
                        <span style={{ color: s.color }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", background: s.color, borderRadius: 4, transition: "width 0.5s" }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delay reasons */}
              {tasks.filter(t => t.delay_reason).length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, padding: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📉 أسباب التأخير</h3>
                  {Object.entries(tasks.filter(t => t.delay_reason).reduce((acc, t) => { acc[t.delay_reason] = (acc[t.delay_reason] || 0) + 1; return acc; }, {})).map(([reason, count]) => (
                    <div key={reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <span>{reason}</span>
                      <span style={{ color: "#F59E0B", fontWeight: 700 }}>{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* By Project */}
          {view === "by_project" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {projects.map(proj => {
                const pt = tasks.filter(t => t.project_id === proj.id);
                if (pt.length === 0) return null;
                const done = pt.filter(t => t.status === "completed").length;
                const pct = pt.length ? Math.round((done / pt.length) * 100) : 0;
                return (
                  <div key={proj.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: proj.color || "#6366F1", flexShrink: 0 }}></div>
                      <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{proj.name}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 12, background: "rgba(16,185,129,0.15)", color: "#10B981", padding: "2px 10px", borderRadius: 8 }}>✅ {done}</span>
                        <span style={{ fontSize: 12, background: "rgba(245,158,11,0.15)", color: "#F59E0B", padding: "2px 10px", borderRadius: 8 }}>⏳ {pt.length - done}</span>
                        <span style={{ fontSize: 12, color: pct >= 80 ? "#10B981" : "#F59E0B", fontWeight: 700 }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ padding: 14 }}>
                      {pt.filter(t => t.status === "completed").map(t => (
                        <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                          <span>✅</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{t.title}</span>
                          <span style={{ fontSize: 11, color: "#9CA3AF" }}>{t.assigned_to}</span>
                          <span style={{ fontSize: 11, color: "#6B7280" }}>{formatDate(t.completed_at?.split("T")[0])}</span>
                        </div>
                      ))}
                      {pt.filter(t => t.status !== "completed" && t.status !== "cancelled").map(t => {
                        const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                        return (
                          <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                            <span>{s.icon}</span>
                            <span style={{ flex: 1, fontSize: 13, color: "#9CA3AF" }}>{t.title}</span>
                            <span style={{ fontSize: 11, color: "#6B7280" }}>{t.assigned_to}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Tasks without project */}
              {(() => {
                const np = tasks.filter(t => !t.project_id);
                if (np.length === 0) return null;
                return (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, padding: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#9CA3AF" }}>بدون مشروع</h3>
                    {np.map(t => {
                      const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                      return <div key={t.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}><span>{s.icon}</span><span style={{ flex: 1 }}>{t.title}</span><span style={{ color: "#6B7280" }}>{t.assigned_to}</span></div>;
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* By Member */}
          {view === "by_member" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {members.map(m => {
                const mt = tasks.filter(t => t.assigned_to === m.name);
                if (mt.length === 0) return null;
                const done = mt.filter(t => t.status === "completed").length;
                const overdueMt = mt.filter(t => t.due_date && t.due_date < today && t.status !== "completed").length;
                const shiftedMt = mt.filter(t => t.shift_count > 0).length;
                const pct = mt.length ? Math.round((done / mt.length) * 100) : 0;
                return (
                  <div key={m.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{m.name[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: "#9CA3AF" }}>{m.job_title}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, background: "rgba(99,102,241,0.15)", color: "#A5B4FC", padding: "2px 10px", borderRadius: 8 }}>📋 {mt.length}</span>
                        <span style={{ fontSize: 12, background: "rgba(16,185,129,0.15)", color: "#10B981", padding: "2px 10px", borderRadius: 8 }}>✅ {done}</span>
                        {overdueMt > 0 && <span style={{ fontSize: 12, background: "rgba(239,68,68,0.15)", color: "#FCA5A5", padding: "2px 10px", borderRadius: 8 }}>🔴 {overdueMt}</span>}
                        {shiftedMt > 0 && <span style={{ fontSize: 12, background: "rgba(249,115,22,0.15)", color: "#FED7AA", padding: "2px 10px", borderRadius: 8 }}>⏩ {shiftedMt}</span>}
                        <span style={{ fontSize: 13, fontWeight: 800, color: pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444" }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ padding: "10px 16px" }}>
                      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 5, overflow: "hidden", marginBottom: 10 }}>
                        <div style={{ width: pct + "%", height: "100%", background: pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444", borderRadius: 4 }}></div>
                      </div>
                      {mt.map(t => {
                        const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                        const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                        return (
                          <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14 }}>{s.icon}</span>
                            <span style={{ flex: 1, fontSize: 12 }}>{t.title}</span>
                            <span style={{ fontSize: 10 }}>{p.icon}</span>
                            {t.shift_count > 0 && <span style={{ fontSize: 10, color: "#F97316" }}>⏩{t.shift_count}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
