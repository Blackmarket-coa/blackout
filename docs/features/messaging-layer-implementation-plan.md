# Messaging Layer Implementation Plan

## 1) Goals and scope

Deliver a production-ready messaging layer that supports:

1. Text messages (plain + formatted).
2. Rich text rendering with strict sanitization.
3. Media upload/download with resumability and integrity metadata.
4. Direct messages (1:1 baseline, group DM optional extension).

This plan defines:
- canonical message schema,
- HTTP API and WebSocket event contracts,
- client data model and synchronization behavior,
- rollout phases and acceptance criteria.

---

## 2) Architecture overview

### Components

- **Messaging API service**: REST endpoints for send/fetch/upload/download metadata.
- **Realtime gateway**: authenticated WebSocket fanout and delivery receipts.
- **Media service**: upload sessions, antivirus scanning hook, object storage bridge, signed download URLs.
- **Persistence layer**:
  - `conversations`, `participants`, `messages`, `attachments`, `receipts`, `message_revisions`.
- **Search/indexing pipeline (optional phase 2)** for full-text and attachment metadata.

### Non-functional targets

- P95 send-to-deliver latency: < 300 ms intra-region.
- Message durability: no acknowledged message loss.
- Idempotent send retries using client-generated IDs.
- Backpressure-safe WS reconnection with cursor replay.

---

## 3) Message schema

## 3.1 Canonical JSON envelope (wire + storage)

```json
{
  "messageId": "msg_01JZ...",
  "conversationId": "cnv_01JZ...",
  "senderUserId": "usr_01JZ...",
  "clientMessageId": "ios-1736203812-7f2a",
  "type": "text",
  "createdAt": "2026-04-09T12:34:56.789Z",
  "editedAt": null,
  "deletedAt": null,
  "version": 1,
  "body": {
    "text": "hello world",
    "richText": {
      "format": "html",
      "html": "<p>hello <strong>world</strong></p>",
      "mentions": ["usr_01JZ..."]
    }
  },
  "attachments": [],
  "replyToMessageId": null,
  "threadRootMessageId": null,
  "delivery": {
    "serverAckAt": "2026-04-09T12:34:56.820Z",
    "status": "sent"
  },
  "integrity": {
    "hash": "sha256:...",
    "schemaVersion": "2026-04-09"
  }
}
```

## 3.2 Message type taxonomy

- `text`: plain text and optional rich text payload.
- `media`: message whose primary payload is one or more attachments.
- `system`: join/leave/name-change etc. (non-user authored or privileged authored).

## 3.3 Attachment schema

```json
{
  "attachmentId": "att_01JZ...",
  "mediaType": "image/png",
  "fileName": "diagram.png",
  "sizeBytes": 182771,
  "width": 1280,
  "height": 720,
  "durationMs": null,
  "storageKey": "media/prod/...",
  "downloadUrl": "https://...",
  "thumbnailUrl": "https://...",
  "sha256": "base64...",
  "scan": {
    "status": "clean",
    "checkedAt": "2026-04-09T12:34:55.210Z"
  }
}
```

## 3.4 Rich text model + sanitization contract

Store dual representation:
- `body.text`: normalized plain text fallback (required).
- `body.richText.html`: optional rendered source (sanitized on write and read).

Allowlist tags (phase 1):
- `p`, `br`, `strong`, `em`, `u`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `a`, `span`.

Allowlist attrs:
- global: none except `data-mention-id` on `span`.
- `a`: `href`, `rel`, `target`.

Sanitization rules:
- Remove scripts, inline event handlers, unsafe URLs (`javascript:`), style attributes.
- Force outbound links: `rel="noopener noreferrer nofollow"`, `target="_blank"`.
- Normalize nested blocks to canonical structure to prevent rendering drift.
- Max rich text size: 16 KB post-sanitize; else degrade to plain text.

---

## 4) API contract (HTTP)

Base: `/api/v1`

