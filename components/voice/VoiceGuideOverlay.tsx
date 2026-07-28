"use client";

/**
 * In-app assistant pointer + soft highlight for voice walkthroughs.
 * Classic OS-style arrow cursor; light highlight (not a heavy demo overlay).
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getVoiceGuideState,
  subscribeVoiceGuide,
  type VoiceGuideState,
} from "@/lib/voice/guide-ui";

/** Classic OS arrow — tip at top-left (0,0). */
function RealCursorIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
    >
      <path
        d="M4 3v14l4.2-4.1 2.4 5.7 2.3-.9-2.4-5.7H16L4 3z"
        fill="#fff"
        stroke="#111"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full-viewport overlay: subtle status, soft ring, real-looking cursor tip.
 */
export function VoiceGuideOverlay() {
  const [guide, setGuide] = useState<VoiceGuideState>(() => getVoiceGuideState());

  useEffect(() => subscribeVoiceGuide(setGuide), []);

  if (!guide.active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[400]"
      aria-live="polite"
      aria-atomic="true"
      data-testid="voice-guide-overlay"
    >
      {guide.status ? (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <div
            className={cn(
              "rounded-full border border-slate-200/90 bg-white/95 px-3.5 py-1.5",
              "text-[12px] font-semibold text-slate-800 shadow-md backdrop-blur-sm",
              "dark:border-white/15 dark:bg-[#1e2433]/95 dark:text-white"
            )}
          >
            {guide.status}
          </div>
        </div>
      ) : null}

      {guide.ring ? (
        <div
          className={cn(
            "absolute z-10 rounded-xl border-2 border-brand-500/80 bg-brand-500/10",
            "shadow-[0_0_0_3px_rgba(37,72,201,0.18)]",
            "transition-[top,left,width,height] duration-200 ease-out",
            "motion-reduce:transition-none"
          )}
          style={{
            left: guide.ring.x - 3,
            top: guide.ring.y - 3,
            width: guide.ring.w + 6,
            height: guide.ring.h + 6,
          }}
        />
      ) : null}

      {guide.pointer ? (
        <div
          className={cn(
            "absolute z-30 transition-[top,left] duration-200 ease-out",
            "motion-reduce:transition-none"
          )}
          style={{ left: guide.pointer.x, top: guide.pointer.y }}
          data-testid="voice-guide-pointer"
        >
          <RealCursorIcon />
        </div>
      ) : null}
    </div>
  );
}
