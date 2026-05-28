const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const SHORT_FETCH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function readSafeErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.length > 256 ? `${text.slice(0, 253)}...` : text;
  } catch {
    return undefined;
  }
}

export function shortTimeout() {
  return SHORT_FETCH_TIMEOUT_MS;
}

// --- Common env helpers ---

export function homeserver() {
  return process.env.MATRIX_HOMESERVER ?? process.env.MATRIX_HOMESERVER_URL;
}

export function botToken() {
  return process.env.MATRIX_BOT_TOKEN;
}

export function homeserverDomain() {
  return (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
}

// --- Result types ---

export type MatrixResult<T = void> =
  | ({ ok: true; status: number } & T)
  | { ok: false; status?: number; reason: string; detail?: string };

export interface UserRecord {
  userId: string;
  displayName: string | null;
  deactivated: boolean;
  admin: boolean;
}

// --- Interface ---

export interface MatrixAdminClient {
  botUserId(): Promise<string | undefined>;
  registerUser(username: string, password: string): Promise<MatrixResult>;
  registerWithSharedSecret(username: string, password: string): Promise<MatrixResult>;
  provisionBurner(label: string): Promise<
    MatrixResult<{ userId: string; password: string; displayname: string }>
  >;
  whoami(accessToken: string): Promise<
    MatrixResult<{ userId: string; deviceId?: string }>
  >;
  sendMessage(roomId: string, content: string): Promise<MatrixResult<{ eventId?: string }>>;
  resolveRoomAlias(alias: string): Promise<MatrixResult<{ roomId: string }>>;
  createRoom(input: {
    aliasLocalpart?: string;
    name?: string;
    topic?: string;
    visibility?: 'public' | 'private';
    preset?: 'public_chat' | 'private_chat' | 'trusted_private_chat';
    creationContent?: Record<string, unknown>;
    powerLevelOverride?: Record<string, unknown>;
  }): Promise<MatrixResult<{ roomId: string }>>;
  uploadContent(
    bytes: Uint8Array,
    contentType: string,
    filename?: string,
  ): Promise<MatrixResult<{ contentUri: string }>>;
  mintRegistrationToken(input: {
    usesAllowed?: number | null;
    expiresAtMs?: number | null;
    length?: number;
  }): Promise<
    MatrixResult<{ token: string; expiresAtMs: number | null }>
  >;
  revokeRegistrationToken(token: string): Promise<MatrixResult>;
  inviteToRoom(
    roomId: string,
    userId: string,
    reason?: string,
  ): Promise<MatrixResult>;
  adminJoinUserToRoom(roomId: string, userId: string): Promise<MatrixResult>;
  getRoomParentSpace(
    roomId: string,
  ): Promise<MatrixResult<{ canopyId?: string }>>;
  getRoomMembers(roomId: string): Promise<MatrixResult<{ members: string[] }>>;
  listUsers(input?: {
    search?: string;
    limit?: number;
  }): Promise<MatrixResult<{ users: UserRecord[]; total: number }>>;
  serverStats(): Promise<
    MatrixResult<{ totalUsers: number; totalRooms: number }>
  >;
  deactivateUser(userId: string, erase?: boolean): Promise<MatrixResult>;
  purgeRoom(
    roomId: string,
    opts?: { block?: boolean; purge?: boolean },
  ): Promise<MatrixResult<{ deleteId?: string }>>;
  getStateEvent(
    roomId: string,
    eventType: string,
    stateKey?: string,
  ): Promise<MatrixResult<{ content: Record<string, unknown> }>>;
  sendStateEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    stateKey?: string,
  ): Promise<MatrixResult<{ eventId?: string }>>;
  sendEvent(
    roomId: string,
    content: object,
    options?: { eventType?: string; txnId?: string },
  ): Promise<MatrixResult<{ eventId?: string }>>;
  adminPreflight(): Promise<{
    configured: boolean;
    botUserId?: string;
    adminOk: boolean;
    reason?: string;
    detail?: string;
  }>;
}
