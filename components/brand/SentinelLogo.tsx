import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";
import logoSrc from "@/public/sentinel-logo.png";

const LOGO_SRC = logoSrc as StaticImageData;

type SentinelLogoProps = {
  /** full — sidebar expanded / login; icon — collapsed sidebar RD crop; hero — login marketing panel */
  variant?: "full" | "icon" | "hero";
  className?: string;
  priority?: boolean;
};

/**
 * Renders the Release Desk brand mark.
 * @param variant - Layout treatment for sidebar, auth, or marketing surfaces.
 * @param className - Optional extra classes on the image or icon shell.
 * @param priority - When true, Next/Image loads the asset eagerly.
 */
export function SentinelLogo({ variant = "full", className, priority }: SentinelLogoProps) {
  if (variant === "icon") {
    return (
      <div
        className={cn(
          "relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm dark:border-slate-600",
          className
        )}
        aria-hidden
      >
        <Image
          src={LOGO_SRC}
          alt=""
          width={LOGO_SRC.width}
          height={LOGO_SRC.height}
          sizes="40px"
          unoptimized
          // Horizontal asset: crop to the RD mark on the left, hide the wordmark.
          className="absolute left-0 top-1/2 h-[165%] w-auto max-w-none -translate-y-1/2"
          priority={priority}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden rounded-md bg-white",
        variant === "full" && "h-14 w-full px-1",
        variant === "hero" && "h-auto w-full max-w-[320px] shrink-0 bg-transparent px-0 py-0",
        className
      )}
    >
      <Image
        src={LOGO_SRC}
        alt="Release Desk"
        width={variant === "hero" ? 420 : 220}
        height={variant === "hero" ? 120 : 56}
        unoptimized
        className={cn(
          "object-contain object-left",
          // Fill whatever space the sidebar header gives it (maximize) without distorting aspect ratio.
          variant === "full" && "h-full w-full",
          variant === "hero" && "h-auto w-full drop-shadow-2xl"
        )}
        priority={priority}
      />
    </div>
  );
}

export { logoSrc as LOGO_PATH };
