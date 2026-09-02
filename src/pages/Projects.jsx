import { useState, useEffect } from "react";
import { sb, RESOURCE_TYPES } from "../supabase.js";

const PROJECT_TYPES = [
  "SEO","Technical SEO","Local SEO","E-commerce SEO",
  "Content Marketing","Static Page Content","Link Building",
  "AI","ASO","Google Ads","Meta Ads","Reviews","Other",
];

function parseTypes(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return String(val).split(",").map(x => x.trim()).filter(Boolean);
}
const PROJECT_STATUSES = [{ v:"active", l:"نشط", c:"#059669" },{ v:"paused", l:"موقوف", c:"#D97706" },{ v:"completed", l:"منتهي", c:"#64748B" }];
const COLORS = ["#2563EB","#7C3AED","#059669","#DC2626","#D97706","#0891B2","#DB2777","#9333EA"];

export default function Projects({ user }) {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [resources, setResources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showAddRes, setShowAddRes] = useState(false);
  const [confirmDeleteRes, setConfirmDeleteRes] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const emptyForm = { name: "", client_name: "", website_url: "", project_type: [], status: "active", description: "", team_members: [], color: "#2563EB" };
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [resForm, setResForm] = useState({ name: "", url: "", type: "drive" });

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [p, m] = await Promise.all([sb("projects?order=created_at.desc"), sb("team_members?is_active=eq.true&order=name")]);
    if (p) setProjects(p);
    if (m) setMembers(m);
    setLoading(false);
  }

  async function openProject(proj) {
    setSelected(proj);
    const r = await sb(`project_resources?project_id=eq.${proj.id}&order=created_at`);
    if (r) setResources(r);
  }

  async function addProject() {
    if (!form.name.trim()) return;
    await sb("projects", "POST", { ...form, project_type: parseTypes(form.project_type).join(", ") || null });
    await loadAll();
    setShowAdd(false);
    setForm(emptyForm);
  }

  async function saveEdit() {
    if (!editForm.name.trim() || !showEdit) return;
    await sb(`projects?id=eq.${showEdit.id}`, "PATCH", {
      name: editForm.name, client_name: editForm.client_name,
      website_url: editForm.website_url, project_type: parseTypes(editForm.project_type).join(", ") || null,
      status: editForm.status, description: editForm.description,
      team_members: editForm.team_members, color: editForm.color,
    });
    await loadAll();
    // refresh selected if open
    if (selected?.id === showEdit.id) {
      setSelected(prev => ({ ...prev, ...editForm }));
    }
    setShowEdit(null);
  }

  async function addResource() {
    if (!resForm.name.trim() || !resForm.url.trim() || !selected) return;
    let url = resForm.url;
    if (!url.startsWith("http")) url = "https://" + url;
    await sb("project_resources", "POST", { ...resForm, url, project_id: selected.id });
    const r = await sb(`project_resources?project_id=eq.${selected.id}&order=created_at`);
    if (r) setResources(r);
    setShowAddRes(false);
    setResForm({ name: "", url: "", type: "drive" });
  }

  async function deleteResource(id) {
    await sb(`project_resources?id=eq.${id}`, "DELETE");
    setResources(prev => prev.filter(r => r.id !== id));
    setConfirmDeleteRes(null);
  }

  const TypePicker = ({ value, onChange }) => {
    const list = parseTypes(value);
    return (
      <div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>نوع المشروع</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>ممكن تختاري أكتر من نوع — اضغطي على النوع لإضافته أو إزالته</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PROJECT_TYPES.map(t => {
            const on = list.includes(t);
            return (
              <button key={t} type="button"
                onClick={() => onChange(on ? list.filter(x => x !== t) : [...list, t])}
                style={{
                  padding: "6px 12px", borderRadius: 20,
                  border: on ? "2px solid #2563EB" : "1px solid #E2E8F0",
                  background: on ? "#EFF6FF" : "#F8FAFC",
                  color: on ? "#2563EB" : "#64748B",
                  fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
                }}>
                {on ? "✓ " : "+ "}{t}
              </button>
            );
          })}
        </div>
        {list.length === 0 && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>لم يتم اختيار أي نوع بعد</div>}
      </div>
    );
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  // ── Project Detail ──
  if (selected) {
    const statusConf = PROJECT_STATUSES.find(s => s.v === selected.status) || PROJECT_STATUSES[0];
    return (
      <div style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setSelected(null)} style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>← رجوع</button>
          {isAdmin && (
            <button onClick={() => {
              setEditForm({
                name: selected.name, client_name: selected.client_name || "",
                website_url: selected.website_url || "", project_type: parseTypes(selected.project_type),
                status: selected.status || "active", description: selected.description || "",
                team_members: selected.team_members || [], color: selected.color || "#2563EB",
              });
              setShowEdit(selected);
            }} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>✏️ تعديل المشروع</button>
          )}
        </div>

        {/* Project Info Card */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: selected.color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🚀</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{selected.name}</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, background: `${statusConf.c}15`, color: statusConf.c, padding: "2px 10px", borderRadius: 8, fontWeight: 600 }}>{statusConf.l}</span>
                {parseTypes(selected.project_type).map(t => (
                  <span key={t} style={{ fontSize: 12, background: "#EFF6FF", color: "#2563EB", padding: "2px 10px", borderRadius: 8, fontWeight: 600 }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "1fr 1fr", gap: 10 }}>
            {selected.client_name && <div style={{ fontSize: 13, color: "#0F172A" }}><span style={{ color: "#94A3B8" }}>العميل: </span>{selected.client_name}</div>}
            {selected.website_url && <div style={{ fontSize: 13 }}><span style={{ color: "#94A3B8" }}>الموقع: </span><a href={selected.website_url.startsWith("http") ? selected.website_url : "https://" + selected.website_url} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>{selected.website_url} ↗</a></div>}
          </div>
          {selected.description && <p style={{ fontSize: 13, color: "#64748B", marginTop: 10, lineHeight: 1.6 }}>{selected.description}</p>}
          {selected.team_members?.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {selected.team_members.map(m => <span key={m} style={{ fontSize: 12, background: "#EFF6FF", color: "#2563EB", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{m}</span>)}
            </div>
          )}
        </div>

        {/* Resources */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 20, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>🔗 الروابط والموارد</h3>
            {isAdmin && <button onClick={() => setShowAddRes(true)} style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>+ إضافة رابط</button>}
          </div>
          {resources.length === 0
            ? <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px 0", fontSize: 13 }}>لا توجد روابط بعد</div>
            : <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 500 ? "1fr" : "repeat(2,1fr)", gap: 8 }}>
                {resources.map(r => {
                  const rt = RESOURCE_TYPES.find(x => x.value === r.type) || RESOURCE_TYPES[RESOURCE_TYPES.length - 1];
                  return (
                    <div key={r.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{rt.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{rt.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>فتح ↗</a>
                        {isAdmin && (
                          <button onClick={() => setConfirmDeleteRes(r)} style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>🗑</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Add Resource Modal */}
        {showAddRes && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAddRes(false)}>
            <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
              <button onClick={() => setShowAddRes(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
              <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#0F172A" }}>+ إضافة رابط</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الرابط" style={inp} />
                <input value={resForm.url} onChange={e => setResForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." style={{ ...inp, direction: "ltr" }} />
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>النوع</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                    {RESOURCE_TYPES.map(rt => (
                      <button key={rt.value} onClick={() => setResForm(f => ({ ...f, type: rt.value }))} style={{ padding: "8px 6px", borderRadius: 8, border: resForm.type === rt.value ? "2px solid #2563EB" : "1px solid #E2E8F0", background: resForm.type === rt.value ? "#EFF6FF" : "#F8FAFC", color: resForm.type === rt.value ? "#2563EB" : "#64748B", fontSize: 11, textAlign: "center", cursor: "pointer" }}>
                        <div style={{ fontSize: 18 }}>{rt.icon}</div>
                        <div style={{ fontSize: 10, marginTop: 2 }}>{rt.label.split(" ")[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={addResource} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>إضافة</button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete Resource */}
        {confirmDeleteRes && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 28, width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800, color: "#0F172A" }}>حذف الرابط؟</h3>
              <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>"{confirmDeleteRes.name}"<br/>مش هيرجع بعد الحذف</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => deleteResource(confirmDeleteRes.id)} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>حذف</button>
                <button onClick={() => setConfirmDeleteRes(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Project Modal */}
        {showEdit && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowEdit(null)}>
            <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
              <button onClick={() => setShowEdit(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
              <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✏️ تعديل المشروع</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المشروع *" style={inp} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input value={editForm.client_name} onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))} placeholder="اسم العميل" style={inp} />
                  <input value={editForm.website_url} onChange={e => setEditForm(f => ({ ...f, website_url: e.target.value }))} placeholder="رابط الموقع" style={{ ...inp, direction: "ltr" }} />
                  <div>
                    <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الحالة</div>
                    <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inp}>
                      {PROJECT_STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                    </select>
                  </div>
                </div>
                <TypePicker value={editForm.project_type} onChange={v => setEditForm(f => ({ ...f, project_type: v }))} />
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>أعضاء الفريق</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {members.map(m => (
                      <button key={m.id} onClick={() => setEditForm(f => ({ ...f, team_members: f.team_members.includes(m.name) ? f.team_members.filter(x => x !== m.name) : [...f.team_members, m.name] }))}
                        style={{ padding: "5px 12px", borderRadius: 20, border: editForm.team_members.includes(m.name) ? "2px solid #2563EB" : "1px solid #E2E8F0", background: editForm.team_members.includes(m.name) ? "#EFF6FF" : "#F8FAFC", color: editForm.team_members.includes(m.name) ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>اللون</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {COLORS.map(c => <button key={c} onClick={() => setEditForm(f => ({ ...f, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: editForm.color === c ? "3px solid #0F172A" : "3px solid transparent", cursor: "pointer" }}></button>)}
                  </div>
                </div>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف المشروع" rows={3} style={{ ...inp, resize: "vertical" }} />
                <button onClick={saveEdit} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>حفظ التعديلات ✓</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Projects List ──
  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>📁 المشاريع</h2>
        {isAdmin && <button onClick={() => { setForm(emptyForm); setShowAdd(true); }} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+ مشروع جديد</button>}
      </div>

      {projects.length === 0
        ? <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>📭 لا توجد مشاريع بعد</div>
        : <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "repeat(2,1fr)", gap: 14 }}>
            {projects.map(p => {
              const statusConf = PROJECT_STATUSES.find(s => s.v === p.status) || PROJECT_STATUSES[0];
              return (
                <div key={p.id} onClick={() => openProject(p)} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, cursor: "pointer", borderTop: `3px solid ${p.color || "#2563EB"}`, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: p.color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🚀</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      {p.client_name && <div style={{ fontSize: 12, color: "#94A3B8" }}>{p.client_name}</div>}
                    </div>
                    <span style={{ fontSize: 11, background: `${statusConf.c}15`, color: statusConf.c, padding: "2px 8px", borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>{statusConf.l}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {parseTypes(p.project_type).map(t => (
                      <span key={t} style={{ fontSize: 11, background: "#EFF6FF", color: "#2563EB", padding: "1px 8px", borderRadius: 6, fontWeight: 600 }}>{t}</span>
                    ))}
                    {p.website_url && <span style={{ fontSize: 11, color: "#2563EB" }}>🌐 {p.website_url}</span>}
                    {p.team_members?.length > 0 && <span style={{ fontSize: 11, color: "#94A3B8" }}>👥 {p.team_members.length} أشخاص</span>}
                  </div>
                </div>
              );
            })}
          </div>
      }

      {/* Add Project Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>+ مشروع جديد</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المشروع *" style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="اسم العميل" style={inp} />
                <input value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="رابط الموقع" style={{ ...inp, direction: "ltr" }} />
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الحالة</div>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inp}>
                    {PROJECT_STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>
              <TypePicker value={form.project_type} onChange={v => setForm(f => ({ ...f, project_type: v }))} />
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>أعضاء الفريق</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {members.map(m => (
                    <button key={m.id} onClick={() => setForm(f => ({ ...f, team_members: f.team_members.includes(m.name) ? f.team_members.filter(x => x !== m.name) : [...f.team_members, m.name] }))}
                      style={{ padding: "5px 12px", borderRadius: 20, border: form.team_members.includes(m.name) ? "2px solid #2563EB" : "1px solid #E2E8F0", background: form.team_members.includes(m.name) ? "#EFF6FF" : "#F8FAFC", color: form.team_members.includes(m.name) ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>اللون</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: form.color === c ? "3px solid #0F172A" : "3px solid transparent", cursor: "pointer" }}></button>)}
                </div>
              </div>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف المشروع" rows={3} style={{ ...inp, resize: "vertical" }} />
              <button onClick={addProject} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>إنشاء المشروع</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
