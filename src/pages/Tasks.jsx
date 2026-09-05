import { useState, useEffect, useRef } from "react";
import { sb, addHistory, addNotification, STATUS_CONFIG, PRIORITY_CONFIG, formatDate, CURRENT_MONTH, MONTHS } from "../supabase.js";
import { SCORE, addScore, replaceTaskScore, clearTaskScore, monthLabelOf, inWorkHours } from "../score.js";
import { speechSupported, createRecognizer, parseTranscript } from "../voice.js";
import { activeTimer, startTimer, stopTimer, taskHasTime, noticeClosedWithoutTime, fmtDur, fmtClock } from "../timer.js";

const TASK_TYPES = ["Keyword Research","Content Brief","Article Writing","Meta Updates","Technical SEO","GSC Analysis","GA4 Analysis","Backlink Analysis","Competitor Analysis","Monthly Report","Other"];
const DELAY_REASONS = ["Waiting for client","Waiting for team member","Task took longer","Higher priority task","Technical issue","Other"];
const SHIFT_REASONS = ["Schedule conflict","Resource unavailable","Reprioritized","Client delay","Other"];

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getDayName(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("ar-EG", { weekday: "long" });
}

function parseAttachments(text) {
  if (!text) return [];
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    if (line.includes("|")) {
      const idx = line.indexOf("|");
      const name = line.slice(0, idx).trim();
      const url = line.slice(idx + 1).trim();
      return { name, url, isLink: url.startsWith("http") };
    }
    return { name: null, url: line, isLink: line.startsWith("http") };
  });
}

function parseHelpers(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return String(val).split(",").map(x => x.trim()).filter(Boolean);
}

function isOnTask(task, name) {
  return task.assigned_to === name || parseHelpers(task.helpers).includes(name);
}

function getFileIcon(url) {
  if (!url) return "🔗";
  if (url.includes("sheets")) return "📊";
  if (url.includes("docs")) return "📄";
  if (url.includes("drive")) return "📁";
  if (url.includes("slides")) return "📽";
  if (url.includes("analytics")) return "📈";
  if (url.includes("search.google") || url.includes("searchconsole")) return "🔍";
  return "🔗";
}

