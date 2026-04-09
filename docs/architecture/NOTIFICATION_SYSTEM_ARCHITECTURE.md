# Notification System Architecture Proposal

## Scope
Design a notification system for messaging with:
- push, in-app, and email delivery options
- mute logic
- per-room preferences
- unread counters
- rate limiting

## 1) Architecture overview

### Core components
1. **Event producer**: message and membership services emit events (`message.created`, `mention.created`, `room.membership_changed`, `message.read`).
2. **Notification policy engine**: computes if/where to notify each recipient.
3. **Preference service**: resolves user global settings + per-room overrides + temporary mutes.
4. **Unread service**: authoritative unread counters and mention counters.
5. **Delivery workers**:
   - Push worker (APNs/FCM/WebPush)
   - In-app worker (websocket badge + activity feed)
   - Email worker (digest/immediate)
6. **Rate-limit & dedupe layer**: suppresses floods and duplicate fanout.
7. **Audit/metrics pipeline**: delivery, bounce, failure, suppression visibility.

### Data flow
- New event arrives -> policy engine expands recipients -> preference resolver evaluates eligibility -> unread service updates counters -> eligible channels queued -> rate limiter/dedupe gate -> channel workers deliver -> outcomes logged.

## 2) Delivery channel model (push / in-app / email)

### Channel capability matrix
- **In-app**: default real-time for active sessions; low latency; supports rich context.
- **Push**: for inactive mobile/web devices; payload minimized for privacy.
- **Email**: for async awareness; immediate for high-priority or digest for normal activity.

### Channel selection rules
For each user and event:
1. Determine user presence (`online`, `idle`, `offline`) and active device/room focus.
2. Apply preferences (global + per-room + event type).
3. Apply mute/snooze and quiet hours.
4. Route by priority:
   - Mention/DM/high-priority room: in-app + push (if not actively viewing room), optional immediate email.
   - Normal room chatter: in-app only if active; else push or digest email based on user setting.

### Delivery guarantees
- At-least-once queue semantics with idempotent delivery keys: `{event_id, user_id, channel}`.
- Retry with exponential backoff and dead-letter queues.
- Provider feedback loops update token validity and email suppression lists.

## 3) Mute logic

### Mute levels
- **Global mute**: disable a channel entirely (e.g., no email).
- **Room mute**: mute all notifications for a specific room.
- **Thread mute** (optional phase 2): mute conversation subtree.
- **Temporary snooze**: mute until timestamp.
- **Keyword/mention exceptions**: allow @mentions or selected keywords through muted rooms.

### Priority and conflict resolution
Recommended precedence (highest first):
1. Safety/legal forced alerts
2. User block lists (never notify)
3. Room/thread mute
4. Quiet hours
5. Global channel disable
6. Mention/keyword exception override (only if configured)

### Example policy
- Room muted + mention exception enabled + event is direct mention => allow in-app/push, suppress email.
- Room muted + non-mention event => suppress all channels, still update unread if configured.

## 4) Per-room preferences

### Preference schema
Store per `(user_id, room_id)`:
- `notify_level`: `all | mentions_only | none`
- `push_enabled`: boolean
- `email_mode`: `off | immediate | digest`
- `mute_until`: timestamp nullable
- `keyword_overrides`: string[]
- `inherit_global`: boolean

### Effective preference resolution
`effective = room_override ?? global_default`, then apply runtime state:
- quiet hours
- device availability
- rate-limit state
- compliance override (if enterprise policy requires minimum alerting)

### Caching and invalidation
- Cache effective preferences in Redis keyed by `(user_id, room_id)`.
- Invalidate on user settings update, membership changes, or room role changes.

## 5) Unread counters

### Counter definitions
Maintain per user:
- `unread_total`
- `unread_by_room[room_id]`
- `mention_unread_by_room[room_id]`
- `dm_unread_total`

### Update rules
- On `message.created`: increment unread for recipients not currently focused at that event offset.
- On `message.read` / read receipt: decrement to `max(0, current - consumed)` using monotonic read markers.
- On membership removal: zero out room counters.
- On message redaction/deletion: optional correction job (eventual consistency acceptable).

### Correctness strategy
- Source of truth: read markers + message stream offsets.
- Use periodic reconciliation job to repair drift (especially after outages or backfills).
- Expose both **authoritative counter** and **best-effort real-time badge** to clients.

## 6) Rate limiting and anti-spam

### Limits to enforce
- **Per user recipient limit**: e.g., max 20 push/min, 60/hour.
- **Per room burst control**: cap fanout for high-traffic rooms.
- **Per sender abuse guard**: if sender exceeds threshold, degrade notifications to digest for non-mentions.
- **Per channel provider quotas**: APNs/FCM/email throughput controls.

### Techniques
- Token bucket per key:
  - `(user_id, channel)` for recipient protection
  - `(room_id, channel)` for room storms
  - `(tenant_id, channel)` for tenancy fairness
- Coalescing window (e.g., 30-120 seconds): collapse many events into one summary notification.
- Dedupe TTL store to prevent repeated sends across retries.

### Backpressure behavior
- Prefer dropping low-priority notifications first.
- Convert immediate email to digest when throttled.
- Preserve mentions/DMs whenever possible.

## 7) Privacy and security constraints

- Minimize push payload content on locked devices (sender + room + generic text).
- Respect blocked users and hidden rooms before any channel routing.
- Encrypt notification preferences at rest where required.
- Log policy decisions without leaking message body in audit logs.

## 8) Retention and compliance interactions

- Notification events should have separate retention from message content (shorter by default).
- Unread counters are derived state; can be recomputed and should not outlive account deletion.
- Email digests must exclude messages beyond retention/legal visibility windows.
- On GDPR/CCPA deletion: remove device tokens, preference rows, pending queue items, and historical delivery traces per policy.

## 9) Rollout plan

1. **MVP**: in-app + push, global preferences, room mute, unread counters.
2. **Phase 2**: email immediate/digest, keyword exceptions, quiet hours.
3. **Phase 3**: thread-level mute, advanced coalescing, adaptive throttling by behavior.

## 10) SLOs and operational metrics

### SLO targets
- In-app notification fanout p95: < 300 ms from event ingestion.
- Push enqueue p95: < 800 ms.
- Unread counter convergence: 99.9% within 2 seconds.

### Key metrics
- Delivery success rate by channel/provider.
- Suppression reasons (mute, quiet hours, rate limit, dedupe).
- Counter drift rate and reconciliation corrections.
- Notification-to-open conversion (opt-in analytics only).
