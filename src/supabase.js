const URL = "https://qmucvkzzpeblpkbsgpwd.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdWN2a3p6cGVibHBrYnNncHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MjI5NjQsImV4cCI6MjEwMTk5ODk2NH0.QNW2_d70XZ_PpNQZvUJOuxSvr7FkZbSpmBPDMmjfYH8";
const H = { "apikey": KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };

export async function sb(path, method = "GET", body = null) {
  try {
    const res = await fetch(`${URL}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : null });
    if (!res.ok) { const e = await res.text(); console.error("SB Error:", e); return null; }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch(e) { console.error(e); return null; }
}

export async function addHistory(taskId, action, performedBy, details = "") {
  await sb("task_history", "POST", { task_id: taskId, action, performed_by: performedBy, details });
}

export async function addNotification(recipient, content, type = "info", taskId = null) {
  await sb("notifications", "POST", { recipient, content, type, related_task_id: taskId });
}

export function formatDate(d) {
  if (!d) return "—";
  const [y,m,day] = d.slice(0,10).split("-").map(Number);
  return new Date(y, m-1, day).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

export function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return "الآن";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
export const CURRENT_MONTH = MONTHS[new Date().getMonth()] + " " + new Date().getFullYear();

export const STATUS_CONFIG = {
  todo:           { label: "To Do",          color: "#64748B", bg: "#F1F5F9", icon: "⬜" },
  in_progress:    { label: "In Progress",    color: "#2563EB", bg: "#EFF6FF", icon: "⚡" },
  pending_review: { label: "Pending Review", color: "#D97706", bg: "#FFFBEB", icon: "👁" },
  completed:      { label: "Completed",      color: "#059669", bg: "#ECFDF5", icon: "✅" },
  needs_revision: { label: "Needs Revision", color: "#DC2626", bg: "#FEF2F2", icon: "🔁" },
  cancelled:      { label: "Cancelled",      color: "#94A3B8", bg: "#F8FAFC", icon: "❌" },
};

export const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#059669", icon: "🟢" },
  medium: { label: "Medium", color: "#2563EB", icon: "🔵" },
  high:   { label: "High",   color: "#D97706", icon: "🟠" },
  urgent: { label: "Urgent", color: "#DC2626", icon: "🔴" },
};

export const RESOURCE_TYPES = [
  { value: "drive",         label: "Google Drive",      icon: "📁" },
  { value: "sheets",        label: "Google Sheets",     icon: "📊" },
  { value: "docs",          label: "Google Docs",       icon: "📄" },
  { value: "slides",        label: "Google Slides",     icon: "📽" },
  { value: "search_console",label: "Search Console",    icon: "🔍" },
  { value: "analytics",     label: "Google Analytics",  icon: "📈" },
  { value: "semrush",       label: "SEMrush",           icon: "🛠" },
  { value: "ahrefs",        label: "Ahrefs",            icon: "🔗" },
  { value: "wordpress",     label: "WordPress",         icon: "🌐" },
  { value: "other",         label: "Other",             icon: "🔖" },
];
