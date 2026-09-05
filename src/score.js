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

// ═══════════════════════════════════════════════════
//  معادلة نقاط التاسك (تعديل ٥٣)
//  نقاط التاسك = (الأساس × معامل الأولوية × معامل الصعوبة) + الإضافات
// ═══════════════════════════════════════════════════

export const DIFFICULTY = [
  { v: "easy",      l: "سهلة",       key: "pts_diff_easy",      def: 0.8 },
  { v: "medium",    l: "متوسطة",     key: "pts_diff_medium",    def: 1 },
  { v: "hard",      l: "صعبة",       key: "pts_diff_hard",      def: 1.4 },
  { v: "very_hard", l: "صعبة جداً",  key: "pts_diff_very_hard", def: 1.8 },
];

const PRIO_KEY = { low: "pts_prio_low", medium: "pts_prio_medium", high: "pts_prio_high", urgent: "pts_prio_urgent" };
const PRIO_DEF = { low: 0.8, medium: 1, high: 1.3, urgent: 1.6 };

export const DEFAULT_PTS = {
  pts_base: 5,
  pts_prio_low: 0.8, pts_prio_medium: 1, pts_prio_high: 1.3, pts_prio_urgent: 1.6,
  pts_diff_easy: 0.8, pts_diff_medium: 1, pts_diff_hard: 1.4, pts_diff_very_hard: 1.8,
  pts_bonus_early: 2, pts_bonus_no_revision: 2, pts_bonus_full_data: 1, pts_penalty_late: -2,
  pts_session_2h: 2, pts_session_4h: 4,
  pts_initiative_self: 1, pts_initiative_other: 1,
  feature_initiative: 1, feature_session_points: 1,
};

