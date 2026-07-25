/**
 * Browser Gemini Live client — mic, WebSocket, playback, and Phase-1 tool dispatch.
 * Isolated from page UI; handlers live under lib/voice/handlers/.
 */
"use client";

import { VOICE_LIVE_MODEL, type VoiceToolDeclaration } from "@/lib/voice/tool-manifest";

export type VoiceConnectionState =
  | "idle"
  | "requesting_mic"
  | "minting_token"
  | "connecting"
  | "connected"
  | "error"
  | "disconnected";

/** Fine-grained UX phase for the mic button / transcript strip. */
export type VoiceUiPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceTranscriptEntry = {
  id: string;
  role: "user" | "model" | "action" | "system" | "propose";
  text: string;
  at: number;
};

export type VoiceClientOptions = {
  /** Override session endpoint (default /api/copilot/voice/session). */
  sessionUrl?: string;
  /** Next.js router.push — required for navigate_to. */
  navigate?: (href: string) => void;
  onStateChange?: (state: VoiceConnectionState) => void;
  onUiPhaseChange?: (phase: VoiceUiPhase) => void;
  onTranscript?: (entry: VoiceTranscriptEntry) => void;
  onError?: (message: string) => void;
  onSetupComplete?: () => void;
  onMessage?: (data: unknown) => void;
};

type LiveServerMessage = {
  setupComplete?: unknown;
  toolCall?: {
    functionCalls?: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>;
  };
  toolCallCancellation?: { ids?: string[] };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
    waitingForInput?: boolean;
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
    modelTurn?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      }>;
    };
  };
};

/** Gemini Live model audio is 24 kHz PCM; mic uplink is 16 kHz. */
const PLAYBACK_SAMPLE_RATE = 24_000;
const MIC_SAMPLE_RATE = 16_000;

type SessionResponse = {
  token: string;
  toolManifest: VoiceToolDeclaration[];
  model?: string;
  expireTime?: string | null;
  organizationId?: string | null;
  error?: string;
  retryAfterSec?: number;
};

const LIVE_WS_PATH =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

/**
 * Opens a Gemini Live WebSocket with an ephemeral token and streams mic PCM.
 * Dropped connections set state to "error" / "disconnected" without throwing uncaught.
 */
export class VoiceLiveClient {
  private state: VoiceConnectionState = "idle";
  private uiPhase: VoiceUiPhase = "idle";
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muteGain: GainNode | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private opts: VoiceClientOptions;
  private lastError: string | null = null;
  private toolManifest: VoiceToolDeclaration[] = [];
  private userTranscriptBuf = "";
  private modelTranscriptBuf = "";
  private toolBusy = false;

  constructor(opts: VoiceClientOptions = {}) {
    this.opts = opts;
  }

  /** Update options after construct (e.g. fresh router.push from React). */
  setOptions(partial: Partial<VoiceClientOptions>) {
    this.opts = { ...this.opts, ...partial };
  }

  getUiPhase(): VoiceUiPhase {
    return this.uiPhase;
  }

  getConnectionState(): VoiceConnectionState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getToolManifest(): VoiceToolDeclaration[] {
    return this.toolManifest;
  }

  /**
   * Request mic first (free), then mint token, then open Live WebSocket.
   * Mic-before-mint avoids burning the server cooldown when permission is denied.
   * Failures set state to "error" and resolve false (no uncaught throw).
   * @returns true if WebSocket reached "connected".
   */
  async connect(): Promise<boolean> {
    try {
      // Mic before mint: DeniedError must not consume a paid token / cooldown slot.
      this.setState("requesting_mic");
      await this.startMic();

      this.setState("minting_token");
      const session = await this.mintSession();
      this.toolManifest = session.toolManifest ?? [];

      this.setState("connecting");
      await this.openSocket(session.token, session.model ?? VOICE_LIVE_MODEL);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice connect failed";
      this.fail(message);
      return false;
    }
  }

  /** Close WebSocket and release mic / audio nodes. */
  disconnect(): void {
    this.teardownAudio();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setState("disconnected");
  }

  private setState(state: VoiceConnectionState) {
    this.state = state;
    this.opts.onStateChange?.(state);
    if (state === "connected") this.setUiPhase("listening");
    if (state === "error") this.setUiPhase("error");
    if (state === "disconnected" || state === "idle") this.setUiPhase("idle");
  }

  private setUiPhase(phase: VoiceUiPhase) {
    this.uiPhase = phase;
    this.opts.onUiPhaseChange?.(phase);
  }

