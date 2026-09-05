import { sb, addNotification, CURRENT_MONTH } from "./supabase.js";
import { addScore } from "./score.js";
import { loadLedger, totalsFrom, rankMembers } from "./score.js";
import { loadWorkConfig, isWorkingDay, countWorkingDays } from "./workdays.js";

function dayOf(v) { return v ? String(v).slice(0, 10) : null; }

export const GRADES = {
  easy:   { l: "سهلة",      key: "medal_pts_easy",   def: 3,  color: "#059669" },
  medium: { l: "متوسطة",    key: "medal_pts_medium", def: 5,  color: "#2563EB" },
  hard:   { l: "صعبة",      key: "medal_pts_hard",   def: 10, color: "#7C3AED" },
};

export const IMPACT = {
  small:  { l: "أثر بسيط",  key: "impact_small",  def: 10 },
  medium: { l: "أثر متوسط", key: "impact_medium", def: 15 },
  big:    { l: "أثر كبير",  key: "impact_big",    def: 25 },
};

// نقاط الميدالية: القيمة المخصصة، وإلا مستوى الأثر، وإلا نقاط الدرجة
export function medalPoints(badge, settings = {}, impactLevel) {
  if (badge && badge.points != null && badge.points !== "") return Number(badge.points);
  if (impactLevel && IMPACT[impactLevel]) {
    const v = settings[IMPACT[impactLevel].key];
    return v != null ? Number(v) : IMPACT[impactLevel].def;
  }
  const g = GRADES[(badge && badge.grade) || "medium"] || GRADES.medium;
  const v = settings[g.key];
  return v != null ? Number(v) : g.def;
}

// مفتاح التكرار: مرة واحدة · يومي · أسبوعي
export function repeatKey(badge, month, dateStr) {
  const t = (badge && badge.repeat_type) || "once";
  if (t === "daily")  return `d:${dateStr}`;
  if (t === "weekly") return `w:${weekKey(dateStr)}`;
  return month || "";
}

export function weekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
}
function parseHelpers(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(",").map(x => x.trim()).filter(Boolean);
}

