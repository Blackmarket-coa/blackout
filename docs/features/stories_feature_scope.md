# Stories Feature Scope

## Goal
Ship ephemeral, media-first Stories that feel native to Blackout while preserving privacy-first defaults, abuse controls, and low-latency playback.

## Scope Summary

### In scope (MVP)
- Story creation from mobile and desktop (camera upload, gallery upload, text overlay, stickers, mention, audience selector).
- Story feed tab with ordered cards, unread indicators, and segmented views (Following, Mutuals, Local/room-scoped when enabled).
- Expiry lifecycle with default 24-hour TTL and automatic archival deletion policies.
- Privacy controls: close-friends list, followers-only, room-members-only, and per-story allow/deny overrides.
- Moderation hooks for upload-time checks, report/review workflows, and emergency takedown.

### Out of scope (post-MVP)
- Story ads/sponsored placements.
- Advanced AR effects marketplace.
- Collaborative multi-author stories.
- Cross-instance federation of stories beyond opt-in trusted peers.

---

## 1) Data Model

### Core entities

#### `story`
- `story_id` (ULID/UUID, PK)
- `author_id` (FK user)
- `created_at` (timestamp)
- `expires_at` (timestamp; default `created_at + 24h`)
- `visibility_mode` (enum: `public_followers`, `close_friends`, `room_members`, `custom_acl`)
- `audience_ref` (nullable FK to ACL set or room ID)
- `status` (enum: `active`, `expired`, `removed_by_author`, `removed_by_moderation`)
- `content_warning_flags` (jsonb; e.g., sensitive content labels)
- `integrity_hash` (sha256 of canonical manifest)

#### `story_item`
- `item_id` (PK)
- `story_id` (FK)
- `media_type` (enum: `image`, `video`, `text_card`)
- `media_asset_id` (nullable FK to media pipeline artifact)
- `caption` (nullable text)
- `overlay_payload` (jsonb: text blocks, sticker refs, mentions)
- `duration_ms` (display/playback duration)
- `order_index` (int)
- `created_at` (timestamp)

#### `story_audience_acl`
- `acl_id` (PK)
- `owner_id` (FK user)
- `acl_type` (enum: `allow`, `deny`, `close_friends`)
- `subject_type` (enum: `user`, `room`, `list`)
- `subject_id` (id)
- `created_at`, `updated_at`

#### `story_view_event`
- `event_id` (PK)
- `story_id`, `item_id`
- `viewer_id`
- `viewed_at`
- `view_ms` (engagement duration)
- `completion_state` (enum: `started`, `completed`, `skipped`)

#### `story_moderation_case_link`
- `link_id` (PK)
- `story_id`
- `case_id` (FK moderation case system)
- `reason_code`
- `state` (enum: `queued`, `reviewing`, `actioned`, `dismissed`)
- `created_at`, `updated_at`

### Indexing and retention
- Composite index: `(author_id, created_at desc)` for profile story rails.
- Composite index: `(expires_at, status)` for expiry sweeps.
- Feed materialization index: `(viewer_id, rank_bucket, created_at desc)` in cache table.
- TTL cleanup jobs:
  - Mark expired at `expires_at`.
  - Hard-delete content+assets after configurable grace period (default: 7 days for abuse/legal hold).
  - Keep aggregate analytics only (privacy-preserving, no raw viewer IDs after retention window).

### Access control rules
- Read allowed when:
  - viewer passes `visibility_mode` + ACL checks,
  - viewer not blocked by author,
  - story `status=active` and now < `expires_at`.
- Write/delete allowed only for author, delegated org moderators, or trust-and-safety automation with signed reason.

---

## 2) Media Processing Path

### Upload and processing flow
1. **Client preflight**
   - Validate type/size/duration locally.
   - Strip unsafe metadata (e.g., EXIF geo unless user opts in).
   - Generate preview thumbnail and upload manifest.
2. **Ingest API**
   - Issue resumable upload URL + upload token.
   - Bind upload to `story_draft_id`.
3. **Object storage landing zone**
   - Encrypted-at-rest raw asset bucket (short-lived quarantine prefix).
