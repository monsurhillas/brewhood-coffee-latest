import type { NextConfig } from "next";

// Baseline security headers on every response. A full Content-Security-
// Policy is deliberately left out for now — the inline theme-init script
// in app/layout.tsx and the Google OAuth redirect flow would need a
// nonce-based CSP to keep working, which is worth doing carefully as a
// follow-up rather than risking breaking login here.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
