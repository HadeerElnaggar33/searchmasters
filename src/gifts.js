import { sb } from "./supabase.js";

// ═══════════════════════════════════════════════════
//  منظومة الهدايا
// ═══════════════════════════════════════════════════

export const GIFT_TYPES = {
  draw:   { l: "سحب عشوائي", icon: "🎲" },
  eom:    { l: "موظف الشهر",  icon: "🏆" },
  manual: { l: "تقدير خاص",   icon: "🎖" },
};

export const DELIVERY_STATUS = {
  preparing: { l: "قيد التجهيز", icon: "📦", color: "#D97706", bg: "#FFFBEB" },
  shipped:   { l: "تم الشحن",    icon: "🚚", color: "#2563EB", bg: "#EFF6FF" },
  delivered: { l: "تم التسليم",  icon: "✅", color: "#059669", bg: "#ECFDF5" },
};

export const RECEIVE_MODES = [
  ["weekend",    "🚚 توصلني في إجازة الأسبوع"],
  ["accumulate", "📦 أجمّع الرصيد وآخده آخر الشهر"],
];

// ردود الفعل الموسّعة (تعديل ٥١)
export const REACTIONS = [
  { group: "عن الهدية", items: [
    ["nice",     "😍 الهدية دي حلوة"],
    ["want",     "🙋 نفسي في الهدية دي"],
    ["not_me",   "🤔 كان نفسي بس مش مناسبة لي"],
    ["useful",   "👍 مفيدة فعلاً"],
  ]},
  { group: "عن الاختيار", items: [
    ["thoughtful", "💙 اختيار مدروس"],
    ["surprise",   "🎉 مفاجأة حلوة"],
  ]},
];

export const ALL_REACTIONS = REACTIONS.flatMap(g => g.items);
export const reactionLabel = k => (ALL_REACTIONS.find(r => r[0] === k) || [k, k])[1];

function dayOf(v) { return v ? String(v).slice(0, 10) : null; }

// ── ملخص هدايا العضو (تعديل ٥٩) ──
export function myGiftSummary(draws, deliveries, name, now = new Date()) {
  const wins = (draws || []).filter(d => d.status === "won" && d.winner_name === name);
  const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const weekStart = (() => { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); return dayOf(d.toISOString()); })();

  const mine = (deliveries || []).filter(x => x.member_name === name);
  const waiting = mine.filter(x => x.status !== "delivered");

  return {
    total: wins.length,
    thisMonth: wins.filter(w => dayOf(w.won_at) && dayOf(w.won_at).slice(0, 7) === mm).length,
    thisWeek: wins.filter(w => dayOf(w.won_at) && dayOf(w.won_at) >= weekStart).length,
    waiting: waiting.length,
    lastDelivery: mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null,
  };
}

// ── التوافق: مين تناسبه الهدية دي (تعديل ٤٩) ──
export function matchMembers(gift, profiles) {
  const name = String(gift.name || "").toLowerCase();
  const desc = String(gift.description || "").toLowerCase();
  const hay = name + " " + desc;
  const words = hay.split(/\s+/).filter(w => w.length >= 3);

  const out = [];
  for (const p of profiles || []) {
    const reasons = [];
    const wishes = String(p.gift_wishes || "").toLowerCase();
    const likes = String(p.likes || "").toLowerCase();
    const avoid = String(p.gift_avoid || "").toLowerCase();

    if (wishes && words.some(w => wishes.includes(w))) {
      reasons.push("كاتب في أمنياته حاجة قريبة من دي");
    }
    if (likes && words.some(w => likes.includes(w))) {
      reasons.push(`بيحب ${String(p.likes).split(/[,،\n]/)[0].trim()}`);
    }

    const conflict = avoid && words.some(w => avoid.includes(w));
    if (reasons.length > 0 || conflict) {
      out.push({ member: p.member_name, reasons, conflict });
    }
  }
  return out;
}

// ── تجميع ترشيحات الفريق ──
export function groupSuggestions(rows) {
  const map = {};
  for (const r of rows || []) {
    const k = String(r.gift_name || "").trim();
    if (!k) continue;
    if (!map[k]) map[k] = { name: k, count: 0, by: [], notes: [] };
    map[k].count++;
    map[k].by.push(r.suggested_by);
    if (r.note) map[k].notes.push(`${r.suggested_by}: ${r.note}`);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

export async function toggleReaction(giftId, name, reaction, has) {
  if (has) {
    await sb(`gift_reactions?gift_id=eq.${encodeURIComponent(String(giftId))}&member_name=eq.${encodeURIComponent(name)}&reaction=eq.${reaction}`, "DELETE");
  } else {
    await sb("gift_reactions", "POST", { gift_id: String(giftId), member_name: name, reaction });
  }
}
