"use client";

/**
 * Voice mic + transcript — AppShell.
 * Propose lines use amber/warning treatment (write confirmation).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VoiceLiveClient,
  type VoiceConnectionState,
  type VoiceTranscriptEntry,
  type VoiceUiPhase,
} from "@/lib/voice/client";

const MAX_TRANSCRIPT_LINES = 10;

/**
 * Persistent mic control + live transcript (incl. propose confirmation UI).
 */
export function VoiceMic() {
  const router = useRouter();
  const clientRef = useRef<VoiceLiveClient | null>(null);
  const [conn, setConn] = useState<VoiceConnectionState>("idle");
  const [phase, setPhase] = useState<VoiceUiPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<VoiceTranscriptEntry[]>([]);

  const pushLine = useCallback((entry: VoiceTranscriptEntry) => {
    setLines((prev) => [...prev.slice(-(MAX_TRANSCRIPT_LINES - 1)), entry]);
  }, []);

  useEffect(() => {
    const client = new VoiceLiveClient({
      navigate: (href) => router.push(href),
      onStateChange: setConn,
      onUiPhaseChange: setPhase,
      onTranscript: pushLine,
      onError: (m) => setError(m),
    });
    clientRef.current = client;
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [router, pushLine]);

  useEffect(() => {
    clientRef.current?.setOptions({
      navigate: (href) => router.push(href),
    });
  }, [router]);

  const active = conn === "connected";
  const busy = phase === "thinking" || phase === "speaking" || phase === "listening";
  const hasPropose = lines.some((l) => l.role === "propose");

  const onToggle = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    if (client.getConnectionState() === "connected") {
      client.disconnect();
      setError(null);
      return;
    }
    setError(null);
    setLines([]);
    const ok = await client.connect();
    if (!ok) {
      setError(client.getLastError() ?? "Could not start voice");
    }
  }, []);

  const ringClass =
    phase === "error" || error
      ? "ring-2 ring-red-400/80 shadow-[0_0_20px_rgba(248,113,113,0.45)]"
      : hasPropose
        ? "ring-2 ring-amber-400/90 shadow-[0_0_22px_rgba(245,158,11,0.45)]"
        : phase === "speaking"
          ? "ring-2 ring-violet-400/90 shadow-[0_0_24px_rgba(139,92,246,0.55)] animate-pulse"
          : phase === "thinking"
            ? "ring-2 ring-indigo-300/70 shadow-[0_0_18px_rgba(99,102,241,0.4)]"
            : phase === "listening"
              ? "ring-2 ring-indigo-500/80 shadow-[0_0_22px_rgba(99,102,241,0.5)] animate-[pulse_1.6s_ease-in-out_infinite]"
              : "ring-1 ring-slate-200/80 shadow-[0_12px_28px_-16px_rgba(112,144,176,0.55)]";

  return (
    <div
      className="pointer-events-none fixed bottom-24 right-6 z-50 flex max-w-[min(100vw-2rem,22rem)] flex-col items-end gap-3"
      data-testid="voice-mic"
    >
      {(lines.length > 0 || error) && (
        <div
          className={cn(
            "pointer-events-auto w-full rounded-2xl border px-3.5 py-3 text-[12px] shadow-[0_18px_40px_-24px_rgba(112,144,176,0.45)] backdrop-blur",
            hasPropose
              ? "border-amber-300/80 bg-amber-50/95 dark:border-amber-500/40 dark:bg-amber-500/10"
              : "border-white/60 bg-white/95 dark:border-white/10 dark:bg-[#1e2433]/95"
          )}
          data-testid="voice-transcript"
        >
          <p
            className={cn(
              "mb-1.5 text-[10px] font-semibold uppercase tracking-wide",
              hasPropose ? "text-amber-700 dark:text-amber-300" : "text-slate-400"
            )}
          >
            {hasPropose ? "Confirm write" : "Voice"}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {lines.map((l) => (
              <li
                key={l.id}
                className={cn(
                  "leading-snug",
                  l.role === "user" && "text-slate-700 dark:text-white/80",
                  l.role === "model" && "text-indigo-700 dark:text-indigo-300",
                  l.role === "action" &&
                    "font-medium text-violet-700 dark:text-violet-300",
                  l.role === "propose" &&
                    "rounded-lg border border-amber-200 bg-amber-100/80 px-2 py-1.5 font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
                  l.role === "system" && "text-red-600 dark:text-red-400"
                )}
                data-testid={l.role === "propose" ? "voice-propose-line" : undefined}
              >
                <span className="mr-1.5 text-[10px] font-semibold uppercase opacity-60">
                  {l.role === "user"
                    ? "You"
                    : l.role === "model"
                      ? "Desk"
                      : l.role === "action"
                        ? "Action"
                        : l.role === "propose"
                          ? "Propose"
                          : "Error"}
                </span>
                {l.text}
              </li>
            ))}
          </ul>
          {hasPropose ? (
            <p className="mt-2 text-[11px] text-amber-800/90 dark:text-amber-200/90">
              Say <span className="font-semibold">yes</span> to save, or{" "}
              <span className="font-semibold">no</span> / cancel to discard.
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-red-600 dark:text-red-400" data-testid="voice-error">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <button
        type="button"
        onClick={() => void onToggle()}
        aria-label={active ? "Stop voice navigation" : "Start voice navigation"}
        aria-pressed={active}
        className={cn(
          "pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 transition-transform hover:scale-[1.03] active:scale-[0.98] dark:bg-[#2a3142] dark:text-white",
          ringClass
        )}
      >
        {phase === "listening" || phase === "speaking" ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-transparent"
            aria-hidden
          />
        ) : null}
        {phase === "thinking" ? (
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        ) : (
          <Mic
            className={cn(
              "relative h-6 w-6",
              hasPropose
                ? "text-amber-600 dark:text-amber-300"
                : active || busy
                  ? "text-indigo-600 dark:text-indigo-300"
                  : "text-slate-500 dark:text-white/55"
            )}
          />
        )}
      </button>
      <p className="pointer-events-none text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {hasPropose
          ? "Confirm?"
          : phase === "idle" && conn !== "connected"
            ? "Voice"
            : phase === "listening"
              ? "Listening"
              : phase === "thinking"
                ? "Working"
                : phase === "speaking"
                  ? "Speaking"
                  : phase === "error"
                    ? "Error"
                    : "Voice"}
      </p>
    </div>
  );
}
