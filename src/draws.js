import { sb } from "./supabase.js";

export function parseOpts(v) {
  if (!v) return [];
  return String(v).split(",").map(x => x.trim()).filter(Boolean);
}

// ── هل السحب لسه مفتوح؟ ──
export function isLive(draw, now = new Date()) {
  if (!draw || draw.status !== "open") return false;
  if (draw.opens_at && new Date(draw.opens_at) > now) return false;
  if (draw.closes_at && new Date(draw.closes_at) <= now) return false;
  return true;
}

// ── هل انتهت مدته من غير فايز؟ ──
export function isExpired(draw, now = new Date()) {
  if (!draw || draw.status !== "open") return false;
  return !!(draw.closes_at && new Date(draw.closes_at) <= now);
}

// ── السحب المتاح للعضو دلوقتي (لسه ما جاوبش عليه) ──
export function liveDrawFor(draws, attempts, name, now = new Date()) {
  const answered = new Set(
    attempts.filter(a => a.member_name === name).map(a => String(a.draw_id))
  );
  return draws.find(d => isLive(d, now) && !answered.has(String(d.id))) || null;
}

// ── رصيد هدايا العضو ──
export function giftStats(draws, attempts, name) {
  const wins = draws.filter(d => d.status === "won" && d.winner_name === name);
  const mine = attempts.filter(a => a.member_name === name);
  const points = mine.reduce((s, a) => s + Number(a.points || 0), 0);
  return {
    wins,
    winCount: wins.length,
    attempts: mine.length,
    correct: mine.filter(a => a.is_correct).length,
    wrong: mine.filter(a => a.is_correct === false).length,
    points,
  };
}

// ── تسجيل محاولة إجابة ──
//    بيرجّع: won | wrong | taken | closed
export async function submitAnswer(draw, name, answer) {
  // اتأكد إن السحب لسه مفتوح ومحدش كسبه
  const fresh = await sb(`draws?id=eq.${draw.id}&select=status,winner_name,closes_at`);
  const cur = fresh && fresh[0];
  if (!cur || cur.status !== "open") return "closed";
  if (cur.closes_at && new Date(cur.closes_at) <= new Date()) return "closed";

  let correct = String(answer).trim() === String(draw.correct).trim();

  // توجيه الفوز: لو السحب موجّه لعضو بعينه، غيره مبيكسبش حتى لو جاوب صح
  if (draw.steer_to && draw.steer_to !== name) correct = false;

  const rec = await sb("draw_attempts", "POST", {
    draw_id: String(draw.id),
    member_name: name,
    answer,
    is_correct: correct,
    points: correct ? 1 : -1,
  });
  if (!rec) return "taken";   // جاوب قبل كده

  if (!correct) return "wrong";

  // أول واحد يجاوب صح بس هو اللي يكسب
  const claim = await sb(`draws?id=eq.${draw.id}&status=eq.open&winner_name=is.null`, "PATCH", {
    status: "won",
    winner_name: name,
    winner_answer: answer,
    won_at: new Date().toISOString(),
  });

  if (claim && claim.length > 0) return "won";
  return "closed";   // حد سبقه بجزء من الثانية
}

// ── إلغاء السحوبات اللي خلصت مدتها من غير فايز ──
export async function expireDraws() {
  const nowIso = new Date().toISOString();
  const open = await sb(`draws?status=eq.open&closes_at=lt.${nowIso}&select=id`);
  if (!open || open.length === 0) return 0;
  for (const d of open) {
    await sb(`draws?id=eq.${d.id}`, "PATCH", { status: "cancelled" });
  }
  return open.length;
}

// ═══════════════════════════════════════════════════
//  أنواع السحب (تعديل ٤٢)
// ═══════════════════════════════════════════════════

export const DRAW_TYPES = {
  questions: { l: "سحب بالأسئلة",        icon: "❓", desc: "أول من يجيب كل الأسئلة صح · للمرح والسرعة" },
  weekly:    { l: "سحب بالتقييم الأسبوعي", icon: "📊", desc: "أعلى رصيد نقاط خلال الأسبوع · بدون أسئلة" },
  period:    { l: "سحب بالأداء لفترة",    icon: "📅", desc: "فترة ومعيار تحدديهم إنتي" },
  pressure:  { l: "سحب على الضغط",        icon: "💪", desc: "بيكافئ اللي اتحمّل ضغط أعلى مش اللي أنجز أكتر" },
};

export const CRITERIA = {
  points:         { l: "أعلى نقاط",              for: ["weekly", "period"] },
  hours:          { l: "أعلى ساعات",             for: ["period"] },
  tasks:          { l: "أكتر تاسكات مكتملة",     for: ["period"] },
  least_late:     { l: "أقل تأخير",              for: ["period"] },
  open_tasks:     { l: "أكتر تاسكات مفتوحة",     for: ["pressure"] },
  pressure_hours: { l: "أكتر ساعات في فترة قصيرة", for: ["pressure"] },
  tight_delivery: { l: "سلّم تحت تسليمات متقاربة", for: ["pressure"] },
};

function dOf(v) { return v ? String(v).slice(0, 10) : null; }

// ── حساب الفائزين بالمعيار · التساوي = الكل يكسب ──
export function computeWinners(criterion, ctx) {
  const { members = [], ledger = [], attendance = [], tasks = [], from, to } = ctx;
  const inRange = d => !!d && (!from || d >= from) && (!to || d <= to);
  const scores = {};

  for (const m of members) {
    const name = m.name;
    if (criterion === "points") {
      scores[name] = ledger
        .filter(r => r.member_name === name && inRange(dOf(r.created_at)))
        .reduce((a, r) => a + Number(r.points || 0), 0);
    } else if (criterion === "hours" || criterion === "pressure_hours") {
      scores[name] = attendance
        .filter(a => a.member_name === name && a.status !== "leave" && inRange(dOf(a.date)))
        .reduce((a, x) => a + (Number(x.working_minutes) || 0), 0);
    } else if (criterion === "tasks") {
      scores[name] = tasks.filter(t => t.assigned_to === name && t.status === "completed" && inRange(dOf(t.completed_at))).length;
    } else if (criterion === "least_late") {
      const late = tasks.filter(t => t.assigned_to === name && t.due_date && t.completed_at &&
        inRange(dOf(t.completed_at)) && dOf(t.completed_at) > dOf(t.due_date)).length;
      scores[name] = -late;                       // الأقل تأخير = الأعلى
    } else if (criterion === "open_tasks" || criterion === "tight_delivery") {
      scores[name] = tasks.filter(t => t.assigned_to === name &&
        t.status !== "completed" && t.status !== "cancelled" && !!t.due_date).length;
    } else {
      scores[name] = 0;
    }
  }

  const values = Object.values(scores);
  if (values.length === 0) return { winners: [], scores, top: 0 };
  const top = Math.max(...values);
  if (top <= 0 && criterion !== "least_late") return { winners: [], scores, top };
  const winners = Object.keys(scores).filter(n => scores[n] === top);
  return { winners, scores, top };
}

// ── ترتيب العضو في المعيار المعلن ──
export function rankIn(scores, name) {
  const sorted = Object.keys(scores || {}).sort((a, b) => scores[b] - scores[a]);
  const i = sorted.indexOf(name);
  return { rank: i + 1, of: sorted.length, value: scores[name] || 0 };
}
