import { createHash, randomBytes } from 'node:crypto';

/**
 * Phase 3 / Track B: OBS-WebSocket v5 protocol layer.
 *
 * Pure functions + small types. No socket handling — the server module
 * (./server.ts) feeds us inbound JSON frames and ships our outbound JSON
 * frames over a WebSocket. Keeping the protocol layer transport-free
 * means we can unit-test the auth dance + request matrix exhaustively.
 *
 * Reference (OBS-WebSocket v5):
 *   https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 *
 * Wire shape:
 *   { "op": <opcode>, "d": <data> }
 *
 * We implement the subset needed to make Bitfocus Companion / Stream
 * Deck plugins / Touch Portal probe + connect successfully:
 *   - Op 0  Hello (server → client) with optional auth challenge
 *   - Op 1  Identify (client → server) — auth response
 *   - Op 2  Identified (server → client) — handshake done
 *   - Op 6  Request (client → server)
 *   - Op 7  RequestResponse (server → client)
 *   - Op 5  Event (server → client; for now we only emit a connection-
 *           lifecycle hello, future passes add ScenesChanged etc.)
 */

export const OBS_WS_VERSION = '5.5.0' as const;
export const OBS_VIRTUAL_VERSION = '30.0.0-blackout-compat' as const;
export const RPC_VERSION = 1 as const;

export const Op = {
  Hello: 0,
  Identify: 1,
  Identified: 2,
  Reidentify: 3,
  Event: 5,
  Request: 6,
  RequestResponse: 7,
  RequestBatch: 8,
  RequestBatchResponse: 9,
} as const;

export type OpValue = (typeof Op)[keyof typeof Op];

export interface Frame<D = unknown> {
  op: OpValue;
  d: D;
}

// --------------------------- auth helpers -----------------------------------

const sha256Base64 = (s: string): string =>
  createHash('sha256').update(s).digest('base64');

/**
 * Compute the auth response a CLIENT would send given the password,
 * salt, and challenge from the Hello frame.
 *
 *   secret        = base64(sha256(password + salt))
 *   auth_response = base64(sha256(secret + challenge))
 */
export const computeClientAuth = (
  password: string,
  salt: string,
  challenge: string,
): string => {
  const secret = sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
};

/** Server-side: same computation; we recompute and compare. */
export const expectedAuthResponse = computeClientAuth;

/**
 * Generate a random base64 string for use as a salt or challenge. OBS's
 * own client treats them as opaque base64 — any URL-safe alphabet works
 * but we stick with standard base64 for byte-compat with the OBS ref.
 */
export const randomBase64 = (bytes = 32): string =>
  randomBytes(bytes).toString('base64');

// --------------------------- frame builders ---------------------------------

export interface HelloPayload {
  obsWebSocketVersion: string;
  rpcVersion: number;
  authentication?: { challenge: string; salt: string };
}

export const buildHello = (params: {
  challenge?: string;
  salt?: string;
}): Frame<HelloPayload> => ({
  op: Op.Hello,
  d: {
    obsWebSocketVersion: OBS_WS_VERSION,
    rpcVersion: RPC_VERSION,
    ...(params.challenge && params.salt
      ? { authentication: { challenge: params.challenge, salt: params.salt } }
      : {}),
  },
});

export interface IdentifiedPayload {
  negotiatedRpcVersion: number;
}

export const buildIdentified = (): Frame<IdentifiedPayload> => ({
  op: Op.Identified,
  d: { negotiatedRpcVersion: RPC_VERSION },
});

export interface RequestStatus {
  result: boolean;
  /** OBS-WS v5 request status codes. 100 = Success, 204 = NotImplemented, etc. */
  code: number;
  comment?: string;
}

export interface RequestResponsePayload<T = unknown> {
  requestType: string;
  requestId: string;
  requestStatus: RequestStatus;
  responseData?: T;
}

