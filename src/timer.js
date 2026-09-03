import { sb, addNotification } from "./supabase.js";

export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDur(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}س ${r}د`;
  if (h) return `${h}س`;
  return `${r}د`;
}

export function fmtClock(secs) {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const p = n => String(n).padStart(2, "0");
  return h ? `${p(h)}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

// ── الجلسة الشغالة حالياً لعضو ──
export async function activeTimer(name) {
  const rows = await sb(`task_timers?member_name=eq.${encodeURIComponent(name)}&ended_at=is.null&order=started_at.desc&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

// ── تشغيل التايمر على تاسك ──
export async function startTimer(task, name, projectName) {
  // اقفل أي جلسة شغالة الأول — مينفعش تايمرين مع بعض
  await stopTimer(name);
  const rows = await sb("task_timers", "POST", {
    task_id: String(task.id),
    task_title: task.title,
    project_name: projectName || null,
    member_name: name,
    work_date: toISODate(),
    started_at: new Date().toISOString(),
  });
  return rows && rows[0] ? rows[0] : null;
}

// ── إيقاف التايمر وحساب المدة ──
export async function stopTimer(name) {
  const open = await activeTimer(name);
  if (!open) return null;
  const now = new Date();
  const mins = Math.max(0, Math.round((now - new Date(open.started_at)) / 60000));
  await sb(`task_timers?id=eq.${open.id}`, "PATCH", {
    ended_at: now.toISOString(),
    duration_minutes: mins,
  });
  // حدّث إجمالي وقت التاسك
  const all = await sb(`task_timers?task_id=eq.${encodeURIComponent(open.task_id)}&select=duration_minutes`);
  const total = (all || []).reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
  await sb(`tasks?id=eq.${open.task_id}`, "PATCH", { total_minutes: total });
  return { ...open, duration_minutes: mins };
}

// ── هل التاسك دي عليها وقت مسجّل؟ ──
export async function taskHasTime(taskId) {
  const rows = await sb(`task_timers?task_id=eq.${encodeURIComponent(String(taskId))}&select=duration_minutes`);
  return (rows || []).some(r => Number(r.duration_minutes) > 0);
}

// ── تنبيه ودّي لو قفل تاسك من غير وقت (للعضو لوحده) ──
export async function noticeClosedWithoutTime(task, name) {
  await sb(`tasks?id=eq.${task.id}`, "PATCH", { closed_without_time: true });
  await addNotification(name, "⏱ التنبيه ده ليك بس — الحق سجّل وقتك المرة الجاية", "info", task.id);
}

// ═══════════════════════════════════════════════════
//  بلوكات الشغل: جلسات متصلة خلال اليوم
//  أي فجوة أكبر من gapMinutes تبدأ بلوك جديد
// ═══════════════════════════════════════════════════
export function buildBlocks(sessions, gapMinutes = 20) {
  const done = (sessions || [])
    .filter(s => s.started_at)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  const blocks = [];
  for (const s of done) {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : new Date();
    const last = blocks[blocks.length - 1];

    if (last && (start - last.end) / 60000 <= gapMinutes) {
      last.end = end > last.end ? end : last.end;
      last.sessions.push(s);
      if (s.task_title && !last.tasks.includes(s.task_title)) last.tasks.push(s.task_title);
      last.minutes += Number(s.duration_minutes) || Math.round((end - start) / 60000);
    } else {
      blocks.push({
        start, end,
        sessions: [s],
        tasks: s.task_title ? [s.task_title] : [],
        minutes: Number(s.duration_minutes) || Math.round((end - start) / 60000),
      });
    }
  }
  return blocks;
}

// ── حالة العضو من آخر ظهور ──
export function presenceOf(lastSeen, idleAfterMinutes = 180, now = new Date()) {
  if (!lastSeen) return { state: "offline", label: "أوفلاين", color: "#94A3B8", icon: "⚪" };
  const mins = (now - new Date(lastSeen)) / 60000;
  if (mins <= 5) return { state: "online", label: "أونلاين", color: "#059669", icon: "🟢" };
  if (mins <= idleAfterMinutes) return { state: "idle", label: "خامل", color: "#D97706", icon: "🟡" };
  return { state: "offline", label: "أوفلاين", color: "#94A3B8", icon: "⚪" };
}

// ── تحديث نبضة التواجد ──
export async function heartbeat(name) {
  try {
    await sb(`team_members?name=eq.${encodeURIComponent(name)}`, "PATCH", { last_seen: new Date().toISOString() });
  } catch (e) { /* تجاهل */ }
}
