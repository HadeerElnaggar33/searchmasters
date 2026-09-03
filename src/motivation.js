import { sb, addNotification, CURRENT_MONTH } from "./supabase.js";
import { loadLedger, totalsFrom, rankMembers } from "./score.js";

const REPEAT_BLOCK_DAYS = 14;   // ماينفعش نكرر نفس الرسالة لنفس الشخص في المدة دي
const DEFAULT_CAP = 3;          // أقصى رسائل في اليوم (0 = بلا حد)

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayOf(v) { return v ? String(v).slice(0, 10) : null; }

// ═══════════════════════════════════════════════════
//  تقييم الـ Triggers لعضو واحد
//  بيرجّع قائمة مفاتيح الرسائل اللي شرطها اتحقق
// ═══════════════════════════════════════════════════
export function evaluateTriggers(name, ctx, now = new Date()) {
  const { tasks = [], ledger = [], attendance = [], members = [] } = ctx;
  const today = toISO(now);
  const yesterday = toISO(addDays(now, -1));
  const twoDaysAgo = toISO(addDays(now, -2));
  const hour = now.getHours();
  const hit = [];

  const mine = tasks.filter(t => t.assigned_to === name && t.status !== "cancelled");
  const dueToday = mine.filter(t => dayOf(t.due_date) === today);
  const doneToday = mine.filter(t => t.status === "completed" && dayOf(t.completed_at) === today);
  const openNow = mine.filter(t => t.status !== "completed");

  // ── مجموعة الأداء ──
  if (doneToday.length === 1) hit.push("first_task_done");
  if (dueToday.length >= 2) {
    const doneOfDue = dueToday.filter(t => t.status === "completed").length;
    const ratio = doneOfDue / dueToday.length;
    if (ratio >= 0.5 && ratio < 1) hit.push("half_day_done");
    if (dueToday.length - doneOfDue === 1 && hour >= 14) hit.push("one_task_left");
  }

  // سلّم تاسك قبل الميعاد
  if (doneToday.some(t => t.due_date && dayOf(t.completed_at) < dayOf(t.due_date))) {
    hit.push("before_deadline");
  }

  // أسبوع أحسن من اللي فاته
  const weekAgo = toISO(addDays(now, -7));
  const twoWeeks = toISO(addDays(now, -14));
  const thisWeek = mine.filter(t => t.status === "completed" && dayOf(t.completed_at) >= weekAgo).length;
  const lastWeek = mine.filter(t => t.status === "completed" && dayOf(t.completed_at) >= twoWeeks && dayOf(t.completed_at) < weekAgo).length;
  if (thisWeek > lastWeek && thisWeek > 0) hit.push("better_than_last_week");

  // بدأ يومه ولسه مافيش نشاط
  const attToday = attendance.find(a => a.member_name === name && dayOf(a.date) === today && a.status !== "leave");
  if (attToday && doneToday.length === 0 && hour >= 11) hit.push("day_started_idle");

  // شغل طويل من غير وقفة
  if (attToday && (attToday.working_minutes || 0) >= 240) { hit.push("long_session"); hit.push("no_break"); }

  if (now.getDay() === 4) hit.push("thursday");
  hit.push("morning_general");

  // ── مجموعة التأخير ──
  if (openNow.some(t => t.due_date && dayOf(t.due_date) < today)) hit.push("overdue_task");
  if (openNow.length >= 5) hit.push("many_open");
  if (hour >= 14 && doneToday.length === 0 && openNow.length > 0) hit.push("midday_none_closed");

  const activeOn = d => tasks.some(t => t.assigned_to === name &&
    (dayOf(t.completed_at) === d || dayOf(t.started_at) === d)) ||
    attendance.some(a => a.member_name === name && dayOf(a.date) === d && a.status !== "leave");
  if (!activeOn(yesterday) && !activeOn(twoDaysAgo)) hit.push("two_days_idle");

  // ── مجموعة النقاط ──
  const myLedger = ledger.filter(r => r.member_name === name);
  const sumOn = d => myLedger.filter(r => dayOf(r.created_at) === d).reduce((s, r) => s + Number(r.points || 0), 0);
  const yScore = sumOn(yesterday);
  const y2Score = sumOn(twoDaysAgo);

  if (yScore > 0) hit.push("score_up");
  if (yScore < 0 && y2Score < 0) hit.push("score_down_2days");
  if (sumOn(today) === 0 && yScore === 0) hit.push("no_points_2days");

  if (myLedger.some(r => dayOf(r.created_at) === yesterday &&
      (r.source === "feedback_neg" || (r.source === "rating" && Number(r.points) < 0)))) {
    hit.push("negative_yesterday");
  }
  if (myLedger.some(r => dayOf(r.created_at) === yesterday && r.source === "rating" && Number(r.points) === 2)) {
    hit.push("rating_five");
  }
  if (yScore > 0 && y2Score > 0) hit.push("good_streak");

  // الترتيب
  const totals = totalsFrom(ledger);
  const names = members.map(m => m.name);
  const ranked = rankMembers(names, totals);
  const myTotal = totals[name] || 0;
  const topTotal = totals[ranked[0]] || 0;
  if (ranked[0] === name && myTotal > 0) hit.push("leader");
  else if (topTotal > 0 && topTotal - myTotal <= 3) hit.push("near_first");

  // آخر أسبوع في الشهر وقريب من الأول
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (lastDay - now.getDate() <= 7 && ranked.indexOf(name) <= 2 && myTotal > 0) {
    hit.push("month_end_close");
  }

  return hit;
}

