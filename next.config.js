/** @type {import('next').NextConfig} */

// Baseline security headers. A nonce-based script CSP would force every page to
// render dynamically (hurting TTFB/caching), so scripts are limited to this
// origin (+ Next's inline bootstrap) and every other fetch / image / media /
// frame source is allow-listed: an injected script could not load code from,
// or send data to, anywhere but this site and the project's Supabase.
const isDev = process.env.NODE_ENV !== "production";

function supabaseOrigins() {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (u.protocol !== "https:" && u.protocol !== "http:") return { http: [], ws: [] };
    return { http: [u.origin], ws: [u.origin.replace(/^http/, "ws")] };
  } catch {
    return { http: [], ws: [] };
  }
}

function contentSecurityPolicy() {
  const sb = supabaseOrigins();
  const directives = {
    "default-src": ["'self'"],
    // 'unsafe-inline': Next's inline hydration scripts (no nonce, see above);
    // 'unsafe-eval' only for the dev server's fast refresh.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Google account pictures are shown as avatars until a member uploads one.
    "img-src": ["'self'", "data:", "blob:", ...sb.http, "https://*.googleusercontent.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...sb.http, ...sb.ws, ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : [])],
    "media-src": ["'self'", "blob:", ...sb.http],
    // The PDF viewer shows authorised files as blob: URLs in a frame.
    "frame-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-ancestors": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "form-action": ["'self'", "https://*.lemonsqueezy.com"],
  };
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(self), microphone=(self), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig = {
  // Lets a production build run beside `next dev` locally (NEXT_DIST_DIR=.next-prod).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // The Image Optimization API (/_next/image) stays switched off: with a custom
  // loader it answers 404 when self-hosted and Vercel provisions no optimizer.
  // Keeping the optimizer on — with remote patterns for *.supabase.co and AVIF
  // decoding — exposed next@14's optimizer advisories (GHSA-2xp9-vwfh-vxw4 AVIF
  // RCE and the SSRF/DoS family) to anyone who can host an image.
  // Library art (ui/Illustration → next/image) is pre-rendered at build time by
  // scripts/process-illustrations.mjs; the loader only maps a logical src + the
  // requested width to one of those files. The widths below must equal
  // IMAGE_WIDTHS in src/lib/image-loader.js. User media uses plain <img>/<video>.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.js",
    deviceSizes: [640, 960, 1280, 1536],
    imageSizes: [256, 384],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Illustrations keep their file names when the art is redrawn
      // (scripts/process-illustrations.mjs rewrites in place), so they are NOT
      // immutable: a day fresh, then served stale while revalidating.
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
  async redirects() {
    return [
      // legacy AI assistant entry point → dedicated page
      { source: "/ai", destination: "/assistant", permanent: true },
      { source: "/en/ai", destination: "/en/assistant", permanent: true },
    ];
  },
};

module.exports = nextConfig;
