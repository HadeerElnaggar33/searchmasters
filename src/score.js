import { sb, MONTHS } from "./supabase.js";

// ═══════════════════════════════════════════════════
//  جدول النقاط المعتمد
// ═══════════════════════════════════════════════════
export const SCORE = {
  taskComplete: 1,
  rating: { 5: 2, 4: 1, 3: -1, 2: -2, 1: -3 },
  feedbackPos: 1,
  feedbackNeg: -1,
  // الأسئلة اليومية
  deadline:   { excellent: 2, normal: 1, weak: -1 },
  quality:    { excellent: 2, normal: 1, weak: -1 },
  initiative: { excellent: 2, normal: 1, none: 0 },
};

export const SOURCE_LABEL = {
  task_complete:    "تاسك مكتملة",
  rating:           "تقييم التاسك",
  feedback_pos:     "فيدباك إيجابي",
  feedback_neg:     "فيدباك سلبي",
  daily_deadline:   "الالتزام بالمواعيد",
  daily_quality:    "جودة الشغل",
  daily_initiative: "المبادرة والتعاون",
  manual:           "نقاط يدوية",
  draw_correct:     "إجابة صح في السحب",
  draw_wrong:       "إجابة غلط في السحب",
};

export function monthLabelOf(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const x = isNaN(d) ? new Date() : d;
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

// ── إضافة حركة نقاط ──
export async function addScore({ member, month, points, source, reason, taskId, by }) {
  if (!member || !source) return null;
  const p = Number(points);
  if (!Number.isFinite(p) || p === 0) return null;
  return await sb("score_ledger", "POST", {
    member_name: member,
    month: month || monthLabelOf(),
    points: p,
    source,
    reason: reason || null,
    task_id: taskId ? String(taskId) : null,
    created_by: by || null,
  });
}

// ── استبدال حركة مرتبطة بتاسك (يمسح القديم الأول) ──
//    عشان لو التقييم اتغير من 5 لـ 3، النقط القديمة تتشال
export async function replaceTaskScore({ member, month, points, source, reason, taskId, by }) {
  if (!taskId || !source) return null;
  await sb(`score_ledger?task_id=eq.${encodeURIComponent(String(taskId))}&source=eq.${source}`, "DELETE");
  if (!points) return null;
  return await addScore({ member, month, points, source, reason, taskId, by });
}

// ── استبدال حركة مرتبطة بمرجع عام (زي التقييم اليومي) ──
//    الـ ref مفتاح بنبنيه إحنا، مثال: daily:2026-09-02:أحمد
export async function replaceScoreByRef({ member, month, points, source, reason, ref, by }) {
  if (!ref || !source) return null;
  await sb(`score_ledger?ref=eq.${encodeURIComponent(ref)}&source=eq.${source}`, "DELETE");
  if (!points) return null;
  if (!member) return null;
  return await sb("score_ledger", "POST", {
    member_name: member,
    month: month || monthLabelOf(),
    points: Number(points),
    source,
    reason: reason || null,
    ref,
    created_by: by || null,
  });
}

// ── مسح كل نقاط تاسك (عند حذفها) ──
export async function clearTaskScore(taskId) {
  if (!taskId) return;
  await sb(`score_ledger?task_id=eq.${encodeURIComponent(String(taskId))}`, "DELETE");
}

// ── تحميل السجل لشهر ──
export async function loadLedger(month) {
  const rows = await sb(`score_ledger?month=eq.${encodeURIComponent(month)}&order=created_at.desc`);
  return rows || [];
}

// ── تجميع الأرصدة من السجل ──
export function totalsFrom(ledger) {
  const map = {};
  for (const r of ledger) {
    map[r.member_name] = (map[r.member_name] || 0) + Number(r.points || 0);
  }
  return map;
}

// ── ترتيب الفريق: الأعلى رصيداً أولاً، والتساوي أبجدي ──
export function rankMembers(names, totals) {
  return [...names].sort((a, b) => {
    const pa = totals[a] || 0;
    const pb = totals[b] || 0;
    if (pb !== pa) return pb - pa;
    return a.localeCompare(b, "ar");
  });
}

// ── هل إحنا داخل وقت الشغل؟ (لتأجيل إشعار الفيدباك) ──
export function inWorkHours(startHour = 10, endHour = 18, now = new Date()) {
  const h = now.getHours();
  return h >= Number(startHour) && h < Number(endHour);
}
