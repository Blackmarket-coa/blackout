const homeserver = () =>
  process.env.MATRIX_HOMESERVER ?? process.env.MATRIX_HOMESERVER_URL;
const botToken = () => process.env.MATRIX_BOT_TOKEN;
const homeserverDomain = () =>
  (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

export const matrixClient = {
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

  async sendMessage(roomId: string, content: string) {
    return matrixClient.sendEvent(roomId, { msgtype: 'm.text', body: content });
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
    return { ok: response.ok, status: response.status };
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
    return { ok: response.ok, status: response.status };
  },
};
