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
  { id: "dashboard",  icon: "🏠", label: "الرئيسية",    mobileShow: true },
  { id: "tasks",      icon: "📋", label: "التاسكات",    mobileShow: true },
  { id: "projects",   icon: "📁", label: "المشاريع",    mobileShow: true },
  { id: "calendar",   icon: "📅", label: "التقويم",     mobileShow: true },
  { id: "reports",    icon: "📊", label: "التقارير",    mobileShow: true },
  { id: "workload",   icon: "⚖️", label: "توزيع العمل", mobileShow: false, adminOnly: true },
  { id: "templates",  icon: "⚡", label: "القوالب",     mobileShow: false, adminOnly: true },
  { id: "team",       icon: "👥", label: "الفريق",      mobileShow: false, adminOnly: true },
  { id: "attendance", icon: "⏰", label: "الحضور",      mobileShow: false },
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

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
        {visibleNav.map(n => (
          <button
            key={n.id}
            onClick={() => { setPage(n.id); setShowSidebar(false); }}
            style={S.navBtn(page === n.id)}
            onMouseEnter={e => { if (page !== n.id) { e.currentTarget.style.background = "#E0F2FE"; e.currentTarget.style.color = "#0284C7"; }}}
            onMouseLeave={e => { if (page !== n.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; }}}
          >
            <span style={{ fontSize: 17, flexShrink: 0 }}>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.id === "tasks" && notifCount > 0 && (
              <span style={{ background: "#EF4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>
            )}
          </button>
        ))}
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
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }}></div>

          {/* Notifications */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markAllRead(); }}
              style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative" }}
            >
              🔔
              {notifCount > 0 && <span style={{ position: "absolute", top: 1, left: 1, background: "#EF4444", color: "#fff", borderRadius: "50%", width: 15, height: 15, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>}
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
          {NAV.filter(n => n.mobileShow && (!n.adminOnly || isAdmin)).map(n => (
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
