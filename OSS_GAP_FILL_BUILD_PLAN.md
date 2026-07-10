# OSS Gap-Fill Build Plan

**Status:** Proposed (July 2026). Companion to
[`docs/audits/competitor_depth_analysis_verification_2026_07.md`](docs/audits/competitor_depth_analysis_verification_2026_07.md),
which verified the competitive depth gaps against this repo. This plan fills those gaps by
adopting and modifying open-source software instead of building from scratch, grounded in what
the repo already runs.

## Principles

1. **Reuse the OSS already in the stack before adopting more.** The audit found chosen-but-unwired
   infrastructure: a ClickHouse 24.3 + Cube v0.36 + Metabase CE analytics warehouse
   (`infra/single-server-baseline/docker-compose.yml`, `docs/runbooks/ANALYTICS_WAREHOUSE.md`)
   with an `analytics_raw.events` landing table that nothing writes to yet, and a
   `postgis/postgis:16-3.4` database with a dedicated `spatial` DB plus a `martin` MapLibre tile
   server. Most "gaps" are wiring, not platform selection.
2. **License posture (matches existing practice).** Blackout is tri-licensed
   (AGPL-3.0 / GPL-3.0 / commercial), so: **link permissive only** (MIT/Apache-2.0/BSD);
   **run copyleft as separate processes/services** over HTTP/IPC — exactly how the repo already
   treats ffmpeg (GPL/LGPL, spawned) and Metabase (AGPL, separate container).
3. **Clone existing patterns.** New pollers follow the `setInterval().unref()` + env-gate
   scheduler idiom registered in `packages/api/src/backgroundLoops.ts` (runs in the dedicated
   `worker` container). New media jobs clone the supervised `ProcessFactory` spawn pattern from
   `packages/api/src/services/rtmpFanoutWorker.ts`.

## Gap → OSS mapping

| Gap (audit finding) | OSS | License | Integration mode | Status in repo |
| --- | --- | --- | --- | --- |
| Creator/audience analytics (ABSENT) | ClickHouse + Cube | Apache-2.0 | Already-deployed services; add ingestion + query routes | Scaffolded, unwired |
| Live viewer metrics (ABSENT) | Owncast admin API (`/api/admin/viewersOverTime`, `/api/admin/viewers`, `/api/admin/prometheus`) | MIT | HTTP poller scheduler | Owncast referenced (`OWNCAST_BASE_URL`) but never deployed or admin-called |
| VOD recording (pointer-only) | ffmpeg (phase 1), MediaMTX (phase 2 option) | GPL/LGPL spawned; MIT | Spawned recorder job; optional ingest/record/playback server | ffmpeg already spawned for RTMP fanout |
| Clips editing (ABSENT) | ffmpeg.wasm (client trim/crop), ffmpeg (server cut) | MIT wrapper / LGPL core; GPL/LGPL spawned | Browser wasm asset; spawned job | Greenfield |
| Auto-captions (ABSENT) | whisper.cpp (`--output-srt`/`--output-vtt`) | MIT | Spawned job, SRT/VTT sidecar | Greenfield |
| Proximity discovery (SHELL-ONLY) | PostGIS + martin + MapLibre; h3-js if cell-bucketing needed | GPL (separate DB service) / MIT / BSD / Apache-2.0 | Already-deployed DB + tiles; add opt-in coarse location + nearby query | Deployed, unused by feed |
| Payout transparency (surfacing) | — none needed | — | Surface `packages/core/src/marketplace/fees.ts` constants + FBM data in UI | Code exists |
| Feed diversity caps (missing) | — none needed | — | Pure code in `unifiedFeedModel.ts` `mergeAndRank` | Days of work |

## Workstream 1 — Analytics layer (top gap; mostly wiring)

The warehouse is chosen and running; ingestion and creator-facing display are the missing 60%.

1. **Client event transport (greenfield).** The client's `blackout:telemetry` `CustomEvent` bus
   is in-window only — nothing POSTs it. Add a batching transport
   (`navigator.sendBeacon` with fetch fallback, flush on interval/`visibilitychange`) that ships
   events to the API. Extend emission to the surfaces that matter: feed-item impressions and
   opens (`UnifiedFeedCard`, `MobileSwipeFeed`), stream watch heartbeats (`LivestreamViewer`),
   clip plays and watch-through (`ClipViewer`), listing views (`CreatorListings`).
2. **Ingest endpoint (greenfield, small).** New `POST /v1/telemetry/events` in `packages/api`:
   validate (zod, capped batch), enrich (user hash, ts), batch-insert to ClickHouse over HTTP
   (`:8123`, `analytics_raw.events` — table + 30-day TTL already defined). No ORM needed;
   ClickHouse HTTP interface is a `fetch` with `INSERT ... FORMAT JSONEachRow`.
