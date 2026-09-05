import { useState, useEffect } from "react";
import { sb, addNotification, CURRENT_MONTH } from "../supabase.js";
import { runBadges, GRADES, IMPACT, medalPoints } from "../badges.js";
import { addScore } from "../score.js";

const CATS = ["الأداء", "الجودة", "الفريق", "الالتزام", "الإنجازات", "التدريب", "أثر", "الهزار"];

export default function Badges({ user }) {
  const [all, setAll] = useState([]);
  const [owned, setOwned] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("me");
  const [award, setAward] = useState(null);        // الشارة اللي بتتمنح
  const [awardForm, setAwardForm] = useState({ member: "", note: "", level: "small" });
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [settings, setSettings] = useState({});
  const [detail, setDetail] = useState(null);       // ميدالية مفتوحة بكل بياناتها

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [b, mb, m, st] = await Promise.all([
      sb("badges?is_active=eq.true&order=category"),
      sb("member_badges?order=awarded_at.desc"),
      sb("team_members?is_active=eq.true&order=name"),
      sb("app_settings?select=key,value"),
    ]);
    if (b) setAll(b);
    if (mb) setOwned(mb);
    if (m) setMembers(m);
    if (st) { const o = {}; st.forEach(x => { o[x.key] = x.value; }); setSettings(o); }
    setLoading(false);
  }

  async function checkNow() {
    setRunning(true);
    const res = await runBadges(CURRENT_MONTH);
    setRunning(false);
    await loadAll();
    alert(res?.error ? "حصل خطأ أثناء الفحص" : res.awarded > 0 ? `✅ اتمنحت ${res.awarded} شارة` : "✅ مفيش شارات جديدة مستحقة");
  }

  async function giveBadge() {
    if (!awardForm.member) { alert("اختاري العضو"); return; }
    if (!awardForm.note.trim()) { alert("سبب المنح إلزامي — وهيظهر لكل الفريق"); return; }
    const todayStr = new Date().toISOString().slice(0, 10);
    const isImpact = award.category === "أثر";
    const level = isImpact ? (awardForm.level || "small") : null;
    const pts = settings.feature_medal_points === "0" ? 0 : medalPoints(award, settings, level);
    const period = award.repeat_type === "daily" ? `d:${todayStr}` : CURRENT_MONTH;

    await sb("member_badges", "POST", {
      member_name: awardForm.member,
      badge_id: String(award.id),
      badge_name: award.name,
      badge_icon: award.icon,
      month: CURRENT_MONTH, period, award_date: todayStr,
      points_awarded: pts, impact_level: level,
      awarded_by: user.name,
      note: awardForm.note.trim(),
    });

    if (pts > 0) {
      await addScore({ member: awardForm.member, month: CURRENT_MONTH, points: pts, source: "medal",
        reason: `ميدالية «${award.name}» — ${awardForm.note.trim()}`, by: user.name });
    }

    // تظهر لكل الفريق باسم صاحبها وسبب المنح
    for (const m of members) {
      await addNotification(m.name,
        m.name === awardForm.member
          ? `${award.icon} حصلت على ميدالية «${award.name}» — ${awardForm.note.trim()}${pts > 0 ? ` · +${pts} نقطة` : ""}`
          : `${award.icon} ${awardForm.member} خد ميدالية «${award.name}» — ${awardForm.note.trim()}`,
        "info");
    }

    setAward(null);
    setAwardForm({ member: "", note: "", level: "small" });
    await loadAll();
  }

  async function removeBadge() {
    if (!confirmRemove) return;
    await sb(`member_badges?id=eq.${confirmRemove.id}`, "DELETE");
    setConfirmRemove(null);
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const ownedOf = name => owned.filter(o => o.member_name === name);
  const myBadges = ownedOf(user.name);
  const holdersOf = badgeId => owned.filter(o => String(o.badge_id) === String(badgeId));

  const gradeOf = b => GRADES[(b && b.grade) || "medium"] || GRADES.medium;
  const ptsOf = b => settings.feature_medal_points === "0" ? 0 : medalPoints(b, settings);
  const myCountOf = id => myBadges.filter(o => String(o.badge_id) === String(id)).length;

  const BadgeChip = ({ icon, name, sub, dim, onRemove, onClick, pts, count }) => (
    <div onClick={onClick} style={{
      background: dim ? "#F8FAFC" : "#FFFBEB",
      border: `1.5px solid ${dim ? "#E2E8F0" : "#FDE68A"}`,
      borderRadius: 14, padding: "12px 10px", textAlign: "center", position: "relative",
      opacity: dim ? 0.55 : 1, cursor: onClick ? "pointer" : "default",
    }}>
      {count > 1 && (
        <span style={{ position: "absolute", top: 4, right: 5, background: "#D97706", color: "#fff", borderRadius: 10, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>×{count}</span>
      )}
      {onRemove && (
        <button onClick={onRemove} style={{ position: "absolute", top: 4, left: 6, background: "none", color: "#DC2626", fontSize: 11 }}>✕</button>
      )}
      <div style={{ fontSize: 26, marginBottom: 4, filter: dim ? "grayscale(1)" : "none" }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", lineHeight: 1.4 }}>{name}</div>
      {pts > 0 && <div style={{ fontSize: 10, color: "#059669", fontWeight: 800, marginTop: 2 }}>+{pts} نقطة</div>}
      {sub && <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🏅 ميدالياتي</h2>
        {isAdmin && (
          <button onClick={checkNow} disabled={running}
            style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
            {running ? "جاري الفحص..." : "🔄 فحص الشارات التلقائية"}
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["me", "ميدالياتي"], ["team", "الفريق"], ["all", "كل الميداليات"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: tab === v ? "#FFFFFF" : "transparent", color: tab === v ? "#0F172A" : "#64748B", fontSize: 12, fontWeight: tab === v ? 700 : 500, boxShadow: tab === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>{l}</button>
          ))}
        </div>
      )}

      {/* ═══ شاراتي ═══ */}
      {(tab === "me" || !isAdmin) && (
        <>
          <div style={{ ...card, textAlign: "center", borderTop: "4px solid #D97706" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#D97706", lineHeight: 1.1 }}>{myBadges.length}</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>شارة من {all.length}</div>
          </div>

          {myBadges.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>✨ اللي حققتها</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 10 }}>
                {[...new Map(myBadges.map(o => [String(o.badge_id), o])).values()].map(o => {
                  const b = all.find(x => String(x.id) === String(o.badge_id)) || {};
                  const n = myCountOf(o.badge_id);
                  return (
                    <BadgeChip key={o.id} icon={o.badge_icon} name={o.badge_name} count={n}
                      pts={Number(o.points_awarded) || 0}
                      sub={new Date(o.awarded_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                      onClick={() => setDetail({ badge: b, mine: myBadges.filter(x => String(x.badge_id) === String(o.badge_id)) })} />
                  );
                })}
              </div>
            </div>
          )}

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>🎯 اللي لسه قدامك</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>الشرط مكتوب تحت كل شارة</div>
            {CATS.map(cat => {
              const list = all.filter(b => b.category === cat && !myBadges.some(o => String(o.badge_id) === String(b.id)));
              if (list.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>{cat}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 10 }}>
                    {list.map(b => (
                      <BadgeChip key={b.id} icon={b.icon} name={b.name} sub={b.description} dim
                        pts={ptsOf(b)} onClick={() => setDetail({ badge: b, mine: [] })} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ الفريق ═══ */}
      {isAdmin && tab === "team" && members.map(m => {
        const list = ownedOf(m.name);
        return (
          <div key={m.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>{list.length} شارة</div>
              </div>
            </div>
            {list.length === 0
              ? <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: 10 }}>لسه مفيش شارات</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 10 }}>
                  {list.map(o => (
                    <BadgeChip key={o.id} icon={o.badge_icon} name={o.badge_name}
                      pts={Number(o.points_awarded) || 0}
                      sub={o.awarded_by === "🤖 تلقائي" ? "تلقائي" : `من ${o.awarded_by}`}
                      onRemove={() => setConfirmRemove(o)} />
                  ))}
                </div>
            }
          </div>
        );
      })}

      {/* ═══ كل الشارات ═══ */}
      {isAdmin && tab === "all" && CATS.map(cat => {
        const list = all.filter(b => b.category === cat);
        if (list.length === 0) return null;
        return (
          <div key={cat} style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>{cat}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map(b => {
                const h = holdersOf(b.id);
                return (
                  <div key={b.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 22 }}>{b.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                        {b.name}
                        <span style={{ fontSize: 10, background: b.award_type === "auto" ? "#EFF6FF" : "#F5F3FF", color: b.award_type === "auto" ? "#2563EB" : "#7C3AED", padding: "1px 8px", borderRadius: 20, marginRight: 6, fontWeight: 700 }}>
                          {b.award_type === "auto" ? "تلقائي" : "يدوي"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{b.description}</div>
                      {h.length > 0 && <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>حققها: {[...new Set(h.map(x => x.member_name))].join("، ")}</div>}
                    </div>
                    {b.award_type === "manual" && (
                      <button onClick={() => { setAward(b); setAwardForm({ member: "", note: "" }); }}
                        style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#7C3AED", padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>منح</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ═══ بيان الميدالية الكامل (تعديل ٢٤) ═══ */}
      {detail && (() => {
        const b = detail.badge || {};
        const g = gradeOf(b);
        const holders = owned.filter(o => String(o.badge_id) === String(b.id));
        const names = [...new Set(holders.map(o => o.member_name))];
        return (
          <div onClick={e => e.target === e.currentTarget && setDetail(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div dir="rtl" style={{ background: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(15,23,42,0.2)" }}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 44, marginBottom: 6 }}>{b.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{b.name}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{b.description}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  { l: "الفئة", v: b.category },
                  { l: "الدرجة", v: g.l, c: g.color },
                  { l: "النقاط", v: `+${ptsOf(b)}`, c: "#059669" },
                  { l: "التكرار", v: b.repeat_type === "daily" ? "يومية" : b.repeat_type === "weekly" ? "أسبوعية" : "مرة واحدة" },
                  { l: "طريقة المنح", v: b.award_type === "auto" ? "تلقائي" : "من المدير" },
                  { l: "حققها", v: `${names.length} من الفريق` },
                ].map(x => (
                  <div key={x.l} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: x.c || "#0F172A" }}>{x.v}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{x.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: detail.mine.length ? "#ECFDF5" : "#EFF6FF", border: `1px solid ${detail.mine.length ? "#A7F3D0" : "#BFDBFE"}`, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: detail.mine.length ? "#059669" : "#2563EB", marginBottom: 14, lineHeight: 1.7 }}>
                {detail.mine.length
                  ? <>✅ محققة {detail.mine.length > 1 ? `${detail.mine.length} مرات` : ""} · آخر مرة {new Date(detail.mine[0].awarded_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })}
                      {detail.mine[0].note ? <><br /><span style={{ color: "#64748B" }}>{detail.mine[0].note}</span></> : null}</>
                  : <>🎯 لسه قدامك · الميدالية دي هتزوّد رصيدك <b>{ptsOf(b)}</b> نقاط</>
                }
              </div>

              {names.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>مين حققها</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {names.map(n => (
                      <span key={n} style={{ fontSize: 11, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{n}</span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setDetail(null)} style={{ width: "100%", background: "#F1F5F9", color: "#64748B", padding: 11, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>تمام</button>
            </div>
          </div>
        );
      })()}

      {/* ═══ منح شارة ═══ */}
      {award && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setAward(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{award.icon}</div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{award.name}</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18 }}>{award.description}</div>
            <select value={awardForm.member} onChange={e => setAwardForm(f => ({ ...f, member: e.target.value }))} style={{ ...inp, marginBottom: 10 }}>
              <option value="">— اختاري العضو —</option>
              {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            {award.category === "أثر" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 600, textAlign: "right" }}>مستوى الأثر</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.entries(IMPACT).map(([k, v]) => {
                    const on = (awardForm.level || "small") === k;
                    const val = settings[v.key] != null ? settings[v.key] : v.def;
                    return (
                      <button key={k} onClick={() => setAwardForm(f => ({ ...f, level: k }))}
                        style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `2px solid ${on ? "#7C3AED" : "#E2E8F0"}`, background: on ? "#F5F3FF" : "#F8FAFC", color: on ? "#7C3AED" : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                        {v.l}<div style={{ fontSize: 10, marginTop: 2 }}>+{val}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "7px 11px", fontSize: 11, color: "#D97706", marginBottom: 10, lineHeight: 1.6, textAlign: "right" }}>
              ⚠️ سبب المنح إلزامي · وهيظهر لكل الفريق مع اسم صاحب الميدالية
            </div>

            <textarea value={awardForm.note} onChange={e => setAwardForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="سبب المنح — إلزامي" style={{ ...inp, marginBottom: 16, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={giveBadge} style={{ flex: 1, background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>منح ✓</button>
              <button onClick={() => setAward(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ سحب شارة ═══ */}
      {confirmRemove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 28, width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>{confirmRemove.badge_icon}</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>سحب الشارة؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
              «{confirmRemove.badge_name}» هتتشال من {confirmRemove.member_name}.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={removeBadge} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>اسحبي</button>
              <button onClick={() => setConfirmRemove(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
