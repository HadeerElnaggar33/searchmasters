import { useState, useEffect } from "react";
import { sb, RESOURCE_TYPES } from "../supabase.js";

const PROJECT_TYPES = ["SEO","Content Marketing","Technical SEO","Local SEO","E-commerce SEO","Link Building","Other"];
const PROJECT_STATUSES = [{ v:"active", l:"نشط", c:"#10B981" },{ v:"paused", l:"موقوف", c:"#F59E0B" },{ v:"completed", l:"منتهي", c:"#6B7280" }];

export default function Projects({ user }) {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [resources, setResources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddRes, setShowAddRes] = useState(false);
  const [loading, setLoading] = useState(true);
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const [form, setForm] = useState({ name: "", client_name: "", website_url: "", project_type: "SEO", status: "active", description: "", team_members: [], color: "#6366F1" });
  const [resForm, setResForm] = useState({ name: "", url: "", type: "drive" });

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
    await sb("projects", "POST", form);
    await loadAll();
    setShowAdd(false);
    setForm({ name: "", client_name: "", website_url: "", project_type: "SEO", status: "active", description: "", team_members: [], color: "#6366F1" });
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
  }

  const inp = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#E2E8F0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };
  const colors = ["#6366F1","#8B5CF6","#EC4899","#EF4444","#F97316","#10B981","#3B82F6","#F59E0B"];

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>جاري التحميل...</div>;

  // Project Detail View
  if (selected) {
    const statusConf = PROJECT_STATUSES.find(s => s.v === selected.status) || PROJECT_STATUSES[0];
    return (
      <div style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
        <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.08)", color: "#9CA3AF", padding: "7px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>← رجوع</button>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: selected.color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🚀</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{selected.name}</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, background: `${statusConf.c}22`, color: statusConf.c, padding: "2px 10px", borderRadius: 8 }}>{statusConf.l}</span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{selected.project_type}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "1fr 1fr", gap: 10 }}>
            {selected.client_name && <div style={{ fontSize: 13 }}><span style={{ color: "#6B7280" }}>العميل: </span>{selected.client_name}</div>}
            {selected.website_url && <div style={{ fontSize: 13 }}><span style={{ color: "#6B7280" }}>الموقع: </span><a href={selected.website_url.startsWith("http") ? selected.website_url : "https://" + selected.website_url} target="_blank" rel="noreferrer" style={{ color: "#A5B4FC" }}>{selected.website_url} ↗</a></div>}
          </div>
          {selected.description && <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 10, lineHeight: 1.6 }}>{selected.description}</p>}
          {selected.team_members?.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {selected.team_members.map(m => <span key={m} style={{ fontSize: 12, background: "rgba(99,102,241,0.15)", color: "#A5B4FC", padding: "3px 10px", borderRadius: 20 }}>{m}</span>)}
            </div>
          )}
        </div>

        {/* Resources */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>🔗 الروابط والموارد</h3>
            {isAdmin && <button onClick={() => setShowAddRes(true)} style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>+ إضافة رابط</button>}
          </div>
          {resources.length === 0
            ? <div style={{ textAlign: "center", color: "#4B5563", padding: "20px 0", fontSize: 13 }}>لا توجد روابط بعد</div>
            : <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 500 ? "1fr" : "repeat(2,1fr)", gap: 8 }}>
                {resources.map(r => {
                  const rt = RESOURCE_TYPES.find(x => x.value === r.type) || RESOURCE_TYPES[RESOURCE_TYPES.length - 1];
                  return (
                    <div key={r.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{rt.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>{rt.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>فتح ↗</a>
                        {isAdmin && <button onClick={() => deleteResource(r.id)} style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>🗑</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Add Resource Modal */}
        {showAddRes && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAddRes(false)}>
            <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, position: "relative" }}>
              <button onClick={() => setShowAddRes(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
              <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>+ إضافة رابط</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الرابط" style={inp} />
                <input value={resForm.url} onChange={e => setResForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." style={{ ...inp, direction: "ltr" }} />
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6 }}>النوع</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                    {RESOURCE_TYPES.map(rt => (
                      <button key={rt.value} onClick={() => setResForm(f => ({ ...f, type: rt.value }))} style={{ padding: "8px 6px", borderRadius: 8, border: resForm.type === rt.value ? "2px solid #6366F1" : "1px solid rgba(255,255,255,0.1)", background: resForm.type === rt.value ? "rgba(99,102,241,0.2)" : "transparent", color: resForm.type === rt.value ? "#A5B4FC" : "#6B7280", fontSize: 11, textAlign: "center" }}>
                        <div style={{ fontSize: 18 }}>{rt.icon}</div>
                        <div style={{ fontSize: 10, marginTop: 2 }}>{rt.label.split(" ")[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={addResource} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>إضافة</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Projects List
  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>📁 المشاريع</h2>
        {isAdmin && <button onClick={() => setShowAdd(true)} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+ مشروع جديد</button>}
      </div>

      {projects.length === 0
        ? <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>📭 لا توجد مشاريع بعد</div>
        : <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr" : "repeat(2,1fr)", gap: 14 }}>
            {projects.map(p => {
              const statusConf = PROJECT_STATUSES.find(s => s.v === p.status) || PROJECT_STATUSES[0];
              return (
                <div key={p.id} onClick={() => openProject(p)} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 18, padding: 18, cursor: "pointer", borderTop: `3px solid ${p.color || "#6366F1"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: p.color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🚀</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      {p.client_name && <div style={{ fontSize: 12, color: "#9CA3AF" }}>{p.client_name}</div>}
                    </div>
                    <span style={{ fontSize: 11, background: `${statusConf.c}22`, color: statusConf.c, padding: "2px 8px", borderRadius: 6, flexShrink: 0 }}>{statusConf.l}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{p.project_type}</span>
                    {p.website_url && <span style={{ fontSize: 11, color: "#6366F1" }}>🌐 {p.website_url}</span>}
                    {p.team_members?.length > 0 && <span style={{ fontSize: 11, color: "#9CA3AF" }}>👥 {p.team_members.length} أشخاص</span>}
                  </div>
                </div>
              );
            })}
          </div>
      }

      {/* Add Project Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>+ مشروع جديد</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المشروع *" style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="اسم العميل" style={inp} />
                <input value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} placeholder="رابط الموقع" style={{ ...inp, direction: "ltr" }} />
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>نوع المشروع</div>
                  <select value={form.project_type} onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))} style={inp}>
                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الحالة</div>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inp}>
                    {PROJECT_STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>أعضاء الفريق</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {members.map(m => (
                    <button key={m.id} onClick={() => setForm(f => ({ ...f, team_members: f.team_members.includes(m.name) ? f.team_members.filter(x => x !== m.name) : [...f.team_members, m.name] }))} style={{ padding: "5px 12px", borderRadius: 20, border: form.team_members.includes(m.name) ? "2px solid #6366F1" : "1px solid rgba(255,255,255,0.15)", background: form.team_members.includes(m.name) ? "rgba(99,102,241,0.2)" : "transparent", color: form.team_members.includes(m.name) ? "#A5B4FC" : "#6B7280", fontSize: 12 }}>{m.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>لون المشروع</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {colors.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: form.color === c ? "3px solid #fff" : "3px solid transparent" }}></button>)}
                </div>
              </div>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف المشروع" rows={3} style={{ ...inp, resize: "vertical" }} />
              <button onClick={addProject} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>إنشاء المشروع</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
