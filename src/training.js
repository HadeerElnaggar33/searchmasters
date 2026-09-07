import { sb } from "./supabase.js";

// ═══════════════════════════════════════════════════
//  نتعلم سوا — الأدوار والحسابات
// ═══════════════════════════════════════════════════

export const UNIT_STATUS = {
  todo:   { l: "لم تبدأ", color: "#64748B", bg: "#F1F5F9", icon: "⬜" },
  active: { l: "جارية",   color: "#2563EB", bg: "#EFF6FF", icon: "⚡" },
  done:   { l: "مكتملة",  color: "#059669", bg: "#ECFDF5", icon: "✅" },
};

export const REVIEW_STATES = {
  pending:  { l: "تحت المراجعة", color: "#D97706", bg: "#FFFBEB" },
  approved: { l: "مقبول",        color: "#059669", bg: "#ECFDF5" },
  redo:     { l: "محتاج إعادة",  color: "#DC2626", bg: "#FEF2F2" },
};

export function parseList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(/[,،\n]/).map(x => x.trim()).filter(Boolean);
}

// ── الأدوار بتتحدد لكل وحدة على حدة ──
export function roleIn(unit, name, isAdmin) {
  if (!unit) return "viewer";
  if (isAdmin) return "trainer";                       // المدير له كل صلاحيات المدرب
  if (String(unit.trainer || "").trim() === name) return "trainer";
  if (parseList(unit.trainees).includes(name)) return "trainee";
  return "viewer";                                      // بيشوف بس
}

export function canGrade(unit, name, isAdmin) {
  return roleIn(unit, name, isAdmin) === "trainer";
}

// ── تقدم الوحدة ──
export function unitProgress(unit, sessions, records) {
  const mySessions = (sessions || []).filter(s => String(s.unit_id) === String(unit.id));
  const ids = mySessions.map(s => String(s.id));
  const recs = (records || []).filter(r => ids.includes(String(r.session_id)));
  const trainees = parseList(unit.trainees);

  const submitted = new Set(recs.filter(r => r.submitted).map(r => r.trainee));
  const approved = new Set(recs.filter(r => r.review_state === "approved").map(r => r.trainee));

  return {
    sessions: mySessions.length,
    trainees: trainees.length,
    submitted: submitted.size,
    approved: approved.size,
    pct: trainees.length ? Math.round((approved.size / trainees.length) * 100) : 0,
  };
}

// ── حالة المتدرب في سيشن ──
export function recordOf(records, sessionId, trainee) {
  return (records || []).find(r =>
    String(r.session_id) === String(sessionId) && r.trainee === trainee) || null;
}

// ── مين متأخر ومين ما سلّمش ──
export function lateTrainees(sessions, records, units) {
  const out = [];
  for (const s of sessions || []) {
    const unit = (units || []).find(u => String(u.id) === String(s.unit_id));
    const invited = parseList(s.invited).length ? parseList(s.invited) : parseList(unit && unit.trainees);
    for (const t of invited) {
      const r = recordOf(records, s.id, t);
      if (!r || !r.submitted) {
        out.push({ trainee: t, session: s.title, date: s.session_date, missing: !r ? "مفيش تسجيل" : "ما سلّمش" });
      } else if (r.review_state === "redo") {
        out.push({ trainee: t, session: s.title, date: s.session_date, missing: "محتاج إعادة" });
      }
    }
  }
  return out;
}

// ── ساعات وإحصائيات المتدرب ──
export function traineeStats(records, name) {
  const mine = (records || []).filter(r => r.trainee === name);
  const rated = mine.filter(r => r.rating);
  return {
    sessions: mine.length,
    attended: mine.filter(r => r.attended).length,
    missed: mine.filter(r => r.attended === false).length,
    submitted: mine.filter(r => r.submitted).length,
    approved: mine.filter(r => r.review_state === "approved").length,
    avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length) * 10) / 10 : null,
  };
}

export async function loadTraining() {
  const [units, sessions, records] = await Promise.all([
    sb("training_units?order=week_no"),
    sb("training_sessions?order=session_date.desc"),
    sb("training_records?select=*"),
  ]);
  return { units: units || [], sessions: sessions || [], records: records || [] };
}
