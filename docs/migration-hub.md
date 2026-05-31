# Discord Migration Hub

The Migration Hub lowers the biggest barrier to Blackout adoption: it lets a
Discord community owner connect their account, import their server structure,
run a live bridge, and watch adoption — without asking members to leave Discord
on day one.

Much of the surface reuses primitives that already shipped; this doc ties them
together and documents the net-new pieces.

## 1. Connect accounts (existing)

Discord identity import is the existing linked-accounts / OAuth flow:

- Begin: `POST /v1/linked-accounts/discord/connect`
- Complete: `POST /v1/linked-accounts/discord/callback`

Tokens are encrypted at rest (`linked_accounts`). For **server import** the link
must include the `guilds` scope (set `DISCORD_OAUTH_SCOPES`); the default
`identify,email` is enough only for identity.

## 2. Import community (Phase 1)

`POST /v1/integrations/discord/import/imports` captures a guild snapshot and
`POST /.../imports/:id/apply` materializes it, idempotently:

| Discord | → | Blackout |
|---|---|---|
| guild | → | Matrix **space** (Coalition root) |
| text / forum / announcement channel | → | **den** (Matrix room) |
| role | → | **role-intent** (Matrix power level from the permission bitfield) |

Endpoints (`packages/api/src/routes/discordServerImport.ts`):

- `GET  /v1/integrations/discord/import/guilds` — importable guilds (owner / admin / manage-guild)
- `POST /v1/integrations/discord/import/imports` — `{ guildId }` → snapshot + pending job
- `GET  /v1/integrations/discord/import/imports/:id` — job + object→target mappings
- `POST /v1/integrations/discord/import/imports/:id/apply` — create space/dens/role intents

**Limits (honest about Discord's API + ToS).** The user's OAuth token can only
list guilds. Reading channels/roles requires a **bot token in the guild**
(`MIGRATION_DISCORD_BOT_TOKEN`); without it an import runs in `degraded`
*preview* mode (`reason: "no_bot_token"`). We never read private DMs, never bulk
export member lists, and never copy history — server-owner consent (a bot in the
guild) gates everything beyond the guild list.

## 3. Activate bridge (Phase 2)

Per ADR-0003, two-way chat relay is delegated to the **mautrix-discord**
appservice (`deploy/docker/blackout-backend/integrations/mautrix-discord/`).
The Hub adds a product-level toggle over its provisioning API:

- `GET    /v1/integrations/discord/bridges`
- `POST   /v1/integrations/discord/bridges` — `{ matrixRoomId, discordGuildId, discordChannelId, mode }`
- `PATCH  /v1/integrations/discord/bridges/:id` — `{ mode }`
- `DELETE /v1/integrations/discord/bridges/:id`

Modes: `two-way` (full relay), `read-only` (Discord→Matrix), `one-way`
(Matrix→Discord). One-way / read-only lean on the existing `m.blackout.origin`
loop-prevention in `services/outboundMessageRouter.ts`.

Required env (from the bridge runbook): `MAUTRIX_DISCORD_PROVISIONING_URL`,
`MAUTRIX_DISCORD_PROVISIONING_SHARED_SECRET` (path override:
`MAUTRIX_DISCORD_PROVISIONING_PATH`). When unset, activation reports
`bridge_unavailable` instead of silently no-oping.

## 4. Monitor adoption (Phase 3)

`GET /v1/integrations/discord/migration/dashboard?guildId=<id>` returns a
read-only snapshot. Each metric carries a `source`:

- `discordMembers` — guild approximate member count (`discord_guild`)
- `importedDens` — dens created by the server import (`server_import`)
- `bridgedChannels` — active bridge activations for the guild (`bridge_activations`)
- `blackoutAccounts`, `marketplaceParticipants` — platform totals (`platform_total`)
- `activeBridgedUsers` — not yet tracked → `null` / `unavailable` (never fabricated)

## 5. Creator multi-distribution (existing)

"Post once → fan out" is already served by **outbound event webhooks**
(`services/outboundEventWebhooks.ts`). A creator registers any Discord-shape
webhook URL (Discord itself, Zapier, IFTTT, a custom backend) and Blackout POSTs
events (`tip.created`, `livestream.started`, `chat.message.received`, …) to it in
Discord embed shape, HMAC-signed (`x-blackout-signature`). This is how a
Blackout post reaches Discord and other connected platforms as the community
shifts its center of gravity to Blackout.

Inbound, the **Discord-compatible incoming webhooks**
(`services/discordCompatWebhooks.ts`) let any existing Discord-webhook tool post
into a den by swapping the URL; embed `color` and `timestamp` are rendered onto
the Matrix message metadata row.
