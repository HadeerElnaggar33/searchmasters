// ═══════════════════════════════════════════════════
//  Search Masters Workspace — المهمة اليومية
//  المرحلة 3: توليد التاسكات المتكررة + التقرير الأسبوعي + التذكيرات
//  تشتغل كل يوم 6:00 UTC ≈ 9 صباحاً بتوقيت القاهرة
//
//  للاختبار بدون كتابة أي بيانات:  /api/cron?dry=1
// ═══════════════════════════════════════════════════

const MAX_PER_RULE = 5;    // أقصى عدد تاسكات من قاعدة واحدة في التشغيلة
const CATCHUP_DAYS = 10;   // أقصى عدد أيام نرجع لورا نعوّض فيها

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

// ── أدوات التواريخ ──
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function monthLabel(d) { return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

function isWorkingDay(ds, cfg) {
  const d = new Date(ds + "T00:00:00");
  if (isNaN(d)) return false;
  if (!cfg.workingDays.includes(d.getDay())) return false;
  if (cfg.holidays.some(h => String(h.date).slice(0, 10) === ds)) return false;
  return true;
}

function shiftToWorkingDay(d, cfg) {
  let x = new Date(d), guard = 0;
  while (!isWorkingDay(dateStr(x), cfg) && guard < 20) { x = addDays(x, 1); guard++; }
  return x;
}

function isDueOn(rule, d, cfg) {
  const ds = dateStr(d);
  if (rule.frequency === "daily") return isWorkingDay(ds, cfg);
  if (rule.frequency === "weekly") {
    const dow = Number(rule.day_of_week ?? 1);
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

// ═══════════════════════════════════════════════════

export default async function handler(req, res) {
  const startedAt = new Date().toISOString();
  const dryRun = !!(req.query && (req.query.dry === "1" || req.query.dry === "true"));

  // ── 1) التحقق من هوية المُنادي ──
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    const ok = auth === `Bearer ${secret}` || (req.query && req.query.key === secret);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "غير مصرّح", hint: "للاختبار اليدوي ضيفي ?key=CRON_SECRET" });
    }
  }

  // ── 2) إعدادات Supabase ──
  // تنظيف القيم: مسافات، أسطر جديدة، علامات اقتباس، شرطة في الآخر
  const clean = v => String(v || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "").replace(/\/+$/, "");
  const URL = clean(process.env.SUPABASE_URL);
  const KEY = clean(process.env.SUPABASE_KEY);
  if (!URL || !KEY) {
    return res.status(500).json({
      ok: false,
      stage: "متغيرات البيئة",
      missing: [!URL && "SUPABASE_URL", !KEY && "SUPABASE_KEY"].filter(Boolean),
      fix: "Vercel ← Settings ← Environment Variables ← ضيفي المتغيرين ← بعدين Redeploy",
    });
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL)) {
    return res.status(500).json({
      ok: false,
      stage: "شكل الرابط",
      error: "SUPABASE_URL شكله مش مظبوط",
      received: URL,
      expected: "https://xxxxxxxx.supabase.co",
      fix: "Vercel ← Settings ← Environment Variables ← SUPABASE_URL ← اكتبيه بإيدك من غير مسافات ولا / في الآخر ← بعدين Redeploy",
    });
  }

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

  async function api(path, method = "GET", body = null) {
    const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : null });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : [];
  }

  const log = [];
  const created = [];
  const skipped = [];

  try {
    // ── 3) تحميل الإعدادات ──
    const [settings, holidays, rules] = await Promise.all([
      api("app_settings?key=eq.working_days&select=value"),
      api("holidays?select=date,name"),
      api("recurring_tasks?is_active=eq.true"),
    ]);

    let workingDays = DEFAULT_WORKING_DAYS;
    if (settings[0]?.value) {
      try {
        const p = JSON.parse(settings[0].value);
        if (Array.isArray(p)) workingDays = p.map(Number);
      } catch (e) { /* نرجع للافتراضي */ }
    }
    const cfg = { workingDays, holidays };

    const today = new Date(dateStr(new Date()) + "T00:00:00");
    const todayStr = dateStr(today);

    // ── 4) المرور على كل قاعدة ──
    for (const rule of rules) {
      let cursor = rule.last_generated_date
        ? addDays(new Date(String(rule.last_generated_date).slice(0, 10) + "T00:00:00"), 1)
        : new Date(today);
      const earliest = addDays(today, -CATCHUP_DAYS);
      if (cursor < earliest) cursor = earliest;

      let madeHere = 0;
      let lastSeen = null;

      while (cursor <= today && madeHere < MAX_PER_RULE) {
        if (isDueOn(rule, cursor, cfg)) {
          const occ = dateStr(cursor);

          const existing = await api(
            `tasks?recurring_id=eq.${encodeURIComponent(String(rule.id))}&due_date=eq.${occ}&select=id`
          );

          if (existing.length > 0) {
            skipped.push(`${rule.title} — ${occ} (موجودة قبل كده)`);
            lastSeen = occ;
          } else if (dryRun) {
            created.push(`${rule.title} — ${occ} (تجريبي، ماتعملتش)`);
            madeHere++;
            lastSeen = occ;
          } else {
            const owner = rule.assigned_to || rule.created_by;
            const made = await api("tasks", "POST", {
              title: rule.title,
              task_type: rule.task_type,
              priority: rule.priority || "medium",
              project_id: rule.project_id || null,
              assigned_to: owner,
              month: monthLabel(cursor),
              due_date: occ,
              status: "todo",
              created_by: "🔄 تلقائي",
              recurring_id: String(rule.id),
            });

            if (made[0]) {
              created.push(`${rule.title} — ${occ} → ${owner}`);
              madeHere++;
              lastSeen = occ;
              if (owner) {
                await api("notifications", "POST", {
                  recipient: owner,
                  content: `🔄 تاسك متكررة جديدة: ${rule.title}`,
                  type: "assign",
                  related_task_id: made[0].id,
                });
              }
            }
          }
        }
        cursor = addDays(cursor, 1);
      }

      if (!dryRun && (lastSeen || !rule.last_generated_date)) {
        await api(`recurring_tasks?id=eq.${rule.id}`, "PATCH", { last_generated_date: lastSeen || todayStr });
      }

      log.push(`${rule.title} (${rule.frequency}): ${madeHere} جديدة`);
    }

    // ═══════════════════════════════════════════
    //  المرحلة 3: التقرير الأسبوعي + التذكيرات
    // ═══════════════════════════════════════════
    const notices = [];

    // إشعار بدون تكرار في نفس اليوم
    async function notifyOnce(recipient, marker, content) {
      if (!recipient) return false;
      const dup = await api(
        `notifications?recipient=eq.${encodeURIComponent(recipient)}` +
        `&created_at=gte.${todayStr}T00:00:00&content=like.*${encodeURIComponent(marker)}*&select=id`
      );
      if (dup.length > 0) { notices.push(`⏭ ${recipient}: ${marker} (اتبعت قبل كده النهارده)`); return false; }
      if (dryRun) { notices.push(`🧪 ${recipient}: ${marker}`); return true; }
      await api("notifications", "POST", { recipient, content, type: "info" });
      notices.push(`✉️ ${recipient}: ${marker}`);
      return true;
    }

    const monthName = monthLabel(today);
    const [members, monthTasks] = await Promise.all([
      api("team_members?is_active=eq.true&select=name,role"),
      api(`tasks?month=eq.${encodeURIComponent(monthName)}`),
    ]);
    const managers = members.filter(m => m.role === "admin" || m.role === "team_leader");

    const live = monthTasks.filter(t => t.status !== "cancelled");
    const isOverdue = t => t.due_date && String(t.due_date).slice(0, 10) < todayStr && t.status !== "completed" && t.status !== "cancelled";

    // ── (أ) تنبيه التاسكات المتأخرة — ملخص واحد لكل شخص ──
    for (const m of members) {
      const mine = live.filter(t => t.assigned_to === m.name && isOverdue(t));
      if (mine.length > 0) {
        await notifyOnce(m.name, "تاسكات متأخرة",
          `🔴 عندك ${mine.length} تاسك متأخرة: ${mine.slice(0, 3).map(t => t.title).join(" · ")}${mine.length > 3 ? " …" : ""}`);
      }
    }

    // ── (ب) التقرير الأسبوعي — كل خميس ──
    let weeklySent = false;
    if (today.getDay() === 4) {
      const weekAgo = dateStr(addDays(today, -7));
      const doneWeek = live.filter(t => t.completed_at && String(t.completed_at).slice(0, 10) >= weekAgo);
      const pending = live.filter(t => t.status !== "completed").length;
      const overdueAll = live.filter(isOverdue).length;
      const shifted = live.filter(t => (t.shift_count || 0) > 0).length;

      const byMember = {};
      for (const t of doneWeek) byMember[t.assigned_to] = (byMember[t.assigned_to] || 0) + 1;
      const top = Object.entries(byMember).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([n, c]) => `${n} (${c})`).join(" · ") || "—";

      const body =
        `📊 التقرير الأسبوعي — ${monthName}\n` +
        `✅ منجز الأسبوع ده: ${doneWeek.length}\n` +
        `⏳ متبقي: ${pending}\n` +
        `🔴 متأخر: ${overdueAll}\n` +
        `⏩ اتأجل: ${shifted}\n` +
        `🏅 الأعلى إنجازاً: ${top}`;

      for (const m of managers) {
        if (await notifyOnce(m.name, "التقرير الأسبوعي", body)) weeklySent = true;
      }
    }

    // ── (ج) تذكيرات موظف الشهر ──
    const [winners, noms] = await Promise.all([
      api("eom_winners?select=month,member_name,delivered,chosen_at"),
      api(`eom_nominations?month=eq.${encodeURIComponent(monthName)}&select=updated_at`),
    ]);

    // آخر يومين عمل في الشهر ولسه مفيش فائز
    const lastDayNum = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let remainingWorkDays = 0;
    for (let d = today.getDate(); d <= lastDayNum; d++) {
      const s2 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (isWorkingDay(s2, cfg)) remainingWorkDays++;
    }
    if (remainingWorkDays <= 2 && !winners.some(w => w.month === monthName)) {
      for (const m of managers) {
        await notifyOnce(m.name, "اختيار موظف الشهر",
          `🏆 فاضل ${remainingWorkDays} يوم عمل على آخر الشهر ولسه ما اتحددش موظف الشهر لـ ${monthName}`);
      }
    }

    // جائزة عدى عليها شهر ولسه ما اتسلمتش
    for (const w of winners.filter(x => !x.delivered && x.chosen_at)) {
      const days = Math.floor((today - new Date(String(w.chosen_at).slice(0, 10) + "T00:00:00")) / 86400000);
      if (days >= 30) {
        for (const m of managers) {
          await notifyOnce(m.name, `جائزة ${w.month}`,
            `🎁 عدى ${days} يوم على اختيار ${w.member_name} لـ ${w.month} والجائزة لسه ما اتسلمتش`);
        }
      }
    }

    // عدى أسبوعين بدون تحديث الترشيحات
    if (noms.length > 0) {
      const newest = noms.map(n => n.updated_at).filter(Boolean).sort().pop();
      if (newest) {
        const days = Math.floor((today - new Date(String(newest).slice(0, 10) + "T00:00:00")) / 86400000);
        if (days >= 14) {
          for (const m of managers) {
            await notifyOnce(m.name, "تحديث الترشيحات",
              `📊 عدى ${days} يوم من غير تحديث لنسب ترشيح موظف الشهر`);
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      mode: dryRun ? "🧪 تجريبي — مفيش أي كتابة" : "✅ تنفيذ فعلي",
      date: todayStr,
      dayName: ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][today.getDay()],
      isWorkingDay: isWorkingDay(todayStr, cfg),
      recurring: { rulesChecked: rules.length, createdCount: created.length, created, skipped, perRule: log },
      weeklyReport: today.getDay() === 4 ? (weeklySent ? "✅ اتبعت" : "اتبعت قبل كده النهارده") : "مش خميس النهارده",
      notifications: notices,
      startedAt,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      stage: "أثناء التوليد",
      error: String(e.message || e),
      createdBeforeError: created,
      startedAt,
    });
  }
}
