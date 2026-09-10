import { ClerkSignIn } from "@/components/auth/ClerkSignIn";
import { SentinelLogo } from "@/components/brand/SentinelLogo";
import { PRODUCT_TAGLINE } from "@/lib/brand";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <SentinelLogo variant="full" priority className="mx-auto lg:mx-0 h-[56px] w-auto max-w-[240px]" />
            <p className="mt-3 text-xs text-gray-500">{PRODUCT_TAGLINE}</p>
          </div>
          <ClerkSignIn publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} />
        </div>
      </div>
      <div className="relative hidden flex-1 items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-brand-700 lg:flex px-8">
        <div className="flex flex-col items-center text-center max-w-lg">
          <div className="rounded-2xl bg-white/95 p-8 shadow-2xl">
            <SentinelLogo variant="hero" priority />
          </div>
          <p className="mt-8 text-sm text-brand-100/90 leading-relaxed max-w-sm">
            Reference data, env booking, system mapping, and release coordination — backed by PostgreSQL.
          </p>
        </div>
      </div>
    </div>
  );
}
