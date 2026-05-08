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
 * The full request matrix maps the OBS-WS request names creators actually
 * push from Stream Deck buttons (StartStream, StopStream,
 * SetCurrentProgramScene, ...) onto Blackout-native primitives. The
 * dispatcher takes a {@link RequestContext} so the server can inject
 * the live `streamCommands` interface without the protocol layer
 * importing `db`.
 *
 * Unimplemented requests return NotImplemented (204) with a comment so
 * creators see exactly which buttons aren't wired up yet.
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
  availableRequests: [
    'GetVersion',
    'GetStats',
    'GetHotkeyList',
    'GetStreamStatus',
    'StartStream',
    'StopStream',
    'ToggleStream',
    'GetSceneList',
    'GetCurrentProgramScene',
    'SetCurrentProgramScene',
    'BroadcastCustomEvent',
    'SetInputMute',
    'GetInputMute',
    'ToggleInputMute',
  ],
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

/**
 * Stream-control surface the server injects into the dispatcher. Keeping
 * this an interface (vs a direct `db` import) means the protocol layer
 * stays transport- AND state-free, so unit tests can stub the commands
 * with a tiny in-memory mock.
 */
export interface StreamCommands {
  /** Returns the creator's current stream lifecycle state. */
  getStreamStatus(blackoutUserId: string): {
    /** Whether a session is currently active (created and not ended). */
    outputActive: boolean;
    /** Active session id if outputActive, else undefined. */
    sessionId?: string;
    /** Owning streamId of the active session (or the creator's default stream). */
    streamId?: string;
    /** ms since session start; 0 when offline. */
    outputDuration: number;
  };
  /**
   * Idempotent. If a session is already active, returns it; otherwise
   * starts one against the creator's default stream record.
   */
  startStream(blackoutUserId: string): { ok: true; sessionId: string } | { ok: false; reason: string };
  /** Idempotent: ends any active session for the creator. */
  stopStream(blackoutUserId: string): { ok: true; ended: boolean };
}

/**
 * Async command surface for the SetInputMute / GetInputMute /
 * ToggleInputMute request types. Production wires this through to
 * `services/livekitAdmin.ts`; tests inject a stub.
 *
 * The dispatcher returns a Promise when it routes through here so the
 * server module awaits before serializing the request response.
 */
export type MuteOutcome =
  | { kind: 'ok'; muted: boolean }
  | { kind: 'unknown_input' }
  | { kind: 'no_active_voice_room' }
  | { kind: 'no_publish_track' };

export interface MuteCommands {
  setInputMute(blackoutUserId: string, inputName: string, muted: boolean): Promise<MuteOutcome>;
  getInputMute(blackoutUserId: string, inputName: string): Promise<MuteOutcome>;
  toggleInputMute(blackoutUserId: string, inputName: string): Promise<MuteOutcome>;
}

export interface RequestContext {
  blackoutUserId: string;
  commands: StreamCommands;
  /**
   * Optional — populated when the server module wired the LiveKit
   * admin path. When absent (older shim build / test that didn't
   * inject it) the mute requests fall back to NotImplemented 204.
   */
  muteCommands?: MuteCommands;
}

const successResp = (responseData?: unknown) => ({
  status: { result: true, code: REQ_STATUS.Success },
  responseData,
});

const failResp = (code: number, comment: string) => ({
  status: { result: false, code, comment },
});

const SCENE_LIVE = 'Live' as const;
const SCENE_OFFLINE = 'Offline' as const;

const currentSceneFromStatus = (active: boolean): string =>
  active ? SCENE_LIVE : SCENE_OFFLINE;

/**
 * REQ_STATUS code we use to surface "valid request, but the creator's
 * environment isn't ready" — currently only returned when the mute
 * path can't find an active LiveKit voice room. OBS-WS doesn't define
 * a dedicated code for this so we reuse 409 (the spec's
 * `ResourceNotConfigured` slot).
 */
const NO_ACTIVE_VOICE_ROOM = 409;

export type DispatchResult = { status: RequestStatus; responseData?: unknown };

const muteOutcomeToResult = (outcome: MuteOutcome, requestType: string): DispatchResult => {
  switch (outcome.kind) {
    case 'ok':
      return successResp({ inputMuted: outcome.muted });
    case 'unknown_input':
      return failResp(
        REQ_STATUS.NotImplemented,
        `${requestType} only supports inputs Mic / Microphone / Desktop Audio in the Blackout shim.`,
      );
    case 'no_active_voice_room':
      return failResp(
        NO_ACTIVE_VOICE_ROOM,
        'No active LiveKit voice room for this creator — join a voice channel first.',
      );
    case 'no_publish_track':
      return failResp(
        NO_ACTIVE_VOICE_ROOM,
        'Creator is not currently publishing a microphone track in their voice room.',
      );
  }
};

