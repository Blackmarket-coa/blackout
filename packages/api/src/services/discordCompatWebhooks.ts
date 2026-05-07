import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../db/store';
import type { DiscordCompatWebhookRecord } from '../db/types';
import { matrixClient as defaultMatrixClient } from '../integrations/matrix-client';
import type { MatrixSendEventClient } from './twitchChatBridge';
import { log } from '../telemetry/logger';

/**
 * Phase 2 / Track B: Discord-compatible incoming webhook URLs.
 *
 * Surfaces a URL shaped like Discord's
 *   POST /api/webhooks/{webhook.id}/{webhook.token}
 * (`{id}` is `record.id`, `{token}` is the plaintext shown once at create
 *  time and never persisted) so any service that already speaks "Discord
 *  webhook" — GitHub, Sentry, Stripe, Grafana, IFTTT, Zapier, ... — can
 *  post to a Blackout den by changing nothing more than the URL prefix.
 *
 * The service is read-only on the wire: we accept Discord's payload shape,
 * project it onto a Matrix `m.room.message` with `m.blackout.origin =
 * 'discord_compat_webhook'` extension fields, and forward it through the
 * Matrix client. We never call Discord. The shape compatibility is the
 * value; the upstream brand isn't.
 */

const TOKEN_BYTES = 24;
const MATRIX_ROOM_RE = /^[!#][^:\s]+:[^:\s]+$/;
const NAME_MAX = 80;
const URL_MAX = 2048;

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

const constantTimeEqualsHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
};

export interface CreateWebhookInput {
  blackoutUserId: string;
  matrixRoomId: string;
  name: string;
  avatarUrl?: string;
}

export type CreateWebhookOutcome =
  | {
      kind: 'ok';
      record: DiscordCompatWebhookRecord;
      /** Plaintext token; only ever returned at create time. */
      token: string;
    }
  | { kind: 'invalid_input'; reason: string };

const validateCreate = (
  input: CreateWebhookInput,
): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  const room = input.matrixRoomId?.trim();
  if (!room) return { ok: false, reason: 'matrixRoomId is required' };
  if (!MATRIX_ROOM_RE.test(room)) {
    return { ok: false, reason: 'matrixRoomId must look like "!opaque:server" or "#alias:server"' };
  }
  const name = input.name?.trim();
  if (!name) return { ok: false, reason: 'name is required' };
  if (name.length > NAME_MAX) {
    return { ok: false, reason: `name must be ≤ ${NAME_MAX} chars` };
  }
  if (input.avatarUrl) {
    const url = input.avatarUrl.trim();
    if (url.length > URL_MAX) {
      return { ok: false, reason: `avatarUrl must be ≤ ${URL_MAX} chars` };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, reason: 'avatarUrl must be an http(s) URL' };
    }
  }
  return { ok: true };
};