// ═══════════════════════════════════════════════════
//  التشغيل: بيختار رسالة واحدة ويبعتها
// ═══════════════════════════════════════════════════
export async function runMotivation(name) {
  try {
    const today = toISO(new Date());
    const blockFrom = toISO(addDays(new Date(), -REPEAT_BLOCK_DAYS));

    const [msgs, sentRows, settings] = await Promise.all([
      sb("motivation_messages?is_active=eq.true"),
      sb(`motivation_sent?member_name=eq.${encodeURIComponent(name)}&sent_date=gte.${blockFrom}`),
      sb("app_settings?key=eq.motivation_daily_cap"),
    ]);
    if (!msgs || msgs.length === 0) return null;

    const cap = settings && settings[0] ? Number(settings[0].value) : DEFAULT_CAP;
    const sent = sentRows || [];
    const todayCount = sent.filter(r => dayOf(r.sent_date) === today).length;
    if (cap > 0 && todayCount >= cap) return null;

    const [tasks, ledger, attendance, members] = await Promise.all([
      sb(`tasks?month=eq.${encodeURIComponent(CURRENT_MONTH)}`),
      loadLedger(CURRENT_MONTH),
      sb(`attendance?date=gte.${toISO(addDays(new Date(), -3))}`),
      sb("team_members?is_active=eq.true&select=name"),
    ]);

    const keys = evaluateTriggers(name, {
      tasks: tasks || [], ledger: ledger || [],
      attendance: attendance || [], members: members || [],
    });
    if (keys.length === 0) return null;

    // الرسائل المتاحة: شرطها اتحقق، وماتبعتتش قريب
    const blocked = new Set(sent.map(r => String(r.message_id)));
    const pool = msgs.filter(m => keys.includes(m.trigger_key) && !blocked.has(String(m.id)));
    if (pool.length === 0) return null;

    // رسالة واحدة بس — والباقي يتأجل لتشغيلة تانية
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const text = String(chosen.text).replace(/\[الاسم\]/g, name);

    await sb("motivation_sent", "POST", {
      member_name: name, message_id: String(chosen.id),
      message_text: text, sent_date: today,
    });
    await addNotification(name, `💬 ${text}`, "info");

    return { text, trigger: chosen.trigger_key };
  } catch (e) {
    console.error("Motivation error:", e);
    return null;
  }
}

// ── آخر رسالة النهاردة (لعرضها في صفحة المود) ──
export async function todaysMessages(name) {
  const today = toISO(new Date());
  const rows = await sb(`motivation_sent?member_name=eq.${encodeURIComponent(name)}&sent_date=eq.${today}&order=created_at.desc`);
  return rows || [];
}
