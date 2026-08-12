import { useState, useEffect } from "react";
import { sb, PRIORITY_CONFIG, CURRENT_MONTH, MONTHS } from "../supabase.js";

const TASK_TYPES = ["Keyword Research","Content Brief","Article Writing","Meta Updates","Technical SEO","GSC Analysis","GA4 Analysis","Backlink Analysis","Competitor Analysis","Monthly Report","Other"];
const FREQUENCIES = [{ v:"daily", l:"يومي" },{ v:"weekly", l:"أسبوعي" },{ v:"monthly", l:"شهري" }];
const DOW_AR = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

const DEFAULT_TEMPLATES = [
  { name: "Monthly SEO Report", description: "تقرير SEO الشهري الكامل", tasks: [
    { title: "GSC Analysis", task_type: "GSC Analysis", priority: "high" },
    { title: "GA4 Analysis", task_type: "GA4 Analysis", priority: "high" },
    { title: "Keyword Performance Review", task_type: "Keyword Research", priority: "medium" },
    { title: "Backlink Analysis", task_type: "Backlink Analysis", priority: "medium" },
    { title: "Technical Issues Check", task_type: "Technical SEO", priority: "high" },
    { title: "Competitor Analysis", task_type: "Competitor Analysis", priority: "medium" },
  ]},
  { name: "New Website Onboarding", description: "إعداد موقع جديد", tasks: [
    { title: "Keyword Research", task_type: "Keyword Research", priority: "urgent" },
    { title: "Technical SEO Audit", task_type: "Technical SEO", priority: "high" },
    { title: "Content Brief x5", task_type: "Content Brief", priority: "high" },
    { title: "Meta Tags Setup", task_type: "Meta Updates", priority: "medium" },
    { title: "GSC Setup & Verification", task_type: "GSC Analysis", priority: "urgent" },
  ]},
  { name: "Weekly Content Plan", description: "خطة المحتوى الأسبوعية", tasks: [
    { title: "Content Brief", task_type: "Content Brief", priority: "high" },
    { title: "Article Writing x3", task_type: "Article Writing", priority: "high" },
    { title: "Meta Updates", task_type: "Meta Updates", priority: "medium" },
  ]},
];

