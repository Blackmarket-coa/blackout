import { createHmac, randomBytes } from 'node:crypto';

import {
  type MatrixAdminClient,
  type MatrixResult,
  botToken,
  fetchWithTimeout,
  homeserver,
  homeserverDomain,
  readSafeErrorDetail,
  shortTimeout,
} from './types';

const registrationSecret = () =>
  process.env.MATRIX_REGISTRATION_SHARED_SECRET?.trim();

let botUserIdCache: string | undefined;
const roomAliasCache = new Map<string, string>();

function authHeaders() {
  const token = botToken();
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}

export class ContinuwuityClient implements MatrixAdminClient {
  // --- Standard C-S API (identical to Synapse for these) ---

  async botUserId(): Promise<string | undefined> {
    if (botUserIdCache) return botUserIdCache;
    const token = botToken();
    const hs = homeserver();
    if (!hs || !token) return undefined;
    const who = await this.whoami(token);
    if (who.ok && 'userId' in who && who.userId) {
      botUserIdCache = who.userId;
      return botUserIdCache;
    }
    const localpart = (process.env.MATRIX_BOT_LOCALPART ?? 'blackout').replace(/^@+/, '');
    botUserIdCache = `@${localpart}:${homeserverDomain()}`;
    return botUserIdCache;
  }