4. **Processing worker**
   - Virus/malware scan.
   - Transcode video to adaptive ladders (e.g., 360p/720p), normalize codecs.
   - Generate image renditions and blurhash/placeholder.
   - Optional perceptual hash extraction for abuse matching.
5. **Moderation pre-check gate**
   - Automated classifiers + policy heuristics run before publish.
   - If high-risk: hold in `pending_review`; otherwise promote to publishable state.
6. **Publish finalize**
   - Persist `story` + `story_item` manifest.
   - Emit feed fanout event.
   - Invalidate feed caches for affected audiences.

### Performance targets (MVP)
- P95 upload-to-publish under 8s for a 15-second 720p clip on broadband.
- First-frame render under 500ms in warm-cache conditions.
- Media processing retries with idempotent job keys.

### Security/privacy notes
- End-to-end encryption compatibility mode:
  - If room-scoped encrypted stories are enabled, media keys are wrapped per audience set.
- Signed CDN URLs with short TTL.
- Region-aware storage routing with policy guardrails.

---

## 3) Moderation Hooks

### Hook points
- **Pre-publish automated checks**
  - NSFW/violence classifiers.
  - OCR+text policy scan on overlays/captions.
  - Hash matching against known abuse datasets.
- **Post-publish reactive checks**
  - User report events from viewer UI.
  - Risk scoring from rapid-reshares/replay spikes.
  - Trust graph anomaly signals.
- **Human moderation integration**
  - One-click jump from case console to story snapshot package.
  - Action set: remove item, remove full story, temporary posting lock, account escalation.

### Required moderation APIs/events
- `story.publish.requested`
- `story.publish.blocked`
- `story.report.created`
- `story.removed`
- `story.expired`
- `story.legal_hold.applied`

Each event should include: `story_id`, `author_id`, `policy_context`, `trace_id`, `timestamp`.

### Policy and audit requirements
- Immutable audit log for moderation actions.
- Explainable reason codes surfaced to users for removals (unless restricted by policy/law enforcement constraints).
- Legal hold path bypasses standard expiry deletion for scoped content.

---

## 4) Tab Integration UX

### Navigation model
- Add **Stories** as a top-level tab adjacent to Home/Chats in mobile; as a left-rail destination on desktop.
- Persistent unread badge count on tab icon.
- Deep-link support:
  - `blackout://stories`
  - `blackout://stories/{author_id}`
  - `blackout://stories/{story_id}`

### Feed UX behavior
- Horizontal story rings at top (mobile) and compact strip (desktop).
- Ranking layers:
  1. Close social ties.
  2. Unviewed recency.
  3. Safety/quality demotion rules.
- Playback gestures:
  - Tap right/left: next/previous item.
  - Press-and-hold: pause.
  - Vertical swipe down: dismiss.
- Viewer state sync across devices (resume position best-effort, near real time).

### Creation UX entry points
- Primary “+ Story” CTA inside Stories tab.
- Secondary quick-entry from composer and profile avatar.
- Draft recovery when app closes unexpectedly.

### Privacy UX controls
- Audience picker is mandatory before first publish; remembers last-used audience with explicit confirmation when broader than previous.
- Per-story setting sheet:
  - `Who can view`
  - `Allow replies`
  - `Allow reshare`
  - `Hide from...`
- “Why am I seeing this?” explainer for recommendation transparency.

### Accessibility and safety UX
- Full screen-reader labels for story controls.
- Auto-caption support where available.
- Motion-reduction mode disables autoplay transitions.
- Inline report/block actions always one tap away during playback.

---

## Delivery Phasing

### Phase 1 (MVP)
- Creation + feed + 24h expiry + baseline privacy modes + pre/post moderation hooks.

### Phase 2
- Better ranking controls, close-friends management improvements, richer analytics.

### Phase 3
- Optional encrypted room stories and selective federation expansion.

## Success Metrics
- Story creation completion rate.
- Time-to-first-story for new users.
- View-through rate per story item.
- Report rate per 1,000 views and moderation turnaround time.
- Expiry job SLO adherence and deletion correctness.
