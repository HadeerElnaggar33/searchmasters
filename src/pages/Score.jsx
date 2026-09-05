import { useState, useEffect } from "react";
import { sb, MONTHS, CURRENT_MONTH, formatDate, addNotification } from "../supabase.js";
import { SCORE, SOURCE_LABEL, addScore, replaceTaskScore, replaceScoreByRef, loadLedger, totalsFrom, rankMembers, loadPointsConfig, DEFAULT_PTS } from "../score.js";
import { loadWorkConfig, isWorkingDay } from "../workdays.js";

const Q = [
  { key: "deadline",   label: "الالتزام بالمواعيد", opts: [["excellent", "ممتاز"], ["normal", "عادي"], ["weak", "ضعيف"]] },
  { key: "quality",    label: "جودة الشغل",         opts: [["excellent", "ممتاز"], ["normal", "عادي"], ["weak", "ضعيف"]] },
  { key: "initiative", label: "المبادرة والتعاون",   opts: [["excellent", "ممتاز"], ["normal", "عادي"], ["none", "مافيش"]] },
];

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const KINDS = [
  ["learned_new",  "اتعلمت حاجة جديدة"],
  ["learned_peer", "اتعلمت حاجة من زميل"],
  ["shared",       "شاركت حاجة مع الفريق"],
  ["simplified",   "سهّلت حاجة على الفريق"],
];

const OPPORTUNITIES = [
  ["📚", "اتعلم حاجة جديدة", "تتعلم مهارة جديدة وتبلّغ المدير إنك بقيت تعرف تعملها، وتدّي مثال عملي على شغل حقيقي", true],
  ["🤝", "اتعلم حاجة زميلك بيعملها", "تتعلمها منه وتظبطها على شغلك وتبلّغ المدير بمثال عملي", true],
  ["📢", "شارك حاجة مع الفريق", "تشرح للفريق حاجة إنت عارفها، أو تشارك أداة أو طريقة استفدت منها", true],
  ["⚡", "سهّل حاجة على الفريق", "تلاقي طريقة تختصر وقت أو مجهود على الكل وتبلّغ المدير بيها", true],
  ["🆘", "ساعد زميل", "ترد على طلب نجدة أو تساعد في تاسك مش بتاعتك", false],
  ["🧹", "اشتغل على متأخراتك", "تصفّي التاسكات المتأخرة عندك", false],
  ["⏱", "كمّل ساعاتك", "توصل لهدف الساعات الأسبوعي والشهري", false],
];