  private emitTranscript(
    role: VoiceTranscriptEntry["role"],
    text: string
  ) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.opts.onTranscript?.({
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      text: trimmed,
      at: Date.now(),
    });
  }

  private fail(message: string) {
    this.lastError = message;
    this.opts.onError?.(message);
    this.emitTranscript("system", message);
    this.teardownAudio();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setState("error");
  }

  private async mintSession(): Promise<SessionResponse> {
    const url = this.opts.sessionUrl ?? "/api/copilot/voice/session";
    const res = await fetch(url, { method: "POST", credentials: "same-origin" });
    const data = (await res.json().catch(() => ({}))) as SessionResponse;
    if (!res.ok) {
      if (res.status === 429) {
        const sec = data.retryAfterSec ?? 15;
        throw new Error(
          `${data.error ?? "Voice session rate limit"} (retry in ~${sec}s)`
        );
      }
      throw new Error(data.error ?? `Session mint failed (${res.status})`);
    }
    if (!data.token || typeof data.token !== "string") {
      throw new Error("Session response missing token");
    }
    // Security: reject if a long-lived API key shape leaked (should never happen).
    if (data.token.startsWith("AIza") && data.token.length < 50) {
      throw new Error("Refusing suspicious token payload");
    }
    return data;
  }

  private async startMic(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone API not available in this browser");
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      // Browser maps deny / dismiss to NotAllowedError (message often just "Permission denied").
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error(
          "Microphone permission denied — allow mic for this site (lock icon → Site settings), then Connect again"
        );
      }
      if (name === "NotFoundError") {
        throw new Error("No microphone found on this device");
      }
      throw err instanceof Error ? err : new Error("Microphone access failed");
    }
  }

  private openSocket(token: string, model: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${LIVE_WS_PATH}?access_token=${encodeURIComponent(token)}`;
      let settled = false;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("WebSocket constructor failed"));
        return;
      }

      this.ws.onopen = () => {
        this.setState("connected");
        this.sendSetup(model);
        this.beginPcmStream();
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      this.ws.onerror = () => {
        const msg = "Voice WebSocket connection error";
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        } else {
          this.fail(msg);
        }
      };

      this.ws.onclose = () => {
        this.teardownAudio();
        if (this.state === "connected" || this.state === "connecting") {
          this.setState("disconnected");
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const text =
            typeof event.data === "string"
              ? event.data
              : event.data instanceof Blob
                ? await event.data.text()
                : new TextDecoder().decode(event.data as ArrayBuffer);
          const parsed = JSON.parse(text) as LiveServerMessage;
          this.opts.onMessage?.(parsed);
          if (parsed.setupComplete) {
            this.opts.onSetupComplete?.();
            this.setUiPhase("listening");
            this.sendJson({
              clientContent: {
                turns: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: "Say a brief hello and that you are ready to help navigate Release Desk.",
                      },
                    ],
                  },
                ],
                turnComplete: true,
              },
            });
          }
          if (parsed.toolCall?.functionCalls?.length) {
            await this.handleToolCall(parsed.toolCall.functionCalls);
          }
          this.handleServerContent(parsed);
        } catch {
          /* ignore malformed frames */
        }
      };
    });
  }

  /**
   * Run navigate_to / search_entity / get_summary and send toolResponse back to Live.
   * Sets UI phase to "thinking" while tools run so the mic strip shows progress
   * (audio stream is not blocked by the tool await beyond that indicator).
   */
  private async handleToolCall(
    calls: NonNullable<NonNullable<LiveServerMessage["toolCall"]>["functionCalls"]>
  ) {
    this.toolBusy = true;
    this.setUiPhase("thinking");
    // Release get_summary is a known ~8–10s cold path. Gemini 3.1 Flash Live does not
    // support NON_BLOCKING tools (no model audio while a function_call is in flight), so
    // primary filler is the system-instruction "speak before calling" nudge. If the model
    // skipped that, surface the same line in the transcript strip immediately.
    if (
      calls.some((c) => {
        if (c.name !== "get_summary") return false;
        const t = c.args?.entityType;
        return typeof t === "string" && t.trim().toLowerCase() === "release";
      })
    ) {
      this.emitTranscript("action", "Let me check that release…");
    }
    try {
      const navigate = this.opts.navigate;
      if (!navigate) {
        throw new Error("Voice navigate adapter not configured");
      }
      // Lazy-load handlers so Dashboard/Clerk hydration is not blocked by search index.
      const { dispatchVoiceToolCalls } = await import("@/lib/voice/handlers/dispatch");
      const { functionResponses, actionLines } = await dispatchVoiceToolCalls(
        calls,
        { push: navigate }
      );
      for (const line of actionLines) {
        this.emitTranscript(line.role, line.text);
      }
      this.sendJson({
        toolResponse: {
          functionResponses: functionResponses.map((fr) => ({
            id: fr.id,
            name: fr.name,
            response: fr.response,
          })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool dispatch failed";
      this.emitTranscript("system", message);
      this.sendJson({
        toolResponse: {
          functionResponses: calls.map((c) => ({
            id: c.id,
            name: c.name ?? "unknown",
            response: { ok: false, reason: message },
          })),
        },
      });
    } finally {
      this.toolBusy = false;
      if (this.state === "connected" && this.activeSources.length === 0) {
        this.setUiPhase("listening");
      }
    }
  }

  /**
   * Play model PCM, update transcripts, and drive speaking/listening phases.
   * @param parsed - Live API server message.
   */
  private handleServerContent(parsed: LiveServerMessage) {
    const content = parsed.serverContent;
    if (!content) return;

    if (content.inputTranscription?.text) {
      this.userTranscriptBuf += content.inputTranscription.text;
      if (content.inputTranscription.finished) {
        this.emitTranscript("user", this.userTranscriptBuf);
        this.userTranscriptBuf = "";
      }
    }
    if (content.outputTranscription?.text) {
      this.modelTranscriptBuf += content.outputTranscription.text;
      if (content.outputTranscription.finished) {
        this.emitTranscript("model", this.modelTranscriptBuf);
        this.modelTranscriptBuf = "";
      }
    }

    if (content.interrupted) {
      this.stopPlayback();
      if (!this.toolBusy) this.setUiPhase("listening");
      return;
    }
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        this.playPcm16Base64(part.inlineData.data, part.inlineData.mimeType);
      }
    }
    if (
      (content.turnComplete || content.waitingForInput) &&
      !this.toolBusy &&
      this.activeSources.length === 0
    ) {
      this.setUiPhase("listening");
    }
  }

  private stopPlayback() {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.activeSources = [];
    this.nextPlayTime = 0;
  }

  /**
   * Schedule a base64 PCM16 chunk on the playback AudioContext (24 kHz default).
   */
  private playPcm16Base64(base64: string, mimeType?: string) {
    const ctx = this.ensurePlaybackContext();
    const rate = sampleRateFromMime(mimeType) ?? PLAYBACK_SAMPLE_RATE;
    const bytes = base64ToUint8Array(base64);
    // Align to 16-bit samples (drop trailing odd byte if present).
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = (int16[i] ?? 0) / 0x8000;
    }
    const buffer = ctx.createBuffer(1, float32.length, rate);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, this.nextPlayTime);
    src.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.activeSources.push(src);
    if (!this.toolBusy) this.setUiPhase("speaking");
    src.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== src);
      if (
        this.activeSources.length === 0 &&
        !this.toolBusy &&
        this.state === "connected"
      ) {
        this.setUiPhase("listening");
      }
    };
  }

  private ensurePlaybackContext(): AudioContext {
    if (!this.playbackContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.playbackContext = new AudioCtx({ sampleRate: PLAYBACK_SAMPLE_RATE });
    }
    void this.playbackContext.resume();
    return this.playbackContext;
  }

  private sendSetup(model: string) {
    const setup = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Puck" },
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [
            {
              text: [
                "You are Release Desk voice.",
                "Tools: navigate_to, search_entity, get_summary, propose_action, confirm_action.",
                "Keep spoken replies brief.",
                "Questions about a record → prefer get_summary over navigate_to.",
                "Writes: ONLY set_approval_decision and acknowledge_alert via propose_action then confirm_action.",
                "NEVER execute a write without a separate user yes after propose. If the user says \"yes, approve X now\" in one breath, call propose_action ONLY in that turn — wait for a later yes before confirm_action.",
                "On no/cancel: confirm_action with accept=false (same actionId). Do not re-propose automatically.",
                "Resolve ids with search_entity first. Never invent codes.",
                "Latency: before get_summary with entityType=release, speak \"Let me check that release\" first. No filler for other entity types.",
              ].join(" "),
            },
          ],
        },

        tools: [
          {
            functionDeclarations: this.toolManifest.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ],
      },
    };
    this.sendJson(setup);
  }

  private beginPcmStream() {
    if (!this.mediaStream || !this.ws) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioCtx({ sampleRate: MIC_SAMPLE_RATE });
    void this.audioContext.resume();
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    // ScriptProcessor is deprecated but widely available for Phase 0 PCM; AudioWorklet later.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    // Mute local monitoring — mic must not play through speakers (feedback / masks model audio).
    this.muteGain = this.audioContext.createGain();
    this.muteGain.gain.value = 0;
    this.processor.onaudioprocess = (ev) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = ev.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(input);
      const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);
      this.sendJson({
        realtimeInput: {
          audio: { mimeType: `audio/pcm;rate=${MIC_SAMPLE_RATE}`, data: base64 },
        },
      });
    };
    this.source.connect(this.processor);
    this.processor.connect(this.muteGain);
    this.muteGain.connect(this.audioContext.destination);
  }

  private sendJson(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private teardownAudio() {
    this.stopPlayback();
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.muteGain?.disconnect();
      void this.audioContext?.close();
      void this.playbackContext?.close();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.muteGain = null;
    this.audioContext = null;
    this.playbackContext = null;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = null;
    }
  }
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sampleRateFromMime(mimeType?: string): number | null {
  if (!mimeType) return null;
  const m = /rate=(\d+)/i.exec(mimeType);
  return m ? Number(m[1]) : null;
}
