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

const NAV = [
  { id: "dashboard",  icon: "🏠", label: "الرئيسية",  mobileShow: true },
  { id: "tasks",      icon: "📋", label: "التاسكات",   mobileShow: true },
  { id: "projects",   icon: "📁", label: "المشاريع",   mobileShow: true },
  { id: "calendar",   icon: "📅", label: "التقويم",    mobileShow: true },
  { id: "reports",    icon: "📊", label: "التقارير",   mobileShow: true },
  { id: "workload",   icon: "⚖️", label: "توزيع العمل", mobileShow: false, adminOnly: true },
  { id: "templates",  icon: "⚡", label: "القوالب",    mobileShow: false, adminOnly: true },
  { id: "team",       icon: "👥", label: "الفريق",     mobileShow: false, adminOnly: true },
  { id: "attendance", icon: "⏰", label: "الحضور",     mobileShow: false },
];

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

  useEffect(() => {
    if (!user) return;
    loadNotifs();
    pollRef.current = setInterval(loadNotifs, 10000);
    return () => clearInterval(pollRef.current);
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
    dashboard:  <Dashboard  user={user} onNavigate={setPage} />,
    tasks:      <Tasks      user={user} />,
    projects:   <Projects   user={user} />,
    team:       <Team       user={user} />,
    reports:    <Reports    user={user} />,
    attendance: <Attendance user={user} />,
    calendar:   <Calendar   user={user} />,
    templates:  <Templates  user={user} />,
    workload:   <Workload   user={user} />,
  };

  const visibleNav = NAV.filter(n => !n.adminOnly || isAdmin);

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, flexShrink: 0 }}>S</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, background: "linear-gradient(90deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Search Masters</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>Workspace · {CURRENT_MONTH}</div>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
        {visibleNav.map(n => (
          <button key={n.id} onClick={() => { setPage(n.id); setShowSidebar(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, marginBottom: 2, background: page === n.id ? "linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.2))" : "transparent", border: page === n.id ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent", color: page === n.id ? "#E2E8F0" : "#9CA3AF", fontSize: 13, fontWeight: page === n.id ? 700 : 400, textAlign: "right", cursor: "pointer" }}>
            <span style={{ fontSize: 17, flexShrink: 0 }}>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.id === "tasks" && notifCount > 0 && <span style={{ background: "#EF4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>}
          </button>
        ))}
      </nav>
      <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: user.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{user.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>{user.job_title || user.role}</div>
          </div>
          <button onClick={logout} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5", padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>خروج</button>
        </div>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0F0C29 0%,#1a1060 50%,#0F0C29 100%)", fontFamily: "'Segoe UI',Tahoma,Arial,sans-serif", color: "#E2E8F0", display: "flex", flexDirection: "column" }}>

      {/* HEADER */}
      <header style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(99,102,241,0.2)", padding: isMobile ? "0 12px" : "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isMobile && (
            <button onClick={() => setShowSidebar(true)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.3)", color: "#E2E8F0", width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>☰</button>
          )}
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, flexShrink: 0 }}>S</div>
          <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 800, background: "linear-gradient(90deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Search Masters</div>
          {!isMobile && <span style={{ fontSize: 11, color: "#4B5563", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 6 }}>{CURRENT_MONTH}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }}></div>
          <div style={{ position: "relative" }}>
            <button onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markAllRead(); }} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(99,102,241,0.3)", color: "#E2E8F0", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative" }}>
              🔔
              {notifCount > 0 && <span style={{ position: "absolute", top: 1, left: 1, background: "#EF4444", color: "#fff", borderRadius: "50%", width: 15, height: 15, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>}
            </button>
            {showNotifs && (
              <div style={{ position: "fixed", top: 58, left: isMobile ? 8 : "auto", right: isMobile ? 8 : 16, width: isMobile ? "auto" : 320, background: "#1A1060", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", zIndex: 300, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700, fontSize: 14, display: "flex", justifyContent: "space-between", position: "sticky", top: 0, background: "#1A1060" }}>
                  <span>🔔 الإشعارات</span>
                  <button onClick={markAllRead} style={{ background: "none", color: "#6366F1", fontSize: 11 }}>قراءة الكل</button>
                </div>
                {notifs.length === 0
                  ? <div style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 13 }}>لا توجد إشعارات</div>
                  : notifs.map(n => (
                    <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: n.is_read ? "transparent" : "rgba(99,102,241,0.08)", borderRight: n.is_read ? "none" : "3px solid #6366F1" }}>
                      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{n.content}</div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: user.avatar_color || "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{user.name[0]}</div>
          {!isMobile && <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>}
          {!isMobile && <button onClick={logout} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5", padding: "5px 10px", borderRadius: 8, fontSize: 12 }}>خروج</button>}
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Desktop Sidebar */}
        {!isMobile && (
          <aside style={{ width: 210, background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(99,102,241,0.15)", flexShrink: 0, overflowY: "auto" }}>
            <SidebarContent />
          </aside>
        )}

        {/* Mobile Drawer */}
        {isMobile && showSidebar && (
          <>
            <div onClick={() => setShowSidebar(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150 }} />
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 240, background: "#1A1060", borderLeft: "1px solid rgba(99,102,241,0.2)", zIndex: 160, overflowY: "auto" }}>
              <div style={{ padding: "14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>القائمة</span>
                <button onClick={() => setShowSidebar(false)} style={{ background: "none", color: "#9CA3AF", fontSize: 20 }}>✕</button>
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
        <nav style={{ background: "rgba(15,12,41,0.98)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(99,102,241,0.2)", display: "flex", padding: "4px 0 max(4px,env(safe-area-inset-bottom))", position: "sticky", bottom: 0, zIndex: 90, flexShrink: 0 }}>
          {NAV.filter(n => n.mobileShow && (!n.adminOnly || isAdmin)).map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "5px 2px", background: "none", color: page === n.id ? "#A5B4FC" : "#4B5563", fontSize: 10, fontWeight: page === n.id ? 700 : 400, position: "relative" }}>
              <span style={{ fontSize: 19 }}>{n.icon}</span>
              <span style={{ fontSize: 8 }}>{n.label}</span>
              {n.id === "tasks" && notifCount > 0 && <span style={{ position: "absolute", top: 3, right: "28%", background: "#EF4444", color: "#fff", borderRadius: "50%", width: 13, height: 13, fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>}
              {page === n.id && <div style={{ position: "absolute", bottom: 0, width: 20, height: 2, background: "#6366F1", borderRadius: 2 }}></div>}
            </button>
          ))}
          {/* More button for mobile */}
          <button onClick={() => setShowSidebar(true)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "5px 2px", background: "none", color: "#4B5563", fontSize: 10 }}>
            <span style={{ fontSize: 19 }}>⋯</span>
            <span style={{ fontSize: 8 }}>المزيد</span>
          </button>
        </nav>
      )}
    </div>
  );
}
