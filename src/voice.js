// ═══════════════════════════════════════════════════
//  تحويل الكلام المنطوق إلى بيانات تاسك
//  الصيغة المتوقعة (والأجزاء كلها اختيارية):
//  [العنوان]، في [المشروع]، لـ[المسؤول]، [النوع]، أولوية [كذا]، تسليم [كذا]
// ═══════════════════════════════════════════════════

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

// ── تطبيع النص العربي (بيحافظ على الأرقام والشرط والسلاش) ──
export function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s/\-.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── تقسيم الكلام لمقاطع ──
function segments(text) {
  return String(text || "")
    .split(/[،,؛;\n]+|\s+و\s+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ═══ المشروع ═══
export function matchProject(text, projects) {
  const t = normalize(text);
  let best = null, len = 0;
  for (const p of projects || []) {
    for (const raw of [p.name, p.client_name]) {
      if (!raw) continue;
      const n = normalize(raw);
      if (n.length >= 2 && t.includes(n) && n.length > len) { best = p; len = n.length; }
    }
  }
  return best;
}

// ═══ المسؤول — من موقعه في الصيغة، مش أول اسم في الكلام ═══
export function matchMember(text, members, project) {
  const segs = segments(text);
  const names = (members || []).map(m => ({ m, n: normalize(m.name) })).filter(x => x.n.length >= 2);
  if (names.length === 0) return { member: null, how: null };

  // (١) مقطع مخصص للمسؤول: «لمريم» أو «لـ مريم» أو «المسؤول مريم»
  for (const seg of segs) {
    const s = normalize(seg);
    for (const { m, n } of names) {
      if (s === `ل${n}` || s === `ل ${n}` || s === n ||
          s === `المسؤول ${n}` || s === `مسؤول ${n}` || s === `للمسؤول ${n}`) {
        return { member: m, how: "segment" };
      }
    }
  }

  // (٢) اسم مسبوق بـ«ل» وجاي بعد اسم المشروع
  const t = normalize(text);
  const projAt = project ? Math.max(t.indexOf(normalize(project.name)), t.indexOf(normalize(project.client_name || ""))) : -1;
  let afterProj = null, afterIdx = -1;
  for (const { m, n } of names) {
    const i = t.indexOf(`ل${n}`);
    if (i >= 0 && i > projAt && i > afterIdx) { afterProj = m; afterIdx = i; }
  }
  if (afterProj) return { member: afterProj, how: "after-project" };

  // (٣) آخر اسم مسبوق بـ«ل» في الجملة
  let last = null, lastIdx = -1;
  for (const { m, n } of names) {
    const i = t.lastIndexOf(`ل${n}`);
    if (i > lastIdx) { last = m; lastIdx = i; }
  }
  if (last) return { member: last, how: "last-lam" };

  // (٤) أي اسم — مع تنبيه
  for (const { m, n } of names) if (t.includes(n)) return { member: m, how: "loose" };
  return { member: null, how: null };
}

// ═══ الأولوية ═══
const PRIORITY_WORDS = [
  { v: "urgent", words: ["عاجل", "عاجله", "مستعجل", "مستعجله", "urgent", "حالا"] },
  { v: "high",   words: ["اولويه عاليه", "عاليه", "مهم", "مهمه", "high", "ضروري"] },
  { v: "low",    words: ["اولويه منخفضه", "منخفضه", "بسيطه", "low", "مش مستعجل", "على مهلك"] },
  { v: "medium", words: ["اولويه متوسطه", "متوسطه", "عاديه", "medium"] },
];

export function matchPriority(text) {
  const t = normalize(text);
  for (const p of PRIORITY_WORDS) for (const w of p.words) if (t.includes(normalize(w))) return { v: p.v, word: w };
  return null;
}

// ═══ التاريخ ═══
const DAY_WORDS = {
  "الاحد": 0, "الحد": 0,
  "الاتنين": 1, "الاثنين": 1, "الاتنن": 1,
  "التلات": 2, "التلاته": 2, "الثلاثاء": 2, "الثلاث": 2,
  "الاربع": 3, "الاربعاء": 3, "الاربعا": 3,
  "الخميس": 4,
  "الجمعه": 5,
  "السبت": 6,
};

const DATE_HINTS = ["تسليم", "الميعاد", "موعد", "deadline", "يوم", "بتاريخ"];

export function matchDate(text, today = new Date()) {
  const t = normalize(text);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const has = (...ws) => ws.some(w => t.includes(w));
  const used = [];

  // (١) تواريخ رقمية كاملة
  let m = t.match(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);   // 2026-09-06
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d)) return { date: iso(d), used: [m[0]] };
  }
  m = t.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})/);        // 06/09/2026 (يوم/شهر/سنة)
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d)) return { date: iso(d), used: [m[0]] };
  }
  m = t.match(/(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\s*[-/]\s*\d)/);           // 06/09 من غير سنة
  if (m) {
    const day = Number(m[1]), mon = Number(m[2]);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let d = new Date(base.getFullYear(), mon - 1, day);
      if (d < base) d = new Date(base.getFullYear() + 1, mon - 1, day);
      return { date: iso(d), used: [m[0]] };
    }
  }

  // (٢) كلمات نسبية
  if (has("النهارده", "النهار ده", "انهارده", "اليوم")) return { date: iso(base), used: ["النهارده", "اليوم"] };
  if (has("بعد بكره", "بعد بكرا", "بعد غد")) { const d = new Date(base); d.setDate(d.getDate() + 2); return { date: iso(d), used: ["بعد بكره"] }; }
  if (has("بكره", "بكرا", "غدا")) { const d = new Date(base); d.setDate(d.getDate() + 1); return { date: iso(d), used: ["بكره", "بكرا", "غدا"] }; }
  if (has("اخر الاسبوع", "نهايه الاسبوع")) {
    const d = new Date(base);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 4);
    return { date: iso(d), used: ["اخر الاسبوع", "نهايه الاسبوع"] };
  }
  const after = t.match(/بعد (\d+) ايام?/);
  if (after) { const d = new Date(base); d.setDate(d.getDate() + Number(after[1])); return { date: iso(d), used: [after[0]] }; }

  // (٣) أسماء الأيام — الأطول الأول عشان «الاربعاء» تسبق «الاربع»
  const keys = Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length);
  for (const w of keys) {
    if (t.includes(w)) {
      const d = new Date(base);
      let guard = 0;
      do { d.setDate(d.getDate() + 1); guard++; } while (d.getDay() !== DAY_WORDS[w] && guard < 8);
      return { date: iso(d), used: [w] };
    }
  }

  // (٤) فيه كلمة تسليم بس مفيش تاريخ مفهوم
  if (DATE_HINTS.some(h => t.includes(normalize(h)))) {
    return { date: null, used: [], warn: "قلتي كلمة عن الميعاد بس مفهمتش التاريخ — حدديه بنفسك" };
  }
  return { date: null, used: [] };
}

