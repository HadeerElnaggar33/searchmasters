import { useState, useEffect } from "react";
import { sb } from "../supabase.js";

const CHECKLIST = [
  { key:"robots_txt", cat:"Technical SEO", sub:"Crawlability", title:"Robots.txt audit", desc:"Open /robots.txt. Verify no critical pages/folders are disallowed. Check for accidental blocks on CSS/JS.", tools:"Google Search Console, Screaming Frog", priority:"high" },
  { key:"xml_sitemap", cat:"Technical SEO", sub:"Crawlability", title:"XML sitemap validation", desc:"Check sitemap is submitted in GSC, returns 200, contains only indexable URLs, and has no errors.", tools:"GSC, Screaming Frog", priority:"high" },
  { key:"crawl_budget", cat:"Technical SEO", sub:"Crawlability", title:"Crawl budget check", desc:"Run site:domain.com and compare count vs GSC index coverage. Large diff = crawl waste.", tools:"GSC, Screaming Frog", priority:"medium" },
  { key:"canonical_tags", cat:"Technical SEO", sub:"Indexation", title:"Canonical tags", desc:"Every page must have a self-referencing canonical. Paginated pages should not canonicalize to page 1.", tools:"Screaming Frog, Ahrefs Site Audit", priority:"high" },
  { key:"noindex_audit", cat:"Technical SEO", sub:"Indexation", title:"Noindex audit", desc:"Find all noindex tags. Confirm none are on pages you want indexed. Check meta robots + X-Robots-Tag headers.", tools:"Screaming Frog, GSC Coverage", priority:"high" },
  { key:"redirect_chains", cat:"Technical SEO", sub:"Indexation", title:"Redirect chains & loops", desc:"Identify 301/302 chains longer than 1 hop. Fix to single direct redirect. Resolve any loops.", tools:"Screaming Frog, Redirect Checker", priority:"high" },
  { key:"core_web_vitals", cat:"Technical SEO", sub:"Site Speed", title:"Core Web Vitals (LCP, INP, CLS)", desc:"Run PageSpeed Insights. LCP <2.5s, INP <200ms, CLS <0.1. Fix worst offenders first.", tools:"PageSpeed Insights, CrUX, WebPageTest", priority:"high" },
  { key:"image_optimisation", cat:"Technical SEO", sub:"Site Speed", title:"Image optimisation", desc:"Compress images, serve WebP/AVIF, use width+height attributes to prevent CLS, lazy-load below fold.", tools:"Squoosh, Cloudflare Images, Screaming Frog", priority:"high" },
  { key:"third_party_scripts", cat:"Technical SEO", sub:"Site Speed", title:"Third-party script audit", desc:"Use Coverage tab in DevTools to find unused JS/CSS. Remove or defer tracking scripts not needed on load.", tools:"Chrome DevTools, GTmetrix", priority:"medium" },
  { key:"mobile_usability", cat:"Technical SEO", sub:"Mobile & HTTPS", title:"Mobile usability", desc:"Test all templates in GSC Mobile Usability report. Fix tap target too small, content wider than screen.", tools:"GSC, Google Mobile Friendly Test", priority:"high" },
  { key:"https_mixed", cat:"Technical SEO", sub:"Mobile & HTTPS", title:"HTTPS & mixed content", desc:"All pages on HTTPS. Check for mixed-content warnings (HTTP resources loaded on HTTPS page).", tools:"Why No Padlock, SSL Labs", priority:"high" },
  { key:"schema_impl", cat:"Technical SEO", sub:"Structured Data", title:"Schema implementation", desc:"Add Article, BreadcrumbList, FAQPage, Product, or HowTo schema where relevant. Validate with Rich Results Test.", tools:"Rich Results Test, Schema Markup Validator", priority:"high" },
  { key:"internal_link_depth", cat:"Technical SEO", sub:"Architecture", title:"Internal link depth", desc:"No important page should be more than 3 clicks from homepage. Check crawl depth report.", tools:"Screaming Frog, Sitebulb", priority:"medium" },
  { key:"orphan_pages", cat:"Technical SEO", sub:"Architecture", title:"Orphan pages", desc:"Find pages with zero internal links pointing to them. Add links from relevant pages or remove from sitemap.", tools:"Screaming Frog, Ahrefs", priority:"medium" },
  { key:"pagination_hreflang", cat:"Technical SEO", sub:"Architecture", title:"Pagination & hreflang", desc:"Use rel=next/prev correctly. Add hreflang on all multi-language pages.", tools:"Screaming Frog, Ahrefs", priority:"medium" },
  { key:"title_tags", cat:"On-Page SEO", sub:"Title & Meta", title:"Title tag check", desc:"Each page: unique, 50–60 chars, primary keyword near start, brand at end. No duplicates.", tools:"Screaming Frog, Ahrefs", priority:"high" },
  { key:"meta_desc", cat:"On-Page SEO", sub:"Title & Meta", title:"Meta description check", desc:"Unique, 130–155 chars, contains CTA or differentiator. Affects CTR.", tools:"Screaming Frog, SEMrush", priority:"medium" },
  { key:"h1_audit", cat:"On-Page SEO", sub:"Headings", title:"H1 audit", desc:"One H1 per page, includes primary keyword, matches page intent.", tools:"Screaming Frog, DevTools", priority:"high" },
  { key:"heading_hierarchy", cat:"On-Page SEO", sub:"Headings", title:"Heading hierarchy", desc:"H2s cover main subtopics; H3s cover sub-subtopics. No skipped levels (H1→H3).", tools:"Screaming Frog, HeadingsMap", priority:"medium" },
  { key:"url_structure", cat:"On-Page SEO", sub:"URL Structure", title:"URL optimisation", desc:"Short, lowercase, hyphen-separated, keyword-included. No parameters for static pages.", tools:"Screaming Frog", priority:"medium" },
  { key:"keyword_placement", cat:"On-Page SEO", sub:"Content Signals", title:"Keyword placement", desc:"Primary keyword in: H1, first 100 words, at least one H2, image alt text, URL.", tools:"SurferSEO, manual check", priority:"high" },
  { key:"lsi_terms", cat:"On-Page SEO", sub:"Content Signals", title:"LSI/semantic terms", desc:"Use NLP variants of main keyword naturally throughout. Run page through TF-IDF tool vs top 10.", tools:"SurferSEO, Clearscope, NeuronWriter", priority:"medium" },
  { key:"image_alt", cat:"On-Page SEO", sub:"Images", title:"Image alt text", desc:"Every content image has descriptive alt text with keyword where natural. Decorative images: alt=''.", tools:"Screaming Frog, Ahrefs", priority:"medium" },
  { key:"internal_links_page", cat:"On-Page SEO", sub:"Links", title:"Internal links on page", desc:"Every page links to at least 3–5 topically related internal pages using keyword-rich anchor text.", tools:"Screaming Frog, Ahrefs", priority:"high" },
  { key:"external_links", cat:"On-Page SEO", sub:"Links", title:"External link quality", desc:"Links to authoritative external sources (studies, gov, .edu).", tools:"Manual audit", priority:"low" },
  { key:"intent_match", cat:"Content SEO", sub:"Search Intent", title:"Intent match audit", desc:"Top 3 ranking pages for your keyword: are they informational, transactional, navigational? Your page must match.", tools:"Google SERP, Ahrefs SERP", priority:"high" },
  { key:"content_format", cat:"Content SEO", sub:"Search Intent", title:"Content format match", desc:"If SERPs show listicles, write a listicle. If they show how-to, write step-by-step.", tools:"Manual SERP check", priority:"high" },
  { key:"content_gap", cat:"Content SEO", sub:"Content Depth", title:"Content gap analysis", desc:"Compare your page vs top 3 results. Find subtopics they cover that you don't. Add missing sections.", tools:"Ahrefs Content Gap, SurferSEO, Frase", priority:"high" },
  { key:"word_count", cat:"Content SEO", sub:"Content Depth", title:"Word count vs competitors", desc:"Don't aim for arbitrary length. Match or slightly exceed median word count of top 5 results.", tools:"SurferSEO, manual count", priority:"medium" },
  { key:"content_freshness", cat:"Content SEO", sub:"Freshness", title:"Content freshness", desc:"Update any outdated stats, dates, or examples. Add 'Last updated' date where visible.", tools:"Manual review, Google Search", priority:"medium" },
  { key:"dead_links", cat:"Content SEO", sub:"Freshness", title:"Dead links in content", desc:"Check all outbound links return 200. Replace or remove any 404s.", tools:"Screaming Frog, Broken Link Checker", priority:"medium" },
  { key:"readability", cat:"Content SEO", sub:"Readability", title:"Readability score", desc:"Aim for Flesch-Kincaid Grade 7–9 for general audience. Short sentences, active voice.", tools:"Hemingway App, Yoast SEO", priority:"low" },
  { key:"pillar_cluster", cat:"Content SEO", sub:"Topical Cluster", title:"Pillar + cluster structure", desc:"Confirm pillar page exists. Confirm all cluster pages link back to pillar.", tools:"Ahrefs, manual audit", priority:"high" },
  { key:"backlink_audit", cat:"Off-Page SEO", sub:"Backlinks", title:"Backlink profile audit", desc:"Check for toxic/spammy links. Disavow if manual action risk.", tools:"Ahrefs, SEMrush, Google Disavow Tool", priority:"high" },
  { key:"competitor_link_gap", cat:"Off-Page SEO", sub:"Backlinks", title:"Competitor link gap", desc:"Find domains linking to top 3 competitors but not to you. Prioritise outreach.", tools:"Ahrefs Link Intersect, SEMrush", priority:"high" },
  { key:"anchor_text", cat:"Off-Page SEO", sub:"Backlinks", title:"Anchor text distribution", desc:"Check % of exact-match vs branded vs generic anchors. Over-optimised exact-match = Penguin risk.", tools:"Ahrefs, SEMrush", priority:"medium" },
  { key:"brand_mentions", cat:"Off-Page SEO", sub:"Brand Signals", title:"Brand mentions (unlinked)", desc:"Find unlinked brand mentions. Reach out for link conversion.", tools:"Ahrefs Mentions, Brand24, Google Alerts", priority:"medium" },
  { key:"gbp", cat:"Off-Page SEO", sub:"Local SEO", title:"Google Business Profile", desc:"Verify listing is complete: name, address, phone, hours, categories, photos, posts, Q&A.", tools:"Google Business Profile dashboard", priority:"medium" },
  { key:"nap_consistency", cat:"Off-Page SEO", sub:"Local SEO", title:"NAP consistency", desc:"Name, address, phone identical across all directories and on-site.", tools:"BrightLocal, Moz Local", priority:"medium" },
  { key:"paragraph_snippet", cat:"AEO", sub:"Featured Snippets", title:"Paragraph snippet optimisation", desc:"Provide a 40–60 word direct answer in the first paragraph after the H2, starting with the question keyword.", tools:"Ahrefs, manual SERP check", priority:"high" },
  { key:"list_snippet", cat:"AEO", sub:"Featured Snippets", title:"List snippet optimisation", desc:"For 'how to' or 'best X' queries: use a numbered or bulleted list with items under 8 words each.", tools:"Manual SERP check, Ahrefs", priority:"high" },
  { key:"table_snippet", cat:"AEO", sub:"Featured Snippets", title:"Table snippet optimisation", desc:"For comparison or data queries: use HTML table with clear headers.", tools:"Manual SERP check", priority:"medium" },
  { key:"paa_coverage", cat:"AEO", sub:"PAA", title:"PAA coverage", desc:"Extract all PAA questions for your keyword. Add an H2 or H3 for each with a direct 40-word answer.", tools:"AlsoAsked.com, AnswerThePublic, Ahrefs", priority:"high" },
  { key:"faq_schema", cat:"AEO", sub:"FAQ Schema", title:"FAQPage schema", desc:"Mark up your FAQ section with FAQPage + Question + Answer schema. Validate in Rich Results Test.", tools:"Rich Results Test, Schema.dev", priority:"high" },
  { key:"question_h2s", cat:"AEO", sub:"Question Intent", title:"Question-based H2s", desc:"Rewrite at least 3 H2s as natural language questions. Match exact PAA phrasing where possible.", tools:"AlsoAsked.com, SurferSEO", priority:"high" },
  { key:"conversational_kw", cat:"AEO", sub:"Voice Search", title:"Conversational keyword targeting", desc:"Include long-tail, natural-language phrases (6+ words). Optimise for 'near me' + local intent.", tools:"AnswerThePublic, SEMrush", priority:"medium" },
  { key:"speaking_readability", cat:"AEO", sub:"Voice Search", title:"Speaking speed readability", desc:"Voice answers are read aloud. Sentences must be short (<20 words). Test by reading out loud.", tools:"Hemingway App, manual test", priority:"low" },
  { key:"howto_schema", cat:"AEO", sub:"Structured Data", title:"HowTo schema", desc:"For any step-by-step content, add HowTo schema with step name and description.", tools:"Rich Results Test", priority:"medium" },
  { key:"speakable_schema", cat:"AEO", sub:"Structured Data", title:"Speakable schema", desc:"Add Speakable schema to 2–3 key headline/summary sections. Targets Google Assistant.", tools:"Google Structured Data docs", priority:"low" },
  { key:"entity_definition", cat:"GEO", sub:"Entity Clarity", title:"Entity definition", desc:"First paragraph of every page must clearly state: what the entity is, what it does, who it serves.", tools:"Manual audit, Surfer, Frase", priority:"high" },
  { key:"entity_disambiguation", cat:"GEO", sub:"Entity Clarity", title:"Entity disambiguation", desc:"Use full brand/product name on first mention. Don't abbreviate without defining.", tools:"Manual content review", priority:"high" },
  { key:"topical_coverage", cat:"GEO", sub:"Topical Authority", title:"Topical coverage depth", desc:"For each core topic, verify you have: a pillar page + 5+ cluster pages.", tools:"Ahrefs Site Explorer, manual topic map", priority:"high" },
  { key:"cited_sources", cat:"GEO", sub:"Topical Authority", title:"Cited sources in content", desc:"Cite authoritative external sources (studies, reports, official data) with hyperlinks.", tools:"Manual audit", priority:"high" },
  { key:"author_bio", cat:"GEO", sub:"Author Signals", title:"Author bio & E-E-A-T", desc:"Every article has a named author with bio, credentials, links to LinkedIn/social.", tools:"Manual check, Schema markup", priority:"high" },
  { key:"about_page", cat:"GEO", sub:"Author Signals", title:"About page & contact info", desc:"Clear About page with team info, location, year founded. Contact page with real email/phone.", tools:"Manual audit", priority:"high" },
  { key:"article_schema", cat:"GEO", sub:"Structured Data", title:"Article + Author schema", desc:"Implement Article schema with author, datePublished, dateModified, publisher, and headline.", tools:"Rich Results Test, manual JSON-LD", priority:"high" },
  { key:"org_schema", cat:"GEO", sub:"Structured Data", title:"Organization schema + sameAs", desc:"Add Organization schema with name, url, logo, sameAs (Wikipedia, Wikidata, social profiles).", tools:"Schema.org, Rich Results Test", priority:"high" },
  { key:"plain_definitions", cat:"GEO", sub:"Content Clarity for AI", title:"Plain-language definitions", desc:"Define every technical term in plain language on first use. Make definitions quotable.", tools:"Manual content review", priority:"high" },
  { key:"tldr_section", cat:"GEO", sub:"Content Clarity for AI", title:"Summary / TL;DR section", desc:"Add a 3–5 bullet TL;DR or Key Takeaways block at the top of long articles.", tools:"Manual content edit", priority:"high" },
  { key:"stat_blocks", cat:"GEO", sub:"Content Clarity for AI", title:"Statistic & data blocks", desc:"Present key stats in isolated, clearly formatted blocks (bold + source).", tools:"Manual content design", priority:"medium" },
  { key:"semantic_internal", cat:"GEO", sub:"Internal Linking", title:"Semantic internal linking", desc:"Link to related entities and concepts by name — not just 'click here'. Anchor text = entity name.", tools:"Screaming Frog anchor report, Ahrefs", priority:"high" },
  { key:"breadcrumbs", cat:"GEO", sub:"Internal Linking", title:"Breadcrumb navigation", desc:"Implement breadcrumbs on all pages + BreadcrumbList schema. Helps AI understand site hierarchy.", tools:"Rich Results Test, Yoast SEO", priority:"medium" },
  { key:"nlp_coverage", cat:"GEO", sub:"Semantic Coverage", title:"NLP keyword coverage", desc:"Run top-ranking pages through NLP tool. Ensure your page covers the same key entities and concepts.", tools:"Clearscope, MarketMuse, SurferSEO", priority:"high" },
  { key:"wikipedia_presence", cat:"GEO", sub:"Semantic Coverage", title:"Wikipedia / Wikidata presence", desc:"If brand/topic is notable, verify a Wikipedia entry or Wikidata item exists and references your site.", tools:"Wikipedia, Wikidata, manual check", priority:"medium" },
  { key:"consistent_terminology", cat:"GEO", sub:"Semantic Coverage", title:"Consistent terminology", desc:"Use the same term for the same concept throughout the site. Inconsistency confuses AI parsers.", tools:"Manual content audit", priority:"medium" },
  { key:"bounce_dwell", cat:"UX & Engagement", sub:"Engagement Signals", title:"Bounce rate & dwell time", desc:"Check GSC CTR vs GA4 engagement rate. Low dwell + high bounce = intent mismatch or slow load.", tools:"GA4, GSC", priority:"high" },
  { key:"scroll_depth", cat:"UX & Engagement", sub:"Engagement Signals", title:"Scroll depth", desc:"Track scroll depth on key pages. If <50% users reach the main body, improve above-the-fold content.", tools:"GA4, Hotjar, Microsoft Clarity", priority:"medium" },
  { key:"cta_above_fold", cat:"UX & Engagement", sub:"Navigation UX", title:"Clear CTAs above fold", desc:"Every landing page must have a visible, clear CTA above the fold.", tools:"Manual UX review, Hotjar", priority:"high" },
  { key:"nav_audit", cat:"UX & Engagement", sub:"Navigation UX", title:"Navigation audit", desc:"Menu is logical, items labelled clearly. Mobile hamburger works. No orphaned mega-menu links.", tools:"Manual audit, mobile emulation", priority:"medium" },
  { key:"accessibility", cat:"UX & Engagement", sub:"Accessibility", title:"Core accessibility checks", desc:"Run Lighthouse accessibility audit. Fix: missing alt text, low contrast, missing form labels.", tools:"Lighthouse, axe DevTools", priority:"medium" },
  { key:"font_contrast", cat:"UX & Engagement", sub:"Accessibility", title:"Font size & contrast", desc:"Body text min 16px. Contrast ratio ≥4.5:1 for normal text.", tools:"WebAIM Contrast Checker, Lighthouse", priority:"medium" },
  { key:"interstitials", cat:"UX & Engagement", sub:"Page Experience", title:"Interstitial / popup audit", desc:"No intrusive interstitials on mobile on page load. Popups must be dismissible.", tools:"Manual check on mobile, GSC Page Experience", priority:"high" },
  { key:"404_management", cat:"UX & Engagement", sub:"Page Experience", title:"404 error management", desc:"Custom 404 page with navigation links. Monitor 404s in GSC and fix or redirect high-traffic ones.", tools:"GSC Coverage, Screaming Frog", priority:"medium" },
];

