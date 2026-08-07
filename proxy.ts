import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Legacy /api/auth/login removed from public allowlist — Clerk-only auth.
  // Dev-only overlay diagnostic (no auth). Safe: no secrets, local verification only.
  ...(process.env.NODE_ENV === "development"
    ? [
        "/dev/sidebar-peek-test(.*)",
        "/dev/detail-visual-preview(.*)",
        // TEMPORARY — remove with app/(main)/dev/lifecycle-ui-preview after Wave-1 screenshots
        "/dev/lifecycle-ui-preview(.*)",
      ]
    : []),
]);

/** Origins allowed to present Clerk session JWTs (azp). Must include the URL users actually visit. */
function buildAuthorizedParties(): string[] {
  const parties = new Set<string>();
  const add = (v?: string | null) => {
    if (!v) return;
    const trimmed = v.trim().replace(/\/$/, "");
    if (!trimmed) return;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      parties.add(trimmed);
    } else {
      parties.add(`https://${trimmed}`);
    }
  };

  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  add(process.env.VERCEL_URL);
  // Production alias used in the wild — keep even if env vars lag behind DNS.
  add("https://releasedesk.vercel.app");

  if (process.env.NODE_ENV === "development") {
    add("http://localhost:3000");
    add("http://127.0.0.1:3000");
    add("http://localhost:3010");
    add("http://127.0.0.1:3010");
    add("http://10.138.194.41:3000");
  }

  return [...parties];
}

const authorizedParties = buildAuthorizedParties();

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl;
    if (pathname === "/login" || pathname.startsWith("/login/")) {
      const signIn = new URL("/sign-in", req.url);
      const next = req.nextUrl.searchParams.get("next");
      if (next) signIn.searchParams.set("redirect_url", next);
      return NextResponse.redirect(signIn);
    }

    if (isPublicRoute(req)) return;

    const { userId } = await auth();
    if (!userId) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const signIn = new URL("/sign-in", req.url);
      // Prefer dashboard as the post-login landing when the user hit `/`.
      const nextPath = pathname === "/" ? "/dashboard" : pathname + req.nextUrl.search;
      signIn.searchParams.set("redirect_url", nextPath);
      return NextResponse.redirect(signIn);
    }

    return NextResponse.next();
  },
  process.env.NODE_ENV === "production" && authorizedParties.length > 0
    ? { authorizedParties }
    : undefined
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
