import type { NextConfig } from "next";

// GH_PAGES=1 builds a static mirror for GitHub Pages (served from /nova-ai-3d).
// The normal build (Vercel) is unchanged.
const isPages = process.env.GH_PAGES === "1";
const PAGES_BASE = "/nova-ai-3d";

// Basic hardening headers. No CSP on purpose: the inline motion boot script and Next's inline
// scripts would need nonces, which would also turn the static page into a dynamic one.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isPages
    ? {
        // Static export: no server, so no custom headers (Pages can't send them anyway).
        output: "export",
        basePath: PAGES_BASE,
        assetPrefix: PAGES_BASE,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [{ source: "/:path*", headers: SECURITY_HEADERS }];
        },
      }),
};

export default nextConfig;
