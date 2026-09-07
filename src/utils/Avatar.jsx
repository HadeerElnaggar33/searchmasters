// ═══════════════════════════════════════════════════
//  صورة العضو — بتظهر في كل مكان
//  لو مفيش صورة بيرجع للحرف الأول في الدايرة الملونة
//  ممكن تديله العضو نفسه، أو الاسم + قائمة الفريق
// ═══════════════════════════════════════════════════

export default function Avatar({ member, name, url, color, members, size = 32, style }) {
  // لو اتبعت الاسم بس، ندوّر على العضو في القائمة عشان نجيب صورته
  const found = member || (name && members ? (members || []).find(m => m && m.name === name) : null);
  const m = found || {};
  const n = name || m.name || "?";
  const src = url || m.avatar_url || null;
  const bg = m.avatar_color || color || "#2563EB";

  const base = {
    width: size, height: size, borderRadius: "50%",
    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    ...style,
  };

  if (src) {
    return <img src={src} alt={n} style={{ ...base, objectFit: "cover", border: "1px solid #E2E8F0" }} />;
  }
  return (
    <div style={{ ...base, background: bg, color: "#fff", fontSize: Math.max(9, Math.round(size / 2.4)), fontWeight: 700 }}>
      {String(n)[0]}
    </div>
  );
}
