import { sb, addNotification, MONTHS } from "./supabase.js";
import { loadWorkConfig, isWorkingDay } from "./workdays.js";

// أقصى عدد تاسكات تتولد من قاعدة واحدة في التشغيلة الواحدة
const MAX_PER_RULE = 5;
// أقصى عدد أيام نرجع لورا نعوّض فيها لو الأبلكيشن مافتحش
const CATCHUP_DAYS = 10;

export function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(d) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ── لو اليوم المفروض عطلة، نزحزح لأول يوم عمل بعده ──
function shiftToWorkingDay(d, cfg) {
  let x = new Date(d);
  let guard = 0;
  while (!isWorkingDay(dateStr(x), cfg) && guard < 20) {
    x = addDays(x, 1);
    guard++;
  }
  return x;
}

// ── هل التاريخ ده هو موعد التوليد الفعلي للقاعدة دي؟ ──
export function isDueOn(rule, d, cfg) {
  const ds = dateStr(d);

  if (rule.frequency === "daily") {
    return isWorkingDay(ds, cfg);
  }

  if (rule.frequency === "weekly") {
    const dow = Number(rule.day_of_week ?? 1);
    // اليوم المقصود في نفس أسبوع d (الأسبوع بيبدأ الأحد)
    const nominal = addDays(d, dow - d.getDay());
    return dateStr(shiftToWorkingDay(nominal, cfg)) === ds;
  }

  if (rule.frequency === "monthly") {
    const dom = Number(rule.day_of_month ?? 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const nominal = new Date(d.getFullYear(), d.getMonth(), Math.min(dom, lastDay));
    return dateStr(shiftToWorkingDay(nominal, cfg)) === ds;
  }

  return false;
}

// ── الموعد القادم (للعرض فقط) ──
export function nextDueDate(rule, cfg, fromDate = new Date()) {
  let d = new Date(fromDate);
  for (let i = 0; i < 70; i++) {
    if (isDueOn(rule, d, cfg)) return dateStr(d);
    d = addDays(d, 1);
  }
  return null;
}

// ═══════════════════════════════════════════════
//  المحرك — بيشتغل أول ما حد يفتح الأبلكيشن
//  بيعوّض الأيام الفايتة، وبيمنع التكرار المزدوج
// ═══════════════════════════════════════════════
export async function runRecurringEngine(triggeredBy) {
  try {
    const [rules, cfg] = await Promise.all([
      sb("recurring_tasks?is_active=eq.true"),
      loadWorkConfig(),
    ]);
    if (!rules || rules.length === 0) return { created: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = dateStr(today);
    let created = 0;

    for (const rule of rules) {
      // من امتى نبدأ نفحص
      let cursor;
      if (rule.last_generated_date) {
        cursor = addDays(new Date(String(rule.last_generated_date).slice(0, 10) + "T00:00:00"), 1);
      } else {
        cursor = new Date(today);
      }
      const earliest = addDays(today, -CATCHUP_DAYS);
      if (cursor < earliest) cursor = earliest;

      let madeForThisRule = 0;
      let lastMade = null;

      while (cursor <= today && madeForThisRule < MAX_PER_RULE) {
        if (isDueOn(rule, cursor, cfg)) {
          const occStr = dateStr(cursor);

          // فحص أخير: هل التاسكة دي اتعملت قبل كده؟
          const existing = await sb(
            `tasks?recurring_id=eq.${encodeURIComponent(String(rule.id))}&due_date=eq.${occStr}&select=id`
          );

          if (!existing || existing.length === 0) {
            const res = await sb("tasks", "POST", {
              title: rule.title,
              task_type: rule.task_type,
              priority: rule.priority || "medium",
              project_id: rule.project_id || null,
              assigned_to: rule.assigned_to || rule.created_by || triggeredBy,
              month: monthLabel(cursor),
              due_date: occStr,
              status: "todo",
              created_by: "🔄 تلقائي",
              recurring_id: String(rule.id),
            });

            if (res && res[0]) {
              created++;
              madeForThisRule++;
              lastMade = occStr;
              const who = rule.assigned_to || rule.created_by;
              if (who) {
                await addNotification(who, `🔄 تاسك متكررة جديدة: ${rule.title}`, "assign", res[0].id);
              }
            }
          } else {
            lastMade = occStr;
          }
        }
        cursor = addDays(cursor, 1);
      }

      if (lastMade || !rule.last_generated_date) {
        await sb(`recurring_tasks?id=eq.${rule.id}`, "PATCH", {
          last_generated_date: lastMade || todayStr,
        });
      }
    }

    return { created };
  } catch (e) {
    console.error("Recurring engine error:", e);
    return { created: 0, error: true };
  }
}