3. **Owncast metrics poller (greenfield, small).** Deploy Owncast in the compose stacks (today
   it's an assumed-external service) and add `services/owncastMetricsScheduler.ts` polling
   `/api/admin/viewersOverTime` + `/api/admin/viewers` (admin basic auth = stream key), writing
   snapshots to ClickHouse keyed by active stream session. Register in `backgroundLoops.ts`
   behind `BLACKOUT_OWNCAST_METRICS`.
4. **Creator-facing queries.** New `GET /v1/creator/analytics/*` routes querying Cube's REST API
   (Apache-2.0, already deployed; seed schema at `infra/single-server-baseline/cube/schema/`)
   or ClickHouse directly: per-post views, per-clip plays + watch-through %, per-stream
   concurrents/peak/watch-time, follower count over time (join `follows.ts` data). Render in a
   new Creator Hub **Insights** panel (13th tab or Overview cards upgrade).
   Metabase stays ops-only (AGPL, separate container — don't embed).
5. **Benchmark to hit** (per the competitive analysis): Discord Server Insights floor —
   visitors, communicators, 1-week retention — before any TikTok-style depth.

## Workstream 2 — VOD recording (make Replays real)

- **Phase 1 (no new services):** clone the `rtmpFanoutWorker` supervisor into a
  `vodRecorderWorker` that, on stream-session start, spawns
  `ffmpeg -i <OWNCAST_BASE_URL>/hls/stream.m3u8 -c copy -movflags +faststart <session>.mp4`
  and on clean exit sets the session's `replayPointer` automatically (today it is
  client-supplied). Storage: a dedicated volume served by the existing Caddy/nginx reverse
  proxy (there is **no S3/minio in the stack**; Matrix media is the only blob store and is
  wrong for multi-GB VODs).
- **Phase 2 (option, evaluate):** adopt **MediaMTX** (MIT) as the ingest+record+playback server —
  it natively records to fMP4 with segmenting, exposes a playback endpoint
  (`/get?path=&start=&duration=`) and a control API, which would replace both the ffmpeg
  recorder and ad-hoc file serving, and could eventually replace the Owncast ingest path
  entirely. Decide after Phase 1 proves demand.

## Workstream 3 — Clips: trim + vertical crop + auto-captions

- **Client-side trim/crop:** `@ffmpeg/ffmpeg` (ffmpeg.wasm — MIT wrapper, LGPL core loaded as a
  runtime wasm asset, consistent with the license posture) in a new clip composer on the Clips
  tab: trim handles, 9:16 crop preset, then upload the result through the existing Matrix media
  upload (`integrations/matrix-client.ts` → `mxc://`) into the existing
  `POST /v1/streaming/clips` (`mediaPointer`). Keyframe-copy for instant cuts; re-encode only
  when crop is applied.
- **"Clip the last 60s" from live:** once Workstream 2 records sessions, a server-side
  `ffmpeg -ss ... -t ... -c copy` job (same supervisor pattern) cuts from the recording — this
  is the capture-from-stream path Discord Clips has and Blackout currently lacks.
- **Auto-captions:** spawn **whisper.cpp** (MIT, models MIT) server-side on clip publish with
  `--output-vtt`; store the VTT as a sidecar pointer next to `mediaPointer`; the reel viewer
  (`ClipViewer.tsx`) adds a `<track>`. Burn-in via ffmpeg is optional later. This combination
  (trim + captions + vertical) clears Discord Clips and reaches entry-level TikTok, per the
  competitive analysis.

## Workstream 4 — Real "signals nearby" (opt-in proximity)

- Substrate already deployed: PostGIS 16-3.4 with a dedicated `spatial` database, `martin` tile
  server, MapLibre-ready. Nothing feeds it from the product.
- Add **opt-in, coarse** location on coalition signals/events/market listings (round to ~1km or
  an H3 cell via `h3-js`, Apache-2.0 — never store raw coordinates), a
  `GET /v1/discovery/nearby` route using `ST_DWithin`, and replace the Home chip's current
  item-count stand-in (`signalCount` in `HomeFeed.tsx`) with the real nearby count; chip opens
  a nearby-signals panel. Ties to the Coalition mutual-aid mission, which is where the
  competitive analysis says this wedge is defensible.

## Workstream 5 — No-OSS-needed quick wins (do alongside WS1)

- **Payout transparency:** surface the existing `fees.ts` schedule (FBM 3%, weekly cadence) and
  FBM payout status in `CreatorEarningsDashboard.tsx`; add a "How payouts work" panel with the
  concrete numbers, Discord-style.
- **Feed diversity cap:** per-source cap in `mergeAndRank`
  (`apps/blackout-client/src/app/features/home/unifiedFeedModel.ts`) so one surface can't flood
  Following. Scoring/affinity already exist; this is the only missing ranking piece.

## Suggested order

1. WS5 (days — pure surfacing/code, immediate trust + feed quality)
2. WS1 (the #1 competitive gap; warehouse already running, so ~2–3 weeks of wiring)
3. WS2 Phase 1 → WS3 (recording unlocks clip-from-stream; captions land with the composer)
4. WS4 (after instrumentation exists to measure whether proximity earns engagement)

## Explicitly not adopted

- **Umami / Plausible / PostHog** — redundant: the repo already standardized on
  ClickHouse + Cube + Metabase; adding a second analytics stack would split the event stream.
- **PeerTube** (AGPL, full video platform) — far heavier than the recorder + composer needed.
- **Remotion / AutoCut-class editors** — per the competitive analysis, wrong battle at this
  scale; ffmpeg.wasm trim/crop/captions is the 80/20.
- **Recommendation engines** (Gorse etc.) — the follow-graph + score model is the deliberate
  architectural bet; keep it.
