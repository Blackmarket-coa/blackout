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
    const hs = homeserver();
    const token = botToken();
    if (!hs || !token || !roomId) {
      return { ok: false as const, reason: 'matrix_not_configured' as const };
    }

    const txnId = crypto.randomUUID();
    const response = await fetch(`${hs}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: content,
      }),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  },
};
