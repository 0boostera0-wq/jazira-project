/** @type {import('next').NextConfig} */

// Baseline security headers. A nonce-based script CSP would force every page to
// render dynamically (hurting TTFB/caching), so the policy below locks down the
// high-value directives that don't depend on inline scripts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(self), microphone=(self), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://*.lemonsqueezy.com" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // user avatars & community media (Supabase Storage public buckets)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // Google account avatars (OAuth sign-in)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Illustrations are immutable per filename → cache hard at the edge & browser.
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
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
