import { useState, useEffect } from "react";
import { sb, STATUS_CONFIG, PRIORITY_CONFIG, MONTHS } from "../supabase.js";

export default function Calendar({ user }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [t, p] = await Promise.all([
      sb("tasks?select=*&order=due_date"),
      sb("projects?select=id,name,color"),
    ]);
    if (t) setTasks(t);
    if (p) setProjects(p);
    setLoading(false);
  }

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;

  function localDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function getDaysInMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    // RTL: أعمدة من اليمين: سبت(6) جمعة(5) خميس(4) أربعاء(3) ثلاثاء(2) إثنين(1) أحد(0)
    // عدد الخلايا الفاضية قبل أول يوم
    const dow = firstDay.getDay(); // 0=أحد 6=سبت
    // في RTL عرضنا: العمود الأول (أقصى اليمين) = أحد(0)
    // فعدد الفراغات = dow
    for (let i = 0; i < dow; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }

  function getTasksForDate(date) {
    if (!date) return [];
    const dateStr = localDateStr(date);
    const filtered = tasks.filter(t => t.due_date && t.due_date.slice(0,10) === dateStr);
    return isAdmin ? filtered : filtered.filter(t => t.assigned_to === user.name);
  }

  function getWeekDays() {
    const start = new Date(currentDate);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }

  function navigate(dir) {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  }

  const days = getDaysInMonth(currentDate);
  const weekDays = getWeekDays();
  // RTL: أحد في أقصى اليمين → سبت في أقصى اليسار
  const DOW = ["أحد","إثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>📅 التقويم</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {["month","week","day"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: view === v ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "rgba(255,255,255,0.07)", color: view === v ? "#fff" : "#9CA3AF", fontSize: 12, fontWeight: view === v ? 700 : 400 }}>
              {v === "month" ? "شهر" : v === "week" ? "أسبوع" : "يوم"}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.2)", color: "#083793", padding: "8px 16px", borderRadius: 10, fontSize: 16 }}>→</button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>
          {view === "month" && `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
          {view === "week" && `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} — ${weekDays[6].getDate()}`}
          {view === "day" && currentDate.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <button onClick={() => navigate(1)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.2)", color: "#083793", padding: "8px 16px", borderRadius: 10, fontSize: 16 }}>←</button>
      </div>

      {/* Month View */}
      {view === "month" && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, overflow: "hidden" }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {DOW.map(d => <div key={d} style={{ padding: "10px 4px", textAlign: "center", fontSize: 11, color: "#6B7280", fontWeight: 700 }}>{d}</div>)}
          </div>
          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {days.map((day, i) => {
              const dayTasks = day ? getTasksForDate(day) : [];
              const dateStr = day ? localDateStr(day) : null;
              const isToday = dateStr === todayStr;
              const isSelected = selectedDay && day && localDateStr(selectedDay) === dateStr;
              return (
                <div key={i} onClick={() => day && setSelectedDay(day)} style={{ minHeight: 80, padding: "6px 4px", borderRight: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: day ? "pointer" : "default", background: isSelected ? "rgba(99,102,241,0.15)" : isToday ? "rgba(99,102,241,0.08)" : "transparent" }}>
                  {day && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? "#A5B4FC" : "#083793", textAlign: "center", marginBottom: 4, width: 24, height: 24, borderRadius: "50%", background: isToday ? "rgba(99,102,241,0.4)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px" }}>{day.getDate()}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {dayTasks.slice(0, 2).map(t => {
                          const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                          const proj = projects.find(p => p.id === t.project_id);
                          return (
                            <div key={t.id} style={{ fontSize: 9, background: proj?.color ? `${proj.color}33` : "rgba(99,102,241,0.2)", color: proj?.color || "#A5B4FC", borderRadius: 4, padding: "1px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.icon} {t.title}</div>
                          );
                        })}
                        {dayTasks.length > 2 && <div style={{ fontSize: 9, color: "#6B7280", textAlign: "center" }}>+{dayTasks.length - 2}</div>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === "week" && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {weekDays.map((day, i) => {
              const dateStr = localDateStr(day);
              const isToday = dateStr === todayStr;
              const dayTasks = getTasksForDate(day);
              return (
                <div key={i} style={{ borderRight: "1px solid rgba(255,255,255,0.06)", minHeight: 200 }}>
                  <div style={{ padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)", textAlign: "center", background: isToday ? "rgba(99,102,241,0.15)" : "transparent" }}>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{DOW[day.getDay()]}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? "#A5B4FC" : "#083793" }}>{day.getDate()}</div>
                  </div>
                  <div style={{ padding: "6px 4px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {dayTasks.map(t => {
                      const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                      return (
                        <div key={t.id} style={{ fontSize: 10, background: "rgba(99,102,241,0.15)", color: "#A5B4FC", borderRadius: 6, padding: "4px 6px", borderRight: `2px solid ${STATUS_CONFIG[t.status]?.color || "#6366F1"}` }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.icon} {t.title}</div>
                          <div style={{ color: "#6B7280", marginTop: 1 }}>{t.assigned_to}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {view === "day" && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700, fontSize: 15 }}>
            {currentDate.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ padding: 16 }}>
            {(() => {
              const dayTasks = getTasksForDate(currentDate);
              if (dayTasks.length === 0) return <div style={{ textAlign: "center", color: "#4B5563", padding: "40px 0" }}>لا توجد تاسكات في هذا اليوم</div>;
              return dayTasks.map(t => {
                const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
                const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                const proj = projects.find(x => x.id === t.project_id);
                return (
                  <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "12px 14px", marginBottom: 10, borderRight: `3px solid ${s.color}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t.title}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 6 }}>{s.icon} {s.label}</span>
                      <span style={{ fontSize: 11, color: p.color }}>{p.icon} {p.label}</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>👤 {t.assigned_to}</span>
                      {proj && <span style={{ fontSize: 11, color: "#9CA3AF" }}>📁 {proj.name}</span>}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Selected Day Detail */}
      {selectedDay && view === "month" && (
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>{selectedDay.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <button onClick={() => setSelectedDay(null)} style={{ background: "none", color: "#6B7280", fontSize: 18 }}>✕</button>
          </div>
          {getTasksForDate(selectedDay).length === 0
            ? <div style={{ textAlign: "center", color: "#4B5563", padding: "16px 0", fontSize: 13 }}>لا توجد تاسكات</div>
            : getTasksForDate(selectedDay).map(t => {
              const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.todo;
              const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
              return (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, borderRight: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: s.color }}>{s.icon} {s.label}</span>
                    <span style={{ fontSize: 11, color: p.color }}>{p.icon}</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>👤 {t.assigned_to}</span>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}
