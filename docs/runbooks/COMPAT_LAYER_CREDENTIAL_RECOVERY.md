# Compat-Layer Credential Recovery Runbook

Foundation milestone deliverable per
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md).

This runbook covers credential recovery for the five compatibility-layer
surfaces inventoried in
[`AGGRESSIVE_OPERATIONS_GUIDE.md` Appendix C](../AGGRESSIVE_OPERATIONS_GUIDE.md):
linked-account OAuth tokens, simulcast destinations, OBS-WebSocket passwords,
Discord-shape webhook secrets, and widget secrets. Each section describes
detection (how we notice the credential is lost or compromised), recovery
steps, user-visible impact, and a comms template.

The compat-layer credentials are encrypted at rest in the Blackout database
using AES-GCM. The encryption *key* lives in the secrets manager (see
[`SECRETS_MANAGER_MIGRATION.md`](SECRETS_MANAGER_MIGRATION.md)); the
encrypted payloads live in Postgres. "Credential recovery" therefore means
one of three things, depending on the failure mode:

1. The user-side credential at the upstream provider has been rotated and
   our copy is stale — we re-prompt the user to reconnect.
2. The encryption key has been lost — we cannot decrypt the payloads, the
   data is effectively gone, and every affected user must reconnect.
3. Both the data and the key are intact, but a specific OAuth token has
   expired — we use the refresh-token path or re-prompt the user.

Recovery steps below distinguish these cases.

---

## 1) Linked accounts (Twitch / YouTube / Kick / Patreon / Streamlabs)

**Backing code**: `packages/api/src/services/linkedAccounts.ts`,
`packages/api/src/services/oauthProviders.ts`.

### Detection

- Token-refresh failures spike on `services/oauthProviders.ts` for one
  provider — usually means the upstream provider rotated client-secret or
  the user revoked the connection.
- AES-GCM decrypt errors when reading from the linked-accounts table —
  means the encryption key has rotated without re-encrypting the payloads,
  or the key is gone.
- A user reports "my Twitch chat stopped showing up in Blackout."

### Recovery

#### Case A: upstream-provider rotation or user revocation

- [ ] Confirm via the provider's dashboard that the client/app credential
      is current. If the OAuth client itself was rotated, update the client
      secret in the secrets manager (see
      [`SECRETS_MANAGER_MIGRATION.md`](SECRETS_MANAGER_MIGRATION.md)) and
      restart the API.
- [ ] For affected users, surface the "reconnect this account" CTA in the
      Settings → Connections panel. The reconnect is the recovery; we never
      attempt to recreate user-side OAuth tokens server-side.
- [ ] Mark the linked-account row as `status = needs_reconnect` so the UI
      can surface it.

#### Case B: encryption key lost or rotated without re-encrypt

- [ ] If a current key copy exists in the manager but the in-memory key on
      the API is stale, restart the API to reload from the manager.
- [ ] If the key is genuinely lost, the encrypted payloads are unreadable.
      Mark all linked-account rows `status = needs_reconnect`. Do not
      attempt to brute-force or recover.
- [ ] Generate a new AES-GCM key, store it in the manager, deploy the API
      with the new key.
- [ ] Communicate per the comms template below.

#### Case C: token expired (normal-path recovery)

This is not really "recovery" but is included for completeness so the
runbook is the single reference. The refresh-token path in
`services/oauthProviders.ts` handles this automatically; if it fails, treat
it as Case A.

### User-visible impact

- A: only affected user sees "reconnect" prompt; their inbound chat / events
  pause until reconnect.
- B: all linked accounts pause until reconnect; potentially every user.
- C: brief gap; auto-resumes.

### Comms template (Case B only)

> A maintenance event has invalidated stored linked-account credentials. To
> restore your Twitch / YouTube / Kick / Patreon / Streamlabs connection,
> open Blackout → Settings → Connections and re-link the affected
> account. No data has been lost; only the saved authentication needs to
> be re-established.

---

## 2) Simulcast destinations

**Backing code**: `packages/api/src/services/simulcastDestinations.ts`,
migration `packages/api/src/db/migrations/014_simulcast_destinations.up.sql`.
Stream keys are AES-GCM at rest.

### Detection

- RTMP fan-out failures
  (`packages/api/src/services/rtmpFanoutWorker.ts`) for a specific
  destination — usually the user rotated their stream key upstream.
- AES-GCM decrypt errors on simulcast rows — same key issue as linked
  accounts.

### Recovery

- **User rotated stream key upstream**: re-prompt the user to enter the
  new key. The user must do this themselves; we never store stream keys
  outside our own AES-GCM-encrypted column.
- **Key lost**: same procedure as linked-accounts Case B. Generate a new
  AES-GCM key (this is the *same* key as for linked accounts and other
  compat-layer at-rest data, unless segregated by design — confirm before
  rotating). Mark every simulcast destination as needing the user to
  re-enter the stream key.

### User-visible impact

- Single-user: their simulcast fan-out for the affected destination stops
  until they re-enter.
- Key-loss: every user's simulcast destinations require re-entry.

