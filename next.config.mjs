import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Turbopack module root.
 * - Vercel / standalone Sentinel clone: this app directory.
 * - Local monorepo: parent workspace so hoisted deps (e.g. zod) resolve.
 * - Override anytime with TURBOPACK_ROOT.
 */
function resolveTurbopackRoot() {
  if (process.env.TURBOPACK_ROOT) {
    return path.resolve(process.env.TURBOPACK_ROOT);
  }
  const parentDir = path.resolve(__dirname, "..");
  const parentPkgPath = path.join(parentDir, "package.json");
  if (!existsSync(parentPkgPath)) return __dirname;
  try {
    const parentPkg = JSON.parse(readFileSync(parentPkgPath, "utf8"));
    if (Array.isArray(parentPkg.workspaces)) return parentDir;
  } catch {
    // Fall through to app root when parent package.json is unreadable.
  }
  return __dirname;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow HMR when opening the app via LAN IP (e.g. http://10.138.194.41:3000)
  allowedDevOrigins: ["10.138.194.41", "localhost", "127.0.0.1"],
  // Keep Prisma's generated engine external. The workspace wrapper must be
  // transpiled (not external) so Turbopack can resolve the monorepo package —
  // listing it in both arrays fatals; listing only as external causes MODULE_NOT_FOUND.
  serverExternalPackages: ["@prisma/client"],
  transpilePackages: ["@releasedesk/database"],
  turbopack: {
    root: resolveTurbopackRoot(),
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
