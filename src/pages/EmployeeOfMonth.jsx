import { useState, useEffect } from "react";
import { sb, sbUpload, addNotification, formatDate, MONTHS, CURRENT_MONTH } from "../supabase.js";
import { loadLedger, totalsFrom } from "../score.js";

const DEFAULT_THRESHOLD = 60;

function monthRange(monthStr) {
  const parts = String(monthStr || "").split(" ");
  const mi = MONTHS.indexOf(parts[0]);
  const y = Number(parts[1]);
  if (mi < 0 || !y) return null;
  const mm = String(mi + 1).padStart(2, "0");
  const last = new Date(y, mi + 1, 0).getDate();
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function fmtHours(mins) {
  if (!mins) return "0 س";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} س ${m} د` : `${h} س`;
}

export default function EmployeeOfMonth({ user }) {
  const [members, setMembers] = useState([]);
  const [noms, setNoms] = useState([]);
  const [winners, setWinners] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [projects, setProjects] = useState([]);
  const [fbNotes, setFbNotes] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showNom, setShowNom] = useState(null);
  const [nomForm, setNomForm] = useState({ percentage: "", reason: "", improve: "", internal_note: "" });
  const [showPick, setShowPick] = useState(false);
  const [pickForm, setPickForm] = useState({ member_name: "", reason: "", prize_name: "", delivered: false, internal_note: "" });
  const [prizeFile, setPrizeFile] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_THRESHOLD));
  const [confirmEdit, setConfirmEdit] = useState(false);

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };

  useEffect(() => { loadAll(); }, [selectedMonth]);

  async function loadAll() {
    setLoading(true);
    const r = monthRange(selectedMonth);
    const [m, n, w, t, a, p, s, fb, lg] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      sb(`eom_nominations?month=eq.${encodeURIComponent(selectedMonth)}`),
      sb("eom_winners?order=chosen_at.desc"),
      sb(`tasks?month=eq.${encodeURIComponent(selectedMonth)}`),
      r ? sb(`attendance?date=gte.${r.start}&date=lte.${r.end}`) : Promise.resolve([]),
      sb("projects?order=name"),
      sb("app_settings?key=eq.eom_threshold"),
      sb(`feedback_notes?month=eq.${encodeURIComponent(selectedMonth)}&order=created_at.desc`),
      loadLedger(selectedMonth),
    ]);
    setFbNotes(fb || []);
    setLedger(lg || []);
    if (m) setMembers(m);
    if (n) setNoms(n);
    if (w) setWinners(w);
    if (t) setTasks(t);
    if (a) setAttendance(a);
    if (p) setProjects(p);
    if (s && s[0] && s[0].value) { setThreshold(Number(s[0].value)); setThresholdInput(s[0].value); }
    setLoading(false);
  }

  // ── الأعضاء الداخلون في السباق ──
  const racers = members.filter(m => m.role !== "admin");

  function nomOf(name) {
    return noms.find(n => n.member_name === name) || null;
  }

  // ═══ الرصيد ونسبة النظام ═══
  const totals = totalsFrom(ledger);
  const scoreOf = name => totals[name] || 0;
  const maxScore = Math.max(0, ...racersNames().map(scoreOf));

  function racersNames() {
    return members.filter(m => m.role !== "admin").map(m => m.name);
  }

  // نسبة النظام = رصيد العضو ÷ أعلى رصيد في الفريق
  function systemPct(name) {
    const v = scoreOf(name);
    if (maxScore <= 0 || v <= 0) return 0;
    return Math.round((v / maxScore) * 100);
  }

  // النسبة المعتمدة = اللي المدير حددها، وإلا نسبة النظام
  function effectivePct(name) {
    const n = nomOf(name);
    if (n && n.percentage != null) return Number(n.percentage);
    return systemPct(name);
  }

  function notesOf(name) {
    return fbNotes.filter(n => n.member_name === name);
  }

  // ── البيانات المساعدة (للمدير فقط) ──
  function statsOf(name) {
    const mine = tasks.filter(t => t.assigned_to === name);
    const completed = mine.filter(t => t.status === "completed").length;
    const overdue = mine.filter(t => t.due_date && t.status !== "completed" && t.status !== "cancelled" && t.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10)).length;
    const revision = mine.filter(t => t.status === "needs_revision").length;
    const pct = mine.length ? Math.round((completed / mine.length) * 100) : 0;

    const myAtt = attendance.filter(a => a.member_name === name);
    const done = myAtt.filter(a => a.clock_out);
    const incomplete = myAtt.filter(a => a.clock_in && !a.clock_out).length;
    const totalMins = done.reduce((sum, a) => sum + (a.working_minutes || 0), 0);
    const days = done.length;
    const avgMins = days ? Math.round(totalMins / days) : 0;

    const clients = projects.filter(p => Array.isArray(p.team_members) && p.team_members.includes(name)).length;

    return { total: mine.length, completed, overdue, revision, pct, days, totalMins, avgMins, incomplete, clients };
  }

  // ── الترتيب ──
  const ranked = [...racers].sort((a, b) => {
    const pa = effectivePct(a.name);
    const pb = effectivePct(b.name);
    if (pb !== pa) return pb - pa;
    const sa = scoreOf(a.name), sbv = scoreOf(b.name);
    if (sbv !== sa) return sbv - sa;
    return a.name.localeCompare(b.name, "ar");
  });

  // ── المرشحون الأقوياء ──
  const strong = (() => {
    const qualified = ranked.filter(m => effectivePct(m.name) >= threshold);
    if (qualified.length <= 3) return qualified;
    const thirdPct = effectivePct(qualified[2].name);
    return qualified.filter((m, i) => i < 3 || effectivePct(m.name) === thirdPct);
  })();

  const monthWinner = winners.find(w => w.month === selectedMonth) || null;
  const myNom = nomOf(user.name);

  function winCount(name) {
    return winners.filter(w => w.member_name === name).length;
  }

  // ── حفظ الترشيح ──
  async function saveNomination() {
    if (!showNom) return;
    const pctRaw = nomForm.percentage;
    if (pctRaw === "" || isNaN(Number(pctRaw))) { alert("اكتبي نسبة من 0 إلى 100"); return; }
    const pct = Math.max(0, Math.min(100, Math.round(Number(pctRaw))));
    const sysPct = systemPct(showNom.name);
    if (pct < sysPct) { alert(`مينفعش تحت نسبة النظام (${sysPct}%) — النظام حسبها من الرصيد، والتعديل بالزيادة بس`); return; }
    if (!nomForm.reason.trim()) { alert("سبب الترشيح إلزامي"); return; }
    if (!nomForm.improve.trim()) { alert("المطلوب تحسينه إلزامي"); return; }

    setSaving(true);
    const name = showNom.name;
    const existing = nomOf(name);
    const wasStrong = (existing?.percentage ?? -1) >= threshold;
    const nowStrong = pct >= threshold;

    const payload = {
      month: selectedMonth, member_name: name, percentage: pct,
      system_percentage: sysPct,
      manual_override: pct > sysPct,
      score_snapshot: scoreOf(name),
      reason: nomForm.reason.trim(), improve: nomForm.improve.trim(),
      internal_note: nomForm.internal_note, updated_by: user.name,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await sb(`eom_nominations?id=eq.${existing.id}`, "PATCH", payload);
    } else {
      await sb("eom_nominations", "POST", payload);
    }

    if (existing?.percentage !== pct) {
      await addNotification(name, `📊 تم تحديث نسبة ترشيحك لموظف الشهر: ${pct}%`, "info");
    }
    if (!wasStrong && nowStrong) {
      for (const m of members) {
        await addNotification(m.name, `🔥 ${name} دخل قائمة المرشحين الأقوياء (${pct}%)`, "info");
      }
    } else if (wasStrong && !nowStrong) {
      for (const m of members) {
        await addNotification(m.name, `📉 ${name} خرج من قائمة المرشحين الأقوياء`, "info");
      }
    }

    setSaving(false);
    setShowNom(null);
    await loadAll();
  }

  // ── حفظ الاختيار النهائي ──
  async function saveWinner() {
    if (!pickForm.member_name) { alert("اختاري العضو"); return; }
    if (!pickForm.reason.trim()) { alert("سبب الاختيار إلزامي"); return; }
    setSaving(true);

    let imageUrl = monthWinner?.prize_image_url || null;
    if (prizeFile) {
      const ext = prizeFile.name.split(".").pop();
      const path = `${selectedMonth.replace(/\s/g, "_")}_${Date.now()}.${ext}`;
      const uploaded = await sbUpload("awards", path, prizeFile);
      if (uploaded) imageUrl = uploaded;
      else alert("الصورة مترفعتش — الاختيار هيتحفظ من غيرها وتقدري ترفعيها بعدين");
    }

    const payload = {
      month: selectedMonth,
      member_name: pickForm.member_name,
      reason: pickForm.reason.trim(),
      prize_name: pickForm.prize_name || null,
      prize_image_url: imageUrl,
      delivered: pickForm.delivered,
      delivered_at: pickForm.delivered ? new Date().toISOString().slice(0, 10) : null,
      internal_note: pickForm.internal_note || null,
      chosen_by: user.name,
      chosen_at: new Date().toISOString(),
    };

    if (monthWinner) {
      await sb(`eom_winners?id=eq.${monthWinner.id}`, "PATCH", {
        ...payload,
        edited_log: `${monthWinner.edited_log || ""}\nعُدّل بواسطة ${user.name} — ${new Date().toLocaleString("ar-EG")}`.trim(),
      });
    } else {
      await sb("eom_winners", "POST", payload);
      for (const m of members) {
        await addNotification(m.name, `🏆 موظف الشهر ${selectedMonth}: ${pickForm.member_name}`, "info");
      }
    }

    setSaving(false);
    setShowPick(false);
    setPrizeFile(null);
    setConfirmEdit(false);
    await loadAll();
  }

  async function toggleDelivered() {
    if (!monthWinner) return;
    const next = !monthWinner.delivered;
    await sb(`eom_winners?id=eq.${monthWinner.id}`, "PATCH", {
      delivered: next,
      delivered_at: next ? new Date().toISOString().slice(0, 10) : null,
    });
    await loadAll();
  }

  async function saveThreshold() {
    const v = Math.max(0, Math.min(100, Math.round(Number(thresholdInput) || DEFAULT_THRESHOLD)));
    const existing = await sb("app_settings?key=eq.eom_threshold");
    if (existing && existing.length) {
      await sb("app_settings?key=eq.eom_threshold", "PATCH", { value: String(v) });
    } else {
      await sb("app_settings", "POST", { key: "eom_threshold", value: String(v) });
    }
    setThreshold(v);
    setShowSettings(false);
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  // ── صف بيانات مساعدة (للمدير) ──
  const StatsRow = ({ name }) => {
    const st = statsOf(name);
    return (
      <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>📊 بيانات مساعدة — للمدير فقط</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(88px,1fr))", gap: 6 }}>
          {[
            { l: "مكتملة", v: st.completed, c: "#059669" },
            { l: "من إجمالي", v: st.total, c: "#2563EB" },
            { l: "الإنجاز", v: st.pct + "%", c: st.pct >= 80 ? "#059669" : "#D97706" },
            { l: "متأخرة", v: st.overdue, c: "#DC2626" },
            { l: "للتعديل", v: st.revision, c: "#D97706" },
            { l: "عملاء", v: st.clients, c: "#7C3AED" },
            { l: "أيام حضور", v: st.days, c: "#0891B2" },
            { l: "إجمالي ساعات", v: fmtHours(st.totalMins), c: "#0F172A" },
            { l: "متوسط يومي", v: fmtHours(st.avgMins), c: "#0F172A" },
          ].map(x => (
            <div key={x.l} style={{ textAlign: "center", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 4px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>{x.l}</div>
            </div>
          ))}
        </div>
        {st.incomplete > 0 && (
          <div style={{ fontSize: 11, color: "#D97706", marginTop: 8, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 10px" }}>
            ⚠️ {st.incomplete} يوم بسجل ناقص (دخول بدون خروج) — الساعات دي مش محسوبة
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🏆 موظف الشهر</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 12px", fontSize: 13 }}>
            {MONTHS.map(m => <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>)}
          </select>
          {isAdmin && (
            <button onClick={() => setShowSettings(true)} style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B", padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>⚙️ الإعدادات</button>
          )}
        </div>
      </div>

      {/* ── موظف الشهر الحالي ── */}
      <div style={{ ...card, marginBottom: 16, borderTop: "4px solid #D97706" }}>
        {monthWinner ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: members.find(m => m.name === monthWinner.member_name)?.avatar_color || "#D97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                {monthWinner.member_name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 2 }}>{monthWinner.month}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>🏆 {monthWinner.member_name}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                  فاز {winCount(monthWinner.member_name)} مرة · اختير في {formatDate(monthWinner.chosen_at?.slice(0, 10))}
                </div>
              </div>
              <span style={{ fontSize: 12, background: monthWinner.delivered ? "#ECFDF5" : "#FFFBEB", color: monthWinner.delivered ? "#059669" : "#D97706", border: `1px solid ${monthWinner.delivered ? "#A7F3D0" : "#FDE68A"}`, padding: "4px 12px", borderRadius: 20, fontWeight: 700 }}>
                {monthWinner.delivered ? "✅ تم تسليم الهدية" : "⏳ لم تُسلَّم بعد"}
              </span>
            </div>

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>سبب الاختيار</div>
              <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{monthWinner.reason}</div>
            </div>

            {monthWinner.prize_image_url && (
              <div style={{ marginBottom: 12 }}>
                {monthWinner.prize_name && <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>🎁 {monthWinner.prize_name}</div>}
                <img src={monthWinner.prize_image_url} alt="الهدية" style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 12, border: "1px solid #E2E8F0" }} />
                <a href={monthWinner.prize_image_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563EB", marginTop: 6, display: "inline-block" }}>تحميل الصورة الأصلية ↗</a>
              </div>
            )}
            {!monthWinner.prize_image_url && monthWinner.prize_name && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>🎁 {monthWinner.prize_name}</div>
            )}

            {isAdmin && monthWinner.internal_note && (
              <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", marginBottom: 4 }}>🔒 ملاحظات داخلية — للمدير فقط</div>
                <div style={{ fontSize: 13, color: "#0F172A" }}>{monthWinner.internal_note}</div>
              </div>
            )}

            {isAdmin && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={toggleDelivered} style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#059669", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                  {monthWinner.delivered ? "↩️ تراجع عن التسليم" : "✅ تم تسليم الهدية"}
                </button>
                <button onClick={() => setConfirmEdit(true)} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>✏️ تعديل الاختيار</button>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>لم يتم اختيار موظف الشهر بعد</div>
            <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 16 }}>{selectedMonth}</div>
            {isAdmin && (
              <button onClick={() => { setPickForm({ member_name: ranked[0]?.name || "", reason: "", prize_name: "", delivered: false, internal_note: "" }); setPrizeFile(null); setShowPick(true); }}
                style={{ background: "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
                🏆 اختيار موظف الشهر
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── ترشيحك هذا الشهر ── */}
      {racers.some(m => m.name === user.name) && (
        <div style={{ ...card, marginBottom: 16, borderRight: "4px solid #2563EB" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>📊 ترشيحك هذا الشهر</div>
          {racers.some(m => m.name === user.name) && (myNom?.percentage != null || scoreOf(user.name) !== 0) ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: effectivePct(user.name) >= threshold ? "#059669" : "#2563EB" }}>{effectivePct(user.name)}%</div>
                <div style={{ flex: 1 }}>
                  <div style={{ background: "#F1F5F9", borderRadius: 6, height: 10, overflow: "hidden" }}>
                    <div style={{ width: effectivePct(user.name) + "%", height: "100%", background: effectivePct(user.name) >= threshold ? "#059669" : "#2563EB", borderRadius: 6, transition: "width 0.5s" }}></div>
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                    {effectivePct(user.name) >= threshold ? "🔥 إنت ضمن المرشحين الأقوياء" : `محتاج ${threshold - effectivePct(user.name)}% كمان للوصول لقائمة المرشحين الأقوياء`}
                    {` · رصيدك ${scoreOf(user.name)}`}
                  </div>
                </div>
              </div>
              <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 3 }}>سبب الترشيح</div>
                <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{myNom?.reason || "النسبة محسوبة من رصيد نقاطك"}</div>
              </div>
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", marginBottom: 3 }}>المطلوب تحسينه</div>
                <div style={{ fontSize: 13, color: "#0F172A", lineHeight: 1.6 }}>{myNom?.improve || "—"}</div>
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>آخر تحديث: {myNom?.updated_at ? new Date(myNom.updated_at).toLocaleString("ar-EG") : "—"}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#94A3B8" }}>لم يتم التقييم بعد</div>
          )}
        </div>
      )}

      {/* ── المرشحون الأقوياء ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>🔥 المرشحون الأقوياء</div>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>من بلغ {threshold}% فأكثر</span>
        </div>
        {strong.length === 0
          ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "16px 0" }}>لا يوجد مرشح قوي حتى الآن</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {strong.map((m, i) => {
                const n = nomOf(m.name);
                return (
                  <div key={m.id} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 20 }}>{["🥇", "🥈", "🥉"][i] || "🏅"}</span>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{m.job_title}</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706" }}>{effectivePct(m.name)}%</div>
                        <div style={{ fontSize: 9, color: "#94A3B8" }}>رصيد {scoreOf(m.name)}</div>
                      </div>
                    </div>
                    {n?.reason
                      ? <>
                          <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.6 }}><b style={{ color: "#059669" }}>سبب الترشيح:</b> {n.reason}</div>
                          <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.6, marginTop: 4 }}><b style={{ color: "#2563EB" }}>المطلوب تحسينه:</b> {n.improve}</div>
                        </>
                      : <div style={{ fontSize: 11, color: "#94A3B8" }}>وصل هنا برصيده — المدير لسه ما كتبش سبب الترشيح</div>
                    }
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* ── ترتيب الفريق ── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>📋 ترتيب الفريق</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ranked.map((m, i) => {
            const n = nomOf(m.name);
            const eff = effectivePct(m.name);
            const isStrong = eff >= threshold;
            const reviewed = !!(n && n.reason);
            return (
              <div key={m.id} style={{ border: `1px solid ${isStrong ? "#FDE68A" : "#E2E8F0"}`, background: isStrong ? "#FFFBEB" : "#F8FAFC", borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#94A3B8", width: 18, flexShrink: 0 }}>{i + 1}.</span>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                      {m.name}
                      {winCount(m.name) > 0 && <span style={{ fontSize: 11, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", padding: "1px 8px", borderRadius: 20, marginRight: 6, fontWeight: 700 }}>🏆 {winCount(m.name)}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{m.job_title}</div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: isStrong ? "#D97706" : "#2563EB" }}>{eff}%</div>
                    <div style={{ fontSize: 9, color: "#94A3B8" }}>رصيد {scoreOf(m.name)}</div>
                  </div>
                  {n?.manual_override && (
                    <span title={`النظام حسبها ${n.system_percentage}%`} style={{ fontSize: 10, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", padding: "1px 8px", borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>
                      ✏️ يدوي
                    </span>
                  )}
                  {isAdmin && (
                    <button onClick={() => {
                      setNomForm({
                        percentage: n?.percentage != null ? String(n.percentage) : String(systemPct(m.name)),
                        reason: n?.reason || "", improve: n?.improve || "", internal_note: n?.internal_note || "",
                      });
                      setShowNom(m);
                    }} style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>✏️ تعديل</button>
                  )}
                </div>

                {true && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 6, height: 7, overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ width: eff + "%", height: "100%", background: isStrong ? "#D97706" : "#2563EB", borderRadius: 6 }}></div>
                    </div>
                    {reviewed ? (
                      <>
                        <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.6 }}><b style={{ color: "#059669" }}>سبب الترشيح:</b> {n.reason}</div>
                        <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.6, marginTop: 3 }}><b style={{ color: "#2563EB" }}>المطلوب تحسينه:</b> {n.improve}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>النسبة محسوبة من الرصيد — المدير لسه ما كتبش سبب الترشيح</div>
                    )}
                  </div>
                )}

                {isAdmin && n?.internal_note && (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "6px 10px", marginTop: 8, fontSize: 12, color: "#0F172A" }}>
                    🔒 {n.internal_note}
                  </div>
                )}

                {isAdmin && notesOf(m.name).length > 0 && (
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>💬 ملاحظات الشهر:</span>
                    <span style={{ color: "#059669", fontWeight: 700 }}>👍 {notesOf(m.name).filter(n => n.type === "positive").length}</span>
                    <span style={{ color: "#D97706", fontWeight: 700 }}>⚠️ {notesOf(m.name).filter(n => n.type === "negative").length}</span>
                  </div>
                )}

                {isAdmin && <StatsRow name={m.name} />}
              </div>
            );
          })}
          {ranked.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "16px 0" }}>لا يوجد أعضاء في السباق</div>}
        </div>
      </div>

      {/* ── سجل الفائزين ── */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>📜 سجل الفائزين</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>السجل يبدأ من أغسطس 2026</div>

        {winners.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {[...new Set(winners.map(w => w.member_name))].map(name => (
              <span key={name} style={{ fontSize: 12, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", padding: "3px 12px", borderRadius: 20, fontWeight: 700 }}>
                {name} · 🏆 {winCount(name)}
              </span>
            ))}
          </div>
        )}

        {winners.length === 0
          ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "16px 0" }}>لا يوجد فائزون بعد</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {winners.map(w => (
                <div key={w.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: members.find(m => m.name === w.member_name)?.avatar_color || "#D97706", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{w.member_name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>🏆 {w.member_name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{w.month}{w.prize_name ? ` · 🎁 ${w.prize_name}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 11, background: w.delivered ? "#ECFDF5" : "#FFFBEB", color: w.delivered ? "#059669" : "#D97706", padding: "2px 10px", borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>
                      {w.delivered ? "✅ سُلِّمت" : "⏳ لم تُسلَّم"}
                    </span>
                  </div>
                  {w.reason && <div style={{ fontSize: 12, color: "#64748B", marginTop: 6, lineHeight: 1.6 }}>{w.reason}</div>}
                  {w.prize_image_url && <img src={w.prize_image_url} alt="الهدية" style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 10, marginTop: 8, border: "1px solid #E2E8F0" }} />}
                </div>
              ))}
            </div>
        }
      </div>

      {/* ═══ MODAL: تعديل الترشيح ═══ */}
      {showNom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowNom(null)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowNom(null)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>ترشيح {showNom.name}</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18 }}>{selectedMonth}</div>

            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#DC2626", marginBottom: 16, lineHeight: 1.6 }}>
              ⚠️ سبب الترشيح والمطلوب تحسينه <b>يشوفهم كل الفريق</b>. اكتبيهم عن الشغل مش عن الشخص. أي ملاحظة إدارية خاصة مكانها الملاحظات الداخلية تحت.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* الرصيد ونسبة النظام */}
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB" }}>{scoreOf(showNom.name)}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>الرصيد</div>
                  </div>
                  <div style={{ fontSize: 16, color: "#BFDBFE" }}>→</div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB" }}>{systemPct(showNom.name)}%</div>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>نسبة النظام</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, fontSize: 11, color: "#2563EB", lineHeight: 1.6 }}>
                    محسوبة من الرصيد ÷ أعلى رصيد في الفريق ({maxScore})
                  </div>
                </div>
              </div>

              <div>
                <div style={label}>نسبة الترشيح المعتمدة *</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>
                  مينفعش تحت {systemPct(showNom.name)}% — التعديل بالزيادة بس، وبيتسجّل إنه يدوي
                </div>
                <input type="number" min={systemPct(showNom.name)} max="100" value={nomForm.percentage} onChange={e => setNomForm(f => ({ ...f, percentage: e.target.value }))} style={inp} />
                {nomForm.percentage !== "" && Number(nomForm.percentage) > systemPct(showNom.name) && (
                  <div style={{ fontSize: 11, color: "#D97706", marginTop: 6 }}>
                    ✏️ زيادة {Number(nomForm.percentage) - systemPct(showNom.name)}% فوق حساب النظام — هيتسجّل كتعديل يدوي
                  </div>
                )}
              </div>
              <div>
                <div style={label}>سبب الترشيح * <span style={{ color: "#94A3B8", fontWeight: 400 }}>— يظهر لكل الفريق</span></div>
                <textarea value={nomForm.reason} onChange={e => setNomForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="اللي رفع نسبته..." style={{ ...inp, resize: "vertical" }} />
              </div>
              <div>
                <div style={label}>المطلوب تحسينه * <span style={{ color: "#94A3B8", fontWeight: 400 }}>— يظهر لكل الفريق</span></div>
                <textarea value={nomForm.improve} onChange={e => setNomForm(f => ({ ...f, improve: e.target.value }))} rows={3} placeholder="خطوة واضحة قابلة للتنفيذ..." style={{ ...inp, resize: "vertical" }} />
              </div>
              <div>
                <div style={label}>🔒 ملاحظات داخلية <span style={{ color: "#94A3B8", fontWeight: 400 }}>— للمدير فقط</span></div>
                <textarea value={nomForm.internal_note} onChange={e => setNomForm(f => ({ ...f, internal_note: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>

              <StatsRow name={showNom.name} />

              {/* ملاحظات الشهر على العضو */}
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>
                  💬 ملاحظات الشهر ({notesOf(showNom.name).length})
                </div>
                {notesOf(showNom.name).length === 0
                  ? <div style={{ fontSize: 12, color: "#94A3B8" }}>مفيش ملاحظات مسجلة على {showNom.name} الشهر ده</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                      {notesOf(showNom.name).map(n => (
                        <div key={n.id} style={{ background: n.type === "positive" ? "#ECFDF5" : "#FFFBEB", border: `1px solid ${n.type === "positive" ? "#A7F3D0" : "#FDE68A"}`, borderRadius: 8, padding: "6px 10px" }}>
                          <div style={{ fontSize: 12, color: "#0F172A", lineHeight: 1.6 }}>
                            {n.type === "positive" ? "👍" : "⚠️"} {n.content}
                          </div>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>
                            {new Date(n.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                            {n.project_name ? ` · ${n.project_name}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>

              <button onClick={saveNomination} disabled={saving} style={{ background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                {saving ? "جاري الحفظ..." : "حفظ الترشيح ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: تأكيد تعديل اختيار محفوظ ═══ */}
      {confirmEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FDE68A", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✏️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>تعديل اختيار محفوظ؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>الشهر ده متقفل خلاص. التعديل هيتسجل باسمك وبتاريخه في سجل التغييرات.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                setPickForm({
                  member_name: monthWinner.member_name, reason: monthWinner.reason || "",
                  prize_name: monthWinner.prize_name || "", delivered: !!monthWinner.delivered,
                  internal_note: monthWinner.internal_note || "",
                });
                setPrizeFile(null); setConfirmEdit(false); setShowPick(true);
              }} style={{ flex: 1, background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>كمّلي</button>
              <button onClick={() => setConfirmEdit(false)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: اختيار موظف الشهر ═══ */}
      {showPick && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowPick(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowPick(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>🏆 اختيار موظف الشهر</h3>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18 }}>{selectedMonth}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={label}>العضو * <span style={{ color: "#94A3B8", fontWeight: 400 }}>— مرتبين حسب نسبة الترشيح</span></div>
                <select value={pickForm.member_name} onChange={e => setPickForm(f => ({ ...f, member_name: e.target.value }))} style={inp}>
                  <option value="">— اختاري —</option>
                  {ranked.map(m => {
                    const p = nomOf(m.name)?.percentage;
                    return <option key={m.id} value={m.name}>{m.name} {p != null ? `(${p}%)` : "(لم يُقيَّم)"}</option>;
                  })}
                </select>
              </div>

              {pickForm.member_name && <StatsRow name={pickForm.member_name} />}

              <div>
                <div style={label}>سبب الاختيار *</div>
                <textarea value={pickForm.reason} onChange={e => setPickForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>
              <div>
                <div style={label}>🎁 صورة الهدية <span style={{ color: "#94A3B8", fontWeight: 400 }}>— اختياري</span></div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>الصورة هتتعرض زي ما هي بالظبط — من غير قص ولا تعديل أبعاد ولا إطارات</div>
                <input type="file" accept="image/*" onChange={e => setPrizeFile(e.target.files?.[0] || null)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} />
                {prizeFile && <div style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>✓ {prizeFile.name}</div>}
              </div>
              <div>
                <div style={label}>اسم الهدية <span style={{ color: "#94A3B8", fontWeight: 400 }}>— اختياري</span></div>
                <input value={pickForm.prize_name} onChange={e => setPickForm(f => ({ ...f, prize_name: e.target.value }))} style={inp} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0F172A", cursor: "pointer" }}>
                <input type="checkbox" checked={pickForm.delivered} onChange={e => setPickForm(f => ({ ...f, delivered: e.target.checked }))} style={{ width: 18, height: 18 }} />
                تم تسليم الهدية
              </label>
              <div>
                <div style={label}>🔒 ملاحظات داخلية <span style={{ color: "#94A3B8", fontWeight: 400 }}>— للمدير فقط</span></div>
                <textarea value={pickForm.internal_note} onChange={e => setPickForm(f => ({ ...f, internal_note: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={saveWinner} disabled={saving} style={{ flex: 1, background: saving ? "#94A3B8" : "linear-gradient(135deg,#D97706,#B45309)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                  {saving ? "جاري الحفظ..." : "حفظ ✓"}
                </button>
                <button onClick={() => setShowPick(false)} style={{ background: "#F1F5F9", color: "#64748B", padding: "13px 22px", borderRadius: 10, fontSize: 14 }}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: الإعدادات ═══ */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowSettings(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>⚙️ إعدادات موظف الشهر</h3>
            <div style={label}>عتبة المرشح القوي (%)</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>مين يوصل النسبة دي يظهر في "المرشحون الأقوياء"</div>
            <input type="number" min="0" max="100" value={thresholdInput} onChange={e => setThresholdInput(e.target.value)} style={{ ...inp, marginBottom: 16 }} />
            <button onClick={saveThreshold} style={{ width: "100%", background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>حفظ ✓</button>
          </div>
        </div>
      )}
    </div>
  );
}
