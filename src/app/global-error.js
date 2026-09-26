"use client";

import { useEffect } from "react";
import arCommon from "@/i18n/messages/ar/common";
import enCommon from "@/i18n/messages/en/common";

// Last-resort boundary: replaces the whole document when the locale root
// layout itself fails (so there is no I18nProvider, no stylesheet guarantee
// and no known locale). Dependency-free and bilingual: an Arabic block and an
// English block (lang="en" dir="ltr"), copy read straight from the message
// files, inline styles only.

const box = { maxWidth: 520, margin: "0 auto", padding: "0 24px" };
const button = {
  display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 20px", borderRadius: 999,
  border: 0, background: "#261F14", color: "#FFFBF2", font: "inherit", fontWeight: 500, cursor: "pointer",
};
const link = { display: "inline-flex", alignItems: "center", minHeight: 44, color: "#7A5923", fontWeight: 500 };

function Block({ locale, messages, reset, heading: Heading = "h1" }) {
  const home = locale === "en" ? "/en" : "/";
  return (
    <section lang={locale} dir={locale === "en" ? "ltr" : "rtl"} style={{ ...box, textAlign: "center" }}>
      <Heading style={{ fontSize: 26, lineHeight: 1.35, margin: "0 0 8px", color: "#261F14" }}>{messages.errors.genericTitle}</Heading>
      <p style={{ margin: "0 0 20px", color: "#706454" }}>{messages.errors.genericBody}</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => reset?.()} style={button}>{messages.actions.retry}</button>
        <a href={home} style={link}>{messages.actions.goHome}</a>
      </div>
    </section>
  );
}

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Surface the real error for developers / log drains; users see a calm message.
    console.error(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", alignContent: "center", gap: 40, padding: "48px 0", background: "#FAF7F0", color: "#4A4032", fontFamily: "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif", lineHeight: 1.7 }}>
        <main style={{ display: "grid", gap: 40 }}>
          <Block locale="ar" messages={arCommon} reset={reset} />
          <hr aria-hidden="true" style={{ width: 80, border: 0, borderTop: "1px solid rgba(122,98,58,.2)", margin: "0 auto" }} />
          <Block locale="en" messages={enCommon} reset={reset} heading="h2" />
        </main>
      </body>
    </html>
  );
}
