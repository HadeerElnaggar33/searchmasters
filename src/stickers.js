import { sb } from "./supabase.js";

export const STICKER_CATS = ["مود", "تحفيز", "هزار", "تهنئة", "دعم ومواساة", "طلب مساعدة"];

export const PLACES = [
  ["mood",        "صفحة المود"],
  ["celebration", "الاحتفال بالإنجازات"],
  ["task_reply",  "الرد على التاسكات"],
  ["random",      "ظهور عشوائي في الصفحات"],
  ["help",        "طلب نجدة"],
];

export const SITUATIONS = [
  ["none",         "بدون شرط — يظهر في أي وقت"],
  ["achievement",  "عند إنجاز أو فوز"],
  ["late",         "عند التأخير أو تاسكات متأخرة"],
  ["task_done",    "عند تسليم تاسك"],
  ["mood_happy",   "عند مود مبسوط"],
  ["mood_tired",   "عند مود تعبان"],
  ["mood_pressed", "عند مود مضغوط"],
  ["help",         "عند طلب نجدة"],
];

export const RATES = [["rare", "نادر"], ["normal", "عادي"], ["often", "متكرر"]];
const RATE_WEIGHT = { rare: 1, normal: 3, often: 6 };

export function parsePlaces(v) {
  if (!v) return [];
  return String(v).split(",").map(x => x.trim()).filter(Boolean);
}

function inWindow(s, today) {
  const start = s.start_date ? String(s.start_date).slice(0, 10) : null;
  const end = s.end_date ? String(s.end_date).slice(0, 10) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

// ── الاستيكرات المطابقة لمكان وحالة ──
export function matching(list, place, situation, today = new Date().toISOString().slice(0, 10)) {
  return (list || []).filter(s =>
    s.is_active !== false &&
    inWindow(s, today) &&
    parsePlaces(s.places).includes(place) &&
    (!situation || !s.situation || s.situation === "none" || s.situation === situation)
  );
}

// ── اختيار واحد عشوائي بالوزن، ومن غير تكرار الأخير ──
export function pickSticker(list, place, situation, lastId) {
  const pool = matching(list, place, situation);
  if (pool.length === 0) return null;
  const avail = pool.length > 1 ? pool.filter(s => String(s.id) !== String(lastId)) : pool;
  const bag = [];
  for (const s of avail) {
    const w = RATE_WEIGHT[s.rate || "normal"] || 3;
    for (let i = 0; i < w; i++) bag.push(s);
  }
  if (bag.length === 0) return null;
  return bag[Math.floor(Math.random() * bag.length)];
}

export async function loadStickers() {
  const rows = await sb("stickers?is_active=eq.true&order=created_at.desc");
  return rows || [];
}

// ── رفع استيكر لـ Supabase Storage ──
export async function uploadSticker(file, urlBase, key) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `stickers/${Date.now()}.${ext}`;
  try {
    const res = await fetch(`${urlBase}/storage/v1/object/awards/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "x-upsert": "true" },
      body: file,
    });
    if (!res.ok) { console.error("Sticker upload:", await res.text()); return null; }
    return `${urlBase}/storage/v1/object/public/awards/${encodeURIComponent(path)}`;
  } catch (e) { console.error(e); return null; }
}
