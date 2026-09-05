import { useState, useEffect } from "react";
import { sb, MONTHS, CURRENT_MONTH, formatDate, addNotification } from "../supabase.js";
import { SCORE, SOURCE_LABEL, addScore, replaceTaskScore, replaceScoreByRef, loadLedger, totalsFrom, rankMembers } from "../score.js";
import { loadWorkConfig, isWorkingDay } from "../workdays.js";

const Q = [
  { key: "deadline",   label: "الالتزام بالمواعيد", opts: [["excellent", "ممتاز"], ["normal", "عادي"], ["weak", "ضعيف"]] },
  { key: "quality",    label: "جودة الشغل",         opts: [["excellent", "ممتاز"], ["normal", "عادي"], ["weak", "ضعيف"]] },
  { key: "initiative", label: "المبادرة والتعاون",   opts: [["excellent", "ممتاز"], ["normal", "عادي"], ["none", "مافيش"]] },
];

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [manual, setManual] = useState(null);          // العضو اللي بناخد له نقاط يدوية
  const [manualForm, setManualForm] = useState({ points: "", reason: "" });

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
    const [m, lg, t, c, rv] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      loadLedger(selectedMonth),
      sb(`tasks?month=eq.${encodeURIComponent(selectedMonth)}`),
      loadWorkConfig(),
      sb("daily_reviews?order=review_date.desc"),
    ]);
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
  function movesByDay(name) {
    const map = {};
    for (const r of movesOf(name)) {
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

      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["me", "رصيدي"], ["team", "الترتيب"], ["review", "📋 التقييم اليومي"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: view === v ? "#FFFFFF" : "transparent", color: view === v ? "#0F172A" : "#64748B", fontSize: 12, fontWeight: view === v ? 700 : 500, boxShadow: view === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ═══════════ رصيدي ═══════════ */}
      {(view === "me" || !isAdmin) && (
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
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>📜 حركة النقاط</div>
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
                          <span style={{ fontSize: 12, color: "#0F172A", flex: 1, minWidth: 0, lineHeight: 1.5 }}>{r.reason || "—"}</span>
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
