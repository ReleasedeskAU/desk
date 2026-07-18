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

export function ClerkSignIn() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!publishableKey) return;
    const timer = window.setTimeout(() => {
      const mounted = Boolean(
        document.querySelector("[data-clerk-component], iframe[src*='clerk']")
      );
      if (!mounted) setLoadFailed(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [publishableKey]);

  if (!publishableKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Sign-in is not configured for this deployment</p>
        <p className="mt-2 text-amber-900/90">
          Add <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code className="rounded bg-amber-100 px-1">CLERK_SECRET_KEY</code> in Vercel → Settings → Environment
          Variables, then redeploy.
        </p>
      </div>
    );
  }

  if (loadFailed) {
    // Keep SSR/client markup identical — never branch on `window` during render.
    const originExample = "https://releasedesk.vercel.app";
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
        <p className="font-semibold">Clerk sign-in failed to load</p>
        <p className="mt-2 text-rose-900/90">
          <strong>On Vercel with test keys (`pk_test_…`):</strong> open Clerk Dashboard →{" "}
          <strong>Configure → Paths</strong> and confirm sign-in is <code className="rounded bg-rose-100 px-1">/sign-in</code>.
          Then allow this site origin (e.g. <code className="rounded bg-rose-100 px-1">{originExample}</code>) once:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-rose-100/80 p-2 text-[11px] text-rose-950">
{`curl -X PATCH https://api.clerk.com/v1/instance \\
  -H "Authorization: Bearer YOUR_CLERK_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"allowed_origins":["${originExample}"]}'`}
        </pre>
        <p className="mt-2 text-rose-900/90">
          <strong>For real production:</strong> click <strong>Go to prod</strong> in Clerk, use <code className="rounded bg-rose-100 px-1">pk_live_</code> keys,
          and add a <strong>custom domain you own</strong> (Clerk does not support <code className="rounded bg-rose-100 px-1">*.vercel.app</code> on production instances).
        </p>
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
