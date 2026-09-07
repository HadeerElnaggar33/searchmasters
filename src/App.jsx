import { useState, useEffect, useRef } from "react";
import { sb, timeAgo, CURRENT_MONTH } from "./supabase.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Tasks from "./pages/Tasks.jsx";
import Projects from "./pages/Projects.jsx";
import Team from "./pages/Team.jsx";
import Reports from "./pages/Reports.jsx";
import Attendance from "./pages/Attendance.jsx";
import Calendar from "./pages/Calendar.jsx";
import Templates from "./pages/Templates.jsx";
import Workload from "./pages/Workload.jsx";
import Notifications from "./pages/Notifications.jsx";
import SeoChecklist from "./pages/SeoChecklist.jsx";
import EmployeeOfMonth from "./pages/EmployeeOfMonth.jsx";
import Feedback from "./pages/Feedback.jsx";
import Settings from "./pages/Settings.jsx";
import Leaves from "./pages/Leaves.jsx";
import Hours from "./pages/Hours.jsx";
import Score from "./pages/Score.jsx";
import Mood from "./pages/Mood.jsx";
import Badges from "./pages/Badges.jsx";
import Draws, { DrawPopup } from "./pages/Draws.jsx";
import Live from "./pages/Live.jsx";
import TabHub from "./pages/TabHub.jsx";
import { runRecurringEngine } from "./recurring.js";
import { runMotivation } from "./motivation.js";
import { heartbeat, activeTimers, stopTimer, fmtClock } from "./timer.js";

const ITEMS = {
  dashboard:     { icon: "🏠", label: "الرئيسية" },
  mood:          { icon: "☀️", label: "مودك النهارده" },
  notifications: { icon: "🔔", label: "الإشعارات" },
  tasks:         { icon: "📋", label: "التاسكات" },
  attendance:    { icon: "⏰", label: "الحضور والساعات" },
  attendanceMe:  { icon: "⏰", label: "حضوري وساعاتي", page: "attendance" },
  attendanceTeam:{ icon: "🗓", label: "حضور وساعات الفريق", page: "attendance" },
  projects:      { icon: "📁", label: "المشاريع" },
  team:          { icon: "👥", label: "الفريق" },
  training:      { icon: "🎓", label: "نتعلم سوا", soon: true },
  leaves:        { icon: "🏖", label: "الإجازات" },
  feedback:      { icon: "💬", label: "الملاحظات" },
  reports:       { icon: "📊", label: "التقارير" },
  seo:           { icon: "🔍", label: "SEO Audit" },
  score:         { icon: "⭐", label: "رصيدي" },
  eom:           { icon: "🏆", label: "موظف الشهر" },
  draws:         { icon: "🎁", label: "جوائز عشوائية" },
  settings:      { icon: "🎛", label: "الكنترول" },
};

// أقسام المدير
const NAV_ADMIN = [
  { title: "يومك",           items: ["mood", "notifications", "tasks", "attendanceMe"] },
  { title: "ورشة الشغل",     items: ["projects", "team", "training"] },
  { title: "دفتر الفريق",    items: ["attendanceTeam", "leaves", "feedback"] },
  { title: "حصاد الشهر",     items: ["reports", "seo"] },
  { title: "شنطة الجوايز",   items: ["score", "eom", "draws"] },
  { title: "غرفة العمليات",  items: ["settings"] },
];

// أقسام العضو
const NAV_MEMBER = [
  { title: "يومك",         items: ["mood", "notifications", "tasks"] },
  { title: "بتاعي أنا",    items: ["attendance", "leaves", "feedback"] },
  { title: "شنطة الجوايز", items: ["score", "eom", "draws"] },
  { title: "شغلي",         items: ["projects", "training"] },
  { title: "حصاد الشهر",   items: ["reports", "seo"] },
];

const MOBILE_NAV = ["dashboard", "tasks", "projects", "score", "notifications"];

