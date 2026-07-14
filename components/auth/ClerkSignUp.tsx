"use client";

import { SignUp } from "@clerk/nextjs";

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

export function ClerkSignUp() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Sign-up is not configured for this deployment</p>
        <p className="mt-2 text-amber-900/90">
          Add Clerk environment variables in Vercel and redeploy to enable authentication.
        </p>
      </div>
    );
  }

  return (
    <div className="clerk-sign-in-host w-full min-h-[420px]">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"
        appearance={CLERK_APPEARANCE}
      />
    </div>
  );
}
