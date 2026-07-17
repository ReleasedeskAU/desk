import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow HMR when opening the app via LAN IP (e.g. http://10.138.194.41:3000)
  allowedDevOrigins: ["10.138.194.41", "localhost", "127.0.0.1"],
  // Keep Prisma's generated engine external. The workspace wrapper must be
  // transpiled (not external) so Turbopack can resolve the monorepo package —
  // listing it in both arrays fatals; listing only as external causes MODULE_NOT_FOUND.
  serverExternalPackages: ["@prisma/client"],
  transpilePackages: ["@releasedesk/database"],
  // Standalone Sentinel repo on Vercel: root is this app. Local monorepo can override via env.
  turbopack: {
    root: process.env.TURBOPACK_ROOT
      ? path.resolve(process.env.TURBOPACK_ROOT)
      : __dirname,
  },
  experimental: {
    optimizePackageImports: [
      "@mui/material",
      "@mui/icons-material",
      "lucide-react",
      "recharts",
    ],
  },
  /**
   * Baseline security headers for web-facing deployments.
   * CSP is intentionally modest so Clerk / Next assets keep working; tighten per environment as needed.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
