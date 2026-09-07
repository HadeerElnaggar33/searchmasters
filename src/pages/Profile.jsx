import { useState, useEffect } from "react";
import { sb, formatDate, SB_URL, SB_KEY } from "../supabase.js";
import { uploadSticker } from "../stickers.js";

const SECTIONS = [
  {
    title: "١ · بيانات أساسية", icon: "👤",
    fields: [
      ["city", "المدينة أو المنطقة", "text", "القاهرة · المعادي"],
    ],
  },
  {
    title: "٢ · حاجات شخصية", icon: "💙",
    fields: [
      ["fav_colors", "الألوان المفضلة", "text", "أزرق، أبيض"],
      ["likes", "بتحب إيه", "area", "القراية · القهوة المختصة · النباتات"],
      ["dislikes", "ما بتحبش إيه", "area", "الزحمة · الاجتماعات الطويلة"],
      ["hobbies", "هوايات", "area", ""],
      ["fav_drink", "مشروب مفضل", "text", "قهوة سادة"],
      ["family", "الحالة الاجتماعية وأطفال", "text", "اختياري تماماً"],
      ["sizes", "مقاسات (للهدايا)", "text", "لبس L · حذاء 42"],
    ],
  },
  {
    title: "٣ · ظروف الشغل", icon: "💻",
    fields: [
      ["internet", "حالة الإنترنت", "text", "كويس · بيقطع أحياناً"],
      ["workspace", "مكان العمل مريح ولا لأ", "text", ""],
      ["device", "الجهاز المستخدم", "text", "لابتوب · موبايل"],
      ["best_hours", "أنسب أوقات للشغل", "text", "من ١٠ لـ ٤"],
      ["best_meeting", "أنسب أوقات للاجتماعات", "text", ""],
    ],
  },
  {
    title: "٤ · تحديات حالية", icon: "🧩",
    fields: [
      ["blockers", "إيه اللي بيعطّلك دلوقتي", "area", ""],
      ["need_help", "حاجة محتاج مساعدة فيها", "area", ""],
      ["affecting", "حاجة بتأثر على راحتك في الشغل", "area", ""],
    ],
  },
  {
    title: "٥ · هدايا نفسي فيها", icon: "🎁",
    fields: [
      ["gift_wishes", "هدايا نفسي فيها — سطر لكل هدية", "area", "سماعة\nكتاب عن التصميم"],
      ["gift_avoid", "حاجات ما تنفعنيش", "area", ""],
      ["kids_ages", "عندي أطفال؟ وأعمارهم", "text", "اختياري"],
      ["day_or_night", "بشتغل بالليل ولا بالنهار؟", "text", ""],
      ["gift_size", "حجم الهدية المفضل", "select", ""],
    ],
  },
];

const GIFT_SIZES = ["", "حاجة صغيرة أستخدمها كل يوم", "حاجة كبيرة مرة واحدة"];