// ═══ النوع ═══
export function matchType(text, types) {
  const t = normalize(text);
  let best = null, len = 0;
  for (const ty of types || []) {
    const n = normalize(ty);
    if (n.length >= 2 && t.includes(n) && n.length > len) { best = ty; len = n.length; }
  }
  return best;
}

// ═══ تنضيف العنوان ═══
const MARKERS = ["في", "لـ", "نوع", "النوع", "اولويه", "الاولويه", "تسليم", "الميعاد", "موعد", "المسؤول", "مسؤول", "deadline", "يوم", "بتاريخ", "مشروع", "المشروع"];
const FILLERS = ["ضيفي", "ضيف", "اضيفي", "اضيف", "اعملي", "اعمل", "عايزه", "عايز", "محتاجه", "محتاج", "تاسك", "مهمه", "من فضلك", "لو سمحت", "يا ريت", "جديده", "جديد"];

function stripWords(text, words) {
  let t = " " + text + " ";
  for (const w of words) {
    if (!w) continue;
    const n = normalize(w);
    if (!n) continue;
    t = t.replace(new RegExp(`\\s${n.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s`, "g"), " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

export function buildTitle(raw, used, memberName) {
  const segs = segments(raw);
  // العنوان أول مقطع — لو مش قيمة من القيم اللي اتفهمت
  let candidate = segs.length > 1 ? segs[0] : raw;
  let t = normalize(candidate);

  const kill = [...used];
  if (memberName) { kill.push(memberName); kill.push("ل" + normalize(memberName)); }
  t = stripWords(t, kill);
  // شيل «ل+اسم» الملزوقة
  if (memberName) t = t.replace(new RegExp(`\\bل${normalize(memberName)}\\b`, "g"), " ");
  t = stripWords(t, MARKERS);
  t = stripWords(t, FILLERS);
  t = t.replace(/\s+/g, " ").trim();

  if (t.length < 2 && segs.length > 1) {
    // لو أول مقطع طلع فاضي، جرّب الجملة كلها
    let all = stripWords(normalize(raw), kill);
    all = stripWords(all, MARKERS);
    all = stripWords(all, FILLERS);
    t = all.trim();
  }
  return t;
}

// ═══════════════════════════════════════════════════
export function parseTranscript(text, { projects = [], members = [], taskTypes = [] } = {}, today = new Date()) {
  const raw = String(text || "").trim();
  const warnings = [];

  const project = matchProject(raw, projects);
  const { member, how } = matchMember(raw, members, project);
  const type = matchType(raw, taskTypes);
  const prio = matchPriority(raw);
  const dateRes = matchDate(raw, today);

  if (how === "loose" && member) {
    warnings.push(`لقيت اسم «${member.name}» في الكلام بس مش في مكان المسؤول — راجعيه`);
  }
  if (dateRes.warn) warnings.push(dateRes.warn);

  const used = [
    project && project.name, project && project.client_name,
    type,
    ...(prio ? [prio.word] : []),
    ...(dateRes.used || []),
  ].filter(Boolean);

  const title = buildTitle(raw, used, member && member.name);

  return {
    raw,
    project_id: project ? project.id : "",
    project_name: project ? project.name : null,
    assigned_to: member ? member.name : null,
    task_type: type || null,
    priority: prio ? prio.v : null,
    due_date: dateRes.date || "",
    title: title || raw,
    warnings,
    matched: {
      project: !!project,
      member: !!member,
      type: !!type,
      priority: !!prio,
      date: !!dateRes.date,
    },
  };
}
