"use client";

import { NavigationProgressProvider } from "@/components/layout/NavigationProgress";

/**
 * Client providers that must wrap every route (auth + main) so SSR/client
 * trees share the same outer DOM shape and avoid hydration mismatches.
 *
 * @param props - React children from the root layout.
 * @returns Children wrapped with navigation progress context.
 */
export function RootClientProviders({ children }: { children: React.ReactNode }) {
  return <NavigationProgressProvider>{children}</NavigationProgressProvider>;
}
