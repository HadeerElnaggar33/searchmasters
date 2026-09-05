import { useState, useEffect } from "react";
import { sb, MONTHS } from "../supabase.js";
import { WEEKDAYS, loadWorkConfig, saveWorkingDays, countWorkingDays } from "../workdays.js";

const TABS = [
  ["calendar",  "📆 تقويم الشغل"],
  ["targets",   "🎯 الأهداف والعتبات"],
  ["points",    "⭐ النقاط"],
  ["content",   "💬 الرسائل والمحتوى"],
  ["team",      "👥 الفريق والصلاحيات"],
  ["recurring", "🔄 التاسكات المتكررة"],
  ["features",  "🎛 تفعيل الميزات"],
  ["log",       "📜 سجل التغييرات"],
];

const THRESHOLDS = [
  ["daily_hours",           "ساعات اليوم الكامل",               "شاملة البريك · أساس حساب التارجت", "ساعة"],
  ["min_session_minutes",   "أقل مدة جلسة تُحتسب",              "اللي أقل يُعتبر تسجيل بالخطأ", "دقيقة"],
  ["hours_alert_threshold", "عتبة تنبيه الساعات",               "التنبيه يظهر لو نزل عن النسبة دي", "%"],
  ["eom_threshold",         "عتبة المرشح القوي",                "مين يظهر في مرشحي موظف الشهر", "%"],
  ["eom_max_candidates",    "عدد المرشحين المعروضين",           "الحد الأقصى في القائمة", "مرشح"],
  ["motivation_daily_cap",  "الحد اليومي للرسائل التحفيزية",    "0 = بلا حد", "رسالة"],
  ["idle_after_minutes",    "مدة الخمول",                       "بعدها الحالة تبقى «خامل»", "دقيقة"],
  ["notif_keep_days",       "الاحتفاظ بالإشعارات المقروءة",     "غير المقروء مبيتحذفش أبداً", "يوم"],
  ["notif_old_alert_days",  "تنبيه الإشعارات القديمة",          "بعد كام يوم يظهر التنبيه", "يوم"],
  ["draw_duration_minutes", "مدة السحب العشوائي",               "المدة الافتراضية", "دقيقة"],
  ["work_hour_start",       "بداية وقت الشغل",                  "الفيدباك بره الوقت ده بيتأجل للصبح", "الساعة"],
  ["work_hour_end",         "نهاية وقت الشغل",                  "", "الساعة"],
  ["new_member_grace_days", "مدة إعفاء العضو الجديد",           "مش داخل الترتيب ولا التنبيهات", "يوم"],
  ["leave_entitlement",     "رصيد الإجازات السنوي",             "", "يوم"],
  ["leave_carry_max",       "أقصى رصيد مرحّل",                  "", "يوم"],
  ["leave_notice_days",     "مهلة تقديم طلب الإجازة",           "", "يوم"],
  ["leave_max_per_day",     "أقصى عدد في إجازة نفس اليوم",      "", "شخص"],
];

const POINTS = [
  ["الأساس", [
    ["pts_base", "نقاط الأساس", "الرقم اللي بيتضرب في المعاملات"],
  ]],
  ["معاملات الأولوية", [
    ["pts_prio_low",    "منخفضة", ""],
    ["pts_prio_medium", "متوسطة", ""],
    ["pts_prio_high",   "عالية",  ""],
    ["pts_prio_urgent", "عاجلة",  ""],
  ]],
  ["معاملات الصعوبة", [
    ["pts_diff_easy",      "سهلة",      ""],
    ["pts_diff_medium",    "متوسطة",    ""],
    ["pts_diff_hard",      "صعبة",      ""],
    ["pts_diff_very_hard", "صعبة جداً", ""],
  ]],
  ["الإضافات والخصم", [
    ["pts_bonus_early",       "سلّمها قبل الموعد",        "بتتضاف على المجموع"],
    ["pts_bonus_no_revision", "من غير ريفيجن",            ""],
    ["pts_bonus_full_data",   "بياناتها كاملة عند التسليم","روابط + ملاحظات"],
    ["pts_penalty_late",      "اتسلّمت بعد الموعد",       "اكتبيها بالسالب"],
  ]],
  ["الجلسة المتصلة", [
    ["pts_session_2h", "شغل متواصل ساعتين",  ""],
    ["pts_session_4h", "شغل متواصل 4 ساعات", "بديلة مش مضافة للساعتين"],
  ]],
  ["المبادرة", [
    ["pts_initiative_self",  "ضاف تاسك لنفسه",  "بتتصرف عند الإتمام مش الإضافة"],
    ["pts_initiative_other", "ضاف تاسك لزميل",  "بتروح للي ضاف"],
  ]],
];

