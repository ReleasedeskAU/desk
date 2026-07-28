"use client";

/**
 * Voice mic control + transcript + text fallback — AppShell.
 * Compact pill control (status + mic) matching Release Desk chrome.
 * Propose lines use amber treatment; disconnect is orange, not idle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Loader2, WifiOff, Keyboard, X, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VoiceLiveClient,
  type VoiceConnectionState,
  type VoiceFailureKind,
  type VoiceTranscriptEntry,
  type VoiceUiPhase,
} from "@/lib/voice/client";
import { parseVoiceTextCommand } from "@/lib/voice/text-fallback";
import {
  clearVoiceGuide,
  guidedNavigateTo,
  voiceRowCodeFromPath,
} from "@/lib/voice/guide-ui";
import { performVoiceRouteChange } from "@/lib/voice/perform-route-change";
import { labelForVoicePath } from "@/lib/voice/route-allowlist";
import {
  clearVoiceScreenSharePrompt,
  subscribeVoiceScreenSharePrompt,
} from "@/lib/voice/screen-share-prompt";

const MAX_TRANSCRIPT_LINES = 12;

/**
 * Persistent mic control + live transcript (incl. propose confirmation + text fallback).
 */
export function VoiceMic() {
  const router = useRouter();
  const clientRef = useRef<VoiceLiveClient | null>(null);
  const [conn, setConn] = useState<VoiceConnectionState>("idle");
  const [phase, setPhase] = useState<VoiceUiPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<VoiceTranscriptEntry[]>([]);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [fallbackHint, setFallbackHint] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  /** Opt-in tab screen share — default OFF (audio-only). */
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  /** Pulse share CTA when the agent needs eyes for explain-page intents. */
  const [sharePromptReason, setSharePromptReason] = useState<string | null>(null);

  const guidedPush = useCallback(
    async (href: string) => {
      await guidedNavigateTo(
        href,
        (h) => {
          performVoiceRouteChange(h, (path) => {
            router.push(path);
          });
        },
        {
          label: labelForVoicePath(href),
          rowCode: voiceRowCodeFromPath(href) ?? undefined,
        }
      );
    },
    [router]
  );

  const pushLine = useCallback((entry: VoiceTranscriptEntry) => {
    setLines((prev) => [...prev.slice(-(MAX_TRANSCRIPT_LINES - 1)), entry]);
    // Keep the big transcript card closed during normal navigate/action chatter.
    // Only open for writes, errors, or when the user already opened it.
    if (entry.role === "propose" || entry.role === "system") {
      setPanelOpen(true);
    }
  }, []);

  const clearPendingProposal = useCallback(() => {
    setPendingActionId(null);
    setLines((prev) => prev.filter((l) => l.role !== "propose"));
  }, []);

  useEffect(() => {
    const client = new VoiceLiveClient({
      navigate: guidedPush,
      onStateChange: setConn,
      onUiPhaseChange: setPhase,
      onTranscript: pushLine,
      onError: (m) => {
        setError(m);
        setPanelOpen(true);
      },
      onPendingActionChange: (actionId) => setPendingActionId(actionId),
      onPendingActionsInvalidated: () => {
        clearPendingProposal();
        pushLine({
          id: `info-${Date.now()}`,
          role: "info",
          text: "Pending write cleared after reconnect",
          at: Date.now(),
        });
      },
      onFallbackRecommended: (kind: VoiceFailureKind, message: string) => {
        setShowTextFallback(true);
        setPanelOpen(true);
        setFallbackHint(
          kind === "mic_denied"
            ? "Mic blocked — type commands instead (same tools as voice)."
            : kind === "ws_failed" || kind === "reconnect_exhausted"
              ? "Voice connection failed — type commands instead."
              : message
        );
      },
      onScreenShareChange: (active) => {
        setScreenShareOn(active);
        if (active) {
          clearVoiceScreenSharePrompt();
          setSharePromptReason(null);
        }
      },
      onScreenSharePrompt: (reason) => {
        setSharePromptReason(reason);
        // Compact CTA near mic — do not force the big transcript square open.
      },
    });
    clientRef.current = client;
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [guidedPush, pushLine, clearPendingProposal]);

  useEffect(() => {
    clientRef.current?.setOptions({
      navigate: guidedPush,
    });
  }, [guidedPush]);

  useEffect(() => {
    return subscribeVoiceScreenSharePrompt((prompt) => {
      setSharePromptReason(prompt.active ? prompt.reason : null);
    });
  }, []);

  const active = conn === "connected";
  const reconnecting = conn === "reconnecting";
  const connecting =
    conn === "requesting_mic" ||
    conn === "minting_token" ||
    conn === "connecting";
  const disconnectedUi =
    phase === "disconnected" || conn === "disconnected" || reconnecting;
  const hasPropose =
    Boolean(pendingActionId) || lines.some((l) => l.role === "propose");
  // Compact mic pill stays; big square transcript only when needed / user opened it.
  const showTranscriptCard =
    Boolean(error) ||
    showTextFallback ||
    disconnectedUi ||
    hasPropose ||
    (panelOpen &&
      (lines.length > 0 || Boolean(error) || showTextFallback || hasPropose));
  const showShareToast =
    Boolean(sharePromptReason) && active && !screenShareOn;

  const statusLabel = hasPropose
    ? "Confirm write"
    : reconnecting
      ? "Reconnecting…"
      : connecting
        ? "Starting…"
        : disconnectedUi && conn !== "idle"
          ? "Disconnected"
          : phase === "listening"
            ? "Listening"
            : phase === "thinking"
              ? "Working…"
              : phase === "speaking"
                ? "Speaking"
                : phase === "error" || error
                  ? "Error"
                  : active
                    ? "Listening"
                    : "Voice";

  const onToggle = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const state = client.getConnectionState();
    // Always allow stop while anything is in progress (incl. mint/WS open).
    if (state !== "idle" && state !== "error" && state !== "disconnected") {
      client.disconnect();
      setError(null);
      setShowTextFallback(false);
      clearPendingProposal();
      setLines([]);
      setPanelOpen(false);
      setConn("idle");
      setPhase("idle");
      setScreenShareOn(false);
      setSharePromptReason(null);
      clearVoiceScreenSharePrompt();
      clearVoiceGuide();
      return;
    }
    if (state === "error" || state === "disconnected") {
      client.disconnect();
    }
    setError(null);
    setLines([]);
    setShowTextFallback(false);
    setFallbackHint(null);
    clearPendingProposal();
    setScreenShareOn(false);
    setSharePromptReason(null);
    clearVoiceScreenSharePrompt();
    // Don't open the empty "Sees this page" card until there is real activity.
    setPanelOpen(false);
    const ok = await client.connect();
    // User may have hit stop during mint — don't surface a fake error.
    if (!ok && client.getConnectionState() !== "idle") {
      setError(client.getLastError() ?? "Could not start voice");
      setPanelOpen(true);
    }
  }, [clearPendingProposal]);

  const onToggleScreenShare = useCallback(async () => {
    const client = clientRef.current;
    if (!client || screenShareBusy) return;
    if (client.getConnectionState() !== "connected") {
      setError("Connect voice first, then turn on screen share");
      setPanelOpen(true);
      return;
    }
    setScreenShareBusy(true);
    try {
      if (client.isScreenShareActive()) {
        client.disableScreenShare();
      } else {
        await client.enableScreenShare();
        clearVoiceScreenSharePrompt();
        setSharePromptReason(null);
        clearVoiceGuide();
      }
    } finally {
      setScreenShareBusy(false);
    }
  }, [screenShareBusy]);

  const runTextCommand = useCallback(async () => {
    const raw = textInput.trim();
    if (!raw || textBusy) return;
    setTextBusy(true);
    setTextInput("");
    pushLine({
      id: `user-${Date.now()}`,
      role: "user",
      text: raw,
      at: Date.now(),
    });
    try {
      const parsed = parseVoiceTextCommand(raw, pendingActionId);
      if (!parsed.ok) {
        pushLine({
          id: `system-${Date.now()}`,
          role: "system",
          text: parsed.reason,
          at: Date.now(),
        });
        return;
      }
      if (parsed.note) {
        pushLine({
          id: `action-${Date.now()}`,
          role: "action",
          text: parsed.note,
          at: Date.now(),
        });
      }
      const { dispatchVoiceToolCalls } = await import(
        "@/lib/voice/handlers/dispatch"
      );
      const { functionResponses, actionLines } = await dispatchVoiceToolCalls(
        parsed.calls,
        { push: guidedPush }
      );
      for (const line of actionLines) {
        pushLine({
          id: `${line.role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: line.role,
          text: line.text,
          at: Date.now(),
        });
      }
      for (const fr of functionResponses) {
        if (fr.name === "propose_action" && fr.response.ok && fr.response.actionId) {
          setPendingActionId(String(fr.response.actionId));
        }
        if (fr.name === "confirm_action") {
          setPendingActionId(null);
        }
      }
    } catch (err) {
      pushLine({
        id: `system-${Date.now()}`,
        role: "system",
        text: err instanceof Error ? err.message : "Text command failed",
        at: Date.now(),
      });
    } finally {
      setTextBusy(false);
    }
  }, [textInput, textBusy, pendingActionId, pushLine, guidedPush]);

  const accent =
    phase === "error" || error
      ? "danger"
      : disconnectedUi
        ? "warn"
        : hasPropose
          ? "propose"
          : active || connecting
            ? "live"
            : "idle";

  return (
    <div
      className="pointer-events-none fixed bottom-24 right-5 z-50 flex w-[min(100vw-1.5rem,20.5rem)] flex-col items-stretch gap-2"
      data-testid="voice-mic"
      data-voice-mic=""
    >
      {showShareToast ? (
        <div
          className="pointer-events-auto rounded-xl border border-brand-200/90 bg-white/95 px-3 py-2 shadow-lg dark:border-brand-500/35 dark:bg-[#1e2433]/95"
          data-testid="voice-share-prompt"
        >
          <p className="text-[11px] font-medium text-slate-700 dark:text-white/85">
            {sharePromptReason}
          </p>
          <button
            type="button"
            onClick={() => void onToggleScreenShare()}
            disabled={screenShareBusy}
            className="mt-1.5 rounded-lg bg-[var(--theme-accent,#2548C9)] px-2.5 py-1 text-[11px] font-semibold text-white"
          >
            Enable screen share
          </button>
        </div>
      ) : null}

      {showTranscriptCard ? (
        <div
          className={cn(
            "pointer-events-auto overflow-hidden rounded-2xl border shadow-[0_16px_40px_-20px_rgba(15,23,42,0.45)] backdrop-blur-md",
            accent === "propose"
              ? "border-amber-300/90 bg-amber-50/95 dark:border-amber-500/35 dark:bg-amber-950/80"
              : accent === "warn"
                ? "border-orange-300/90 bg-orange-50/95 dark:border-orange-500/35 dark:bg-orange-950/70"
                : accent === "danger"
                  ? "border-red-300/80 bg-white/95 dark:border-red-500/30 dark:bg-[#1e2433]/95"
                  : "border-slate-200/90 bg-white/95 dark:border-white/10 dark:bg-[#1e2433]/95"
          )}
          data-testid="voice-transcript"
        >
          <div className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.14em]",
                  accent === "propose"
                    ? "text-amber-700 dark:text-amber-300"
                    : accent === "warn"
                      ? "text-orange-700 dark:text-orange-300"
                      : accent === "danger"
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-500 dark:text-white/50"
                )}
              >
                {hasPropose
                  ? "Confirm write"
                  : disconnectedUi
                    ? reconnecting
                      ? "Reconnecting"
                      : "Disconnected"
                    : "Voice"}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-white/55">
                {active
                  ? screenShareOn
                    ? "Listening + screen share — frames are being sent"
                    : sharePromptReason
                      ? "Tap the monitor icon to share your screen"
                      : "Listening — tap mic to stop"
                  : "Click the mic to talk"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close voice panel"
              className="rounded-md p-1 text-slate-400 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => setPanelOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {lines.length > 0 ? (
            <ul className="max-h-44 space-y-1.5 overflow-y-auto px-3 py-2.5 text-[12px]">
              {lines.map((l) => (
                <li
                  key={l.id}
                  className={cn(
                    "leading-snug",
                    l.role === "user" && "text-slate-700 dark:text-white/80",
                    l.role === "model" && "text-[var(--theme-accent,#2548C9)] dark:text-sky-300",
                    l.role === "action" &&
                      "font-medium text-slate-800 dark:text-white/90",
                    l.role === "info" && "text-slate-500 dark:text-white/50",
                    l.role === "propose" &&
                      "rounded-lg border border-amber-200 bg-amber-100/80 px-2 py-1.5 font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
                    l.role === "system" && "text-red-600 dark:text-red-400"
                  )}
                  data-testid={l.role === "propose" ? "voice-propose-line" : undefined}
                >
                  <span className="mr-1.5 text-[10px] font-semibold uppercase opacity-55">
                    {l.role === "user"
                      ? "You"
                      : l.role === "model"
                        ? "Desk"
                        : l.role === "action"
                          ? "Action"
                          : l.role === "propose"
                            ? "Propose"
                            : l.role === "info"
                              ? "Info"
                              : "Error"}
                  </span>
                  {l.text}
                </li>
              ))}
            </ul>
          ) : null}

          {hasPropose ? (
            <p className="border-t border-amber-200/60 px-3 py-2 text-[11px] text-amber-800/90 dark:border-amber-500/20 dark:text-amber-200/90">
              Say or type <span className="font-semibold">yes</span> to save, or{" "}
              <span className="font-semibold">no</span> to cancel.
            </p>
          ) : null}

          {error ? (
            <p
              className="border-t border-red-100 px-3 py-2 text-[12px] text-red-600 dark:border-red-500/20 dark:text-red-400"
              data-testid="voice-error"
            >
              {error}
            </p>
          ) : null}

          {showTextFallback || hasPropose ? (
            <div
              className="border-t border-slate-200/80 px-3 py-2.5 dark:border-white/10"
              data-testid="voice-text-fallback"
            >
              {fallbackHint ? (
                <p className="mb-2 text-[11px] text-slate-600 dark:text-white/70">
                  {fallbackHint}
                </p>
              ) : null}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runTextCommand();
                }}
              >
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={
                    hasPropose ? "yes / no" : "e.g. open env booking page"
                  }
                  disabled={textBusy}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 outline-none focus:border-[var(--theme-accent,#2548C9)] dark:border-white/15 dark:bg-[#151a24] dark:text-white"
                  data-testid="voice-text-input"
                />
                <button
                  type="submit"
                  disabled={textBusy || !textInput.trim()}
                  className="rounded-lg bg-[var(--theme-accent,#2548C9)] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {textBusy ? "…" : "Send"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Compact status + mic pill */}
      <div className="pointer-events-auto flex items-center justify-end gap-2">
        {!showTextFallback && !active && !reconnecting && !connecting ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-[#2a3142] dark:text-white/70"
            onClick={() => {
              setShowTextFallback(true);
              setPanelOpen(true);
              setFallbackHint("Text mode — same tools and propose → confirm gates.");
            }}
            data-testid="voice-text-fallback-toggle"
          >
            <Keyboard className="h-3 w-3" />
            Text
          </button>
        ) : null}

        <div
          className={cn(
            "flex items-center gap-1 rounded-full border p-1 shadow-[0_10px_28px_-14px_rgba(15,23,42,0.55)] backdrop-blur",
            accent === "live"
              ? "border-[var(--theme-accent,#2548C9)]/35 bg-white/95 dark:bg-[#2a3142]/95"
              : accent === "propose"
                ? "border-amber-400/50 bg-amber-50/95 dark:bg-amber-950/80"
                : accent === "warn"
                  ? "border-orange-400/50 bg-orange-50/95 dark:bg-orange-950/70"
                  : accent === "danger"
                    ? "border-red-400/50 bg-white/95 dark:bg-[#2a3142]/95"
                    : "border-slate-200/90 bg-white/95 dark:border-white/10 dark:bg-[#2a3142]/95"
          )}
        >
          <span
            className={cn(
              "hidden max-w-[7.5rem] truncate pl-2.5 text-[11px] font-semibold sm:inline",
              accent === "live"
                ? "text-[var(--theme-accent,#2548C9)]"
                : accent === "propose"
                  ? "text-amber-700 dark:text-amber-300"
                  : accent === "warn"
                    ? "text-orange-700 dark:text-orange-300"
                    : accent === "danger"
                      ? "text-red-600"
                      : "text-slate-500 dark:text-white/55"
            )}
            data-testid="voice-status-label"
          >
            {statusLabel}
          </span>

          {/* Opt-in tab screen share — default off; only meaningful while connected. */}
          <button
            type="button"
            onClick={() => void onToggleScreenShare()}
            disabled={!active || screenShareBusy || reconnecting || connecting}
            aria-label={
              screenShareOn
                ? "Turn off screen share"
                : "Share screen with voice (Entire Screen, Window, or Tab)"
            }
            aria-pressed={screenShareOn}
            title={
              screenShareOn
                ? "Screen share on — frames sent when you ask about the page"
                : "Share Entire Screen, Window, or Tab (off by default)"
            }
            data-testid="voice-screen-share-toggle"
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              !active || reconnecting || connecting
                ? "cursor-not-allowed text-slate-300 dark:text-white/25"
                : screenShareOn
                  ? "bg-[var(--theme-accent,#2548C9)]/15 text-[var(--theme-accent,#2548C9)]"
                  : sharePromptReason
                    ? "bg-brand-500/20 text-[var(--theme-accent,#2548C9)] ring-2 ring-brand-400/70 ring-offset-1 dark:ring-offset-[#1e2433]"
                    : "text-slate-500 hover:bg-black/5 dark:text-white/55 dark:hover:bg-white/10"
            )}
          >
            {sharePromptReason && !screenShareOn && active ? (
              <span
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-brand-400/30"
                aria-hidden
              />
            ) : null}
            {screenShareBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : screenShareOn ? (
              <Monitor className="h-4 w-4" />
            ) : (
              <MonitorOff className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void onToggle()}
            aria-label={
              active || reconnecting || connecting
                ? "Stop voice navigation"
                : "Start voice navigation"
            }
            aria-pressed={active}
            data-voice-state={conn}
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-[1.03] active:scale-[0.98]",
              accent === "live"
                ? "bg-[var(--theme-accent,#2548C9)] text-white"
                : accent === "propose"
                  ? "bg-amber-500 text-white"
                  : accent === "warn"
                    ? "bg-orange-500 text-white"
                    : accent === "danger"
                      ? "bg-red-500 text-white"
                      : "bg-slate-800 text-white dark:bg-white/15"
            )}
          >
            {accent === "live" && phase === "listening" ? (
              <span
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-white/25"
                aria-hidden
              />
            ) : null}
            {connecting || phase === "thinking" || reconnecting ? (
              <Loader2 className="relative h-5 w-5 animate-spin" />
            ) : disconnectedUi && !active ? (
              <WifiOff className="relative h-5 w-5" />
            ) : active ? (
              <Mic className="relative h-5 w-5" />
            ) : (
              <MicOff className="relative h-5 w-5 opacity-90" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
