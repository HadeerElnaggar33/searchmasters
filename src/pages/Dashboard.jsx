import { useState, useEffect } from "react";
import { sb, STATUS_CONFIG, PRIORITY_CONFIG, timeAgo, formatDate, CURRENT_MONTH } from "../supabase.js";

export default function Dashboard({ user, onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(null);
  const today = new Date().toISOString().split("T")[0];
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [t, m, a, n] = await Promise.all([
      sb(`tasks?month=eq.${encodeURIComponent(CURRENT_MONTH)}&order=created_at.desc`),
      sb("team_members?is_active=eq.true&order=name"),
      sb(`attendance?date=eq.${today}&order=created_at`),
      sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&order=created_at.desc&limit=10`),
    ]);
    if (t) setTasks(t);
    if (m) setMembers(m);
    if (a) {
      setAttendance(a);
      const myAtt = a.find(x => x.member_name === user.name);
      if (myAtt && myAtt.clock_in && !myAtt.clock_out) setClockedIn(myAtt);
    }
    if (n) setNotifs(n);
    setLoading(false);
  }

  async function clockIn() {
    const existing = attendance.find(a => a.member_name === user.name);
    if (existing) return;
    await sb("attendance", "POST", { member_name: user.name, date: today, clock_in: new Date().toISOString(), status: "present" });
    await loadAll();
  }

  async function clockOut() {
    if (!clockedIn) return;
    const now = new Date();
    const start = new Date(clockedIn.clock_in);
    const mins = Math.floor((now - start) / 60000);
    await sb(`attendance?id=eq.${clockedIn.id}`, "PATCH", { clock_out: now.toISOString(), working_minutes: mins });
    setClockedIn(null);
    await loadAll();
  }

  const myTasks = tasks.filter(t => t.assigned_to === user.name);
  const todayTasks = isAdmin ? tasks : myTasks;
  const overdue = todayTasks.filter(t => t.due_date && t.due_date < today && t.status !== "completed" && t.status !== "cancelled");
  const inProgress = todayTasks.filter(t => t.status === "in_progress");
  const pendingReview = todayTasks.filter(t => t.status === "pending_review");
  const completed = todayTasks.filter(t => t.status === "completed");
  const urgent = todayTasks.filter(t => t.priority === "urgent" && t.status !== "completed");

  const card = (label, val, color, icon, onClick) => (
    <div onClick={onClick} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`, borderRadius: 16, padding: "16px 14px", borderTop: `3px solid ${color}`, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 3 }}>{label}</div>
    </div>
  );

  const myAtt = attendance.find(a => a.member_name === user.name);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      {/* Welcome */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>أهلاً، {user.name} 👋</h1>
          <p style={{ color: "#6B7280", fontSize: 13 }}>{new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        {/* Clock In/Out */}
        <div style={{ display: "flex", gap: 8 }}>
          {!myAtt ? (
            <button onClick={clockIn} style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>🟢 بدء العمل</button>
          ) : !myAtt.clock_out ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#10B981" }}>🟢 شغال من {new Date(myAtt.clock_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
              <button onClick={clockOut} style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>🔴 إنهاء العمل</button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "#6B7280", background: "rgba(255,255,255,0.05)", padding: "8px 14px", borderRadius: 10 }}>
              ⏱ {Math.floor(myAtt.working_minutes / 60)}س {myAtt.working_minutes % 60}د
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
        {card("الكل", todayTasks.length, "#6366F1", "📋")}
        {card("جارية", inProgress.length, "#3B82F6", "⚡")}
        {card("للمراجعة", pendingReview.length, "#F59E0B", "👁")}
        {card("مكتملة", completed.length, "#10B981", "✅")}
        {card("متأخرة", overdue.length, "#EF4444", "🔴")}
        {card("عاجلة", urgent.length, "#F97316", "🚨")}
      </div>

      {/* Urgent Tasks */}
      {urgent.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FCA5A5", marginBottom: 12 }}>🚨 تاسكات عاجلة</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {urgent.slice(0, 3).map(t => (
              <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, background: "rgba(239,68,68,0.2)", color: "#FCA5A5", padding: "2px 8px", borderRadius: 6 }}>{t.assigned_to}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatDate(t.due_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 640 ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* My Tasks */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>📋 {isAdmin ? "تاسكات الفريق" : "تاسكاتي"}</h3>
            <button onClick={() => onNavigate("tasks")} style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC", padding: "4px 10px", borderRadius: 8, fontSize: 12 }}>الكل</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {(isAdmin ? tasks : myTasks).filter(t => t.status !== "completed" && t.status !== "cancelled").slice(0, 8).map(t => {
              const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
              const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
              return (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{t.assigned_to} · {formatDate(t.due_date)}</div>
                  </div>
                  <span style={{ fontSize: 10, flexShrink: 0 }}>{p.icon}</span>
                </div>
              );
            })}
            {(isAdmin ? tasks : myTasks).filter(t => t.status !== "completed").length === 0 && (
              <div style={{ textAlign: "center", color: "#4B5563", padding: "20px 0", fontSize: 13 }}>🎉 مفيش تاسكات متبقية!</div>
            )}
          </div>
        </div>

        {/* Attendance + Notifs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Attendance */}
          {isAdmin && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⏰ حضور اليوم</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {members.map(m => {
                  const att = attendance.find(a => a.member_name === m.name);
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{m.name[0]}</div>
                      <span style={{ flex: 1, fontSize: 13 }}>{m.name}</span>
                      {att ? (
                        <span style={{ fontSize: 11, color: "#10B981" }}>
                          {new Date(att.clock_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                          {att.clock_out ? ` — ${Math.floor(att.working_minutes / 60)}س` : " 🟢"}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#4B5563" }}>لم يسجل</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notifications */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: 16, flex: 1 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🔔 الإشعارات</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {notifs.length === 0
                ? <div style={{ textAlign: "center", color: "#4B5563", padding: "20px 0", fontSize: 13 }}>لا توجد إشعارات</div>
                : notifs.map(n => (
                  <div key={n.id} style={{ background: n.is_read ? "transparent" : "rgba(99,102,241,0.08)", borderRadius: 10, padding: "8px 12px", fontSize: 13, borderRight: n.is_read ? "none" : "3px solid #6366F1" }}>
                    <div>{n.content}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div style={{ marginTop: 20, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 16, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#FCA5A5", marginBottom: 12 }}>🔴 تاسكات متأخرة ({overdue.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdue.map(t => (
              <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#9CA3AF" }}>
                  <span>{t.assigned_to}</span>
                  <span style={{ color: "#EF4444" }}>كانت في {formatDate(t.due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
