// ═══════════════════════════════════════════════════
//  حسابات المشاريع: الأهمية · الحجم المتوقع · التنبيهات
// ═══════════════════════════════════════════════════

export const IMPORTANCE = {
  high:   { l: "عالية",  color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", rank: 0 },
  medium: { l: "متوسطة", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", rank: 1 },
  normal: { l: "عادية",  color: "#64748B", bg: "#F1F5F9", border: "#E2E8F0", rank: 2 },
};

export const KINDS = {
  client:   { l: "عميل",  icon: "🏢" },
  internal: { l: "داخلي", icon: "🏠" },
};

function dayOf(v) { return v ? String(v).slice(0, 10) : null; }

function monthsBetween(fromIso, now) {
  if (!fromIso) return 0;
  const d = new Date(fromIso + "T00:00:00");
  if (isNaN(d)) return 0;
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

// ── الحجم المتوقع شهرياً: متوسط الشهور السابقة (بدون الشهر الحالي) ──
export function expectedMonthly(project, tasks, now = new Date()) {
  if (project.expected_monthly != null && project.expected_monthly !== "") {
    return { value: Number(project.expected_monthly), manual: true };
  }
  const mine = (tasks || []).filter(t => String(t.project_id) === String(project.id));
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const byMonth = {};
  for (const t of mine) {
    const d = dayOf(t.created_at) || dayOf(t.due_date);
    if (!d) continue;
    const k = d.slice(0, 7);
    if (k === curKey) continue;         // الشهر الحالي مش داخل المتوسط
    byMonth[k] = (byMonth[k] || 0) + 1;
  }
  const months = Object.keys(byMonth);
  if (months.length === 0) return { value: 0, manual: false };
  const sum = months.reduce((a, k) => a + byMonth[k], 0);
  return { value: Math.round(sum / months.length), manual: false };
}

// ── مشروع جديد؟ ──
export function isNewProject(project, tasks, newMonths = 2, now = new Date()) {
  const mine = (tasks || []).filter(t => String(t.project_id) === String(project.id));
  const dates = mine.map(t => dayOf(t.created_at) || dayOf(t.due_date)).filter(Boolean).sort();
  const first = project.first_task_date ? dayOf(project.first_task_date) : dates[0];
  if (!first) return true;
  return monthsBetween(first, now) < Number(newMonths);
}

// ── تنبيهات المتابعة التلقائية ──
export function projectAlerts(project, tasks, cfg = {}, now = new Date()) {
  const out = [];
  if (project.kind === "internal") return out;          // الداخلي مستثنى
  if (project.is_active === false) return out;

  const idleDays = Number(cfg.project_idle_days) || 7;
  const newMonths = Number(cfg.project_new_months) || 2;

  if (isNewProject(project, tasks, newMonths, now)) {
    out.push({ type: "new", label: "مشروع جديد", color: "#2563EB", bg: "#EFF6FF" });
    return out;                                          // الجديد مالوش تنبيهات تأخير
  }

  const mine = (tasks || []).filter(t => String(t.project_id) === String(project.id));

  // واقف تماماً
  const lastDate = mine
    .map(t => dayOf(t.created_at) || dayOf(t.due_date))
    .filter(Boolean)
    .sort()
    .pop();
  if (lastDate) {
    const diff = Math.floor((now - new Date(lastDate + "T00:00:00")) / 86400000);
    if (diff >= idleDays) {
      out.push({ type: "idle", label: `واقف من ${diff} يوم`, color: "#DC2626", bg: "#FEF2F2" });
    }
  } else {
    out.push({ type: "idle", label: "مفيش أي تاسك", color: "#DC2626", bg: "#FEF2F2" });
  }

  // متأخر عن المعدل — بعد نص الشهر
  const day = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (day >= Math.floor(lastDay / 2)) {
    const exp = expectedMonthly(project, tasks, now).value;
    if (exp > 0) {
      const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const done = mine.filter(t => {
        const d = dayOf(t.created_at) || dayOf(t.due_date);
        return d && d.slice(0, 7) === curKey;
      }).length;
      if (done < exp / 2) {
        out.push({ type: "behind", label: `${done} من ${exp} متوقعة`, color: "#D97706", bg: "#FFFBEB" });
      }
    }
  }

  return out;
}

// ── الترتيب ──
export function sortProjects(list, mode, tasks) {
  const arr = [...(list || [])];
  const openCount = p => (tasks || []).filter(t =>
    String(t.project_id) === String(p.id) && t.status !== "completed" && t.status !== "cancelled").length;

  const byPin = (a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);

  if (mode === "importance") {
    arr.sort((a, b) => byPin(a, b) ||
      (IMPORTANCE[a.importance || "normal"].rank - IMPORTANCE[b.importance || "normal"].rank) ||
      String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  } else if (mode === "active") {
    arr.sort((a, b) => byPin(a, b) || (openCount(b) - openCount(a)));
  } else if (mode === "name") {
    arr.sort((a, b) => byPin(a, b) || String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  } else {
    // يدوي
    arr.sort((a, b) => byPin(a, b) || (Number(a.sort_order || 0) - Number(b.sort_order || 0)));
  }
  return arr;
}