export const REQ_STATUS = {
  Success: 100,
  NoError: 100,
  NotReady: 207,
  NotImplemented: 204,
  InvalidRequestType: 204,
  GenericError: 100, // placeholder — we use specific codes below
  /** Authentication-related failures. */
  AuthenticationFailed: 401,
  /** A request that's known but missing required data fields. */
  MissingRequestField: 300,
  InvalidRequestField: 400,
} as const;

export const buildRequestResponse = (
  requestType: string,
  requestId: string,
  status: RequestStatus,
  responseData?: unknown,
): Frame<RequestResponsePayload> => ({
  op: Op.RequestResponse,
  d: {
    requestType,
    requestId,
    requestStatus: status,
    ...(responseData !== undefined ? { responseData } : {}),
  },
});

// --------------------------- frame parser -----------------------------------

export type ParseResult<T = unknown> =
  | { ok: true; frame: Frame<T> }
  | { ok: false; reason: string };

export const parseFrame = <T = unknown>(raw: string): ParseResult<T> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'not_an_object' };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.op !== 'number') return { ok: false, reason: 'missing_op' };
  return { ok: true, frame: { op: obj.op as OpValue, d: obj.d as T } };
};

// --------------------------- request matrix ---------------------------------

/**
 * The minimum surface for "is this thing on?" probes. Companion calls
 * GetVersion immediately on connect; if the response shape doesn't match
 * the spec the surface gives up, so getting this right is mandatory.
 *
 * Other request types return NotImplemented (204) — the surface treats
 * them as benign, and future passes add handlers as creators ask for them.
 */
export interface GetVersionResponse {
  obsVersion: string;
  obsWebSocketVersion: string;
  rpcVersion: number;
  availableRequests: string[];
  supportedImageFormats: string[];
  platform: string;
  platformDescription: string;
}

export const buildGetVersionResponse = (): GetVersionResponse => ({
  obsVersion: OBS_VIRTUAL_VERSION,
  obsWebSocketVersion: OBS_WS_VERSION,
  rpcVersion: RPC_VERSION,
  availableRequests: ['GetVersion', 'GetStats', 'GetHotkeyList'],
  supportedImageFormats: ['png', 'jpg', 'jpeg', 'webp'],
  platform: 'blackout-compat',
  platformDescription: 'Blackout OBS-WebSocket compatibility shim',
});

export interface GetStatsResponse {
  cpuUsage: number;
  memoryUsage: number;
  availableDiskSpace: number;
  activeFps: number;
  averageFrameRenderTime: number;
  renderSkippedFrames: number;
  renderTotalFrames: number;
  outputSkippedFrames: number;
  outputTotalFrames: number;
  webSocketSessionIncomingMessages: number;
  webSocketSessionOutgoingMessages: number;
}

/**
 * Stats that look reasonable but don't pretend to reflect a real OBS.
 * Companion's "Status" tile renders fine on these.
 */
export const buildGetStatsResponse = (): GetStatsResponse => ({
  cpuUsage: 0,
  memoryUsage: 0,
  availableDiskSpace: 0,
  activeFps: 60,
  averageFrameRenderTime: 0,
  renderSkippedFrames: 0,
  renderTotalFrames: 0,
  outputSkippedFrames: 0,
  outputTotalFrames: 0,
  webSocketSessionIncomingMessages: 0,
  webSocketSessionOutgoingMessages: 0,
});

export const dispatchRequest = (
  requestType: string,
  _requestData: Record<string, unknown> | undefined,
): { status: RequestStatus; responseData?: unknown } => {
  switch (requestType) {
    case 'GetVersion':
      return {
        status: { result: true, code: REQ_STATUS.Success },
        responseData: buildGetVersionResponse(),
      };
    case 'GetStats':
      return {
        status: { result: true, code: REQ_STATUS.Success },
        responseData: buildGetStatsResponse(),
      };
    case 'GetHotkeyList':
      return {
        status: { result: true, code: REQ_STATUS.Success },
        responseData: { hotkeys: [] as string[] },
      };
    default:
      return {
        status: {
          result: false,
          code: REQ_STATUS.NotImplemented,
          comment: `${requestType} is not implemented by the Blackout OBS-WS shim yet.`,
        },
      };
  }
};
