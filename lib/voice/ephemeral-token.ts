/**
 * Server-only: mint Gemini Live ephemeral tokens via @google/genai.
 * Real GEMINI_API_KEY never leaves this module / the session route.
 */
import { GoogleGenAI, MediaResolution, Modality, type FunctionDeclaration } from "@google/genai";
import {
  VOICE_LIVE_MODEL,
  VOICE_TOOL_MANIFEST,
} from "@/lib/voice/tool-manifest";

export type MintedVoiceToken = {
  /** Ephemeral access token for WebSocket (not the API key). */
  token: string;
  model: typeof VOICE_LIVE_MODEL;
  /** ISO expire time for the token (when provided by API). */
  expireTime: string | null;
};

/**
 * Map frozen toolManifest to SDK FunctionDeclarations.
 * Uses parametersJsonSchema so client-facing JSON Schema stays stringly-typed
 * without pulling Schema/Type enums into the browser bundle.
 */
function voiceFunctionDeclarations(): FunctionDeclaration[] {
  return VOICE_TOOL_MANIFEST.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }));
}

/**
 * Create a short-lived Live API token locked to our Phase-0 model + tools.
 * @throws If GEMINI_API_KEY is missing or Google rejects the request.
 */
export async function mintVoiceEphemeralToken(): Promise<MintedVoiceToken> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it to the server environment (never NEXT_PUBLIC_*)."
    );
  }

  const client = new GoogleGenAI({ apiKey });
  const expireTime = new Date(Date.now() + 70 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const created = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      httpOptions: { apiVersion: "v1alpha" },
      liveConnectConstraints: {
        model: VOICE_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          // HIGH = 280 tokens/frame — required so table IDs/status text are legible (LOW/MEDIUM = 70).
          // Must use the SDK enum (string literal is not assignable to MediaResolution).
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
          sessionResumption: {},
          // Sliding-window compression — required for multi-hour sessions (same as Gemini app).
          // Without it, audio ≈15 min / A+V ≈2 min hard session caps apply.
          contextWindowCompression: {
            slidingWindow: {},
          },
          systemInstruction: {
            parts: [
              {
                text: "You are Release Desk's professional release manager. Tools: navigate_to, apply_list_filters, explain_page, run_walkthrough, search_entity, get_summary, propose_action, confirm_action. For release ready/blocked questions use search_entity then get_summary (verdict + why). For what is this page use explain_page. For tours use run_walkthrough. Prefer get_summary for record questions; navigate_to for opening pages; apply_list_filters to filter lists. Before search_entity say you are searching; before navigate_to say you are navigating; before apply_list_filters say you are applying filters; before get_summary say you are looking it up. Follow [SESSION] prompts to greet on new sessions or continue after a silent connection refresh — never invent a network outage. Writes are only set_approval_decision and acknowledge_alert: always propose_action first (does not save), then wait for an explicit yes in a LATER turn before confirm_action. If the user combines request+yes in one sentence, ONLY propose in that turn. On no/cancel: confirm_action with accept=false. Never invent ids. When screen frames arrive, read IDs digit-by-digit from the image — never guess REL codes.",
              },
            ],
          },
          tools: [{ functionDeclarations: voiceFunctionDeclarations() }],
        },
      },
    },
  });

  // AuthToken.name is the ephemeral credential (auth_tokens/…), not GEMINI_API_KEY.
  const token = created.name;
  if (!token || typeof token !== "string") {
    throw new Error("Gemini authTokens.create returned no token name");
  }

  return {
    token,
    model: VOICE_LIVE_MODEL,
    expireTime,
  };
}
