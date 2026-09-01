import { useState, useEffect, useRef } from "react";
import { sb } from "../supabase.js";

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

export default function Attendance({ user }) {
  const [todayRecord, setTodayRecord] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [showMonthly, setShowMonthly] = useState(false);
  const [monthRecords, setMonthRecords] = useState([]);
  const [selectedMember, setSelectedMember] = useState(user.name);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const isAdmin = user.role === "admin" || user.role === "team_leader";
  const today = getTodayStr();

  useEffect(() => { loadAll(); }, [selectedDate]);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    // Start live timer if user is currently working
    if (todayRecord && !todayRecord.clock_out) {
      const activeSession = sessions.find(s => s.member_name === user.name && !s.end_time);
      if (activeSession) {
        startTimer(activeSession.start_time);
      }
    }
  }, [todayRecord, sessions]);

  function startTimer(fromTime) {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - new Date(fromTime)) / 1000);
      setElapsed(secs);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerRef.current);
  }

  async function loadAll() {
    setLoading(true);
    const [att, m, sess] = await Promise.all([
      sb(`attendance?date=eq.${selectedDate}&order=created_at`),
      sb("team_members?is_active=eq.true&order=name"),
      sb(`attendance_sessions?date=eq.${selectedDate}&order=start_time`),
    ]);
    if (att) {
      setAllAttendance(att);
      const my = att.find(a => a.member_name === user.name);
      setTodayRecord(my || null);
    }
    if (m) setMembers(m);
    if (sess) setSessions(sess);
    setLoading(false);
  }

  // ── حساب إجمالي الساعات الفعلية من الـ sessions ──
  function calcTotalMinutes(memberName) {
    const memberSessions = sessions.filter(s => s.member_name === memberName && s.duration_minutes);
    return memberSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  }

  // ── بدء العمل ──
  async function clockIn() {
    if (todayRecord) return;
    const now = new Date().toISOString();
    const att = await sb("attendance", "POST", { member_name: user.name, date: today, clock_in: now, status: "present" });
    if (att?.[0]) {
      await sb("attendance_sessions", "POST", { attendance_id: att[0].id, member_name: user.name, date: today, start_time: now, type: "work" });
      startTimer(now);
      await loadAll();
    }
  }

  // ── إيقاف مؤقت ──
  async function pauseWork() {
    const activeSession = sessions.find(s => s.member_name === user.name && !s.end_time);
    if (!activeSession) return;
    const now = new Date();
    const mins = Math.floor((now - new Date(activeSession.start_time)) / 60000);
    await sb(`attendance_sessions?id=eq.${activeSession.id}`, "PATCH", { end_time: now.toISOString(), duration_minutes: mins });
    stopTimer();
    setElapsed(0);
    await loadAll();
  }

  // ── استكمال العمل ──
  async function resumeWork() {
    if (!todayRecord) return;
    const now = new Date().toISOString();
    await sb("attendance_sessions", "POST", { attendance_id: todayRecord.id, member_name: user.name, date: today, start_time: now, type: "work" });
    startTimer(now);
    await loadAll();
  }

  // ── إنهاء العمل ──
  async function clockOut() {
    if (!todayRecord) return;
    // أغلق أي session مفتوحة
    const activeSession = sessions.find(s => s.member_name === user.name && !s.end_time);
    const now = new Date();
    if (activeSession) {
      const mins = Math.floor((now - new Date(activeSession.start_time)) / 60000);
      await sb(`attendance_sessions?id=eq.${activeSession.id}`, "PATCH", { end_time: now.toISOString(), duration_minutes: mins });
    }
    // احسب الإجمالي
    const updatedSessions = await sb(`attendance_sessions?attendance_id=eq.${todayRecord.id}`);
    const totalMins = (updatedSessions || []).reduce((s, x) => s + (x.duration_minutes || 0), 0);
    await sb(`attendance?id=eq.${todayRecord.id}`, "PATCH", { clock_out: now.toISOString(), working_minutes: totalMins });
    stopTimer();
    setElapsed(0);
    await loadAll();
  }

  // ── حالة العمل الحالية ──
  const myRecord = todayRecord;
  const activeSession = sessions.find(s => s.member_name === user.name && !s.end_time);
  const isWorking = !!activeSession;
  const isPaused = myRecord && !myRecord.clock_out && !activeSession;
  const isFinished = myRecord?.clock_out;
  const totalToday = calcTotalMinutes(user.name);

  // ── عرض المؤقت ──
  function fmtElapsed(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  async function loadMonthly() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const r = await sb(`attendance?member_name=eq.${encodeURIComponent(selectedMember)}&date=gte.${year}-${month}-01&order=date`);
    if (r) setMonthRecords(r);
    setShowMonthly(true);
  }

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "8px 12px", borderRadius: 8, fontSize: 13, outline: "none" };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>⏰ الحضور والانصراف</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={inp} />
          <button onClick={loadMonthly} style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>📅 تقرير الشهر</button>
        </div>
      </div>

      {/* ── بطاقة بدء/إيقاف/استكمال/إنهاء ── */}
      {selectedDate === today && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>ساعات العمل اليوم</div>
              {/* Live timer */}
              {isWorking && (
                <div style={{ fontSize: 32, fontWeight: 900, color: "#2563EB", fontVariantNumeric: "tabular-nums", letterSpacing: 2 }}>
                  {fmtElapsed(elapsed)}
                </div>
              )}
              {!isWorking && myRecord && (
                <div style={{ fontSize: 24, fontWeight: 800, color: isFinished ? "#059669" : "#D97706" }}>
                  {fmtDuration(totalToday)}
                  {isPaused && <span style={{ fontSize: 13, color: "#D97706", marginRight: 8 }}>⏸ متوقف مؤقتاً</span>}
                  {isFinished && <span style={{ fontSize: 13, color: "#059669", marginRight: 8 }}>✅ انتهى العمل</span>}
                </div>
              )}
              {!myRecord && <div style={{ fontSize: 14, color: "#94A3B8" }}>لم تبدأ العمل بعد</div>}
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!myRecord && (
                <button onClick={clockIn} style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700, boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                  🟢 بدء العمل
                </button>
              )}
              {isWorking && (
                <button onClick={pauseWork} style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#fff", padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700, boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}>
                  ⏸ إيقاف مؤقت
                </button>
              )}
              {isPaused && (
                <button onClick={resumeWork} style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                  ▶ استكمال العمل
                </button>
              )}
              {(isWorking || isPaused) && (
                <button onClick={clockOut} style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700, boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}>
                  🔴 إنهاء العمل
                </button>
              )}
            </div>
          </div>

          {/* Sessions timeline */}
          {sessions.filter(s => s.member_name === user.name).length > 0 && (
            <div style={{ marginTop: 20, borderTop: "1px solid #F1F5F9", paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#64748B", marginBottom: 10 }}>سجل الجلسات اليوم</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sessions.filter(s => s.member_name === user.name).map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#F8FAFC", borderRadius: 10, padding: "8px 14px", border: "1px solid #E2E8F0" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.end_time ? "#ECFDF5" : "#EFF6FF", border: `2px solid ${s.end_time ? "#059669" : "#2563EB"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: s.end_time ? "#059669" : "#2563EB", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>
                        {fmtTime(s.start_time)} → {s.end_time ? fmtTime(s.end_time) : <span style={{ color: "#2563EB" }}>جاري الآن</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.end_time ? "#059669" : "#2563EB" }}>
                      {s.duration_minutes ? fmtDuration(s.duration_minutes) : "—"}
                    </div>
                  </div>
                ))}
              </div>
              {totalToday > 0 && (
                <div style={{ marginTop: 10, background: "#EFF6FF", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>إجمالي الساعات الفعلية</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#2563EB" }}>{fmtDuration(totalToday)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── إحصائيات اليوم ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { l: "حاضر", v: allAttendance.length, c: "#059669", i: "🟢" },
          { l: "غائب", v: members.length - allAttendance.length, c: "#DC2626", i: "🔴" },
          { l: "لا يزال يعمل", v: allAttendance.filter(a => !a.clock_out).length, c: "#2563EB", i: "⚡" },
          { l: "أنهى العمل", v: allAttendance.filter(a => a.clock_out).length, c: "#059669", i: "✅" },
        ].map(s => (
          <div key={s.l} style={{ background: "#FFFFFF", border: `1px solid ${s.c}22`, borderRadius: 14, padding: "14px 12px", borderTop: `3px solid ${s.c}`, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.i}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── جدول الحضور ── */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #E2E8F0", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
          سجل {new Date(selectedDate + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        {members.map(m => {
          const rec = allAttendance.find(a => a.member_name === m.name);
          const memberSessions = sessions.filter(s => s.member_name === m.name);
          const totalMins = memberSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
          const hasActive = memberSessions.some(s => !s.end_time);
          return (
            <div key={m.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", flexWrap: "wrap" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0, color: "#fff" }}>{m.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{m.name}</div>
                </div>
                {rec ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#059669", background: "#ECFDF5", padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>🟢 {fmtTime(rec.clock_in)}</span>
                    {rec.clock_out
                      ? <span style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>🔴 {fmtTime(rec.clock_out)}</span>
                      : hasActive
                        ? <span style={{ fontSize: 12, color: "#2563EB", background: "#EFF6FF", padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>⚡ يعمل الآن</span>
                        : <span style={{ fontSize: 12, color: "#D97706", background: "#FFFBEB", padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>⏸ متوقف مؤقتاً</span>
                    }
                    {totalMins > 0 && (
                      <span style={{ fontSize: 12, background: "#EFF6FF", color: "#2563EB", padding: "3px 10px", borderRadius: 8, fontWeight: 700 }}>⏱ {fmtDuration(totalMins)}</span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", padding: "4px 12px", borderRadius: 8, fontWeight: 600 }}>غائب</span>
                )}
              </div>
              {/* Sessions breakdown for admin */}
              {isAdmin && memberSessions.length > 0 && (
                <div style={{ padding: "0 16px 12px 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {memberSessions.map((s, i) => (
                    <span key={s.id} style={{ fontSize: 11, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "2px 10px", color: "#64748B" }}>
                      جلسة {i+1}: {fmtTime(s.start_time)}–{s.end_time ? fmtTime(s.end_time) : "جاري"} {s.duration_minutes ? `(${fmtDuration(s.duration_minutes)})` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Monthly Report Modal ── */}
      {showMonthly && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowMonthly(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowMonthly(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>📅 تقرير الحضور الشهري</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} style={{ ...inp, flex: 1 }}>
                {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <button onClick={loadMonthly} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>عرض</button>
            </div>
            {monthRecords.length > 0 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { l: "أيام الحضور", v: monthRecords.length, c: "#059669" },
                    { l: "إجمالي الساعات", v: `${Math.floor(monthRecords.reduce((s,r)=>s+(r.working_minutes||0),0)/60)}س`, c: "#2563EB" },
                    { l: "متوسط اليوم", v: (() => { const avg = monthRecords.length ? Math.round(monthRecords.reduce((s,r)=>s+(r.working_minutes||0),0)/monthRecords.length) : 0; return `${Math.floor(avg/60)}س ${avg%60}د`; })(), c: "#D97706" },
                  ].map(s => (
                    <div key={s.l} style={{ background: "#F8FAFC", borderRadius: 12, padding: 14, textAlign: "center", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {monthRecords.map(r => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#F8FAFC", borderRadius: 10, fontSize: 13, border: "1px solid #F1F5F9" }}>
                      <span style={{ color: "#0F172A", fontWeight: 500 }}>{new Date(r.date + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span style={{ color: "#059669", fontWeight: 600 }}>{fmtTime(r.clock_in)}</span>
                      <span style={{ color: "#DC2626", fontWeight: 600 }}>{r.clock_out ? fmtTime(r.clock_out) : "—"}</span>
                      <span style={{ color: "#2563EB", fontWeight: 700 }}>{fmtDuration(r.working_minutes)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {monthRecords.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", padding: 30 }}>لا توجد بيانات لهذا الشهر</div>}
          </div>
        </div>
      )}
    </div>
  );
}