export default function Tasks({ user, voiceTrigger }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showEdit, setShowEdit] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
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
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [workHours, setWorkHours] = useState({ start: 10, end: 18 });
  const [celebrate, setCelebrate] = useState(null);          // نص الاحتفال
  const [showRate, setShowRate] = useState(null);            // التاسك اللي بتتقيّم
  const [rateForm, setRateForm] = useState({ rating: "", positive: "", negative: "" });
  const [savingRate, setSavingRate] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState(null);
  const [voiceErr, setVoiceErr] = useState("");
  const recRef = useRef(null);
  const [timer, setTimer] = useState(null);        // الجلسة الشغالة
  const [tick, setTick] = useState(0);             // عداد الثواني
  const [nudge, setNudge] = useState(false);       // تنبيه تشغيل الوقت
  const nudgeRef = useRef(null);

  const isAdmin = user.role === "admin";
  // صلاحية إدارة التاسكات: يضيف ويشوف ويحذف تاسكات الفريق
  const canAssign = isAdmin || user.can_assign_tasks === true;
  const today = getTodayStr();

  const emptyForm = {
    title: "", project_id: "", assigned_to: user.name, helpers: [],
    task_type: "Keyword Research", status: "todo", priority: "medium",
    month: CURRENT_MONTH, task_date: today, due_date: today, notes: "", attachments: "",
  };
  const [form, setForm] = useState(emptyForm);

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };

  useEffect(() => { loadAll(); loadWorkHours(); }, [selectedMonth]);

  // ── التايمر الشغال + العداد ──
  useEffect(() => { activeTimer(user.name).then(setTimer); }, [user.name]);

  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  // ── تنبيه: تاسك شغالة والتايمر مقفول ──
  useEffect(() => {
    const running = tasks.filter(t => t.assigned_to === user.name && t.status === "in_progress");
    const needs = running.length > 0 && !timer;
    setNudge(needs);
    if (nudgeRef.current) clearInterval(nudgeRef.current);
    if (needs) {
      nudgeRef.current = setInterval(() => setNudge(true), 15 * 60 * 1000);
    }
    return () => { if (nudgeRef.current) clearInterval(nudgeRef.current); };
  }, [tasks, timer, user.name]);

  async function toggleTimer(task) {
    if (timer && String(timer.task_id) === String(task.id)) {
      await stopTimer(user.name);
      setTimer(null);
    } else {
      const proj = projects.find(p => String(p.id) === String(task.project_id));
      const t = await startTimer(task, user.name, proj?.name);
      setTimer(t);
      setTick(0);
    }
    await loadAll();
  }

  // فتح نافذة الصوت لما تتضغط أيقونة المايك في البار العلوي
  useEffect(() => {
    if (!voiceTrigger) return;
    setTranscript(""); setParsed(null); setVoiceErr(""); setVoiceOpen(true);
  }, [voiceTrigger]);

  // الاحتفال يختفي لوحده بعد 3.5 ثانية
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 3500);
    return () => clearTimeout(t);
  }, [celebrate]);

  async function loadWorkHours() {
    const rows = await sb("app_settings?select=key,value");
    if (rows) {
      const g = (k, d) => { const r = rows.find(x => x.key === k); return r ? Number(r.value) : d; };
      setWorkHours({ start: g("work_hour_start", 10), end: g("work_hour_end", 18) });
    }
  }

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
    if (!form.title.trim()) { alert("اكتبي عنوان التاسك"); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(), project_id: form.project_id || null,
      assigned_to: form.assigned_to, task_type: form.task_type,
      status: "todo", priority: form.priority, month: form.month,
      due_date: form.task_date || null, task_date: form.task_date || null,
      notes: form.notes, attachments: form.attachments, created_by: user.name,
      helpers: form.helpers.length ? form.helpers.join(", ") : null,
    };
    const res = await sb("tasks", "POST", payload);
    if (res && res[0]) {
      await addHistory(res[0].id, "created", user.name, form.helpers.length ? `تعيين لـ ${form.assigned_to} + مساعدة: ${form.helpers.join("، ")}` : `تعيين لـ ${form.assigned_to}`);
      await addNotification(form.assigned_to, `📌 تاسك جديد: ${form.title}`, "assign", res[0].id);
      for (const h of form.helpers) {
        await addNotification(h, `🤝 تمت إضافتك كمساعد في: ${form.title}`, "assign", res[0].id);
      }
      setSaving(false); setShowAdd(false); setForm(emptyForm); await loadAll();
    } else {
      setSaving(false); alert("حصل خطأ في الإضافة، جربي تاني");
    }
  }

  async function saveEdit() {
    if (!editForm.title?.trim()) return;
    const newHelpers = (editForm.helpers || []).filter(h => h !== editForm.assigned_to);
    const oldHelpers = parseHelpers(showEdit.helpers);
    await sb(`tasks?id=eq.${showEdit.id}`, "PATCH", {
      title: editForm.title, notes: editForm.notes,
      attachments: editForm.attachments, due_date: editForm.due_date || null,
      priority: editForm.priority, assigned_to: editForm.assigned_to,
      helpers: newHelpers.length ? newHelpers.join(", ") : null,
      task_type: editForm.task_type,
    });
    await addHistory(showEdit.id, "edited", user.name, "تم تعديل التاسك");
    for (const h of newHelpers.filter(x => !oldHelpers.includes(x))) {
      await addNotification(h, `🤝 تمت إضافتك كمساعد في: ${editForm.title}`, "assign", showEdit.id);
    }
    await loadAll();
    setShowEdit(null);
    setShowDetail(null);
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
    if (newStatus === "completed") {
      await addNotification("هدير", `✅ ${user.name} أتم: ${task.title}`, "done", task.id);
      await replaceTaskScore({
        member: task.assigned_to, month: task.month || monthLabelOf(),
        points: SCORE.taskComplete, source: "task_complete",
        reason: `إكمال: ${task.title}`, taskId: task.id, by: user.name,
      });
      if (timer && String(timer.task_id) === String(task.id)) { await stopTimer(user.name); setTimer(null); }
      const hadTime = await taskHasTime(task.id);
      if (!hadTime && task.assigned_to === user.name) await noticeClosedWithoutTime(task, user.name);
      if (task.assigned_to === user.name) setCelebrate(`تاسك خلصت 🎉  +${SCORE.taskComplete} نقطة`);
    }
    if (newStatus === "pending_review") await addNotification("هدير", `👁 ${user.name} أرسل للمراجعة: ${task.title}`, "review", task.id);
    await loadAll();
    if (showDetail?.id === task.id) openDetail({ ...task, status: newStatus });
  }

  async function confirmComplete(task) {
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { status: "completed", completed_at: new Date().toISOString(), delay_reason: delayReason });
    await addHistory(task.id, "completed", user.name, delayReason ? `مكتمل مع تأخير: ${delayReason}` : "مكتمل في الموعد");
    await addNotification("هدير", `✅ ${user.name} أتم: ${task.title}`, "done", task.id);
    await replaceTaskScore({
      member: task.assigned_to, month: task.month || monthLabelOf(),
      points: SCORE.taskComplete, source: "task_complete",
      reason: `إكمال: ${task.title}`, taskId: task.id, by: user.name,
    });
    if (task.assigned_to === user.name) setCelebrate(`تاسك خلصت 🎉  +${SCORE.taskComplete} نقطة`);
    setShowDelay(null); setDelayReason(""); await loadAll(); setShowDetail(null);
  }

  async function shiftTask(task) {
    const base = task.due_date ? task.due_date.slice(0,10) : today;
    const [y,m,d] = base.split("-").map(Number);
    const next = new Date(y, m-1, d+1);
    const newDate = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { due_date: newDate, shift_count: (task.shift_count||0)+1, shift_reason: shiftReason });
    await addHistory(task.id, "shifted", user.name, `تأجيل إلى ${formatDate(newDate)}. السبب: ${shiftReason}`);
    await addNotification("هدير", `⏩ ${user.name} أجّل: ${task.title} إلى ${formatDate(newDate)}`, "shift", task.id);
    setShowShift(null); setShiftReason(""); await loadAll();
    if (showDetail?.id === task.id) openDetail({ ...task, due_date: newDate });
  }

  async function addDeliverable(task) {
    await sb(`tasks?id=eq.${task.id}`, "PATCH", { deliverable_url: deliverUrl, deliverable_note: deliverNote });
    await addHistory(task.id, "deliverable_added", user.name, deliverUrl || deliverNote);
    setShowDeliver(null); setDeliverUrl(""); setDeliverNote(""); await loadAll();
    openDetail({ ...task, deliverable_url: deliverUrl, deliverable_note: deliverNote });
  }

  // ═══ حفظ التقييم والفيدباك (للمدير) ═══
  async function saveRating() {
    if (!showRate) return;
    const t = showRate;
    const owner = t.assigned_to;
    const month = t.month || monthLabelOf();
    const rating = rateForm.rating === "" ? null : Number(rateForm.rating);
    const pos = rateForm.positive.trim();
    const neg = rateForm.negative.trim();
    const hadPos = !!(t.feedback_positive || "").trim();
    setSavingRate(true);

    const live = inWorkHours(workHours.start, workHours.end);

    await sb(`tasks?id=eq.${t.id}`, "PATCH", {
      rating,
      feedback_positive: pos || null,
      feedback_negative: neg || null,
      feedback_by: (pos || neg) ? user.name : null,
      feedback_at: (pos || neg) ? new Date().toISOString() : null,
      feedback_notify_pending: (pos || neg) && !live ? true : false,
    });

    // نقاط التقييم
    await replaceTaskScore({
      member: owner, month, source: "rating",
      points: rating ? SCORE.rating[rating] : 0,
      reason: rating ? `تقييم ${rating}/5: ${t.title}` : null,
      taskId: t.id, by: user.name,
    });

    // نقاط الفيدباك
    await replaceTaskScore({
      member: owner, month, source: "feedback_pos",
      points: pos ? SCORE.feedbackPos : 0,
      reason: pos ? `فيدباك إيجابي: ${t.title}` : null,
      taskId: t.id, by: user.name,
    });
    await replaceTaskScore({
      member: owner, month, source: "feedback_neg",
      points: neg ? SCORE.feedbackNeg : 0,
      reason: neg ? `فيدباك سلبي: ${t.title}` : null,
      taskId: t.id, by: user.name,
    });

    await addHistory(t.id, "rated", user.name,
      [rating ? `تقييم ${rating}/5` : null, pos ? "فيدباك إيجابي" : null, neg ? "فيدباك سلبي" : null].filter(Boolean).join(" · ") || "تم التعديل");

    // الإشعار — لحظي في وقت الشغل، وتاني يوم الصبح لو بره الوقت
    if (live) {
      if (pos) await addNotification(owner, `💙 المدير مبسوط من شغلك في: ${t.title}`, "info", t.id);
      if (neg) await addNotification(owner, `📌 المدير مش راضي عن «${t.title}» — حاول تحسّنها`, "info", t.id);
      if (rating && !pos && !neg) await addNotification(owner, `⭐ تقييم ${rating}/5 على: ${t.title}`, "info", t.id);
    }

    // الاحتفال: عند الفيدباك الإيجابي الجديد بس
    if (pos && !hadPos) setCelebrate(`فيدباك إيجابي لـ ${owner} 💙  +${SCORE.feedbackPos} نقطة`);

    setSavingRate(false);
    setShowRate(null);
    await loadAll();
    if (showDetail?.id === t.id) {
      openDetail({ ...t, rating, feedback_positive: pos || null, feedback_negative: neg || null, feedback_by: (pos || neg) ? user.name : null });
    }
  }

  // ═══ التسجيل الصوتي ═══
  function startListening() {
    setVoiceErr("");
    if (!speechSupported()) {
      setVoiceErr("المتصفح ده مش بيدعم التسجيل الصوتي. جربي Chrome أو Safari.");
      return;
    }
    const rec = createRecognizer();
    if (!rec) return;
    recRef.current = rec;
    let finalText = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += txt + " ";
        else interim += txt;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") setVoiceErr("المتصفح رفض الميكروفون — اسمحي بالوصول من إعدادات الموقع.");
      else if (e.error === "no-speech") setVoiceErr("مسمعتش أي كلام. جربي تاني.");
      else setVoiceErr("حصلت مشكلة في التسجيل: " + e.error);
    };
    rec.onend = () => setListening(false);

    setTranscript("");
    setParsed(null);
    setListening(true);
    try { rec.start(); } catch (err) { setListening(false); }
  }

  function stopListening() {
    try { recRef.current?.stop(); } catch (e) { /* تجاهل */ }
    setListening(false);
  }

  function analyzeVoice() {
    if (!transcript.trim()) { setVoiceErr("مفيش كلام اتسجل"); return; }
    setParsed(parseTranscript(transcript, { projects, members, taskTypes: TASK_TYPES }));
  }

  function applyVoice() {
    if (!parsed) return;
    // التاريخ اللي ظهر في «اللي فهمته» يتنقل كامل: اليوم والشهر والسنة
    const d = parsed.due_date || today;
    const dt = new Date(d + "T00:00:00");
    const monthOfDate = isNaN(dt) ? selectedMonth : `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
    setForm({
      ...emptyForm,
      title: parsed.title || "",
      project_id: parsed.project_id || "",
      assigned_to: parsed.assigned_to || user.name,
      task_type: parsed.task_type || "Keyword Research",
      priority: parsed.priority || "medium",
      task_date: d,
      due_date: d,
      notes: parsed.raw,
      month: monthOfDate,
    });
    setVoiceOpen(false);
    setTranscript(""); setParsed(null);
    setShowAdd(true);
  }

  async function deleteTask(taskId) {
    await sb(`task_history?task_id=eq.${taskId}`, "DELETE");
    await sb(`task_comments?task_id=eq.${taskId}`, "DELETE");
    await clearTaskScore(taskId);
    await sb(`tasks?id=eq.${taskId}`, "DELETE");
    setConfirmDelete(null); setShowDetail(null); await loadAll();
  }

  async function submitComment() {
    if (!newComment.trim() || !showDetail) return;
    await sb("task_comments", "POST", { task_id: showDetail.id, content: newComment, author: user.name });
    await addHistory(showDetail.id, "commented", user.name, newComment.slice(0,50));
    setNewComment(""); openDetail(showDetail);
  }

  const filtered = tasks.filter(t => {
    // الموظف يشوف تاسكاته بس · واللي عنده صلاحية إدارة التاسكات يشوف الفريق كله
    if (!canAssign && !isOnTask(t, user.name)) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssignee !== "all" && !isOnTask(t, filterAssignee)) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.assigned_to?.includes(search) && !parseHelpers(t.helpers).some(h => h.includes(search))) return false;
    return true;
  });

  const HelperPicker = ({ value, owner, onChange }) => {
    const list = value || [];
    const options = members.filter(m => m.name !== owner);
    return (
      <div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>🤝 مساعدون في التنفيذ (اختياري)</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>اضغطي على الاسم لإضافته أو إزالته — ممكن تختاري أكتر من واحد</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {options.length === 0 && <span style={{ fontSize: 12, color: "#94A3B8" }}>لا يوجد أعضاء آخرون</span>}
          {options.map(m => {
            const on = list.includes(m.name);
            return (
              <button key={m.id} type="button"
                onClick={() => onChange(on ? list.filter(x => x !== m.name) : [...list, m.name])}
                style={{
                  background: on ? "#7C3AED" : "#F8FAFC",
                  color: on ? "#FFFFFF" : "#64748B",
                  border: `1.5px solid ${on ? "#7C3AED" : "#E2E8F0"}`,
                  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: on ? 700 : 500,
                }}>
                {on ? "✓ " : "+ "}{m.name}
              </button>
            );
          })}
        </div>
        {list.length === 0 && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>مفيش مساعدين — التاسك للمسؤول الأساسي بس</div>}
      </div>
    );
  };

  const AttachList = ({ text }) => {
    const list = parseAttachments(text);
    if (!list.length) return null;
    return (
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8", marginBottom: 10 }}>🔗 الروابط والملفات ({list.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", borderRadius: 10, padding: "10px 14px", border: "1px solid #E2E8F0" }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{getFileIcon(item.url)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {item.isLink
                  ? <a href={item.url} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontSize: 13, fontWeight: 600, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name || item.url}</a>
                  : <span style={{ color: "#64748B", fontSize: 13 }}>{item.name || item.url}</span>
                }
              </div>
              {item.isLink && (
                <a href={item.url} target="_blank" rel="noreferrer" style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", padding: "4px 12px", borderRadius: 6, fontSize: 12, textDecoration: "none", flexShrink: 0, fontWeight: 600 }}>فتح ↗</a>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>📋 التاسكات</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
            {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
          </select>
          {canAssign && (
            <>
            <button onClick={() => { setTranscript(""); setParsed(null); setVoiceErr(""); setVoiceOpen(true); }}
              title="سجّلي التاسك بصوتك"
              style={{ background: "#F5F3FF", border: "1.5px solid #DDD6FE", color: "#7C3AED", padding: "8px 14px", borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
              🎤
            </button>
            <button onClick={() => { setForm(emptyForm); setShowAdd(true); }} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              + تاسك جديد
            </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث..." style={{ ...inp, flex: 1, minWidth: 150, padding: "8px 12px" }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 12 }}>
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        {canAssign && (
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 12 }}>
            <option value="all">الكل</option>
            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        )}
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 12 }}>
          <option value="all">كل الأولويات</option>
          {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([k,v]) => {
          const count = filtered.filter(t => t.status === k).length;
          if (!count) return null;
          return <span key={k} style={{ fontSize: 12, background: v.bg, color: v.color, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{v.icon} {v.label}: {count}</span>;
        })}
      </div>

      {/* Task List */}
      {loading
        ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>جاري التحميل...</div>
        : filtered.length === 0
          ? <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}><div style={{ fontSize: 40, marginBottom: 10 }}>📭</div><div>لا توجد تاسكات</div></div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(task => {
                const s = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;
                const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                const proj = projects.find(x => x.id === task.project_id);
                const isOverdue = task.due_date && task.due_date.slice(0,10) < today && task.status !== "completed" && task.status !== "cancelled";
                const attachCount = parseAttachments(task.attachments).length;
                return (
                  <div key={task.id} onClick={() => openDetail(task)} style={{ background: "#FFFFFF", border: `1px solid ${isOverdue ? "#FECACA" : "#E2E8F0"}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", borderRight: `4px solid ${s.color}`, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#0F172A" }}>{task.title}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 11, background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{s.label}</span>
                          <span style={{ fontSize: 11, color: p.color, fontWeight: 600 }}>{p.icon} {p.label}</span>
                          {proj && <span style={{ fontSize: 11, color: "#64748B" }}>📁 {proj.name}</span>}
                          <span style={{ fontSize: 11, color: "#64748B" }}>👤 {task.assigned_to}</span>
                          {task.total_minutes > 0 && (
                            <span style={{ fontSize: 11, color: "#64748B" }}>⏱ {fmtDur(task.total_minutes)}</span>
                          )}
                          {task.rating && (
                            <span style={{ fontSize: 11, background: SCORE.rating[task.rating] > 0 ? "#ECFDF5" : "#FEF2F2", color: SCORE.rating[task.rating] > 0 ? "#059669" : "#DC2626", border: `1px solid ${SCORE.rating[task.rating] > 0 ? "#A7F3D0" : "#FECACA"}`, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                              ★ {task.rating}
                            </span>
                          )}
                          {task.feedback_positive && <span style={{ fontSize: 11 }} title="فيدباك إيجابي">💙</span>}
                          {task.feedback_negative && <span style={{ fontSize: 11 }} title="محتاج تحسين">📌</span>}
                          {parseHelpers(task.helpers).length > 0 && (
                            <span style={{ fontSize: 11, background: "#F5F3FF", color: "#7C3AED", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                              🤝 {parseHelpers(task.helpers).join("، ")}
                            </span>
                          )}
                          {task.due_date && (
                            <span style={{ fontSize: 11, color: isOverdue ? "#DC2626" : "#64748B", fontWeight: isOverdue ? 700 : 400 }}>
                              📅 {formatDate(task.due_date)} ({getDayName(task.due_date.slice(0,10))}){isOverdue ? " 🔴" : ""}
                            </span>
                          )}
                          {task.shift_count > 0 && <span style={{ fontSize: 11, color: "#D97706" }}>⏩ {task.shift_count}x</span>}
                          {attachCount > 0 && <span style={{ fontSize: 11, color: "#2563EB" }}>🔗 {attachCount} رابط</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
      }

      {/* ADD TASK MODAL */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 560, maxHeight: "93vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>+ إنشاء تاسك جديد</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>عنوان التاسك *</div>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="اكتب عنوان التاسك..." style={{ ...inp, fontSize: 15 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الشهر</div>
                  <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} style={inp}>
                    {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>
                    اليوم {form.task_date && <span style={{ color: "#2563EB", fontSize: 11 }}>— {getDayName(form.task_date)}</span>}
                  </div>
                  <input type="date" value={form.task_date} onChange={e => setForm(f => ({ ...f, task_date: e.target.value, due_date: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>المشروع</div>
                  <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                    <option value="">بدون مشروع</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>نوع التاسك</div>
                  <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))} style={inp}>
                    {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>المسؤول الأساسي</div>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value, helpers: (f.helpers || []).filter(h => h !== e.target.value) }))} style={inp}>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الأولوية</div>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                    {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
              </div>
              <HelperPicker value={form.helpers} owner={form.assigned_to} onChange={v => setForm(f => ({ ...f, helpers: v }))} />
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>ملاحظات</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>كل سطر هيظهر كنقطة منفصلة</div>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="الصفحة الأولى&#10;الصفحة الثانية" rows={4} style={{ ...inp, resize: "vertical", lineHeight: 1.8 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>🔗 روابط وملفات</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
                  • رابط مباشر: https://...<br/>
                  • اسم مع رابط: <span style={{ color: "#2563EB" }}>اسم الملف | https://...</span>
                </div>
                <textarea value={form.attachments} onChange={e => setForm(f => ({ ...f, attachments: e.target.value }))}
                  placeholder={"Keyword Research Sheet | https://sheets.google.com/...\nhttps://docs.google.com/..."}
                  rows={4} style={{ ...inp, resize: "vertical", lineHeight: 2, fontSize: 13 }} />
              </div>
              <button onClick={addTask} disabled={saving} style={{ background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                {saving ? "جاري الحفظ..." : "إنشاء التاسك ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TASK DETAIL MODAL */}
      {showDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowDetail(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            {(() => {
              const s = STATUS_CONFIG[showDetail.status] || STATUS_CONFIG.todo;
              const p = PRIORITY_CONFIG[showDetail.priority] || PRIORITY_CONFIG.medium;
              const proj = projects.find(x => x.id === showDetail.project_id);
              const isOverdue = showDetail.due_date && showDetail.due_date.slice(0,10) < today && showDetail.status !== "completed";
              const detailHelpers = parseHelpers(showDetail.helpers);
              const canEdit = isAdmin || isOnTask(showDetail, user.name);
              return (
                <>
                  <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800, color: "#0F172A", paddingLeft: 30, lineHeight: 1.4 }}>{showDetail.title}</h2>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    <span style={{ fontSize: 12, background: s.bg, color: s.color, padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>{s.icon} {s.label}</span>
                    <span style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>{p.icon} {p.label}</span>
                    {proj && <span style={{ fontSize: 12, color: "#64748B" }}>📁 {proj.name}</span>}
                    <span style={{ fontSize: 12, color: "#64748B" }}>👤 {showDetail.assigned_to} <span style={{ fontSize: 10, color: "#94A3B8" }}>(مسؤول أساسي)</span></span>
                    {detailHelpers.map(h => (
                      <span key={h} style={{ fontSize: 12, background: "#F5F3FF", color: "#7C3AED", padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>🤝 {h}</span>
                    ))}
                    {showDetail.due_date && (
                      <span style={{ fontSize: 12, color: isOverdue ? "#DC2626" : "#64748B", fontWeight: isOverdue ? 700 : 400 }}>
                        📅 {formatDate(showDetail.due_date)} ({getDayName(showDetail.due_date.slice(0,10))}){isOverdue ? " 🔴" : ""}
                      </span>
                    )}
                    {showDetail.shift_count > 0 && <span style={{ fontSize: 12, color: "#D97706" }}>⏩ أُجّل {showDetail.shift_count}x</span>}
                  </div>

                  {/* Notes as bullet list */}
                  {showDetail.notes && (
                    <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 16px", marginBottom: 14, border: "1px solid #E2E8F0" }}>
                      {showDetail.notes.split("\n").filter(l => l.trim()).map((line, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                          <span style={{ color: "#2563EB", fontWeight: 800, flexShrink: 0, fontSize: 16, lineHeight: 1.4 }}>•</span>
                          <span style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{line.replace(/^[•\-\*]\s*/, "").trim()}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Attachments */}
                  <AttachList text={showDetail.attachments} />

                  {/* Actions */}
                  {canEdit && showDetail.status !== "completed" && showDetail.status !== "cancelled" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                      <button onClick={() => {
                        setEditForm({
                          title: showDetail.title, notes: showDetail.notes || "",
                          attachments: showDetail.attachments || "",
                          due_date: showDetail.due_date?.slice(0,10) || "",
                          priority: showDetail.priority, assigned_to: showDetail.assigned_to,
                          helpers: parseHelpers(showDetail.helpers),
                          task_type: showDetail.task_type,
                        });
                        setShowEdit(showDetail);
                      }} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>✏️ تعديل</button>

                      {showDetail.status === "todo" && <button onClick={() => updateStatus(showDetail, "in_progress")} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>⚡ ابدأ العمل</button>}
                      {showDetail.status === "in_progress" && <button onClick={() => updateStatus(showDetail, "pending_review")} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#D97706", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>👁 إرسال للمراجعة</button>}
                      {(showDetail.status === "in_progress" || showDetail.status === "pending_review" || showDetail.status === "needs_revision") && <button onClick={() => updateStatus(showDetail, "completed")} style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#059669", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>✅ مكتمل</button>}
                      {isAdmin && showDetail.status === "pending_review" && <button onClick={() => updateStatus(showDetail, "needs_revision")} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>🔁 محتاج تعديل</button>}
                      <button onClick={() => setShowShift(showDetail)} style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#D97706", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>⏩ تأجيل لغد</button>
                      <button onClick={() => setShowDeliver(showDetail)} style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#7C3AED", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>📎 Deliverable</button>
                    </div>
                  )}

                  {canAssign && <div style={{ marginBottom: 14 }}><button onClick={() => setConfirmDelete(showDetail)} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>🗑 حذف التاسك</button></div>}

                  {/* ═══ التقييم والفيدباك ═══ */}
                  {(showDetail.rating || showDetail.feedback_positive || showDetail.feedback_negative) && (
                    <div style={{ marginBottom: 14 }}>
                      {showDetail.rating && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>تقييم الإدارة:</span>
                          <span style={{ fontSize: 16, letterSpacing: 2 }}>{"★".repeat(showDetail.rating)}<span style={{ color: "#E2E8F0" }}>{"★".repeat(5 - showDetail.rating)}</span></span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: SCORE.rating[showDetail.rating] > 0 ? "#059669" : "#DC2626" }}>
                            {SCORE.rating[showDetail.rating] > 0 ? "+" : ""}{SCORE.rating[showDetail.rating]} نقطة
                          </span>
                        </div>
                      )}
                      {showDetail.feedback_positive && (
                        <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 3 }}>💙 فيدباك إيجابي</div>
                          <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{showDetail.feedback_positive}</div>
                        </div>
                      )}
                      {showDetail.feedback_negative && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 3 }}>📌 محتاج تحسين</div>
                          <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{showDetail.feedback_negative}</div>
                        </div>
                      )}
                      {showDetail.feedback_by && (
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>
                          بواسطة {showDetail.feedback_by}
                          {showDetail.feedback_at ? ` · ${new Date(showDetail.feedback_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}` : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {/* زرار التقييم — للمدير */}
                  {/* التايمر */}
                  {(showDetail.assigned_to === user.name || parseHelpers(showDetail.helpers).includes(user.name)) && showDetail.status !== "completed" && (
                    <div style={{ marginBottom: 14 }}>
                      <button onClick={() => toggleTimer(showDetail)}
                        style={{ width: "100%", background: (timer && String(timer.task_id) === String(showDetail.id)) ? "#FEF2F2" : "#ECFDF5", border: `1px solid ${(timer && String(timer.task_id) === String(showDetail.id)) ? "#FECACA" : "#A7F3D0"}`, color: (timer && String(timer.task_id) === String(showDetail.id)) ? "#DC2626" : "#059669", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
                        {(timer && String(timer.task_id) === String(showDetail.id)) ? "⏹ وقّفي الوقت" : "▶️ شغّلي الوقت"}
                      </button>
                      {showDetail.total_minutes > 0 && (
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 6, textAlign: "center" }}>
                          الوقت المسجّل على التاسك دي: <b style={{ color: "#0F172A" }}>{fmtDur(showDetail.total_minutes)}</b>
                        </div>
                      )}
                    </div>
                  )}

                  {isAdmin && (
                    <div style={{ marginBottom: 14 }}>
                      <button onClick={() => {
                        setRateForm({
                          rating: showDetail.rating ? String(showDetail.rating) : "",
                          positive: showDetail.feedback_positive || "",
                          negative: showDetail.feedback_negative || "",
                        });
                        setShowRate(showDetail);
                      }} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, width: "100%" }}>
                        ⭐ {(showDetail.rating || showDetail.feedback_positive || showDetail.feedback_negative) ? "تعديل التقييم والفيدباك" : "تقييم وفيدباك"}
                      </button>
                    </div>
                  )}

                  {(showDetail.deliverable_url || showDetail.deliverable_note) && (
                    <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12, padding: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6 }}>📎 Deliverable</div>
                      {showDetail.deliverable_url && <a href={showDetail.deliverable_url} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontSize: 13 }}>🔗 {showDetail.deliverable_url}</a>}
                      {showDetail.deliverable_note && <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{showDetail.deliverable_note}</p>}
                    </div>
                  )}

                  {history.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#64748B" }}>📜 سجل التاسك</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 150, overflowY: "auto" }}>
                        {history.map(h => (
                          <div key={h.id} style={{ fontSize: 12, color: "#64748B", background: "#F8FAFC", borderRadius: 8, padding: "6px 10px", border: "1px solid #F1F5F9" }}>
                            <span style={{ color: "#2563EB", fontWeight: 600 }}>{h.performed_by}</span> — {h.details || h.action}
                            <span style={{ float: "left", fontSize: 10, color: "#94A3B8" }}>{new Date(h.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#0F172A" }}>💬 التعليقات</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10, maxHeight: 200, overflowY: "auto" }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ background: c.author === user.name ? "#EFF6FF" : "#F8FAFC", borderRadius: 10, padding: "8px 12px", borderRight: c.author === user.name ? "3px solid #2563EB" : "3px solid #E2E8F0" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", marginBottom: 3 }}>{c.author}</div>
                          <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.5 }}>{c.content}</div>
                        </div>
                      ))}
                      {comments.length === 0 && <div style={{ fontSize: 13, color: "#94A3B8" }}>لا توجد تعليقات بعد</div>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === "Enter" && submitComment()} placeholder="اكتب تعليق..." style={{ ...inp, flex: 1, padding: "8px 12px", fontSize: 13 }} />
                      <button onClick={submitComment} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>إرسال</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {showEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowEdit(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowEdit(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✏️ تعديل التاسك</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>عنوان التاسك</div>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} style={inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>المسؤول الأساسي</div>
                  <select value={editForm.assigned_to} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value, helpers: (f.helpers || []).filter(h => h !== e.target.value) }))} style={inp}>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الأولوية</div>
                  <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                    {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
              </div>
              <HelperPicker value={editForm.helpers} owner={editForm.assigned_to} onChange={v => setEditForm(f => ({ ...f, helpers: v }))} />
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>
                  الديدلاين {editForm.due_date && <span style={{ color: "#2563EB" }}>— {getDayName(editForm.due_date)}</span>}
                </div>
                <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} style={inp} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>نوع التاسك</div>
                <select value={editForm.task_type} onChange={e => setEditForm(f => ({ ...f, task_type: e.target.value }))} style={inp}>
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>ملاحظات</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>كل سطر هيظهر كنقطة منفصلة</div>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical", lineHeight: 1.8 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>🔗 روابط وملفات</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>اسم الملف | https://...</div>
                <textarea value={editForm.attachments} onChange={e => setEditForm(f => ({ ...f, attachments: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical", lineHeight: 2, fontSize: 13 }} />
              </div>
              <button onClick={saveEdit} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                حفظ التعديلات ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>حذف التاسك؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>"{confirmDelete.title}"<br/>مش هترجع بعد الحذف</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => deleteTask(confirmDelete.id)} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>حذف نهائي</button>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT MODAL */}
      {showShift && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FED7AA", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#0F172A" }}>⏩ تأجيل التاسك</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>{showShift.title}</p>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>سبب التأجيل</div>
            <select value={shiftReason} onChange={e => setShiftReason(e.target.value)} style={{ ...inp, marginBottom: 16 }}>
              <option value="">اختر السبب</option>
              {SHIFT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => shiftTask(showShift)} style={{ flex: 1, background: "linear-gradient(135deg,#F97316,#EA580C)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>تأكيد التأجيل</button>
              <button onClick={() => setShowShift(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* DELAY MODAL */}
      {showDelay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#0F172A" }}>🔴 التاسك متأخرة</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>ليه التاسك اتأخرت عن الديدلاين؟</p>
            <select value={delayReason} onChange={e => setDelayReason(e.target.value)} style={{ ...inp, marginBottom: 16 }}>
              <option value="">اختر السبب</option>
              {DELAY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => confirmComplete(showDelay)} style={{ flex: 1, background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>تأكيد الإتمام</button>
              <button onClick={() => setShowDelay(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* DELIVERABLE MODAL */}
      {showDeliver && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #DDD6FE", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#0F172A" }}>📎 إضافة Deliverable</h3>
            <input value={deliverUrl} onChange={e => setDeliverUrl(e.target.value)} placeholder="رابط (Google Sheet, Doc...)" style={{ ...inp, marginBottom: 10 }} />
            <textarea value={deliverNote} onChange={e => setDeliverNote(e.target.value)} placeholder="ملاحظة أو وصف ما تم..." rows={3} style={{ ...inp, marginBottom: 16, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => addDeliverable(showDeliver)} style={{ flex: 1, background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>إضافة</button>
              <button onClick={() => setShowDeliver(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: التقييم والفيدباك ═══ */}
      {showRate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowRate(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowRate(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>⭐ تقييم وفيدباك</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>{showRate.title} · {showRate.assigned_to}</div>

            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#D97706", marginBottom: 16, lineHeight: 1.6 }}>
              ⚠️ التقييم والفيدباك <b>بيظهروا لكل الفريق</b>، وبيأثروا على رصيد النقاط على طول.
            </div>

            {/* التقييم */}
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600 }}>
              التقييم <span style={{ color: "#94A3B8", fontWeight: 400 }}>— اختياري، مش لازم كل تاسك</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <button type="button" onClick={() => setRateForm(f => ({ ...f, rating: "" }))}
                style={{ padding: "8px 12px", borderRadius: 10, border: `2px solid ${rateForm.rating === "" ? "#64748B" : "#E2E8F0"}`, background: rateForm.rating === "" ? "#F1F5F9" : "#F8FAFC", color: "#64748B", fontSize: 12, fontWeight: rateForm.rating === "" ? 700 : 500 }}>
                بدون
              </button>
              {[1, 2, 3, 4, 5].map(n => {
                const on = String(n) === rateForm.rating;
                const pts = SCORE.rating[n];
                const good = pts > 0;
                return (
                  <button key={n} type="button" onClick={() => setRateForm(f => ({ ...f, rating: String(n) }))}
                    style={{ padding: "8px 10px", borderRadius: 10, border: `2px solid ${on ? (good ? "#059669" : "#DC2626") : "#E2E8F0"}`, background: on ? (good ? "#ECFDF5" : "#FEF2F2") : "#F8FAFC", color: on ? (good ? "#059669" : "#DC2626") : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500, minWidth: 56 }}>
                    <div style={{ fontSize: 13 }}>{"★".repeat(n)}</div>
                    <div style={{ fontSize: 10, marginTop: 2 }}>{pts > 0 ? `+${pts}` : pts}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 16 }}>5 = +2 · 4 = +1 · 3 = −1 · 2 = −2 · 1 = −3</div>

            {/* الفيدباك الإيجابي */}
            <div style={{ fontSize: 12, color: "#059669", marginBottom: 4, fontWeight: 700 }}>💙 فيدباك إيجابي <span style={{ color: "#94A3B8", fontWeight: 400 }}>(+{SCORE.feedbackPos})</span></div>
            <textarea value={rateForm.positive} onChange={e => setRateForm(f => ({ ...f, positive: e.target.value }))} rows={2}
              placeholder="اللي عجبك في الشغل ده..." style={{ ...inp, marginBottom: 14, resize: "vertical" }} />

            {/* الفيدباك السلبي */}
            <div style={{ fontSize: 12, color: "#D97706", marginBottom: 4, fontWeight: 700 }}>📌 محتاج تحسين <span style={{ color: "#94A3B8", fontWeight: 400 }}>({SCORE.feedbackNeg})</span></div>
            <textarea value={rateForm.negative} onChange={e => setRateForm(f => ({ ...f, negative: e.target.value }))} rows={2}
              placeholder="اللي محتاج يتحسن — بصياغة واضحة عن الشغل..." style={{ ...inp, marginBottom: 14, resize: "vertical" }} />

            {!inWorkHours(workHours.start, workHours.end) && (rateForm.positive.trim() || rateForm.negative.trim()) && (
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#2563EB", marginBottom: 14, lineHeight: 1.6 }}>
                🌙 إحنا بره وقت الشغل ({workHours.start}:00 – {workHours.end}:00) — الإشعار هيوصله <b>تاني يوم الصبح</b> مش دلوقتي.
              </div>
            )}

            <button onClick={saveRating} disabled={savingRate}
              style={{ width: "100%", background: savingRate ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
              {savingRate ? "جاري الحفظ..." : "حفظ ✓"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ شريط التايمر ═══ */}
      {timer && (
        <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 14, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>⏱</span>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>التايمر شغال</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{timer.task_title}</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
            {fmtClock(Math.floor((Date.now() - new Date(timer.started_at)) / 1000) + tick * 0)}
          </div>
          <button onClick={() => toggleTimer({ id: timer.task_id, title: timer.task_title })}
            style={{ background: "#DC2626", color: "#fff", padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>⏹ إيقاف</button>
        </div>
      )}

      {nudge && !timer && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 14, padding: "11px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>⏱</span>
          <span style={{ flex: 1, minWidth: 150, fontSize: 13, color: "#D97706", fontWeight: 600 }}>ماتنساش تشغّل الوقت على التاسك اللي شغال عليها</span>
          <button onClick={() => setNudge(false)} style={{ background: "none", color: "#94A3B8", fontSize: 12 }}>إخفاء</button>
        </div>
      )}

      {/* ═══ MODAL: التسجيل الصوتي ═══ */}
      {voiceOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && !listening && setVoiceOpen(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => { stopListening(); setVoiceOpen(false); }} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>🎤 تاسك بالصوت</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18, lineHeight: 1.7 }}>
              اتكلمي عادي بالمصري. مثال: «ضيفي لمريم في إيفست تعديل صفحات الإنجليزي، أولوية عالية، تسليم الأربع»
            </div>

            {/* زرار التسجيل */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <button onClick={listening ? stopListening : startListening}
                style={{
                  width: 84, height: 84, borderRadius: "50%",
                  background: listening ? "linear-gradient(135deg,#EF4444,#DC2626)" : "linear-gradient(135deg,#7C3AED,#2563EB)",
                  color: "#fff", fontSize: 32, border: "none",
                  boxShadow: listening ? "0 0 0 8px rgba(239,68,68,0.15)" : "0 4px 14px rgba(124,58,237,0.3)",
                }}>
                {listening ? "⏹" : "🎤"}
              </button>
              <div style={{ fontSize: 13, color: listening ? "#DC2626" : "#64748B", marginTop: 10, fontWeight: listening ? 700 : 500 }}>
                {listening ? "بسمعك... اضغطي لما تخلصي" : "اضغطي وابدأي الكلام"}
              </div>
            </div>

            {voiceErr && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#DC2626", marginBottom: 14, lineHeight: 1.6 }}>
                ⚠️ {voiceErr}
              </div>
            )}

            {/* النص */}
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>الكلام المكتوب <span style={{ color: "#94A3B8", fontWeight: 400 }}>— تقدري تعدّليه</span></div>
            <textarea value={transcript} onChange={e => { setTranscript(e.target.value); setParsed(null); }} rows={3}
              placeholder="هيظهر هنا وإنتي بتتكلمي..." style={{ ...inp, resize: "vertical", marginBottom: 12 }} />

            {!parsed ? (
              <button onClick={analyzeVoice} disabled={!transcript.trim() || listening}
                style={{ width: "100%", background: (!transcript.trim() || listening) ? "#CBD5E1" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                حلّلي الكلام ←
              </button>
            ) : (
              <>
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 10 }}>اللي فهمته</div>
                  {[
                    { l: "المشروع", v: parsed.project_name, ok: parsed.matched.project },
                    { l: "المسؤول", v: parsed.assigned_to, ok: parsed.matched.member },
                    { l: "نوع التاسك", v: parsed.task_type, ok: parsed.matched.type },
                    { l: "الأولوية", v: parsed.priority ? PRIORITY_CONFIG[parsed.priority]?.label : null, ok: parsed.matched.priority },
                    { l: "الميعاد", v: parsed.due_date ? formatDate(parsed.due_date) : null, ok: parsed.matched.date },
                  ].map(x => (
                    <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #E2E8F0" }}>
                      <span style={{ fontSize: 13 }}>{x.ok ? "✅" : "⚪"}</span>
                      <span style={{ fontSize: 12, color: "#64748B", minWidth: 70 }}>{x.l}</span>
                      <span style={{ fontSize: 13, fontWeight: x.ok ? 700 : 400, color: x.ok ? "#0F172A" : "#94A3B8" }}>
                        {x.v || "مش متحدد — هتختاريه بنفسك"}
                      </span>
                    </div>
                  ))}
                  <div style={{ paddingTop: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748B", marginBottom: 3 }}>العنوان</div>
                    <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{parsed.title}</div>
                  </div>
                </div>

                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#2563EB", marginBottom: 14, lineHeight: 1.6 }}>
                  💡 مش هيتحفظ دلوقتي — هتتفتحلك نافذة التاسك متملية وإنتي تراجعي وتعدّلي وتحفظي.
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={applyVoice}
                    style={{ flex: 1, background: "linear-gradient(135deg,#059669,#047857)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                    افتحي التاسك ✓
                  </button>
                  <button onClick={() => { setParsed(null); setTranscript(""); }}
                    style={{ background: "#F1F5F9", color: "#64748B", padding: "13px 18px", borderRadius: 10, fontSize: 14 }}>
                    تاني
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ الاحتفال ═══ */}
      {celebrate && (
        <div onClick={() => setCelebrate(null)}
          style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "auto", background: "rgba(15,23,42,0.25)" }}>
          <style>{`
            @keyframes smFly {
              0%   { transform: translate(0,0) scale(0.4) rotate(0deg); opacity: 0; }
              15%  { opacity: 1; }
              100% { transform: translate(var(--dx), var(--dy)) scale(1.15) rotate(var(--rot)); opacity: 0; }
            }
            @keyframes smPop {
              0%   { transform: scale(0.7); opacity: 0; }
              50%  { transform: scale(1.04); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>
          {["🎉","⭐","💙","✨","🎊","🏆","👏","💫","🌟","🎈","✅","💪"].map((emo, i) => {
            const ang = (i / 12) * Math.PI * 2;
            return (
              <span key={i} style={{
                position: "absolute", fontSize: 30, left: "50%", top: "50%",
                "--dx": `${Math.cos(ang) * 220}px`,
                "--dy": `${Math.sin(ang) * 200}px`,
                "--rot": `${(i % 2 ? 1 : -1) * 240}deg`,
                animation: `smFly 1.5s ease-out ${i * 0.05}s forwards`,
              }}>{emo}</span>
            );
          })}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: "24px 32px", textAlign: "center", boxShadow: "0 12px 40px rgba(15,23,42,0.2)", animation: "smPop 0.4s ease-out forwards", maxWidth: 320 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", lineHeight: 1.7 }}>{celebrate}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>اضغطي في أي حتة للإخفاء</div>
          </div>
        </div>
      )}

    </div>
  );
}