function useIsMobile() {
  const [v, setV] = useState(() => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setV(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return v;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { const u = localStorage.getItem("sm_user"); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [showSidebar, setShowSidebar] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const isMobile = useIsMobile();
  const pollRef = useRef();
  const engineRef = useRef(false);
  const [voiceTrigger, setVoiceTrigger] = useState(0);
  const [taskFilter, setTaskFilter] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [navCollapsed, setNavCollapsed] = useState(() => { try { return localStorage.getItem("sm_nav_collapsed") === "1"; } catch (e) { return false; } });
  const [closedSections, setClosedSections] = useState(() => { try { return JSON.parse(localStorage.getItem("sm_nav_sections") || "[]"); } catch (e) { return []; } });
  const [pinned, setPinned] = useState(() => { try { return JSON.parse(localStorage.getItem("sm_nav_pinned") || "[]"); } catch (e) { return []; } });
  const [counts, setCounts] = useState({});
  const [timers, setTimers] = useState([]);
  // مؤقت العمل (الحضور) — تعديل ٣
  const [work, setWork] = useState({ record: null, open: null, doneMins: 0 });
  const [workBusy, setWorkBusy] = useState(false);
  const [, setTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchData, setSearchData] = useState({ tasks: [], projects: [], members: [] });

  useEffect(() => {
    if (!user) return;
    loadNotifs();
    pollRef.current = setInterval(loadNotifs, 10000);
    return () => clearInterval(pollRef.current);
  }, [user]);

  // ── تعديل ٣: مؤقت العمل في البار العلوي ──
  const todayStr = new Date().toISOString().slice(0, 10);

  async function loadWork() {
    if (!user) return;
    const [att, sess] = await Promise.all([
      sb(`attendance?member_name=eq.${encodeURIComponent(user.name)}&date=eq.${todayStr}`),
      sb(`attendance_sessions?member_name=eq.${encodeURIComponent(user.name)}&date=eq.${todayStr}`),
    ]);
    const record = att && att[0] ? att[0] : null;
    const list = sess || [];
    const open = list.find(x => !x.end_time) || null;
    const doneMins = list.reduce((a, x) => a + (Number(x.duration_minutes) || 0), 0);
    setWork({ record, open, doneMins });
  }

  useEffect(() => {
    if (!user) return;
    loadWork();
    const t = setInterval(loadWork, 30000);
    return () => clearInterval(t);
  }, [user, page]);

  useEffect(() => {
    if (!work.open) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [work.open]);

  async function startWork() {
    if (work.record || workBusy) return;
    setWorkBusy(true);
    const now = new Date().toISOString();
    const att = await sb("attendance", "POST", { member_name: user.name, date: todayStr, clock_in: now, status: "present" });
    if (att && att[0]) {
      await sb("attendance_sessions", "POST", { attendance_id: att[0].id, member_name: user.name, date: todayStr, start_time: now, type: "work" });
    }
    setWorkBusy(false);
    await loadWork();
  }

  async function pauseWork() {
    if (!work.open || workBusy) return;
    setWorkBusy(true);
    const now = new Date();
    const mins = Math.floor((now - new Date(work.open.start_time)) / 60000);
    await sb(`attendance_sessions?id=eq.${work.open.id}`, "PATCH", { end_time: now.toISOString(), duration_minutes: mins });
    setWorkBusy(false);
    await loadWork();
  }

  async function resumeWork() {
    if (!work.record || work.open || workBusy) return;
    setWorkBusy(true);
    const now = new Date().toISOString();
    await sb("attendance_sessions", "POST", { attendance_id: work.record.id, member_name: user.name, date: todayStr, start_time: now, type: "work" });
    setWorkBusy(false);
    await loadWork();
  }

  // الرجوع للشغل بعد ما اتقفل اليوم بالغلط أو عشان استكمال
  async function reopenWork() {
    if (!work.record || workBusy) return;
    setWorkBusy(true);
    const now = new Date().toISOString();
    await sb(`attendance?id=eq.${work.record.id}`, "PATCH", { clock_out: null });
    await sb("attendance_sessions", "POST", {
      attendance_id: work.record.id, member_name: user.name, date: todayStr, start_time: now, type: "work",
    });
    setWorkBusy(false);
    await loadWork();
  }

  async function endWork() {
    if (!work.record || workBusy) return;
    setWorkBusy(true);
    const now = new Date();
    if (work.open) {
      const mins = Math.floor((now - new Date(work.open.start_time)) / 60000);
      await sb(`attendance_sessions?id=eq.${work.open.id}`, "PATCH", { end_time: now.toISOString(), duration_minutes: mins });
    }
    const all = await sb(`attendance_sessions?attendance_id=eq.${work.record.id}`);
    const total = (all || []).reduce((a, x) => a + (Number(x.duration_minutes) || 0), 0);
    await sb(`attendance?id=eq.${work.record.id}`, "PATCH", { clock_out: now.toISOString(), working_minutes: total });
    setWorkBusy(false);
    await loadWork();
  }

  // ── تايمرات التاسكات (متوازية) — بتظهر في سايدبار ثابت ──
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const rows = isAdmin
          ? (await sb("task_timers?ended_at=is.null&order=started_at.desc")) || []
          : await activeTimers(user.name);
        setTimers(rows);
      } catch (e) { /* تجاهل */ }
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user, page]);

  useEffect(() => {
    if (timers.length === 0) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [timers.length]);

  async function stopOneTimer(taskId) {
    await stopTimer(user.name, taskId);   // كل واحد بيوقف تايمره بس
    setTimers(list => list.filter(x => String(x.task_id) !== String(taskId)));
  }

  // ── تعديل ٥: البحث السريع ──
  async function openSearch() {
    setSearchOpen(true);
    if (searchData.tasks.length === 0) {
      const [t, p, m] = await Promise.all([
        sb(`tasks?month=eq.${encodeURIComponent(CURRENT_MONTH)}&select=id,title,assigned_to,status,project_id`),
        sb("projects?select=id,name,client_name"),
        sb("team_members?is_active=eq.true&select=id,name,job_title"),
      ]);
      setSearchData({ tasks: t || [], projects: p || [], members: m || [] });
    }
  }

  function searchResults() {
    const s2 = q.trim().toLowerCase();
    if (s2.length < 2) return { tasks: [], projects: [], members: [] };
    const hit = v => String(v || "").toLowerCase().includes(s2);
    return {
      tasks: searchData.tasks.filter(t => hit(t.title) || hit(t.assigned_to)).slice(0, 6),
      projects: searchData.projects.filter(p => hit(p.name) || hit(p.client_name)).slice(0, 5),
      members: searchData.members.filter(m => hit(m.name) || hit(m.job_title)).slice(0, 5),
    };
  }

  function goTo(target) {
    setSearchOpen(false); setQ("");
    setPage(target);
  }

  // ── نبضة التواجد: بتتحدث كل دقيقتين طول ما الأداة مفتوحة ──
  useEffect(() => {
    if (!user) return;
    heartbeat(user.name);
    const t = setInterval(() => heartbeat(user.name), 120000);
    return () => clearInterval(t);
  }, [user]);

  // ── المود اليومي: يفتح مرة واحدة بس في اليوم ──
  useEffect(() => {
    if (!user) return;
    const key = `sm_mood_${user.name}_${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    const d = new Date().getDay();
    if (d === 5 || d === 6) return;   // الجمعة والسبت
    setPage("mood");
  }, [user]);

  // ── محرك التاسكات المتكررة: مرة واحدة كل جلسة، بعد فتح الأبلكيشن ──
  useEffect(() => {
    if (!user || engineRef.current) return;
    engineRef.current = true;
    const key = "sm_recurring_" + new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key)) return;
    const t = setTimeout(async () => {
      await runMotivation(user.name);
      const res = await runRecurringEngine(user.name);
      if (res && !res.error) {
        localStorage.setItem(key, "1");
        if (res.created > 0) loadNotifs();
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [user]);

  async function loadNotifs() {
    if (!user) return;
    const n = await sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&order=created_at.desc&limit=15`);
    if (n) { setNotifs(n); setNotifCount(n.filter(x => !x.is_read).length); }
  }

  async function markAllRead() {
    if (!user) return;
    await sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&is_read=eq.false`, "PATCH", { is_read: true });
    setNotifCount(0);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  function logout() { localStorage.removeItem("sm_user"); setUser(null); }

  if (!user) return <Login onLogin={u => setUser(u)} />;

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const PAGES = {
    dashboard:  <Dashboard  user={user} onNavigate={(p, f) => {
      if (f) {
        setTaskFilter({ ...f, _k: Date.now() });
        if (f.openTask) setOpenTaskId({ id: f.openTask, k: Date.now() });
      }
      setPage(p);
    }} />,
    tasks: <TabHub id="tasks" user={user} tabs={[
      { v: "list",     l: "📋 قائمة",  render: () => <Tasks user={user} voiceTrigger={voiceTrigger} incomingFilter={taskFilter} openTaskId={openTaskId} /> },
      { v: "calendar", l: "🗓 تقويم",  render: () => <Calendar user={user} /> },
      { v: "templates",l: "⚡ قوالب",  render: () => <Templates user={user} /> },
    ]} />,
    projects:   <Projects   user={user} />,
    team: <TabHub id="team" user={user} title="👥 الفريق" tabs={[
      { v: "members",  l: "👥 الأعضاء",       render: () => <Team user={user} /> },
      { v: "workload", l: "⚖️ توزيع العمل",   render: () => <Workload user={user} /> },
      { v: "live",     l: "👁 متابعة مباشرة", render: () => <Live user={user} /> },
    ]} />,
    reports:    <Reports    user={user} />,
    attendance: <TabHub id="att" user={user} title={isAdmin ? "⏰ حضوري وساعاتي" : "⏰ الحضور والساعات"} tabs={[
      { v: "att",   l: "⏰ الحضور",  render: () => <Attendance user={user} /> },
      { v: "hours", l: "⏱ الساعات", render: () => <Hours user={user} /> },
    ]} />,
    calendar:   <Calendar   user={user} />,
    templates:  <Templates  user={user} />,
    workload:   <Workload   user={user} />,
    seo:        <SeoChecklist user={user} />,
    eom:        <EmployeeOfMonth user={user} />,
    feedback:   <Feedback user={user} />,
    settings:   <Settings user={user} />,
    leaves:     <Leaves user={user} />,
    hours:      <Hours user={user} />,
    score: <TabHub id="score" user={user} title="⭐ رصيدي" tabs={[
      { v: "points", l: "⭐ النقاط",     render: () => <Score user={user} /> },
      { v: "medals", l: "🏅 ميدالياتي", render: () => <Badges user={user} /> },
    ]} />,
    mood:       <Mood user={user} onDone={() => setPage("dashboard")} />,
    badges:     <Badges user={user} />,
    draws:      <Draws user={user} />,
    live:       <Live user={user} />,
    notifications: <Notifications user={user} onOpenItem={n => {
      if (n.related_task_id) { setOpenTaskId({ id: n.related_task_id, k: Date.now() }); setTaskFilter({ status: "all", _k: Date.now() }); setPage("tasks"); }
    }} />,
  };

  const sections = isAdmin ? NAV_ADMIN : NAV_MEMBER;

  function toggleSection(t) {
    setClosedSections(prev => {
      const next = prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t];
      try { localStorage.setItem("sm_nav_sections", JSON.stringify(next)); } catch (e) { /* */ }
      return next;
    });
  }
  function togglePin(key) {
    setPinned(prev => {
      const next = prev.includes(key) ? prev.filter(x => x !== key) : (prev.length >= 5 ? prev : [...prev, key]);
      try { localStorage.setItem("sm_nav_pinned", JSON.stringify(next)); } catch (e) { /* */ }
      return next;
    });
  }
  function toggleCollapse() {
    setNavCollapsed(v => {
      try { localStorage.setItem("sm_nav_collapsed", v ? "0" : "1"); } catch (e) { /* */ }
      return !v;
    });
  }

  // ── تعديل ١٠: أرقام على بنود القائمة ──
  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function loadCounts() {
      try {
        const mm = String(new Date().getMonth() + 1).padStart(2, "0");
        const yy = new Date().getFullYear();
        const [tk, nt, lg, dw, att, hr, fb, lv] = await Promise.all([
          sb(`tasks?month=eq.${encodeURIComponent(CURRENT_MONTH)}&select=assigned_to,status,is_parent`),
          sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&is_read=eq.false&select=id`),
          sb(`score_ledger?month=eq.${encodeURIComponent(CURRENT_MONTH)}&member_name=eq.${encodeURIComponent(user.name)}&select=points`),
          sb(`draws?status=eq.won&winner_name=eq.${encodeURIComponent(user.name)}&select=id`),
          sb(`attendance?member_name=eq.${encodeURIComponent(user.name)}&date=gte.${yy}-${mm}-01&select=working_minutes,status`),
          sb(`help_requests?helper=eq.${encodeURIComponent(user.name)}&status=eq.open&select=id`),
          sb(`feedback_notes?member_name=eq.${encodeURIComponent(user.name)}&acknowledged=eq.false&select=id`),
          sb("leave_requests?status=eq.pending&select=id"),
        ]);
        if (!alive) return;
        const mine = (tk || []).filter(t => t.assigned_to === user.name && t.status !== "completed" && t.status !== "cancelled" && !t.is_parent);
        const mins = (att || []).filter(a => a.status !== "leave").reduce((a, x) => a + (Number(x.working_minutes) || 0), 0);
        setCounts({
          tasks: mine.length,
          notifications: (nt || []).length,
          score: Math.round((lg || []).reduce((a, r) => a + Number(r.points || 0), 0) * 10) / 10,
          draws: (dw || []).length,
          attendance: Math.round(mins / 60),
          help: (hr || []).length,
          feedback: (fb || []).length,
          leaves: (lv || []).length,
        });
      } catch (e) { /* تجاهل */ }
    }
    loadCounts();
    const t = setInterval(loadCounts, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [user, page]);

  // أرقام التنبيه تختفي عند الصفر · أرقام التحفيز بتفضل ظاهرة
  function badgeOf(key) {
    const alert = { notifications: counts.notifications, feedback: counts.feedback, leaves: isAdmin ? counts.leaves : 0, tasks: counts.tasks };
    const always = { score: counts.score, draws: counts.draws, attendance: counts.attendance, attendanceMe: counts.attendance, attendanceTeam: null };
    if (key in alert) {
      const v = alert[key];
      return v > 0 ? { v, alert: true } : null;
    }
    if (key in always && always[key] !== null && always[key] !== undefined) {
      return { v: always[key], alert: false };
    }
    return null;
  }

  // Shared styles
  const S = {
    navBtn: (active) => ({
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", borderRadius: 10, marginBottom: 2,
      background: active ? "#2563EB" : "transparent",
      border: active ? "none" : "1px solid transparent",
      color: active ? "#FFFFFF" : "#64748B",
      fontSize: 13, fontWeight: active ? 700 : 500,
      textAlign: "right", cursor: "pointer",
      transition: "all 0.15s",
    }),
  };

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, flexShrink: 0, color: "#fff" }}>S</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Search Masters</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Workspace · {CURRENT_MONTH}</div>
          </div>
        </div>
      </div>

      {/* زرار طي القائمة (تعديل ٨) */}
      <button onClick={toggleCollapse}
        style={{ background: "#F8FAFC", border: "none", borderBottom: "1px solid #E2E8F0", color: "#94A3B8", padding: "6px", fontSize: 12, width: "100%" }}>
        {navCollapsed ? "»" : "« طيّ القائمة"}
      </button>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
        {(() => {
          const NavBtn = ({ key2, inPinned }) => {
            const it = ITEMS[key2];
            if (!it) return null;
            const target = it.page || key2;
            const active = page === target && !it.soon;
            const b = badgeOf(key2);
            return (
              <div key={(inPinned ? "p" : "") + key2} style={{ position: "relative" }}>
                <button
                  onClick={() => { if (it.soon) { alert("القسم ده لسه بيتبني"); return; } setPage(target); setShowSidebar(false); }}
                  title={navCollapsed ? it.label : ""}
                  style={{ ...S.navBtn(active), opacity: it.soon ? 0.5 : 1, justifyContent: navCollapsed ? "center" : "flex-start" }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#E0F2FE"; e.currentTarget.style.color = "#0284C7"; }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; }}}>
                  <span style={{ fontSize: 17, flexShrink: 0 }}>{it.icon}</span>
                  {!navCollapsed && <span style={{ flex: 1, textAlign: "right" }}>{it.label}{it.soon ? " ⏳" : ""}</span>}
                  {!navCollapsed && !it.soon && (
                    <span onClick={e => { e.stopPropagation(); togglePin(key2); }}
                      title={pinned.includes(key2) ? "شيل من المثبت" : "ثبّت في الأعلى"}
                      style={{ fontSize: 11, color: pinned.includes(key2) ? "#D97706" : "#CBD5E1", flexShrink: 0, padding: "0 2px", cursor: "pointer" }}>
                      {pinned.includes(key2) ? "📌" : "📍"}
                    </span>
                  )}
                  {b && (
                    <span style={{
                      background: b.alert ? "#EF4444" : "#EFF6FF",
                      color: b.alert ? "#fff" : "#2563EB",
                      border: b.alert ? "none" : "1px solid #BFDBFE",
                      borderRadius: 10, minWidth: 20, height: 18, padding: "0 5px",
                      fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{b.v > 99 ? "99+" : b.v}</span>
                  )}
                </button>

              </div>
            );
          };

          return (
            <>
              {/* الرئيسية — ثابتة برّة الأقسام */}
              <NavBtn key2="dashboard" />

              {/* المثبت */}
              {pinned.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {!navCollapsed && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", padding: "4px 12px 4px", letterSpacing: 0.4 }}>📌 المثبت</div>
                  )}
                  {pinned.map(k => <NavBtn key={"pin" + k} key2={k} inPinned />)}
                  <div style={{ height: 1, background: "#E2E8F0", margin: "8px 12px" }}></div>
                </div>
              )}

              {/* الأقسام */}
              {sections.map(sec => {
                const hasActive = sec.items.some(k => (ITEMS[k] && (ITEMS[k].page || k)) === page);
                const closed = closedSections.includes(sec.title) && !hasActive;
                return (
                  <div key={sec.title} style={{ marginTop: 8 }}>
                    {!navCollapsed && (
                      <button onClick={() => toggleSection(sec.title)}
                        style={{ width: "100%", background: "none", border: "none", padding: "5px 12px", display: "flex", alignItems: "center", gap: 6, color: "#94A3B8", fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
                        <span style={{ flex: 1, textAlign: "right" }}>{sec.title}</span>
                        <span style={{ fontSize: 9 }}>{closed ? "▸" : "▾"}</span>
                      </button>
                    )}
                    {navCollapsed && <div style={{ height: 1, background: "#E2E8F0", margin: "6px 10px" }}></div>}
                    {!closed && sec.items.map(k => <NavBtn key={k} key2={k} />)}
                  </div>
                );
              })}
            </>
          );
        })()}
      </nav>

      {/* User */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: user.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0, color: "#fff" }}>{user.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>{user.job_title || user.role}</div>
          </div>
          <button onClick={logout} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>خروج</button>
        </div>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Segoe UI',Tahoma,Arial,sans-serif", color: "#64748B", display: "flex", flexDirection: "column" }}>

      {/* نافذة السحب — بتظهر لوحدها في أي صفحة */}
      <DrawPopup user={user} />

      {/* ═══ سايدبار التايمرات الشغالة — في كل الصفحات (بند ٧) ═══ */}
      {timers.length > 0 && (
        <div style={{
          position: "fixed", zIndex: 480,
          ...(isMobile
            ? { bottom: 72, left: 10, right: 10 }
            : { top: 70, left: 14, width: 230 }),
          display: "flex", flexDirection: "column", gap: 7,
        }}>
          <div style={{ background: "#065F46", color: "#fff", borderRadius: 12, padding: "6px 12px", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⏱</span>
            <span style={{ flex: 1 }}>تاسكات شغالة ({timers.length})</span>
          </div>
          {timers.map(t => (
            <div key={t.id} onClick={() => { setOpenTaskId({ id: t.task_id, k: Date.now() }); setTaskFilter({ status: "all", _k: Date.now() }); setPage("tasks"); }}
              style={{ background: "#FFFFFF", border: "2px solid #A7F3D0", borderRadius: 14, padding: "9px 12px", boxShadow: "0 4px 14px rgba(5,150,105,0.18)", cursor: "pointer" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                {t.task_title}
              </div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 5 }}>
                {isAdmin && t.member_name !== user.name ? `👤 ${t.member_name}` : ""}
                {t.project_name ? `${isAdmin && t.member_name !== user.name ? " · " : ""}📁 ${t.project_name}` : ""}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
                  {fmtClock(Math.floor((Date.now() - new Date(t.started_at)) / 1000))}
                </span>
                <button onClick={e => { e.stopPropagation(); stopOneTimer(t.task_id); }} title="إيقاف"
                  disabled={t.member_name !== user.name}
                  style={{ background: "#DC2626", color: "#fff", padding: "4px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                  ⏹ إيقاف
                </button>
              </div>
            </div>
          ))}
          {timers.length > 1 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "6px 10px", fontSize: 10, color: "#D97706", lineHeight: 1.6 }}>
              شغل أكتر من تايمر مع بعض أمر طبيعي ومسموح
            </div>
          )}
        </div>
      )}

      {/* ═══ البحث السريع ═══ */}
      {searchOpen && (() => {
        const r = searchResults();
        const total = r.tasks.length + r.projects.length + r.members.length;
        const row = (icon, main, sub, onClick) => (
          <button key={main + sub} onClick={onClick}
            style={{ width: "100%", textAlign: "right", background: "#FFFFFF", border: "none", borderBottom: "1px solid #F1F5F9", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 15 }}>{icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, color: "#0F172A", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main}</span>
              {sub && <span style={{ display: "block", fontSize: 11, color: "#94A3B8" }}>{sub}</span>}
            </span>
          </button>
        );
        const head = t => <div key={t} style={{ padding: "7px 16px", background: "#F8FAFC", fontSize: 11, fontWeight: 700, color: "#64748B" }}>{t}</div>;
        return (
          <div onClick={e => e.target === e.currentTarget && (setSearchOpen(false), setQ(""))}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 550, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 70, padding: "70px 16px 16px" }}>
            <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 12px 40px rgba(15,23,42,0.2)", overflow: "hidden", maxHeight: "75vh", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 14, borderBottom: "1px solid #E2E8F0", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 16 }}>🔎</span>
                <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                  placeholder="دوّري في التاسكات والمشاريع والفريق..."
                  style={{ flex: 1, background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", direction: "rtl" }} />
                <button onClick={() => { setSearchOpen(false); setQ(""); }} style={{ background: "none", color: "#94A3B8", fontSize: 18 }}>✕</button>
              </div>
              <div style={{ overflowY: "auto" }}>
                {q.trim().length < 2
                  ? <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>اكتبي حرفين على الأقل</div>
                  : total === 0
                    ? <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>مفيش نتايج لـ «{q}»</div>
                    : <>
                        {r.tasks.length > 0 && head(`📋 تاسكات (${r.tasks.length})`)}
                        {r.tasks.map(t => row("📋", t.title, t.assigned_to, () => goTo("tasks")))}
                        {r.projects.length > 0 && head(`📁 مشاريع (${r.projects.length})`)}
                        {r.projects.map(p => row("📁", p.name, p.client_name, () => goTo("projects")))}
                        {r.members.length > 0 && head(`👤 الفريق (${r.members.length})`)}
                        {r.members.map(m => row("👤", m.name, m.job_title, () => goTo(isAdmin ? "team" : "dashboard")))}
                      </>
                }
              </div>
            </div>
          </div>
        );
      })()}

      {/* HEADER */}
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0", padding: isMobile ? "0 12px" : "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100, flexShrink: 0, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isMobile && (
            <button onClick={() => setShowSidebar(true)} style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>☰</button>
          )}
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, flexShrink: 0, color: "#fff" }}>S</div>
          <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 800, color: "#0F172A" }}>Search Masters</div>
          {!isMobile && <span style={{ fontSize: 11, color: "#94A3B8", background: "#F1F5F9", padding: "2px 8px", borderRadius: 6 }}>{CURRENT_MONTH}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* ═══ مؤقت العمل (تعديل ٣) ═══ */}
          {(() => {
            const running = !!work.open;
            const liveMins = running ? Math.floor((Date.now() - new Date(work.open.start_time)) / 60000) : 0;
            const totalSecs = (work.doneMins + liveMins) * 60 +
              (running ? Math.floor(((Date.now() - new Date(work.open.start_time)) % 60000) / 1000) : 0);
            const ended = work.record && work.record.clock_out;

            if (!work.record) {
              return (
                <button onClick={startWork} disabled={workBusy} title="بدء العمل"
                  style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", padding: isMobile ? "6px 10px" : "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  🟢 {isMobile ? "ابدأ" : "بدء العمل"}
                </button>
              );
            }
            if (ended) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 20, padding: isMobile ? "3px 7px" : "4px 10px" }}>
                  <span style={{ fontSize: 12 }}>✅</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#059669", fontVariantNumeric: "tabular-nums" }}>{fmtClock(work.doneMins * 60)}</span>
                  <button onClick={reopenWork} disabled={workBusy} title="ارجع للشغل"
                    style={{ background: "#2563EB", color: "#fff", padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
                    ▶ ارجع
                  </button>
                </div>
              );
            }
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: running ? "#ECFDF5" : "#FFFBEB", border: `1px solid ${running ? "#A7F3D0" : "#FDE68A"}`, borderRadius: 20, padding: isMobile ? "3px 7px" : "4px 10px" }}>
                <span style={{ fontSize: 12 }}>{running ? "🟢" : "⏸"}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: running ? "#059669" : "#D97706", fontVariantNumeric: "tabular-nums" }}>
                  {fmtClock(totalSecs)}
                </span>
                {running
                  ? <button onClick={pauseWork} disabled={workBusy} title="إيقاف مؤقت"
                      style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#D97706", width: 22, height: 22, borderRadius: "50%", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>⏸</button>
                  : <button onClick={resumeWork} disabled={workBusy} title="استكمال العمل"
                      style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", width: 22, height: 22, borderRadius: "50%", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>▶</button>
                }
                <button onClick={endWork} disabled={workBusy} title="إنهاء العمل"
                  style={{ background: "#DC2626", color: "#fff", width: 22, height: 22, borderRadius: "50%", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>🔴</button>
              </div>
            );
          })()}

          {timers.length > 0 && (
            <span title={`${timers.length} تايمر شغال`} style={{ fontSize: 11, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#059669", padding: "4px 10px", borderRadius: 20, fontWeight: 800 }}>
              ⏱ {timers.length}
            </span>
          )}

          {/* البحث */}
          <button onClick={openSearch} title="بحث سريع"
            style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🔎</button>

          {/* المايك */}
          {(user.role === "admin" || user.can_assign_tasks === true) && (
            <button onClick={() => { setPage("tasks"); setVoiceTrigger(x => x + 1); }} title="تاسك بالصوت"
              style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#7C3AED", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎤</button>
          )}

          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }}></div>

          {/* Notifications */}
          <div style={{ position: "relative" }}>
            <button
