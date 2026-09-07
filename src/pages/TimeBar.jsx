import { useState } from "react";
import { RANGES } from "../timeFilter.js";

// ═══════════════════════════════════════════════════
//  شريط الفلتر الزمني + زرار التصدير المعطّل
//  (تعديل ٤٣ · ٤٦)
// ═══════════════════════════════════════════════════

export default function TimeBar({ value, custom, onChange, onCustom, count, showExport = true, exportEnabled = false }) {
  const [openCustom, setOpenCustom] = useState(value === "custom");

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "6px 10px", borderRadius: 10, fontSize: 12, outline: "none" };

  function pick(v) {
    onChange(v);
    setOpenCustom(v === "custom");
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {RANGES.map(([v, l]) => {
          const on = (value || "all") === v;
          return (
            <button key={v} onClick={() => pick(v)}
              style={{
                padding: "6px 12px", borderRadius: 20,
                border: `2px solid ${on ? "#2563EB" : "#E2E8F0"}`,
                background: on ? "#EFF6FF" : "#FFFFFF",
                color: on ? "#2563EB" : "#64748B",
                fontSize: 12, fontWeight: on ? 700 : 500,
              }}>
              {l}
            </button>
          );
        })}

        <div style={{ flex: 1 }}></div>

        {count != null && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>{count} عنصر</span>
        )}

        {showExport && (
          <button
            onClick={() => { if (!exportEnabled) alert("التصدير لسه مش متاح — الميزة في الطريق قريب"); }}
            disabled={!exportEnabled}
            title={exportEnabled ? "تصدير" : "لسه مش متاح"}
            style={{
              background: exportEnabled ? "#ECFDF5" : "#F8FAFC",
              border: `1px solid ${exportEnabled ? "#A7F3D0" : "#E2E8F0"}`,
              color: exportEnabled ? "#059669" : "#CBD5E1",
              padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: exportEnabled ? "pointer" : "not-allowed",
            }}>
            📤 تصدير
          </button>
        )}
      </div>

      {openCustom && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748B" }}>من</span>
          <input type="date" value={(custom && custom.from) || ""} onChange={e => onCustom({ ...(custom || {}), from: e.target.value })} style={inp} />
          <span style={{ fontSize: 12, color: "#64748B" }}>إلى</span>
          <input type="date" value={(custom && custom.to) || ""} onChange={e => onCustom({ ...(custom || {}), to: e.target.value })} style={inp} />
        </div>
      )}
    </div>
  );
}
