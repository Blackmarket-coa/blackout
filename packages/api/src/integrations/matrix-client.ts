const homeserver = () => process.env.MATRIX_HOMESERVER;
const botToken = () => process.env.MATRIX_BOT_TOKEN;

export const matrixClient = {
  async registerUser(username: string, password: string) {
    const hs = homeserver();
    const token = botToken();

    if (!hs || !token) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }

    const response = await fetch(`${hs}/_synapse/admin/v2/users/@${encodeURIComponent(username)}:blackout.local`, {
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
