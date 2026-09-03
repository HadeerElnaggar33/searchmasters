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

  const correct = String(answer).trim() === String(draw.correct).trim();

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
