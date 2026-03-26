// ═══════════════════════════════════════════════════════
// BLACKOUT MATRIX CLIENT
// Wraps matrix-js-sdk with Blackout-specific defaults
// ═══════════════════════════════════════════════════════

import sdk, {
  type MatrixClient,
  type ICreateClientOpts,
  type LoginResponse,
} from "matrix-js-sdk";

export type BlackoutClientOpts = {
  homeserverUrl: string;
  accessToken?: string;
  userId?: string;
  deviceId?: string;
};

/**
 * Create a Blackout Matrix client.
 *
 * For initial login: pass only homeserverUrl.
 * For session restore: pass all four fields.
 */
export function createBlackoutClient(opts: BlackoutClientOpts): MatrixClient {
  const clientOpts: ICreateClientOpts = {
    baseUrl: opts.homeserverUrl,
  };

  if (opts.accessToken) {
    clientOpts.accessToken = opts.accessToken;
    clientOpts.userId = opts.userId;
    clientOpts.deviceId = opts.deviceId;
  }

  return sdk.createClient(clientOpts);
}

/**
 * Login with username + password.
 * Returns the session data needed to restore later.
 */
export async function loginWithPassword(
  client: MatrixClient,
  username: string,
  password: string
): Promise<{
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserverUrl: string;
}> {
  const response: LoginResponse = await client.login("m.login.password", {
    user: username,
    password: password,
    initial_device_display_name: "Blackout Mobile",
  });

  return {
    userId: response.user_id,
    accessToken: response.access_token,
    deviceId: response.device_id,
    homeserverUrl: client.getHomeserverUrl(),
  };
}

/**
 * Start syncing with the homeserver.
 * Call this after login or session restore.
 */
export function startSync(client: MatrixClient, initialSyncLimit = 20) {
  client.startClient({ initialSyncLimit });
}

/**
 * Stop syncing and clean up.
 */
export function stopSync(client: MatrixClient) {
  client.stopClient();
}

/**
 * Logout and invalidate the access token.
 */
export async function logout(client: MatrixClient) {
  try {
    await client.logout(true);
  } finally {
    client.stopClient();
  }
}
