const homeserver = () =>
  process.env.MATRIX_HOMESERVER ?? process.env.MATRIX_HOMESERVER_URL;
const botToken = () => process.env.MATRIX_BOT_TOKEN;
const homeserverDomain = () =>
  (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

// Cache the bot's resolved MXID across calls — `whoami` is a network round-trip
// and the identity never changes for a given token.
let botUserIdCache: string | undefined;

// Alias → room id cache. Room aliases are stable for the process lifetime.
const roomAliasCache = new Map<string, string>();

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

    const response = await fetch(`${hs}/_synapse/admin/v2/users/@${encodeURIComponent(username)}:${homeserverDomain()}`, {
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
      response = await fetch(`${hs}/_matrix/client/v3/account/whoami`, {
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
      response = await fetch(
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
      response = await fetch(`${hs}/_matrix/media/v3/upload${qs}`, {
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
      let detail: string | undefined;
      try {
        detail = await response.text();
      } catch {
        /* ignore body-read failure */
      }
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
    const response = await fetch(
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
      let detail: string | undefined;
      try {
        detail = await response.text();
      } catch {
        /* ignore body-read failure */
      }
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
    const response = await fetch(
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
    const response = await fetch(
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
      try {
        detail = await response.text();
      } catch {
        /* ignore body-read failure */
      }
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
      response = await fetch(
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
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    let detail: string | undefined;
    if (!response.ok) {
      try {
        detail = await response.text();
      } catch {
        /* ignore body-read failure */
      }
    }
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
      response = await fetch(
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
      response = await fetch(
        `${hs}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/members`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      return { ok: false as const, reason: 'network_error' as const, detail: (error as Error).message };
    }
    if (!response.ok) {
      let detail: string | undefined;
      try {
        detail = await response.text();
      } catch {
        /* ignore body-read failure */
      }
      return { ok: false as const, status: response.status, reason: 'synapse_rejected' as const, detail };
    }
    const body = (await response.json()) as { members?: unknown };
    const members = Array.isArray(body.members)
      ? body.members.filter((m): m is string => typeof m === 'string')
      : [];
    return { ok: true as const, status: response.status, members };
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
  async sendEvent(
    roomId: string,
    content: Record<string, unknown>,
    options: { eventType?: string; txnId?: string } = {},
  ) {
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }
    const eventType = options.eventType ?? 'm.room.message';
    const txnId = options.txnId ?? crypto.randomUUID();
    const response = await fetch(
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
};
