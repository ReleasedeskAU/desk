import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

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

/** Vendored Prisma client + query engines that must ship with every serverless function. */
const PRISMA_ENGINE_TRACE_GLOBS = [
  "./vendor/releasedesk-database/generated/client/**/*",
  "./node_modules/@releasedesk/database/generated/client/**/*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow HMR when opening the app via LAN IP (e.g. http://10.138.194.41:3000)
  allowedDevOrigins: ["10.138.194.41", "localhost", "127.0.0.1"],
  // Keep Prisma engines outside the webpack bundle so .node binaries are not stripped.
  // Vendor package is file:-linked; externalize both the wrapper and @prisma/client.
  serverExternalPackages: ["@prisma/client", "@releasedesk/database", "prisma"],
  // Copy query engines into the Vercel serverless trace (custom output path).
  outputFileTracingIncludes: {
    "/*": PRISMA_ENGINE_TRACE_GLOBS,
    "/api/**/*": PRISMA_ENGINE_TRACE_GLOBS,
    "/(main)/**/*": PRISMA_ENGINE_TRACE_GLOBS,
  },
  turbopack: {
    root: resolveTurbopackRoot(),
  },
  webpack: (config, { isServer }) => {
    // Ensures libquery_engine-rhel-openssl-3.0.x.so.node is copied next to server bundles.
    if (isServer) {
      config.plugins = [...(config.plugins ?? []), new PrismaPlugin()];
    }
    return config;
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
