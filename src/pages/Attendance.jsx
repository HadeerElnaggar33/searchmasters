import { useState, useEffect } from "react";
import { sb } from "../supabase.js";

export default function Attendance({ user }) {
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  useEffect(() => { loadAll(); }, [selectedDate]);

  async function loadAll() {
    setLoading(true);
    const [r, m] = await Promise.all([
      sb(`attendance?date=eq.${selectedDate}&order=clock_in`),
      sb("team_members?is_active=eq.true&order=name"),
    ]);
    if (r) setRecords(r);
    if (m) setMembers(m);
    setLoading(false);
  }

  function fmtTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDuration(mins) {
    if (!mins) return "—";
    return `${Math.floor(mins / 60)}س ${mins % 60}د`;
  }

  // Monthly summary
  const [monthRecords, setMonthRecords] = useState([]);
  const [showMonthly, setShowMonthly] = useState(false);
  const [selectedMember, setSelectedMember] = useState(user.name);

  async function loadMonthly() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const r = await sb(`attendance?member_name=eq.${encodeURIComponent(selectedMember)}&date=gte.${year}-${month}-01&order=date`);
    if (r) setMonthRecords(r);
    setShowMonthly(true);
  }

  const totalMinutes = monthRecords.reduce((s, r) => s + (r.working_minutes || 0), 0);
  const avgMinutes = monthRecords.length ? Math.round(totalMinutes / monthRecords.length) : 0;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>⏰ الحضور والانصراف</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#083793", padding: "8px 12px", borderRadius: 10, fontSize: 13, outline: "none" }} />
          <button onClick={loadMonthly} style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC", padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600 }}>📅 تقرير الشهر</button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>جاري التحميل...</div> : (
        <>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { l: "حاضر", v: records.length, c: "#10B981", i: "🟢" },
              { l: "غائب", v: members.length - records.length, c: "#EF4444", i: "🔴" },
              { l: "لا يزال يعمل", v: records.filter(r => !r.clock_out).length, c: "#3B82F6", i: "⚡" },
              { l: "أنهى العمل", v: records.filter(r => r.clock_out).length, c: "#6366F1", i: "✅" },
            ].map(s => (
              <div key={s.l} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${s.c}33`, borderRadius: 14, padding: "14px 12px", borderTop: `3px solid ${s.c}` }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{s.i}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Attendance Table */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 14, fontWeight: 700 }}>
              سجل {new Date(selectedDate + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {members.map(m => {
                const rec = records.find(r => r.member_name === m.name);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{m.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>{m.job_title || m.role}</div>
                    </div>
                    {rec ? (
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#10B981" }}>🟢 {fmtTime(rec.clock_in)}</span>
                        {rec.clock_out
                          ? <span style={{ fontSize: 12, color: "#EF4444" }}>🔴 {fmtTime(rec.clock_out)}</span>
                          : <span style={{ fontSize: 12, color: "#3B82F6" }}>⚡ لا يزال يعمل</span>
                        }
                        {rec.working_minutes && <span style={{ fontSize: 12, background: "rgba(99,102,241,0.15)", color: "#A5B4FC", padding: "2px 10px", borderRadius: 8 }}>⏱ {fmtDuration(rec.working_minutes)}</span>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.1)", padding: "4px 12px", borderRadius: 8 }}>غائب</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Monthly Report Modal */}
      {showMonthly && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowMonthly(false)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setShowMonthly(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800 }}>📅 تقرير الحضور الشهري</h3>
            <div style={{ marginBottom: 16 }}>
              <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#E2E8F0", padding: "8px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl", marginBottom: 10 }}>
                {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <button onClick={loadMonthly} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>عرض</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { l: "أيام الحضور", v: monthRecords.length, c: "#10B981" },
                { l: "إجمالي الساعات", v: `${Math.floor(totalMinutes / 60)}س`, c: "#6366F1" },
                { l: "متوسط اليوم", v: `${Math.floor(avgMinutes / 60)}س ${avgMinutes % 60}د`, c: "#F59E0B" },
              ].map(s => (
                <div key={s.l} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {monthRecords.map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, fontSize: 13 }}>
                  <span>{new Date(r.date + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span style={{ color: "#10B981" }}>{fmtTime(r.clock_in)}</span>
                  <span style={{ color: "#EF4444" }}>{fmtTime(r.clock_out)}</span>
                  <span style={{ color: "#A5B4FC", fontWeight: 700 }}>{fmtDuration(r.working_minutes)}</span>
                </div>
              ))}
              {monthRecords.length === 0 && <div style={{ textAlign: "center", color: "#4B5563", padding: 20 }}>لا توجد بيانات</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
