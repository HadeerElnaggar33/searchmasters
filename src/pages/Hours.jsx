import { useState, useEffect } from "react";
import { sb, MONTHS, CURRENT_MONTH } from "../supabase.js";
import { loadWorkConfig, isWorkingDay, countWorkingDays } from "../workdays.js";

const DEFAULTS = { dailyHours: 8, minSession: 15 };

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthRange(monthStr) {
  const parts = String(monthStr || "").split(" ");
  const mi = MONTHS.indexOf(parts[0]);
  const y = Number(parts[1]);
  if (mi < 0 || !y) return null;
  const mm = String(mi + 1).padStart(2, "0");
  const last = new Date(y, mi + 1, 0).getDate();
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function fmtH(mins) {
  const sign = mins < 0 ? "-" : "";
  const m = Math.abs(Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${sign}${h}س${r ? ` ${r}د` : ""}`;
}

// كل تواريخ الإجازة المعتمدة داخل فترة معيّنة
function leaveDatesInRange(reqs, name, start, end, cfg) {
  const map = new Map();  // date → 1 أو 0.5
  for (const r of reqs) {
    if (r.member_name !== name || r.status !== "approved") continue;
    const s = String(r.start_date).slice(0, 10);
    const e = String(r.end_date).slice(0, 10);
    const cur = new Date(s + "T00:00:00");
    const stop = new Date(e + "T00:00:00");
    let guard = 0;
    while (cur <= stop && guard < 400) {
      const d = toISO(cur);
      if (d >= start && d <= end && isWorkingDay(d, cfg)) {
        map.set(d, r.is_half_day ? 0.5 : 1);
      }
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
  }
  return map;
}

export default function Hours({ user }) {
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [cfg, setCfg] = useState({ workingDays: [0, 1, 2, 3, 4], holidays: [] });
  const [rules, setRules] = useState(DEFAULTS);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sForm, setSForm] = useState({ dailyHours: "8", minSession: "15" });

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };

  useEffect(() => { loadAll(); }, [selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const r = monthRange(selectedMonth);
    const [m, a, s, lv, c, st] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      r ? sb(`attendance?date=gte.${r.start}&date=lte.${r.end}`) : Promise.resolve([]),
      r ? sb(`attendance_sessions?date=gte.${r.start}&date=lte.${r.end}`) : Promise.resolve([]),
      sb("leave_requests?status=eq.approved"),
      loadWorkConfig(),
      sb("app_settings?select=key,value"),
    ]);
    if (m) setMembers(m);
    if (a) setAttendance(a);
    if (s) setSessions(s);
    if (lv) setLeaves(lv);
    if (c) setCfg(c);
    if (st) {
      const g = (k, d) => { const row = st.find(x => x.key === k); return row ? Number(row.value) : d; };
      const next = { dailyHours: g("daily_hours", DEFAULTS.dailyHours), minSession: g("min_session_minutes", DEFAULTS.minSession) };
      setRules(next);
      setSForm({ dailyHours: String(next.dailyHours), minSession: String(next.minSession) });
    }
    setLoading(false);
  }

  // ═══ الحساب الأساسي لكل عضو ═══
  function statsOf(name) {
    const r = monthRange(selectedMonth);
    if (!r) return null;

    const myAtt = attendance.filter(a => a.member_name === name);
    const mySess = sessions.filter(s => s.member_name === name);
    const leaveMap = leaveDatesInRange(leaves, name, r.start, r.end, cfg);

    // الأيام اللي فيها أي تسجيل
    const dates = new Set([
      ...myAtt.map(a => String(a.date).slice(0, 10)),
      ...mySess.map(s => String(s.date).slice(0, 10)),
    ]);

    let regularMins = 0;      // على أيام العمل
    let extraMins = 0;        // على أيام الإجازة الأسبوعية/الرسمية/إجازة معتمدة
    let ignoredMins = 0;      // جلسات أقل من الحد
    let ignoredCount = 0;
    let presentDays = 0;
    const daily = [];

    for (const d of [...dates].sort()) {
      const att = myAtt.find(a => String(a.date).slice(0, 10) === d);
      if (att && att.status === "leave" && !mySess.some(s => String(s.date).slice(0, 10) === d)) {
        daily.push({ date: d, mins: 0, kind: "leave", ignored: 0 });
        continue;
      }

      const dSess = mySess.filter(s => String(s.date).slice(0, 10) === d && s.duration_minutes != null);
      let mins = 0, ign = 0, ignN = 0;

      if (dSess.length > 0) {
        for (const s of dSess) {
          const v = Number(s.duration_minutes) || 0;
          if (v >= rules.minSession) mins += v;
          else { ign += v; ignN++; }
        }
      } else if (att) {
        mins = Number(att.working_minutes) || 0;
      }

      ignoredMins += ign;
      ignoredCount += ignN;
      if (mins <= 0) continue;

      const onLeave = leaveMap.has(d) || (att && att.status === "leave");
      const workDay = isWorkingDay(d, cfg);
      const kind = onLeave ? "leaveWork" : workDay ? "work" : "offDay";

      if (kind === "work") { regularMins += mins; presentDays++; }
      else extraMins += mins;

      daily.push({ date: d, mins, kind, ignored: ignN });
    }

    // التارجت
    const workDays = countWorkingDays(r.start, r.end, cfg);
    let leaveDays = 0;
    for (const v of leaveMap.values()) leaveDays += v;
    const targetDays = Math.max(0, workDays - leaveDays);
    const targetMins = targetDays * rules.dailyHours * 60;

    const pct = targetMins > 0 ? Math.round((regularMins / targetMins) * 100) : 0;
    const diff = regularMins - targetMins;
    const avg = presentDays ? Math.round(regularMins / presentDays) : 0;

    return {
      workDays, leaveDays, targetDays, targetMins,
      regularMins, extraMins, ignoredMins, ignoredCount,
      presentDays, avg, pct, diff, daily,
    };
  }

  async function saveSettings() {
    const dh = Math.max(1, Math.min(24, Number(sForm.dailyHours) || DEFAULTS.dailyHours));
    const ms = Math.max(0, Math.min(120, Number(sForm.minSession) || DEFAULTS.minSession));
    for (const [k, v] of [["daily_hours", String(dh)], ["min_session_minutes", String(ms)]]) {
      const ex = await sb(`app_settings?key=eq.${k}`);
      if (ex && ex.length) await sb(`app_settings?key=eq.${k}`, "PATCH", { value: v });
      else await sb("app_settings", "POST", { key: k, value: v });
    }
    setShowSettings(false);
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const KIND = {
    work:      { icon: "💼", label: "يوم عمل",       color: "#2563EB" },
    offDay:    { icon: "🌙", label: "إجازة أسبوعية", color: "#7C3AED" },
    leaveWork: { icon: "🏖", label: "شغل في إجازة",  color: "#DB2777" },
    leave:     { icon: "🏖", label: "في إجازة",      color: "#7C3AED" },
  };

  // ═══ بطاقة عضو ═══
  const MemberCard = ({ name, avatar, isMe }) => {
    const st = statsOf(name);
    if (!st) return null;
    const open = expanded === name;
    const barPct = Math.min(100, Math.max(0, st.pct));
    const barColor = st.pct >= 100 ? "#059669" : st.pct >= 75 ? "#2563EB" : st.pct >= 50 ? "#D97706" : "#DC2626";

    return (
      <div style={{ ...card, marginBottom: 12, borderRight: isMe ? "4px solid #2563EB" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: avatar || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{name}{isMe ? " (إنتي)" : ""}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{st.presentDays} يوم حضور من {st.targetDays} يوم تارجت</div>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: barColor }}>{st.pct}%</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>تحقيق التارجت</div>
          </div>
        </div>

        <div style={{ background: "#F1F5F9", borderRadius: 8, height: 10, overflow: "hidden", marginBottom: 6 }}>
          <div style={{ width: barPct + "%", height: "100%", background: barColor, borderRadius: 8, transition: "width 0.5s" }}></div>
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 14 }}>
          <b style={{ color: "#0F172A" }}>{fmtH(st.regularMins)}</b> من <b style={{ color: "#0F172A" }}>{fmtH(st.targetMins)}</b>
          {st.diff >= 0
            ? <span style={{ color: "#059669", fontWeight: 700 }}> · زيادة {fmtH(st.diff)}</span>
            : <span style={{ color: "#DC2626", fontWeight: 700 }}> · ناقص {fmtH(-st.diff)}</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(84px,1fr))", gap: 6, marginBottom: 12 }}>
          {[
            { l: "أيام عمل بالشهر", v: st.workDays, c: "#0F172A" },
            { l: "أيام إجازة", v: st.leaveDays, c: "#7C3AED" },
            { l: "التارجت", v: fmtH(st.targetMins), c: "#2563EB" },
            { l: "المسجّل", v: fmtH(st.regularMins), c: "#059669" },
            { l: "متوسط اليوم", v: fmtH(st.avg), c: "#0F172A" },
            { l: "ساعات زيادة", v: fmtH(st.extraMins), c: "#DB2777" },
          ].map(x => (
            <div key={x.l} style={{ textAlign: "center", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 4px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>{x.l}</div>
            </div>
          ))}
        </div>

        {st.leaveDays > 0 && (
          <div style={{ fontSize: 11, color: "#7C3AED", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            🏖 التارجت اتخفّض {st.leaveDays} يوم مقابل الإجازات المعتمدة ({st.workDays} − {st.leaveDays} = {st.targetDays} يوم)
          </div>
        )}

        {st.extraMins > 0 && (
          <div style={{ fontSize: 11, color: "#DB2777", background: "#FDF2F8", border: "1px solid #FBCFE8", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            ⭐ {fmtH(st.extraMins)} شغل خارج أيام العمل — محسوبة زيادة، وبره التارجت
          </div>
        )}

        {st.ignoredCount > 0 && (
          <div style={{ fontSize: 11, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            ⚠️ {st.ignoredCount} جلسة أقل من {rules.minSession} دقيقة ({fmtH(st.ignoredMins)}) — مستبعدة كتسجيل بالخطأ
          </div>
        )}

        <button onClick={() => setExpanded(open ? null : name)}
          style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, width: "100%" }}>
          {open ? "إخفاء التفاصيل ▲" : `تفاصيل الأيام (${st.daily.length}) ▼`}
        </button>

        {open && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {st.daily.length === 0 && <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: 10 }}>مفيش أيام مسجلة</div>}
            {st.daily.map(d => {
              const k = KIND[d.kind] || KIND.work;
              return (
                <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
                  <span>{k.icon}</span>
                  <span style={{ color: "#0F172A", minWidth: 92 }}>
                    {new Date(d.date + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span style={{ color: k.color, fontSize: 11, flex: 1 }}>{k.label}</span>
                  {d.ignored > 0 && <span style={{ fontSize: 10, color: "#D97706" }}>⚠️ {d.ignored}</span>}
                  <span style={{ fontWeight: 700, color: d.kind === "work" ? "#059669" : k.color }}>{d.mins ? fmtH(d.mins) : "—"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const me = members.find(m => m.name === user.name);
  const others = members.filter(m => m.name !== user.name);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>⏱ الساعات والتارجت</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
            {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
          </select>
          {isAdmin && (
            <button onClick={() => setShowSettings(true)} style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>⚙️</button>
          )}
        </div>
      </div>

      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.8 }}>
        📌 <b>القاعدة:</b> اليوم الكامل {rules.dailyHours} ساعات شاملة البريك · التارجت = أيام العمل بالشهر ناقص أيام الإجازة المعتمدة × {rules.dailyHours} · الجلسات الأقل من {rules.minSession} دقيقة مستبعدة · الشغل خارج أيام العمل محسوب <b>زيادة</b> وبره التارجت
      </div>

      {me && <MemberCard name={me.name} avatar={me.avatar_color} isMe />}

      {isAdmin && others.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "20px 0 12px" }}>👥 الفريق</div>
          {others.map(m => <MemberCard key={m.id} name={m.name} avatar={m.avatar_color} />)}
        </>
      )}

      {!me && !isAdmin && (
        <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 40, fontSize: 13 }}>مفيش بيانات ساعات ليك</div>
      )}

      {/* ═══ الإعدادات ═══ */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowSettings(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>⚙️ إعدادات الساعات</h3>

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>ساعات اليوم الكامل</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>شاملة البريك</div>
            <input type="number" min="1" max="24" value={sForm.dailyHours} onChange={e => setSForm(f => ({ ...f, dailyHours: e.target.value }))} style={{ ...inp, marginBottom: 16 }} />

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>أقل مدة جلسة تُحتسب (دقيقة)</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>اللي أقل من كده يُعتبر تسجيل بالخطأ</div>
            <input type="number" min="0" max="120" value={sForm.minSession} onChange={e => setSForm(f => ({ ...f, minSession: e.target.value }))} style={{ ...inp, marginBottom: 20 }} />

            <button onClick={saveSettings} style={{ width: "100%", background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>حفظ ✓</button>
          </div>
        </div>
      )}
    </div>
  );
}
