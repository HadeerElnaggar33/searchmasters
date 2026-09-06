import { useState, useEffect } from "react";
import { sb, STATUS_CONFIG, PRIORITY_CONFIG, timeAgo, formatDate, CURRENT_MONTH } from "../supabase.js";
import { loadWorkConfig, isWorkingDay, countWorkingDays } from "../workdays.js";
import { loadLedger, totalsFrom, rankMembers } from "../score.js";
import { presenceOf } from "../timer.js";
import { loadStickers, matching } from "../stickers.js";

const C = {
  card: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: "16px 14px", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" },
  heading: { color: "#0F172A", fontWeight: 800 },
  sub: { color: "#94A3B8", fontSize: 12 },
};

const GREETINGS = ["صباح النور", "صباح الفل", "صباح الخير", "يوم سعيد", "أهلاً بيك"];
const MOODS = ["😄 تمام", "🙂 كويس", "😐 عادي", "😕 مش أوي", "😩 تعبان"];

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function seed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
  return h;
}
function pick(list, n) { return list && list.length ? list[n % list.length] : null; }
function fmtH(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}س ${m % 60}د` : `${h}س`;
}

export default function Dashboard({ user, onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [eomWinner, setEomWinner] = useState(null);
  const [myNom, setMyNom] = useState(null);
  const [allNoms, setAllNoms] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [myBadges, setMyBadges] = useState([]);
  const [allBadges, setAllBadges] = useState([]);
  const [monthAtt, setMonthAtt] = useState([]);
  const [cfg, setCfg] = useState({ workingDays: [0, 1, 2, 3, 4], holidays: [] });
  const [settings, setSettings] = useState({});
  const [me, setMe] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(null);
  const [tab, setTab] = useState(() => localStorage.getItem("sm_home_tab") || "mine");
  const [leaves, setLeaves] = useState([]);
  const [helpOpenReqs, setHelpOpenReqs] = useState([]);
  const [busy, setBusy] = useState(false);

  // قسم صباحك
  const [moodQs, setMoodQs] = useState([]);
  const [moodToday, setMoodToday] = useState(null);
  const [sentences, setSentences] = useState([]);
  const [moodPick, setMoodPick] = useState("");
  const [answerPick, setAnswerPick] = useState("");
  const [morningOpen, setMorningOpen] = useState(true);
  const [savingMood, setSavingMood] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [stickerPick, setStickerPick] = useState(null);

  const today = toISO(new Date());
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const mm = String(new Date().getMonth() + 1).padStart(2, "0");
    const yy = new Date().getFullYear();
    const lastD = new Date(yy, new Date().getMonth() + 1, 0).getDate();

    const [t, m, a, n, w, nom, lg, mb, ab, ma, c, st, mq, mAns, ds, gf, lv, sk, hr] = await Promise.all([
      sb(`tasks?month=eq.${encodeURIComponent(CURRENT_MONTH)}&order=created_at.desc`),
      sb("team_members?is_active=eq.true&order=name"),
      sb(`attendance?date=eq.${today}&order=created_at`),
      sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&order=created_at.desc&limit=10`),
      sb(`eom_winners?month=eq.${encodeURIComponent(CURRENT_MONTH)}`),
      sb(`eom_nominations?month=eq.${encodeURIComponent(CURRENT_MONTH)}`),
      loadLedger(CURRENT_MONTH),
      sb(`member_badges?member_name=eq.${encodeURIComponent(user.name)}&select=id,badge_id,badge_name,badge_icon,awarded_at`),
      sb("badges?is_active=eq.true&select=id"),
      sb(`attendance?member_name=eq.${encodeURIComponent(user.name)}&date=gte.${yy}-${mm}-01&date=lte.${yy}-${mm}-${lastD}`),
      loadWorkConfig(),
      sb("app_settings?select=key,value"),
      sb("mood_questions?is_active=eq.true&order=sort_order"),
      sb(`mood_answers?member_name=eq.${encodeURIComponent(user.name)}&answer_date=eq.${today}`),
      sb("day_sentences?is_active=eq.true"),
      sb(`draws?status=eq.won&winner_name=eq.${encodeURIComponent(user.name)}&select=id,gift_name,won_at`),
      sb("leave_requests?status=eq.pending&order=created_at"),
      loadStickers(),
      sb("help_requests?status=eq.open&order=created_at.desc"),
    ]);

    if (t) setTasks(t);
    if (m) { setMembers(m); setMe(m.find(x => x.name === user.name) || null); }
    if (a) { setAttendance(a); const my = a.find(x => x.member_name === user.name); if (my && my.clock_in && !my.clock_out) setClockedIn(my); }
    if (n) setNotifs(n);
    if (w) setEomWinner(w[0] || null);
    if (nom) { setAllNoms(nom); setMyNom(nom.find(x => x.member_name === user.name) || null); }
    setLedger(lg || []);
    if (mb) setMyBadges(mb);
    if (ab) setAllBadges(ab);
    if (ma) setMonthAtt(ma);
    if (c) setCfg(c);
    if (st) { const o = {}; st.forEach(x => { o[x.key] = x.value; }); setSettings(o); }
    if (mq) setMoodQs(mq);
    if (mAns) setMoodToday(mAns[0] || null);
    if (ds) setSentences(ds);
    if (gf) setGifts(gf);
    if (lv) setLeaves(lv);
    if (sk) setStickers(sk);
    if (hr) setHelpOpenReqs(hr);
    setLoading(false);
  }

  async function clockIn() {
    if (attendance.find(a => a.member_name === user.name)) return;
    const now = new Date().toISOString();
    const att = await sb("attendance", "POST", { member_name: user.name, date: today, clock_in: now, status: "present" });
    if (att && att[0]) {
      await sb("attendance_sessions", "POST", { attendance_id: att[0].id, member_name: user.name, date: today, start_time: now, type: "work" });
    }
    await loadAll();
  }

  async function clockOut() {
    if (!clockedIn) return;
    const now = new Date();
    const sessions = await sb(`attendance_sessions?attendance_id=eq.${clockedIn.id}&end_time=is.null`);
    if (sessions && sessions.length) {
      const mins = Math.floor((now - new Date(sessions[0].start_time)) / 60000);
      await sb(`attendance_sessions?id=eq.${sessions[0].id}`, "PATCH", { end_time: now.toISOString(), duration_minutes: mins });
    }
    const allSessions = await sb(`attendance_sessions?attendance_id=eq.${clockedIn.id}`);
    const totalMins = (allSessions || []).reduce((s, x) => s + (x.duration_minutes || 0), 0);
    await sb(`attendance?id=eq.${clockedIn.id}`, "PATCH", { clock_out: now.toISOString(), working_minutes: totalMins });
    setClockedIn(null);
    await loadAll();
  }

  function switchTab(v) { setTab(v); localStorage.setItem("sm_home_tab", v); }

  // ── قرارات سريعة من تبويب فريقي ──
  async function decideLeave(req, ok) {
    setBusy(true);
    await sb(`leave_requests?id=eq.${req.id}`, "PATCH", {
      status: ok ? "approved" : "rejected", decided_by: user.name, decided_at: new Date().toISOString(),
    });
    await sb("notifications", "POST", {
      recipient: req.member_name, type: "info",
      content: ok ? `✅ إجازتك من ${formatDate(String(req.start_date).slice(0,10))} اتعمدت` : `❌ طلب إجازتك اترفض`,
    });
    setBusy(false);
    await loadAll();
  }

  async function decideTask(t, ok) {
    setBusy(true);
    await sb(`tasks?id=eq.${t.id}`, "PATCH", { status: ok ? "completed" : "needs_revision" });
    await sb("notifications", "POST", {
      recipient: t.assigned_to, type: "info", related_task_id: t.id,
      content: ok ? `✅ تاسك «${t.title}» اتعمدت` : `🔁 تاسك «${t.title}» محتاجة تعديل`,
    });
    setBusy(false);
    await loadAll();
  }

  async function saveMorning(skip) {
    const q = todayQuestion;
    if (!q) return;
    setSavingMood(true);
    await sb("mood_answers", "POST", {
      member_name: user.name, answer_date: today,
      question_id: String(q.id), question_text: q.text,
      choice: skip ? null : (answerPick || null),
      note: skip ? null : (moodPick || null),
      skipped: !!skip,
    });
    setSavingMood(false);
    setMorningOpen(false);
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  // ═══ الحسابات ═══
  const myTasks = tasks.filter(t => t.assigned_to === user.name);
  const scope = isAdmin ? tasks : myTasks;
  const live = scope.filter(t => t.status !== "cancelled");
  const overdue = live.filter(t => t.due_date && String(t.due_date).slice(0, 10) < today && t.status !== "completed");
  const urgent = live.filter(t => t.priority === "urgent" && t.status !== "completed");
  const completed = live.filter(t => t.status === "completed");
  const inProgress = live.filter(t => t.status === "in_progress");
  const review = live.filter(t => t.status === "pending_review");
  const myAtt = attendance.find(a => a.member_name === user.name && a.status !== "leave");

  const totals = totalsFrom(ledger);
  const names = members.map(m => m.name);
  const ranked = rankMembers(names, totals);
  const myPoints = Math.round((totals[user.name] || 0) * 10) / 10;
  const myRank = ranked.indexOf(user.name) + 1;

  const monthMins = monthAtt.filter(a => a.status !== "leave").reduce((s, a) => s + (Number(a.working_minutes) || 0), 0);

  // الهدف الشهري والمعدل المتوقع حتى اليوم
  const dailyHours = Number(settings.daily_hours) || 8;
  const yy = new Date().getFullYear(), mIdx = new Date().getMonth();
  const mm = String(mIdx + 1).padStart(2, "0");
  const lastD = new Date(yy, mIdx + 1, 0).getDate();
  const monthWorkDays = countWorkingDays(`${yy}-${mm}-01`, `${yy}-${mm}-${lastD}`, cfg);
  const passedWorkDays = countWorkingDays(`${yy}-${mm}-01`, today, cfg);
  const targetMins = me && me.monthly_target_hours ? Number(me.monthly_target_hours) * 60 : monthWorkDays * dailyHours * 60;
  const expectedMins = monthWorkDays > 0 ? (targetMins / monthWorkDays) * passedWorkDays : 0;
  const hoursPct = expectedMins > 0 ? Math.round((monthMins / expectedMins) * 100) : 100;
  const hoursThreshold = Number(settings.hours_alert_threshold) || 50;

  // ميداليات
  const medalCount = new Set(myBadges.map(b => String(b.badge_id))).size;
  const medalTotal = allBadges.length;

  // جائزة الأسبوع
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return toISO(d); })();
  const wonThisWeek = gifts.filter(g => g.won_at && String(g.won_at).slice(0, 10) >= weekStart);

  // آخر فيدباك
  const lastFeedback = myTasks
    .filter(t => t.feedback_positive || t.feedback_negative)
    .sort((a, b) => new Date(b.feedback_at || 0) - new Date(a.feedback_at || 0))[0];

  // ═══ الرسائل والتنبيهات (تعديل ١٣) ═══
  const alerts = {};
  const msgs = [];
  if (hoursPct < hoursThreshold) {
    const need = Math.max(0, Math.round((expectedMins - monthMins) / 60));
    alerts.hours = `ناقص ${need} ساعة`;
    msgs.push({ p: 1, t: `باقي لك ${need} ساعة تلحق المعدل، يلا نشد شوية` });
  }
  if (myRank > 3 && myRank > 0) {
    const third = ranked[2];
    const gap = Math.max(0, Math.round(((totals[third] || 0) - myPoints) * 10) / 10);
    alerts.rank = `ترتيبك ${myRank}`;
    msgs.push({ p: 3, t: gap > 0 ? `باقي لك ${gap} نقطة وتدخل في التلاتة الكبار` : `ترتيبك ${myRank}، شد حيلك التلاتة الأوائل قريبين` });
  }
  if (hoursPct >= hoursThreshold) msgs.push({ p: 5, t: "ساعاتك تمام، ماشي في الطريق الصح" });
  if (myRank > 0 && myRank <= 3) msgs.push({ p: 4, t: `إنت في التلاتة الأوائل، ثبّت مكانك` });
  if (wonThisWeek.length > 0) msgs.push({ p: 6, t: "خدت جايزة الأسبوع، يلا جدع نجيب اللي بعدها" });
  if (overdue.length > 0) { alerts.tasks = `${overdue.length} متأخرة`; }
  const topMsg = msgs.sort((a, b) => a.p - b.p)[0];

  // ═══ قسم صباحك ═══
  const s = seed(user.name + today);
  const greeting = pick(GREETINGS, s);
  const todayQuestion = pick(moodQs, s + 5);
  const daySentence = pick(sentences, s + 11);
  const morningOn = settings.feature_morning !== "0";
  const showMorning = morningOn && morningOpen && !moodToday && isWorkingDay(today, cfg);

  // حاجات حلوة حصلت لك
  const goodThings = [];
  if (lastFeedback && lastFeedback.feedback_positive) goodThings.push(`فيدباك حلو اتكتب لك على «${lastFeedback.title}»`);
  const recentMedal = myBadges.filter(b => b.awarded_at && (Date.now() - new Date(b.awarded_at)) < 86400000 * 2)[0];
  if (recentMedal) goodThings.push(`خدت ميدالية ${recentMedal.badge_icon} ${recentMedal.badge_name}`);
  if (wonThisWeek.length > 0) goodThings.push(`جايزة ${wonThisWeek[0].gift_name} في طريقها لك`);

  const dueToday = myTasks.filter(t => String(t.due_date || "").slice(0, 10) === today && t.status !== "completed");

  const moodStickers = matching(stickers, "mood", null);
  const nav = (page, filter) => onNavigate && onNavigate(page, filter);
  const myNomOf = name => {
    const r = allNoms.find(x => x.member_name === name);
    return r && r.percentage != null ? r.percentage : null;
  };

  const StatCard = ({ label, value, color, bg, filter }) => (
    <button onClick={() => nav("tasks", filter)}
      style={{ ...C.card, textAlign: "center", padding: "12px 8px", border: `1px solid ${bg}`, background: "#FFFFFF", cursor: "pointer" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{label}</div>
    </button>
  );

  const AchRow = ({ icon, label, value, sub, alert, onClick, color }) => (
    <button onClick={onClick}
      style={{ width: "100%", textAlign: "right", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#64748B" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#94A3B8" }}>{sub}</div>}
      </div>
      {alert && <span style={{ fontSize: 10, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>⚠️ {alert}</span>}
      <span style={{ fontSize: 15, fontWeight: 800, color: color || "#0F172A" }}>{value}</span>
    </button>
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      {/* ═══════════ قسم صباحك (تعديل ٣٥) ═══════════ */}
      {showMorning && (
        <div style={{ background: "linear-gradient(135deg,#EFF6FF,#F5F3FF)", border: "1px solid #DDD6FE", borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#2563EB", marginBottom: 4 }}>{greeting} يا {user.name} ☀️</div>
          {daySentence && <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.8, marginBottom: 14 }}>{daySentence.text}</div>}

          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10, fontWeight: 600, textAlign: "center" }}>مودك النهارده</div>
          {moodStickers.length > 0 ? (
            <>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8, justifyContent: "center" }}>
                {moodStickers.map(x => {
                  const on = stickerPick && String(stickerPick.id) === String(x.id);
                  return (
                    <button key={x.id} onClick={() => { setStickerPick(on ? null : x); setMoodPick(on ? "" : x.name); }}
                      title={x.name}
                      style={{
                        padding: 8, borderRadius: 20,
                        border: `3px solid ${on ? "#7C3AED" : "transparent"}`,
                        background: on ? "#F5F3FF" : "transparent",
                        transform: on ? "scale(1.06)" : "scale(1)",
                        transition: "transform .15s, border-color .15s",
                      }}>
                      <img src={x.image_url} alt={x.name}
                        style={{ width: 104, height: 104, objectFit: "contain", display: "block", borderRadius: 14 }} />
                    </button>
                  );
                })}
              </div>
              <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: stickerPick ? "#7C3AED" : "#94A3B8", marginBottom: 14, minHeight: 20 }}>
                {stickerPick ? stickerPick.name : "اختار اللي على مودك"}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, justifyContent: "center" }}>
              {MOODS.map(m => (
                <button key={m} onClick={() => setMoodPick(moodPick === m ? "" : m)}
                  style={{ padding: "8px 12px", borderRadius: 20, border: `2px solid ${moodPick === m ? "#7C3AED" : "#E2E8F0"}`, background: moodPick === m ? "#F5F3FF" : "#FFFFFF", color: moodPick === m ? "#7C3AED" : "#64748B", fontSize: 13, fontWeight: moodPick === m ? 700 : 500 }}>
                  {m}
                </button>
              ))}
            </div>
          )}

          {todayQuestion && (
            <>
              <div style={{ fontSize: 13, color: "#0F172A", marginBottom: 8, fontWeight: 600, textAlign: "center" }}>{todayQuestion.text}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, justifyContent: "center" }}>
                {String(todayQuestion.options || "").split(",").map(x => x.trim()).filter(Boolean).map(o => (
                  <button key={o} onClick={() => setAnswerPick(answerPick === o ? "" : o)}
                    style={{ padding: "7px 12px", borderRadius: 20, border: `2px solid ${answerPick === o ? "#2563EB" : "#E2E8F0"}`, background: answerPick === o ? "#EFF6FF" : "#FFFFFF", color: answerPick === o ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: answerPick === o ? 700 : 500 }}>
                    {o}
                  </button>
                ))}
              </div>
            </>
          )}

          {goodThings.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid #A7F3D0", borderRadius: 12, padding: "10px 13px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 4 }}>💙 حاجات حلوة حصلت لك</div>
              {goodThings.map((g, i) => <div key={i} style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.7 }}>· {g}</div>)}
            </div>
          )}

          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.7 }}>
            {dueToday.length > 0
              ? `عندك ${dueToday.length} تاسك النهاردة، أقربها «${dueToday[0].title}»`
              : "مفيش تسليمات مستحقة النهاردة · يوم هادي"}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => saveMorning(false)} disabled={savingMood}
              style={{ flex: 1, background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 11, borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
              {savingMood ? "..." : "تمام ✓"}
            </button>
            <button onClick={() => saveMorning(true)} disabled={savingMood}
              style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#64748B", padding: "11px 20px", borderRadius: 12, fontSize: 13 }}>تخطّي</button>
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", textAlign: "center", marginTop: 10 }}>
            الإجابة اختيارية بالكامل · مالهاش أي علاقة بالتقييم ولا بالنقاط
          </div>
        </div>
      )}

      {morningOn && moodToday && !moodToday.skipped && moodToday.note && (
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: "#64748B" }}>
          مودك النهارده: <b style={{ color: "#0F172A" }}>{moodToday.note}</b>
          <button onClick={() => nav("mood")} style={{ background: "none", color: "#2563EB", fontSize: 11, marginRight: 8 }}>تغيير</button>
        </div>
      )}

      {/* ═══════════ شريط الترحيب ═══════════ */}
      <div style={{ ...C.card, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 17, ...C.heading }}>أهلاً {user.name} 👋</div>
          <div style={C.sub}>{new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
        {!myAtt
          ? <button onClick={clockIn} style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>🟢 بدء العمل</button>
          : clockedIn
            ? <button onClick={clockOut} style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>🔴 إنهاء العمل</button>
            : <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>✅ خلصت شغل النهاردة</span>
        }
      </div>

      {/* ═══════════ فلتر المدير: شغلي / فريقي (تعديل ١٢) ═══════════ */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["mine", "👤 شغلي"], ["team", "👥 فريقي"]].map(([v, l]) => (
            <button key={v} onClick={() => switchTab(v)}
              style={{ flex: 1, padding: "9px 6px", borderRadius: 8, border: "none", background: tab === v ? "#FFFFFF" : "transparent", color: tab === v ? "#0F172A" : "#64748B", fontSize: 13, fontWeight: tab === v ? 700 : 500, boxShadow: tab === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ═══════════ تبويب فريقي ═══════════ */}
      {isAdmin && tab === "team" && (() => {
        const teamLive = tasks.filter(t => t.status !== "cancelled");
        const tOverdue = teamLive.filter(t => t.due_date && String(t.due_date).slice(0,10) < today && t.status !== "completed");
        const tUrgent  = teamLive.filter(t => t.priority === "urgent" && t.status !== "completed");
        const tReview  = teamLive.filter(t => t.status === "pending_review");
        const tProg    = teamLive.filter(t => t.status === "in_progress");
        const tDone    = teamLive.filter(t => t.status === "completed");

        // مين محتاج متابعة
        const needFollow = members.map(m => {
          const late = tOverdue.filter(t => t.assigned_to === m.name).length;
          const stalled = teamLive.filter(t => t.assigned_to === m.name && t.status === "todo").length;
          return { m, late, stalled };
        }).filter(x => x.late > 0).sort((a, b) => b.late - a.late);

        // مين تحت ضغط (من نقاط الضغط أمس)
        const pressRows = ledger.filter(r => r.source === "pressure");

        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 8, marginBottom: 16 }}>
              <StatCard label="عاجلة"    value={tUrgent.length}  color="#DC2626" bg="#FECACA" filter={{ priority: "urgent" }} />
              <StatCard label="متأخرة"   value={tOverdue.length} color="#D97706" bg="#FDE68A" filter={{ overdue: true }} />
              <StatCard label="جارية"    value={tProg.length}    color="#2563EB" bg="#BFDBFE" filter={{ status: "in_progress" }} />
              <StatCard label="للمراجعة" value={tReview.length}  color="#7C3AED" bg="#DDD6FE" filter={{ status: "pending_review" }} />
              <StatCard label="طلب نجدة" value={teamLive.filter(t => t.status === "help_needed").length} color="#DB2777" bg="#FBCFE8" filter={{ status: "help_needed" }} />
              <StatCard label="مكتملة"   value={tDone.length}    color="#059669" bg="#A7F3D0" filter={{ status: "completed" }} />
              <StatCard label="الكل"     value={teamLive.length} color="#0F172A" bg="#E2E8F0" filter={{}} />
            </div>

            {/* مين شغال دلوقتي */}
            <div style={{ ...C.card, marginBottom: 16 }}>
              <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>🟢 مين شغال دلوقتي</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 6 }}>
                {members.map(m => {
                  const p = presenceOf(m.last_seen, Number(settings.idle_after_minutes) || 180);
                  const att = attendance.find(a => a.member_name === m.name);
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "7px 10px" }}>
                      <span style={{ fontSize: 11 }}>{p.icon}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: p.color, fontWeight: 700 }}>
                        {att && att.status === "leave" ? "🏖 إجازة" : p.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* طلبات محتاجة قرار */}
            {(leaves.length > 0 || tReview.length > 0) && (
              <div style={{ ...C.card, marginBottom: 16, borderRight: "3px solid #D97706" }}>
                <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>
                  ⏳ طلبات محتاجة قرارك ({leaves.length + tReview.length})
                </div>
                {leaves.map(r => (
                  <div key={r.id} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "9px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14 }}>🏖</span>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{r.member_name} · {r.days} يوم</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{formatDate(String(r.start_date).slice(0,10))} · {r.reason}</div>
                    </div>
                    <button onClick={() => decideLeave(r, true)} disabled={busy} style={{ background: "#059669", color: "#fff", padding: "5px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>اعتماد</button>
                    <button onClick={() => decideLeave(r, false)} disabled={busy} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "5px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>رفض</button>
                  </div>
                ))}
                {tReview.map(t => (
                  <div key={t.id} style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: "9px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14 }}>👀</span>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{t.assigned_to}</div>
                    </div>
                    <button onClick={() => decideTask(t, true)} disabled={busy} style={{ background: "#059669", color: "#fff", padding: "5px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>اعتماد</button>
                    <button onClick={() => decideTask(t, false)} disabled={busy} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#D97706", padding: "5px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>للتعديل</button>
                  </div>
                ))}
              </div>
            )}

            {/* طلبات الحقوني الجارية */}
            {helpOpenReqs.length > 0 && (
              <div style={{ ...C.card, marginBottom: 16, borderRight: "3px solid #DB2777" }}>
                <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>🆘 طلبات نجدة جارية ({helpOpenReqs.length})</div>
                {helpOpenReqs.map(r => (
                  <div key={r.id} style={{ background: "#FDF2F8", border: "1px solid #FBCFE8", borderRadius: 10, padding: "9px 12px", marginBottom: 5 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                      {r.requester} ← {r.helper}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{r.task_title}{r.project_name ? ` · ${r.project_name}` : ""}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{r.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {/* مين محتاج متابعة */}
            {needFollow.length > 0 && (
              <div style={{ ...C.card, marginBottom: 16, borderRight: "3px solid #DC2626" }}>
                <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>🔴 مين محتاج متابعة</div>
                {needFollow.map(({ m, late, stalled }) => (
                  <button key={m.id} onClick={() => nav("tasks", { overdue: true })}
                    style={{ width: "100%", textAlign: "right", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 11px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
                    <span style={{ flex: 1, fontSize: 13, color: "#0F172A" }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 700 }}>{late} متأخرة</span>
                    {stalled > 0 && <span style={{ fontSize: 11, color: "#94A3B8" }}>{stalled} واقفة</span>}
                  </button>
                ))}
              </div>
            )}

            {/* مين تحت ضغط */}
            {pressRows.length > 0 && (
              <div style={{ ...C.card, marginBottom: 16 }}>
                <div style={{ fontSize: 14, ...C.heading, marginBottom: 4 }}>💪 مين كان تحت ضغط</div>
                <div style={C.sub}>للمتابعة بس · إعادة توزيع أو تأجيل تسليم أو تخفيف حمل</div>
                <div style={{ marginTop: 8 }}>
                  {pressRows.slice(0, 6).map(r => (
                    <div key={r.id} style={{ background: "#FDF2F8", border: "1px solid #FBCFE8", borderRadius: 10, padding: "7px 11px", marginBottom: 5, fontSize: 12, color: "#0F172A" }}>
                      <b>{r.member_name}</b> · {r.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ترتيب الفريق */}
            <div style={{ ...C.card, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, ...C.heading }}>🏅 ترتيب الفريق</div>
                <button onClick={() => nav("score")} style={{ background: "none", color: "#2563EB", fontSize: 12, fontWeight: 600 }}>التفاصيل ←</button>
              </div>
              {ranked.slice(0, 8).map((n2, i) => {
                const m = members.find(x => x.name === n2);
                const nomPct = myNomOf(n2);
                return (
                  <div key={n2} style={{ display: "flex", alignItems: "center", gap: 8, background: i === 0 ? "#FFFBEB" : "#F8FAFC", border: `1px solid ${i === 0 ? "#FDE68A" : "#E2E8F0"}`, borderRadius: 10, padding: "7px 11px", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, minWidth: 20 }}>{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: (m && m.avatar_color) || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{n2[0]}</div>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#0F172A" }}>{n2}</span>
                    {nomPct != null && <span style={{ fontSize: 11, color: "#D97706", fontWeight: 700 }}>{nomPct}%</span>}
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#2563EB" }}>{Math.round((totals[n2] || 0) * 10) / 10}</span>
                  </div>
                );
              })}
            </div>

            {/* حضور اليوم */}
            <div style={C.card}>
              <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>⏰ حضور النهاردة</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 6 }}>
                {members.map(m => {
                  const att = attendance.find(a => a.member_name === m.name);
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "7px 10px" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                      {att && att.status === "leave"
                        ? <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>🏖</span>
                        : att && att.clock_in
                          ? <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>{new Date(att.clock_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                          : <span style={{ fontSize: 11, color: "#DC2626" }}>لم يسجل</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* ═══════════ إنجازاتي هذا الشهر (تعديل ١١ + ١٣) ═══════════ */}
      {!isAdmin && (
        <div style={{ ...C.card, marginBottom: 16, borderTop: "3px solid #7C3AED" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <div style={{ fontSize: 14, ...C.heading }}>🌟 إنجازاتي الشهر ده</div>
            <span style={C.sub}>{CURRENT_MONTH}</span>
          </div>

          {topMsg && (
            <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 12, padding: "9px 13px", fontSize: 13, color: "#7C3AED", marginBottom: 12, lineHeight: 1.7, fontWeight: 600 }}>
              {topMsg.t}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <AchRow icon="🏆" label="نسبة الترشيح لموظف الشهر"
              value={`${myNom && myNom.percentage != null ? myNom.percentage : 0}%`}
              onClick={() => nav("eom")} color="#D97706" />
            <div style={{ background: "#F1F5F9", borderRadius: 6, height: 7, overflow: "hidden", margin: "-2px 0 4px" }}>
              <div style={{ width: `${myNom && myNom.percentage != null ? myNom.percentage : 0}%`, height: "100%", background: "#D97706", borderRadius: 6 }}></div>
            </div>

            <AchRow icon="🏅" label="ترتيبك في الفريق" value={`${myRank || "—"} من ${names.length}`}
              alert={alerts.rank} onClick={() => nav("score")} color="#2563EB" />

            <AchRow icon="⭐" label="رصيد النقاط" value={myPoints} onClick={() => nav("score")} color="#059669" />

            <AchRow icon="⏱" label="ساعات الشهر" value={fmtH(monthMins)}
              sub={`المتوقع لحد النهاردة ${fmtH(expectedMins)}`}
              alert={alerts.hours} onClick={() => nav("hours")} color={hoursPct < hoursThreshold ? "#DC2626" : "#0F172A"} />

            <AchRow icon="🎖" label="الميداليات" value={`${medalCount} من ${medalTotal}`} onClick={() => nav("badges")} color="#7C3AED" />

            <AchRow icon="🎁" label="جايزة الأسبوع"
              value={wonThisWeek.length > 0 ? "خدتها" : "لسه"}
              sub={wonThisWeek.length > 0 ? wonThisWeek[0].gift_name : "شد حيلك عشان تاخد جايزة"}
              onClick={() => nav("draws")} color={wonThisWeek.length > 0 ? "#059669" : "#94A3B8"} />
          </div>

          {lastFeedback && (
            <div style={{ background: lastFeedback.feedback_positive ? "#ECFDF5" : "#FFFBEB", border: `1px solid ${lastFeedback.feedback_positive ? "#A7F3D0" : "#FDE68A"}`, borderRadius: 12, padding: "9px 13px", marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: lastFeedback.feedback_positive ? "#059669" : "#D97706", marginBottom: 3 }}>
                {lastFeedback.feedback_positive ? "💙 آخر فيدباك" : "📌 آخر ملاحظة"}
              </div>
              <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.6 }}>
                {lastFeedback.feedback_positive || lastFeedback.feedback_negative}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ كروت الإحصائيات ═══════════ */}
      {(!isAdmin || tab === "mine") && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 8, marginBottom: 16 }}>
        <StatCard label="عاجلة"   value={urgent.length}     color="#DC2626" bg="#FECACA" filter={{ priority: "urgent" }} />
        <StatCard label="متأخرة"  value={overdue.length}    color="#D97706" bg="#FDE68A" filter={{ overdue: true }} />
        <StatCard label="جارية"   value={inProgress.length} color="#2563EB" bg="#BFDBFE" filter={{ status: "in_progress" }} />
        <StatCard label="للمراجعة" value={review.length}    color="#7C3AED" bg="#DDD6FE" filter={{ status: "pending_review" }} />
        <StatCard label="طلب نجدة" value={live.filter(t => t.status === "help_needed").length} color="#DB2777" bg="#FBCFE8" filter={{ status: "help_needed" }} />
        <StatCard label="مكتملة"  value={completed.length}  color="#059669" bg="#A7F3D0" filter={{ status: "completed" }} />
        <StatCard label="الكل"    value={live.length}       color="#0F172A" bg="#E2E8F0" filter={{}} />
      </div>
      )}

      {/* ═══════════ العاجلة والمتأخرة ═══════════ */}
      {(!isAdmin || tab === "mine") && (urgent.length > 0 || overdue.length > 0) && (
        <div style={{ ...C.card, marginBottom: 16, borderRight: "3px solid #DC2626" }}>
          <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>🔴 محتاجة انتباه</div>
          {[...urgent, ...overdue.filter(t => !urgent.some(u => u.id === t.id))].slice(0, 6).map(t => {
            const st = STATUS_CONFIG[t.status] || {};
            const late = t.due_date && String(t.due_date).slice(0, 10) < today;
            return (
              <div key={t.id} onClick={() => nav("tasks")}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 11px", marginBottom: 5, cursor: "pointer" }}>
                <span>{(PRIORITY_CONFIG[t.priority] || {}).icon || "•"}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                {late && <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 700 }}>متأخرة</span>}
                <span style={{ fontSize: 11, color: "#94A3B8" }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ تاسكاتي ═══════════ */}
      {(!isAdmin || tab === "mine") && (
      <div style={{ ...C.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, ...C.heading }}>📋 تاسكاتي</div>
          <button onClick={() => nav("tasks")} style={{ background: "none", color: "#2563EB", fontSize: 12, fontWeight: 600 }}>عرض الكل ←</button>
        </div>
        {myTasks.filter(t => t.status !== "completed" && t.status !== "cancelled").slice(0, 6).map(t => (
          <div key={t.id} onClick={() => nav("tasks")}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 11px", marginBottom: 5, cursor: "pointer" }}>
            <span>{(STATUS_CONFIG[t.status] || {}).icon || "•"}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
            {t.due_date && <span style={{ fontSize: 11, color: "#94A3B8" }}>{formatDate(String(t.due_date).slice(0, 10))}</span>}
          </div>
        ))}
        {myTasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length === 0 && (
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 14 }}>مفيش تاسكات مفتوحة · تمام كده 👏</div>
        )}
      </div>
      )}

      {/* ═══════════ الإشعارات ═══════════ */}
      {(!isAdmin || tab === "mine") && (
      <div style={{ ...C.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, ...C.heading }}>🔔 آخر الإشعارات</div>
          <button onClick={() => nav("notifications")} style={{ background: "none", color: "#2563EB", fontSize: 12, fontWeight: 600 }}>عرض الكل ←</button>
        </div>
        {notifs.length === 0
          ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 14 }}>مفيش إشعارات</div>
          : notifs.slice(0, 5).map(n => (
            <div key={n.id} style={{ background: n.is_read ? "#F8FAFC" : "#EFF6FF", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 11px", marginBottom: 5 }}>
              <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.5 }}>{n.content}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{timeAgo(n.created_at)}</div>
            </div>
          ))
        }
      </div>
      )}

      {/* ═══════════ حضور اليوم ═══════════ */}
      {!isAdmin && (
      <div style={C.card}>
        <div style={{ fontSize: 14, ...C.heading, marginBottom: 10 }}>⏰ حضور النهاردة</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 6 }}>
          {members.map(m => {
            const att = attendance.find(a => a.member_name === m.name);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "7px 10px" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                {att && att.status === "leave"
                  ? <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>🏖</span>
                  : att && att.clock_in
                    ? <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>{new Date(att.clock_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                    : <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>
                }
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
