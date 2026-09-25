// Last-resort 404 for requests that never reach app/[locale] (the middleware
// rewrites virtually everything into the locale tree, where the branded,
// localized not-found page lives). Kept dependency-free on purpose.
export default function GlobalNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#FAF7F0", color: "#2B2418", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 56, fontWeight: 700, margin: 0 }}>404</p>
          <p style={{ margin: "8px 0 20px" }}>الصفحة غير موجودة · Page not found</p>
          <a href="/" style={{ color: "#8A6A2E", fontWeight: 600 }}>منصة جزيرة · Jazira</a>
        </main>
      </body>
    </html>
  );
}
