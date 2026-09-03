import { useState, useEffect } from "react";
import { sb } from "../supabase.js";
import { WEEKDAYS, loadWorkConfig, saveWorkingDays, countWorkingDays, monthBounds } from "../workdays.js";

export default function Settings({ user }) {
  const [cfg, setCfg] = useState({ workingDays: [], holidays: [] });
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const [hForm, setHForm] = useState({ date: "", name: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const c = await loadWorkConfig();
    setCfg(c);
    setDays(c.workingDays);
    setLoading(false);
  }

  function toggleDay(v) {
    setDays(d => d.includes(v) ? d.filter(x => x !== v) : [...d, v].sort((a, b) => a - b));
  }

  async function saveDays() {
    if (days.length === 0) { alert("لازم تختاري يوم عمل واحد على الأقل"); return; }
    setSaving(true);
    await saveWorkingDays(days);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
    await load();
  }

  async function addHoliday() {
    if (!hForm.date) { alert("اختاري التاريخ"); return; }
    if (!hForm.name.trim()) { alert("اكتبي اسم العطلة"); return; }
    if (cfg.holidays.some(h => String(h.date).slice(0, 10) === hForm.date)) {
      alert("التاريخ ده مسجل كعطلة بالفعل");
      return;
    }
    await sb("holidays", "POST", { date: hForm.date, name: hForm.name.trim(), created_by: user.name });
    setHForm({ date: "", name: "" });
    await load();
  }

  async function deleteHoliday() {
    if (!confirmDelete) return;
    await sb(`holidays?id=eq.${confirmDelete.id}`, "DELETE");
    setConfirmDelete(null);
    await load();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#94A3B8" }}>
          🔒 الإعدادات متاحة للمدير فقط
        </div>
      </div>
    );
  }

  const dirty = JSON.stringify(days) !== JSON.stringify(cfg.workingDays);
  const mb = monthBounds(new Date().toISOString().slice(0, 10));
  const thisMonthWorkDays = countWorkingDays(mb.start, mb.end, { workingDays: days, holidays: cfg.holidays });

  const upcoming = cfg.holidays.filter(h => String(h.date).slice(0, 10) >= new Date().toISOString().slice(0, 10));
  const past = cfg.holidays.filter(h => String(h.date).slice(0, 10) < new Date().toISOString().slice(0, 10)).reverse();

  const HolidayRow = ({ h, dim }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: dim ? "#F8FAFC" : "#FFFBEB", border: `1px solid ${dim ? "#E2E8F0" : "#FDE68A"}`, borderRadius: 10, padding: "10px 14px" }}>
      <span style={{ fontSize: 16 }}>🎉</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: dim ? "#94A3B8" : "#0F172A" }}>{h.name}</div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          {new Date(String(h.date).slice(0, 10) + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>
      <button onClick={() => setConfirmDelete(h)} style={{ background: "none", color: "#DC2626", fontSize: 15, padding: "0 6px" }}>🗑</button>
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 16 }}>⚙️ الإعدادات</h2>

      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.7 }}>
        ℹ️ الإعدادات دي بيعتمد عليها حساب الحضور والغياب — واللي جاي بعدها من أنظمة الإجازات وساعات العمل.
      </div>

      {/* ── أيام العمل الأسبوعية ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>📆 أيام العمل الأسبوعية</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
          الأيام المش متحددة هنا مش هتتحسب غياب على حد — هتظهر كإجازة أسبوعية.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {WEEKDAYS.map(d => {
            const on = days.includes(d.v);
            return (
              <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                style={{
                  padding: "10px 16px", borderRadius: 12,
                  border: `2px solid ${on ? "#2563EB" : "#E2E8F0"}`,
                  background: on ? "#EFF6FF" : "#F8FAFC",
                  color: on ? "#2563EB" : "#94A3B8",
                  fontSize: 13, fontWeight: on ? 700 : 500,
                }}>
                {on ? "✓ " : ""}{d.l}
              </button>
            );
          })}
        </div>

        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#64748B", marginBottom: 14 }}>
          📊 أيام العمل في الشهر الحالي بعد خصم العطلات: <b style={{ color: "#0F172A", fontSize: 14 }}>{thisMonthWorkDays}</b> يوم
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={saveDays} disabled={saving || !dirty}
            style={{ background: (saving || !dirty) ? "#CBD5E1" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
            {saving ? "جاري الحفظ..." : "حفظ أيام العمل ✓"}
          </button>
          {dirty && !saving && <span style={{ fontSize: 12, color: "#D97706" }}>⚠️ فيه تغييرات لسه ما اتحفظتش</span>}
          {savedMsg && <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>✅ تم الحفظ</span>}
        </div>
      </div>

      {/* ── العطلات الرسمية ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🎉 العطلات الرسمية</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>
          الأيام دي مش هتتحسب غياب، ومش هتتخصم من رصيد إجازات حد.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "1fr 2fr auto", gap: 8, marginBottom: 18 }}>
          <div>
            <div style={label}>التاريخ</div>
            <input type="date" value={hForm.date} onChange={e => setHForm(f => ({ ...f, date: e.target.value }))} style={inp} />
          </div>
          <div>
            <div style={label}>اسم العطلة</div>
            <input value={hForm.name} onChange={e => setHForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: عيد الفطر" style={inp} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={addHoliday} style={{ background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 14, fontWeight: 700, width: "100%" }}>+ إضافة</button>
          </div>
        </div>

        {cfg.holidays.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "20px 0" }}>📭 مفيش عطلات مسجلة</div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>القادمة ({upcoming.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {upcoming.map(h => <HolidayRow key={h.id} h={h} />)}
                </div>
              </>
            )}
            {past.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>السابقة ({past.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {past.map(h => <HolidayRow key={h.id} h={h} dim />)}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ تأكيد الحذف ═══ */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>حذف العطلة؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
              «{confirmDelete.name}» هتتشال من العطلات، واليوم ده هيرجع يتحسب يوم عمل عادي.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={deleteHoliday} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>احذفي</button>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
