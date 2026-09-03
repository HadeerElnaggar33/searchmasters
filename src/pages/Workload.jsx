import { useState, useEffect } from "react";
import { sb, STATUS_CONFIG, PRIORITY_CONFIG, formatDate, CURRENT_MONTH } from "../supabase.js";

function parseHelpers(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return String(val).split(",").map(x => x.trim()).filter(Boolean);
}

function isOnTask(task, name) {
  return task.assigned_to === name || parseHelpers(task.helpers).includes(name);
}

export default function Workload({ user }) {
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [m, t] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      sb(`tasks?month=eq.${encodeURIComponent(CURRENT_MONTH)}&order=created_at`),
    ]);
    if (m) setMembers(m);
    if (t) setTasks(t);
    setLoading(false);
  }

  function getMemberLoad(name) {
    const all = tasks.filter(t => isOnTask(t, name));
    const mt = all.filter(t => t.status !== "completed" && t.status !== "cancelled");
    const completed = all.filter(t => t.status === "completed").length;
    const helping = mt.filter(t => t.assigned_to !== name).length;
    const urgent = mt.filter(t => t.priority === "urgent").length;
    const high = mt.filter(t => t.priority === "high").length;
    const overdue = mt.filter(t => t.due_date && t.due_date < today).length;
    const inProgress = mt.filter(t => t.status === "in_progress").length;

    // الضغط من المتبقي، ناقص خصم مقابل المنجز (كل تاسكتين منجزتين = نقطة، بحد أقصى 6)
    const raw = urgent * 4 + high * 2 + overdue * 3 + inProgress;
    const relief = Math.min(6, Math.floor(completed / 2));
    const score = Math.max(0, raw - relief);

    let level, color, label;
    if (score === 0) { level = 0; color = "#10B981"; label = "خفيف 🟢"; }
    else if (score <= 4) { level = 1; color = "#3B82F6"; label = "عادي 🔵"; }
    else if (score <= 8) { level = 2; color = "#F59E0B"; label = "متوسط 🟡"; }
    else if (score <= 14) { level = 3; color = "#F97316"; label = "عالي 🟠"; }
    else { level = 4; color = "#EF4444"; label = "ضغط شديد 🔴"; }
    return { tasks: mt, completed, helping, urgent, high, overdue, inProgress, raw, relief, score, level, color, label };
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>جاري التحميل...</div>;

  const pendingTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
  const totalPending = pendingTasks.length;
  const totalUrgent = pendingTasks.filter(t => t.priority === "urgent").length;
  const totalOverdue = pendingTasks.filter(t => t.due_date && t.due_date < today).length;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>⚖️ توزيع العمل</h2>

      {/* Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { l: "إجمالي المتبقي", v: totalPending, c: "#6366F1", i: "📋" },
          { l: "عاجلة", v: totalUrgent, c: "#EF4444", i: "🔴" },
          { l: "متأخرة", v: totalOverdue, c: "#F97316", i: "⚠️" },
          { l: "أعضاء نشطين", v: members.length, c: "#10B981", i: "👥" },
        ].map(s => (
          <div key={s.l} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${s.c}33`, borderRadius: 14, padding: "14px 12px", borderTop: `3px solid ${s.c}` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.i}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Member Workloads */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {members.map(m => {
          const load = getMemberLoad(m.name);
          const pct = Math.min(100, Math.round((load.score / 20) * 100));
          return (
            <div key={m.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${load.color}33`, borderRadius: 16, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: m.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{m.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>{m.job_title}</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: load.color }}>{load.label}</span>
                  {load.level >= 3 && <span style={{ fontSize: 12, background: "rgba(239,68,68,0.15)", color: "#FCA5A5", padding: "4px 10px", borderRadius: 8 }}>⚠️ عبء عالي</span>}
                </div>
              </div>

              {/* Stats */}
              <div style={{ padding: "12px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 12 }}>
                  {[
                    { l: "متبقي", v: load.tasks.length, c: "#6366F1" },
                    { l: "منجز", v: load.completed, c: "#10B981" },
                    { l: "عاجلة", v: load.urgent, c: "#EF4444" },
                    { l: "متأخرة", v: load.overdue, c: "#F59E0B" },
                    { l: "مساعدة", v: load.helping, c: "#8B5CF6" },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign: "center", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 4px" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: "#6B7280" }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Load bar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>
                    <span>مستوى الضغط</span>
                    <span style={{ color: load.color }}>{pct}%</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: load.color, borderRadius: 6, transition: "width 0.5s" }}></div>
                  </div>
                  {load.relief > 0 && (
                    <div style={{ fontSize: 10, color: "#10B981", marginTop: 5 }}>
                      ✅ اتخصم {load.relief} نقطة من الضغط مقابل {load.completed} تاسك منجزة (الضغط قبل الخصم {load.raw})
                    </div>
                  )}
                </div>

                {/* Tasks list */}
                {load.tasks.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {load.tasks.slice(0, 4).map(t => {
                      const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                      const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                      const isOverdue = t.due_date && t.due_date < today;
                      return (
                        <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px", borderRight: `2px solid ${isOverdue ? "#EF4444" : s.color}` }}>
                          <span>{s.icon}</span>
                          {t.assigned_to !== m.name && <span title="مساعدة" style={{ fontSize: 10, color: "#8B5CF6" }}>🤝</span>}
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                          <span>{p.icon}</span>
                          {isOverdue && <span style={{ color: "#EF4444", fontSize: 10 }}>متأخر</span>}
                          {t.due_date && !isOverdue && <span style={{ color: "#6B7280", fontSize: 10 }}>{formatDate(t.due_date)}</span>}
                        </div>
                      );
                    })}
                    {load.tasks.length > 4 && <div style={{ fontSize: 11, color: "#6B7280", textAlign: "center" }}>+{load.tasks.length - 4} تاسكات أخرى</div>}
                  </div>
                )}
                {load.tasks.length === 0 && <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, padding: "10px 0" }}>🎉 لا توجد تاسكات متبقية</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
