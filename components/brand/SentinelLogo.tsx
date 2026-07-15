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
    imgClass: "h-[52px] w-auto max-w-[180px] object-contain object-left",
  },
  icon: {
    width: 80,
    height: 80,
    imgClass: "h-10 w-10 object-cover",
  },
  hero: {
    width: 420,
    height: 340,
    imgClass: "h-auto w-full max-w-[320px] object-contain drop-shadow-2xl",
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
          "relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[var(--border)]",
          className
        )}
        aria-hidden
      >
        <Image
          src={LOGO_SRC}
          alt=""
          fill
          sizes="40px"
          unoptimized
          // Crop to the RD monogram; text lives below in the full mark.
          className="object-cover object-[50%_22%] scale-[1.85]"
          priority={priority}
        />
      </div>
    );
  }

  return (
    <Image
      src={LOGO_SRC}
      alt="Release Desk"
      width={v.width}
      height={v.height}
      unoptimized
      className={cn(v.imgClass, className)}
      priority={priority}
    />
  );
}

export { logoSrc as LOGO_PATH };