### Comms template

> Stored simulcast destination credentials need to be re-entered. Open
> Blackout → Settings → Simulcast and re-enter the stream key for each
> destination. The destinations themselves (RTMP URLs, names) have been
> retained.

---

## 3) OBS-WebSocket passwords

**Backing code**: `packages/api/src/integrations/obs-ws-compat/server.ts`.
The OBS-WS password is AES-GCM at rest in the Blackout DB so that the
compat server can verify connections from OBS, Stream Deck, and Companion.

### Detection

- OBS-WS clients fail to authenticate against the compat server even though
  the password is correct on the user's side.
- AES-GCM decrypt errors in the OBS-WS server's auth path.

### Recovery

- **User rotated their password in Blackout**: no recovery needed; this is
  the normal flow. Note in case the rotation step itself leaves stale
  cached values in any controller process — restart the OBS-WS server.
- **Key lost**: the password column is unreadable. The user must set a new
  OBS-WS password in Blackout settings; their OBS / Companion / Stream Deck
  configurations must then be updated to the new password. There is no
  way to recover the prior password.

### User-visible impact

- OBS-WS clients (OBS, Stream Deck, Companion, Touch Portal) cannot
  connect until the password is reset.

### Comms template

> The Blackout OBS-WebSocket password needs to be reset. Open Blackout →
> Settings → OBS-WebSocket and set a new password, then update the same
> password in OBS, Stream Deck, Companion, or Touch Portal as applicable.

---

## 4) Discord-shape webhook secrets

**Backing code**: `packages/api/src/services/discordCompatWebhooks.ts` (inbound,
migration `016_discord_compat_webhooks.up.sql`),
`packages/api/src/services/outboundEventWebhooks.ts` (outbound,
migration `017_outbound_event_webhooks.up.sql`).

### Detection

- Inbound: senders see HTTP 401 / 403 when posting to a Discord-shape
  webhook URL that previously worked.
- Outbound: receivers report missing or signature-mismatched events from
  Blackout.
- AES-GCM decrypt errors on either webhooks table.

### Recovery

#### Inbound (Blackout receives Discord-shape webhooks)

- [ ] Confirm the webhook URL still maps to a valid row.
- [ ] If the row's secret is unreadable (key issue), regenerate the webhook
      URL for the affected room/channel. The sender must update their
      configuration with the new URL; there is no way to preserve the
      prior URL across a key loss.

#### Outbound (Blackout sends Discord-shape webhooks)

- [ ] Confirm the destination URL is still valid.
- [ ] If the signing secret is unreadable, regenerate it in the affected
      row. Receivers that verify signatures will need the new secret;
      coordinate with each receiver.

### User-visible impact

- Inbound: a chat-side integration silently stops posting until the URL
  is updated.
- Outbound: a downstream automation (a bot, a logger) silently stops
  receiving events until the secret is updated.

### Comms template

> A Discord-shape webhook on Blackout has been re-issued. The new URL or
> signing secret is available in Blackout → Settings → Webhooks; update
> the corresponding configuration on the sending or receiving side.

---

## 5) Widget secrets

**Backing code**: `packages/api/src/routes/widgetAlerts.ts`,
`packages/api/src/services/widgetBus.ts`,
`packages/api/src/integrations/se-overlay-compat/server.ts`.

The widget tokens are SSE bearer tokens that overlay endpoints (Streamlabs-
and StreamElements-shaped) authenticate with.

### Detection

- Overlay endpoints in OBS show "disconnected" when the user's widget URL
  is the only thing that changed.
- 401 spikes on `routes/widgetAlerts.ts` from a known IP that previously
  succeeded.

### Recovery

- [ ] Issue a new widget token for the affected user.
- [ ] User updates their overlay browser source URL with the new token.
- [ ] Old token is revoked once the user has confirmed the new one works.

### User-visible impact

- Overlay alerts stop until the user updates the URL in their broadcasting
  software.

### Comms template

> Your Blackout widget URL has been re-issued. Open Blackout → Settings →
> Widgets, copy the new URL, and replace the corresponding browser-source
> URL in OBS or your overlay tool. Existing layouts and styles are
> preserved; only the URL changes.

---

## Detection signals to instrument

Across all five surfaces, the high-signal failure indicators are:

- AES-GCM decrypt error rate on any of the at-rest-encrypted tables.
- 401 / 403 rate on inbound webhook routes.
- Token-refresh failure rate per OAuth provider.
- A widget-token revocation event without a corresponding new-token issuance
  within five minutes.

These should be panels on the integrations health dashboard
(`packages/api/src/services/integrationsHealth.ts`).

---

## Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — runbook list
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` Appendix C](../AGGRESSIVE_OPERATIONS_GUIDE.md) — compat-layer inventory
- [`SECRETS_MANAGER_MIGRATION.md`](SECRETS_MANAGER_MIGRATION.md) — manages the AES-GCM key
- [`../operations/secrets_rotation_break_glass.md`](../operations/secrets_rotation_break_glass.md) — rotation policy
- [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) — SPOF context
