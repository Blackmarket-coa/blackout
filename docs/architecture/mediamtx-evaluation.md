# MediaMTX Evaluation (OSS Gap-Fill WS2 Phase 2)

**Status:** Decision record, July 2026. Companion to `OSS_GAP_FILL_BUILD_PLAN.md`
(Workstream 2 Phase 2) — evaluates adopting [MediaMTX](https://github.com/bluenviron/mediamtx)
(MIT) as the ingest/record/playback server, against the shipped Phase-1 stack.

## What ships today

-   **Ingest:** Owncast (MIT), operator-provided via `OWNCAST_BASE_URL`; Blackout mints
    stream keys (`integrations/owncast.ts`) and embeds the Owncast player.
-   **Recording:** `services/vodRecorderWorker.ts` — one supervised ffmpeg per live session
    copying the Owncast HLS feed to mp4, auto-registering `replayPointer`.
-   **Clips:** `services/clipCutterWorker.ts` — ffmpeg stream-copy cuts from those
    recordings, plus optional whisper.cpp captions.
-   **Playback:** `/v1/streaming/vod-files/*` and `/clip-files/*` serve local files with
    Range support.

## What MediaMTX would add

| Capability                    | Today (Owncast + ffmpeg)                                                                        | With MediaMTX                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Concurrent creator broadcasts | **One** — Owncast is a single-ingest server; the whole MVP assumes one global `hls/stream.m3u8` | Unlimited named paths (`/live/<creator>`), per-path auth hooks that could call our stream-key API                     |
| Ingest protocols              | RTMP only                                                                                       | RTMP, SRT, WHIP/WebRTC (lower latency), RTSP                                                                          |
| Recording                     | Our ffmpeg worker (finalize-at-end mp4; unreadable until the session ends)                      | Native segmented fMP4 recording per path — readable mid-stream, which unlocks true "clip the last 60s **while live**" |
| Playback                      | Our Range-serving routes                                                                        | Built-in playback endpoint (`/get?path&start&duration`) with time-addressed access                                    |
| Player                        | Owncast embed iframe                                                                            | Bring-your-own player (HLS.js / WHEP), which the client already planned to adopt                                      |

## Decision

**Defer adoption; re-evaluate at the multi-creator milestone.** Rationale:

1. The Phase-1 recorder/cutter is shipped, tested, and sufficient while Owncast's
   single-ingest constraint caps the platform at one live broadcast anyway.
2. MediaMTX's decisive advantages — per-creator ingest paths and mid-stream segmented
   recording — only pay off once **more than one creator can be live at once**. That is
   the trigger condition, not a date.
3. Owncast currently supplies chat-adjacent presence and an embeddable player for free;
   MediaMTX is headless, so adoption also requires the HLS.js player work the client has
   so far deferred (`LivestreamViewer` embeds the Owncast page).

## Migration sketch (when triggered)

1. Deploy `bluenviron/mediamtx` beside the API (single container, no dependencies);
   configure `runOnDemand`-style per-path auth against `POST /v1/streaming/creators/:id/stream-key`.
2. Point `rtmpFanoutWorker` and `vodRecorderWorker` inputs at per-creator MediaMTX paths
   (`http://mediamtx:8888/live/<creator>/index.m3u8`) — both already take the input URL
   from config, so this is env-level.
3. Switch session recording to MediaMTX native segmented recording; keep our
   `replayPointer` registration by polling its control API on session end. Retire the
   ffmpeg recorder once parity is proven; the clip cutter keeps working unchanged against
   the recorded files.
4. Replace the Owncast embed with HLS.js (or WHEP for sub-second latency) in
   `LivestreamViewer` — the long-deferred player work becomes mandatory here.
5. Decommission Owncast, or keep it as a legacy single-stream fallback during rollout.

Licensing: MIT server run as a separate service — consistent with the repo's
link-permissive / run-copyleft-separately posture (MediaMTX is permissive anyway).