const FEATURES = [
  ["feature_mood",            "☀️ مودك النهارده",           "صفحة المود والسؤال اليومي"],
  ["feature_motivation",      "💬 الرسائل التحفيزية",        "الرسائل التلقائية حسب الأداء"],
  ["feature_celebration",     "🎉 الاحتفال بالإنجازات",      "اللي بيظهر عند إتمام تاسك"],
  ["feature_stickers",        "🖼 الاستيكرات",               "في المود والاحتفال"],
  ["feature_morning",         "🌅 قسم صباحك في الرئيسية",    "القسم الصباحي أول الصفحة"],
  ["feature_old_notif_alert", "🔔 تنبيه الإشعارات القديمة",  "التنبيه الجانبي"],
  ["feature_draws",           "🎁 السحب العشوائي",           "نافذة السحب المفاجئ"],
  ["feature_initiative",      "➕ نقاط المبادرة",             "نقطة لمن يضيف تاسك تتنفذ"],
  ["feature_session_points",  "⏱ نقاط الجلسة المتصلة",       "الشغل المتواصل ساعتين أو 4"],
];

export default function Settings({ user }) {
  const [tab, setTab] = useState("calendar");
  const [cfg, setCfg] = useState({ workingDays: [], holidays: [] });
  const [days, setDays] = useState([]);
  const [settings, setSettings] = useState({});
  const [members, setMembers] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [moodQs, setMoodQs] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState("");

  const [hForm, setHForm] = useState({ start: "", end: "", name: "" });
  const [confirmDel, setConfirmDel] = useState(null);
  const [monthPick, setMonthPick] = useState(new Date().getMonth());
  const [newMsg, setNewMsg] = useState({ text: "", trigger_key: "morning_general" });
  const [newSentence, setNewSentence] = useState({ text: "", category: "هادية" });

  const isAdmin = user.role === "admin";

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "9px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, []);

  async function load() {
    setLoading(true);
    const [c, st, m, r, mm, ds, mq, lg] = await Promise.all([
      loadWorkConfig(),
      sb("app_settings?select=key,value"),
      sb("team_members?order=name"),
      sb("recurring_tasks?order=created_at.desc"),
      sb("motivation_messages?order=trigger_key"),
      sb("day_sentences?order=category"),
      sb("mood_questions?order=sort_order"),
      sb("settings_log?order=changed_at.desc&limit=60"),
    ]);
    if (c) { setCfg(c); setDays(c.workingDays); }
    if (st) { const o = {}; st.forEach(x => { o[x.key] = x.value; }); setSettings(o); }
    if (m) setMembers(m);
    if (r) setRecurring(r);
    if (mm) setMsgs(mm);
    if (ds) setSentences(ds);
    if (mq) setMoodQs(mq);
    if (lg) setLog(lg);
    setLoading(false);
  }

  function flash(t) { setSaved(t); setTimeout(() => setSaved(""), 2500); }

  async function writeLog(setting, oldV, newV) {
    await sb("settings_log", "POST", { setting, old_value: String(oldV ?? ""), new_value: String(newV ?? ""), changed_by: user.name });
  }

  async function saveSetting(key, value, labelText) {
    const old = settings[key];
    if (String(old) === String(value)) return;
    const ex = await sb(`app_settings?key=eq.${key}`);
    if (ex && ex.length) await sb(`app_settings?key=eq.${key}`, "PATCH", { value: String(value) });
    else await sb("app_settings", "POST", { key, value: String(value) });
    await writeLog(labelText || key, old, value);
    setSettings(s => ({ ...s, [key]: String(value) }));
    flash("✅ اتحفظ");
  }

  async function saveDays() {
    if (days.length === 0) { alert("لازم يوم عمل واحد على الأقل"); return; }
    await saveWorkingDays(days);
    await writeLog("أيام العمل الأسبوعية",
      cfg.workingDays.map(d => WEEKDAYS[d] && WEEKDAYS[d].l).join("، "),
      days.map(d => WEEKDAYS[d] && WEEKDAYS[d].l).join("، "));
    flash("✅ اتحفظت أيام العمل");
    await load();
  }

  async function addHoliday() {
    if (!hForm.start) { alert("اختاري تاريخ البداية"); return; }
    if (!hForm.name.trim()) { alert("اكتبي اسم العطلة"); return; }
    const end = hForm.end || hForm.start;
    if (end < hForm.start) { alert("تاريخ النهاية قبل البداية"); return; }
    const rangeId = `r${Date.now()}`;
    const cur = new Date(hForm.start + "T00:00:00");
    const stop = new Date(end + "T00:00:00");
    let n = 0, guard = 0;
    while (cur <= stop && guard < 60) {
      const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (!cfg.holidays.some(h => String(h.date).slice(0, 10) === d)) {
        await sb("holidays", "POST", { date: d, name: hForm.name.trim(), created_by: user.name, range_id: rangeId });
        n++;
      }
      cur.setDate(cur.getDate() + 1); guard++;
    }
    await writeLog("إضافة عطلة", "", `${hForm.name.trim()} (${n} يوم)`);
    setHForm({ start: "", end: "", name: "" });
    flash(`✅ اتضافت ${n} يوم`);
    await load();
  }

  async function delHoliday() {
    if (!confirmDel) return;
    if (confirmDel.range_id) await sb(`holidays?range_id=eq.${confirmDel.range_id}`, "DELETE");
    else await sb(`holidays?id=eq.${confirmDel.id}`, "DELETE");
    await writeLog("حذف عطلة", confirmDel.name, "");
    setConfirmDel(null);
    await load();
  }

  async function saveTarget(m, val) {
    const v = val === "" ? null : Number(val);
    await sb(`team_members?id=eq.${m.id}`, "PATCH", { monthly_target_hours: v });
    await writeLog(`الهدف الشهري — ${m.name}`, m.monthly_target_hours, v);
    setMembers(list => list.map(x => x.id === m.id ? { ...x, monthly_target_hours: v } : x));
    flash("✅ اتحفظ");
  }

  async function toggleAssign(m) {
    const v = !m.can_assign_tasks;
    await sb(`team_members?id=eq.${m.id}`, "PATCH", { can_assign_tasks: v });
    await writeLog(`صلاحية إضافة التاسكات — ${m.name}`, m.can_assign_tasks ? "مفعّلة" : "موقوفة", v ? "مفعّلة" : "موقوفة");
    setMembers(list => list.map(x => x.id === m.id ? { ...x, can_assign_tasks: v } : x));
    flash("✅ اتحفظت");
  }

  async function toggleRecurring(r) {
    await sb(`recurring_tasks?id=eq.${r.id}`, "PATCH", { is_active: !r.is_active });
    await load();
  }
  async function delRecurring(r) {
    await sb(`recurring_tasks?id=eq.${r.id}`, "DELETE");
    await writeLog("حذف تاسك متكررة", r.title, "");
    await load();
  }

  async function addMsg() {
    if (!newMsg.text.trim()) return;
    await sb("motivation_messages", "POST", { text: newMsg.text.trim(), trigger_key: newMsg.trigger_key, category: "مخصصة" });
    setNewMsg({ text: "", trigger_key: "morning_general" });
    await load();
  }
  async function toggleMsg(m) {
    await sb(`motivation_messages?id=eq.${m.id}`, "PATCH", { is_active: !m.is_active });
    await load();
  }
  async function addSentence() {
    if (!newSentence.text.trim()) return;
    await sb("day_sentences", "POST", { text: newSentence.text.trim(), category: newSentence.category });
    setNewSentence({ text: "", category: "هادية" });
    await load();
  }
  async function delSentence(x) {
    await sb(`day_sentences?id=eq.${x.id}`, "DELETE");
    await load();
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, maxWidth: 700, margin: "0 auto" }}>
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#94A3B8" }}>🔒 الكنترول للمدير فقط</div>
      </div>
    );
  }
  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const dirty = JSON.stringify(days) !== JSON.stringify(cfg.workingDays);
  const y = new Date().getFullYear();
  const mm2 = String(monthPick + 1).padStart(2, "0");
  const lastD = new Date(y, monthPick + 1, 0).getDate();
  const wd = countWorkingDays(`${y}-${mm2}-01`, `${y}-${mm2}-${lastD}`, { workingDays: days, holidays: cfg.holidays });

  const groups = [];
  for (const h of cfg.holidays) {
    const key = h.range_id || h.id;
    const g = groups.find(x => x.key === key);
    if (g) g.dates.push(String(h.date).slice(0, 10));
    else groups.push({ key, name: h.name, id: h.id, range_id: h.range_id, dates: [String(h.date).slice(0, 10)] });
  }
  groups.forEach(g => g.dates.sort());
  groups.sort((a, b) => a.dates[0].localeCompare(b.dates[0]));

  const fmtD = d => new Date(d + "T00:00:00").toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  const triggerKeys = [...new Set(msgs.map(m => m.trigger_key))];

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🎛 الكنترول</h2>
        {saved && <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>{saved}</span>}
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            style={{ padding: "7px 12px", borderRadius: 20, border: `1.5px solid ${tab === v ? "#2563EB" : "#E2E8F0"}`, background: tab === v ? "#EFF6FF" : "#FFFFFF", color: tab === v ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: tab === v ? 700 : 500 }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>📆 أيام العمل الأسبوعية</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>الأيام المش متحددة مش هتتحسب غياب على حد</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {WEEKDAYS.map(d => {
                const on = days.includes(d.v);
                return (
                  <button key={d.v} onClick={() => setDays(x => on ? x.filter(i => i !== d.v) : [...x, d.v].sort())}
                    style={{ padding: "9px 15px", borderRadius: 12, border: `2px solid ${on ? "#2563EB" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "#F8FAFC", color: on ? "#2563EB" : "#94A3B8", fontSize: 13, fontWeight: on ? 700 : 500 }}>
                    {on ? "✓ " : ""}{d.l}
                  </button>
                );
              })}
            </div>
            {dirty && (
              <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#D97706", marginBottom: 12, lineHeight: 1.6 }}>
                ⚠️ تغيير أيام العمل وسط الشهر هيأثر على حسابات الحضور والغياب والساعات والتارجت بأثر فوري
              </div>
            )}
            <button onClick={saveDays} disabled={!dirty}
              style={{ background: dirty ? "linear-gradient(135deg,#2563EB,#7C3AED)" : "#CBD5E1", color: "#fff", padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>حفظ ✓</button>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>📊 أيام العمل بالشهر</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={monthPick} onChange={e => setMonthPick(Number(e.target.value))} style={{ ...inp, width: "auto" }}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m} {y}</option>)}
              </select>
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "9px 16px", fontSize: 13, color: "#2563EB" }}>
                <b style={{ fontSize: 17 }}>{wd}</b> يوم عمل بعد خصم العطلات
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>🎉 العطلات الرسمية</div>
            <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 620 ? "1fr" : "1fr 1fr 2fr auto", gap: 8, marginBottom: 16 }}>
              <div><div style={label}>من</div><input type="date" value={hForm.start} onChange={e => setHForm(f => ({ ...f, start: e.target.value }))} style={inp} /></div>
              <div><div style={label}>إلى (اختياري)</div><input type="date" value={hForm.end} onChange={e => setHForm(f => ({ ...f, end: e.target.value }))} style={inp} /></div>
              <div><div style={label}>الاسم</div><input value={hForm.name} onChange={e => setHForm(f => ({ ...f, name: e.target.value }))} placeholder="عيد الفطر" style={inp} /></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={addHoliday} style={{ background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, width: "100%" }}>+ إضافة</button>
              </div>
            </div>
            {groups.length === 0
              ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 16 }}>مفيش عطلات مسجلة</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {groups.map(g => (
                    <div key={g.key} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "9px 13px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span>🎉</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>
                          {g.dates.length === 1 ? fmtD(g.dates[0]) : `${fmtD(g.dates[0])} → ${fmtD(g.dates[g.dates.length - 1])} · ${g.dates.length} أيام`}
                        </div>
                      </div>
                      <button onClick={() => setConfirmDel(g)} style={{ background: "none", color: "#DC2626", fontSize: 15 }}>🗑</button>
                    </div>
                  ))}
                </div>
            }
          </div>
        </>
      )}

      {tab === "targets" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🎯 الهدف الشهري للساعات</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>لكل عضو على حدة · لو سيبتيه فاضي بيستخدم الحساب العام (أيام العمل × ساعات اليوم)</div>
            {members.filter(m => m.is_active !== false).map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 12px", marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
                <span style={{ flex: 1, minWidth: 90, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{m.name}</span>
                <input type="number" min="0" defaultValue={m.monthly_target_hours == null ? "" : m.monthly_target_hours} placeholder="تلقائي"
                  onBlur={e => saveTarget(m, e.target.value)}
                  style={{ ...inp, width: 100, padding: "6px 10px", fontSize: 13 }} />
                <span style={{ fontSize: 11, color: "#94A3B8" }}>ساعة/شهر</span>
                <span style={{ fontSize: 11, color: "#64748B" }}>
                  أسبوعي ≈ <b>{m.monthly_target_hours ? Math.round(Number(m.monthly_target_hours) / 4) : "—"}</b>
                </span>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>⚙️ العتبات والقيم</div>
            {THRESHOLDS.map(([key, name, hint, unit]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #F1F5F9", padding: "9px 0", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{name}</div>
                  {hint && <div style={{ fontSize: 11, color: "#94A3B8" }}>{hint}</div>}
                </div>
                <input type="number" defaultValue={settings[key] == null ? "" : settings[key]} onBlur={e => saveSetting(key, e.target.value, name)}
                  style={{ ...inp, width: 90, padding: "6px 10px", fontSize: 13 }} />
                <span style={{ fontSize: 11, color: "#94A3B8", minWidth: 34 }}>{unit}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "points" && (
        <>
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 15px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.9 }}>
            📐 <b>المعادلة:</b> (الأساس × معامل الأولوية × معامل الصعوبة) + الإضافات
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
              مثال: تاسك عاجلة صعبة، قبل ميعادها وبدون ريفيجن ← 5 × 1.6 × 1.4 = 11.2 + 2 + 2 = <b>15.2 نقطة</b>
            </div>
            <div style={{ fontSize: 11, color: "#DC2626", marginTop: 6 }}>
              ⚠️ أي تعديل بيتطبق من وقته بس — النقاط القديمة مبتتحسبش تاني
            </div>
          </div>

          {POINTS.map(([group, rows]) => (
            <div key={group} style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>{group}</div>
              {rows.map(([key, name, hint]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #F1F5F9", padding: "8px 0", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{name}</div>
                    {hint && <div style={{ fontSize: 11, color: "#94A3B8" }}>{hint}</div>}
                  </div>
                  <input type="number" step="0.1" defaultValue={settings[key] == null ? "" : settings[key]}
                    onBlur={e => saveSetting(key, e.target.value, `${group} — ${name}`)}
                    style={{ ...inp, width: 90, padding: "6px 10px", fontSize: 13 }} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {tab === "content" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>💬 الرسائل التحفيزية ({msgs.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input value={newMsg.text} onChange={e => setNewMsg(f => ({ ...f, text: e.target.value }))} placeholder="نص الرسالة · [الاسم] بيتبدل باسم العضو" style={{ ...inp, flex: 1, minWidth: 180 }} />
              <select value={newMsg.trigger_key} onChange={e => setNewMsg(f => ({ ...f, trigger_key: e.target.value }))} style={{ ...inp, width: "auto" }}>
                {triggerKeys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <button onClick={addMsg} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 340, overflowY: "auto" }}>
              {msgs.map(m => (
                <div key={m.id} style={{ background: m.is_active ? "#F8FAFC" : "#FEF2F2", border: "1px solid #E2E8F0", borderRadius: 9, padding: "7px 11px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#0F172A" }}>{m.text}</span>
                  <span style={{ fontSize: 9, color: "#94A3B8" }}>{m.trigger_key}</span>
                  <button onClick={() => toggleMsg(m)} style={{ background: "none", color: m.is_active ? "#059669" : "#DC2626", fontSize: 11, fontWeight: 700 }}>{m.is_active ? "مفعّلة" : "موقوفة"}</button>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>🌅 بنك جمل اليوم ({sentences.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input value={newSentence.text} onChange={e => setNewSentence(f => ({ ...f, text: e.target.value }))} placeholder="جملة جديدة بالعامية" style={{ ...inp, flex: 1, minWidth: 180 }} />
              <select value={newSentence.category} onChange={e => setNewSentence(f => ({ ...f, category: e.target.value }))} style={{ ...inp, width: "auto" }}>
                {["هادية", "تحفيزية", "عن الفريق", "عن التنظيم", "خفيفة"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={addSentence} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 300, overflowY: "auto" }}>
              {sentences.map(x => (
                <div key={x.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 9, padding: "7px 11px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#0F172A" }}>{x.text}</span>
                  <span style={{ fontSize: 9, color: "#94A3B8" }}>{x.category}</span>
                  <button onClick={() => delSentence(x)} style={{ background: "none", color: "#DC2626", fontSize: 13 }}>🗑</button>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>☀️ أسئلة المود ({moodQs.length})</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>الإضافة والتعديل من صفحة مودك النهارده ← ⚙️ إدارة الأسئلة</div>
          </div>
        </>
      )}

      {tab === "team" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
            👥 الفريق ({members.filter(m => m.is_active !== false).length} نشط)
          </div>
          {members.map(m => (
            <div key={m.id} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 13px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: m.is_active === false ? 0.55 : 1 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
              <div style={{ flex: 1, minWidth: 110 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                  {m.job_title || "—"} · {m.role === "admin" ? "Admin" : "Employee"}{m.is_active === false ? " · غير نشط" : ""}
                </div>
              </div>
              {m.role !== "admin" && (
                <button onClick={() => toggleAssign(m)}
                  style={{ background: m.can_assign_tasks ? "#ECFDF5" : "#F1F5F9", border: `1px solid ${m.can_assign_tasks ? "#A7F3D0" : "#E2E8F0"}`, color: m.can_assign_tasks ? "#059669" : "#94A3B8", padding: "5px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                  {m.can_assign_tasks ? "✓ بيضيف تاسكات" : "مش بيضيف تاسكات"}
                </button>
              )}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, lineHeight: 1.7 }}>
            إضافة عضو أو تغيير الأدوار من صفحة 👥 الفريق · قواعد الإجازات من تبويب الأهداف والعتبات
          </div>
        </div>
      )}

      {tab === "recurring" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🔄 التاسكات المتكررة ({recurring.length})</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>الإنشاء من صفحة القوالب · هنا الإيقاف والحذف والمتابعة</div>
          {recurring.length === 0
            ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 16 }}>مفيش تاسكات متكررة</div>
            : recurring.map(r => (
              <div key={r.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 11, padding: "9px 13px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>
                    {r.frequency === "daily" ? "يومي" : r.frequency === "weekly" ? "أسبوعي" : "شهري"}
                    {r.assigned_to ? ` · ${r.assigned_to}` : ""}
                    {r.last_generated_date ? ` · آخر توليد ${String(r.last_generated_date).slice(0, 10)}` : " · لسه ما اتولدتش"}
                  </div>
                </div>
                <button onClick={() => toggleRecurring(r)}
                  style={{ background: r.is_active ? "#ECFDF5" : "#FFFBEB", border: `1px solid ${r.is_active ? "#A7F3D0" : "#FDE68A"}`, color: r.is_active ? "#059669" : "#D97706", padding: "4px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                  {r.is_active ? "شغالة" : "موقوفة"}
                </button>
                <button onClick={() => delRecurring(r)} style={{ background: "none", color: "#DC2626", fontSize: 13 }}>🗑</button>
              </div>
            ))
          }
        </div>
      )}

      {tab === "features" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🎛 تفعيل الميزات</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>إيقاف أي ميزة بيخفيها من عند كل الفريق · البيانات بتفضل محفوظة وبترجع زي ما هي عند التفعيل</div>
          {FEATURES.map(([key, name, hint]) => {
            const on = settings[key] !== "0";
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #F1F5F9", padding: "11px 0", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{hint}</div>
                </div>
                <button onClick={() => saveSetting(key, on ? "0" : "1", name)}
                  style={{ background: on ? "#ECFDF5" : "#F1F5F9", border: `1.5px solid ${on ? "#A7F3D0" : "#E2E8F0"}`, color: on ? "#059669" : "#94A3B8", padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  {on ? "✓ مفعّلة" : "موقوفة"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "log" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>📜 آخر {log.length} تغيير</div>
          {log.length === 0
            ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 16 }}>مفيش تغييرات مسجلة</div>
            : log.map(l => (
              <div key={l.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 12px", marginBottom: 5 }}>
                <div style={{ fontSize: 12, color: "#0F172A", fontWeight: 600 }}>{l.setting}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                  <span style={{ color: "#DC2626" }}>{l.old_value || "—"}</span> ← <span style={{ color: "#059669" }}>{l.new_value || "—"}</span>
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                  {l.changed_by} · {new Date(l.changed_at).toLocaleString("ar-EG")}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 26, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🗑</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>حذف «{confirmDel.name}»؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 18, lineHeight: 1.6 }}>
              {confirmDel.dates.length} يوم هيرجعوا أيام عمل عادية.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={delHoliday} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 11, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>احذفي</button>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 11, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
