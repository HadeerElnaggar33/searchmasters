import { useState } from "react";

// ═══════════════════════════════════════════════════
//  غلاف تبويبات — بيلم أكتر من صفحة في صفحة واحدة
//  بيحفظ آخر تبويب لكل مستخدم
// ═══════════════════════════════════════════════════
export default function TabHub({ id, title, tabs, user }) {
  const key = `sm_hub_${id}_${user && user.name ? user.name : "x"}`;
  const first = tabs[0] && tabs[0].v;
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved && tabs.some(t => t.v === saved) ? saved : first;
    } catch (e) { return first; }
  });

  function pick(v) {
    setTab(v);
    try { localStorage.setItem(key, v); } catch (e) { /* تجاهل */ }
  }

  const active = tabs.find(t => t.v === tab) || tabs[0];

  return (
    <div>
      <div style={{ padding: "16px 16px 0", maxWidth: 900, margin: "0 auto" }}>
        {title && (
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 12 }}>{title}</h2>
        )}
        <div style={{ display: "flex", gap: 6, background: "#F1F5F9", borderRadius: 12, padding: 4, marginBottom: 4, flexWrap: "wrap" }}>
          {tabs.map(t => (
            <button key={t.v} onClick={() => pick(t.v)}
              style={{
                flex: 1, minWidth: 96, padding: "9px 8px", borderRadius: 8, border: "none",
                background: tab === t.v ? "#FFFFFF" : "transparent",
                color: tab === t.v ? "#0F172A" : "#64748B",
                fontSize: 13, fontWeight: tab === t.v ? 700 : 500,
                boxShadow: tab === t.v ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
              }}>
              {t.l}
            </button>
          ))}
        </div>
      </div>
      {active && active.render()}
    </div>
  );
}
