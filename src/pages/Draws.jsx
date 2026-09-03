import { useState, useEffect } from "react";
import { sb, sbUpload, formatDate } from "../supabase.js";
import { parseOpts, isLive, liveDrawFor, giftStats, submitAnswer, expireDraws } from "../draws.js";

// ═══════════════════════════════════════════════════
//  نافذة السحب — بتظهر لوحدها في أي مكان في الأداة
// ═══════════════════════════════════════════════════
export function DrawPopup({ user }) {
  const [draw, setDraw] = useState(null);
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        await expireDraws();
        const [ds, at] = await Promise.all([
          sb("draws?status=eq.open&order=created_at.desc"),
          sb(`draw_attempts?member_name=eq.${encodeURIComponent(user.name)}&select=draw_id,member_name`),
        ]);
        if (!alive) return;
        const live = liveDrawFor(ds || [], at || [], user.name);
        if (live && (!draw || draw.id !== live.id)) { setDraw(live); setResult(null); setChoice(""); }
        if (!live && draw && !result) setDraw(null);
      } catch (e) { /* تجاهل */ }
    }
    check();
    const t = setInterval(check, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [user.name, draw, result]);

  if (!draw) return null;
  const opts = parseOpts(draw.options);

  async function answer() {
    if (!choice) return;
    setBusy(true);
    const r = await submitAnswer(draw, user.name, choice);
    setBusy(false);
    setResult(r);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.75)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 24, padding: 26, width: "100%", maxWidth: 440, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>

        {!result ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 6 }}>🎁</div>
            <div style={{ fontSize: 12, color: "#D97706", fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>سحب مفاجئ!</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{draw.gift_name}</div>
            {draw.gift_image && (
              <img src={draw.gift_image} alt="" style={{ maxWidth: "100%", height: "auto", borderRadius: 14, margin: "10px 0", border: "1px solid #E2E8F0" }} />
            )}
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 18, lineHeight: 1.7 }}>
              أول واحد يجاوب صح بياخدها · <b style={{ color: "#DC2626" }}>عندك محاولة واحدة بس</b>
            </div>

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 14, lineHeight: 1.7 }}>{draw.question_text}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {opts.map(o => (
                  <button key={o} onClick={() => setChoice(o)}
                    style={{ padding: "11px 14px", borderRadius: 12, border: `2px solid ${choice === o ? "#D97706" : "#E2E8F0"}`, background: choice === o ? "#FFFBEB" : "#FFFFFF", color: choice === o ? "#D97706" : "#0F172A", fontSize: 14, fontWeight: choice === o ? 700 : 500, textAlign: "right" }}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={answer} disabled={!choice || busy}
              style={{ width: "100%", background: (!choice || busy) ? "#CBD5E1" : "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 800 }}>
              {busy ? "..." : "جاوب"}
            </button>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>
              الإجابة الصح +1 · الغلط −1 على رصيد الجوائز بس
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 10 }}>
              {result === "won" ? "🏆" : result === "wrong" ? "😅" : "⏰"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
              {result === "won" ? "كسبت!" : result === "wrong" ? "إجابة غلط" : "السحب اتقفل"}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.8, marginBottom: 18 }}>
              {result === "won" && <>إجابتك: <b style={{ color: "#059669" }}>{choice}</b><br />✅ <b>{draw.gift_name}</b> اتضافت لرصيدك</>}
              {result === "wrong" && <>إجابتك: <b style={{ color: "#DC2626" }}>{choice}</b><br />السحب لسه مفتوح لحد تاني · حظ أوفر المرة الجاية</>}
              {result === "closed" && <>حد سبقك بثواني، أو المدة خلصت</>}
            </div>
            <button onClick={() => { setDraw(null); setResult(null); }}
              style={{ width: "100%", background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
              تمام
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  الصفحة
// ═══════════════════════════════════════════════════
export default function Draws({ user }) {
  const [gifts, setGifts] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [draws, setDraws] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [members, setMembers] = useState([]);
  const [pref, setPref] = useState("now");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("mine");

  const [giftForm, setGiftForm] = useState({ name: "", description: "" });
  const [giftFile, setGiftFile] = useState(null);
  const [qForm, setQForm] = useState({ text: "", options: "", correct: "" });
  const [newDraw, setNewDraw] = useState(null);
  const [drawForm, setDrawForm] = useState({ gift_id: "", question_id: "", mode: "until", minutes: "30" });

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    await expireDraws();
    const [g, q, d, a, m, p] = await Promise.all([
      sb("gifts?is_active=eq.true&order=created_at.desc"),
      sb("draw_questions?is_active=eq.true&order=created_at.desc"),
      sb("draws?order=created_at.desc"),
      sb("draw_attempts?select=*"),
      sb("team_members?is_active=eq.true&order=name"),
      sb(`gift_preferences?member_name=eq.${encodeURIComponent(user.name)}`),
    ]);
    if (g) setGifts(g);
    if (q) setQuestions(q);
    if (d) setDraws(d);
    if (a) setAttempts(a);
    if (m) setMembers(m);
    if (p && p[0]) setPref(p[0].mode);
    setLoading(false);
  }

  async function savePref(mode) {
    setPref(mode);
    const ex = await sb(`gift_preferences?member_name=eq.${encodeURIComponent(user.name)}`);
    if (ex && ex.length) await sb(`gift_preferences?member_name=eq.${encodeURIComponent(user.name)}`, "PATCH", { mode, updated_at: new Date().toISOString() });
    else await sb("gift_preferences", "POST", { member_name: user.name, mode });
  }

  async function addGift() {
    if (!giftForm.name.trim()) { alert("اكتبي اسم الهدية"); return; }
    setSaving(true);
    let url = null;
    if (giftFile) {
      const ext = giftFile.name.split(".").pop();
      url = await sbUpload("awards", `gift_${Date.now()}.${ext}`, giftFile);
    }
    await sb("gifts", "POST", { name: giftForm.name.trim(), description: giftForm.description.trim() || null, image_url: url, created_by: user.name });
    setGiftForm({ name: "", description: "" }); setGiftFile(null); setSaving(false);
    await loadAll();
  }

  async function addQuestion() {
    const opts = parseOpts(qForm.options);
    if (!qForm.text.trim()) { alert("اكتبي السؤال"); return; }
    if (opts.length < 2) { alert("محتاجه اختيارين على الأقل"); return; }
    if (!opts.includes(qForm.correct.trim())) { alert("الإجابة الصح لازم تكون واحدة من الاختيارات بالظبط"); return; }
    await sb("draw_questions", "POST", { text: qForm.text.trim(), options: opts.join(", "), correct: qForm.correct.trim(), created_by: user.name });
    setQForm({ text: "", options: "", correct: "" });
    await loadAll();
  }

  async function startDraw() {
    const g = gifts.find(x => String(x.id) === String(drawForm.gift_id));
    const q = questions.find(x => String(x.id) === String(drawForm.question_id));
    if (!g) { alert("اختاري الهدية"); return; }
    if (!q) { alert("اختاري السؤال"); return; }
    setSaving(true);
    const closes = drawForm.mode === "timed"
      ? new Date(Date.now() + Math.max(1, Number(drawForm.minutes) || 30) * 60000).toISOString()
      : null;
    await sb("draws", "POST", {
      gift_id: String(g.id), gift_name: g.name, gift_image: g.image_url,
      question_text: q.text, options: q.options, correct: q.correct,
      status: "open", opens_at: new Date().toISOString(), closes_at: closes,
      created_by: user.name,
    });
    setSaving(false); setNewDraw(null);
    setDrawForm({ gift_id: "", question_id: "", mode: "until", minutes: "30" });
    await loadAll();
  }

  async function cancelDraw(d) {
    await sb(`draws?id=eq.${d.id}`, "PATCH", { status: "cancelled" });
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const my = giftStats(draws, attempts, user.name);
  const liveNow = draws.filter(d => isLive(d));

  const STATUS = {
    open:      { l: "مفتوح",  c: "#D97706", bg: "#FFFBEB", b: "#FDE68A" },
    won:       { l: "اتكسب",  c: "#059669", bg: "#ECFDF5", b: "#A7F3D0" },
    cancelled: { l: "اتلغى",  c: "#94A3B8", bg: "#F8FAFC", b: "#E2E8F0" },
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🎁 الجوائز</h2>
        {isAdmin && (
          <button onClick={() => setNewDraw(true)} style={{ background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
            🎲 ابدأي سحب
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["mine", "رصيدي"], ["log", "السجل"], ["manage", "الإدارة"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: tab === v ? "#FFFFFF" : "transparent", color: tab === v ? "#0F172A" : "#64748B", fontSize: 12, fontWeight: tab === v ? 700 : 500, boxShadow: tab === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>{l}</button>
          ))}
        </div>
      )}

      {liveNow.length > 0 && isAdmin && (
        <div style={{ ...card, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#D97706", marginBottom: 8 }}>🎲 سحب شغال دلوقتي</div>
          {liveNow.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: "#0F172A" }}>{d.gift_name}</span>
              <span style={{ color: "#64748B", fontSize: 12 }}>
                {d.closes_at ? `يقفل ${new Date(d.closes_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}` : "مفتوح لحد ما حد يجاوب"}
              </span>
              <span style={{ color: "#64748B", fontSize: 12 }}>· {attempts.filter(a => String(a.draw_id) === String(d.id)).length} حاولوا</span>
              <div style={{ flex: 1 }}></div>
              <button onClick={() => cancelDraw(d)} style={{ background: "none", color: "#DC2626", fontSize: 12, textDecoration: "underline" }}>إلغاء</button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ رصيدي ═══ */}
      {(tab === "mine" || !isAdmin) && (
        <>
          <div style={{ ...card, textAlign: "center", borderTop: "4px solid #D97706" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#D97706", lineHeight: 1.1 }}>{my.winCount}</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>هدية كسبتها</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 14, flexWrap: "wrap", fontSize: 12, color: "#64748B" }}>
              <span>شاركت {my.attempts}</span>
              <span style={{ color: "#059669" }}>صح {my.correct}</span>
              <span style={{ color: "#DC2626" }}>غلط {my.wrong}</span>
              <span>رصيد النقاط <b style={{ color: my.points >= 0 ? "#059669" : "#DC2626" }}>{my.points > 0 ? "+" : ""}{my.points}</b></span>
            </div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>نقاط السحب منفصلة تماماً — مالهاش أي تأثير على رصيد النقاط ولا موظف الشهر</div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>📦 طريقة الاستلام</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>تقدر تغيّرها في أي وقت</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[["now", "🚚 توصلني خلال 3 أيام"], ["accumulate", "📦 أجمّع الرصيد وآخده آخر الشهر"]].map(([v, l]) => (
                <button key={v} onClick={() => savePref(v)}
                  style={{ flex: 1, minWidth: 160, padding: "11px 10px", borderRadius: 12, border: `2px solid ${pref === v ? "#D97706" : "#E2E8F0"}`, background: pref === v ? "#FFFBEB" : "#F8FAFC", color: pref === v ? "#D97706" : "#64748B", fontSize: 13, fontWeight: pref === v ? 700 : 500 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {my.wins.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>🏆 هداياك</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {my.wins.map(w => (
                  <div key={w.id} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>🎁 {w.gift_name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      {w.won_at ? formatDate(String(w.won_at).slice(0, 10)) : ""} · إجابتك: {w.winner_answer}
                    </div>
                    {w.gift_image && <img src={w.gift_image} alt="" style={{ maxWidth: "100%", borderRadius: 10, marginTop: 8, border: "1px solid #FDE68A" }} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ السجل ═══ */}
      {isAdmin && tab === "log" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>📜 سجل السحوبات ({draws.length})</div>
          {draws.length === 0
            ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 20 }}>لسه مفيش سحوبات</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {draws.map(d => {
                  const st = STATUS[d.status] || STATUS.open;
                  const tries = attempts.filter(a => String(a.draw_id) === String(d.id));
                  return (
                    <div key={d.id} style={{ background: st.bg, border: `1px solid ${st.b}`, borderRadius: 12, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>🎁 {d.gift_name}</span>
                        <span style={{ fontSize: 11, color: st.c, fontWeight: 700 }}>{st.l}</span>
                        <div style={{ flex: 1 }}></div>
                        <span style={{ fontSize: 11, color: "#94A3B8" }}>{new Date(d.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>{d.question_text}</div>
                      <div style={{ fontSize: 12, marginTop: 4, color: "#0F172A" }}>
                        {d.winner_name ? <>🏆 الفايز: <b>{d.winner_name}</b></> : d.status === "cancelled" ? "محدش جاوب — الهدية راحت" : "لسه مفتوح"}
                        <span style={{ color: "#94A3B8" }}> · {tries.length} حاولوا</span>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      )}

      {/* ═══ الإدارة ═══ */}
      {isAdmin && tab === "manage" && (
        <>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>🎁 الهدايا ({gifts.length})</div>
            <input value={giftForm.name} onChange={e => setGiftForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الهدية" style={{ ...inp, marginBottom: 8 }} />
            <input value={giftForm.description} onChange={e => setGiftForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف (اختياري)" style={{ ...inp, marginBottom: 8 }} />
            <input type="file" accept="image/*" onChange={e => setGiftFile(e.target.files?.[0] || null)} style={{ ...inp, padding: "8px 10px", fontSize: 12, marginBottom: 10 }} />
            <button onClick={addGift} disabled={saving} style={{ background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              {saving ? "..." : "+ إضافة هدية"}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {gifts.map(g => (
                <div key={g.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#0F172A" }}>
                  🎁 {g.name} {g.description && <span style={{ color: "#94A3B8", fontSize: 11 }}>— {g.description}</span>}
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>❓ مكتبة الأسئلة ({questions.length})</div>
            <input value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))} placeholder="نص السؤال" style={{ ...inp, marginBottom: 8 }} />
            <input value={qForm.options} onChange={e => setQForm(f => ({ ...f, options: e.target.value }))} placeholder="الاختيارات مفصولة بفاصلة" style={{ ...inp, marginBottom: 8 }} />
            <input value={qForm.correct} onChange={e => setQForm(f => ({ ...f, correct: e.target.value }))} placeholder="الإجابة الصح (زي ما هي في الاختيارات)" style={{ ...inp, marginBottom: 10 }} />
            <button onClick={addQuestion} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>+ إضافة سؤال</button>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {questions.map(q => (
                <div key={q.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ fontSize: 13, color: "#0F172A" }}>{q.text}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{q.options} · الصح: <b style={{ color: "#059669" }}>{q.correct}</b></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ بدء سحب ═══ */}
      {newDraw && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setNewDraw(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>🎲 سحب جديد</h3>

            <div style={label}>الهدية *</div>
            <select value={drawForm.gift_id} onChange={e => setDrawForm(f => ({ ...f, gift_id: e.target.value }))} style={{ ...inp, marginBottom: 12 }}>
              <option value="">— اختاري —</option>
              {gifts.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <div style={label}>السؤال *</div>
            <select value={drawForm.question_id} onChange={e => setDrawForm(f => ({ ...f, question_id: e.target.value }))} style={{ ...inp, marginBottom: 12 }}>
              <option value="">— اختاري —</option>
              {questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
            </select>

            <div style={label}>مدة الظهور *</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[["until", "لحد ما حد يجاوب"], ["timed", "مدة محددة"]].map(([v, l]) => (
                <button key={v} onClick={() => setDrawForm(f => ({ ...f, mode: v }))}
                  style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${drawForm.mode === v ? "#D97706" : "#E2E8F0"}`, background: drawForm.mode === v ? "#FFFBEB" : "#F8FAFC", color: drawForm.mode === v ? "#D97706" : "#64748B", fontSize: 13, fontWeight: 600 }}>{l}</button>
              ))}
            </div>
            {drawForm.mode === "timed" && (
              <input type="number" min="1" value={drawForm.minutes} onChange={e => setDrawForm(f => ({ ...f, minutes: e.target.value }))} placeholder="دقايق" style={{ ...inp, marginBottom: 10 }} />
            )}

            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#2563EB", marginBottom: 16, lineHeight: 1.7 }}>
              💡 مفيش إشعارات — السحب هيظهر لوحده لأي حد فاتح الأداة. لو محدش جاوب خلال المدة، السحب يتلغي والهدية تروح.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={startDraw} disabled={saving} style={{ flex: 1, background: saving ? "#94A3B8" : "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                {saving ? "..." : "ابدأي دلوقتي 🎲"}
              </button>
              <button onClick={() => setNewDraw(null)} style={{ background: "#F1F5F9", color: "#64748B", padding: "13px 20px", borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
