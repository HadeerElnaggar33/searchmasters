import { sb, addNotification, CURRENT_MONTH } from "./supabase.js";
import { loadLedger, totalsFrom, rankMembers } from "./score.js";
import { loadWorkConfig, isWorkingDay, countWorkingDays } from "./workdays.js";

function dayOf(v) { return v ? String(v).slice(0, 10) : null; }
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

    const has = new Set((owned || []).map(o => `${o.member_name}|${o.badge_id}|${o.month || ""}`));
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

      const ctx = { tasks: tasks || [], ledger, attendance: attendance || [], winners: winners || [], reviews: reviews || [], members: members || [], targetMins, workedMins, extraMins };

      for (const b of all) {
        // الشارات المتكررة شهرياً بتتخزن بالشهر، والدايمة من غير شهر
        const perMonth = !["eom_wins"].includes(b.condition_key);
        const key = `${m.name}|${b.id}|${perMonth ? month : ""}`;
        if (has.has(key)) continue;

        const value = measure(b.condition_key, m.name, ctx);
        if (value >= Number(b.threshold || 1)) {
          await sb("member_badges", "POST", {
            member_name: m.name, badge_id: String(b.id),
            badge_name: b.name, badge_icon: b.icon,
            month: perMonth ? month : null, awarded_by: "🤖 تلقائي",
          });
          await addNotification(m.name, `${b.icon} حصلت على شارة: ${b.name}`, "info");
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
