/**
 * Phase 0 proof helper:
 * 1) Mint ephemeral token (requires GEMINI_API_KEY)
 * 2) Print redacted response shape matching /api/copilot/voice/session
 * 3) Open Gemini Live constrained WebSocket and log connected state
 *
 * Usage (from Sentinel/):
 *   npx tsx --env-file=.env scripts/prove-voice-session.ts
 */
import WebSocket from "ws";
import { mintVoiceEphemeralToken } from "../lib/voice/ephemeral-token";
import { VOICE_TOOL_MANIFEST } from "../lib/voice/tool-manifest";

function redactToken(token: string): string {
  if (token.length < 12) return "[REDACTED]";
  return `${token.slice(0, 12)}…[REDACTED]…${token.slice(-6)}`;
}

function assertNoApiKeyLeak(payload: unknown, apiKey: string): void {
  const serialized = JSON.stringify(payload);
  if (serialized.includes(apiKey)) {
    throw new Error("SECURITY FAIL: GEMINI_API_KEY appears in response payload");
  }
  if (/AIza[0-9A-Za-z_-]{20,}/.test(serialized)) {
    throw new Error("SECURITY FAIL: API-key-shaped string in response payload");
  }
}

function openLiveWs(token: string): Promise<string> {
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let settled = false;
    const done = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      reject(new Error("WebSocket connect timed out (8s)"));
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }, 8000);

    ws.on("open", () => {
      console.log("[prove] WebSocket state: connected (onopen)");
      ws.send(
        JSON.stringify({
          setup: {
            model: "models/gemini-3.1-flash-live-preview",
            generationConfig: { responseModalities: ["AUDIO"] },
          },
        })
      );
    });

    ws.on("message", (data) => {
      const text = data.toString();
      let keys: string[] = [];
      try {
        keys = Object.keys(JSON.parse(text) as object);
      } catch {
        keys = ["<non-json>"];
      }
      console.log(`[prove] WebSocket message keys: ${keys.join(",")}`);
      if (keys.includes("setupComplete") || keys.includes("setup_complete")) {
        console.log("[prove] WebSocket setupComplete — session live");
        done("setupComplete");
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("close", (code, reason) => {
      console.log(
        `[prove] WebSocket closed code=${code} reason=${reason?.toString?.() || ""}`
      );
      done("closed");
    });
  });
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "GEMINI_API_KEY is not set. Add it to Sentinel/.env (server-only, never NEXT_PUBLIC_*), then re-run:\n  npx tsx --env-file=.env scripts/prove-voice-session.ts"
    );
    process.exit(2);
  }

  const minted = await mintVoiceEphemeralToken();
  const routeShaped = {
    token: minted.token,
    toolManifest: VOICE_TOOL_MANIFEST,
    model: minted.model,
    expireTime: minted.expireTime,
    organizationId: null as string | null,
  };

  assertNoApiKeyLeak(routeShaped, apiKey);

  const redacted = {
    ...routeShaped,
    token: redactToken(routeShaped.token),
  };

  console.log("[prove] /api/copilot/voice/session response shape (token redacted):");
  console.log(JSON.stringify(redacted, null, 2));
  console.log("[prove] Confirmed: GEMINI_API_KEY does not appear in payload.");
  console.log(
    `[prove] Token looks like ephemeral name: ${String(minted.token).startsWith("auth_tokens/")}`
  );

  const wsResult = await openLiveWs(minted.token);
  console.log(`[prove] WebSocket probe finished: ${wsResult}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[prove] FAILED:", message);
  process.exit(1);
});
