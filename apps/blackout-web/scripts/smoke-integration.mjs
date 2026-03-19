#!/usr/bin/env node

const baseUrl = process.env.BLACKOUT_BASE_URL;
const username = process.env.BLACKOUT_TEST_USERNAME;
const password = process.env.BLACKOUT_TEST_PASSWORD;

if (!baseUrl || !username || !password) {
  console.error("Missing env: BLACKOUT_BASE_URL, BLACKOUT_TEST_USERNAME, BLACKOUT_TEST_PASSWORD");
  process.exit(1);
}

const api = baseUrl.replace(/\/+$/, "");

async function request(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${path}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function run() {
  console.log("1) login/register");

  let auth;
  try {
    auth = await request("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  } catch {
    auth = await request("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  const token = auth.token;
  if (!token) throw new Error("Missing token in auth response");

  const headers = { authorization: `Bearer ${token}` };

  console.log("2) fetch servers/channels");
  const servers = await request("/v1/servers", { headers });
  const serverId = servers?.[0]?.id;
  if (!serverId) throw new Error("No server returned from /v1/servers");

  const server = await request(`/v1/servers/${encodeURIComponent(serverId)}`, { headers });
  const channelId = server?.channels?.[0]?.id;
  if (!channelId) throw new Error("No channel returned for selected server");

  console.log("3) send message");
  const message = await request(`/v1/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: `smoke-${Date.now()}` }),
  });

  if (!message?.id) throw new Error("Send message response missing id");

  console.log("4) receive realtime event (best effort)");
  if (typeof WebSocket === "undefined") {
    console.log("WebSocket unavailable in this environment; skipping realtime assertion.");
    return;
  }

  const wsUrl = api.replace(/^http/i, "ws") + "/gateway";

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, ["blackout.jwt", token]);

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for realtime event"));
    }, 7000);

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload?.type === "message.created") {
          clearTimeout(timeout);
          socket.close();
          resolve();
        }
      } catch {
        // ignore malformed payloads
      }
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Gateway socket failed"));
    });
  });

  console.log("Smoke integration passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
