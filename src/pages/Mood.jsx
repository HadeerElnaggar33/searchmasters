import { useState, useEffect } from "react";
import { sb } from "../supabase.js";

const GREETINGS = [
  "صباح الفل", "صباح الخير", "يوم سعيد", "أهلاً بيك", "نوّرت", "صباح النور",
];

const PRAISE = [
  "الفريق مش هو الفريق من غيرك 💙",
  "وجودك بيفرق فعلاً",
  "شغلك بيبان، حتى لو محدش قال",
  "خد نفس، اليوم هيعدي حلو",
  "إنت أحسن من امبارح",
  "مافيش حاجة مستعجلة أوي، خد راحتك",
  "لو اليوم تقيل، ماشي — بكرة أخف",
  "أصعب حاجة إنك تبدأ، وإنت بدأت خلاص",
  "بلاش تضغط على نفسك، الشغل مش هيجري",
  "شكراً إنك هنا النهاردة",
];

const THEMES = [
  { bg: "linear-gradient(135deg,#EFF6FF,#DBEAFE)", accent: "#2563EB", soft: "#BFDBFE", emo: "☀️" },
  { bg: "linear-gradient(135deg,#F5F3FF,#EDE9FE)", accent: "#7C3AED", soft: "#DDD6FE", emo: "🌸" },
  { bg: "linear-gradient(135deg,#ECFDF5,#D1FAE5)", accent: "#059669", soft: "#A7F3D0", emo: "🌿" },
  { bg: "linear-gradient(135deg,#FFFBEB,#FEF3C7)", accent: "#D97706", soft: "#FDE68A", emo: "🌻" },
  { bg: "linear-gradient(135deg,#FDF2F8,#FCE7F3)", accent: "#DB2777", soft: "#FBCFE8", emo: "🎈" },
  { bg: "linear-gradient(135deg,#F0FDFA,#CCFBF1)", accent: "#0D9488", soft: "#99F6E4", emo: "🌊" },
];

// رقم ثابت لكل شخص في كل يوم — عشان الشكل يتغير كل يوم ويختلف من شخص لشخص
function seed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
  return h;
}
function pick(list, n) { return list[n % list.length]; }
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseOpts(v) {
  if (!v) return [];
  return String(v).split(",").map(x => x.trim()).filter(Boolean);
}

