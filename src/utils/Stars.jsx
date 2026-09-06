// ═══════════════════════════════════════════════════
//  نجوم التقييم — صفرا مليانة بعدد التقييم، والباقي رمادي فاضي
//  بتتستخدم في كل مكان بيظهر فيه تقييم الإدارة
// ═══════════════════════════════════════════════════

export default function Stars({ value, size = 16, showNumber = false, max = 5 }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 1, direction: "ltr" }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ fontSize: size, lineHeight: 1, color: i < v ? "#F59E0B" : "#D1D5DB" }}>
          {i < v ? "★" : "☆"}
        </span>
      ))}
      {showNumber && (
        <span style={{ fontSize: size - 4, color: "#64748B", marginInlineStart: 5, fontWeight: 700 }}>
          {v}/{max}
        </span>
      )}
    </span>
  );
}
