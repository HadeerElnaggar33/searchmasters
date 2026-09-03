import { useState, useEffect } from "react";
import { sb } from "../supabase.js";
import { buildBlocks, presenceOf, fmtDur, fmtClock, toISODate } from "../timer.js";
import { loadWorkConfig, isWorkingDay, dayKind } from "../workdays.js";

function fmtTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

export default function Live({ user }) {
  const [members, setMembers] = useState([]);
  const [timers, setTimers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [cfg, setCfg] = useState({ workingDays: [0, 1, 2, 3, 4], holidays: [] });
  const [hours, setHours] = useState({ start: 10, end: 18, idle: 180 });
  const [date, setDate] = useState(toISODate());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [now, setNow] = useState(new Date());

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };
  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", direction: "rtl" };

  useEffect(() => { if (isAdmin) loadAll(); else setLoading(false); }, [date]);

  // تحديث تلقائي كل 30 ثانية لليوم الحالي
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => {
      setNow(new Date());
      if (date === toISODate()) loadAll(true);
    }, 30000);
    return () => clearInterval(t);
  }, [date, isAdmin]);

  async function loadAll(silent) {
    if (!silent) setLoading(true);
    const [m, tm, att, tk, c, st] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      sb(`task_timers?work_date=eq.${date}&order=started_at`),
      sb(`attendance?date=eq.${date}`),
      sb("tasks?select=id,title,status,completed_at,project_id"),
      loadWorkConfig(),
      sb("app_settings?select=key,value"),
    ]);
    if (m) setMembers(m);
    if (tm) setTimers(tm);
    if (att) setAttendance(att);
    if (tk) setTasks(tk);
    if (c) setCfg(c);
    if (st) {
      const g = (k, d) => { const r = st.find(x => x.key === k); return r ? Number(r.value) : d; };
      setHours({ start: g("work_hour_start", 10), end: g("work_hour_end", 18), idle: g("idle_after_minutes", 180) });
    }
    setLoading(false);
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, maxWidth: 700, margin: "0 auto" }}>
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>
          🔒 الشاشة دي للمدير فقط
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const isToday = date === toISODate();
  const kind = dayKind(date, cfg);

  function dataOf(name) {
    const my = timers.filter(t => t.member_name === name);
    const att = attendance.find(a => a.member_name === name);
    const onLeave = att && att.status === "leave";
    const blocks = buildBlocks(my);
    const running = my.find(t => !t.ended_at) || null;
    const totalMins = my.reduce((s, t) => s + (Number(t.duration_minutes) || (t.ended_at ? 0 : Math.round((now - new Date(t.started_at)) / 60000))), 0);
    const firstStart = my.length ? my[0].started_at : null;
    const lastAct = my.length ? (my[my.length - 1].ended_at || my[my.length - 1].started_at) : null;

    // التاسكات اللي اتقفلت النهاردة
    const closed = tasks.filter(t => t.status === "completed" && String(t.completed_at || "").slice(0, 10) === date &&
      my.some(x => String(x.task_id) === String(t.id)));

    // شغل مسائي = جلسة بدأت بره ساعات العمل
    const evening = my.filter(t => {
      const h = new Date(t.started_at).getHours();
      return h < hours.start || h >= hours.end;
    }).length;

    return { my, blocks, running, totalMins, firstStart, lastAct, closed, evening, onLeave, offDay: !isWorkingDay(date, cfg) };
  }

  const taskTitle = id => tasks.find(t => String(t.id) === String(id))?.title;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>👁 متابعة الفريق</h2>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }} />
      </div>

      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.8 }}>
        ℹ️ البيانات دي من نشاط الأداة، <b>مستقلة تماماً عن سجل الحضور والانصراف</b> ومش بديل عنه · ساعات التارجت لسه محسوبة من الحضور · <b>مالهاش أي علاقة بترشيح موظف الشهر</b> · الفريق متبلّغ إن نشاطه بيتسجّل
        {isToday && <> · التحديث تلقائي كل 30 ثانية</>}
      </div>

      {kind.type !== "work" && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#D97706", marginBottom: 16, fontWeight: 600 }}>
          {kind.icon} {kind.label} — أي شغل مسجّل النهاردة محسوب زيادة
        </div>
      )}

      {members.map(m => {
        const d = dataOf(m.name);
        const p = presenceOf(m.last_seen, hours.idle, now);
        const isOpen = open === m.name;

        return (
          <div key={m.id} style={{ ...card, marginBottom: 12, borderRight: `4px solid ${p.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {m.name}
                  {isToday && <span style={{ fontSize: 11, color: p.color, fontWeight: 700 }}>{p.icon} {p.label}</span>}
                  {d.onLeave && <span style={{ fontSize: 10, background: "#F5F3FF", color: "#7C3AED", border: "1px solid #DDD6FE", padding: "1px 8px", borderRadius: 20, fontWeight: 700 }}>🏖 في إجازة</span>}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                  {isToday && m.last_seen ? `آخر ظهور ${fmtTime(m.last_seen)} · ` : ""}
                  بداية اليوم {fmtTime(d.firstStart)} · آخر نشاط {fmtTime(d.lastAct)}
                </div>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{fmtDur(d.totalMins)}</div>
                <div style={{ fontSize: 9, color: "#94A3B8" }}>وقت مسجّل</div>
              </div>
            </div>

            {/* التاسك الشغالة دلوقتي */}
            {d.running ? (
              <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12, padding: "10px 14px", marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16 }}>⏱</span>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{d.running.task_title}</div>
                  {d.running.project_name && <div style={{ fontSize: 11, color: "#64748B" }}>📁 {d.running.project_name}</div>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
                  {fmtClock(Math.floor((now - new Date(d.running.started_at)) / 1000))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10 }}>مفيش تاسك شغالة دلوقتي</div>
            )}

            {/* أرقام سريعة */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(76px,1fr))", gap: 6, marginTop: 12 }}>
              {[
                { l: "بلوكات", v: d.blocks.length, c: "#2563EB" },
                { l: "جلسات", v: d.my.length, c: "#7C3AED" },
                { l: "تاسكات اتقفلت", v: d.closed.length, c: "#059669" },
                { l: "شغل مسائي", v: d.evening, c: "#DB2777" },
              ].map(x => (
                <div key={x.l} style={{ textAlign: "center", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "7px 4px" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: x.c }}>{x.v}</div>
                  <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>{x.l}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setOpen(isOpen ? null : m.name)}
              style={{ width: "100%", background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, marginTop: 10 }}>
              {isOpen ? "إخفاء الـ Timeline ▲" : "Timeline اليوم ▼"}
            </button>

            {isOpen && (
              <div style={{ marginTop: 12 }}>
                {d.blocks.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: 14 }}>مفيش نشاط مسجّل في اليوم ده</div>
                ) : d.blocks.map((b, i) => {
                  const evening = b.start.getHours() < hours.start || b.start.getHours() >= hours.end;
                  return (
                    <div key={i} style={{ background: "#F8FAFC", border: `1px solid ${evening || d.offDay || d.onLeave ? "#FBCFE8" : "#E2E8F0"}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#64748B", padding: "1px 8px", borderRadius: 6, fontWeight: 700 }}>بلوك {i + 1}</span>
                        <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 600 }}>
                          {fmtTime(b.start)} → {fmtTime(b.end)}
                        </span>
                        <span style={{ fontSize: 12, color: "#2563EB", fontWeight: 700 }}>{fmtDur(b.minutes)}</span>
                        {(evening || d.offDay || d.onLeave) && (
                          <span style={{ fontSize: 10, background: "#FDF2F8", color: "#DB2777", border: "1px solid #FBCFE8", padding: "1px 8px", borderRadius: 20, fontWeight: 700 }}>
                            {d.onLeave ? "شغل في إجازة" : d.offDay ? "يوم إجازة" : "مسائي"}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                        {b.tasks.length} تاسك في البلوك ده
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {b.sessions.map(sn => (
                          <div key={sn.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
                            <span style={{ color: "#94A3B8", fontSize: 11, minWidth: 84 }}>
                              {fmtTime(sn.started_at)} {sn.ended_at ? `→ ${fmtTime(sn.ended_at)}` : "→ شغال"}
                            </span>
                            <span style={{ flex: 1, color: "#0F172A", minWidth: 0 }}>{sn.task_title || taskTitle(sn.task_id) || "—"}</span>
                            {sn.duration_minutes != null && <span style={{ color: "#2563EB", fontWeight: 700 }}>{fmtDur(sn.duration_minutes)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {d.closed.length > 0 && (
                  <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6 }}>✅ اتقفلت في اليوم ده</div>
                    {d.closed.map(t => (
                      <div key={t.id} style={{ fontSize: 12, color: "#0F172A", padding: "3px 0" }}>
                        {t.title} <span style={{ color: "#94A3B8", fontSize: 11 }}>· {fmtTime(t.completed_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
