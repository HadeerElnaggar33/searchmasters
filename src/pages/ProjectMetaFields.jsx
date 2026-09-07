import { IMPORTANCE, KINDS } from "../projects.js";

// ═══════════════════════════════════════════════════
//  حقول الأهمية والنوع والحجم المتوقع
//  بتتستخدم في نافذة الإضافة والتعديل بنفس الشكل
// ═══════════════════════════════════════════════════

export default function ProjectMetaFields({ value, onChange, inp }) {
  const v = value || {};
  const set = (k, x) => onChange({ ...v, [k]: x });

  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  return (
    <>
      <div>
        <div style={label}>مستوى الأهمية</div>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.keys(IMPORTANCE).map(k => {
            const item = IMPORTANCE[k];
            const on = (v.importance || "normal") === k;
            return (
              <button key={k} type="button" onClick={() => set("importance", k)}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 10,
                  border: on ? `2px solid ${item.color}` : "2px solid #E2E8F0",
                  background: on ? item.bg : "#F8FAFC",
                  color: on ? item.color : "#64748B",
                  fontSize: 12, fontWeight: on ? 700 : 500,
                }}>
                {item.l}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={label}>نوع المشروع</div>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.keys(KINDS).map(k => {
            const item = KINDS[k];
            const on = (v.kind || "client") === k;
            return (
              <button key={k} type="button" onClick={() => set("kind", k)}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 10,
                  border: on ? "2px solid #2563EB" : "2px solid #E2E8F0",
                  background: on ? "#EFF6FF" : "#F8FAFC",
                  color: on ? "#2563EB" : "#64748B",
                  fontSize: 12, fontWeight: on ? 700 : 500,
                }}>
                {item.icon} {item.l}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 5, lineHeight: 1.6 }}>
          الداخلي مش بيدخل تقارير العملاء ولا تنبيهات نشاط المشاريع · ونقاط منفذيه عادية
        </div>
      </div>

      <div>
        <div style={label}>
          الحجم المتوقع شهرياً <span style={{ color: "#94A3B8", fontWeight: 400 }}>— سيبيه فاضي للحساب التلقائي</span>
        </div>
        <input type="number" min="0" value={v.expected_monthly == null ? "" : v.expected_monthly}
          onChange={e => set("expected_monthly", e.target.value)}
          placeholder="تلقائي من متوسط الشهور السابقة" style={inp} />
      </div>
    </>
  );
}
