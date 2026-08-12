"use client";

import { SignIn } from "@clerk/nextjs";
import { useEffect, useState } from "react";

const CLERK_APPEARANCE = {
  elements: {
    rootBox: "w-full mx-auto",
    cardBox: "w-full",
    card: "shadow-theme-md border border-gray-200 bg-white",
    headerTitle: "text-gray-900",
    headerSubtitle: "text-gray-600",
    formFieldLabel: "text-gray-700",
    formFieldInput: "bg-white text-gray-900 border-gray-300",
    formButtonPrimary: "bg-brand-500 hover:bg-brand-600",
    footerActionLink: "text-brand-600",
  },
} as const;

/** True when Clerk’s SignIn UI has painted something detectable in the host. */
function clerkSignInMounted(host: HTMLElement | null): boolean {
  if (!host) return false;
  return Boolean(
    host.querySelector(
      "[data-clerk-component], .cl-rootBox, .cl-card, iframe[src*='clerk'], iframe[src*='accounts.dev']"
    )
  );
}

export function ClerkSignIn() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [loadFailed, setLoadFailed] = useState(false);
  const [pageOrigin, setPageOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    setPageOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!publishableKey) return;
    const host = document.querySelector(".clerk-sign-in-host");
    // Slow networks / first Clerk.js download often exceed 5s locally.
    const timer = window.setTimeout(() => {
      if (!clerkSignInMounted(host as HTMLElement | null)) setLoadFailed(true);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [publishableKey]);

  if (!publishableKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Sign-in is not configured for this deployment</p>
        <p className="mt-2 text-amber-900/90">
          Add <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code className="rounded bg-amber-100 px-1">CLERK_SECRET_KEY</code> to{" "}
          <code className="rounded bg-amber-100 px-1">Sentinel/.env</code> (local) or Vercel → Settings →
          Environment Variables, then restart <code className="rounded bg-amber-100 px-1">npm run dev</code>.
        </p>
      </div>
    );
  }

  if (loadFailed) {
    const isLocal =
      pageOrigin.includes("localhost") || pageOrigin.includes("127.0.0.1");
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
        <p className="font-semibold">Clerk sign-in failed to load</p>
        {isLocal ? (
          <>
            <p className="mt-2 text-rose-900/90">
              Local origin: <code className="rounded bg-rose-100 px-1">{pageOrigin}</code>. Keys are
              present, but the Clerk widget never mounted. Usually one of:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-rose-900/90">
              <li>
                Restart the Next dev server from <code className="rounded bg-rose-100 px-1">Sentinel/</code>{" "}
                after editing <code className="rounded bg-rose-100 px-1">.env</code> (Clerk keys live there,
                not only in <code className="rounded bg-rose-100 px-1">.env.local</code>).
              </li>
              <li>
                Clerk Dashboard → <strong>Configure → Paths</strong>: sign-in path{" "}
                <code className="rounded bg-rose-100 px-1">/sign-in</code>.
              </li>
              <li>
                Allow this origin on the Clerk instance (Development):
              </li>
            </ol>
            <pre className="mt-2 overflow-x-auto rounded bg-rose-100/80 p-2 text-[11px] text-rose-950">
{`curl -X PATCH https://api.clerk.com/v1/instance \\
  -H "Authorization: Bearer YOUR_CLERK_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"allowed_origins":["${pageOrigin}","http://127.0.0.1:3000"]}'`}
            </pre>
            <p className="mt-2 text-rose-900/90">
              Also check the browser console/network tab for blocked requests to{" "}
              <code className="rounded bg-rose-100 px-1">*.clerk.accounts.dev</code> (ad-blockers often
              break this).
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-rose-900/90">
              <strong>On Vercel with test keys (`pk_test_…`):</strong> open Clerk Dashboard →{" "}
              <strong>Configure → Paths</strong> and confirm sign-in is{" "}
              <code className="rounded bg-rose-100 px-1">/sign-in</code>. Then allow this site origin
              (e.g. <code className="rounded bg-rose-100 px-1">{pageOrigin}</code>) once:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-rose-100/80 p-2 text-[11px] text-rose-950">
{`curl -X PATCH https://api.clerk.com/v1/instance \\
  -H "Authorization: Bearer YOUR_CLERK_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"allowed_origins":["${pageOrigin}"]}'`}
            </pre>
            <p className="mt-2 text-rose-900/90">
              <strong>For real production:</strong> use <code className="rounded bg-rose-100 px-1">pk_live_</code>{" "}
              keys and a custom domain (Clerk does not support{" "}
              <code className="rounded bg-rose-100 px-1">*.vercel.app</code> on production instances).
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="clerk-sign-in-host w-full min-h-[420px]">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={CLERK_APPEARANCE}
      />
    </div>
  );
}
