// Web app manifest (served at /manifest.webmanifest). Arabic is the primary
// language; the English UI lives under /en.
export default function manifest() {
  return {
    name: "منصة جزيرة — Jazira",
    short_name: "جزيرة",
    description: "منصة تعليمية عربية: المناهج، والتدريب على القدرات والتحصيلي، ومجتمع تعليمي، ومساعد ذكي.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF7F0",
    theme_color: "#FAF7F0",
    categories: ["education"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