onClick={() => setPage("notifications")}
              style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative" }}
            >
              🔔
              {notifCount > 0 && (
                <span style={{ position: "absolute", top: -2, left: -2, background: "#EF4444", color: "#fff", borderRadius: 10, minWidth: 18, height: 18, padding: "0 4px", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #FFFFFF" }}>
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div style={{ position: "fixed", top: 58, left: isMobile ? 8 : "auto", right: isMobile ? 8 : 16, width: isMobile ? "auto" : 320, background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 14, boxShadow: "0 8px 32px rgba(15,23,42,0.12)", zIndex: 300, overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", fontWeight: 700, fontSize: 14, color: "#0F172A", display: "flex", justifyContent: "space-between", position: "sticky", top: 0, background: "#FFFFFF" }}>
                  <span>🔔 الإشعارات</span>
                  <button onClick={markAllRead} style={{ background: "none", color: "#2563EB", fontSize: 12, fontWeight: 600 }}>قراءة الكل</button>
                </div>
                {notifs.length === 0
                  ? <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>لا توجد إشعارات</div>
                  : notifs.map(n => (
                    <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid #F1F5F9", background: n.is_read ? "#FFFFFF" : "#EFF6FF", borderRight: n.is_read ? "none" : "3px solid #2563EB" }}>
                      <div style={{ fontSize: 13, lineHeight: 1.4, color: "#0F172A" }}>{n.content}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          <div style={{ width: 30, height: 30, borderRadius: "50%", background: user.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{user.name[0]}</div>
          {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{user.name}</span>}
          {!isMobile && <button onClick={logout} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>خروج</button>}
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Desktop Sidebar */}
        {!isMobile && (
          <aside style={{ width: 210, background: "#FFFFFF", borderLeft: "1px solid #E2E8F0", flexShrink: 0, overflowY: "auto" }}>
            <SidebarContent />
          </aside>
        )}

        {/* Mobile Drawer */}
        {isMobile && showSidebar && (
          <>
            <div onClick={() => setShowSidebar(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 150 }} />
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 240, background: "#FFFFFF", borderLeft: "1px solid #E2E8F0", zIndex: 160, overflowY: "auto", boxShadow: "-4px 0 16px rgba(15,23,42,0.1)" }}>
              <div style={{ padding: "14px 12px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "#0F172A" }}>القائمة</span>
                <button onClick={() => setShowSidebar(false)} style={{ background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
              </div>
              <SidebarContent />
            </div>
          </>
        )}

        {/* Main Content */}
        <main style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {PAGES[page] || PAGES.dashboard}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      {isMobile && (
        <nav style={{ background: "#FFFFFF", borderTop: "1px solid #E2E8F0", display: "flex", padding: "4px 0 max(4px,env(safe-area-inset-bottom))", position: "sticky", bottom: 0, zIndex: 90, flexShrink: 0, boxShadow: "0 -2px 8px rgba(15,23,42,0.06)" }}>
          {MOBILE_NAV.map(k => ITEMS[k] && { id: k, ...ITEMS[k] }).filter(Boolean).map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "5px 2px", background: "none", color: page === n.id ? "#2563EB" : "#94A3B8", fontSize: 10, fontWeight: page === n.id ? 700 : 400, position: "relative" }}>
              <span style={{ fontSize: 19 }}>{n.icon}</span>
              <span style={{ fontSize: 8 }}>{n.label}</span>
              {n.id === "tasks" && notifCount > 0 && <span style={{ position: "absolute", top: 3, right: "28%", background: "#EF4444", color: "#fff", borderRadius: "50%", width: 13, height: 13, fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>}
              {page === n.id && <div style={{ position: "absolute", bottom: 0, width: 20, height: 2, background: "#2563EB", borderRadius: 2 }}></div>}
            </button>
          ))}
          <button onClick={() => setShowSidebar(true)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "5px 2px", background: "none", color: "#94A3B8", fontSize: 10 }}>
            <span style={{ fontSize: 19 }}>⋯</span>
            <span style={{ fontSize: 8 }}>المزيد</span>
          </button>
        </nav>
      )}
    </div>
  );
}