## 4.1 Conversations

- `POST /conversations/direct`
  - body: `{ "participantUserId": "usr_..." }`
  - returns existing DM if already present; otherwise creates one.

- `GET /conversations/:conversationId`
- `GET /conversations?cursor=...&limit=50`

## 4.2 Messages

- `GET /conversations/:conversationId/messages?cursor=...&limit=50`
  - stable ordering: `createdAt DESC` (or ASC for replay endpoint).

- `POST /conversations/:conversationId/messages`
  - body includes `clientMessageId` for idempotency.
  - returns canonical message envelope + server delivery metadata.

- `PATCH /messages/:messageId`
  - edit text/rich text under author + policy constraints.

- `DELETE /messages/:messageId`
  - soft delete (tombstone).

- `POST /messages/:messageId/receipts`
  - `{ "type": "delivered" | "read" }`

## 4.3 Media

- `POST /media/uploads`
  - initiate upload session, returns pre-signed part URLs or resumable token.

- `PUT /media/uploads/:uploadId/parts/:partNumber`
  - chunk upload (if multipart).

- `POST /media/uploads/:uploadId/complete`
  - commits object and triggers scan.

- `GET /media/:attachmentId/download`
  - short-lived signed URL.

- `GET /media/:attachmentId/thumbnail`

## 4.4 Error model

```json
{
  "error": {
    "code": "MESSAGE_TOO_LARGE",
    "message": "Message exceeds 16KB limit",
    "retryable": false,
    "requestId": "req_01JZ..."
  }
}
```

---

## 5) WebSocket events

Endpoint: `wss://.../realtime?token=...`

Client includes:
- auth token,
- last seen event cursor,
- subscribed conversation IDs (or wildcard + server-side ACL filtering).

## 5.1 Server -> client

- `conversation.message.created`
- `conversation.message.updated`
- `conversation.message.deleted`
- `conversation.message.receipt`
- `conversation.typing.started`
- `conversation.typing.stopped`
- `conversation.participant.joined`
- `conversation.participant.left`
- `media.attachment.scan_updated`

Common envelope:

```json
{
  "eventId": "evt_01JZ...",
  "cursor": "1744201020123-0042",
  "type": "conversation.message.created",
  "conversationId": "cnv_...",
  "occurredAt": "2026-04-09T12:37:00.123Z",
  "payload": { "message": { } }
}
```

## 5.2 Client -> server

- `subscribe.conversations`
- `unsubscribe.conversations`
- `conversation.typing.started`
- `conversation.typing.stopped`
- `ack.events` (cursor ack for replay window compaction)

## 5.3 Delivery semantics

- At-least-once event delivery.
- Deduplicate by `eventId` on client.
- Replay on reconnect from `lastAckedCursor`.
- Server compaction window: retain replayable events for 7 days.

---

## 6) Direct message model

## 6.1 Conversation schema

```json
{
  "conversationId": "cnv_01JZ...",
  "kind": "direct",
  "participantUserIds": ["usr_a", "usr_b"],
  "createdBy": "usr_a",
  "createdAt": "2026-04-09T12:00:00.000Z",
  "lastMessageId": "msg_...",
  "lastMessageAt": "2026-04-09T12:45:00.000Z",
  "unreadCount": 3,
  "isBlocked": false
}
```

Rules:
- Exactly two active participants in phase 1.
- Unique key on ordered pair of participant IDs to prevent duplicate DMs.
- Privacy-preserving discovery: DM creation should not leak existence beyond authorization boundaries.

## 6.2 Authorization

- Member-only message read/write.
- Block list enforcement both directions.
- Optional org/tenant boundary checks.

---

## 7) Client data model

Normalize into stores:

- `conversationsById`
- `messagesById`
- `messageIdsByConversation`
- `attachmentsById`
- `receiptsByMessageId`
- `pendingOutgoingByClientMessageId`
- `eventCursorState`