// ═══════════════════════════════════════════════════
//  حساب قيمة كل شرط لعضو
//  بيرجّع رقم يتقارن بالـ threshold
// ═══════════════════════════════════════════════════
export function measure(key, name, ctx) {
  const { tasks = [], ledger = [], attendance = [], winners = [], reviews = [], members = [], targetMins = 0, workedMins = 0, extraMins = 0 } = ctx;
  const mine = tasks.filter(t => t.assigned_to === name && t.status !== "cancelled");
  const myLedger = ledger.filter(r => r.member_name === name);

  switch (key) {
    case "early_delivery":
      return mine.filter(t => t.status === "completed" && t.due_date && t.completed_at &&
        dayOf(t.completed_at) < dayOf(t.due_date)).length;

    case "no_overdue": {
      if (mine.length === 0) return 0;
      const today = new Date().toISOString().slice(0, 10);
      const late = mine.some(t => t.due_date && dayOf(t.due_date) < today && t.status !== "completed");
      const lateDone = mine.some(t => t.status === "completed" && t.due_date && t.completed_at && dayOf(t.completed_at) > dayOf(t.due_date));
      return (!late && !lateDone) ? 1 : 0;
    }

    case "no_revisions": {
      const done = mine.filter(t => t.status === "completed");
      const anyRev = done.filter(t => t.status === "needs_revision").length;
      return anyRev === 0 ? done.length : 0;
    }

    case "helper_count":
      return tasks.filter(t => parseHelpers(t.helpers).includes(name)).length;

    case "initiative_excellent":
      return reviews.filter(r => r.member_name === name && r.initiative === "excellent").length;

    case "deadline_excellent":
      return reviews.filter(r => r.member_name === name && r.deadline === "excellent").length;

    case "first_clock_in": {
      const byDate = {};
      for (const a of attendance) {
        if (!a.clock_in || a.status === "leave") continue;
        const d = dayOf(a.date);
        if (!byDate[d] || new Date(a.clock_in) < new Date(byDate[d].clock_in)) byDate[d] = a;
      }
      return Object.values(byDate).filter(a => a.member_name === name).length;
    }

    case "target_met":
      return targetMins > 0 ? Math.round((workedMins / targetMins) * 100) : 0;

    case "extra_hours":
      return extraMins;

    case "eom_wins":
      return winners.filter(w => w.member_name === name).length;

    case "top_score": {
      const totals = totalsFrom(ledger);
      const ranked = rankMembers(members.map(m => m.name), totals);
      return (ranked[0] === name && (totals[name] || 0) > 0) ? 1 : 0;
    }

    case "top_day_score": {
      const byDay = {};
      for (const r of ledger) {
        const d = dayOf(r.created_at);
        byDay[d] = byDay[d] || {};
        byDay[d][r.member_name] = (byDay[d][r.member_name] || 0) + Number(r.points || 0);
      }
      let wins = 0;
      for (const d of Object.keys(byDay)) {
        const entries = Object.entries(byDay[d]).filter(([, v]) => v > 0);
        if (entries.length === 0) continue;
        const max = Math.max(...entries.map(([, v]) => v));
        if ((byDay[d][name] || 0) === max) wins++;
      }
      return wins;
    }

    case "helped_calls":
      return tasks.filter(t => t.assigned_to === name && String(t.title || "").startsWith("الحقوني") && t.status === "completed").length;

    case "no_absence": {
      const absent = (ctx.workDates || []).filter(d =>
        !attendance.some(a => a.member_name === name && dayOf(a.date) === d));
      return absent.length === 0 && (ctx.workDates || []).length > 0 ? 1 : 0;
    }

    case "no_stalled": {
      const stalled = mine.filter(t => t.status !== "completed" && t.due_date &&
        dayOf(t.due_date) < new Date().toISOString().slice(0, 10));
      return stalled.length === 0 && mine.length > 0 ? 1 : 0;
    }

    case "late_cleared":
      return mine.filter(t => t.status === "completed" && t.due_date && t.completed_at &&
        dayOf(t.completed_at) > dayOf(t.due_date)).length;

    case "mood_streak":
      return (ctx.moodDays || []).filter(m2 => m2.member_name === name).length;

    case "day_starter": {
      const today2 = new Date().toISOString().slice(0, 10);
      const dayRows = attendance.filter(a => dayOf(a.date) === today2 && a.clock_in && a.status !== "leave");
      if (dayRows.length === 0) return 0;
      const first = dayRows.reduce((a, b) => new Date(a.clock_in) <= new Date(b.clock_in) ? a : b);
      return first.member_name === name ? 1 : 0;
    }

    case "day_closer": {
      const today2 = new Date().toISOString().slice(0, 10);
      const doneToday = tasks.filter(t => t.status === "completed" && dayOf(t.completed_at) === today2);
      if (doneToday.length === 0) return 0;
      const last = doneToday.reduce((a, b) => new Date(a.completed_at) >= new Date(b.completed_at) ? a : b);
      return last.assigned_to === name ? 1 : 0;
    }

    // شروط لسه مربوطة بأقسام ما اتبنتش (الحقوني · السحب · التدريب)
    case "first_responder":
    case "draw_wins":
    case "draw_entries":
    case "positive_mood":
    case "week_target":
    case "week_on_time":
    case "week_overtime":
    case "clean_week":
    case "training_all":
    case "training_ontime":
    case "training_first":
    case "training_excellent":
    case "training_done":
      return 0;

    default:
      return 0;
  }
}