export default function Profile({ user }) {
  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [profile, setProfile] = useState({});
  const [viewing, setViewing] = useState(user.name);
  const [viewedProfile, setViewedProfile] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [uploading, setUploading] = useState(false);
  const [maxKb, setMaxKb] = useState(400);

  const isAdmin = user.role === "admin";
  const isMine = viewing === user.name;

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "9px 12px", borderRadius: 10, fontSize: 14, outline: "none", width: "100%", direction: "rtl" };
  const card = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", marginBottom: 16 };
  const label = { fontSize: 12, color: "#64748B", marginBottom: 4, fontWeight: 600 };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadViewed(viewing); }, [viewing]);

  async function load() {
    const [m, st] = await Promise.all([
      sb("team_members?is_active=eq.true&order=name"),
      sb("app_settings?key=eq.avatar_max_kb"),
    ]);
    if (m) { setMembers(m); setMe(m.find(x => x.name === user.name) || null); }
    if (st && st[0]) setMaxKb(Number(st[0].value) || 400);
    setLoading(false);
  }

  async function loadViewed(name) {
    const rows = await sb(`member_profiles?member_name=eq.${encodeURIComponent(name)}`);
    const p = (rows && rows[0]) || { member_name: name };
    setViewedProfile(p);
    if (name === user.name) setProfile(p);
  }

  function flash(t) { setSaved(t); setTimeout(() => setSaved(""), 2500); }

  async function saveProfile() {
    setSaving(true);
    const payload = { ...profile, member_name: user.name, updated_at: new Date().toISOString() };
    const exists = await sb(`member_profiles?member_name=eq.${encodeURIComponent(user.name)}&select=member_name`);
    if (exists && exists.length) {
      await sb(`member_profiles?member_name=eq.${encodeURIComponent(user.name)}`, "PATCH", payload);
    } else {
      await sb("member_profiles", "POST", payload);
    }
    setSaving(false);
    flash("✅ اتحفظ");
    await loadViewed(user.name);
  }

  async function saveBasic(field, value) {
    if (!me) return;
    await sb(`team_members?id=eq.${me.id}`, "PATCH", { [field]: value });
    setMe(x => ({ ...x, [field]: value }));
    flash("✅ اتحفظ");
  }

  async function uploadAvatar(file) {
    if (!file) return;
    if (file.size > maxKb * 1024) { alert(`الصورة أكبر من ${maxKb} كيلوبايت`); return; }
    setUploading(true);
    // نستخدم نفس آلية رفع الاستيكرات — bucket «awards»
    const up = await uploadSticker(file, SB_URL, SB_KEY);
    if (!up || up.error) { setUploading(false); alert("الرفع فشل — " + ((up && up.error) || "")); return; }
    await sb(`team_members?id=eq.${me.id}`, "PATCH", { avatar_url: up.url });
    setMe(x => ({ ...x, avatar_url: up.url }));
    setMembers(list => list.map(x => x.id === me.id ? { ...x, avatar_url: up.url } : x));
    setUploading(false);
    flash("✅ الصورة اترفعت");
  }

  async function removeAvatar(target) {
    const m = members.find(x => x.name === target);
    if (!m) return;
    await sb(`team_members?id=eq.${m.id}`, "PATCH", { avatar_url: null });
    setMembers(list => list.map(x => x.id === m.id ? { ...x, avatar_url: null } : x));
    if (target === user.name) setMe(x => ({ ...x, avatar_url: null }));
    flash("اتشالت");
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>;

  const viewedMember = members.find(x => x.name === viewing) || me;
  const data = isMine ? profile : viewedProfile;
  const filled = Object.keys(data || {}).filter(k => !["member_name", "updated_at"].includes(k) && data[k]).length;

  const Avatar = ({ m, size = 90 }) => (
    m && m.avatar_url
      ? <img src={m.avatar_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "3px solid #E2E8F0" }} />
      : <div style={{ width: size, height: size, borderRadius: "50%", background: (m && m.avatar_color) || "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size / 2.4, fontWeight: 800, color: "#fff" }}>
          {(m && m.name && m.name[0]) || "?"}
        </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 780, margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>👤 البروفايل</h2>
        {saved && <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>{saved}</span>}
      </div>

      {/* المدير بيتنقل بين بروفايلات الفريق */}
      {isAdmin && (
        <div style={{ ...card, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, fontWeight: 600 }}>بروفايل مين؟</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {members.map(m => {
              const on = viewing === m.name;
              return (
                <button key={m.id} onClick={() => setViewing(m.name)}
                  style={{ padding: "6px 12px", borderRadius: 20, border: `2px solid ${on ? "#2563EB" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "#F8FAFC", color: on ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: on ? 700 : 500 }}>
                  {m.name}{m.name === user.name ? " (أنا)" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* لافتة الخصوصية */}
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 14, padding: "12px 15px", fontSize: 12, color: "#2563EB", marginBottom: 16, lineHeight: 1.9 }}>
        🔒 البيانات دي <b>مرئية ليك وللمدير بس</b> — محدش تاني في الفريق بيشوفها، ومش بتظهر في أي تقرير<br />
        ✅ <b>مالهاش أي علاقة بالتقييم ولا النقاط ولا موظف الشهر</b><br />
        ✏️ كل الخانات <b>اختيارية بالكامل</b> — املا اللي يريحك بس<br />
        <span style={{ color: "#64748B" }}>الاستثناء: الصورة الشخصية بتظهر لكل الفريق · وعيد الميلاد لو سيبتيه مفعّل</span>
      </div>

      {/* الصورة والبيانات الأساسية */}
      <div style={{ ...card, textAlign: "center" }}>
        <Avatar m={viewedMember} />
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginTop: 10 }}>{viewing}</div>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>{viewedMember && viewedMember.job_title}</div>

        {isMine && (
          <div style={{ marginTop: 12 }}>
            <input type="file" accept="image/png,image/jpeg,image/webp"
              onChange={e => uploadAvatar(e.target.files && e.target.files[0])}
              style={{ ...inp, padding: "8px 10px", fontSize: 12, marginBottom: 6 }} />
            <div style={{ fontSize: 10, color: "#94A3B8" }}>JPG · PNG · WEBP — أقل من {maxKb} كيلوبايت</div>
            {uploading && <div style={{ fontSize: 12, color: "#2563EB", marginTop: 5 }}>جاري الرفع...</div>}
          </div>
        )}

        {(isMine || isAdmin) && viewedMember && viewedMember.avatar_url && (
          <button onClick={() => removeAvatar(viewing)}
            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "5px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, marginTop: 8 }}>
            🗑 شيل الصورة
          </button>
        )}

        {isMine && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16, textAlign: "right" }}>
            <div>
              <div style={label}>تاريخ الميلاد</div>
              <input type="date" defaultValue={me && me.birthday ? String(me.birthday).slice(0, 10) : ""}
                onBlur={e => saveBasic("birthday", e.target.value || null)} style={inp} />
            </div>
            <div>
              <div style={label}>تاريخ الانضمام</div>
              <input type="date" defaultValue={me && me.joined_at ? String(me.joined_at).slice(0, 10) : ""}
                onBlur={e => saveBasic("joined_at", e.target.value || null)} style={inp} />
            </div>
          </div>
        )}

        {isMine && me && me.birthday && (
          <button onClick={() => saveBasic("birthday_public", me.birthday_public === false)}
            style={{ background: me.birthday_public === false ? "#F1F5F9" : "#ECFDF5", border: `1px solid ${me.birthday_public === false ? "#E2E8F0" : "#A7F3D0"}`, color: me.birthday_public === false ? "#94A3B8" : "#059669", padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginTop: 12 }}>
            {me.birthday_public === false ? "🔕 عيد ميلادي مخفي عن الفريق" : "🎂 الفريق يعرف بعيد ميلادي"}
          </button>
        )}

        {!isMine && viewedMember && viewedMember.birthday && (
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 10 }}>
            🎂 {formatDate(String(viewedMember.birthday).slice(0, 10))}
          </div>
        )}
      </div>

      {/* الأقسام */}
      {SECTIONS.map(sec => (
        <div key={sec.title} style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>{sec.icon} {sec.title}</div>
          {sec.fields.map(([key, lbl, type, ph]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={label}>{lbl}</div>
              {!isMine ? (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: data[key] ? "#0F172A" : "#94A3B8", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                  {data[key] || "— مكتبش حاجة"}
                </div>
              ) : type === "area" ? (
                <textarea value={profile[key] || ""} onChange={e => setProfile(f => ({ ...f, [key]: e.target.value }))}
                  rows={2} placeholder={ph} style={{ ...inp, resize: "vertical" }} />
              ) : type === "select" ? (
                <select value={profile[key] || ""} onChange={e => setProfile(f => ({ ...f, [key]: e.target.value }))} style={inp}>
                  {GIFT_SIZES.map(g => <option key={g} value={g}>{g || "— اختاري —"}</option>)}
                </select>
              ) : (
                <input value={profile[key] || ""} onChange={e => setProfile(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={ph} style={inp} />
              )}
            </div>
          ))}
        </div>
      ))}

      {isMine && (
        <button onClick={saveProfile} disabled={saving}
          style={{ width: "100%", background: saving ? "#94A3B8" : "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
          {saving ? "جاري الحفظ..." : "حفظ البروفايل ✓"}
        </button>
      )}

      {!isMine && (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: "#94A3B8" }}>
          إنتي بتقري بس — البروفايل بيملاه صاحبه بنفسه · {filled} خانة متملية
        </div>
      )}
    </div>
  );
}