## 7.1 Client message lifecycle

1. User sends message -> create optimistic message (`status: sending`).
2. HTTP `POST /messages` returns canonical server message -> reconcile using `clientMessageId`.
3. WS `message.created` may arrive before/after HTTP response -> dedupe by `messageId` and `clientMessageId`.
4. Receipt events update per-recipient states.
5. Failed sends remain retryable with same `clientMessageId`.

## 7.2 Sync and pagination

- Initial load: fetch conversation page + latest message page.
- Backscroll: cursor-based pagination keyed by `createdAt,messageId` tuple.
- Gap repair: if cursor mismatch or reconnect gap > replay window, force HTTP resync.

## 7.3 Rich text rendering on client

- Render sanitized server HTML only.
- Never render unsanitized compose buffer in message timeline.
- Link handling through safe URL opener.
- Mentions mapped from `data-mention-id` to local user cache.

---

## 8) Database sketch (logical)

- `conversations(id, kind, created_by, created_at, last_message_id, last_message_at)`
- `conversation_participants(conversation_id, user_id, role, joined_at, left_at, last_read_message_id)`
- `messages(id, conversation_id, sender_user_id, client_message_id, type, text_body, rich_html, created_at, edited_at, deleted_at, reply_to_message_id)`
- `message_attachments(message_id, attachment_id, sort_order)`
- `attachments(id, media_type, size_bytes, storage_key, sha256, scan_status, metadata_json)`
- `message_receipts(message_id, user_id, receipt_type, created_at)`
- `realtime_events(event_id, cursor, conversation_id, type, payload_json, occurred_at)`

Indexes:
- `messages(conversation_id, created_at DESC, id DESC)`
- unique `messages(conversation_id, sender_user_id, client_message_id)`
- unique direct conversation pair index.

---

## 9) Security and abuse controls

- Input validation + strict schema checks at API edge.
- HTML sanitization both ingress and egress defense-in-depth.
- Media malware scan state gates download (configurable: block or warn).
- Content size caps:
  - message text: 16 KB,
  - attachment upload: configurable defaults (e.g., 50 MB phase 1).
- Rate limits by user/IP/device for send and upload initiation.
- Audit logs for moderation/admin actions.

---

## 10) Rollout plan

## Phase 0: Foundations (1 sprint)
- DB schema + migrations.
- Conversation/message CRUD (text only).
- Basic WS `message.created` + reconnect cursor.

## Phase 1: Rich text + DMs (1 sprint)
- Sanitization pipeline.
- DM creation uniqueness + block checks.
- Message edits/deletes + read receipts.

## Phase 2: Media (1–2 sprints)
- Multipart uploads, scan pipeline, thumbnails.
- Attachment rendering in timeline.
- Download signed URLs and cache controls.

## Phase 3: Hardening (1 sprint)
- Replay resilience tests, load tests, abuse throttling.
- Observability dashboards and SLO alerts.
- Backfill migration tools if replacing legacy chat storage.

---

## 11) Testing strategy

- **Unit**
  - sanitization allow/deny cases,
  - idempotent send reconciliation,
  - DM uniqueness constraints.
- **Integration**
  - HTTP + WS ordering races,
  - reconnect replay correctness,
  - upload complete -> scan update -> timeline render.
- **E2E**
  - two-user DM flow,
  - rich text compose/render roundtrip,
  - media share + thumbnail + download.
- **Load/chaos**
  - burst fanout in high-traffic conversations,
  - WS disconnect storms and replay recovery.

---

## 12) Acceptance criteria

- Text messaging succeeds with optimistic UI and exactly-once user-visible reconciliation.
- Rich text is rendered correctly without XSS vectors in audited test corpus.
- Media upload/download path works with integrity metadata and scan state transitions.
- DM creation is deterministic (no duplicates) and permission-safe.
- API + WS contracts versioned, documented, and consumable by web/mobile clients.
