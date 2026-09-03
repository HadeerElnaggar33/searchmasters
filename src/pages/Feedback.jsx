import { useState, useEffect } from "react";
import { sb, addNotification, MONTHS, CURRENT_MONTH } from "../supabase.js";

const TYPES = {
  positive: { label: "إيجابية", icon: "👍", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  negative: { label: "تحتاج تحسين", icon: "⚠️", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
};

export default function Feedback({ user }) {
  const [members, setMembers] = useState([]);
  const [notes, setNotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ member_name: "", type: "positive", content: "", project_id: "", task_id: "" });
  const [filterMember, setFilterMember] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { loadAll(); }, [selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const [m, n, p, t] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      sb(`feedback_notes?month=eq.${encodeURIComponent(selectedMonth)}&order=created_at.desc`),
      sb("projects?order=name"),
      sb(`tasks?month=eq.${encodeURIComponent(selectedMonth)}&order=created_at.desc`),
    ]);
    if (m) setMembers(m);
    if (n) setNotes(n);
    if (p) setProjects(p);
    if (t) setTasks(t);
    setLoading(false);
  }

  async function addNote() {
    if (!form.member_name) { alert("اختاري العضو"); return; }
    if (!form.content.trim()) { alert("اكتبي الملاحظة"); return; }
    setSaving(true);

    const proj = projects.find(p => String(p.id) === String(form.project_id));
    const tsk = tasks.find(t => String(t.id) === String(form.task_id));

    await sb("feedback_notes", "POST", {
      month: selectedMonth,
      member_name: form.member_name,
      type: form.type,
      content: form.content.trim(),
      project_id: form.project_id ? String(form.project_id) : null,
      project_name: proj?.name || null,
      task_id: form.task_id ? String(form.task_id) : null,
      task_title: tsk?.title || null,
      created_by: user.name,
    });

    const t = TYPES[form.type];
    await addNotification(form.member_name, `${t.icon} ملاحظة جديدة عليك: ${form.content.trim().slice(0, 60)}`, "info");

    setSaving(false);
    setShowAdd(false);
    setForm({ member_name: "", type: "positive", content: "", project_id: "", task_id: "" });
    await loadAll();
  }

  async function acknowledge(note) {
    await sb(`feedback_notes?id=eq.${note.id}`, "PATCH", { acknowledged: true, acknowledged_at: new Date().toISOString() });
    await loadAll();
  }

  async function deleteNote() {
    if (!confirmDelete) return;
    await sb(`feedback_notes?id=eq.${confirmDelete.id}`, "DELETE");
    setConfirmDelete(null);
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  // الموظف يشوف ملاحظاته هو بس
  const visible = notes.filter(n => {
    if (!isAdmin && n.member_name !== user.name) return false;
    if (isAdmin && filterMember !== "all" && n.member_name !== filterMember) return false;
    if (filterType !== "all" && n.type !== filterType) return false;
    return true;
  });

  const countFor = (name, type) => notes.filter(n => n.member_name === name && n.type === type).length;
  const taskOptions = form.member_name ? tasks.filter(t => t.assigned_to === form.member_name) : tasks;

  const NoteCard = ({ n }) => {
    const t = TYPES[n.type] || TYPES.positive;
    const mine = n.member_name === user.name;
    return (
      <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}>{t.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{n.member_name}</span>
          <span style={{ fontSize: 11, color: t.color, fontWeight: 600 }}>{t.label}</span>
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            {new Date(n.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
          </span>
          {isAdmin && (
            <button onClick={() => setConfirmDelete(n)} style={{ background: "none", color: "#DC2626", fontSize: 14, padding: "0 4px" }}>🗑</button>
          )}
        </div>

        <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.7, marginBottom: 8 }}>{n.content}</div>

        {(n.project_name || n.task_title) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {n.project_name && <span style={{ fontSize: 11, background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#64748B", padding: "2px 10px", borderRadius: 6 }}>📁 {n.project_name}</span>}
            {n.task_title && <span style={{ fontSize: 11, background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#64748B", padding: "2px 10px", borderRadius: 6 }}>📋 {n.task_title}</span>}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>بواسطة {n.created_by}</span>
          <div style={{ flex: 1 }}></div>
          {n.acknowledged
            ? <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ تم الاطلاع</span>
            : mine
              ? <button onClick={() => acknowledge(n)} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#2563EB", padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>تم الاطلاع ✓</button>
              : isAdmin ? <span style={{ fontSize: 11, color: "#94A3B8" }}>لم يطّلع بعد</span> : null
          }
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>💬 الملاحظات</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
            {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
          </select>
          {isAdmin && (
            <button onClick={() => { setForm({ member_name: "", type: "positive", content: "", project_id: "", task_id: "" }); setShowAdd(true); }}
              style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              + ملاحظة
            </button>
          )}
        </div>
      </div>

      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.7 }}>
        🔒 الملاحظات <b>خاصة</b> — كل عضو يشوف ملاحظاته هو بس، ومحدش في الفريق يشوف ملاحظات حد تاني. المدير بيشوف الكل.
      </div>

      {/* ملخص الفريق — للمدير */}
      {isAdmin && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>📊 ملخص {selectedMonth}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            {members.map(m => {
              const pos = countFor(m.name, "positive");
              const neg = countFor(m.name, "negative");
              return (
                <button key={m.id} onClick={() => setFilterMember(filterMember === m.name ? "all" : m.name)}
                  style={{ textAlign: "right", background: filterMember === m.name ? "#EFF6FF" : "#F8FAFC", border: `1.5px solid ${filterMember === m.name ? "#2563EB" : "#E2E8F0"}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>👍 {pos} · ⚠️ {neg}</div>
                  </div>
                </button>
              );
            })}
          </div>
          {filterMember !== "all" && (
            <button onClick={() => setFilterMember("all")} style={{ marginTop: 10, background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
              عرض الكل ✕
            </button>
          )}
        </div>
      )}

      {/* فلتر النوع */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
        {[["all", "الكل"], ["positive", "👍 إيجابية"], ["negative", "⚠️ تحتاج تحسين"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilterType(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: filterType === v ? "#FFFFFF" : "transparent", color: filterType === v ? "#0F172A" : "#64748B", fontSize: 12, fontWeight: filterType === v ? 700 : 500, boxShadow: filterType === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>
            {l}
          </button>
        ))}
      </div>

      {/* القائمة */}
      {visible.length === 0
        ? <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 40, fontSize: 13 }}>
            {isAdmin ? "📭 مفيش ملاحظات في الشهر ده" : "📭 مفيش ملاحظات عليك في الشهر ده"}
          </div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map(n => <NoteCard key={n.id} n={n} />)}
          </div>
      }

      {/* ═══ MODAL: ملاحظة جديدة ═══ */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>💬 ملاحظة جديدة</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18 }}>{selectedMonth}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={label}>العضو *</div>
                <select value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value, task_id: "" }))} style={inp}>
                  <option value="">— اختاري —</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              <div>
                <div style={label}>النوع *</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.entries(TYPES).map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setForm(f => ({ ...f, type: k }))}
                      style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${form.type === k ? t.color : "#E2E8F0"}`, background: form.type === k ? t.bg : "#F8FAFC", color: form.type === k ? t.color : "#64748B", fontSize: 13, fontWeight: form.type === k ? 700 : 500 }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={label}>الملاحظة *</div>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4}
                  placeholder="اكتبي بوضوح — عن الشغل نفسه، ومحدد قدر الإمكان..." style={{ ...inp, resize: "vertical" }} />
              </div>

              <div>
                <div style={label}>المشروع <span style={{ color: "#94A3B8", fontWeight: 400 }}>— اختياري</span></div>
                <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                  <option value="">— بدون —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <div style={label}>التاسك <span style={{ color: "#94A3B8", fontWeight: 400 }}>— اختياري</span></div>
                <select value={form.task_id} onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))} style={inp}>
                  <option value="">— بدون —</option>
                  {taskOptions.slice(0, 100).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>

              <button onClick={addNote} disabled={saving} style={{ background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                {saving ? "جاري الحفظ..." : "حفظ الملاحظة ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: تأكيد الحذف ═══ */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>حذف الملاحظة؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>الملاحظة دي هتتمسح نهائياً ومش هتقدري ترجعيها.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={deleteNote} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>احذفي</button>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