export default function Score({ user }) {
  const [members, setMembers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [cfg, setCfg] = useState({ workingDays: [0, 1, 2, 3, 4], holidays: [] });
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [view, setView] = useState("me");
  const [reviewDate, setReviewDate] = useState("");
  const [openMember, setOpenMember] = useState(null);
  const [answers, setAnswers] = useState({});          // { member: {deadline,quality,initiative} }
  const [manual, setManual] = useState(null);
  const [manualForm, setManualForm] = useState({ points: "", reason: "" });
  const [ptsCfg, setPtsCfg] = useState(DEFAULT_PTS);
  const [srcFilter, setSrcFilter] = useState("all");
  const [reports, setReports] = useState([]);
  const [showReport, setShowReport] = useState(false);
  const [repForm, setRepForm] = useState({ kind: "learned_new", description: "", proof: "", learned_from: "" });
  const [decide, setDecide] = useState(null);
  const [decideForm, setDecideForm] = useState({ level: "medium", note: "" });

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };

  // ── آخر يوم عمل قبل النهارده ──
  function lastWorkingDay(c) {
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      d.setDate(d.getDate() - 1);
      const s = toISO(d);
      if (isWorkingDay(s, c)) return s;
    }
    return toISO(new Date());
  }

  useEffect(() => { loadAll(); }, [selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const [m, lg, t, c, rv, pc, ar] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      loadLedger(selectedMonth),
      sb(`tasks?month=eq.${encodeURIComponent(selectedMonth)}`),
      loadWorkConfig(),
      sb("daily_reviews?order=review_date.desc"),
      loadPointsConfig(),
      sb("achievement_reports?order=created_at.desc"),
    ]);
    if (pc) setPtsCfg(pc);
    if (ar) setReports(ar);
    if (m) setMembers(m);
    setLedger(lg);
    if (t) setTasks(t);
    if (c) { setCfg(c); if (!reviewDate) setReviewDate(lastWorkingDay(c)); }
    if (rv) setReviews(rv);
    setLoading(false);
  }

  const totals = totalsFrom(ledger);
  const names = members.map(m => m.name);
  const ranked = rankMembers(names, totals);
  const myRank = ranked.indexOf(user.name) + 1;
  const myTotal = totals[user.name] || 0;

  function movesOf(name) {
    return ledger.filter(r => r.member_name === name);
  }

  // مجموعة حركات كل يوم
  // الرصيد قبل وبعد كل حركة (تعديل ٥٧)
  function movesWithBalance(name) {
    const rows = [...movesOf(name)].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let bal = 0;
    const out = rows.map(r => {
      const before = bal;
      bal = Math.round((bal + Number(r.points || 0)) * 10) / 10;
      return { ...r, before, after: bal };
    });
    return out.reverse();
  }

  function movesByDay(name) {
    const map = {};
    const src = movesWithBalance(name).filter(r => srcFilter === "all" || r.source === srcFilter);
    for (const r of src) {
      const d = String(r.created_at).slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(r);
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }

  // ── تاسكات اليوم اللي بيتقيّم ──
  function tasksOfDay(name, date) {
    return tasks.filter(t => {
      if (t.assigned_to !== name) return false;
      const comp = t.completed_at ? String(t.completed_at).slice(0, 10) : null;
      const due = t.due_date ? String(t.due_date).slice(0, 10) : null;
      return comp === date || (due === date && t.status !== "completed");
    });
  }

  function reviewOf(name, date) {
    return reviews.find(r => r.member_name === name && String(r.review_date).slice(0, 10) === date) || null;
  }

  function answersFor(name) {
    const saved = reviewOf(name, reviewDate);
    return answers[name] || (saved ? { deadline: saved.deadline, quality: saved.quality, initiative: saved.initiative } : {});
  }

  function setAnswer(name, key, val) {
    setAnswers(a => ({ ...a, [name]: { ...answersFor(name), [key]: val } }));
  }

  // ── تقييم تاسك من شاشة التقييم اليومي ──
  async function rateTask(task, n) {
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { rating: n });
    await replaceTaskScore({
      member: task.assigned_to, month: task.month || selectedMonth,
      source: "rating", points: SCORE.rating[n],
      reason: `تقييم ${n}/5: ${task.title}`, taskId: task.id, by: user.name,
    });
    await loadAll();
  }

  // ── حفظ الأسئلة التلاتة لعضو ──
  async function saveReview(name) {
    const a = answersFor(name);
    if (!a.deadline || !a.quality || !a.initiative) { alert("جاوبي التلات أسئلة"); return; }
    setSaving(true);
    const ref = `daily:${reviewDate}:${name}`;
    const existing = reviewOf(name, reviewDate);

    if (existing) {
      await sb(`daily_reviews?id=eq.${existing.id}`, "PATCH", { ...a, created_by: user.name, updated_at: new Date().toISOString() });
    } else {
      await sb("daily_reviews", "POST", { member_name: name, review_date: reviewDate, ...a, created_by: user.name });
    }

    const dLabel = formatDate(reviewDate);
    for (const q of Q) {
      const val = a[q.key];
      const pts = SCORE[q.key][val];
      await replaceScoreByRef({
        member: name, month: selectedMonth, source: `daily_${q.key}`,
        points: pts, ref, by: user.name,
        reason: `${q.label} — ${q.opts.find(o => o[0] === val)?.[1]} (${dLabel})`,
      });
    }

    setSaving(false);
    setAnswers(a2 => { const c = { ...a2 }; delete c[name]; return c; });
    await loadAll();
  }

  // ── بلاغ إنجاز ──
  async function sendReport() {
    if (!repForm.description.trim()) { alert("اكتب إيه اللي عملته"); return; }
    if (!repForm.proof.trim()) { alert("محتاجين مثال عملي — رابط أو اسم تاسك"); return; }
    setSaving(true);
    await sb("achievement_reports", "POST", {
      member_name: user.name, kind: repForm.kind,
      description: repForm.description.trim(), proof: repForm.proof.trim(),
      learned_from: repForm.learned_from.trim() || null,
      month: selectedMonth, status: "pending",
    });
    for (const m of members.filter(x => x.role === "admin")) {
      await addNotification(m.name, `📣 ${user.name} بلّغ عن إنجاز — محتاج مراجعتك`, "info");
    }
    setSaving(false); setShowReport(false);
    setRepForm({ kind: "learned_new", description: "", proof: "", learned_from: "" });
    await loadAll();
  }

  async function decideReport(status) {
    if (!decide) return;
    setSaving(true);
    const lvlPts = { small: Number(ptsCfg.impact_small ?? 10), medium: Number(ptsCfg.impact_medium ?? 15), big: Number(ptsCfg.impact_big ?? 25) };
    const pts = status === "approved" ? lvlPts[decideForm.level] : null;

    await sb(`achievement_reports?id=eq.${decide.id}`, "PATCH", {
      status, level: status === "approved" ? decideForm.level : null,
      points: pts, decided_by: user.name, decided_at: new Date().toISOString(),
      decision_note: decideForm.note.trim() || null,
    });

    if (status === "approved") {
      await addScore({ member: decide.member_name, month: decide.month || selectedMonth, points: pts, source: "manual",
        reason: `إنجاز معتمد: ${decide.description.slice(0, 60)}`, by: user.name });
      await addNotification(decide.member_name, `🌟 اتعمد بلاغ إنجازك · +${pts} نقطة`, "info");
      // الزميل اللي اتعلّم منه بياخد نقاط كمان
      if (decide.learned_from) {
        const share = Number(ptsCfg.pts_peer_share ?? 5);
        if (share > 0) {
          await addScore({ member: decide.learned_from, month: decide.month || selectedMonth, points: share, source: "manual",
            reason: `${decide.member_name} اتعلّم منك حاجة`, by: user.name });
          await addNotification(decide.learned_from, `🤝 ${decide.member_name} اتعلّم منك حاجة · +${share} نقطة`, "info");
        }
      }
    } else {
      await addNotification(decide.member_name,
        status === "needs_info" ? `📝 بلاغ إنجازك محتاج توضيح${decideForm.note ? ` — ${decideForm.note}` : ""}` : `بلاغ إنجازك اترفض${decideForm.note ? ` — ${decideForm.note}` : ""}`, "info");
    }

    setSaving(false); setDecide(null); setDecideForm({ level: "medium", note: "" });
    await loadAll();
  }

  // ── نقاط يدوية ──
  async function saveManual() {
    const p = Number(manualForm.points);
    if (!Number.isFinite(p) || p === 0) { alert("اكتبي رقم موجب أو سالب"); return; }
    if (!manualForm.reason.trim()) { alert("السبب إجباري — وهيظهر لكل الفريق"); return; }
    setSaving(true);
    await addScore({
      member: manual, month: selectedMonth, points: p, source: "manual",
      reason: manualForm.reason.trim(), by: user.name,
    });
    await addNotification(manual, `${p > 0 ? "➕" : "➖"} ${p > 0 ? "+" : ""}${p} نقطة — ${manualForm.reason.trim()}`, "info");
    setSaving(false);
    setManual(null);
    setManualForm({ points: "", reason: "" });
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const Pts = ({ v, size = 13 }) => (
    <span style={{ fontSize: size, fontWeight: 800, color: v > 0 ? "#059669" : v < 0 ? "#DC2626" : "#94A3B8" }}>
      {v > 0 ? "+" : ""}{v}
    </span>
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>⭐ النقاط</h2>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
          {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
        </select>
      </div>

      {!isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["me", "رصيدي"], ["howto", "📐 بتتحسب إزاي"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: view === v ? "#FFFFFF" : "transparent", color: view === v ? "#0F172A" : "#64748B", fontSize: 12, fontWeight: view === v ? 700 : 500, boxShadow: view === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>{l}</button>
          ))}
        </div>
      )}

      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["me", "رصيدي"], ["team", "الترتيب"], ["howto", "📐 بتتحسب إزاي"], ["review", "📋 التقييم اليومي"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: view === v ? "#FFFFFF" : "transparent", color: view === v ? "#0F172A" : "#64748B", fontSize: 12, fontWeight: view === v ? 700 : 500, boxShadow: view === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ═══════════ رصيدي ═══════════ */}
      {view === "me" && (
        <>
          <div style={{ ...card, borderTop: "4px solid #2563EB", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>رصيدك في {selectedMonth}</div>
            <div style={{ fontSize: 46, fontWeight: 800, color: myTotal >= 0 ? "#2563EB" : "#DC2626", lineHeight: 1.1 }}>
              {myTotal > 0 ? "+" : ""}{myTotal}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>
              ترتيبك <b style={{ color: "#0F172A", fontSize: 16 }}>{myRank || "—"}</b> من {names.length}
              {myRank === 1 && <span style={{ color: "#D97706", fontWeight: 700 }}> · 🏆 المتصدر</span>}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, lineHeight: 1.6 }}>
              الرصيد بيتصفّر أول كل شهر، وسجل الشهور السابقة بيفضل محفوظ
            </div>
          </div>

          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>📜 سجل النقاط</div>
              <select value={srcFilter} onChange={e => setSrcFilter(e.target.value)} style={{ ...inp, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                <option value="all">كل المصادر</option>
                {[...new Set(movesOf(user.name).map(r => r.source))].map(k => (
                  <option key={k} value={k}>{SOURCE_LABEL[k] || k}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12, lineHeight: 1.7 }}>
              السجل ده مش بيتحذف ولا بيتعدّل من أي حساب · أي تصحيح بيتعمل بحركة عكسية مسجلة بسببها
            </div>
            {movesByDay(user.name).length === 0
              ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "16px 0" }}>مفيش حركات على رصيدك الشهر ده</div>
              : movesByDay(user.name).map(([day, rows]) => {
                  const sum = rows.reduce((s, r) => s + Number(r.points), 0);
                  return (
                    <div key={day} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                          {new Date(day + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "short" })}
                        </span>
                        <div style={{ flex: 1, height: 1, background: "#E2E8F0" }}></div>
                        <Pts v={sum} size={14} />
                      </div>
                      {rows.map(r => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "7px 10px", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#64748B", padding: "1px 8px", borderRadius: 6, flexShrink: 0 }}>
                            {SOURCE_LABEL[r.source] || r.source}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12, color: "#0F172A", lineHeight: 1.5 }}>{r.reason || "—"}</span>
                            <span style={{ display: "block", fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                              {new Date(r.created_at).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {r.after != null ? ` · الرصيد ${r.before} ← ${r.after}` : ""}
                            </span>
                          </span>
                          <Pts v={Number(r.points)} />
                        </div>
                      ))}
                    </div>
                  );
                })
            }
          </div>
        </>
      )}

      {/* ═══════════ النقاط بتتحسب إزاي ═══════════ */}
      {view === "howto" && (
        <>
          <div style={{ ...card, borderTop: "4px solid #2563EB" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>📐 إنت فين دلوقتي</div>
            <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 2 }}>
              رصيدك <b style={{ color: "#2563EB", fontSize: 16 }}>{myTotal}</b> نقطة · ترتيبك <b>{myRank || "—"}</b> من {names.length}
              {myRank > 1 && (() => {
                const above = ranked[myRank - 2];
                const diff = Math.round(((totals[above] || 0) - myTotal) * 10) / 10;
                return <><br />فاضل لك <b style={{ color: "#D97706" }}>{diff}</b> نقطة وتعدّي {above}</>;
              })()}
              {myRank === 1 && <><br /><b style={{ color: "#059669" }}>إنت المتصدر · ثبّت مكانك</b></>}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>الرصيد بيتحسب إزاي</div>
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "11px 14px", fontSize: 12, color: "#2563EB", lineHeight: 1.9, marginBottom: 14 }}>
              النقاط بتتجمع من شغلك اليومي ومن الحاجات اللي بتتعلمها ومن اللي بتساعد بيه زمايلك<br />
              رصيدك بيحدد ترتيبك في الفريق وترشيحك لموظف الشهر<br />
              نقاط السحب العشوائي منفصلة تماماً ومالهاش علاقة برصيدك ده
            </div>

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>📋 معادلة التاسك</div>
              <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.9 }}>
                (الأساس <b>{ptsCfg.pts_base}</b> × معامل الأولوية × معامل الصعوبة) + الإضافات
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>الأولوية</div>
                  {[["منخفضة", ptsCfg.pts_prio_low], ["متوسطة", ptsCfg.pts_prio_medium], ["عالية", ptsCfg.pts_prio_high], ["عاجلة", ptsCfg.pts_prio_urgent]].map(([l, v]) => (
                    <div key={l} style={{ fontSize: 12, color: "#0F172A", padding: "2px 0" }}>{l} <b style={{ color: "#2563EB" }}>×{v}</b></div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>الصعوبة</div>
                  {[["سهلة", ptsCfg.pts_diff_easy], ["متوسطة", ptsCfg.pts_diff_medium], ["صعبة", ptsCfg.pts_diff_hard], ["صعبة جداً", ptsCfg.pts_diff_very_hard]].map(([l, v]) => (
                    <div key={l} style={{ fontSize: 12, color: "#0F172A", padding: "2px 0" }}>{l} <b style={{ color: "#2563EB" }}>×{v}</b></div>
                  ))}
                </div>
              </div>
            </div>

            {[
              ["➕ إضافات التاسك", [
                ["سلّمتها قبل ميعادها", ptsCfg.pts_bonus_early],
                ["من غير ريفيجن", ptsCfg.pts_bonus_no_revision],
                ["بياناتها كاملة عند التسليم", ptsCfg.pts_bonus_full_data],
                ["اتسلّمت بعد ميعادها", ptsCfg.pts_penalty_late],
                ["شغل متواصل ساعتين", ptsCfg.pts_session_2h],
                ["شغل متواصل 4 ساعات", ptsCfg.pts_session_4h],
              ]],
              ["⏱ الساعات", [
                ["ساعة في يوم عمل", ptsCfg.pts_hour_normal],
                ["ساعة خارج أيام العمل", ptsCfg.pts_hour_extra],
                ["ساعة تدريب", ptsCfg.pts_hour_training],
              ]],
              ["📊 التقييم اليومي", [
                ["الالتزام بالمواعيد — ممتاز", SCORE.deadline.excellent],
                ["جودة الشغل — ممتاز", SCORE.quality.excellent],
                ["المبادرة والتعاون — ممتاز", SCORE.initiative.excellent],
                ["أي بند — عادي", 1],
                ["أي بند — ضعيف", -1],
              ]],
              ["⭐ التقييم والفيدباك", [
                ["تقييم 5 نجوم", SCORE.rating[5]],
                ["تقييم 4", SCORE.rating[4]],
                ["تقييم 3", SCORE.rating[3]],
                ["تقييم 2", SCORE.rating[2]],
                ["تقييم 1", SCORE.rating[1]],
                ["فيدباك إيجابي", SCORE.feedbackPos],
                ["فيدباك سلبي", SCORE.feedbackNeg],
              ]],
              ["➕ المبادرة", [
                ["ضفت تاسك لنفسك ونفّذتها", ptsCfg.pts_initiative_self],
                ["ضفت تاسك لزميل وخلّصها", ptsCfg.pts_initiative_other],
              ]],
              ["💪 الضغط اليومي", [
                ["يوم ضغطه مرتفع", `+${Math.round((Number(ptsCfg.press_mult_high ?? 1.25) - 1) * 100)}٪`],
                ["يوم ضغطه عالي جداً", `+${Math.round((Number(ptsCfg.press_mult_very ?? 1.5) - 1) * 100)}٪`],
              ]],
            ].map(([g, rows]) => (
              <div key={g} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>{g}</div>
                {rows.map(([l, v]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #F1F5F9" }}>
                    <span style={{ flex: 1, fontSize: 12, color: "#0F172A" }}>{l}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: typeof v === "string" ? "#7C3AED" : Number(v) > 0 ? "#059669" : "#DC2626" }}>
                      {typeof v === "string" ? v : (Number(v) > 0 ? `+${v}` : v)}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#D97706", lineHeight: 1.9 }}>
              <b>حاجات مالهاش نقاط عن قصد:</b><br />
              الفيدباك والملاحظات — عشان تتكتب لما تستاهل مش عشان الرصيد<br />
              ملء بيانات التاسك عند الإنشاء — ده واجب أساسي مش إنجاز<br />
              فتح الصفحات والتصفح — النقاط مقابل مجهود فعلي بس
            </div>
          </div>

          {/* فرص زيادة الرصيد */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🚀 فرص تزوّد بيها رصيدك</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>اللي عليها علامة 📣 محتاجة تبلّغ عنها عشان النظام مش بيقدر يقيسها لوحده</div>
            {OPPORTUNITIES.map(([icon, title, desc, needsReport]) => (
              <div key={title} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 13px", marginBottom: 7, display: "flex", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                    {title} {needsReport && <span style={{ fontSize: 10, color: "#7C3AED" }}>📣</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
            <button onClick={() => setShowReport(true)}
              style={{ width: "100%", background: "linear-gradient(135deg,#7C3AED,#2563EB)", color: "#fff", padding: 12, borderRadius: 12, fontSize: 14, fontWeight: 700, marginTop: 8 }}>
              📣 بلّغ عن إنجاز
            </button>
          </div>

          {/* بلاغاتي */}
          {reports.filter(r => r.member_name === user.name).length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>📣 بلاغاتي</div>
              {reports.filter(r => r.member_name === user.name).map(r => {
                const st = { pending: ["⏳ قيد المراجعة", "#D97706", "#FFFBEB", "#FDE68A"], approved: ["✅ معتمد", "#059669", "#ECFDF5", "#A7F3D0"], needs_info: ["📝 محتاج توضيح", "#2563EB", "#EFF6FF", "#BFDBFE"], rejected: ["❌ مرفوض", "#DC2626", "#FEF2F2", "#FECACA"] }[r.status] || [];
                return (
                  <div key={r.id} style={{ background: st[2], border: `1px solid ${st[3]}`, borderRadius: 11, padding: "9px 12px", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: st[1], fontWeight: 700 }}>{st[0]}</span>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>{(KINDS.find(k => k[0] === r.kind) || [])[1]}</span>
                      <div style={{ flex: 1 }}></div>
                      {r.points && <span style={{ fontSize: 13, fontWeight: 800, color: "#059669" }}>+{r.points}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#0F172A", marginTop: 4, lineHeight: 1.6 }}>{r.description}</div>
                    {r.decision_note && <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>💬 {r.decision_note}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* مراجعة البلاغات — للمدير */}
          {isAdmin && reports.filter(r => r.status === "pending").length > 0 && (
            <div style={{ ...card, borderTop: "3px solid #D97706" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                📣 بلاغات مستنية قرارك ({reports.filter(r => r.status === "pending").length})
              </div>
              {reports.filter(r => r.status === "pending").map(r => (
                <div key={r.id} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "11px 13px", marginBottom: 7 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{r.member_name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 5 }}>{(KINDS.find(k => k[0] === r.kind) || [])[1]}{r.learned_from ? ` · من ${r.learned_from}` : ""}</div>
                  <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.7 }}>{r.description}</div>
                  <div style={{ fontSize: 11, color: "#2563EB", marginTop: 4, wordBreak: "break-all" }}>🔗 {r.proof}</div>
                  <button onClick={() => { setDecide(r); setDecideForm({ level: "medium", note: "" }); }}
                    style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, marginTop: 8 }}>
                    راجعي
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════ الترتيب ═══════════ */}
      {isAdmin && view === "team" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🏅 ترتيب الفريق</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14 }}>الترتيب مرئي لكل الفريق · صاحب أعلى رصيد آخر الشهر بياخد الهدية</div>
          {ranked.map((name, i) => {
            const m = members.find(x => x.name === name);
            const v = totals[name] || 0;
            const mv = movesOf(name);
            const open = openMember === name;
            return (
              <div key={name} style={{ background: i === 0 ? "#FFFBEB" : "#F8FAFC", border: `1px solid ${i === 0 ? "#FDE68A" : "#E2E8F0"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, minWidth: 24 }}>{["🥇", "🥈", "🥉"][i] || `${i + 1}.`}</span>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: m?.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{mv.length} حركة</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: v >= 0 ? "#2563EB" : "#DC2626" }}>{v > 0 ? "+" : ""}{v}</div>
                  <button onClick={() => { setManual(name); setManualForm({ points: "", reason: "" }); }}
                    style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>± نقاط</button>
                  <button onClick={() => setOpenMember(open ? null : name)}
                    style={{ background: "none", color: "#94A3B8", fontSize: 12, flexShrink: 0 }}>{open ? "▲" : "▼"}</button>
                </div>
                {open && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    {mv.length === 0 && <div style={{ fontSize: 12, color: "#94A3B8" }}>مفيش حركات</div>}
                    {mv.map(r => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 10px" }}>
                        <span style={{ fontSize: 10, color: "#64748B", flexShrink: 0 }}>{SOURCE_LABEL[r.source] || r.source}</span>
                        <span style={{ fontSize: 11, color: "#0F172A", flex: 1, minWidth: 0 }}>{r.reason || "—"}</span>
                        <Pts v={Number(r.points)} size={12} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ التقييم اليومي ═══════════ */}
      {isAdmin && view === "review" && (
        <>
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>اليوم اللي بيتقيّم</div>
            <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} style={inp} />
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8, lineHeight: 1.7 }}>
              الافتراضي آخر يوم عمل قبل النهارده. تقدري تقيّمي أي يوم، والتعديل بيستبدل النقط القديمة مش بيزودها.
            </div>
          </div>

          {members.map(m => {
            const dayTasks = tasksOfDay(m.name, reviewDate);
            const a = answersFor(m.name);
            const saved = reviewOf(m.name, reviewDate);
            const done = !!saved;
            const complete = a.deadline && a.quality && a.initiative;
            const preview = complete ? Q.reduce((s, q) => s + SCORE[q.key][a[q.key]], 0) : null;

            return (
              <div key={m.id} style={{ ...card, marginBottom: 12, borderRight: done ? "4px solid #059669" : "4px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{dayTasks.length} تاسك في اليوم ده · الرصيد {totals[m.name] || 0}</div>
                  </div>
                  {done && <span style={{ fontSize: 11, background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", padding: "2px 10px", borderRadius: 20, fontWeight: 700 }}>✓ اتقيّم</span>}
                </div>

                {/* تاسكات اليوم */}
                {dayTasks.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>تقييم التاسكات (اختياري)</div>
                    {dayTasks.map(t => (
                      <div key={t.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
                        <div style={{ fontSize: 12, color: "#0F172A", marginBottom: 6, lineHeight: 1.5 }}>
                          {t.status === "completed" ? "✅" : "⏳"} {t.title}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {[1, 2, 3, 4, 5].map(n => {
                            const on = t.rating === n;
                            const good = SCORE.rating[n] > 0;
                            return (
                              <button key={n} onClick={() => rateTask(t, n)}
                                style={{ padding: "4px 9px", borderRadius: 8, border: `1.5px solid ${on ? (good ? "#059669" : "#DC2626") : "#E2E8F0"}`, background: on ? (good ? "#ECFDF5" : "#FEF2F2") : "#FFFFFF", color: on ? (good ? "#059669" : "#DC2626") : "#94A3B8", fontSize: 11, fontWeight: on ? 700 : 500 }}>
                                {n}★ <span style={{ fontSize: 9 }}>{SCORE.rating[n] > 0 ? `+${SCORE.rating[n]}` : SCORE.rating[n]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* الأسئلة التلاتة */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>الأسئلة التلاتة</div>
                {Q.map(q => (
                  <div key={q.key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: "#0F172A", marginBottom: 5 }}>{q.label}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {q.opts.map(([v, l]) => {
                        const on = a[q.key] === v;
                        const pts = SCORE[q.key][v];
                        const col = pts > 0 ? "#059669" : pts < 0 ? "#DC2626" : "#64748B";
                        return (
                          <button key={v} onClick={() => setAnswer(m.name, q.key, v)}
                            style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `2px solid ${on ? col : "#E2E8F0"}`, background: on ? "#F8FAFC" : "#FFFFFF", color: on ? col : "#94A3B8", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                            {l} <span style={{ fontSize: 10 }}>({pts > 0 ? `+${pts}` : pts})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  {preview !== null && (
                    <span style={{ fontSize: 12, color: "#64748B" }}>
                      مجموع الأسئلة: <Pts v={preview} size={14} />
                    </span>
                  )}
                  <div style={{ flex: 1 }}></div>
                  <button onClick={() => saveReview(m.name)} disabled={saving || !complete}
                    style={{ background: (saving || !complete) ? "#CBD5E1" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
                    {done ? "تحديث ✓" : "حفظ ✓"}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ═══ MODAL: بلاغ إنجاز ═══ */}
      {showReport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowReport(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>📣 بلّغ عن إنجاز</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16, lineHeight: 1.7 }}>
              الحاجات دي النظام مش بيقدر يقيسها لوحده، فبتبلّغ عنها والمدير يراجعها
            </div>

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>نوع الإنجاز</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {KINDS.map(([v, l]) => {
                const on = repForm.kind === v;
                return (
                  <button key={v} onClick={() => setRepForm(f => ({ ...f, kind: v }))}
                    style={{ padding: "8px 12px", borderRadius: 20, border: `2px solid ${on ? "#7C3AED" : "#E2E8F0"}`, background: on ? "#F5F3FF" : "#F8FAFC", color: on ? "#7C3AED" : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                    {l}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>إيه اللي عملته؟ *</div>
            <textarea value={repForm.description} onChange={e => setRepForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, marginBottom: 12, resize: "vertical" }} />

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>المثال العملي *</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 5 }}>رابط أو ملف أو اسم تاسك طبّقت عليها</div>
            <input value={repForm.proof} onChange={e => setRepForm(f => ({ ...f, proof: e.target.value }))} style={{ ...inp, marginBottom: 12 }} />

            {repForm.kind === "learned_peer" && (
              <>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>اتعلمت من مين؟</div>
                <select value={repForm.learned_from} onChange={e => setRepForm(f => ({ ...f, learned_from: e.target.value }))} style={{ ...inp, marginBottom: 12 }}>
                  <option value="">— اختار —</option>
                  {members.filter(m => m.name !== user.name).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: "#059669", marginBottom: 12 }}>💡 الزميل اللي اتعلمت منه هياخد نقاط كمان</div>
              </>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={sendReport} disabled={saving} style={{ flex: 1, background: saving ? "#94A3B8" : "linear-gradient(135deg,#7C3AED,#2563EB)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>إرسال</button>
              <button onClick={() => setShowReport(false)} style={{ background: "#F1F5F9", color: "#64748B", padding: "12px 20px", borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: قرار البلاغ ═══ */}
      {decide && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>مراجعة بلاغ {decide.member_name}</h3>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 14, lineHeight: 1.7 }}>{decide.description}</div>

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>حجم الأثر</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[["small", "صغير", ptsCfg.impact_small ?? 10], ["medium", "متوسط", ptsCfg.impact_medium ?? 15], ["big", "كبير", ptsCfg.impact_big ?? 25]].map(([v, l, p]) => {
                const on = decideForm.level === v;
                return (
                  <button key={v} onClick={() => setDecideForm(f => ({ ...f, level: v }))}
                    style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: `2px solid ${on ? "#059669" : "#E2E8F0"}`, background: on ? "#ECFDF5" : "#F8FAFC", color: on ? "#059669" : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                    {l}<div style={{ fontSize: 10, marginTop: 2 }}>+{p}</div>
                  </button>
                );
              })}
            </div>

            <textarea value={decideForm.note} onChange={e => setDecideForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="ملاحظة (إجبارية عند الرفض)" style={{ ...inp, marginBottom: 14, resize: "vertical" }} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => decideReport("approved")} disabled={saving} style={{ flex: 1, minWidth: 90, background: "#059669", color: "#fff", padding: 11, borderRadius: 10, fontSize: 13, fontWeight: 700 }}>اعتماد ✓</button>
              <button onClick={() => decideReport("needs_info")} disabled={saving} style={{ flex: 1, minWidth: 90, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: 11, borderRadius: 10, fontSize: 13, fontWeight: 700 }}>محتاج توضيح</button>
              <button onClick={() => decideReport("rejected")} disabled={saving} style={{ flex: 1, minWidth: 90, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: 11, borderRadius: 10, fontSize: 13, fontWeight: 700 }}>رفض</button>
            </div>
            <button onClick={() => setDecide(null)} style={{ width: "100%", background: "none", color: "#94A3B8", padding: 10, fontSize: 13, marginTop: 6 }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ═══ MODAL: نقاط يدوية ═══ */}
      {manual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setManual(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setManual(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>± نقاط يدوية</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>{manual} · الرصيد الحالي {totals[manual] || 0}</div>

            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#D97706", marginBottom: 16, lineHeight: 1.6 }}>
              ⚠️ النقاط دي والسبب المكتوب <b>بيظهروا لكل الفريق</b>.
            </div>

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>النقاط * <span style={{ color: "#94A3B8", fontWeight: 400 }}>— موجب أو سالب</span></div>
            <input type="number" value={manualForm.points} onChange={e => setManualForm(f => ({ ...f, points: e.target.value }))} placeholder="مثال: 3 أو -2" style={{ ...inp, marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {[-3, -2, -1, 1, 2, 3, 5].map(n => (
                <button key={n} onClick={() => setManualForm(f => ({ ...f, points: String(n) }))}
                  style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: n > 0 ? "#059669" : "#DC2626", fontSize: 12, fontWeight: 700 }}>
                  {n > 0 ? `+${n}` : n}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>السبب * <span style={{ color: "#94A3B8", fontWeight: 400 }}>— إجباري</span></div>
            <textarea value={manualForm.reason} onChange={e => setManualForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inp, marginBottom: 16, resize: "vertical" }} />

            <button onClick={saveManual} disabled={saving}
              style={{ width: "100%", background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
              {saving ? "..." : "إضافة ✓"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