  async whoami(accessToken: string) {
    const hs = homeserver();
    if (!hs) return { ok: false as const, reason: 'matrix_not_configured' as const };
    if (!accessToken) return { ok: false as const, reason: 'no_token' as const };
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_matrix/client/v3/account/whoami`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'invalid_token' as const };
    }
    const json = (await response.json()) as { user_id?: string; device_id?: string };
    if (!json.user_id) {
      return { ok: false as const, status: response.status, reason: 'no_user_id' as const };
    }
    return { ok: true as const, status: response.status, userId: json.user_id, deviceId: json.device_id };
  }

  async sendMessage(roomId: string, content: string) {
    return this.sendEvent(roomId, { msgtype: 'm.text', body: content });
  }

  async resolveRoomAlias(alias: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const cached = roomAliasCache.get(alias);
    if (cached) return { ok: true as const, roomId: cached };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'alias_not_found' as const };
    }
    const json = (await response.json()) as { room_id?: string };
    if (!json.room_id) {
      return { ok: false as const, status: response.status, reason: 'no_room_id' as const };
    }
    roomAliasCache.set(alias, json.room_id);
    return { ok: true as const, status: response.status, roomId: json.room_id };
  }

  async createRoom(input: {
    aliasLocalpart?: string;
    name?: string;
    topic?: string;
    visibility?: 'public' | 'private';
    preset?: 'public_chat' | 'private_chat' | 'trusted_private_chat';
    creationContent?: Record<string, unknown>;
    powerLevelOverride?: Record<string, unknown>;
  }) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const body: Record<string, unknown> = {
      visibility: input.visibility ?? 'public',
      preset: input.preset ?? 'public_chat',
    };
    if (input.aliasLocalpart) body.room_alias_name = input.aliasLocalpart;
    if (input.name) body.name = input.name;
    if (input.topic) body.topic = input.topic;
    if (input.creationContent) body.creation_content = input.creationContent;
    if (input.powerLevelOverride) body.power_level_content_override = input.powerLevelOverride;
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_matrix/client/v3/createRoom`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'create_rejected' as const, detail };
    }
    const json = (await response.json()) as { room_id?: string };
    if (!json.room_id) {
      return { ok: false as const, status: response.status, reason: 'no_room_id' as const };
    }
    return { ok: true as const, status: response.status, roomId: json.room_id };
  }

  async uploadContent(bytes: Uint8Array, contentType: string, filename?: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const qs = filename ? `?filename=${encodeURIComponent(filename)}` : '';
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_matrix/media/v3/upload${qs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
        body: bytes as unknown as BodyInit,
      });
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'upload_rejected' as const, detail };
    }
    const json = (await response.json()) as { content_uri?: string };
    if (!json.content_uri) {
      return { ok: false as const, status: response.status, reason: 'no_content_uri' as const };
    }
    return { ok: true as const, status: response.status, contentUri: json.content_uri };
  }

  async inviteToRoom(roomId: string, userId: string, reason?: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const response = await fetchWithTimeout(
      `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { user_id: userId, reason } : { user_id: userId }),
      },
    );
    let detail: string | undefined;
    if (!response.ok) detail = await readSafeErrorDetail(response);
    return { ok: response.ok, status: response.status, detail };
  }

  async getStateEvent(roomId: string, eventType: string, stateKey = '') {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) return { ok: false as const, reason: 'matrix_not_configured' as const };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) return { ok: false as const, status: response.status };
    const content = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true as const, status: response.status, content };
  }

  async sendStateEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    stateKey = '',
  ) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const response = await fetchWithTimeout(
      `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      },
    );
    let eventId: string | undefined;
    if (response.ok) {
      try {
        const json = (await response.json()) as { event_id?: string };
        eventId = json.event_id;
      } catch {
        /* empty body on some proxies */
      }
    }
    return { ok: response.ok, status: response.status, eventId };
  }

  async sendEvent(
    roomId: string,
    content: object,
    options: { eventType?: string; txnId?: string } = {},
  ) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const eventType = options.eventType ?? 'm.room.message';
    const txnId = options.txnId ?? crypto.randomUUID();
    const response = await fetchWithTimeout(
      `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      },
    );
    let eventId: string | undefined;
    if (response.ok) {
      try {
        const json = (await response.json()) as { event_id?: string };
        eventId = json.event_id;
      } catch {
        /* response may be empty */
      }
    }
    return { ok: response.ok, status: response.status, eventId };
  }

  // --- Continuwuity Admin API (new REST endpoints) ---

  async registerUser(username: string, password: string): Promise<MatrixResult> {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false, reason: 'matrix_not_configured' };
    const userId = `@${username}:${homeserverDomain()}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/users/${encodeURIComponent(userId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, displayname: username }),
        },
      );
    } catch {
      return { ok: false, reason: 'network_error' };
    }
    const detail = await readSafeErrorDetail(response);
    return { ok: response.ok, status: response.status, detail };
  }

  async registerWithSharedSecret(username: string, password: string): Promise<MatrixResult> {
    const hs = homeserver();
    const secret = registrationSecret();
    if (!hs || !secret) return { ok: false, reason: 'registration_secret_not_configured' };
    const nonce = randomBytes(16).toString('hex');
    const admin = false;
    const macInput = [nonce, username, password, admin ? 'admin' : 'notadmin'].join('\x00');
    const mac = createHmac('sha1', secret).update(macInput).digest('hex');
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce, username, password, admin, mac }),
        },
        shortTimeout(),
      );
    } catch {
      return { ok: false, reason: 'network_error' };
    }
    const detail = await readSafeErrorDetail(response);
    return { ok: response.ok, status: response.status, detail };
  }

  async provisionBurner(label: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const localpart = `burn-${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    const userId = `@${localpart}:${homeserverDomain()}`;
    const displayname =
      label.replace(/[<>]/g, '').replace(/[\x00-\x1f]/g, '').slice(0, 80) || 'Burner';
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/users/${encodeURIComponent(userId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, displayname }),
        },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const, detail };
    }
    return { ok: true as const, status: response.status, userId, password, displayname };
  }

  async mintRegistrationToken(input: {
    usesAllowed?: number | null;
    expiresAtMs?: number | null;
    length?: number;
  }) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const body: Record<string, unknown> = {};
    if (input.usesAllowed != null) body.uses_allowed = input.usesAllowed;
    if (input.expiresAtMs != null) body.expiry_time = input.expiresAtMs;
    if (input.length && input.length > 0) body.length = input.length;
    const response = await fetchWithTimeout(
      `${hs}/_continuwuity/admin/v1/registration_tokens/new`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const, detail };
    }
    const json = (await response.json()) as { token?: string; expiry_time?: number | null };
    if (!json.token) {
      return { ok: false as const, status: response.status, reason: 'no_token' as const };
    }
    return {
      ok: true as const,
      status: response.status,
      token: json.token,
      expiresAtMs: typeof json.expiry_time === 'number' ? json.expiry_time : null,
    };
  }

  async revokeRegistrationToken(token: string) {
    const hs = homeserver();
    const adminToken = botToken();
    if (!hs || !adminToken) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const response = await fetchWithTimeout(
      `${hs}/_continuwuity/admin/v1/registration_tokens/${encodeURIComponent(token)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    return { ok: response.ok, status: response.status };
  }

  async adminJoinUserToRoom(roomId: string, userId: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/join/${encodeURIComponent(roomId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    const detail = await readSafeErrorDetail(response);
    return { ok: response.ok, status: response.status, detail };
  }

  async getRoomParentSpace(roomId: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      return {
        ok: false as const,
        reason: 'network_error' as const,
        detail: (error as Error).message,
      };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const };
    }
    const body = (await response.json()) as {
      state?: Array<{ type: string; state_key?: string; content?: Record<string, unknown> }>;
    };
    const state = body.state;
    if (!Array.isArray(state)) return { ok: true as const, canopyId: undefined };
    const create = state.find((e) => e.type === 'm.room.create');
    if (create?.content?.type === 'm.space') return { ok: true as const, canopyId: roomId };
    const parent = state.find(
      (e) =>
        e.type === 'm.space.parent' &&
        typeof e.state_key === 'string' &&
        Array.isArray((e.content as { via?: unknown } | undefined)?.via) &&
        ((e.content as { via?: unknown[] }).via?.length ?? 0) > 0,
    );
    return { ok: true as const, canopyId: parent?.state_key };
  }

  async getRoomMembers(roomId: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/rooms/${encodeURIComponent(roomId)}/members`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const, detail };
    }
    const json = (await response.json()) as { members?: unknown; total?: number };
    const members: string[] = Array.isArray(json.members)
      ? json.members.filter((m): m is string => typeof m === 'string')
      : [];
    return { ok: true as const, status: response.status, members };
  }

  async listUsers(input: { search?: string; limit?: number } = {}) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const params = new URLSearchParams();
    params.set('limit', String(input.limit ?? 50));
    if (input.search?.trim()) params.set('search', input.search.trim());
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/users?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const };
    }
    const json = (await response.json()) as {
      users?: Array<{
        user_id: string;
        displayname?: string | null;
        deactivated?: boolean;
        admin?: boolean;
      }>;
      total?: number;
    };
    const users = (json.users ?? []).map((u) => ({
      userId: u.user_id,
      displayName: u.displayname ?? null,
      deactivated: Boolean(u.deactivated),
      admin: Boolean(u.admin),
    }));
    return { ok: true as const, status: response.status, users, total: json.total ?? users.length };
  }

  async serverStats() {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [usersRes, roomsRes] = await Promise.all([
        fetch(`${hs}/_continuwuity/admin/v1/users?limit=1`, { headers }),
        fetch(`${hs}/_continuwuity/admin/v1/rooms`, { headers }),
      ]);
      if (!usersRes.ok || !roomsRes.ok) {
        return {
          ok: false as const,
          status: usersRes.ok ? roomsRes.status : usersRes.status,
          reason: 'continuwuity_rejected' as const,
        };
      }
      const usersJson = (await usersRes.json()) as { total?: number };
      const roomsJson = (await roomsRes.json()) as { total_rooms?: number };
      return {
        ok: true as const,
        totalUsers: usersJson.total ?? 0,
        totalRooms: roomsJson.total_rooms ?? 0,
      };
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
  }

  async deactivateUser(userId: string, erase = false) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v1/deactivate/${encodeURIComponent(userId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ erase }),
        },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const, detail };
    }
    return { ok: true as const, status: response.status };
  }

  async purgeRoom(roomId: string, opts: { block?: boolean; purge?: boolean } = {}) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { ok: false as const, reason: 'matrix_not_configured' as const };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_continuwuity/admin/v2/rooms/${encodeURIComponent(roomId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ block: opts.block ?? false }),
        },
      );
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'continuwuity_rejected' as const, detail };
    }
    const json = (await response.json().catch(() => ({}))) as { delete_id?: string };
    return { ok: true as const, status: response.status, deleteId: json.delete_id };
  }

  async adminPreflight(): Promise<{
    configured: boolean;
    botUserId?: string;
    adminOk: boolean;
    reason?: string;
    detail?: string;
  }> {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) return { configured: false, adminOk: false, reason: 'matrix_not_configured' };
    const botUserId = await this.botUserId();
    const stats = await this.serverStats();
    if (stats.ok) return { configured: true, botUserId, adminOk: true };
    return {
      configured: true,
      botUserId,
      adminOk: false,
      reason: 'reason' in stats ? stats.reason : 'continuwuity_unreachable',
      detail: 'detail' in stats ? stats.detail : undefined,
    };
  }
}
