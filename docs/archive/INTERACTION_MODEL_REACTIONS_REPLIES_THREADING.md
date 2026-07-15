> **Archived: design-spec snapshot (2026-06).** May not reflect the current implementation of
> reactions/replies/threading in `apps/blackout-client/src/app/features/room/`.

# Interaction Model: Reactions, Replies, and Threading

## 1) Event Schema

Design goals:
- Support optimistic UI and offline replay.
- Guarantee deterministic merge order across devices.
- Keep payloads append-only; avoid in-place mutation except derived views.
- Allow per-message and per-thread projection without expensive scans.

### 1.1 Envelope (common to all events)

```json
{
  "event_id": "uuid-v7",
  "idempotency_key": "client-generated-uuid",
  "event_type": "reaction.add",
  "tenant_id": "org_123",
  "conversation_id": "conv_456",
  "thread_id": "thr_root_msg_789",
  "actor_id": "user_42",
  "client_instance_id": "device_abc",
  "client_seq": 1842,
  "created_at_client": "2026-04-09T15:22:31.210Z",
  "created_at_server": "2026-04-09T15:22:31.891Z",
  "lamport": 987654,
  "schema_version": 1,
  "payload": {}
}
```

Field semantics:
- `event_id`: globally unique immutable primary key.
- `idempotency_key`: dedupe retries from same client operation.
- `thread_id`: canonical thread root reference. For non-threaded channels, equal to `conversation_id` or null.
- `client_seq`: strictly increasing per `client_instance_id`; detects gaps/replays.
- `lamport`: assigned by server ingestion pipeline to establish deterministic causal ordering.

### 1.2 Message events

#### `message.create`
```json
{
  "event_type": "message.create",
  "payload": {
    "message_id": "msg_789",
    "parent_message_id": null,
    "body": {
      "text": "Ship it",
      "mentions": ["user_77"],
      "attachments": []
    },
    "reply_to": null,
    "visibility": "participants",
    "edit_count": 0
  }
}
```

#### `message.edit`
```json
{
  "event_type": "message.edit",
  "payload": {
    "message_id": "msg_789",
    "prev_revision": 2,
    "new_revision": 3,
    "body": { "text": "Ship it today" },
    "reason": "user_edit"
  }
}
```

#### `message.delete`
```json
{
  "event_type": "message.delete",
  "payload": {
    "message_id": "msg_789",
    "tombstone": true,
    "reason": "user_delete"
  }
}
```

### 1.3 Reply + thread lifecycle events

#### `thread.open`
```json
{
  "event_type": "thread.open",
  "payload": {
    "thread_id": "thr_root_msg_789",
    "root_message_id": "msg_789",
    "policy": {
      "auto_follow": "mentions_only",
      "default_sort": "oldest_first"
    }
  }
}
```

#### `reply.create`
```json
{
  "event_type": "reply.create",
  "payload": {
    "message_id": "msg_790",
    "parent_message_id": "msg_789",
    "root_message_id": "msg_789",
    "thread_depth": 1,
    "body": { "text": "Agree" }
  }
}
```

#### `thread.state`
```json
{
  "event_type": "thread.state",
  "payload": {
    "thread_id": "thr_root_msg_789",
    "status": "active",
    "reply_count": 1234,
    "last_reply_at": "2026-04-09T15:27:00.000Z",
    "participant_count": 64
  }
}
```

### 1.4 Reaction events (set semantics)

#### `reaction.add`
```json
{
  "event_type": "reaction.add",
  "payload": {
    "message_id": "msg_789",
    "emoji": "👍",
    "skin_tone": null,
    "reaction_key": "👍::default"
  }
}
```

#### `reaction.remove`
```json
{
  "event_type": "reaction.remove",
  "payload": {
    "message_id": "msg_789",
    "emoji": "👍",
    "skin_tone": null,
    "reaction_key": "👍::default"
  }
}
```

Projection rule: membership key is `(message_id, actor_id, reaction_key)`. Presence means reacted; absence means not reacted.

### 1.5 Read/seen and notification events

#### `thread.read_cursor`
```json
{
  "event_type": "thread.read_cursor",
  "payload": {
    "thread_id": "thr_root_msg_789",
    "last_read_message_id": "msg_812",
    "last_read_lamport": 991001
  }
}
```

#### `thread.subscription`
```json
{
  "event_type": "thread.subscription",
  "payload": {
    "thread_id": "thr_root_msg_789",
    "action": "follow",
    "mode": "all_activity"
  }
}
```

### 1.6 Derived read model entities

- `MessageView(message_id, root_message_id, parent_message_id, revision, is_deleted, created_at_server, lamport)`
- `ReactionAggregate(message_id, reaction_key, count, reactors_sample[])`
- `ThreadSummary(thread_id, root_message_id, reply_count, participant_count, last_reply_at, unread_count)`
- `ThreadCursor(user_id, thread_id, last_read_lamport, unread_mentions)`

---

## 2) Conflict Resolution Rules

### 2.1 Global ordering and idempotency

1. Deduplicate by `event_id` and `idempotency_key` (scoped to actor).
2. Apply events in ascending `(lamport, created_at_server, event_id)`.
3. If client sends future `client_seq` with gaps, buffer briefly; if gap unresolved, still apply by lamport and mark telemetry.

### 2.2 Message edit/delete conflicts

- **Edit vs edit:** Last-writer-wins by ordering tuple `(lamport, event_id)` on `new_revision`.
- **Edit vs delete:** Delete dominates visibility; keep latest non-deleted body in audit store only.
- **Delete vs reaction/reply:**
  - Existing reactions preserved for compliance/audit but hidden in UI.
  - Replies remain visible unless policy is `cascade_delete=true`; then soft-delete descendants with provenance.