export default function Templates({ user }) {
  const [templates, setTemplates] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("templates");
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [showApply, setShowApply] = useState(null);
  const [applyForm, setApplyForm] = useState({ project_id: "", assigned_to: "", month: CURRENT_MONTH, due_date: "" });
  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const [tForm, setTForm] = useState({ name: "", description: "", tasks: [{ title: "", task_type: "Keyword Research", priority: "medium" }] });
  const [rForm, setRForm] = useState({ title: "", project_id: "", assigned_to: "", task_type: "GSC Analysis", priority: "medium", frequency: "weekly", day_of_week: 1, day_of_month: 1 });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [t, r, p, m] = await Promise.all([
      sb("task_templates?order=created_at.desc"),
      sb("recurring_tasks?order=created_at.desc"),
      sb("projects?select=id,name&order=name"),
      sb("team_members?is_active=eq.true&order=name"),
    ]);
    if (t) setTemplates(t);
    if (r) setRecurring(r);
    if (p) setProjects(p);
    if (m) setMembers(m);
  }

  async function saveTemplate() {
    if (!tForm.name.trim()) return;
    await sb("task_templates", "POST", { name: tForm.name, description: tForm.description, tasks: tForm.tasks, created_by: user.name });
    await loadAll();
    setShowAddTemplate(false);
    setTForm({ name: "", description: "", tasks: [{ title: "", task_type: "Keyword Research", priority: "medium" }] });
  }

  async function applyTemplate(template) {
    const taskList = template.tasks || [];
    for (const t of taskList) {
      await sb("tasks", "POST", {
        title: t.title,
        task_type: t.task_type,
        priority: t.priority || "medium",
        project_id: applyForm.project_id || null,
        assigned_to: applyForm.assigned_to || user.name,
        month: applyForm.month,
        due_date: applyForm.due_date || null,
        status: "todo",
        created_by: user.name,
      });
    }
    setShowApply(null);
    alert(`✅ تم إنشاء ${taskList.length} تاسك من قالب "${template.name}"`);
  }

  async function deleteTemplate(id) {
    await sb(`task_templates?id=eq.${id}`, "DELETE");
    await loadAll();
  }

  async function saveRecurring() {
    if (!rForm.title.trim()) return;
    await sb("recurring_tasks", "POST", { ...rForm, created_by: user.name });
    await loadAll();
    setShowAddRecurring(false);
    setRForm({ title: "", project_id: "", assigned_to: "", task_type: "GSC Analysis", priority: "medium", frequency: "weekly", day_of_week: 1, day_of_month: 1 });
  }

  async function toggleRecurring(r) {
    await sb(`recurring_tasks?id=eq.${r.id}`, "PATCH", { is_active: !r.is_active });
    await loadAll();
  }

  async function deleteRecurring(id) {
    await sb(`recurring_tasks?id=eq.${id}`, "DELETE");
    await loadAll();
  }

  async function generateRecurringNow(r) {
    await sb("tasks", "POST", {
      title: r.title,
      task_type: r.task_type,
      priority: r.priority,
      project_id: r.project_id || null,
      assigned_to: r.assigned_to || user.name,
      month: CURRENT_MONTH,
      status: "todo",
      created_by: user.name,
    });
    alert(`✅ تم إنشاء تاسك: ${r.title}`);
  }

  const inp = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#E2E8F0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>⚡ القوالب والمتكررة</h2>
        {isAdmin && (
          <button onClick={() => tab === "templates" ? setShowAddTemplate(true) : setShowAddRecurring(true)} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
            + {tab === "templates" ? "قالب جديد" : "تاسك متكررة"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
        {[["templates","📝 القوالب"],["recurring","🔄 المتكررة"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: tab === v ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "transparent", color: tab === v ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: tab === v ? 700 : 400 }}>{l}</button>
        ))}
      </div>

      {/* Templates */}
      {tab === "templates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Default Templates */}
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: -8 }}>القوالب الجاهزة</div>
          {DEFAULT_TEMPLATES.map((t, i) => (
            <div key={i} style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>📝 {t.name}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>{t.description} · {t.tasks.length} تاسكات</div>
                </div>
                {isAdmin && (
                  <button onClick={() => { setShowApply(t); setApplyForm({ project_id: "", assigned_to: "", month: CURRENT_MONTH, due_date: "" }); }} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>تطبيق ▶</button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.tasks.map((task, j) => {
                  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                  return <span key={j} style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", color: "#9CA3AF", padding: "3px 10px", borderRadius: 20 }}>{p.icon} {task.title}</span>;
                })}
              </div>
            </div>
          ))}

          {/* Custom Templates */}
          {templates.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>قوالبك المخصصة</div>
              {templates.map(t => (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>📝 {t.name}</div>
                      {t.description && <div style={{ fontSize: 12, color: "#9CA3AF" }}>{t.description} · {(t.tasks || []).length} تاسكات</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isAdmin && <button onClick={() => { setShowApply(t); setApplyForm({ project_id: "", assigned_to: "", month: CURRENT_MONTH, due_date: "" }); }} style={{ background: "rgba(99,102,241,0.2)", color: "#A5B4FC", padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>تطبيق</button>}
                      {isAdmin && <button onClick={() => deleteTemplate(t.id)} style={{ background: "rgba(239,68,68,0.1)", color: "#FCA5A5", padding: "6px 10px", borderRadius: 8, fontSize: 12 }}>🗑</button>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(t.tasks || []).map((task, j) => (
                      <span key={j} style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", color: "#9CA3AF", padding: "3px 10px", borderRadius: 20 }}>{task.title}</span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Recurring */}
      {tab === "recurring" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recurring.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 0", color: "#4B5563" }}>لا توجد تاسكات متكررة بعد</div>
            : recurring.map(r => {
              const proj = projects.find(p => p.id === r.project_id);
              const freq = FREQUENCIES.find(f => f.v === r.frequency);
              const p = PRIORITY_CONFIG[r.priority] || PRIORITY_CONFIG.medium;
              return (
                <div key={r.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${r.is_active ? "rgba(99,102,241,0.2)" : "rgba(107,114,128,0.2)"}`, borderRadius: 14, padding: "14px 16px", opacity: r.is_active ? 1 : 0.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 22 }}>🔄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>{freq?.l}</span>
                        {r.frequency === "weekly" && <span>{DOW_AR[r.day_of_week]}</span>}
                        {r.frequency === "monthly" && <span>يوم {r.day_of_month}</span>}
                        {r.assigned_to && <span>👤 {r.assigned_to}</span>}
                        {proj && <span>📁 {proj.name}</span>}
                        <span>{p.icon} {p.label}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => generateRecurringNow(r)} style={{ background: "rgba(16,185,129,0.15)", color: "#6EE7B7", padding: "5px 10px", borderRadius: 8, fontSize: 11 }}>إنشاء الآن</button>
                        <button onClick={() => toggleRecurring(r)} style={{ background: r.is_active ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)", color: r.is_active ? "#FCD34D" : "#6EE7B7", padding: "5px 10px", borderRadius: 8, fontSize: 11 }}>{r.is_active ? "إيقاف" : "تفعيل"}</button>
                        <button onClick={() => deleteRecurring(r.id)} style={{ background: "rgba(239,68,68,0.1)", color: "#FCA5A5", padding: "5px 8px", borderRadius: 8, fontSize: 11 }}>🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* Apply Template Modal */}
      {showApply && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowApply(null)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, position: "relative" }}>
            <button onClick={() => setShowApply(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>تطبيق قالب</h3>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>"{showApply.name}" — {(showApply.tasks || []).length} تاسكات</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>المشروع</div>
                <select value={applyForm.project_id} onChange={e => setApplyForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                  <option value="">بدون مشروع</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>تعيين لـ</div>
                <select value={applyForm.assigned_to} onChange={e => setApplyForm(f => ({ ...f, assigned_to: e.target.value }))} style={inp}>
                  <option value="">اختر عضو</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الشهر</div>
                <select value={applyForm.month} onChange={e => setApplyForm(f => ({ ...f, month: e.target.value }))} style={inp}>
                  {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الديدلاين (اختياري)</div>
                <input type="date" value={applyForm.due_date} onChange={e => setApplyForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
              </div>
              <button onClick={() => applyTemplate(showApply)} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                إنشاء {(showApply.tasks || []).length} تاسكات ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Template Modal */}
      {showAddTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAddTemplate(false)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setShowAddTemplate(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>+ قالب جديد</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم القالب" style={inp} />
              <input value={tForm.description} onChange={e => setTForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف القالب" style={inp} />
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>التاسكات</div>
              {tForm.tasks.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={t.title} onChange={e => { const tasks = [...tForm.tasks]; tasks[i] = { ...tasks[i], title: e.target.value }; setTForm(f => ({ ...f, tasks })); }} placeholder={`تاسك ${i + 1}`} style={{ ...inp, flex: 1 }} />
                  <select value={t.priority} onChange={e => { const tasks = [...tForm.tasks]; tasks[i] = { ...tasks[i], priority: e.target.value }; setTForm(f => ({ ...f, tasks })); }} style={{ ...inp, width: "auto", padding: "10px 8px" }}>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon}</option>)}
                  </select>
                  <button onClick={() => setTForm(f => ({ ...f, tasks: f.tasks.filter((_, j) => j !== i) }))} style={{ background: "rgba(239,68,68,0.1)", color: "#FCA5A5", padding: "8px 10px", borderRadius: 8, fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setTForm(f => ({ ...f, tasks: [...f.tasks, { title: "", task_type: "Keyword Research", priority: "medium" }] }))} style={{ background: "rgba(99,102,241,0.1)", color: "#A5B4FC", padding: "8px", borderRadius: 10, fontSize: 13 }}>+ إضافة تاسك</button>
              <button onClick={saveTemplate} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>حفظ القالب</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Recurring Modal */}
      {showAddRecurring && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAddRecurring(false)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 440, position: "relative" }}>
            <button onClick={() => setShowAddRecurring(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>+ تاسك متكررة</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input value={rForm.title} onChange={e => setRForm(f => ({ ...f, title: e.target.value }))} placeholder="عنوان التاسك" style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>المشروع</div>
                  <select value={rForm.project_id} onChange={e => setRForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                    <option value="">بدون مشروع</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>المسؤول</div>
                  <select value={rForm.assigned_to} onChange={e => setRForm(f => ({ ...f, assigned_to: e.target.value }))} style={inp}>
                    <option value="">اختر</option>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>التكرار</div>
                  <select value={rForm.frequency} onChange={e => setRForm(f => ({ ...f, frequency: e.target.value }))} style={inp}>
                    {FREQUENCIES.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الأولوية</div>
                  <select value={rForm.priority} onChange={e => setRForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
              </div>
              {rForm.frequency === "weekly" && (
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>يوم الأسبوع</div>
                  <select value={rForm.day_of_week} onChange={e => setRForm(f => ({ ...f, day_of_week: parseInt(e.target.value) }))} style={inp}>
                    {DOW_AR.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {rForm.frequency === "monthly" && (
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>يوم الشهر</div>
                  <input type="number" min="1" max="28" value={rForm.day_of_month} onChange={e => setRForm(f => ({ ...f, day_of_month: parseInt(e.target.value) }))} style={inp} />
                </div>
              )}
              <button onClick={saveRecurring} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