export default function Mood({ user, onDone }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [qForm, setQForm] = useState({ text: "", options: "" });
  const [editQ, setEditQ] = useState(null);

  const isAdmin = user.role === "admin" || user.role === "team_leader";
  const TODAY = toISO(new Date());
  const s = seed(user.name + TODAY);
  const theme = pick(THEMES, s);
  const greeting = pick(GREETINGS, s + 3);
  const praise = pick(PRAISE, s + 7);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [q, a] = await Promise.all([
      sb("mood_questions?is_active=eq.true&order=sort_order"),
      sb(`mood_answers?member_name=eq.${encodeURIComponent(user.name)}&order=answer_date.desc&limit=40`),
    ]);
    if (q) setQuestions(q);
    if (a) setAnswers(a);
    setLoading(false);
  }

  const todayAnswer = answers.find(a => String(a.answer_date).slice(0, 10) === TODAY) || null;
  const question = questions.length ? pick(questions, s) : null;
  const opts = question ? parseOpts(question.options) : [];

  async function save(skipped) {
    if (!question) return;
    setSaving(true);
    await sb("mood_answers", "POST", {
      member_name: user.name,
      answer_date: TODAY,
      question_id: String(question.id),
      question_text: question.text,
      choice: skipped ? null : (choice || null),
      note: skipped ? null : (note.trim() || null),
      skipped: !!skipped,
    });
    setSaving(false);
    await loadAll();
    if (onDone) onDone();
  }

  // ── إدارة الأسئلة ──
  async function addQuestion() {
    if (!qForm.text.trim()) { alert("اكتبي السؤال"); return; }
    await sb("mood_questions", "POST", {
      text: qForm.text.trim(),
      options: qForm.options.trim() || null,
      sort_order: questions.length + 1,
    });
    setQForm({ text: "", options: "" });
    await loadAll();
  }
  async function updateQuestion() {
    if (!editQ) return;
    await sb(`mood_questions?id=eq.${editQ.id}`, "PATCH", { text: editQ.text, options: editQ.options || null });
    setEditQ(null);
    await loadAll();
  }
  async function removeQuestion(q) {
    await sb(`mood_questions?id=eq.${q.id}`, "PATCH", { is_active: false });
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const inp = {
    background: "#FFFFFF", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };

  return (
    <div style={{ padding: 16, maxWidth: 620, margin: "0 auto" }}>

      {/* ═══ الكارت الرئيسي ═══ */}
      <div style={{ background: theme.bg, border: `1px solid ${theme.soft}`, borderRadius: 24, padding: "26px 22px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{theme.emo}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: theme.accent, marginBottom: 6 }}>
          {greeting} يا {user.name}
        </div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.8 }}>{praise}</div>
      </div>

      {/* ═══ سؤال النهاردة ═══ */}
      {!question ? (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 30, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
          مفيش أسئلة مفعّلة دلوقتي
        </div>
      ) : todayAnswer ? (
        <div style={{ background: "#FFFFFF", border: `1px solid ${theme.soft}`, borderRadius: 20, padding: 24, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{todayAnswer.skipped ? "👋" : "💙"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
            {todayAnswer.skipped ? "تمام، شوفنا بكرة" : "شكراً إنك شاركت"}
          </div>
          {!todayAnswer.skipped && todayAnswer.choice && (
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 8 }}>
              {todayAnswer.question_text} → <b style={{ color: theme.accent }}>{todayAnswer.choice}</b>
            </div>
          )}
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 12 }}>يلا نكمل شغل 🚀</div>
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 22, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 16, textAlign: "center", lineHeight: 1.7 }}>
            {question.text}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
            {opts.map(o => {
              const on = choice === o;
              return (
                <button key={o} onClick={() => setChoice(on ? "" : o)}
                  style={{
                    padding: "10px 16px", borderRadius: 20,
                    border: `2px solid ${on ? theme.accent : "#E2E8F0"}`,
                    background: on ? theme.bg : "#F8FAFC",
                    color: on ? theme.accent : "#64748B",
                    fontSize: 14, fontWeight: on ? 700 : 500,
                  }}>
                  {o}
                </button>
              );
            })}
          </div>

          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="تحب تضيف حاجة؟ (اختياري)" style={{ ...inp, resize: "vertical", marginBottom: 14, background: "#F8FAFC" }} />

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => save(false)} disabled={saving}
              style={{ flex: 1, background: saving ? "#94A3B8" : theme.accent, color: "#fff", padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 700 }}>
              {saving ? "..." : "تمام ✓"}
            </button>
            <button onClick={() => save(true)} disabled={saving}
              style={{ background: "#F1F5F9", color: "#64748B", padding: "13px 20px", borderRadius: 12, fontSize: 14 }}>
              تخطّي
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
            الإجابة اختيارية بالكامل · مالهاش أي علاقة بالتقييم ولا بالنقاط
          </div>
        </div>
      )}

      {/* ═══ إجاباتي السابقة ═══ */}
      {answers.length > 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>📜 إجاباتك السابقة</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {answers.filter(a => !a.skipped).slice(0, 12).map(a => (
              <div key={a.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>
                  {new Date(String(a.answer_date).slice(0, 10) + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" })}
                </div>
                <div style={{ fontSize: 12, color: "#64748B" }}>{a.question_text}</div>
                {a.choice && <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginTop: 2 }}>{a.choice}</div>}
                {a.note && <div style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 1.6 }}>{a.note}</div>}
              </div>
            ))}
            {answers.filter(a => !a.skipped).length === 0 && (
              <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: 10 }}>لسه مفيش إجابات</div>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <button onClick={() => setShowManage(true)}
          style={{ width: "100%", background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: 11, borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
          ⚙️ إدارة الأسئلة ({questions.length})
        </button>
      )}

      {/* ═══ إدارة الأسئلة ═══ */}
      {showManage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowManage(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowManage(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>⚙️ أسئلة المود</h3>

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>+ سؤال جديد</div>
              <input value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))} placeholder="نص السؤال" style={{ ...inp, marginBottom: 8 }} />
              <input value={qForm.options} onChange={e => setQForm(f => ({ ...f, options: e.target.value }))} placeholder="الاختيارات مفصولة بفاصلة: عالي, متوسط, منخفض" style={{ ...inp, marginBottom: 10 }} />
              <button onClick={addQuestion} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>إضافة</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {questions.map(q => (
                <div key={q.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px" }}>
                  {editQ?.id === q.id ? (
                    <>
                      <input value={editQ.text} onChange={e => setEditQ(x => ({ ...x, text: e.target.value }))} style={{ ...inp, marginBottom: 6 }} />
                      <input value={editQ.options || ""} onChange={e => setEditQ(x => ({ ...x, options: e.target.value }))} style={{ ...inp, marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={updateQuestion} style={{ background: "#059669", color: "#fff", padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>حفظ</button>
                        <button onClick={() => setEditQ(null)} style={{ background: "#F1F5F9", color: "#64748B", padding: "5px 14px", borderRadius: 8, fontSize: 12 }}>إلغاء</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: "#0F172A", marginBottom: 4 }}>{q.text}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{q.options || "بدون اختيارات"}</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => setEditQ({ id: q.id, text: q.text, options: q.options })} style={{ background: "none", color: "#2563EB", fontSize: 12, textDecoration: "underline" }}>تعديل</button>
                        <button onClick={() => removeQuestion(q)} style={{ background: "none", color: "#DC2626", fontSize: 12, textDecoration: "underline" }}>حذف</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
