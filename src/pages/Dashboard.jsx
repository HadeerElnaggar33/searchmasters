import { useState, useEffect } from "react";
import { sb, STATUS_CONFIG, PRIORITY_CONFIG, timeAgo, formatDate, CURRENT_MONTH } from "../supabase.js";

const C = {
  card: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: "16px 14px", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" },
  heading: { color: "#0F172A", fontWeight: 800 },
  sub: { color: "#94A3B8", fontSize: 12 },
  badge: (color, bg) => ({ fontSize: 11, color, background: bg, padding: "2px 8px", borderRadius: 6, fontWeight: 600 }),
};

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
    if (a) { setAttendance(a); const my = a.find(x => x.member_name === user.name); if (my?.clock_in && !my?.clock_out) setClockedIn(my); }
    if (n) setNotifs(n);
    setLoading(false);
  }

 async function clockIn() {
  if (attendance.find(a => a.member_name === user.name)) return;
  const now = new Date().toISOString();
  const att = await sb("attendance", "POST", { member_name: user.name, date: today, clock_in: now, status: "present" });
  if (att?.[0]) {
    await sb("attendance_sessions", "POST", { attendance_id: att[0].id, member_name: user.name, date: today, start_time: now, type: "work" });
  }
  await loadAll();
}

async function clockOut() {
  if (!clockedIn) return;
  const now = new Date();
  // أغلق الـ session المفتوحة
  const sessions = await sb(`attendance_sessions?attendance_id=eq.${clockedIn.id}&end_time=is.null`);
  if (sessions?.length) {
    const mins = Math.floor((now - new Date(sessions[0].start_time)) / 60000);
    await sb(`attendance_sessions?id=eq.${sessions[0].id}`, "PATCH", { end_time: now.toISOString(), duration_minutes: mins });
  }
  // احسب الإجمالي
  const allSessions = await sb(`attendance_sessions?attendance_id=eq.${clockedIn.id}`);
  const totalMins = (allSessions || []).reduce((s, x) => s + (x.duration_minutes || 0), 0);
  await sb(`attendance?id=eq.${clockedIn.id}`, "PATCH", { clock_out: now.toISOString(), working_minutes: totalMins });
  setClockedIn(null);
  await loadAll();
}

  const myTasks = tasks.filter(t => t.assigned_to === user.name);
  const todayTasks = isAdmin ? tasks : myTasks;
  const overdue = todayTasks.filter(t => t.due_date && t.due_date.slice(0,10) < today && t.status !== "completed" && t.status !== "cancelled");
  const urgent = todayTasks.filter(t => t.priority === "urgent" && t.status !== "completed" && t.status !== "cancelled");
  const myAtt = attendance.find(a => a.member_name === user.name);

  const statCard = (label, val, color, bg, icon) => (
    <div style={{ ...C.card, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      {/* Welcome */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 2 }}>أهلاً، {user.name} 👋</h1>
          <p style={{ color: "#94A3B8", fontSize: 13 }}>{new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        {!myAtt
          ? <button onClick={clockIn} style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>🟢 بدء العمل</button>
          : !myAtt.clock_out
  ? <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#059669", background: "#ECFDF5", padding: "6px 12px", borderRadius: 8, border: "1px solid #A7F3D0" }}>
        🟢 {new Date(myAtt.clock_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button onClick={() => window.location.hash = "#attendance"} style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#D97706", padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
        ⏸ إيقاف مؤقت
      </button>
      <button onClick={clockOut} style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
        🔴 إنهاء العمل
      </button>
    </div>
           : null}
 </div>
    </div>
  );
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
        {statCard("الكل", todayTasks.length, "#2563EB", "#EFF6FF", "📋")}
        {statCard("جارية", todayTasks.filter(t=>t.status==="in_progress").length, "#2563EB", "#EFF6FF", "⚡")}
        {statCard("للمراجعة", todayTasks.filter(t=>t.status==="pending_review").length, "#D97706", "#FFFBEB", "👁")}
        {statCard("مكتملة", todayTasks.filter(t=>t.status==="completed").length, "#059669", "#ECFDF5", "✅")}
        {statCard("متأخرة", overdue.length, "#DC2626", "#FEF2F2", "🔴")}
        {statCard("عاجلة", urgent.length, "#DC2626", "#FEF2F2", "🚨")}
      </div>

      {/* Urgent */}
      {urgent.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 10 }}>🚨 تاسكات عاجلة</h3>
          {urgent.slice(0,3).map(t => (
            <div key={t.id} style={{ background: "#FFFFFF", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, border: "1px solid #FECACA" }}>
              <span style={{ fontSize: 11, background: "#FEE2E2", color: "#DC2626", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{t.assigned_to}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{t.title}</span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>{formatDate(t.due_date)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 640 ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Tasks */}
        <div style={{ ...C.card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>📋 {isAdmin ? "تاسكات الفريق" : "تاسكاتي"}</h3>
            <button onClick={() => onNavigate("tasks")} style={{ background: "#EFF6FF", color: "#2563EB", padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>الكل</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
            {(isAdmin ? tasks : myTasks).filter(t => t.status !== "completed" && t.status !== "cancelled").slice(0, 8).map(t => {
              const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
              const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
              return (
                <div key={t.id} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start", border: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{t.assigned_to} · {formatDate(t.due_date)}</div>
                  </div>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{p.icon}</span>
                </div>
              );
            })}
            {(isAdmin ? tasks : myTasks).filter(t => t.status !== "completed").length === 0 && (
              <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px 0", fontSize: 13 }}>🎉 مفيش تاسكات متبقية!</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Attendance */}
          {isAdmin && (
            <div style={{ ...C.card }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>⏰ حضور اليوم</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {members.map(m => {
                  const att = attendance.find(a => a.member_name === m.name);
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, color: "#fff" }}>{m.name[0]}</div>
                      <span style={{ flex: 1, fontSize: 13, color: "#0F172A", fontWeight: 500 }}>{m.name}</span>
                      {att
                        ? <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>{new Date(att.clock_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}{att.clock_out ? ` (${Math.floor(att.working_minutes/60)}س)` : " 🟢"}</span>
                        : <span style={{ fontSize: 11, color: "#94A3B8" }}>لم يسجل</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notifications */}
          <div style={{ ...C.card, flex: 1 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>🔔 الإشعارات</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {notifs.length === 0
                ? <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px 0", fontSize: 13 }}>لا توجد إشعارات</div>
                : notifs.map(n => (
                  <div key={n.id} style={{ background: n.is_read ? "#F8FAFC" : "#EFF6FF", borderRadius: 10, padding: "8px 12px", fontSize: 13, borderRight: n.is_read ? "none" : "3px solid #2563EB", border: "1px solid #F1F5F9" }}>
                    <div style={{ color: "#0F172A", lineHeight: 1.4 }}>{n.content}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div style={{ marginTop: 20, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 10 }}>🔴 تاسكات متأخرة ({overdue.length})</h3>
          {overdue.map(t => (
            <div key={t.id} style={{ background: "#FFFFFF", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6, border: "1px solid #FECACA" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{t.title}</span>
              <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ color: "#64748B" }}>{t.assigned_to}</span>
                <span style={{ color: "#DC2626", fontWeight: 600 }}>كانت في {formatDate(t.due_date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
