// ═══════════════════════════════════════════════════
//  تحويل الكلام المنطوق إلى بيانات تاسك
//  بيقارن الكلام بقوائم المشاريع والفريق الموجودة فعلاً
// ═══════════════════════════════════════════════════

// هل المتصفح بيدعم التحويل الصوتي؟
export function speechSupported() {
  return typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = "ar-EG";
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

// ── تطبيع النص العربي عشان المقارنة تنجح ──
export function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "")      // التشكيل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")           // علامات الترقيم
    .replace(/\s+/g, " ")
    .trim();
}

// ── دور على أطول اسم من القائمة موجود في الكلام ──
export function matchFromList(text, list, getNames) {
  const t = normalize(text);
  let best = null;
  let bestLen = 0;
  for (const item of list) {
    for (const raw of getNames(item)) {
      if (!raw) continue;
      const n = normalize(raw);
      if (n.length < 2) continue;
      if (t.includes(n) && n.length > bestLen) {
        best = item;
        bestLen = n.length;
      }
    }
  }
  return best;
}

// ── الأولوية ──
const PRIORITY_WORDS = [
  { v: "urgent", words: ["عاجل", "عاجله", "مستعجل", "مستعجله", "urgent", "ضروري جدا", "حالا"] },
  { v: "high",   words: ["اولويه عاليه", "عاليه", "مهم", "مهمه", "high", "ضروري"] },
  { v: "low",    words: ["اولويه منخفضه", "منخفضه", "بسيطه", "low", "مش مستعجل", "على مهلك"] },
  { v: "medium", words: ["متوسطه", "عاديه", "medium"] },
];

export function matchPriority(text) {
  const t = normalize(text);
  for (const p of PRIORITY_WORDS) {
    for (const w of p.words) {
      if (t.includes(normalize(w))) return p.v;
    }
  }
  return null;
}

// ── التاريخ ──
const DAY_WORDS = { "الاحد": 0, "الاتنين": 1, "الاثنين": 1, "التلات": 2, "الثلاثاء": 2, "التلاته": 2, "الاربع": 3, "الاربعاء": 3, "الخميس": 4, "الجمعه": 5, "السبت": 6 };

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function matchDate(text, today = new Date()) {
  const t = normalize(text);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const has = (...ws) => ws.some(w => t.includes(w));

  if (has("النهارده", "النهار ده", "انهارده", "اليوم")) return iso(base);
  if (has("بعد بكره", "بعد بكرا", "بعد غد")) { const d = new Date(base); d.setDate(d.getDate() + 2); return iso(d); }
  if (has("بكره", "بكرا", "غدا")) { const d = new Date(base); d.setDate(d.getDate() + 1); return iso(d); }
  if (has("اخر الاسبوع", "نهايه الاسبوع")) {
    const d = new Date(base);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 4);   // أقرب خميس جاي
    return iso(d);
  }

  // "بعد 3 أيام"
  const after = t.match(/بعد (\d+) ايام?/);
  if (after) { const d = new Date(base); d.setDate(d.getDate() + Number(after[1])); return iso(d); }

  // أسماء الأيام → أقرب يوم جاي
  for (const [word, dow] of Object.entries(DAY_WORDS)) {
    if (t.includes(word)) {
      const d = new Date(base);
      let guard = 0;
      do { d.setDate(d.getDate() + 1); guard++; } while (d.getDay() !== dow && guard < 8);
      return iso(d);
    }
  }
  return null;
}

// ── تنضيف العنوان: شيل الكلمات اللي اتفهمت خلاص ──
const FILLER = [
  "ضيفي", "ضيف", "اضيفي", "اضيف", "اعملي", "اعمل", "عايزه", "عايز", "محتاجه", "محتاج",
  "تاسك", "مهمه", "من فضلك", "لو سمحت", "يا ريت", "علي", "على", "في", "لـ", "ل",
  "اولويه", "تسليم", "الميعاد", "موعد", "deadline",
];

export function cleanTitle(text, used) {
  let t = " " + normalize(text) + " ";
  for (const u of used) {
    if (!u) continue;
    const n = normalize(u);
    if (n.length < 2) continue;
    t = t.split(n).join(" ");
  }
  for (const f of FILLER) {
    t = t.replace(new RegExp(`\\s${normalize(f)}\\s`, "g"), " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

// ═══════════════════════════════════════════════════
//  الدالة الأساسية
// ═══════════════════════════════════════════════════
export function parseTranscript(text, { projects = [], members = [], taskTypes = [] } = {}, today = new Date()) {
  const raw = String(text || "").trim();

  const project = matchFromList(raw, projects, p => [p.name, p.client_name]);
  const member  = matchFromList(raw, members,  m => [m.name]);
  const type    = matchFromList(raw, taskTypes.map(t => ({ v: t })), o => [o.v]);
  const priority = matchPriority(raw);
  const dueDate  = matchDate(raw, today);

  const DATE_WORDS = [
    "النهارده", "النهار ده", "انهارده", "اليوم", "بعد بكره", "بعد بكرا", "بعد غد",
    "بكره", "بكرا", "غدا", "اخر الاسبوع", "نهايه الاسبوع",
    ...Object.keys(DAY_WORDS),
  ];
  const used = [
    project?.name, project?.client_name, member?.name, type?.v,
    ...(priority ? PRIORITY_WORDS.find(p => p.v === priority).words : []),
    ...(dueDate ? DATE_WORDS : []),
  ];
  const title = cleanTitle(raw, used);

  return {
    raw,
    project_id: project ? project.id : "",
    project_name: project ? project.name : null,
    assigned_to: member ? member.name : null,
    task_type: type ? type.v : null,
    priority: priority || null,
    due_date: dueDate || "",
    title: title || raw,
    matched: {
      project: !!project,
      member: !!member,
      type: !!type,
      priority: !!priority,
      date: !!dueDate,
    },
  };
}
