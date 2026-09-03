import { useState, useEffect } from "react";
import { sb, addNotification, formatDate } from "../supabase.js";
import { loadWorkConfig, isWorkingDay } from "../workdays.js";

const STATUS = {
  pending:  { label: "قيد المراجعة", icon: "⏳", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  approved: { label: "معتمدة",       icon: "✅", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  rejected: { label: "مرفوضة",       icon: "❌", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

const DEFAULTS = { entitlement: 14, carryMax: 5, noticeDays: 7, maxPerDay: 1 };

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// كل أيام العمل بين تاريخين (شامل الطرفين)
function workingDatesBetween(startStr, endStr, cfg) {
  const out = [];
  if (!startStr || !endStr) return out;
  const cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  if (isNaN(cur) || isNaN(end) || cur > end) return out;
  let guard = 0;
  while (cur <= end && guard < 400) {
    const s = toISO(cur);
    if (isWorkingDay(s, cfg)) out.push(s);
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return out;
}

// هل الفترتين متقاطعتين؟
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

export default function Leaves({ user }) {
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [cfg, setCfg] = useState({ workingDays: [0, 1, 2, 3, 4], holidays: [] });
  const [rules, setRules] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ member_name: "", kind: "full", start_date: "", end_date: "", half_period: "morning", reason: "" });
  const [decide, setDecide] = useState(null);     // { req, action }
  const [decideNote, setDecideNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [tab, setTab] = useState("mine");

  const isAdmin = user.role === "admin" || user.role === "team_leader";
  const YEAR = new Date().getFullYear();
  const TODAY = toISO(new Date());

  const inp = {
    background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A",
    padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
    width: "100%", direction: "rtl",
  };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [m, r, b, c, s] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      sb("leave_requests?order=created_at.desc"),
      sb("leave_balances?select=*"),
      loadWorkConfig(),
      sb("app_settings?select=key,value"),
    ]);
    if (m) setMembers(m);
    if (r) setRequests(r);
    if (b) setBalances(b);
    if (c) setCfg(c);
    if (s) {
      const get = (k, d) => { const row = s.find(x => x.key === k); return row ? Number(row.value) : d; };
      setRules({
        entitlement: get("leave_entitlement", DEFAULTS.entitlement),
        carryMax:    get("leave_carry_max",   DEFAULTS.carryMax),
        noticeDays:  get("leave_notice_days", DEFAULTS.noticeDays),
        maxPerDay:   get("leave_max_per_day", DEFAULTS.maxPerDay),
      });
    }
    setLoading(false);
  }

  // ── حساب رصيد عضو في سنة ──
  function balanceOf(name, year = YEAR) {
    const row = balances.find(b => b.member_name === name && Number(b.year) === year);
    const entitlement = row ? Number(row.entitlement) : rules.entitlement;
    const carried = row ? Number(row.carried_over) : 0;
    const used = requests
      .filter(r => r.member_name === name && Number(r.year) === year && r.status === "approved")
      .reduce((s, r) => s + Number(r.days || 0), 0);
    const total = entitlement + carried;
    return { entitlement, carried, used, total, remaining: Math.max(0, total - used) };
  }

  // ── فحص الطلب قبل الحفظ ──
  function validate(f, { asAdmin }) {
    const errs = [];
    const warns = [];
    const name = f.member_name;
    if (!name) errs.push("اختاري العضو");
    if (!f.reason.trim()) errs.push("سبب الإجازة إجباري");

    const start = f.start_date;
    const end = f.kind === "half" ? f.start_date : (f.end_date || f.start_date);
    if (!start) errs.push("اختاري التاريخ");
    if (start && end && start > end) errs.push("تاريخ البداية بعد تاريخ النهاية");

    let dates = [];
    let days = 0;
    if (start && end && start <= end) {
      dates = workingDatesBetween(start, end, cfg);
      days = f.kind === "half" ? 0.5 : dates.length;
      if (dates.length === 0) errs.push("كل الأيام المختارة عطلات — مفيش يوم عمل يتخصم");
      if (f.kind === "half" && !isWorkingDay(start, cfg)) errs.push("اليوم المختار مش يوم عمل");
    }

    // المهلة
    if (start && days > 0) {
      const diff = Math.ceil((new Date(start + "T00:00:00") - new Date(TODAY + "T00:00:00")) / 86400000);
      if (diff < rules.noticeDays) {
        if (asAdmin) warns.push(`الطلب قبل الميعاد بـ ${diff} يوم بس، والمهلة المتفق عليها ${rules.noticeDays} أيام — إنتي المدير فتقدري تعتمديه`);
        else errs.push(`لازم تقدّمي الطلب قبل الإجازة بـ ${rules.noticeDays} أيام على الأقل (فاضل ${diff} يوم)`);
      }
    }

    // الرصيد
    if (name && days > 0) {
      const bal = balanceOf(name);
      if (days > bal.remaining) errs.push(`الرصيد المتبقي ${bal.remaining} يوم بس، والطلب ${days} يوم`);
    }

    // تعارض مع طلبات معتمدة
    if (dates.length > 0) {
      const clash = requests.filter(r =>
        r.status === "approved" &&
        overlaps(start, end, String(r.start_date).slice(0, 10), String(r.end_date).slice(0, 10))
      );
      const others = clash.filter(r => r.member_name !== name);
      const same = clash.filter(r => r.member_name === name);
      if (same.length > 0) errs.push("عندك إجازة معتمدة في نفس الفترة");
      if (others.length >= rules.maxPerDay) {
        errs.push(`${others.map(r => r.member_name).join("، ")} في إجازة معتمدة في نفس الفترة — والمسموح ${rules.maxPerDay} شخص في اليوم`);
      }
    }

    return { errs, warns, days, dates };
  }

  const check = showAdd ? validate(form, { asAdmin: isAdmin }) : { errs: [], warns: [], days: 0, dates: [] };

  // ── حفظ الطلب ──
  async function submitRequest() {
    const v = validate(form, { asAdmin: isAdmin });
    if (v.errs.length > 0) return;
    setSaving(true);

    const end = form.kind === "half" ? form.start_date : (form.end_date || form.start_date);
    await sb("leave_requests", "POST", {
      member_name: form.member_name,
      year: YEAR,
      start_date: form.start_date,
      end_date: end,
      is_half_day: form.kind === "half",
      half_period: form.kind === "half" ? form.half_period : null,
      days: v.days,
      reason: form.reason.trim(),
      status: "pending",
      requested_by: user.name,
    });

    // إشعار للمديرين
    for (const m of members.filter(x => x.role === "admin" || x.role === "team_leader")) {
      if (m.name !== user.name) {
        await addNotification(m.name, `🏖 طلب إجازة جديد من ${form.member_name} — ${v.days} يوم`, "info");
      }
    }

    setSaving(false);
    setShowAdd(false);
    setForm({ member_name: "", kind: "full", start_date: "", end_date: "", half_period: "morning", reason: "" });
    await loadAll();
  }

  // ── اعتماد / رفض ──
  async function applyDecision() {
    if (!decide) return;
    const { req, action } = decide;
    setSaving(true);

    if (action === "approved") {
      // فحص أخير قبل الاعتماد
      const s = String(req.start_date).slice(0, 10);
      const e = String(req.end_date).slice(0, 10);
      const clash = requests.filter(r =>
        r.status === "approved" && r.id !== req.id && r.member_name !== req.member_name &&
        overlaps(s, e, String(r.start_date).slice(0, 10), String(r.end_date).slice(0, 10))
      );
      const bal = balanceOf(req.member_name, Number(req.year));
      if (clash.length >= rules.maxPerDay) {
        setSaving(false);
        alert(`مينفعش — ${clash.map(r => r.member_name).join("، ")} في إجازة معتمدة في نفس الفترة`);
        return;
      }
      if (Number(req.days) > bal.remaining) {
        setSaving(false);
        alert(`مينفعش — رصيد ${req.member_name} المتبقي ${bal.remaining} يوم والطلب ${req.days} يوم`);
        return;
      }
    }

    await sb(`leave_requests?id=eq.${req.id}`, "PATCH", {
      status: action,
      decided_by: user.name,
      decided_at: new Date().toISOString(),
      decision_note: decideNote || null,
    });

    // تسجيل الأيام في الحضور (الأيام الكاملة بس)
    if (action === "approved" && !req.is_half_day) {
      const dates = workingDatesBetween(String(req.start_date).slice(0, 10), String(req.end_date).slice(0, 10), cfg);
      for (const d of dates) {
        const exists = await sb(`attendance?member_name=eq.${encodeURIComponent(req.member_name)}&date=eq.${d}&select=id`);
        if (!exists || exists.length === 0) {
          await sb("attendance", "POST", { member_name: req.member_name, date: d, status: "leave" });
        }
      }
    }

    await addNotification(
      req.member_name,
      action === "approved"
        ? `✅ إجازتك من ${formatDate(String(req.start_date).slice(0, 10))} اتعمدت`
        : `❌ طلب إجازتك من ${formatDate(String(req.start_date).slice(0, 10))} اترفض${decideNote ? ` — ${decideNote}` : ""}`,
      "info"
    );

    setSaving(false);
    setDecide(null);
    setDecideNote("");
    await loadAll();
  }

  // ── إلغاء طلب ──
  async function cancelRequest() {
    if (!confirmCancel) return;
    const req = confirmCancel;
    if (req.status === "approved" && !req.is_half_day) {
      const dates = workingDatesBetween(String(req.start_date).slice(0, 10), String(req.end_date).slice(0, 10), cfg);
      for (const d of dates) {
        const rows = await sb(`attendance?member_name=eq.${encodeURIComponent(req.member_name)}&date=eq.${d}&status=eq.leave&select=id`);
        if (rows && rows[0]) await sb(`attendance?id=eq.${rows[0].id}`, "DELETE");
      }
    }
    await sb(`leave_requests?id=eq.${req.id}`, "DELETE");
    setConfirmCancel(null);
    await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const myBal = balanceOf(user.name);
  const pending = requests.filter(r => r.status === "pending");
  const visible = requests.filter(r => (tab === "mine" ? r.member_name === user.name : true));

  const RequestCard = ({ r }) => {
    const st = STATUS[r.status] || STATUS.pending;
    const s = String(r.start_date).slice(0, 10);
    const e = String(r.end_date).slice(0, 10);
    const canCancel = isAdmin || (r.member_name === user.name && r.status === "pending");
    return (
      <div style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15 }}>{st.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{r.member_name}</span>
          <span style={{ fontSize: 11, color: st.color, fontWeight: 700 }}>{st.label}</span>
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 12, background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#0F172A", padding: "2px 10px", borderRadius: 8, fontWeight: 700 }}>
            {r.is_half_day ? `نص يوم (${r.half_period === "morning" ? "صباحاً" : "بعد الضهر"})` : `${r.days} يوم`}
          </span>
        </div>

        <div style={{ fontSize: 13, color: "#0F172A", marginBottom: 6 }}>
          📅 {s === e ? formatDate(s) : `${formatDate(s)} → ${formatDate(e)}`}
        </div>
        <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6, marginBottom: 8 }}>
          <b style={{ color: "#0F172A" }}>السبب:</b> {r.reason}
        </div>

        {r.decision_note && (
          <div style={{ fontSize: 12, color: "#64748B", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            💬 {r.decision_note}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            قُدّم {new Date(r.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
            {r.decided_by ? ` · ${r.status === "approved" ? "اعتمدها" : "رفضها"} ${r.decided_by}` : ""}
          </span>
          <div style={{ flex: 1 }}></div>
          {isAdmin && r.status === "pending" && (
            <>
              <button onClick={() => { setDecide({ req: r, action: "approved" }); setDecideNote(""); }}
                style={{ background: "#059669", color: "#fff", padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>اعتماد ✓</button>
              <button onClick={() => { setDecide({ req: r, action: "rejected" }); setDecideNote(""); }}
                style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>رفض</button>
            </>
          )}
          {canCancel && <button onClick={() => setConfirmCancel(r)} style={{ background: "none", color: "#94A3B8", fontSize: 12, textDecoration: "underline" }}>حذف</button>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🏖 الإجازات</h2>
        <button onClick={() => { setForm({ member_name: isAdmin ? "" : user.name, kind: "full", start_date: "", end_date: "", half_period: "morning", reason: "" }); setShowAdd(true); }}
          style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
          + طلب إجازة
        </button>
      </div>

      {/* ── رصيدي ── */}
      <div style={{ ...card, borderRight: "4px solid #2563EB" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>رصيدك في {YEAR}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 8 }}>
          {[
            { l: "الرصيد السنوي", v: myBal.entitlement, c: "#0F172A" },
            { l: "مرحّل", v: myBal.carried, c: "#7C3AED" },
            { l: "الإجمالي", v: myBal.total, c: "#2563EB" },
            { l: "مستخدم", v: myBal.used, c: "#D97706" },
            { l: "المتبقي", v: myBal.remaining, c: "#059669" },
          ].map(x => (
            <div key={x.l} style={{ textAlign: "center", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 6px" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: x.c }}>{x.v}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{x.l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, background: "#F1F5F9", borderRadius: 6, height: 8, overflow: "hidden" }}>
          <div style={{ width: myBal.total ? `${Math.min(100, (myBal.used / myBal.total) * 100)}%` : "0%", height: "100%", background: "#2563EB", borderRadius: 6 }}></div>
        </div>
      </div>

      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.8 }}>
        📌 <b>القواعد:</b> الرصيد {rules.entitlement} يوم في السنة · المرحّل بحد أقصى {rules.carryMax} أيام · الطلب قبل الإجازة بـ {rules.noticeDays} أيام على الأقل · نص يوم مسموح · {rules.maxPerDay} شخص بس في إجازة نفس اليوم · أيام الجمعة والعطلات الرسمية مش محسوبة من الرصيد
      </div>

      {/* ── طلبات قيد المراجعة (للمدير) ── */}
      {isAdmin && pending.length > 0 && (
        <div style={{ ...card, borderTop: "3px solid #D97706" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>⏳ طلبات مستنية قرارك ({pending.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map(r => <RequestCard key={r.id} r={r} />)}
          </div>
        </div>
      )}

      {/* ── أرصدة الفريق (للمدير) ── */}
      {isAdmin && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>📊 أرصدة الفريق {YEAR}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map(m => {
              const b = balanceOf(m.name);
              const pct = b.total ? Math.min(100, (b.used / b.total) * 100) : 0;
              return (
                <div key={m.id} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.avatar_color || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", flex: 1, minWidth: 0 }}>{m.name}</span>
                    <span style={{ fontSize: 12, color: "#64748B" }}>
                      مستخدم <b style={{ color: "#D97706" }}>{b.used}</b> · متبقي <b style={{ color: "#059669" }}>{b.remaining}</b> من {b.total}
                    </span>
                  </div>
                  <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 6, height: 6, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: pct >= 90 ? "#DC2626" : "#2563EB", borderRadius: 6 }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── التبويبات ── */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
          {[["mine", "إجازاتي"], ["all", "كل الطلبات"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: tab === v ? "#FFFFFF" : "transparent", color: tab === v ? "#0F172A" : "#64748B", fontSize: 13, fontWeight: tab === v ? 700 : 500, boxShadow: tab === v ? "0 1px 3px rgba(15,23,42,0.08)" : "none" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── القائمة ── */}
      {visible.length === 0
        ? <div style={{ ...card, textAlign: "center", color: "#94A3B8", padding: 40, fontSize: 13 }}>📭 مفيش طلبات إجازة</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map(r => <RequestCard key={r.id} r={r} />)}
          </div>
      }

      {/* ═══ MODAL: طلب إجازة ═══ */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", position: "relative", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <button onClick={() => setShowAdd(false)} style={{ position: "absolute", top: 14, left: 14, background: "none", color: "#94A3B8", fontSize: 20 }}>✕</button>
            <h3 style={{ margin: "0 0 18px", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>🏖 طلب إجازة</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {isAdmin ? (
                <div>
                  <div style={label}>العضو *</div>
                  <select value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))} style={inp}>
                    <option value="">— اختاري —</option>
                    {members.map(m => {
                      const b = balanceOf(m.name);
                      return <option key={m.id} value={m.name}>{m.name} (متبقي {b.remaining})</option>;
                    })}
                  </select>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#64748B" }}>الطلب باسم <b style={{ color: "#0F172A" }}>{user.name}</b></div>
              )}

              <div>
                <div style={label}>نوع الإجازة *</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["full", "📅 يوم أو أكتر"], ["half", "🌗 نص يوم"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, kind: v }))}
                      style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${form.kind === v ? "#2563EB" : "#E2E8F0"}`, background: form.kind === v ? "#EFF6FF" : "#F8FAFC", color: form.kind === v ? "#2563EB" : "#64748B", fontSize: 13, fontWeight: form.kind === v ? 700 : 500 }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: form.kind === "half" ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={label}>{form.kind === "half" ? "التاريخ *" : "من *"}</div>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value }))} style={inp} />
                </div>
                {form.kind === "full" && (
                  <div>
                    <div style={label}>إلى *</div>
                    <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inp} />
                  </div>
                )}
              </div>

              {form.kind === "half" && (
                <div>
                  <div style={label}>الفترة *</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["morning", "☀️ صباحاً"], ["evening", "🌇 بعد الضهر"]].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setForm(f => ({ ...f, half_period: v }))}
                        style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: `2px solid ${form.half_period === v ? "#2563EB" : "#E2E8F0"}`, background: form.half_period === v ? "#EFF6FF" : "#F8FAFC", color: form.half_period === v ? "#2563EB" : "#64748B", fontSize: 13, fontWeight: 600 }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div style={label}>السبب *</div>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>

              {/* الحساب المباشر */}
              {check.days > 0 && (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#0F172A", lineHeight: 1.8 }}>
                  📊 هيتخصم <b style={{ color: "#2563EB", fontSize: 15 }}>{check.days}</b> يوم
                  {form.member_name && <> · الرصيد بعد الخصم <b style={{ color: "#059669" }}>{Math.max(0, balanceOf(form.member_name).remaining - check.days)}</b> يوم</>}
                  {check.dates.length > 0 && form.kind === "full" && (
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                      أيام العمل المحتسبة: {check.dates.length} (الجمعة والعطلات الرسمية مستبعدة)
                    </div>
                  )}
                </div>
              )}

              {check.warns.map((w, i) => (
                <div key={i} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#D97706", lineHeight: 1.6 }}>⚠️ {w}</div>
              ))}
              {check.errs.map((e, i) => (
                <div key={i} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#DC2626", lineHeight: 1.6 }}>🚫 {e}</div>
              ))}

              <button onClick={submitRequest} disabled={saving || check.errs.length > 0}
                style={{ background: (saving || check.errs.length > 0) ? "#CBD5E1" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
                {saving ? "جاري الإرسال..." : "إرسال الطلب ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: قرار ═══ */}
      {decide && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
              {decide.action === "approved" ? "✅ اعتماد الإجازة" : "❌ رفض الطلب"}
            </h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 14, lineHeight: 1.7 }}>
              {decide.req.member_name} — {decide.req.days} يوم
              {decide.action === "approved" && !decide.req.is_half_day && <><br />الأيام هتتسجل في الحضور كـ «في إجازة» تلقائياً.</>}
            </p>
            <div style={label}>ملاحظة {decide.action === "rejected" ? "(الأفضل تكتبي السبب)" : "(اختياري)"}</div>
            <textarea value={decideNote} onChange={e => setDecideNote(e.target.value)} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={applyDecision} disabled={saving}
                style={{ flex: 1, background: saving ? "#94A3B8" : decide.action === "approved" ? "#059669" : "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
                {saving ? "..." : "تأكيد"}
              </button>
              <button onClick={() => setDecide(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: حذف ═══ */}
      {confirmCancel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div dir="rtl" style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 8px 32px rgba(15,23,42,0.12)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>حذف الطلب؟</h3>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
              {confirmCancel.status === "approved"
                ? "الطلب معتمد — الحذف هيرجّع الأيام للرصيد ويشيلها من سجل الحضور."
                : "الطلب هيتمسح نهائياً."}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={cancelRequest} style={{ flex: 1, background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700 }}>احذفي</button>
              <button onClick={() => setConfirmCancel(null)} style={{ flex: 1, background: "#F1F5F9", color: "#64748B", padding: 12, borderRadius: 10, fontSize: 14 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
