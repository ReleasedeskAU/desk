"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { NavigationProgressProvider } from "@/components/layout/NavigationProgress";
import { clerkAuthorizedOrigins } from "@/lib/clerk-authorized-origins";

type Props = {
  children: React.ReactNode;
  /** NEXT_PUBLIC Clerk key from the server layout (optional when env is inlined). */
  clerkPublishableKey?: string;
};

/**
 * Client providers that must wrap every route (auth + main) so SSR/client
 * trees share the same outer DOM shape and avoid hydration mismatches.
 *
 * ClerkProvider lives here (not in the Server Component root layout) so
 * `useAuth` / `useUser` see a real client context under Next 16 + Turbopack.
 *
 * @param props - React children from the root layout, plus optional Clerk key.
 * @returns Children wrapped with Clerk and navigation progress context.
 */
export function RootClientProviders({ children, clerkPublishableKey }: Props) {
  const allowedRedirectOrigins = clerkAuthorizedOrigins();
  return (
    <ClerkProvider
      {...(clerkPublishableKey ? { publishableKey: clerkPublishableKey } : {})}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/sign-in"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
      {...(allowedRedirectOrigins.length > 0 ? { allowedRedirectOrigins } : {})}
    >
      <NavigationProgressProvider>{children}</NavigationProgressProvider>
    </ClerkProvider>
  );
}
