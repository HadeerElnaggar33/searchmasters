import { Component } from "react";

// ═══════════════════════════════════════════════════
//  حاجز الأخطاء — بدل الشاشة البيضا بيوري سبب المشكلة
// ═══════════════════════════════════════════════════

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App crash:", error, info);
    this.setState({ info });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const msg = String(this.state.error && (this.state.error.message || this.state.error));
    const stack = this.state.info && this.state.info.componentStack
      ? String(this.state.info.componentStack).split("\n").slice(0, 6).join("\n")
      : "";

    return (
      <div dir="rtl" style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Segoe UI',Tahoma,Arial,sans-serif" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: 20, padding: 26, maxWidth: 520, width: "100%", boxShadow: "0 8px 30px rgba(15,23,42,0.1)" }}>
          <div style={{ fontSize: 38, textAlign: "center", marginBottom: 10 }}>😕</div>
          <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#0F172A", textAlign: "center" }}>
            حصلت مشكلة في الصفحة
          </h2>
          <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 1.8, marginBottom: 16 }}>
            الأداة وقفت عن العرض. جربي تحدّثي الصفحة — ولو المشكلة اتكررت، ابعتي النص اللي تحت.
          </p>

          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "11px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 5 }}>تفاصيل الخطأ</div>
            <div style={{ fontSize: 12, color: "#0F172A", direction: "ltr", textAlign: "left", wordBreak: "break-word", lineHeight: 1.6 }}>{msg}</div>
            {stack && (
              <pre style={{ fontSize: 10, color: "#94A3B8", direction: "ltr", textAlign: "left", marginTop: 8, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{stack}</pre>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => window.location.reload()}
              style={{ flex: 1, background: "linear-gradient(135deg,#2563EB,#7C3AED)", color: "#fff", border: "none", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              حدّثي الصفحة
            </button>
            <button onClick={() => { try { navigator.clipboard.writeText(msg + "\n" + stack); } catch (e) { /* */ } }}
              style={{ background: "#F1F5F9", color: "#64748B", border: "none", padding: "12px 18px", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
              نسخ الخطأ
            </button>
          </div>
        </div>
      </div>
    );
  }
}