// ═══════════════════════════════════════════════════
//  التشغيل: بيمنح الشارات المستحقة
// ═══════════════════════════════════════════════════
export async function runBadges(month = CURRENT_MONTH) {
  try {
    const [all, owned, members, tasks, ledger, attendance, winners, reviews, cfg, settings] = await Promise.all([
      sb("badges?is_active=eq.true&award_type=eq.auto"),
      sb("member_badges?select=member_name,badge_id,month"),
      sb("team_members?is_active=eq.true&select=name"),
      sb(`tasks?month=eq.${encodeURIComponent(month)}`),
      loadLedger(month),
      sb("attendance?select=member_name,date,clock_in,status,working_minutes"),
      sb("eom_winners?select=member_name"),
      sb("daily_reviews?select=member_name,deadline,initiative"),
      loadWorkConfig(),
      sb("app_settings?key=eq.daily_hours"),
    ]);
    if (!all || all.length === 0) return { awarded: 0 };

    const dailyHours = settings && settings[0] ? Number(settings[0].value) : 8;
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const workDays = countWorkingDays(`${now.getFullYear()}-${mm}-01`, `${now.getFullYear()}-${mm}-${last}`, cfg);
    const targetMins = workDays * dailyHours * 60;

    const settingsMap = {};
    for (const r of (await sb("app_settings?select=key,value")) || []) settingsMap[r.key] = r.value;
    const pointsOn = settingsMap.feature_medal_points !== "0";

    const todayStr = new Date().toISOString().slice(0, 10);
    const has = new Set((owned || []).map(o => `${o.member_name}|${o.badge_id}|${o.period || o.month || ""}`));

    // أيام العمل الفعلية في الشهر (لميدالية «ما غابش»)
    const workDates = [];
    {
      const cur = new Date(`${now.getFullYear()}-${mm}-01T00:00:00`);
      const stop = new Date(`${now.getFullYear()}-${mm}-${String(last).padStart(2, "0")}T00:00:00`);
      let guard = 0;
      while (cur <= stop && cur <= now && guard < 40) {
        const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        if (isWorkingDay(d, cfg)) workDates.push(d);
        cur.setDate(cur.getDate() + 1); guard++;
      }
    }
    const moodDays = (await sb(`mood_answers?skipped=eq.false&select=member_name,answer_date`)) || [];

    let awarded = 0;

    for (const m of (members || [])) {
      const myAtt = (attendance || []).filter(a => a.member_name === m.name);
      let workedMins = 0, extraMins = 0;
      for (const a of myAtt) {
        const d = dayOf(a.date);
        if (a.status === "leave") continue;
        const v = Number(a.working_minutes) || 0;
        if (isWorkingDay(d, cfg)) workedMins += v; else extraMins += v;
      }

      const ctx = { tasks: tasks || [], ledger, attendance: attendance || [], winners: winners || [], reviews: reviews || [], members: members || [], targetMins, workedMins, extraMins, workDates, moodDays };

      for (const b of all) {
        const period = repeatKey(b, ["eom_wins"].includes(b.condition_key) ? "" : month, todayStr);
        const key = `${m.name}|${b.id}|${period}`;
        if (has.has(key)) continue;

        const value = measure(b.condition_key, m.name, ctx);
        if (value >= Number(b.threshold || 1)) {
          const pts = pointsOn ? medalPoints(b, settingsMap) : 0;

          await sb("member_badges", "POST", {
            member_name: m.name, badge_id: String(b.id),
            badge_name: b.name, badge_icon: b.icon,
            month, period, award_date: todayStr,
            points_awarded: pts, awarded_by: "🤖 تلقائي",
          });

          if (pts > 0) {
            await addScore({
              member: m.name, month, points: pts, source: "medal",
              reason: `ميدالية «${b.name}»`, by: "🤖 تلقائي",
            });
          }

          await addNotification(m.name, `${b.icon} حصلت على ميدالية: ${b.name}${pts > 0 ? ` · +${pts} نقطة` : ""}`, "info");
          has.add(key);
          awarded++;
        }
      }
    }
    return { awarded };
  } catch (e) {
    console.error("Badges error:", e);
    return { awarded: 0, error: true };
  }
}
