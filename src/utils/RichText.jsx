import { linkLabel } from "./linkLabel.js";

// ═══════════════════════════════════════════════════
//  عرض أي نص: الروابط تبقى قابلة للضغط بأسماء مقروءة
//  والمنشن @اسم يتلوّن
//  بيشتغل على النصوص القديمة والجديدة من غير أي تغيير في الداتا
// ═══════════════════════════════════════════════════

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

export function extractUrls(text) {
  const found = String(text || "").match(URL_RE);
  return found ? [...new Set(found)] : [];
}

// سطر واحد → أجزاء: نص · رابط · منشن
function splitLine(line, names) {
  const parts = [];
  let rest = String(line || "");

  // الروابط الأول
  const chunks = rest.split(URL_RE);
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (URL_RE.test(chunk)) {
      URL_RE.lastIndex = 0;
      parts.push({ t: "url", v: chunk });
      continue;
    }
    URL_RE.lastIndex = 0;
    // المنشن جوه النص العادي
    const sub = chunk.split(/(@[^\s،,.:;]+)/g);
    for (const p of sub) {
      if (!p) continue;
      if (p.startsWith("@")) {
        const nm = p.slice(1);
        const known = (names || []).some(n => nm === n || nm.startsWith(n));
        parts.push({ t: known ? "mention" : "text", v: p });
      } else {
        parts.push({ t: "text", v: p });
      }
    }
  }
  return parts;
}

export default function RichText({ text, members, size = 13, color = "#0F172A" }) {
  const names = (members || []).map(m => (typeof m === "string" ? m : m.name)).filter(Boolean);
  const lines = String(text || "").split("\n").filter(l => l.trim() !== "");

  if (lines.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, i) => {
        const parts = splitLine(line, names);
        const onlyUrl = parts.length === 1 && parts[0].t === "url";

        // سطر كله رابط → كارت رابط بالاسم والأيقونة
        if (onlyUrl) {
          const { label, icon } = linkLabel(parts[0].v);
          return (
            <a key={i} href={parts[0].v} target="_blank" rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 9, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "7px 11px", textDecoration: "none" }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{icon}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: size, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
              <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, flexShrink: 0 }}>فتح ↗</span>
            </a>
          );
        }

        return (
          <div key={i} style={{ fontSize: size, color, lineHeight: 1.8, wordBreak: "break-word" }}>
            {parts.map((p, j) => {
              if (p.t === "url") {
                const { label, icon } = linkLabel(p.v);
                return (
                  <a key={j} href={p.v} target="_blank" rel="noreferrer"
                    style={{ color: "#2563EB", fontWeight: 600, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "1px 7px", margin: "0 2px", textDecoration: "none", display: "inline-block" }}>
                    {icon} {label} ↗
                  </a>
                );
              }
              if (p.t === "mention") {
                return (
                  <span key={j} style={{ color: "#7C3AED", fontWeight: 700, background: "#F5F3FF", borderRadius: 4, padding: "0 4px" }}>{p.v}</span>
                );
              }
              return <span key={j}>{p.v}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}
