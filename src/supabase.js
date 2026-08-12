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

export function getCurrentMonth() {
  return new Date().toLocaleString('ar-EG', { month: 'long', year: 'numeric' });
}

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
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
  todo:            { label: "To Do",          color: "#6B7280", bg: "rgba(107,114,128,0.15)", icon: "⬜" },
  in_progress:     { label: "In Progress",    color: "#3B82F6", bg: "rgba(59,130,246,0.15)",  icon: "⚡" },
  pending_review:  { label: "Pending Review", color: "#F59E0B", bg: "rgba(245,158,11,0.15)",  icon: "👁" },
  completed:       { label: "Completed",      color: "#10B981", bg: "rgba(16,185,129,0.15)",  icon: "✅" },
  needs_revision:  { label: "Needs Revision", color: "#EF4444", bg: "rgba(239,68,68,0.15)",   icon: "🔁" },
  cancelled:       { label: "Cancelled",      color: "#9CA3AF", bg: "rgba(156,163,175,0.15)", icon: "❌" },
};

export const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#10B981", icon: "🟢" },
  medium: { label: "Medium", color: "#3B82F6", icon: "🔵" },
  high:   { label: "High",   color: "#F59E0B", icon: "🟠" },
  urgent: { label: "Urgent", color: "#EF4444", icon: "🔴" },
};

export const RESOURCE_TYPES = [
  { value: "drive",      label: "Google Drive",          icon: "📁" },
  { value: "sheets",     label: "Google Sheets",         icon: "📊" },
  { value: "docs",       label: "Google Docs",           icon: "📄" },
  { value: "slides",     label: "Google Slides",         icon: "📽" },
  { value: "search_console", label: "Search Console",   icon: "🔍" },
  { value: "analytics",  label: "Google Analytics",      icon: "📈" },
  { value: "semrush",    label: "SEMrush",               icon: "🛠" },
  { value: "ahrefs",     label: "Ahrefs",                icon: "🔗" },
  { value: "wordpress",  label: "WordPress",             icon: "🌐" },
  { value: "other",      label: "Other",                 icon: "🔖" },
];
