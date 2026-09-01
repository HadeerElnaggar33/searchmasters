import { useState, useEffect } from "react";
import { sb, timeAgo } from "../supabase.js";

const TYPE_CONFIG = {
  assign: { icon: "📌", color: "#2563EB", bg: "#EFF6FF", label: "تعيين تاسك" },
  done:   { icon: "✅", color: "#059669", bg: "#ECFDF5", label: "إتمام تاسك" },
  review: { icon: "👁",  color: "#D97706", bg: "#FFFBEB", label: "مراجعة" },
  shift:  { icon: "⏩", color: "#D97706", bg: "#FFF7ED", label: "تأجيل" },
  info:   { icon: "🔔", color: "#64748B", bg: "#F8FAFC", label: "إشعار" },
};

export default function Notifications({ user }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const n = await sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&order=created_at.desc&limit=100`);
    if (n) setNotifs(n);
    // Mark all as read
    await sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}&is_read=eq.false`, "PATCH", { is_read: true });
    setLoading(false);
  }

  async function deleteNotif(id) {
    await sb(`notifications?id=eq.${id}`, "DELETE");
    setNotifs(prev => prev.filter(n => n.id !== id));
  }

  async function clearAll() {
    await sb(`notifications?recipient=eq.${encodeURIComponent(user.name)}`, "DELETE");
    setNotifs([]);
  }

  const filtered = notifs.filter(n => filter === "all" || n.type === filter);
  const unread = notifs.filter(n => !n.is_read).length;

  const groupByDate = (items) => {
    const groups = {};
    items.forEach(n => {
      const d = new Date(n.created_at);
      const key = d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  };

  const grouped = groupByDate(filtered);

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 2 }}>🔔 الإشعارات</h2>
          {unread > 0 && <span style={{ fontSize: 12, color: "#2563EB", background: "#EFF6FF", padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>{unread} غير مقروء</span>}
        </div>
        {notifs.length > 0 && (
          <button onClick={clearAll} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
            🗑 مسح الكل
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", background: "#F8FAFC", borderRadius: 12, padding: 4 }}>
        {[["all","الكل"], ["assign","تعيين"], ["done","مكتمل"], ["review","مراجعة"], ["shift","تأجيل"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: filter === v ? "linear-gradient(135deg,#2563EB,#7C3AED)" : "transparent", color: filter === v ? "#fff" : "#64748B", fontSize: 12, fontWeight: filter === v ? 700 : 400, cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {/* Content */}
      {loading
        ? <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>
        : filtered.length === 0
          ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#94A3B8" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>لا توجد إشعارات</div>
            </div>
          )
          : Object.entries(grouped).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 24 }}>
              {/* Date label */}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: "#E2E8F0" }}></div>
                {date}
                <div style={{ flex: 1, height: 1, background: "#E2E8F0" }}></div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(n => {
                  const t = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                  return (
                    <div key={n.id} style={{ background: n.is_read ? "#FFFFFF" : "#EFF6FF", border: `1px solid ${n.is_read ? "#E2E8F0" : "#BFDBFE"}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", boxShadow: "0 1px 3px rgba(15,23,42,0.06)", borderRight: `4px solid ${t.color}` }}>
                      {/* Icon */}
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, border: `1px solid ${t.color}22` }}>
                        {t.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.5, marginBottom: 4 }}>{n.content}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, background: t.bg, color: t.color, padding: "1px 8px", borderRadius: 6, fontWeight: 600 }}>{t.label}</span>
                          <span style={{ fontSize: 11, color: "#94A3B8" }}>{timeAgo(n.created_at)}</span>
                          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563EB", display: "inline-block" }}></span>}
                        </div>
                      </div>

                      {/* Delete */}
                      <button onClick={() => deleteNotif(n.id)} style={{ background: "none", color: "#CBD5E1", fontSize: 16, padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      }
    </div>
  );
}
