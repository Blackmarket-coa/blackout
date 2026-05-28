import { createHmac, randomBytes } from 'node:crypto';

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const SHORT_FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const homeserver = () =>
  process.env.MATRIX_HOMESERVER ?? process.env.MATRIX_HOMESERVER_URL;
const botToken = () => process.env.MATRIX_BOT_TOKEN;
const registrationSecret = () => process.env.MATRIX_REGISTRATION_SHARED_SECRET?.trim();
const homeserverDomain = () =>
  (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

// Cache the bot's resolved MXID across calls — `whoami` is a network round-trip
// and the identity never changes for a given token.
let botUserIdCache: string | undefined;

// Alias → room id cache. Room aliases are stable for the process lifetime.
const roomAliasCache = new Map<string, string>();

/** Read a response body as text, truncating to a safe length to prevent
 *  internal error details from leaking to API consumers. */
async function readSafeErrorDetail(response: Response): Promise<string | undefined> {
    try {
        const text = await response.text();
        return text.length > 256 ? `${text.slice(0, 253)}...` : text;
    } catch {
        return undefined;
    }
}

export const matrixClient = {
  /**
   * Resolve the bot account's own Matrix user id (`@blackout:domain`) by
   * calling `whoami` with the bot token, cached for the process lifetime.
   * Exposed so the client can invite the bot into a den (the only actor with
   * power to do so) before the server force-joins it. Falls back to deriving
   * `@${MATRIX_BOT_LOCALPART|blackout}:${domain}` if whoami is unavailable.
   */
  async botUserId(): Promise<string | undefined> {
    if (botUserIdCache) return botUserIdCache;
    const token = botToken();
    const hs = homeserver();
    if (!hs || !token) return undefined;
    const who = await matrixClient.whoami(token);
    if (who.ok && who.userId) {
      botUserIdCache = who.userId;
      return botUserIdCache;
    }
    const localpart = (process.env.MATRIX_BOT_LOCALPART ?? 'blackout').replace(/^@+/, '');
    botUserIdCache = `@${localpart}:${homeserverDomain()}`;
    return botUserIdCache;
  },
  async registerUser(username: string, password: string) {
    const hs = homeserver();
    const token = botToken();

    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }

    const response = await fetchWithTimeout(`${hs}/_synapse/admin/v2/users/@${encodeURIComponent(username)}:${homeserverDomain()}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password,
        displayname: username,
      }),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  },

  /**
   * Register a user via Synapse's shared-secret admin API. This endpoint
   * only allows user creation (no deactivation, purge, or listing) — much
   * smaller blast radius than the full admin bot token. Preferred for
   * flows that only need to provision accounts (account-number signup).
   *
   * Requires MATRIX_REGISTRATION_SHARED_SECRET to be configured on both
   * the API and the Synapse homeserver.
   */
  async registerWithSharedSecret(username: string, password: string) {
    const hs = homeserver();
    const secret = registrationSecret();

    if (!hs || !secret) {
      return { ok: false as const, reason: 'registration_secret_not_configured' as const };
    }

    const nonce = randomBytes(16).toString('hex');
    const admin = false;
    const macInput = [nonce, username, password, admin ? 'admin' : 'notadmin'].join('\x00');
    const mac = createHmac('sha1', secret).update(macInput).digest('hex');

    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_synapse/admin/v1/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, username, password, admin, mac }),
      }, SHORT_FETCH_TIMEOUT_MS);
    } catch {
      return { ok: false as const, reason: 'network_error' as const };
    }

    const detail = await readSafeErrorDetail(response);
    return {
      ok: response.ok,
      status: response.status,
      detail,
    };
  },

  /**
   * Provision a throwaway "burner" account via the admin v2 PUT endpoint and
   * return the random localpart-based mxid plus the random password it was
   * created with. The caller (the client) logs in with that password through
   * the normal `m.login.password` flow, which mints a real device + refresh
   * token and is E2EE-capable — unlike the admin user-login puppet token,
   * which has no device semantics. Public registration stays closed; only the
   * bot admin token can create accounts this way.
   */
  async provisionBurner(label: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }

    const localpart = `burn-${randomBytes(8).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    const userId = `@${localpart}:${homeserverDomain()}`;
    const displayname = label.replace(/[<>]/g, '').replace(/[\x00-\x1f]/g, '').slice(0, 80) || 'Burner';

    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, displayname }),
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }

    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const, detail };
    }

    return { ok: true as const, status: response.status, userId, password, displayname };
  },

  /**
   * Validate a *user-supplied* Matrix access token by calling the
   * homeserver's `whoami` endpoint with it. Unlike the other methods here
   * this deliberately uses the caller's token, not the bot admin token —
   * the whole point is to prove the caller holds a live Matrix session and
   * to learn which user it belongs to. Used by `POST /v1/auth/matrix/exchange`
   * to bridge a Matrix login into a Blackout API JWT.
   */
  async whoami(accessToken: string) {
    const hs = homeserver();
    if (!hs) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    if (!accessToken) {
      return { ok: false as const, reason: 'no_token' as const };
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_matrix/client/v3/account/whoami`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }

    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'invalid_token' as const };
    }

    const json = (await response.json()) as { user_id?: string; device_id?: string };
    if (!json.user_id) {
      return { ok: false as const, status: response.status, reason: 'no_user_id' as const };
    }

    return {
      ok: true as const,
      status: response.status,
      userId: json.user_id,
      deviceId: json.device_id,
    };
  },

  async sendMessage(roomId: string, content: string) {
    return matrixClient.sendEvent(roomId, { msgtype: 'm.text', body: content });
  },

  /**
   * Resolve a room alias (`#bugs:domain`) to its room id (`!abc:domain`) via the
   * client directory API. Cached for the process lifetime — aliases are stable.
   * Used by the bug-report widget pipeline to target the `#bugs` room without
   * hardcoding a room id in deploys that only know the human-readable alias.
   */
  async resolveRoomAlias(alias: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const cached = roomAliasCache.get(alias);
    if (cached) return { ok: true as const, roomId: cached };
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
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
  },

  /**
   * Create a room as the server bot, optionally publishing a directory alias.
   * Used by the contributor-room provisioning script to bootstrap the standing
   * community rooms (#welcome, #bugs, #governance, …). The bot becomes the
   * room creator/admin. `aliasLocalpart` is the bare localpart (no leading `#`
   * or `:domain`) — Synapse derives the full alias from it.
   */
  async createRoom(input: {
    aliasLocalpart?: string;
    name?: string;
    topic?: string;
    visibility?: 'public' | 'private';
    preset?: 'public_chat' | 'private_chat' | 'trusted_private_chat';
    /** `creation_content` for the m.room.create event (e.g. `{ type: 'm.space' }`). */
    creationContent?: Record<string, unknown>;
    /** `power_level_content_override` merged into the room's initial power levels. */
    powerLevelOverride?: Record<string, unknown>;
  }) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
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
  },

  /**
   * Upload binary content to the homeserver media repository and return the
   * resulting `mxc://` URI. Used to attach bug-report screenshots / screen
   * recordings before referencing them from an `m.image` / `m.file` event.
   */
  async uploadContent(bytes: Uint8Array, contentType: string, filename?: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const qs = filename ? `?filename=${encodeURIComponent(filename)}` : '';
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_matrix/media/v3/upload${qs}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
        },
        // undici's fetch accepts a Uint8Array body at runtime; the DOM lib's
        // BodyInit type is stricter about ArrayBufferLike, so cast locally.
        body: bytes as unknown as BodyInit,
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
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
  },

  /**
   * Mint a Synapse registration token via the admin API. Used by the
   * invitations flow so creating a Blackout invite also produces the
   * token the recipient needs to satisfy `registration_requires_token`
   * during UIA sign-up.
   *
   * Returns the plaintext token on success — Synapse generates the
   * value and we surface it once for storage. Callers should treat it
   * as a secret credential (it lets the holder create exactly N Matrix
   * accounts, where N = usesAllowed).
   */
  async mintRegistrationToken(input: {
    usesAllowed?: number | null;
    expiresAtMs?: number | null;
    length?: number;
  }) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const body: Record<string, unknown> = {
      uses_allowed: input.usesAllowed ?? null,
      expiry_time: input.expiresAtMs ?? null,
    };
    if (input.length && input.length > 0) body.length = input.length;
    const response = await fetchWithTimeout(
      `${hs}/_synapse/admin/v1/registration_tokens/new`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const, detail };
    }
    const json = (await response.json()) as { token?: string; expiry_time?: number | null };
    if (!json.token) {
      return { ok: false as const, status: response.status, reason: 'synapse_no_token' as const };
    }
    return {
      ok: true as const,
      status: response.status,
      token: json.token,
      expiresAtMs: typeof json.expiry_time === 'number' ? json.expiry_time : null,
    };
  },

  /**
   * Revoke a Synapse registration token. Best-effort: callers log on
   * failure rather than rolling back the Blackout-side revoke, so a
   * Synapse outage doesn't strand a revoked invite as still-revokable
   * from the user's perspective.
   */
  async revokeRegistrationToken(token: string) {
    const hs = homeserver();
    const adminToken = botToken();
    if (!hs || !adminToken) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const response = await fetchWithTimeout(
      `${hs}/_synapse/admin/v1/registration_tokens/${encodeURIComponent(token)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    return { ok: response.ok, status: response.status };
  },

  /**
   * Invite a Matrix user to a room using the bot token. Used by the
   * invitation-token redemption flow: when an invite is bound to a room,
   * we issue this call as the bot so the newly-registered account sees
   * the room in their invites list on first login.
   */
  async inviteToRoom(roomId: string, userId: string, reason?: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const response = await fetchWithTimeout(
      `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reason ? { user_id: userId, reason } : { user_id: userId }),
      },
    );
    let detail: string | undefined;
    if (!response.ok) {
      detail = await readSafeErrorDetail(response);
    }
    return { ok: response.ok, status: response.status, detail };
  },

  /**
   * Force-join a local user into a room via the Synapse admin API
   * (`POST /_synapse/admin/v1/join/{roomId}`). Unlike `inviteToRoom`, this
   * does NOT require the bot to be a member of the room — it leverages the
   * admin token's elevated powers (Synapse authorizes the join off a local
   * member already able to invite the target). This is what makes redemption
   * reliable for *member-created* dens, where the bot has no membership or
   * invite power and a plain `inviteToRoom` would 403.
   *
   * The redeemer is joined directly (not merely invited), so they can post
   * the instant their client syncs the room — no invite-accept round-trip.
   */
  async adminJoinUserToRoom(roomId: string, userId: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: userId }),
        },
      );
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const };
    }
    const detail = await readSafeErrorDetail(response);
    return { ok: response.ok, status: response.status, detail };
  },

  /**
   * Resolve the parent space (canopy) of a room so the invite-redemption flow
   * can tell the client which canopy to onboard the recipient into without
   * waiting for their own Matrix sync to populate the space hierarchy.
   *
   * Uses the Synapse *admin* state endpoint
   * (`GET /_synapse/admin/v1/rooms/{roomId}/state`) rather than the client
   * `/state` route, because the bot is typically NOT a member of a
   * member-created den — the client route would 403, leaving the canopy
   * unresolved and onboarding skipped. Returns:
   *   - the room id itself if it IS a space (`m.room.create` `type: m.space`);
   *   - else the first `m.space.parent` whose `content.via` is non-empty
   *     (canonical parent per MSC1772);
   *   - else `undefined`.
   */
  async getRoomParentSpace(roomId: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const };
    }
    const body = (await response.json()) as {
      state?: Array<{
        type: string;
        state_key?: string;
        content?: Record<string, unknown>;
      }>;
    };
    const state = body.state;
    if (!Array.isArray(state)) {
      return { ok: true as const, canopyId: undefined };
    }

    const create = state.find((e) => e.type === 'm.room.create');
    if (create?.content?.type === 'm.space') {
      return { ok: true as const, canopyId: roomId };
    }

    const parent = state.find(
      (e) =>
        e.type === 'm.space.parent' &&
        typeof e.state_key === 'string' &&
        Array.isArray((e.content as { via?: unknown } | undefined)?.via) &&
        ((e.content as { via?: unknown[] }).via?.length ?? 0) > 0,
    );
    return { ok: true as const, canopyId: parent?.state_key };
  },

  /**
   * List a room's members via the Synapse admin API
   * (`GET /_synapse/admin/v1/rooms/{roomId}/members`). Used by the invite
   * diagnostic to check whether the bot is actually a member of a den —
   * works without the bot being in the room (admin powers).
   */
  async getRoomMembers(roomId: string) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/members`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const, detail };
    }
    const body = (await response.json()) as { members?: unknown };
    const members = Array.isArray(body.members)
      ? body.members.filter((m): m is string => typeof m === 'string')
      : [];
    return { ok: true as const, status: response.status, members };
  },

  /**
   * Admin: list/search Matrix users via the Synapse admin API
   * (`GET /_synapse/admin/v2/users`). Returns the matching page plus the total
   * count Synapse reports. Backs the operations console's user lookup.
   */
  async listUsers(input: { search?: string; limit?: number } = {}) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const params = new URLSearchParams({
      from: '0',
      limit: String(input.limit ?? 50),
      guests: 'false',
    });
    if (input.search?.trim()) params.set('name', input.search.trim());
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_synapse/admin/v2/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const };
    }
    const json = (await response.json()) as {
      users?: Array<{ name?: string; displayname?: string | null; deactivated?: boolean; admin?: boolean }>;
      total?: number;
    };
    const users = (json.users ?? []).map((u) => ({
      userId: u.name ?? '',
      displayName: u.displayname ?? null,
      deactivated: Boolean(u.deactivated),
      admin: Boolean(u.admin),
    }));
    return { ok: true as const, status: response.status, users, total: json.total ?? users.length };
  },

  /**
   * Admin: a small server-overview snapshot — total users and total rooms —
   * derived from the Synapse admin list endpoints (we request a single row and
   * read the `total` Synapse returns). Backs the operations console stats panel.
   */
  async serverStats() {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [usersRes, roomsRes] = await Promise.all([
        fetch(`${hs}/_synapse/admin/v2/users?from=0&limit=1&guests=false`, { headers }),
        fetch(`${hs}/_synapse/admin/v1/rooms?from=0&limit=1`, { headers }),
      ]);
      if (!usersRes.ok || !roomsRes.ok) {
        return {
          ok: false as const,
          status: usersRes.ok ? roomsRes.status : usersRes.status,
          reason: 'synapse_rejected' as const,
        };
      }
      const usersJson = (await usersRes.json()) as { total?: number };
      const roomsJson = (await roomsRes.json()) as { total_rooms?: number };
      return {
        ok: true as const,
        totalUsers: usersJson.total ?? 0,
        totalRooms: roomsJson.total_rooms ?? 0,
      };
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
  },

  /**
   * Admin: deactivate a Matrix account
   * (`POST /_synapse/admin/v1/deactivate/{userId}`). `erase` requests GDPR
   * erasure of the user's messages; default false just locks the account.
   */
  async deactivateUser(userId: string, erase = false) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ erase }),
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const, detail };
    }
    return { ok: true as const, status: response.status };
  },

  /**
   * Admin: purge/delete a room via the async Synapse admin v2 delete endpoint
   * (`DELETE /_synapse/admin/v2/rooms/{roomId}`). `block` prevents the room
   * from being re-joined/re-created; `purge` removes its history from the DB.
   * Returns the `delete_id` Synapse assigns to the background job.
   */
  async purgeRoom(roomId: string, opts: { block?: boolean; purge?: boolean } = {}) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(`${hs}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: opts.block ?? false, purge: opts.purge ?? true }),
      });
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      const detail = await readSafeErrorDetail(response);
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const, detail };
    }
    const json = (await response.json().catch(() => ({}))) as { delete_id?: string };
    return { ok: true as const, status: response.status, deleteId: json.delete_id };
  },

  /**
   * Send an arbitrary Matrix event content into a room. Used by the
   * compatibility bridges (Twitch chat ingress, etc.) which need to ship
   * full event payloads with custom `m.blackout.*` extension fields, not
   * just plain text.
   *
   * The transaction id is derived from `txnId` when supplied so callers
   * that re-issue on retry don't double-deliver; otherwise a fresh UUID
   * is generated.
   */
  /**
   * Write a room *state* event (PUT .../state/{type}/{stateKey}). Unlike
   * `sendEvent` (timeline messages with a txn id) this targets the state
   * endpoint, used e.g. to stamp a den's `co.bmc.den.classification`.
   */
  /**
   * Read a single state event's content. Returns `{ ok: false }` (with the HTTP
   * status, e.g. 404) when the event is absent so callers can default rather
   * than throw.
   */
  async getStateEvent(roomId: string, eventType: string, stateKey = '') {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      return { ok: false as const, status: response.status };
    }
    const content = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true as const, status: response.status, content };
  },

  async sendStateEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    stateKey = '',
  ) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const response = await fetchWithTimeout(
      `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}/${encodeURIComponent(stateKey)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
  },

  async sendEvent(
    roomId: string,
    // Any JSON-serializable event content; it is only stringified below, so
    // typed message objects (e.g. the chat-bridge forwarders) are accepted.
    content: object,
    options: { eventType?: string; txnId?: string } = {},
  ) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const eventType = options.eventType ?? 'm.room.message';
    const txnId = options.txnId ?? crypto.randomUUID();
    const response = await fetchWithTimeout(
      `${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(content),
      },
    );
    let eventId: string | undefined;
    if (response.ok) {
      try {
        const json = (await response.json()) as { event_id?: string };
        eventId = json.event_id;
      } catch {
        /* response may be empty on some proxies — event id just stays undefined */
      }
    }
    return { ok: response.ok, status: response.status, eventId };
  },

  /**
   * Boot-time / health probe for the Matrix dependency. Invites and redemption
   * require the bot token to hold *Synapse admin* rights (force-join, registration
   * tokens, parent-space lookup); a deploy missing that comes up "healthy" yet
   * fails every invite at redeem time. This reports configuration + admin
   * reachability so the failure surfaces at startup and in `/health`, not later.
   *
   * Does not throw and does not cache — cheap enough to call on demand.
   */
  async adminPreflight(): Promise<{
    configured: boolean;
    botUserId?: string;
    adminOk: boolean;
    reason?: string;
    detail?: string;
  }> {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token) {
      return { configured: false, adminOk: false, reason: 'matrix_not_configured' };
    }

    const botUserId = await matrixClient.botUserId();
    const stats = await matrixClient.serverStats();
    if (stats.ok) {
      return { configured: true, botUserId, adminOk: true };
    }
    return {
      configured: true,
      botUserId,
      adminOk: false,
      reason: 'reason' in stats ? stats.reason : 'synapse_unreachable',
      detail: 'detail' in stats ? stats.detail : undefined,
    };
  },
};
