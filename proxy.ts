import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkAuthorizedOrigins } from "@/lib/clerk-authorized-origins";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Temporary Ask test route — handler fail-closes unless ASK_TEST_ENABLED=true.
  "/api/ask/test",
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
  (req) => {
    if (process.env.NODE_ENV !== "production") return {};
    // Include the host the user opened (desk-release-desk1.vercel.app), not only
    // the older releasedesk.vercel.app alias. Vercel sets Host; do not take it from the client.
    const authorizedParties = clerkAuthorizedOrigins([req.nextUrl.origin]);
    return authorizedParties.length > 0 ? { authorizedParties } : {};
  }
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