export const dispatchRequest = (
  requestType: string,
  requestData: Record<string, unknown> | undefined,
  ctx: RequestContext,
): DispatchResult | Promise<DispatchResult> => {
  switch (requestType) {
    case 'GetVersion':
      return successResp(buildGetVersionResponse());

    case 'GetStats':
      return successResp(buildGetStatsResponse());

    case 'GetHotkeyList':
      return successResp({ hotkeys: [] as string[] });

    case 'GetStreamStatus': {
      const s = ctx.commands.getStreamStatus(ctx.blackoutUserId);
      return successResp({
        outputActive: s.outputActive,
        outputReconnecting: false,
        outputTimecode: '00:00:00.000',
        outputDuration: s.outputDuration,
        outputCongestion: 0,
        outputBytes: 0,
        outputSkippedFrames: 0,
        outputTotalFrames: 0,
      });
    }

    case 'StartStream': {
      const out = ctx.commands.startStream(ctx.blackoutUserId);
      if (!out.ok) {
        return failResp(REQ_STATUS.NotReady, out.reason);
      }
      return successResp();
    }

    case 'StopStream': {
      ctx.commands.stopStream(ctx.blackoutUserId);
      return successResp();
    }

    case 'ToggleStream': {
      const before = ctx.commands.getStreamStatus(ctx.blackoutUserId);
      if (before.outputActive) {
        ctx.commands.stopStream(ctx.blackoutUserId);
        return successResp({ outputActive: false });
      }
      const out = ctx.commands.startStream(ctx.blackoutUserId);
      if (!out.ok) return failResp(REQ_STATUS.NotReady, out.reason);
      return successResp({ outputActive: true });
    }

    case 'GetSceneList': {
      const s = ctx.commands.getStreamStatus(ctx.blackoutUserId);
      const current = currentSceneFromStatus(s.outputActive);
      return successResp({
        // OBS-WS represents scenes as `{sceneName, sceneIndex}` pairs.
        // We expose two virtual scenes — Live and Offline — so a generic
        // SetCurrentProgramScene button drives the creator's go-live
        // state without a custom integration.
        currentProgramSceneName: current,
        currentPreviewSceneName: null,
        scenes: [
          { sceneName: SCENE_LIVE, sceneIndex: 0 },
          { sceneName: SCENE_OFFLINE, sceneIndex: 1 },
        ],
      });
    }

    case 'GetCurrentProgramScene': {
      const s = ctx.commands.getStreamStatus(ctx.blackoutUserId);
      return successResp({
        currentProgramSceneName: currentSceneFromStatus(s.outputActive),
        sceneName: currentSceneFromStatus(s.outputActive), // OBS sends both
      });
    }

    case 'SetCurrentProgramScene': {
      const name = (requestData?.sceneName as string | undefined)?.trim();
      if (name === SCENE_LIVE) {
        const out = ctx.commands.startStream(ctx.blackoutUserId);
        if (!out.ok) return failResp(REQ_STATUS.NotReady, out.reason);
        return successResp();
      }
      if (name === SCENE_OFFLINE) {
        ctx.commands.stopStream(ctx.blackoutUserId);
        return successResp();
      }
      return failResp(
        REQ_STATUS.InvalidRequestField,
        `sceneName must be "${SCENE_LIVE}" or "${SCENE_OFFLINE}"; got ${JSON.stringify(name)}`,
      );
    }

    case 'SetInputMute': {
      if (!ctx.muteCommands) {
        return failResp(REQ_STATUS.NotImplemented, 'Mute commands are not wired in this build.');
      }
      const inputName = (requestData?.inputName as string | undefined)?.trim();
      const inputMuted = requestData?.inputMuted;
      if (!inputName || typeof inputMuted !== 'boolean') {
        return failResp(
          REQ_STATUS.MissingRequestField,
          'SetInputMute requires { inputName: string, inputMuted: boolean }',
        );
      }
      return ctx.muteCommands
        .setInputMute(ctx.blackoutUserId, inputName, inputMuted)
        .then((outcome) => muteOutcomeToResult(outcome, 'SetInputMute'));
    }

    case 'GetInputMute': {
      if (!ctx.muteCommands) {
        return failResp(REQ_STATUS.NotImplemented, 'Mute commands are not wired in this build.');
      }
      const inputName = (requestData?.inputName as string | undefined)?.trim();
      if (!inputName) {
        return failResp(REQ_STATUS.MissingRequestField, 'GetInputMute requires { inputName: string }');
      }
      return ctx.muteCommands
        .getInputMute(ctx.blackoutUserId, inputName)
        .then((outcome) => muteOutcomeToResult(outcome, 'GetInputMute'));
    }

    case 'ToggleInputMute': {
      if (!ctx.muteCommands) {
        return failResp(REQ_STATUS.NotImplemented, 'Mute commands are not wired in this build.');
      }
      const inputName = (requestData?.inputName as string | undefined)?.trim();
      if (!inputName) {
        return failResp(
          REQ_STATUS.MissingRequestField,
          'ToggleInputMute requires { inputName: string }',
        );
      }
      return ctx.muteCommands
        .toggleInputMute(ctx.blackoutUserId, inputName)
        .then((outcome) => muteOutcomeToResult(outcome, 'ToggleInputMute'));
    }

    case 'BroadcastCustomEvent': {
      // OBS surfaces use this to fan out arbitrary events to other
      // OBS-WS clients connected to the same server. We accept the
      // payload, log it, and treat it as a no-op for now — real fan-out
      // requires a per-creator subscriber registry, which lives in the
      // server module (server.ts) and not here.
      const payload = requestData?.eventData;
      if (payload !== undefined && (typeof payload !== 'object' || payload === null)) {
        return failResp(
          REQ_STATUS.InvalidRequestField,
          'eventData must be an object',
        );
      }
      return successResp();
    }

    default:
      return failResp(
        REQ_STATUS.NotImplemented,
        `${requestType} is not implemented by the Blackout OBS-WS shim yet.`,
      );
  }
};

export const __test__ = { SCENE_LIVE, SCENE_OFFLINE };
