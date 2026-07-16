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

const VARIANTS = {
  full: {
    width: 220,
    height: 178,
    // PNG has large whitespace; scale crops it so the mark reads at usable size.
    imgClass: "h-[64px] w-auto max-w-[220px] origin-left scale-[1.35] object-contain object-left",
  },
  icon: {
    width: 80,
    height: 80,
    imgClass: "h-10 w-10 object-cover",
  },
  hero: {
    width: 420,
    height: 340,
    imgClass: "h-auto w-full max-w-[280px] origin-center scale-[1.2] object-contain drop-shadow-2xl",
  },
} as const;

/**
 * Renders the Release Desk brand mark.
 * @param variant - Layout treatment for sidebar, auth, or marketing surfaces.
 * @param className - Optional extra classes on the image or icon shell.
 * @param priority - When true, Next/Image loads the asset eagerly.
 */
export function SentinelLogo({ variant = "full", className, priority }: SentinelLogoProps) {
  const v = VARIANTS[variant];

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
          // Scale so RD fills the square edge-to-edge; crop out wordmark and PNG padding.
          className="absolute left-1/2 top-1/2 h-auto w-[340%] max-w-none -translate-x-1/2 -translate-y-[38%]"
          priority={priority}
        />
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden", variant === "full" && "max-h-[72px]", className)}>
      <Image
        src={LOGO_SRC}
        alt="Release Desk"
        width={v.width}
        height={v.height}
        unoptimized
        className={v.imgClass}
        priority={priority}
      />
    </div>
  );
}

export { logoSrc as LOGO_PATH };
