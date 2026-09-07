import { useState, useEffect } from "react";
import { sb, formatDate, addNotification, CURRENT_MONTH } from "../supabase.js";
import { UNIT_STATUS, REVIEW_STATES, parseList, roleIn, canGrade, unitProgress, recordOf, lateTrainees, traineeStats, loadTraining } from "../training.js";
import { addScore } from "../score.js";
import Stars from "../utils/Stars.jsx";
import RichText from "../utils/RichText.jsx";

export default function Training({ user }) {
  const [units, setUnits] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [cfg, setCfg] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("plan");

  const [unitOpen, setUnitOpen] = useState(null);
  const [sessionOpen, setSessionOpen] = useState(null);
  const [unitForm, setUnitForm] = useState(null);
  const [sessForm, setSessForm] = useState(null);
  const [submitFor, setSubmitFor] = useState(null);
  const [submitText, setSubmitText] = useState("");

  const isAdmin = user.role === "admin";

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "9px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 14 };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [t, m, st] = await Promise.all([
      loadTraining(),
      sb("team_members?is_active=eq.true&order=name"),
      sb("app_settings?select=key,value"),
    ]);
    setUnits(t.units); setSessions(t.sessions); setRecords(t.records);
    if (m) setMembers(m);
    if (st) { const o = {}; st.forEach(x => { o[x.key] = x.value; }); setCfg(o); }
    setLoading(false);
  }

  // ── هل أنا مدرب في أي وحدة؟ ──
  const iTrainSomething = isAdmin || units.some(u => String(u.trainer || "").trim() === user.name);

  function emptyUnit() {
    return { week_no: units.length + 1, week_dates: "", skill: "", material_url: "", trainer: user.name,
      trainees: [], format: "سيشن شرح + مهمة فعلية", task_text: "", clients: "", status: "todo", session_date: "" };
  }

  async function saveUnit() {
    const f = unitForm;
    if (!f.skill.trim()) { alert("اكتبي اسم المهارة"); return; }
    setSaving(true);
    const payload = {
      week_no: Number(f.week_no) || null, week_dates: f.week_dates || null,
      skill: f.skill.trim(), material_url: f.material_url || null,
      trainer: f.trainer || null, trainees: (f.trainees || []).join(", "),
      format: f.format || null, task_text: f.task_text || null,
      clients: f.clients || null, status: f.status || "todo",
      session_date: f.session_date || null,
    };
    if (f.id) await sb(`training_units?id=eq.${f.id}`, "PATCH", payload);
    else await sb("training_units", "POST", { ...payload, created_by: user.name });

    for (const t of (f.trainees || [])) {
      if (t !== user.name) await addNotification(t, `🎓 اتضافت لك وحدة تدريبية: ${f.skill.trim()}`, "info");
    }
    setSaving(false); setUnitForm(null); await load();
  }

  function emptySession(unitId) {
    const u = units.find(x => String(x.id) === String(unitId));
    return { unit_id: unitId || "", title: "", session_date: new Date().toISOString().slice(0, 10),
      trainer: (u && u.trainer) || user.name, covered: "", recording_url: "", files: "",
      invited: u ? parseList(u.trainees) : [] };
  }

  async function saveSession() {
    const f = sessForm;
    if (!f.title.trim()) { alert("اكتبي عنوان السيشن"); return; }
    if (!f.session_date) { alert("حددي تاريخ السيشن"); return; }
    setSaving(true);
    const payload = {
      unit_id: f.unit_id ? String(f.unit_id) : null,
      title: f.title.trim(), session_date: f.session_date,
      trainer: f.trainer || user.name, covered: f.covered || null,
      recording_url: f.recording_url || null, files: f.files || null,
      invited: (f.invited || []).join(", "),
    };
    if (f.id) await sb(`training_sessions?id=eq.${f.id}`, "PATCH", payload);
    else {
      const created = await sb("training_sessions", "POST", { ...payload, created_by: user.name });
      const sid = created && created[0] ? created[0].id : null;
      if (sid) {
        for (const t of (f.invited || [])) {
          await sb("training_records", "POST", { session_id: String(sid), unit_id: payload.unit_id, trainee: t });
          if (t !== user.name) await addNotification(t, `🎓 سيشن جديد ${formatDate(f.session_date)}: ${payload.title}`, "info");
        }
      }
    }
    setSaving(false); setSessForm(null); await load();
  }

  // ── المدرب بيسجّل الحضور والتقييم ──
  async function setRecord(sessionId, trainee, changes) {
    const cur = recordOf(records, sessionId, trainee);
    if (cur) await sb(`training_records?id=eq.${cur.id}`, "PATCH", changes);
    else await sb("training_records", "POST", { session_id: String(sessionId), trainee, ...changes });
    setRecords(list => {
      const i = list.findIndex(r => String(r.session_id) === String(sessionId) && r.trainee === trainee);
      if (i >= 0) { const c = [...list]; c[i] = { ...c[i], ...changes }; return c; }
      return [...list, { id: `tmp${Date.now()}`, session_id: String(sessionId), trainee, ...changes }];
    });
  }

  async function grade(sessionId, trainee, rating, state) {
    await setRecord(sessionId, trainee, {
      rating, review_state: state, graded_by: user.name, graded_at: new Date().toISOString(),
    });
    const pts = state === "approved"
      ? (Number(cfg.pts_training_rating5) || 3)
      : 0;
    if (pts > 0 && rating >= 4) {
      await addScore({ member: trainee, month: CURRENT_MONTH, points: pts, source: "medal",
        reason: `تدريب — تسليم ممتاز`, by: user.name });
    }
    await addNotification(trainee,
      state === "redo" ? `🔁 تسليمك في التدريب محتاج إعادة` : `✅ تسليمك في التدريب اتقبل · تقييم ${rating}/5`,
      "info");
  }

  async function markAttendance(sessionId, trainee, attended) {
    await setRecord(sessionId, trainee, { attended });
    if (attended) {
      const pts = Number(cfg.pts_training_attend) || 1;
      if (pts > 0) await addScore({ member: trainee, month: CURRENT_MONTH, points: pts, source: "medal", reason: "حضور سيشن تدريب", by: user.name });
    }
  }

  async function submitWork() {
    if (!submitText.trim() || !submitFor) return;
    setSaving(true);
    await setRecord(submitFor.session_id, user.name, {
      submitted: true, submission: submitText.trim(),
      submitted_at: new Date().toISOString(), review_state: "pending",
    });
    const pts = Number(cfg.pts_training_submit) || 2;
    if (pts > 0) await addScore({ member: user.name, month: CURRENT_MONTH, points: pts, source: "medal", reason: "تسليم مهمة تدريب", by: user.name });
    const s = sessions.find(x => String(x.id) === String(submitFor.session_id));
    if (s && s.trainer) await addNotification(s.trainer, `📤 ${user.name} سلّم مهمة «${s.title}»`, "review");
    setSaving(false); setSubmitFor(null); setSubmitText("");
    await load();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const myUnits = units.filter(u => parseList(u.trainees).includes(user.name));
  const currentUnit = myUnits.find(u => u.status === "active") || myUnits[0] || null;
  const myRecords = records.filter(r => r.trainee === user.name);
  const stats = traineeStats(records, user.name);

  const TABS = [
    ["plan", "📚 خطة التدريب"],
    ["sessions", "🗓 سجل السيشنز"],
    ["mine", "🎯 وحدتي"],
    ["files", "📁 ملفاتي"],
    ...(iTrainSomething ? [["trainer", "🧑‍🏫 لوحة المدرب"]] : []),
  ];

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🎓 نتعلم سوا</h2>
        {iTrainSomething && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setUnitForm(emptyUnit())} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>+ وحدة</button>
            <button onClick={() => setSessForm(emptySession(""))} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>+ سيشن</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            style={{ padding: "7px 12px", borderRadius: 20, border: `1.5px solid ${tab === v ? "#2563EB" : "#E2E8F0"}`, background: tab === v ? "#EFF6FF" : "#FFFFFF", color: tab === v ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: tab === v ? 700 : 500 }}>
            {l}
          </button>
        ))}
      </div>

      {/* ═══ خطة التدريب ═══ */}
      {tab === "plan" && (
        units.length === 0
          ? <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 30 }}>مفيش وحدات تدريبية لسه</div>
          : units.map(u => {
            const st = UNIT_STATUS[u.status || "todo"];
            const pr = unitProgress(u, sessions, records);
            const myRole = roleIn(u, user.name, isAdmin);
            const open = unitOpen === u.id;
            return (
              <div key={u.id} style={{ ...card, borderRight: `4px solid ${st.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {u.week_no && <span style={{ fontSize: 11, background: "#F1F5F9", color: "#64748B", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>أسبوع {u.week_no}</span>}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{u.skill}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      {u.week_dates || ""}{u.trainer ? ` · 🧑‍🏫 ${u.trainer}` : ""}{u.session_date ? ` · ${formatDate(String(u.session_date).slice(0,10))}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, background: st.bg, color: st.color, padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>{st.icon} {st.l}</span>
                  {myRole !== "viewer" && (
                    <span style={{ fontSize: 10, background: "#F5F3FF", color: "#7C3AED", border: "1px solid #DDD6FE", padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>
                      {myRole === "trainer" ? "مدرب" : "متدرب"}
                    </span>
                  )}
                  <button onClick={() => setUnitOpen(open ? null : u.id)} style={{ background: "none", color: "#94A3B8", fontSize: 13 }}>{open ? "▲" : "▼"}</button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, background: "#F1F5F9", borderRadius: 6, height: 7, overflow: "hidden" }}>
                    <div style={{ width: pr.pct + "%", height: "100%", background: st.color, borderRadius: 6 }}></div>
                  </div>
                  <span style={{ fontSize: 11, color: "#64748B" }}>{pr.approved} من {pr.trainees} خلّصوا · {pr.sessions} سيشن</span>
                </div>

                {open && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #E2E8F0", paddingTop: 12 }}>
                    {u.trainees && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>👥 المتدربين: {u.trainees}</div>}
                    {u.format && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>📋 {u.format}</div>}
                    {u.material_url && (
                      <div style={{ marginBottom: 8 }}><RichText text={u.material_url} members={members} /></div>
                    )}
                    {u.task_text && (
                      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "9px 12px", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 3 }}>🎯 المهمة التطبيقية</div>
                        <RichText text={u.task_text} members={members} size={12} />
                      </div>
                    )}
                    {u.clients && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>🏢 العملاء المقترحين: {u.clients}</div>}
                    {canGrade(u, user.name, isAdmin) && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button onClick={() => setUnitForm({ ...u, trainees: parseList(u.trainees) })}
                          style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>✏️ تعديل الوحدة</button>
                        <button onClick={() => setSessForm(emptySession(u.id))}
                          style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#7C3AED", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>+ سيشن للوحدة دي</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
      )}

      {/* ═══ سجل السيشنز ═══ */}
      {tab === "sessions" && (
        sessions.length === 0
          ? <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 30 }}>مفيش سيشنز لسه</div>
          : sessions.map(s => {
            const u = units.find(x => String(x.id) === String(s.unit_id));
            const recs = records.filter(r => String(r.session_id) === String(s.id));
            const came = recs.filter(r => r.attended).length;
            const mine = recordOf(records, s.id, user.name);
            return (
              <button key={s.id} onClick={() => setSessionOpen(s)}
                style={{ ...card, width: "100%", textAlign: "right", display: "block", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, background: "#EFF6FF", color: "#2563EB", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>
                    {formatDate(String(s.session_date).slice(0, 10))}
                  </span>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{u ? u.skill : "—"}{s.trainer ? ` · ${s.trainer}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 11, color: "#64748B" }}>👥 {came} حضروا</span>
                  {mine && (
                    <span style={{ fontSize: 10, background: mine.attended ? "#ECFDF5" : "#FEF2F2", color: mine.attended ? "#059669" : "#DC2626", border: `1px solid ${mine.attended ? "#A7F3D0" : "#FECACA"}`, padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>
                      {mine.attended ? "حضرت" : "غبت"}
                    </span>
                  )}
                </div>
              </button>
            );
          })
      )}

      {/* ═══ وحدتي ═══ */}
      {tab === "mine" && (
        !currentUnit
          ? <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 30 }}>إنت مش مسجّل في أي وحدة تدريبية دلوقتي</div>
          : (() => {
            const u = currentUnit;
            const mySessions = sessions.filter(s => String(s.unit_id) === String(u.id));
            return (
              <>
                <div style={{ ...card, borderTop: "3px solid #2563EB" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{u.skill}</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
                    {u.week_dates || ""}{u.trainer ? ` · المدرب ${u.trainer}` : ""}
                  </div>
                  {u.material_url && <div style={{ marginBottom: 10 }}><RichText text={u.material_url} members={members} /></div>}
                  {u.task_text && (
                    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 13px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 4 }}>🎯 المهمة التطبيقية</div>
                      <RichText text={u.task_text} members={members} size={13} />
                    </div>
                  )}
                </div>

                {mySessions.map(s => {
                  const r = recordOf(records, s.id, user.name);
                  const rs = r && r.review_state ? REVIEW_STATES[r.review_state] : null;
                  return (
                    <div key={s.id} style={card}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", flex: 1, minWidth: 120 }}>{s.title}</span>
                        <span style={{ fontSize: 11, color: "#94A3B8" }}>{formatDate(String(s.session_date).slice(0, 10))}</span>
                        {r && r.attended != null && (
                          <span style={{ fontSize: 10, background: r.attended ? "#ECFDF5" : "#FEF2F2", color: r.attended ? "#059669" : "#DC2626", padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>
                            {r.attended ? "حضرت" : "غبت"}
                          </span>
                        )}
                      </div>

                      {s.covered && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, lineHeight: 1.7 }}>📝 {s.covered}</div>}
                      {(s.recording_url || s.files) && (
                        <div style={{ marginBottom: 8 }}><RichText text={[s.recording_url, s.files].filter(Boolean).join("\n")} members={members} size={12} /></div>
                      )}

                      {r && r.submitted ? (
                        <div style={{ background: rs ? rs.bg : "#F8FAFC", border: `1px solid ${rs ? rs.color + "33" : "#E2E8F0"}`, borderRadius: 10, padding: "9px 12px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: rs ? rs.color : "#64748B", marginBottom: 4 }}>
                            📤 سلّمت · {rs ? rs.l : "تحت المراجعة"}
                          </div>
                          <RichText text={r.submission} members={members} size={12} />
                          {r.rating && <div style={{ marginTop: 6 }}><Stars value={r.rating} size={15} showNumber /></div>}
                          {r.notes && <div style={{ fontSize: 12, color: "#64748B", marginTop: 5 }}>💬 {r.notes}</div>}
                          {r.review_state === "redo" && (
                            <button onClick={() => { setSubmitFor({ session_id: s.id }); setSubmitText(r.submission || ""); }}
                              style={{ background: "#2563EB", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
                              ارفع تسليم جديد
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => { setSubmitFor({ session_id: s.id }); setSubmitText(""); }}
                          style={{ width: "100%", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "9px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
                          📤 ارفع تسليمك
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()
      )}

      {/* ═══ ملفاتي ═══ */}
      {tab === "files" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 8, marginBottom: 14 }}>
            {[
              { l: "سيشنز", v: stats.sessions, c: "#2563EB" },
              { l: "حضرت", v: stats.attended, c: "#059669" },
              { l: "سلّمت", v: stats.submitted, c: "#7C3AED" },
              { l: "متوسط التقييم", v: stats.avgRating != null ? stats.avgRating : "—", c: "#D97706" },
            ].map(x => (
              <div key={x.l} style={{ ...card, marginBottom: 0, textAlign: "center", padding: "12px 8px" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: x.c }}>{x.v}</div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{x.l}</div>
              </div>
            ))}
          </div>

          {myRecords.filter(r => r.submitted).length === 0
            ? <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 26 }}>مفيش تسليمات لسه</div>
            : myRecords.filter(r => r.submitted).map(r => {
              const s = sessions.find(x => String(x.id) === String(r.session_id));
              const u = units.find(x => String(x.id) === String(r.unit_id || (s && s.unit_id)));
              const rs = r.review_state ? REVIEW_STATES[r.review_state] : null;
              return (
                <div key={r.id} style={{ ...card, borderRight: `4px solid ${rs ? rs.color : "#E2E8F0"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", flex: 1, minWidth: 120 }}>{u ? u.skill : (s ? s.title : "—")}</span>
                    {rs && <span style={{ fontSize: 10, background: rs.bg, color: rs.color, padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>{rs.l}</span>}
                    {r.submitted_at && <span style={{ fontSize: 11, color: "#94A3B8" }}>{formatDate(String(r.submitted_at).slice(0, 10))}</span>}
                  </div>
                  <RichText text={r.submission} members={members} size={12} />
                  {r.rating && <div style={{ marginTop: 6 }}><Stars value={r.rating} size={15} showNumber /></div>}
                  {r.notes && <div style={{ fontSize: 12, color: "#64748B", marginTop: 5 }}>💬 {r.notes}</div>}
                </div>
              );
            })
          }
        </>
      )}

      {/* ═══ لوحة المدرب ═══ */}
      {tab === "trainer" && iTrainSomething && (() => {
        const late = lateTrainees(
          sessions.filter(s => isAdmin || s.trainer === user.name),
          records, units);
        return (
          <>
            {late.length > 0 && (
              <div style={{ ...card, borderRight: "4px solid #DC2626" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>🔴 مين متأخر ({late.length})</div>
                {late.slice(0, 12).map((x, i) => (
                  <div key={i} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "7px 11px", marginBottom: 5, fontSize: 12, color: "#0F172A" }}>
                    <b>{x.trainee}</b> — {x.missing} · {x.session}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>السيشنز — اضغطي على أي واحد للحضور والتقييم</div>
            {sessions.filter(s => isAdmin || s.trainer === user.name).map(s => {
              const recs = records.filter(r => String(r.session_id) === String(s.id));
              return (
                <button key={s.id} onClick={() => setSessionOpen(s)}
                  style={{ ...card, width: "100%", textAlign: "right", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }}>
                  <span style={{ fontSize: 11, background: "#EFF6FF", color: "#2563EB", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>{formatDate(String(s.session_date).slice(0, 10))}</span>
                  <span style={{ flex: 1, minWidth: 120, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: "#64748B" }}>{recs.filter(r => r.attended).length} حضور · {recs.filter(r => r.submitted).length} تسليم</span>
                </button>
              );
            })}
          </>
        );
      })()}

      {/* ═══ صفحة السيشن ═══ */}
      {sessionOpen && (() => {
        const s = sessionOpen;
        const u = units.find(x => String(x.id) === String(s.unit_id));
        const invited = parseList(s.invited).length ? parseList(s.invited) : parseList(u && u.trainees);
        const iCanGrade = isAdmin || s.trainer === user.name;
        return (
          <div onClick={e => e.target === e.currentTarget && setSessionOpen(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0F172A", flex: 1 }}>{s.title}</h3>
                <button onClick={() => setSessionOpen(null)} style={{ background: "none", color: "#94A3B8", fontSize: 18 }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>
                {formatDate(String(s.session_date).slice(0, 10))}{u ? ` · ${u.skill}` : ""}{s.trainer ? ` · 🧑‍🏫 ${s.trainer}` : ""}
              </div>

              {s.covered && (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 13px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>📝 اللي اتشرح</div>
                  <RichText text={s.covered} members={members} size={13} />
                </div>
              )}
              {(s.recording_url || s.files) && (
                <div style={{ marginBottom: 12 }}><RichText text={[s.recording_url, s.files].filter(Boolean).join("\n")} members={members} /></div>
              )}

              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>
                👥 المتدربين ({invited.length}){!iCanGrade ? " — العرض للمدرب بس" : ""}
              </div>

              {invited.map(t => {
                const r = recordOf(records, s.id, t) || {};
                const rs = r.review_state ? REVIEW_STATES[r.review_state] : null;
                return (
                  <div key={t} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 13px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ flex: 1, minWidth: 90, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{t}</span>
                      {iCanGrade ? (
                        <div style={{ display: "flex", gap: 5 }}>
                          <button onClick={() => markAttendance(s.id, t, true)}
                            style={{ background: r.attended === true ? "#059669" : "#FFFFFF", color: r.attended === true ? "#fff" : "#64748B", border: "1px solid #E2E8F0", padding: "4px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>حضر</button>
                          <button onClick={() => markAttendance(s.id, t, false)}
                            style={{ background: r.attended === false ? "#DC2626" : "#FFFFFF", color: r.attended === false ? "#fff" : "#64748B", border: "1px solid #E2E8F0", padding: "4px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>غاب</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: r.attended ? "#059669" : "#94A3B8" }}>{r.attended === true ? "حضر" : r.attended === false ? "غاب" : "—"}</span>
                      )}
                    </div>

                    {r.submitted ? (
                      <>
                        <div style={{ fontSize: 11, color: rs ? rs.color : "#64748B", fontWeight: 700, marginBottom: 3 }}>📤 سلّم · {rs ? rs.l : "تحت المراجعة"}</div>
                        <RichText text={r.submission} members={members} size={12} />
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>ما سلّمش لسه</div>
                    )}

                    {iCanGrade && r.submitted && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => grade(s.id, t, n, "approved")}
                              style={{ padding: "4px 9px", borderRadius: 8, border: `1.5px solid ${r.rating === n ? "#F59E0B" : "#E2E8F0"}`, background: r.rating === n ? "#FFFBEB" : "#FFFFFF", fontSize: 11, fontWeight: 700, color: r.rating === n ? "#D97706" : "#94A3B8" }}>
                              {n}★
                            </button>
                          ))}
                          <button onClick={() => grade(s.id, t, r.rating || 0, "redo")}
                            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "4px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>محتاج إعادة</button>
                        </div>
                        <input defaultValue={r.notes || ""} placeholder="ملاحظات المدرب"
                          onBlur={e => setRecord(s.id, t, { notes: e.target.value })}
                          style={{ ...inp, padding: "6px 10px", fontSize: 12 }} />
                      </div>
                    )}

                    {!iCanGrade && r.rating && (
                      <div style={{ marginTop: 6 }}>
                        <Stars value={r.rating} size={14} showNumber />
                        {r.notes && <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>💬 {r.notes}</div>}
                      </div>
                    )}
                  </div>
                );
              })}

              {iCanGrade && (
                <button onClick={() => { setSessForm({ ...s, invited: parseList(s.invited) }); setSessionOpen(null); }}
                  style={{ width: "100%", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "9px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginTop: 8 }}>
                  ✏️ تعديل السيشن
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══ رفع تسليم ═══ */}
      {submitFor && (
        <div onClick={e => e.target === e.currentTarget && setSubmitFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 340, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📤 ارفع تسليمك</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>حط رابط الملف أو الشيت أو المستند</div>
            <textarea value={submitText} onChange={e => setSubmitText(e.target.value)} rows={3}
              placeholder="https://docs.google.com/..." style={{ ...inp, resize: "vertical", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={submitWork} disabled={saving || !submitText.trim()}
                style={{ flex: 1, background: (saving || !submitText.trim()) ? "#CBD5E1" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>تسليم ✓</button>
              <button onClick={() => setSubmitFor(null)} style={{ background: "#F1F5F9", color: "#64748B", padding: "12px 20px", borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ إضافة/تعديل وحدة ═══ */}
      {unitForm && (
        <div onClick={e => e.target === e.currentTarget && setUnitForm(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 470, maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{unitForm.id ? "✏️ تعديل الوحدة" : "+ وحدة تدريبية"}</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
              <div><div style={label}>الأسبوع</div><input type="number" value={unitForm.week_no || ""} onChange={e => setUnitForm(f => ({ ...f, week_no: e.target.value }))} style={inp} /></div>
              <div><div style={label}>تاريخه</div><input value={unitForm.week_dates} onChange={e => setUnitForm(f => ({ ...f, week_dates: e.target.value }))} placeholder="١٢-١٦ يوليو" style={inp} /></div>
            </div>

            <div style={label}>المهارة أو الفجوة *</div>
            <input value={unitForm.skill} onChange={e => setUnitForm(f => ({ ...f, skill: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />

            <div style={label}>ملف الشرح (رابط)</div>
            <input value={unitForm.material_url || ""} onChange={e => setUnitForm(f => ({ ...f, material_url: e.target.value }))} style={{ ...inp, marginBottom: 10, direction: "ltr" }} />

            <div style={label}>المدرب</div>
            <select value={unitForm.trainer || ""} onChange={e => setUnitForm(f => ({ ...f, trainer: e.target.value }))} style={{ ...inp, marginBottom: 10 }}>
              <option value="">— اختاري —</option>
              {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>

            <div style={label}>المتدربين</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {members.map(m => {
                const on = (unitForm.trainees || []).includes(m.name);
                return (
                  <button key={m.id} onClick={() => setUnitForm(f => ({ ...f, trainees: on ? f.trainees.filter(x => x !== m.name) : [...(f.trainees || []), m.name] }))}
                    style={{ padding: "6px 12px", borderRadius: 20, border: `2px solid ${on ? "#2563EB" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "#F8FAFC", color: on ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                    {on ? "✓ " : ""}{m.name}
                  </button>
                );
              })}
            </div>

            <div style={label}>شكل التدريب</div>
            <input value={unitForm.format || ""} onChange={e => setUnitForm(f => ({ ...f, format: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />

            <div style={label}>المهمة التطبيقية</div>
            <textarea value={unitForm.task_text || ""} onChange={e => setUnitForm(f => ({ ...f, task_text: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical", marginBottom: 10 }} />

            <div style={label}>العملاء المقترحين</div>
            <input value={unitForm.clients || ""} onChange={e => setUnitForm(f => ({ ...f, clients: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div>
                <div style={label}>الحالة</div>
                <select value={unitForm.status || "todo"} onChange={e => setUnitForm(f => ({ ...f, status: e.target.value }))} style={inp}>
                  {Object.keys(UNIT_STATUS).map(k => <option key={k} value={k}>{UNIT_STATUS[k].l}</option>)}
                </select>
              </div>
              <div>
                <div style={label}>تاريخ السيشن</div>
                <input type="date" value={unitForm.session_date ? String(unitForm.session_date).slice(0, 10) : ""} onChange={e => setUnitForm(f => ({ ...f, session_date: e.target.value }))} style={inp} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveUnit} disabled={saving} style={{ flex: 1, background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>حفظ ✓</button>
              <button onClick={() => setUnitForm(null)} style={{ background: "#F1F5F9", color: "#64748B", padding: "13px 20px", borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ إضافة/تعديل سيشن ═══ */}
      {sessForm && (
        <div onClick={e => e.target === e.currentTarget && setSessForm(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 470, maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{sessForm.id ? "✏️ تعديل السيشن" : "+ سيشن جديد"}</h3>

            <div style={label}>تاريخ السيشن *</div>
            <input type="date" value={sessForm.session_date} onChange={e => setSessForm(f => ({ ...f, session_date: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />

            <div style={label}>عنوان السيشن *</div>
            <input value={sessForm.title} onChange={e => setSessForm(f => ({ ...f, title: e.target.value }))} style={{ ...inp, marginBottom: 10 }} />

            <div style={label}>الوحدة المرتبطة</div>
            <select value={sessForm.unit_id || ""} onChange={e => {
              const uid = e.target.value;
              const u = units.find(x => String(x.id) === String(uid));
              setSessForm(f => ({ ...f, unit_id: uid, invited: u ? parseList(u.trainees) : f.invited, trainer: (u && u.trainer) || f.trainer }));
            }} style={{ ...inp, marginBottom: 10 }}>
              <option value="">— بدون وحدة —</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.week_no ? `أسبوع ${u.week_no} · ` : ""}{u.skill}</option>)}
            </select>

            <div style={label}>اللي اتشرح</div>
            <textarea value={sessForm.covered || ""} onChange={e => setSessForm(f => ({ ...f, covered: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical", marginBottom: 10 }} />

            <div style={label}>رابط التسجيل</div>
            <input value={sessForm.recording_url || ""} onChange={e => setSessForm(f => ({ ...f, recording_url: e.target.value }))} style={{ ...inp, marginBottom: 10, direction: "ltr" }} />

            <div style={label}>ملفات الشرح — رابط في كل سطر</div>
            <textarea value={sessForm.files || ""} onChange={e => setSessForm(f => ({ ...f, files: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 10, direction: "ltr" }} />

            <div style={label}>المتدربين المدعوين</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {members.map(m => {
                const on = (sessForm.invited || []).includes(m.name);
                return (
                  <button key={m.id} onClick={() => setSessForm(f => ({ ...f, invited: on ? f.invited.filter(x => x !== m.name) : [...(f.invited || []), m.name] }))}
                    style={{ padding: "6px 12px", borderRadius: 20, border: `2px solid ${on ? "#2563EB" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "#F8FAFC", color: on ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                    {on ? "✓ " : ""}{m.name}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveSession} disabled={saving} style={{ flex: 1, background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>حفظ ✓</button>
              <button onClick={() => setSessForm(null)} style={{ background: "#F1F5F9", color: "#64748B", padding: "13px 20px", borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
