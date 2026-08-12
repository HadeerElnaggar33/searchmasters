import { useState, useEffect } from "react";
import { sb, addHistory, addNotification, STATUS_CONFIG, PRIORITY_CONFIG, formatDate, CURRENT_MONTH, MONTHS } from "../supabase.js";

const TASK_TYPES = ["Keyword Research","Content Brief","Article Writing","Meta Updates","Technical SEO","GSC Analysis","GA4 Analysis","Backlink Analysis","Competitor Analysis","Monthly Report","Other"];
const DELAY_REASONS = ["Waiting for client","Waiting for team member","Task took longer","Higher priority task","Technical issue","Other"];
const SHIFT_REASONS = ["Schedule conflict","Resource unavailable","Reprioritized","Client delay","Other"];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const dayName = (dateStr) => {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("ar-EG", { weekday: "long" });
};

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [showShift, setShowShift] = useState(null);
  const [showDelay, setShowDelay] = useState(null);
  const [shiftReason, setShiftReason] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [showDeliver, setShowDeliver] = useState(null);
  const [deliverUrl, setDeliverUrl] = useState("");
  const [deliverNote, setDeliverNote] = useState("");

  const isAdmin = user.role === "admin" || user.role === "team_leader";
  const today = todayStr();

  const [form, setForm] = useState({
    title: "",
    project_id: "",
    assigned_to: user.name,
    task_type: "Keyword Research",
    status: "todo",
    priority: "medium",
    month: CURRENT_MONTH,
    task_date: today,
    due_date: today,
    notes: "",
    attachments: "",
  });

  useEffect(() => { loadAll(); }, [selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const [t, p, m] = await Promise.all([
      sb(`tasks?month=eq.${encodeURIComponent(selectedMonth)}&order=created_at.desc`),
      sb("projects?order=name"),
      sb("team_members?is_active=eq.true&order=name"),
    ]);
    if (t) setTasks(t);
    if (p) setProjects(p);
    if (m) setMembers(m);
    setLoading(false);
  }

  async function openDetail(task) {
    setShowDetail(task);
    const [c, h] = await Promise.all([
      sb(`task_comments?task_id=eq.${task.id}&order=created_at`),
      sb(`task_history?task_id=eq.${task.id}&order=created_at`),
    ]);
    if (c) setComments(c);
    if (h) setHistory(h);
  }

  async function addTask() {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title,
      project_id: form.project_id || null,
      assigned_to: form.assigned_to,
      task_type: form.task_type,
      status: form.status,
      priority: form.priority,
      month: form.month,
      due_date: form.task_date || form.due_date || null,
      notes: form.notes,
      attachments: form.attachments,
      created_by: user.name,
    };
    const res = await sb("tasks", "POST", payload);
    if (res?.[0]) {
      await addHistory(res[0].id, "created", user.name, `تم إنشاء التاسك وتعيينها لـ ${form.assigned_to}`);
      await addNotification(form.assigned_to, `📌 تم تعيين تاسك جديد لك: ${form.title}`, "assign", res[0].id);
    }
    await loadAll();
    setShowAdd(false);
    setForm({ title: "", project_id: "", assigned_to: user.name, task_type: "Keyword Research", status: "todo", priority: "medium", month: CURRENT_MONTH, task_date: today, due_date: today, notes: "", attachments: "" });
  }

  async function updateStatus(task, newStatus) {
    const updates = { status: newStatus };
    if (newStatus === "in_progress" && !task.started_at) updates.started_at = new Date().toISOString();
    if (newStatus === "completed") {
      const isLate = task.due_date && task.due_date.slice(0,10) < today;
      if (isLate) { setShowDelay(task); return; }
      updates.completed_at = new Date().toISOString();
    }
    await sb(`tasks?id=eq.${task.id}`, "PATCH", updates);
    await addHistory(task.id, "status_changed", user.name, `${STATUS_CONFIG[task.status]?.label} → ${STATUS_CONFIG[newStatus]?.label}`);
    if (newStatus === "completed") await addNotification("هدير", `✅ ${user.name} أتم: ${task.title}`, "done", task.id);
    if (newStatus === "pending_review") await addNotification("هدير", `👁 ${user.name} أرسل للمراجعة: ${task.title}`, "review", task.id);
    await loadAll();
    if (showDetail?.id === task.id) openDetail({ ...task, status: newStatus });
  }

  async function confirmComplete(task) {
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { status: "completed", completed_at: new Date().toISOString(), delay_reason: delayReason });
    await addHistory(task.id, "completed", user.name, delayReason ? `مكتمل مع تأخير: ${delayReason}` : "مكتمل في الموعد");
    await addNotification("هدير", `✅ ${user.name} أتم: ${task.title}`, "done", task.id);
    setShowDelay(null); setDelayReason("");
    await loadAll();
  }

  async function shiftTask(task) {
    const base = task.due_date ? task.due_date.slice(0,10) : today;
    const [y,m,d] = base.split("-").map(Number);
    const next = new Date(y, m-1, d+1);
    const newDate = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { due_date: newDate, shift_count: (task.shift_count||0)+1, shift_reason: shiftReason });
    await addHistory(task.id, "shifted", user.name, `تأجيل إلى ${formatDate(newDate)}. السبب: ${shiftReason}`);
    await addNotification("هدير", `⏩ ${user.name} أجّل: ${task.title} إلى ${formatDate(newDate)}`, "shift", task.id);
    setShowShift(null); setShiftReason("");
    await loadAll();
  }

  async function addDeliverable(task) {
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { deliverable_url: deliverUrl, deliverable_note: deliverNote });
    await addHistory(task.id, "deliverable_added", user.name, deliverUrl || deliverNote);
    setShowDeliver(null); setDeliverUrl(""); setDeliverNote("");
    await loadAll();
    openDetail({ ...task, deliverable_url: deliverUrl, deliverable_note: deliverNote });
  }

  async function submitComment() {
    if (!newComment.trim() || !showDetail) return;
    await sb("task_comments", "POST", { task_id: showDetail.id, content: newComment, author: user.name });
    await addHistory(showDetail.id, "commented", user.name, newComment.slice(0,50));
    setNewComment("");
    openDetail(showDetail);
  }

  async function deleteTask(taskId) {
    await sb(`tasks?id=eq.${taskId}`, "DELETE");
    await loadAll();
  }

  const filtered = tasks.filter(t => {
    if (!isAdmin && t.assigned_to !== user.name) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssignee !== "all" && t.assigned_to !== filterAssignee) return false;
    if (filterProject !== "all" && t.project_id !== filterProject) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const inp = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(99,102,241,0.25)", color: "#E2E8F0", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>📋 التاسكات</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
            {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
          </select>
          {isAdmin && <button onClick={() => setShowAdd(true)} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>+ تاسك جديد</button>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث..." style={{ ...inp, flex: 1, minWidth: 150, padding: "8px 12px" }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 12 }}>
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        {isAdmin && <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 12 }}>
          <option value="all">الكل</option>
          {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>}
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 12 }}>
          <option value="all">كل الأولويات</option>
          {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {/* Task List */}
      {loading
        ? <div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>جاري التحميل...</div>
        : filtered.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "#4B5563" }}>📭 لا توجد تاسكات</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(task => {
                const s = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
                const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                const proj = projects.find(x => x.id === task.project_id);
                const isOverdue = task.due_date && task.due_date.slice(0,10) < today && task.status !== "completed" && task.status !== "cancelled";
                return (
                  <div key={task.id} onClick={() => openDetail(task)} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isOverdue ? "rgba(239,68,68,0.4)" : "rgba(99,102,241,0.15)"}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{task.title}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 6 }}>{s.label}</span>
                          <span style={{ fontSize: 11, color: p.color }}>{p.icon} {p.label}</span>
                          {proj && <span style={{ fontSize: 11, color: "#9CA3AF" }}>📁 {proj.name}</span>}
                          <span style={{ fontSize: 11, color: "#9CA3AF" }}>👤 {task.assigned_to}</span>
                          {task.due_date && <span style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#9CA3AF" }}>📅 {formatDate(task.due_date)} {task.due_date && `(${dayName(task.due_date.slice(0,10))})`}{isOverdue ? " 🔴" : ""}</span>}
                          {task.shift_count > 0 && <span style={{ fontSize: 11, color: "#F59E0B" }}>⏩ {task.shift_count}x</span>}
                          {task.attachments && <span style={{ fontSize: 11, color: "#6EE7B7" }}>🔗 روابط</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
      }

      {/* ══ ADD TASK MODAL ══ */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 540, maxHeight: "93vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>+ إنشاء تاسك جديد</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* عنوان */}
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="عنوان التاسك *" style={inp} />

              {/* الشهر + اليوم */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الشهر</div>
                  <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} style={inp}>
                    {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>
                    اليوم {form.task_date && <span style={{ color: "#A5B4FC" }}>— {dayName(form.task_date)}</span>}
                  </div>
                  <input
                    type="date"
                    value={form.task_date}
                    onChange={e => setForm(f => ({ ...f, task_date: e.target.value, due_date: e.target.value }))}
                    style={inp}
                  />
                </div>
              </div>

              {/* المشروع + نوع التاسك */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>المشروع</div>
                  <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                    <option value="">بدون مشروع</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>نوع التاسك</div>
                  <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))} style={inp}>
                    {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* المسؤول + الأولوية */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>المسؤول</div>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={inp}>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>الأولوية</div>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                    {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* ملاحظات */}
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>ملاحظات</div>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="أي تفاصيل إضافية..." rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>

              {/* روابط وملفات */}
              <div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>🔗 روابط وملفات</div>
                <textarea
                  value={form.attachments}
                  onChange={e => setForm(f => ({ ...f, attachments: e.target.value }))}
                  placeholder={"https://docs.google.com/...\nhttps://sheets.google.com/...\nأي رابط أو ملاحظة أخرى..."}
                  rows={4}
                  style={{ ...inp, resize: "vertical", lineHeight: 1.8, fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: "#4B5563", marginTop: 4 }}>ضع كل رابط في سطر منفصل</div>
              </div>

              <button onClick={addTask} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>إنشاء التاسك</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TASK DETAIL MODAL ══ */}
      {showDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setShowDetail(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#6B7280", fontSize: 20 }}>✕</button>
            {(() => {
              const s = STATUS_CONFIG[showDetail.status] || STATUS_CONFIG.todo;
              const p = PRIORITY_CONFIG[showDetail.priority] || PRIORITY_CONFIG.medium;
              const proj = projects.find(x => x.id === showDetail.project_id);
              const isOverdue = showDetail.due_date && showDetail.due_date.slice(0,10) < today && showDetail.status !== "completed";
              const canEdit = isAdmin || showDetail.assigned_to === user.name;
              return (
                <>
                  <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, paddingLeft: 30 }}>{showDetail.title}</h2>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                    <span style={{ fontSize: 12, background: s.bg, color: s.color, padding: "3px 10px", borderRadius: 8 }}>{s.icon} {s.label}</span>
                    <span style={{ fontSize: 12, color: p.color }}>{p.icon} {p.label}</span>
                    {proj && <span style={{ fontSize: 12, color: "#9CA3AF" }}>📁 {proj.name}</span>}
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>👤 {showDetail.assigned_to}</span>
                    {showDetail.due_date && (
                      <span style={{ fontSize: 12, color: isOverdue ? "#EF4444" : "#9CA3AF" }}>
                        📅 {formatDate(showDetail.due_date)} ({dayName(showDetail.due_date.slice(0,10))})
                      </span>
                    )}
                  </div>

                  {showDetail.notes && <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 14, lineHeight: 1.6 }}>{showDetail.notes}</p>}

                  {/* Attachments */}
                  {showDetail.attachments && (
                    <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#A5B4FC", marginBottom: 8 }}>🔗 الروابط والملفات</div>
                      {showDetail.attachments.split("\n").filter(l => l.trim()).map((line, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          {line.trim().startsWith("http")
                            ? <a href={line.trim()} target="_blank" rel="noreferrer" style={{ color: "#6EE7B7", fontSize: 13, wordBreak: "break-all", display: "block" }}>🔗 {line.trim()}</a>
                            : <span style={{ color: "#9CA3AF", fontSize: 13 }}>{line}</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {canEdit && showDetail.status !== "completed" && showDetail.status !== "cancelled" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                      {showDetail.status === "todo" && <button onClick={() => updateStatus(showDetail, "in_progress")} style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.4)", color: "#93C5FD", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>⚡ ابدأ العمل</button>}
                      {showDetail.status === "in_progress" && <button onClick={() => updateStatus(showDetail, "pending_review")} style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#FCD34D", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>👁 إرسال للمراجعة</button>}
                      {(showDetail.status === "in_progress" || showDetail.status === "pending_review") && <button onClick={() => updateStatus(showDetail, "completed")} style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", color: "#6EE7B7", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>✅ مكتمل</button>}
                      {isAdmin && showDetail.status === "pending_review" && <button onClick={() => updateStatus(showDetail, "needs_revision")} style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", color: "#FCA5A5", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>🔁 محتاج تعديل</button>}
                      <button onClick={() => setShowShift(showDetail)} style={{ background: "rgba(249,115,22,0.2)", border: "1px solid rgba(249,115,22,0.4)", color: "#FED7AA", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>⏩ تأجيل ليوم غد</button>
                      <button onClick={() => setShowDeliver(showDetail)} style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#A5B4FC", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>📎 Deliverable</button>
                      {isAdmin && <button onClick={() => { deleteTask(showDetail.id); setShowDetail(null); }} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", padding: "8px 14px", borderRadius: 8, fontSize: 12 }}>🗑 حذف</button>}
                    </div>
                  )}

                  {/* Deliverable */}
                  {(showDetail.deliverable_url || showDetail.deliverable_note) && (
                    <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", marginBottom: 6 }}>📎 Deliverable</div>
                      {showDetail.deliverable_url && <a href={showDetail.deliverable_url} target="_blank" rel="noreferrer" style={{ color: "#A5B4FC", fontSize: 13 }}>🔗 {showDetail.deliverable_url}</a>}
                      {showDetail.deliverable_note && <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>{showDetail.deliverable_note}</p>}
                    </div>
                  )}

                  {/* History */}
                  {history.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#9CA3AF" }}>📜 السجل</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {history.map(h => (
                          <div key={h.id} style={{ fontSize: 12, color: "#6B7280", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                            <span style={{ color: "#A5B4FC" }}>{h.performed_by}</span> — {h.details || h.action}
                            <span style={{ float: "left", fontSize: 11 }}>{new Date(h.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💬 التعليقات</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 180, overflowY: "auto" }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "8px 12px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#A5B4FC", marginBottom: 3 }}>{c.author}</div>
                          <div style={{ fontSize: 13 }}>{c.content}</div>
                        </div>
                      ))}
                      {comments.length === 0 && <div style={{ fontSize: 13, color: "#4B5563" }}>لا توجد تعليقات بعد</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === "Enter" && submitComment()} placeholder="اكتب تعليق..." style={{ ...inp, flex: 1, padding: "8px 12px", fontSize: 13 }} />
                      <button onClick={submitComment} style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>إرسال</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Shift Modal */}
      {showShift && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>⏩ تأجيل التاسك ليوم غد</h3>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>{showShift.title}</p>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6 }}>سبب التأجيل</div>
            <select value={shiftReason} onChange={e => setShiftReason(e.target.value)} style={{ ...inp, marginBottom: 16 }}>
              <option value="">اختر السبب</option>
              {SHIFT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => shiftTask(showShift)} style={{ flex: 1, background: "linear-gradient(135deg,#F97316,#EA580C)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>تأكيد التأجيل</button>
              <button onClick={() => setShowShift(null)} style={{ flex: 1, background: "rgba(255,255,255,0.08)", color: "#9CA3AF", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Delay Reason Modal */}
      {showDelay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>🔴 التاسك متأخرة</h3>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>ليه التاسك اتأخرت عن الديدلاين؟</p>
            <select value={delayReason} onChange={e => setDelayReason(e.target.value)} style={{ ...inp, marginBottom: 16 }}>
              <option value="">اختر السبب</option>
              {DELAY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => confirmComplete(showDelay)} style={{ flex: 1, background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>تأكيد الإتمام</button>
              <button onClick={() => setShowDelay(null)} style={{ flex: 1, background: "rgba(255,255,255,0.08)", color: "#9CA3AF", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Deliverable Modal */}
      {showDeliver && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#1A1060", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>📎 إضافة Deliverable</h3>
            <input value={deliverUrl} onChange={e => setDeliverUrl(e.target.value)} placeholder="رابط (Google Sheet, Doc...)" style={{ ...inp, marginBottom: 10 }} />
            <textarea value={deliverNote} onChange={e => setDeliverNote(e.target.value)} placeholder="ملاحظة أو وصف ما تم..." rows={3} style={{ ...inp, marginBottom: 16, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => addDeliverable(showDeliver)} style={{ flex: 1, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>إضافة</button>
              <button onClick={() => setShowDeliver(null)} style={{ flex: 1, background: "rgba(255,255,255,0.08)", color: "#9CA3AF", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
