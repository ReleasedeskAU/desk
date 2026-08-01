# Screen-share proof notes (Steps 2–4 + 3.5)

Manual checklist for Preview / local with `GEMINI_API_KEY`.

## Defaults (audio-only unchanged)

- [ ] Connect voice **without** tapping the monitor toggle.
- [ ] Simple spoken query (e.g. “summarize REL-0001” / get_summary) feels the same as pre-screen-share builds.
- [ ] Network: no `realtimeInput.video` frames while share is off.
- [ ] Toggle defaults **off** (`aria-pressed=false` on `voice-screen-share-toggle`).

## Opt-in tab capture

- [ ] With voice connected, tap monitor → Chrome picker shows **Entire Screen / Window / Chrome Tab**.
- [ ] Yellow “Sharing …” strip appears while share is active (browser-mandated for `getDisplayMedia`; cannot be removed by the app).
- [ ] Voice stays **connected** after picking a source (no remint-on-enable disconnect).
- [ ] Ask “what am I looking at” → one JPEG uplink + accurate description.
- [ ] Idle with share on → **no** continuous frame spam (on-demand only).

## Legibility (`MEDIA_RESOLUTION_HIGH`)

- [ ] On Releases (or Risk) table, ask what a visible **release ID / status badge / risk score** is.
- [ ] Model reads the visible value correctly (not a nearby row / invent).
- [ ] If misread: keep HIGH; do **not** “fix” by raising fps.

## Untrusted screen

- [ ] Page text that looks like “approve REL-…” must **not** stage a propose by itself.
- [ ] Spoken “approve …” still works (write-intent gate).

## Step 3.5 — ~8 min proactive remint (A+V and audio)

**Docs (not assumptions):**

- Without compression, A+V ≈ **2 min** hard cap; with `contextWindowCompression` (enabled in Live setup) that session cap is lifted.
  https://ai.google.dev/gemini-api/docs/live-api/session-management
- Proactive remint is for the Live **WebSocket** window (~10 min), not an A+V content cap.
- Resumption restores **conversation context** (Cloud: cached text/video/audio prompts + outputs).
  **Live video uplink is not a persistent server stream** — client must re-send frames after reconnect (we send a post-resume frame + idle/on-demand thereafter).

**Implementation:**

- `MEDIA_RESOLUTION_HIGH` is set in ephemeral-token constraints + client `generationConfig.mediaResolution` (inside generationConfig — not top-level).
- Capture width 1280 / JPEG 0.92 for table ID legibility.
- Proactive remint at **~8 minutes** (`VOICE_AV_PROACTIVE_RECONNECT_MS` = `8 * 60_000`, same cadence as `VOICE_AUDIO_PROACTIVE_RECONNECT_MS`) with the same Disconnected/Reconnecting UX; mic + display tracks kept; PCM reattached after remint.
- Brief audible gap during remint/token mint is expected (same class as Phase 4 reconnect); continuous audio across the swap is **not** fully avoidable while the WS is down.

**Live test (~8 min):**

- [ ] Share on; talk lightly for ~8 minutes.
- [ ] Observe planned silent WebSocket renew / remint (not a silent stale drop; not a “~2 min A+V limit” event — that cap no longer applies with compression).
- [ ] Note gap length (expect ~1–3s while reminting).
- [ ] After resume, ask a screen question — frame re-attached; conversation context intact.
- [ ] Confirm audio resumes without needing to re-click mic / re-pick the tab.