const CATS = [...new Set(CHECKLIST.map(i => i.cat))];
const STATUS_OPT = [
  { v:"todo",        l:"To Do",       color:"#64748B", bg:"#F1F5F9" },
  { v:"in_progress", l:"In Progress", color:"#2563EB", bg:"#EFF6FF" },
  { v:"done",        l:"Done",        color:"#059669", bg:"#ECFDF5" },
  { v:"na",          l:"N/A",         color:"#94A3B8", bg:"#F8FAFC" },
];
const PRIORITY_COLOR = { high:"#DC2626", medium:"#D97706", low:"#64748B" };

export default function SeoChecklist({ user }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [checklist, setChecklist] = useState({});
  const [notes, setNotes] = useState({});
  const [editNoteKey, setEditNoteKey] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  const isAdmin = user.role === "admin" || user.role === "team_leader";

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (selectedProject) loadChecklist(); }, [selectedProject]);

  async function loadProjects() {
    const p = await sb("projects?order=name");
    if (p) { setProjects(p); if (p.length > 0) setSelectedProject(p[0].id); }
  }

  async function loadChecklist() {
    setLoading(true);
    const data = await sb(`seo_checklist?project_id=eq.${selectedProject}`);
    const map = {}; const notesMap = {};
    if (data) data.forEach(r => { map[r.item_key] = r.status; notesMap[r.item_key] = r.notes || ""; });
    setChecklist(map);
    setNotes(notesMap);
    setLoading(false);
  }

  async function updateStatus(key, status) {
    if (!isAdmin) return;
    setSaving(true);
    const existing = await sb(`seo_checklist?project_id=eq.${selectedProject}&item_key=eq.${key}`);
    if (existing && existing.length > 0) {
      await sb(`seo_checklist?project_id=eq.${selectedProject}&item_key=eq.${key}`, "PATCH", { status, updated_by: user.name, updated_at: new Date().toISOString() });
    } else {
      await sb("seo_checklist", "POST", { project_id: selectedProject, item_key: key, status, updated_by: user.name });
    }
    setChecklist(prev => ({ ...prev, [key]: status }));
    setSaving(false);
  }

  async function saveNote(key) {
    if (!isAdmin) return;
    const existing = await sb(`seo_checklist?project_id=eq.${selectedProject}&item_key=eq.${key}`);
    if (existing && existing.length > 0) {
      await sb(`seo_checklist?project_id=eq.${selectedProject}&item_key=eq.${key}`, "PATCH", { notes: notes[key] || "", updated_by: user.name, updated_at: new Date().toISOString() });
    } else {
      await sb("seo_checklist", "POST", { project_id: selectedProject, item_key: key, status: "todo", notes: notes[key] || "", updated_by: user.name });
    }
    setEditNoteKey(null);
  }

  const filtered = CHECKLIST.filter(item => {
    if (filterCat !== "all" && item.cat !== filterCat) return false;
    if (filterStatus !== "all" && (checklist[item.key] || "todo") !== filterStatus) return false;
    if (filterPriority !== "all" && item.priority !== filterPriority) return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase()) && !item.sub.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalDone = CHECKLIST.filter(i => checklist[i.key] === "done").length;
  const totalInProgress = CHECKLIST.filter(i => checklist[i.key] === "in_progress").length;
  const totalNA = CHECKLIST.filter(i => checklist[i.key] === "na").length;
  const applicable = CHECKLIST.length - totalNA;
  const pct = applicable > 0 ? Math.round((totalDone / applicable) * 100) : 0;

  const grouped = CATS.map(cat => ({
    cat,
    items: filtered.filter(i => i.cat === cat),
  })).filter(g => g.items.length > 0);

  const inp = { background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0F172A", padding: "8px 12px", borderRadius: 8, fontSize: 13, outline: "none", direction: "rtl" };

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>🔍 SEO Audit Checklist</h2>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ ...inp, fontWeight: 600, fontSize: 14 }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Progress */}
      {selectedProject && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>التقدم الإجمالي</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{totalDone} من {applicable} عنصر ({totalNA} غير منطبق)</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: pct >= 80 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626" }}>{pct}%</div>
          </div>
          <div style={{ background: "#F1F5F9", borderRadius: 8, height: 10, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: pct+"%", height: "100%", background: pct >= 80 ? "linear-gradient(90deg,#10B981,#059669)" : pct >= 50 ? "linear-gradient(90deg,#F59E0B,#D97706)" : "linear-gradient(90deg,#EF4444,#DC2626)", borderRadius: 8, transition: "width 0.5s" }}></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8 }}>
            {[
              { l:"مكتمل", v:totalDone, c:"#059669", bg:"#ECFDF5" },
              { l:"جاري", v:totalInProgress, c:"#2563EB", bg:"#EFF6FF" },
              { l:"To Do", v:CHECKLIST.filter(i=>!checklist[i.key]||checklist[i.key]==="todo").length, c:"#64748B", bg:"#F1F5F9" },
              { l:"N/A", v:totalNA, c:"#94A3B8", bg:"#F8FAFC" },
            ].map(s => (
              <div key={s.l} style={{ textAlign: "center", background: s.bg, borderRadius: 10, padding: "8px 4px", border: `1px solid ${s.c}22` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث..." style={{ ...inp, flex: 1, minWidth: 150 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inp }}>
          <option value="all">كل الأقسام</option>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp }}>
          <option value="all">كل الحالات</option>
          {STATUS_OPT.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...inp }}>
          <option value="all">كل الأولويات</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟠 Medium</option>
          <option value="low">🟢 Low</option>
        </select>
        {saving && <span style={{ fontSize: 12, color: "#2563EB", alignSelf: "center" }}>● حفظ...</span>}
      </div>

      {loading
        ? <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>جاري التحميل...</div>
        : grouped.map(({ cat, items }) => (
          <div key={cat} style={{ marginBottom: 20 }}>
            {/* Category Header */}
            <div style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", borderRadius: 12, padding: "10px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#FFFFFF" }}>{cat}</span>
              <span style={{ fontSize: 12, color: "#BFDBFE" }}>
                {items.filter(i => checklist[i.key] === "done").length}/{items.length} مكتمل
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map(item => {
                const status = checklist[item.key] || "todo";
                const st = STATUS_OPT.find(s => s.v === status) || STATUS_OPT[0];
                const isExpanded = expandedItems[item.key];
                const note = notes[item.key] || "";

                return (
                  <div key={item.key} style={{ background: "#FFFFFF", border: `1px solid ${status === "done" ? "#A7F3D0" : status === "in_progress" ? "#BFDBFE" : "#E2E8F0"}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                    <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {/* Status Toggle */}
                      {isAdmin ? (
                        <select
                          value={status}
                          onChange={e => updateStatus(item.key, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 8, padding: "3px 6px", fontWeight: 700, flexShrink: 0, cursor: "pointer" }}
                        >
                          {STATUS_OPT.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11, background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 8, padding: "3px 8px", fontWeight: 700, flexShrink: 0 }}>{st.l}</span>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{item.title}</span>
                          <span style={{ fontSize: 10, color: "#94A3B8", background: "#F1F5F9", padding: "1px 6px", borderRadius: 4 }}>{item.sub}</span>
                          <span style={{ fontSize: 10, color: PRIORITY_COLOR[item.priority], fontWeight: 700 }}>{item.priority === "high" ? "🔴" : item.priority === "medium" ? "🟠" : "🟢"} {item.priority}</span>
                        </div>
                      </div>

                      <button onClick={() => setExpandedItems(prev => ({ ...prev, [item.key]: !isExpanded }))} style={{ background: "none", color: "#94A3B8", fontSize: 16, flexShrink: 0, padding: "0 4px" }}>
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F1F5F9" }}>
                        <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6, margin: "10px 0 6px" }}>{item.desc}</p>
                        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>🛠 {item.tools}</div>

                        {/* Notes */}
                        {editNoteKey === item.key ? (
                          <div>
                            <textarea
                              value={note}
                              onChange={e => setNotes(prev => ({ ...prev, [item.key]: e.target.value }))}
                              rows={3}
                              placeholder="أضف ملاحظاتك هنا..."
                              style={{ width: "100%", background: "#F8FAFC", border: "1.5px solid #2563EB", color: "#0F172A", padding: "8px 12px", borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", direction: "rtl", fontFamily: "inherit" }}
                            />
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <button onClick={() => saveNote(item.key)} style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>حفظ</button>
                              <button onClick={() => setEditNoteKey(null)} style={{ background: "#F1F5F9", color: "#64748B", padding: "6px 14px", borderRadius: 8, fontSize: 12 }}>إلغاء</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            {note
                              ? <div style={{ flex: 1, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#92400E" }}>📝 {note}</div>
                              : <div style={{ flex: 1, color: "#CBD5E1", fontSize: 12, fontStyle: "italic" }}>لا توجد ملاحظات</div>
                            }
                            {isAdmin && (
                              <button onClick={() => setEditNoteKey(item.key)} style={{ background: "#F1F5F9", color: "#2563EB", padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>✏️ ملاحظة</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
