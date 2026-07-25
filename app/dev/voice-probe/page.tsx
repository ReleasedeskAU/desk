"use client";

/**
 * Phase 0 plumbing probe — mint + WebSocket lifecycle only.
 * Not product UI (no mic pill styling). Open while signed in: /dev/voice-probe
 */
import { useCallback, useRef, useState } from "react";
import {
  VoiceLiveClient,
  type VoiceConnectionState,
} from "@/lib/voice/client";

export default function VoiceProbePage() {
  const [state, setState] = useState<VoiceConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastLog, setLastLog] = useState<string>("");
  const clientRef = useRef<VoiceLiveClient | null>(null);

  const log = useCallback((msg: string) => {
    const line = `[voice-probe] ${msg}`;
    console.log(line);
    setLastLog(line);
  }, []);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new VoiceLiveClient({
        onStateChange: (s) => {
          setState(s);
          log(`state=${s}`);
        },
        onError: (m) => {
          setError(m);
          log(`error=${m}`);
        },
        onSetupComplete: () => log("setupComplete received — waiting for audio"),
        onMessage: (data) => {
          const msg = data as {
            serverContent?: { modelTurn?: { parts?: unknown[] }; interrupted?: boolean };
          };
          const parts = msg.serverContent?.modelTurn?.parts?.length ?? 0;
          if (parts > 0) {
            log(`model audio/text parts=${parts}`);
          } else {
            log(`message keys=${Object.keys((data as object) ?? {}).join(",")}`);
          }
        },
      });
    }
    return clientRef.current;
  }, [log]);

  const onConnect = useCallback(async () => {
    setError(null);
    const client = getClient();
    const ok = await client.connect();
    log(ok ? "connect() returned true (connected)" : "connect() returned false");
  }, [getClient, log]);

  const onDisconnect = useCallback(() => {
    const client = getClient();
    client.disconnect();
    setState(client.getConnectionState());
    log("disconnect()");
  }, [getClient, log]);

  return (
    <main className="mx-auto max-w-lg p-6 font-sans text-sm text-gray-900">
      <h1 className="text-lg font-semibold">Voice Phase 0 probe</h1>
      <p className="mt-1 text-gray-600">
        Plumbing only — Connect opens Gemini Live, streams mic audio, and plays model audio back.
        After <code>connected</code>, wait for a short greeting, then speak.
      </p>
      <p className="mt-4">
        State: <code data-testid="voice-state">{state}</code>
      </p>
      {error ? (
        <p className="mt-2 text-red-700" data-testid="voice-error">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded border border-gray-400 bg-white px-3 py-1.5"
          onClick={() => void onConnect()}
        >
          Connect
        </button>
        <button
          type="button"
          className="rounded border border-gray-400 bg-white px-3 py-1.5"
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
      <pre className="mt-4 whitespace-pre-wrap break-all text-xs text-gray-500">{lastLog}</pre>
    </main>
  );
}