### 2.3 Reaction conflicts

Treat reactions as an OR-Set per `(message_id, actor_id, reaction_key)`.

- `add` then duplicate `add` => no-op.
- `remove` without prior `add` => no-op.
- Concurrent `add`/`remove` from same actor/device race:
  - Resolve by ordering tuple `(lamport, event_id)`.
  - Later op wins membership.
- Multi-device same actor conflict:
  - `client_seq` is per device, so server order decides final state.

### 2.4 Reply/thread conflicts

- Reply targeting missing parent:
  - If parent exists in retention but not replicated yet, hold in short-lived pending queue.
  - After timeout, attach to root with `orphaned_parent_id` metadata.
- Thread reopen/close races:
  - Last `thread.state` wins for mutable flags (`status`, `lock_state`), except hard lock by moderator role which dominates user actions.

### 2.5 Permission and moderation precedence

- Permission-denied events are rejected at write time and produce `event.reject` audit rows.
- Moderation actions (`message.redact`, `thread.lock`) override normal user events regardless of lamport if action is marked `enforcement=true`.

### 2.6 Determinism requirements

Every projection must be replay-safe:
- No dependence on wall-clock at projection time.
- No random tie-breakers.
- Tie break only with stable keys (`event_id`).

---

## 3) UI Behavior Spec

### 3.1 Core interaction patterns

#### Reactions
- Hover/tap message → quick reaction bar (top 6 recent/frequent emoji + add picker).
- Tap existing reaction chip:
  - If user already reacted with that key, remove reaction.
  - Else add reaction.
- Show count and compact reactor tooltip (up to 20 names, then “and N others”).
- Optimistic update within 50 ms; rollback on server reject with subtle toast.

#### Replies and threading
- Primary timeline shows root messages.
- Each root with replies shows inline summary: `X replies • last reply time • unread badge`.
- Clicking summary opens thread pane (desktop side panel; mobile full-screen route).
- Thread pane header: root message snapshot + follow/unfollow + participant avatars + unread divider.

#### Nested depth
- Allow logical depth >1 in data, but default UI flattens to root + chronological replies for readability.
- Optional “reply to reply” affordance displays quoted parent snippet rather than deep indentation.

### 3.2 Real-time updates

- New reply in open thread inserts at correct sorted position; if user is scrolled up, show “N new replies” jump pill.
- Reaction changes animate count transition and chip reorder without layout shift.
- Edits show `(edited)` marker; hovering reveals edit timestamp.
- Deleted message shows tombstone placeholder: “Message removed”.

### 3.3 Unread, mentions, and notifications

- Per-thread unread counter increments for replies with lamport > `last_read_lamport`.
- Mention in thread escalates notification even when thread not followed.
- Mark-as-read when thread viewport has last message visible for ≥800 ms.

### 3.4 Accessibility and input behavior

- Full keyboard model:
  - `r` = reply,
  - `+` = open reaction picker,
  - `[`/`]` = previous/next thread with unread.
- Screen reader labels for reaction chips include state, e.g., “Thumbs up, 12 reactions, selected”.
- Minimum touch target 44x44 px for reaction and reply affordances.

### 3.5 Failure states

- Pending sends display clock icon.
- Retriable failure shows “Retry” action inline.
- Hard failure (permission/moderation) shows non-retriable reason and removes optimistic artifact.

---

## 4) Pagination Strategy for Large Threads

### 4.1 API contract (cursor-based, bi-directional)

`GET /conversations/{conversation_id}/threads/{thread_id}/messages?limit=50&after=cursorA&before=cursorB&sort=asc`

Response:
```json
{
  "items": [],
  "page_info": {
    "next_cursor": "opaque",
    "prev_cursor": "opaque",
    "has_next": true,
    "has_prev": true,
    "anchor": {
      "message_id": "msg_999",
      "lamport": 100100
    }
  },
  "thread_summary": {
    "reply_count": 185432,
    "unread_count": 143,
    "last_read_message_id": "msg_900"
  }
}
```

Cursor payload (opaque but conceptually): `(thread_id, lamport, message_id, direction, snapshot_token)`.

### 4.2 Loading modes

1. **Initial open**
   - If unread exists: load around unread anchor (e.g., 20 before, 30 after).
   - Else load most recent page.
2. **Scroll up**: fetch older with `before` cursor.
3. **Scroll down / jump to latest**: fetch newer with `after` cursor.
4. **Jump to message ID** (search/deeplink): resolve ID to anchor cursor, then hydrate neighborhood.

### 4.3 Consistency under live writes

- Use `snapshot_token` from first page to keep stable pagination window while user scrolls history.
- Live new replies stream separately above/below current viewport, not merged into historical pages until refresh or boundary crossing.
- On snapshot expiration, show “Refresh thread” CTA and preserve user anchor on reload.

### 4.4 Virtualization and memory

- Virtualized list with variable row heights.
- Keep max ~300 rendered rows and ~2,000 cached models per open thread.
- Evict distant pages LRU; preserve anchor indices to avoid scroll jump.

### 4.5 Performance targets

- P50 page fetch < 150 ms, P95 < 400 ms (excluding network RTT).
- Initial thread open time-to-first-contentful-row < 300 ms from cache, < 800 ms cold.
- Reaction toggle ack round-trip budget < 250 ms.

### 4.6 Edge-case handling at scale

- Threads >100k replies: enforce cursor-only API (no offset).
- If deleted messages dominate page, server may over-fetch to return `limit` visible rows.
- For legal hold/compliance hidden content, counts may include hidden rows only in privileged views; user view must expose consistent visible counts.
