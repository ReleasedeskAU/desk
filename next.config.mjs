import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Turbopack / file-tracing root.
 * - Vercel / standalone Sentinel clone: this app directory.
 * - Local monorepo: parent workspace so hoisted deps (e.g. zod) resolve.
 * - Override anytime with TURBOPACK_ROOT.
 */
function resolveWorkspaceRoot() {
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

/**
 * Absolute package dir for Turbopack resolveAlias when deps are hoisted
 * outside Sentinel/node_modules (npm workspaces).
 *
 * @param {string} name - Package name (e.g. "zod").
 * @returns {string | undefined} Absolute path to the package directory.
 */
function resolveHoistedPackageDir(name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    const hoisted = path.resolve(__dirname, "..", "node_modules", name);
    if (existsSync(path.join(hoisted, "package.json"))) return hoisted;
    return undefined;
  }
}

const workspaceRoot = resolveWorkspaceRoot();
const zodPackageDir = resolveHoistedPackageDir("zod");

/**
 * Prisma files that must be present on Vercel (Linux) serverless functions.
 * Intentionally narrow: do not glob the whole generated client — that also
 * ships Windows/Darwin engines and WASM (~40MB+) into every function and can
 * fail the "Deploying outputs" step with a generic Vercel error.
 */
// Use the real vendor path only — node_modules/@releasedesk/database is a
// file: symlink and Vercel rejects serverless packages that contain symlinks.
const PRISMA_TRACE_INCLUDES = [
  "./vendor/releasedesk-database/generated/client/**/*.js",
  "./vendor/releasedesk-database/generated/client/**/*.mjs",
  "./vendor/releasedesk-database/generated/client/**/*.json",
  "./vendor/releasedesk-database/generated/client/**/*.prisma",
  "./vendor/releasedesk-database/generated/client/libquery_engine-rhel-openssl-3.0.x.so.node",
];

/** Platform engines / types that must never be packaged into Vercel functions. */
const PRISMA_TRACE_EXCLUDES = [
  "**/query_engine-windows.dll.node",
  "**/libquery_engine-darwin*.node",
  "**/libquery_engine-debian*.node",
  "**/query_engine_bg.wasm",
  "**/generated/client/**/*.d.ts",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow HMR when opening the app via LAN IP (e.g. http://10.138.194.41:3000)
  allowedDevOrigins: ["10.138.194.41", "localhost", "127.0.0.1"],
  // Standalone/Vercel: app dir. Local monorepo: workspace root (hoisted node_modules).
  outputFileTracingRoot: workspaceRoot,
  // Keep Prisma engines outside the webpack bundle so .node binaries are not stripped.
  // Vendor package is file:-linked; externalize both the wrapper and @prisma/client.
  serverExternalPackages: ["@prisma/client", "@releasedesk/database", "prisma"],
  // Copy only the Linux query engine + JS client into API / RSC serverless traces.
  outputFileTracingIncludes: {
    "/api/**/*": PRISMA_TRACE_INCLUDES,
    "/(main)/**/*": PRISMA_TRACE_INCLUDES,
  },
  outputFileTracingExcludes: {
    "*": PRISMA_TRACE_EXCLUDES,
  },
  turbopack: {
    root: workspaceRoot,
    // npm workspaces hoist zod to the monorepo root; alias so Turbopack always finds it.
    ...(zodPackageDir
      ? {
          resolveAlias: {
            zod: path.relative(workspaceRoot, zodPackageDir).replace(/\\/g, "/") || ".",
          },
        }
      : {}),
  },
  webpack: (config, { isServer }) => {
    if (zodPackageDir) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        zod: zodPackageDir,
      };
    }
    // Ensures libquery_engine-rhel-openssl-3.0.x.so.node is copied next to server bundles.
    if (isServer) {
      config.plugins = [...(config.plugins ?? []), new PrismaPlugin()];

      // Instrumentation + file:-linked Prisma can still be walked by Webpack.
      // Keep Node builtins and the generated client external so `require('path')` resolves.
      const nodeBuiltins = new Set([
        "path",
        "fs",
        "os",
        "crypto",
        "stream",
        "util",
        "events",
        "diagnostics_channel",
        "async_hooks",
        "module",
        "url",
        "buffer",
        "net",
        "tls",
        "child_process",
      ]);
      const prismaExternals = new Set([
        "@prisma/client",
        "@releasedesk/database",
        "prisma",
      ]);

      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : config.externals
            ? [config.externals]
            : []),
        ({ request }, callback) => {
          if (!request) return callback();
          if (nodeBuiltins.has(request) || request.startsWith("node:")) {
            return callback(null, `commonjs ${request.replace(/^node:/, "")}`);
          }
          if (
            prismaExternals.has(request) ||
            request.includes("releasedesk-database/generated") ||
            request.includes("@prisma/client")
          ) {
            return callback(null, `commonjs ${request}`);
          }
          return callback();
        },
      ];
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
            // microphone=(self): required for Gemini Live voice capture on same origin.
            // camera/geolocation stay disabled. Empty microphone=() blocks getUserMedia even when Chrome UI says Allow.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
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