export const createWebhook = (input: CreateWebhookInput): CreateWebhookOutcome => {
  const valid = validateCreate(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = sha256Hex(token);
  const record = db.createDiscordCompatWebhook({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    matrixRoomId: input.matrixRoomId.trim(),
    name: input.name.trim(),
    avatarUrl: input.avatarUrl?.trim() || undefined,
    tokenHash,
    isActive: true,
    deliveryCount: 0,
  });
  return { kind: 'ok', record, token };
};

export const listWebhooksForUser = (userId: string): DiscordCompatWebhookRecord[] =>
  db.listDiscordCompatWebhooksForUser(userId);

export type DeleteWebhookOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const deleteWebhook = (
  blackoutUserId: string,
  webhookId: string,
): DeleteWebhookOutcome => {
  const existing = db.getDiscordCompatWebhook(webhookId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  db.deleteDiscordCompatWebhook(webhookId);
  return { kind: 'ok' };
};

// --------------- inbound delivery (the public, token-auth side) -------------

/**
 * Subset of the Discord webhook execute payload we read.
 * https://discord.com/developers/docs/resources/webhook#execute-webhook-jsonform-params
 *
 * We accept the full shape but only render `content` + `embeds[]` +
 * `username`/`avatar_url`. Components / files / TTS / allowed_mentions are
 * accepted but ignored — quietly, so senders don't error.
 */
export interface DiscordExecutePayload {
  content?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  tts?: boolean;
  embeds?: Array<{
    title?: string | null;
    description?: string | null;
    url?: string | null;
    color?: number | null;
    author?: { name?: string | null; url?: string | null; icon_url?: string | null } | null;
    fields?: Array<{ name: string; value: string; inline?: boolean }> | null;
    footer?: { text?: string | null; icon_url?: string | null } | null;
    timestamp?: string | null;
  }> | null;
  allowed_mentions?: unknown;
  components?: unknown;
}

export type DeliverOutcome =
  | { kind: 'ok'; delivered: true }
  | { kind: 'invalid_token' }
  | { kind: 'inactive' }
  | { kind: 'empty_payload' }
  | { kind: 'matrix_failed'; status?: number; reason?: string };

const renderEmbedAsText = (
  embed: NonNullable<DiscordExecutePayload['embeds']>[number],
): string => {
  const parts: string[] = [];
  if (embed.author?.name) parts.push(`— ${embed.author.name}`);
  if (embed.title) parts.push(`**${embed.title}**`);
  if (embed.url) parts.push(embed.url);
  if (embed.description) parts.push(embed.description);
  if (embed.fields?.length) {
    for (const f of embed.fields) {
      if (f?.name && f?.value) parts.push(`${f.name}: ${f.value}`);
    }
  }
  if (embed.footer?.text) parts.push(`— ${embed.footer.text}`);
  return parts.join('\n').trim();
};

/**
 * Translate a Discord-shape execute payload into a single Matrix
 * `m.room.message` body. We collapse `content` + embeds into one message
 * so the Matrix room sees one event per webhook call (Discord's UI shows
 * one bubble per webhook call too).
 */
export const renderPayloadToMatrix = (
  payload: DiscordExecutePayload,
  webhook: { name: string; avatarUrl?: string },
): Record<string, unknown> | null => {
  const lines: string[] = [];
  if (payload.content) lines.push(payload.content);
  for (const embed of payload.embeds ?? []) {
    if (!embed) continue;
    const rendered = renderEmbedAsText(embed);
    if (rendered) lines.push(rendered);
  }
  const body = lines.join('\n').trim();
  if (!body) return null;

  const senderUsername = (payload.username?.trim() || webhook.name).slice(0, 80);
  const senderAvatar = payload.avatar_url?.trim() || webhook.avatarUrl;

  return {
    msgtype: 'm.text',
    body,
    'm.blackout.origin': 'discord_compat_webhook',
    'm.blackout.origin_sender_username': senderUsername,
    ...(senderAvatar ? { 'm.blackout.origin_sender_avatar_url': senderAvatar } : {}),
  };
};

export interface DeliverOptions {
  matrixClient?: MatrixSendEventClient;
}

export const deliverWebhookPayload = async (
  webhookId: string,
  presentedToken: string,
  payload: DiscordExecutePayload,
  options: DeliverOptions = {},
): Promise<DeliverOutcome> => {
  const record = db.getDiscordCompatWebhook(webhookId);
  if (!record) return { kind: 'invalid_token' };
  // Compare hashes in constant time so a presented-token side channel
  // can't distinguish "wrong webhook id" from "wrong token".
  const presentedHash = sha256Hex(presentedToken ?? '');
  if (!constantTimeEqualsHex(presentedHash, record.tokenHash)) {
    return { kind: 'invalid_token' };
  }
  if (!record.isActive) return { kind: 'inactive' };

  const content = renderPayloadToMatrix(payload ?? {}, {
    name: record.name,
    avatarUrl: record.avatarUrl,
  });
  if (!content) return { kind: 'empty_payload' };

  const matrix = options.matrixClient ?? defaultMatrixClient;
  const result = await matrix.sendEvent(record.matrixRoomId, content);
  if (!result.ok) {
    log.warn('discord_compat_webhook_matrix_send_failed', {
      webhookId: record.id,
      roomId: record.matrixRoomId,
      status: result.status,
      reason: result.reason,
    });
    return { kind: 'matrix_failed', status: result.status, reason: result.reason };
  }

  db.updateDiscordCompatWebhook(record.id, {
    lastUsedAt: new Date().toISOString(),
    deliveryCount: record.deliveryCount + 1,
  });
  return { kind: 'ok', delivered: true };
};

export const __test__ = { sha256Hex };
