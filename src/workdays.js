import { sb } from "./supabase.js";

export const WEEKDAYS = [
  { v: 0, l: "الأحد" },
  { v: 1, l: "الإثنين" },
  { v: 2, l: "الثلاثاء" },
  { v: 3, l: "الأربعاء" },
  { v: 4, l: "الخميس" },
  { v: 5, l: "الجمعة" },
  { v: 6, l: "السبت" },
];

export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4]; // الأحد → الخميس

// ── تحميل إعدادات أيام العمل + العطلات الرسمية ──
export async function loadWorkConfig() {
  const [s, h] = await Promise.all([
    sb("app_settings?key=eq.working_days"),
    sb("holidays?order=date"),
  ]);
  let workingDays = DEFAULT_WORKING_DAYS;
  if (s && s[0] && s[0].value) {
    try {
      const parsed = JSON.parse(s[0].value);
      if (Array.isArray(parsed)) workingDays = parsed.map(Number);
    } catch (e) { /* القيمة تالفة — نرجع للافتراضي */ }
  }
  return { workingDays, holidays: h || [] };
}

export async function saveWorkingDays(days) {
  const existing = await sb("app_settings?key=eq.working_days");
  const value = JSON.stringify(days);
  if (existing && existing.length) {
    return await sb("app_settings?key=eq.working_days", "PATCH", { value });
  }
  return await sb("app_settings", "POST", { key: "working_days", value });
}

// ── هل التاريخ ده عطلة رسمية؟ يرجّع بيانات العطلة أو null ──
export function getHoliday(dateStr, cfg) {
  if (!dateStr || !cfg) return null;
  return (cfg.holidays || []).find(h => String(h.date).slice(0, 10) === dateStr) || null;
}

// ── هل ده يوم عمل؟ ──
export function isWorkingDay(dateStr, cfg) {
  if (!dateStr || !cfg) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return false;
  if (!(cfg.workingDays || []).includes(d.getDay())) return false;
  if (getHoliday(dateStr, cfg)) return false;
  return true;
}

// ── نوع اليوم: عمل / إجازة أسبوعية / عطلة رسمية ──
export function dayKind(dateStr, cfg) {
  const holiday = getHoliday(dateStr, cfg);
  if (holiday) return { type: "holiday", label: holiday.name, icon: "🎉" };
  const d = new Date(dateStr + "T00:00:00");
  if (!(cfg.workingDays || []).includes(d.getDay())) {
    return { type: "weekend", label: "إجازة أسبوعية", icon: "🌙" };
  }
  return { type: "work", label: "يوم عمل", icon: "💼" };
}

// ── عدد أيام العمل الفعلية بين تاريخين (شامل الطرفين) ──
export function countWorkingDays(startStr, endStr, cfg) {
  if (!startStr || !endStr || !cfg) return 0;
  let count = 0;
  const cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  while (cur <= end) {
    const s = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (isWorkingDay(s, cfg)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── أول وآخر يوم في شهر تاريخ معيّن ──
export function monthBounds(dateStr) {
  const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const mm = String(m + 1).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}
