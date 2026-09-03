// ═══════════════════════════════════════════════════
//  Search Masters Workspace — المهمة اليومية
//  المرحلة 1: فحص التوصيلة فقط — لا يكتب أي بيانات
// ═══════════════════════════════════════════════════

export default async function handler(req, res) {
  const startedAt = new Date().toISOString();

  // ── 1) التحقق من هوية المُنادي (لو المفتاح موجود) ──
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    const fromVercelCron = auth === `Bearer ${secret}`;
    const manualKey = req.query && req.query.key === secret;
    if (!fromVercelCron && !manualKey) {
      return res.status(401).json({
        ok: false,
        error: "غير مصرّح",
        hint: "للاختبار اليدوي ضيفي ?key=CRON_SECRET في آخر الرابط",
      });
    }
  }

  // ── 2) قراءة إعدادات Supabase من متغيرات البيئة ──
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_KEY;

  if (!URL || !KEY) {
    return res.status(500).json({
      ok: false,
      stage: "متغيرات البيئة",
      error: "متغيرات Supabase ناقصة",
      missing: [!URL && "SUPABASE_URL", !KEY && "SUPABASE_KEY"].filter(Boolean),
      fix: "Vercel ← Project ← Settings ← Environment Variables ← ضيفي المتغيرين ← بعدين Redeploy",
    });
  }

  // ── 3) اختبار القراءة من قاعدة البيانات (قراءة فقط) ──
  async function read(path) {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
    return await r.json();
  }

  try {
    const [members, rules, holidays, settings] = await Promise.all([
      read("team_members?is_active=eq.true&select=name"),
      read("recurring_tasks?is_active=eq.true&select=id,title,frequency"),
      read("holidays?select=date,name"),
      read("app_settings?select=key,value"),
    ]);

    const now = new Date();
    const cairo = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3

    return res.status(200).json({
      ok: true,
      message: "✅ التوصيلة شغالة — لسه مفيش أي كتابة على قاعدة البيانات",
      mode: "فحص فقط (dry run)",
      triggeredBy: req.headers.authorization ? "Vercel Cron" : "فتح يدوي من المتصفح",
      time: {
        utc: startedAt,
        cairoApprox: cairo.toISOString().replace("T", " ").slice(0, 16),
      },
      database: {
        activeMembers: members.length,
        activeRecurringRules: rules.length,
        recurringTitles: rules.map(r => `${r.title} (${r.frequency})`),
        holidays: holidays.length,
        settingsKeys: settings.map(s => s.key),
      },
      nextStep: "بعد ما تتأكدي إن الأرقام دي صح، نفعّل الشغل الحقيقي",
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      stage: "الاتصال بقاعدة البيانات",
      error: String(e.message || e),
    });
  }
}