// تحميل قيم المعادلة من الإعدادات
export async function loadPointsConfig() {
  const rows = await sb("app_settings?select=key,value");
  const cfg = { ...DEFAULT_PTS };
  for (const r of (rows || [])) {
    if (r.key in cfg) {
      const n = Number(r.value);
      cfg[r.key] = Number.isFinite(n) ? n : cfg[r.key];
    }
  }
  return cfg;
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── الحساب: بيرجّع المجموع وتفصيل كل بند بالعامية ──
export function computeTaskPoints(task, ctx, cfg = DEFAULT_PTS) {
  const c = { ...DEFAULT_PTS, ...(cfg || {}) };
  const lines = [];

  const base = Number(c.pts_base) || 5;
  const prio = task.priority || "medium";
  const diff = task.difficulty || "medium";
  const pm = Number(c[PRIO_KEY[prio]] ?? PRIO_DEF[prio] ?? 1);
  const dm = Number(c[(DIFFICULTY.find(d => d.v === diff) || {}).key] ?? 1);

  const core = round1(base * pm * dm);
  const prioLabel = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" }[prio] || prio;
  const diffLabel = (DIFFICULTY.find(d => d.v === diff) || {}).l || diff;
  lines.push({ label: `الأساس ${base} × أولوية ${prioLabel} (${pm}) × صعوبة ${diffLabel} (${dm})`, value: core });

  let total = core;

  // قبل الموعد أو بعده
  const done = ctx.completedDate;
  const due = ctx.dueDate;
  if (done && due) {
    if (done < due) {
      const v = Number(c.pts_bonus_early);
      if (v) { total += v; lines.push({ label: "سلّمتها قبل ميعادها", value: v }); }
    } else if (done > due) {
      const v = Number(c.pts_penalty_late);
      if (v) { total += v; lines.push({ label: "اتسلّمت بعد ميعادها", value: v }); }
    }
  }

  // من غير ريفيجن
  if (!ctx.hadRevision) {
    const v = Number(c.pts_bonus_no_revision);
    if (v) { total += v; lines.push({ label: "من غير ريفيجن", value: v }); }
  }

  // اكتمال البيانات وقت التسليم
  if (ctx.fullData) {
    const v = Number(c.pts_bonus_full_data);
    if (v) { total += v; lines.push({ label: "بياناتها كاملة (روابط وملاحظات)", value: v }); }
  }

  // الجلسة المتصلة
  if (Number(c.feature_session_points) !== 0) {
    const mins = Number(ctx.longestSession || 0);
    if (mins >= 240) {
      const v = Number(c.pts_session_4h);
      if (v) { total += v; lines.push({ label: "شغل متواصل 4 ساعات", value: v }); }
    } else if (mins >= 120) {
      const v = Number(c.pts_session_2h);
      if (v) { total += v; lines.push({ label: "شغل متواصل ساعتين", value: v }); }
    }
  }

  return { total: round1(total), lines };
}

// ── نقاط المبادرة (تعديل ٥٤): تُصرف عند الإتمام مش عند الإضافة ──
export function initiativePoints(task, ctx, cfg = DEFAULT_PTS) {
  const c = { ...DEFAULT_PTS, ...(cfg || {}) };
  if (Number(c.feature_initiative) === 0) return null;

  const creator = task.created_by;
  if (!creator || creator === "🔄 تلقائي") return null;

  // حماية: اتضافت واتقفلت على طول من غير أي وقت مسجّل
  if (!ctx.longestSession && ctx.sameMinute) return null;

  if (creator === task.assigned_to) {
    const v = Number(c.pts_initiative_self);
    return v ? { member: creator, points: v, self: true } : null;
  }
  const v = Number(c.pts_initiative_other);
  return v ? { member: creator, points: v, self: false } : null;
}

// ── أطول جلسة متصلة على تاسك ──
export async function longestSessionOf(taskId) {
  const rows = await sb(`task_timers?task_id=eq.${encodeURIComponent(String(taskId))}&select=duration_minutes`);
  if (!rows || rows.length === 0) return 0;
  return Math.max(0, ...rows.map(r => Number(r.duration_minutes) || 0));
}

// ═══════════════════════════════════════════════════
//  مؤشر الضغط اليومي (تعديل ٥٢) — تلقائي بالكامل
// ═══════════════════════════════════════════════════

export const DEFAULT_PRESS = {
  press_th_high: 5, press_th_very: 10,
  press_mult_high: 1.25, press_mult_very: 1.5,
  press_w_open: 1, press_w_due: 2, press_w_urgent: 2, press_w_hours: 2,
  pts_hour_normal: 0.5, pts_hour_extra: 1, pts_hour_training: 1.5,
  feature_pressure: 1, feature_hour_points: 1,
};

// ── حساب المؤشر من 4 عوامل ──
export function pressureIndex(input, cfg = DEFAULT_PRESS) {
  const c = { ...DEFAULT_PRESS, ...(cfg || {}) };
  const { openTasks = 0, dueSoon = 0, urgent = 0, dayMinutes = 0, avgMinutes = 0 } = input;

  let score = 0;
  score += openTasks * Number(c.press_w_open);
  score += dueSoon   * Number(c.press_w_due);
  score += urgent    * Number(c.press_w_urgent);
  if (avgMinutes > 0 && dayMinutes > avgMinutes * 1.25) score += Number(c.press_w_hours);

  score = Math.round(score * 10) / 10;

  if (score >= Number(c.press_th_very)) {
    return { score, level: "very", label: "عالي جداً", multiplier: Number(c.press_mult_very) };
  }
  if (score >= Number(c.press_th_high)) {
    return { score, level: "high", label: "مرتفع", multiplier: Number(c.press_mult_high) };
  }
  return { score, level: "normal", label: "عادي", multiplier: 1 };
}

// ── النقاط الإضافية: نسبة على نقاط تاسكات اليوم اللي اتنفذت فعلاً ──
export function pressureBonus(dayTaskPoints, press) {
  if (!press || press.multiplier <= 1) return 0;
  if (!dayTaskPoints || dayTaskPoints <= 0) return 0;   // ضغط بدون إنجاز = مفيش
  return Math.round(dayTaskPoints * (press.multiplier - 1) * 10) / 10;
}

// ── نقاط الساعات (تعديل ٤٧) ──
export function hourPoints({ normalMinutes = 0, extraMinutes = 0, trainingMinutes = 0 }, cfg = DEFAULT_PRESS) {
  const c = { ...DEFAULT_PRESS, ...(cfg || {}) };
  const n = (normalMinutes / 60) * Number(c.pts_hour_normal);
  const e = (extraMinutes / 60) * Number(c.pts_hour_extra);
  const t = (trainingMinutes / 60) * Number(c.pts_hour_training);
  const round = x => Math.round(x * 10) / 10;
  return { normal: round(n), extra: round(e), training: round(t), total: round(n + e + t) };
}
