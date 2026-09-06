// ═══════════════════════════════════════════════════
//  اسم مقروء للرابط — بيتولد وقت العرض
//  مفيش أي تغيير في قاعدة البيانات · بيشتغل على القديم والجديد
// ═══════════════════════════════════════════════════

const SERVICES = [
  { re: /docs\.google\.com\/document/i,      label: "مستند Google",     icon: "📄" },
  { re: /docs\.google\.com\/spreadsheets/i,  label: "شيت Google",       icon: "📊" },
  { re: /docs\.google\.com\/presentation/i,  label: "عرض Google",       icon: "📽" },
  { re: /docs\.google\.com\/forms|forms\.gle/i, label: "فورم Google",   icon: "📝" },
  { re: /drive\.google\.com/i,               label: "ملف Drive",        icon: "📁" },
  { re: /search\.google\.com\/search-console/i, label: "Search Console", icon: "🔍" },
  { re: /analytics\.google\.com/i,           label: "Google Analytics", icon: "📈" },
  { re: /ads\.google\.com/i,                 label: "Google Ads",       icon: "📣" },
  { re: /trello\.com/i,                      label: "كارت Trello",      icon: "📋" },
  { re: /(github\.com|gitlab\.com)/i,        label: "مستودع كود",       icon: "💻" },
  { re: /figma\.com/i,                       label: "تصميم Figma",      icon: "🎨" },
  { re: /canva\.com/i,                       label: "تصميم Canva",      icon: "🎨" },
  { re: /notion\.so/i,                       label: "صفحة Notion",      icon: "🗒" },
  { re: /(dropbox\.com)/i,                   label: "ملف Dropbox",      icon: "📦" },
  { re: /(youtube\.com|youtu\.be)/i,         label: "فيديو YouTube",    icon: "▶️" },
  { re: /(loom\.com)/i,                      label: "فيديو Loom",       icon: "🎬" },
  { re: /ahrefs\.com/i,                      label: "Ahrefs",           icon: "🔗" },
  { re: /semrush\.com/i,                     label: "Semrush",          icon: "📊" },
  { re: /(wa\.me|whatsapp\.com)/i,           label: "محادثة واتساب",    icon: "💬" },
  { re: /(mail\.google\.com|outlook\.)/i,    label: "إيميل",            icon: "✉️" },
];

const EXT = {
  pdf: ["ملف PDF", "📕"], doc: ["ملف Word", "📘"], docx: ["ملف Word", "📘"],
  xls: ["ملف Excel", "📗"], xlsx: ["ملف Excel", "📗"], csv: ["ملف CSV", "📗"],
  ppt: ["عرض تقديمي", "📙"], pptx: ["عرض تقديمي", "📙"],
  zip: ["ملف مضغوط", "🗜"], rar: ["ملف مضغوط", "🗜"],
  png: ["صورة", "🖼"], jpg: ["صورة", "🖼"], jpeg: ["صورة", "🖼"], gif: ["صورة", "🖼"], webp: ["صورة", "🖼"], svg: ["صورة", "🖼"],
  mp4: ["فيديو", "🎬"], mov: ["فيديو", "🎬"],
};

function hostOf(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    return u.hostname.replace(/^www\./, "");
  } catch (e) { return ""; }
}

function extOf(url) {
  const clean = String(url).split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

// ── الاسم والأيقونة لرابط واحد ──
export function linkLabel(url, givenName) {
  const raw = String(url || "").trim();
  if (!raw) return { label: "رابط", icon: "🔗" };

  // لو فيه اسم متكتب أصلاً نستخدمه
  if (givenName && String(givenName).trim() && !/^https?:\/\//i.test(givenName)) {
    return { label: String(givenName).trim(), icon: iconFor(raw) };
  }

  const ext = extOf(raw);
  if (EXT[ext]) return { label: EXT[ext][0], icon: EXT[ext][1] };

  for (const s of SERVICES) if (s.re.test(raw)) return { label: s.label, icon: s.icon };

  const host = hostOf(raw);
  if (host) return { label: host, icon: "🔗" };
  return { label: "رابط", icon: "🔗" };
}

function iconFor(url) {
  const ext = extOf(url);
  if (EXT[ext]) return EXT[ext][1];
  for (const s of SERVICES) if (s.re.test(url)) return s.icon;
  return "🔗";
}

// ── أسماء قائمة كاملة مع ترقيم المتكرر ──
export function labelList(items) {
  const out = [];
  const seen = {};
  for (const it of items || []) {
    const url = typeof it === "string" ? it : (it.url || "");
    const given = typeof it === "string" ? "" : (it.name || "");
    const { label, icon } = linkLabel(url, given);
    seen[label] = (seen[label] || 0) + 1;
    out.push({
      url,
      icon,
      label: seen[label] > 1 ? `${label} ${seen[label]}` : label,
    });
  }
  return out;
}
