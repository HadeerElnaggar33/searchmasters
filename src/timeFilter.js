// ═══════════════════════════════════════════════════
//  الفلتر الزمني الموحّد (تعديل ٤٣)
//  بيتستخدم في كل صفحات السجلات
// ═══════════════════════════════════════════════════

export const RANGES = [
  ["today",  "النهاردة"],
  ["7",      "آخر ٧ أيام"],
  ["30",     "آخر ٣٠ يوم"],
  ["month",  "الشهر ده"],
  ["prev",   "الشهر اللي فات"],
  ["custom", "فترة مخصصة"],
  ["all",    "الكل"],
];

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── حدود الفترة ──
export function rangeBounds(mode, custom = {}, now = new Date()) {
  const today = iso(now);
  if (mode === "all") return { from: null, to: null };
  if (mode === "today") return { from: today, to: today };
  if (mode === "7" || mode === "30") {
    const d = new Date(now);
    d.setDate(d.getDate() - (Number(mode) - 1));
    return { from: iso(d), to: today };
  }
  if (mode === "month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(f), to: today };
  }
  if (mode === "prev") {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const t = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(f), to: iso(t) };
  }
  if (mode === "custom") {
    return { from: custom.from || null, to: custom.to || null };
  }
  return { from: null, to: null };
}

// ── هل التاريخ داخل الفترة؟ ──
export function inRange(dateValue, mode, custom, now = new Date()) {
  if (mode === "all" || !mode) return true;
  const d = dateValue ? String(dateValue).slice(0, 10) : null;
  if (!d) return false;
  const { from, to } = rangeBounds(mode, custom, now);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ── التاريخ والوقت الكاملين + النسبي لأقل من ٢٤ ساعة ──
export function fullStamp(value, now = new Date()) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const full = d.toLocaleString("ar-EG", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const diffH = (now - d) / 3600000;
  if (diffH < 0 || diffH >= 24) return full;

  const mins = Math.floor((now - d) / 60000);
  let rel;
  if (mins < 1) rel = "دلوقتي";
  else if (mins < 60) rel = `من ${mins} دقيقة`;
  else {
    const h = Math.floor(mins / 60);
    rel = h === 1 ? "من ساعة" : h === 2 ? "من ساعتين" : `من ${h} ساعات`;
  }
  return `${full} · ${rel}`;
}
