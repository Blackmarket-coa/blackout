import { spawn as nodeSpawn } from 'node:child_process';
import { db } from '../db/store';
import { decryptDestination } from './simulcastDestinations';
import { getOwncastOriginConfig } from '../integrations/owncast';
import { log } from '../telemetry/logger';

/**
 * Phase 1 / Track A backbone: RTMP fan-out worker.
 *
 * Per (creator, simulcast destination) row, runs an ffmpeg child
 * process that pulls the Blackout-side Owncast HLS feed for the
 * creator and copies it (no transcode by default — `-c copy`) to the
 * destination's RTMP URL with the stream key appended. Supervisor:
 * captures stderr lines, auto-restarts on unclean exit with capped
 * exponential backoff, surfaces last-error via `getStatus`.
 *
 * Process lifecycle is dependency-injected via {@link ProcessFactory}
 * so tests can drive the supervisor without spawning real ffmpegs.
 * Production calls `attachWithDefaults()` once at startup; the default
 * factory uses node:child_process.spawn to launch `ffmpeg`.
 *
 * Note: this layer doesn't mint Owncast keys or own destination CRUD —
 * it just consumes simulcast_destinations rows that the existing
 * services/simulcastDestinations service manages.
 */

// ----------------------------- public types ---------------------------------

export type FanoutStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'restarting'
  | 'stopped'
  | 'failed';

export interface FanoutSnapshot {
  destinationId: string;
  blackoutUserId: string;
  status: FanoutStatus;
  /** Number of consecutive automatic restarts. Resets to 0 on a clean stopFanout. */
  restartCount: number;
  /** Last stderr line we kept; useful for surfacing why a process died. */
  lastError?: string;
  /** ms-since-epoch of the most recent process spawn. */
  lastStartedAt?: number;
  /** ms-since-epoch of the most recent process exit. */
  lastExitedAt?: number;
  /** Most recent ffmpeg exit code. */
  lastExitCode?: number | null;
}

/**
 * Minimal child-process-handle surface the supervisor uses. Mirrors the
 * relevant subset of `node:child_process.ChildProcess` so node's spawn
 * is a drop-in default and tests can pass a fake.
 */
export interface ChildHandle {
  /** Send SIGTERM (or whichever signal the impl prefers). */
  kill(signal?: NodeJS.Signals): void;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  /** stderr is line-buffered by the supervisor; impls may emit chunks. */
  stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null;
}

export interface SpawnArgs {
  /** Resolved input HLS URL — e.g. `http://owncast/hls/stream.m3u8`. */
  input: string;
  /** Final RTMP target with stream key already appended. */
  target: string;
}

export type ProcessFactory = (args: SpawnArgs) => ChildHandle;

export interface AttachOptions {
  factory?: ProcessFactory;
  /**
   * The Blackout-side input URL the worker will instruct ffmpeg to read
   * from. Defaults to `${OWNCAST_BASE_URL}/hls/stream.m3u8`. Multi-creator
   * deployments will want to make this per-creator; for the MVP we
   * expose a global override.
   */
  inputUrl?: string;
  /** Override the auto-restart cap. Default: 5 consecutive restarts. */
  maxRestarts?: number;
  /** Backoff base ms. Default: 1000 (so 1s/2s/4s/8s/16s). */
  restartBaseMs?: number;
}

const DEFAULT_MAX_RESTARTS = 5;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const STDERR_TAIL_BYTES = 1024;

// ----------------------------- supervisor state ----------------------------

interface ManagedProcess {
  handle: ChildHandle;
  /** True between explicit stopFanout and the resulting 'exit'. */
  expectingExit: boolean;
  stderrBuf: string;
}

interface FanoutState {
  destinationId: string;
  blackoutUserId: string;
  status: FanoutStatus;
  restartCount: number;
  lastError?: string;
  lastStartedAt?: number;
  lastExitedAt?: number;
  lastExitCode?: number | null;
  /** Set while a process is alive. */
  proc?: ManagedProcess;
  /** Pending restart timer; cleared on stopFanout. */
  restartTimer?: NodeJS.Timeout;
}

const states = new Map<string, FanoutState>();
let factory: ProcessFactory = defaultFactory;
let inputUrl = `${getOwncastOriginConfig().origin}/hls/stream.m3u8`;
let maxRestarts = DEFAULT_MAX_RESTARTS;
let restartBaseMs = DEFAULT_BACKOFF_BASE_MS;

function defaultFactory(args: SpawnArgs): ChildHandle {
  // ffmpeg is the production tool. -re reads input at native rate so we
  // don't fast-forward through buffered HLS segments. -c copy forwards
  // codecs as-is, no transcode. -f flv produces an RTMP-compatible
  // container.
  const proc = nodeSpawn(
    'ffmpeg',
    ['-re', '-i', args.input, '-c', 'copy', '-f', 'flv', args.target],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return proc as unknown as ChildHandle;
}

// ----------------------------- public API ----------------------------------

export const attachRtmpFanoutWorker = (options: AttachOptions = {}): void => {
  if (options.factory) factory = options.factory;
  if (options.inputUrl) inputUrl = options.inputUrl;
  if (typeof options.maxRestarts === 'number') maxRestarts = options.maxRestarts;
  if (typeof options.restartBaseMs === 'number') restartBaseMs = options.restartBaseMs;
};

export type StartOutcome =
  | { kind: 'ok'; status: FanoutStatus }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'disabled' }
  | { kind: 'already_running' }
  | { kind: 'spawn_failed'; reason: string };

export const startFanout = (
  blackoutUserId: string,
  destinationId: string,
): StartOutcome => {
  const decrypted = decryptDestination(destinationId);
  if (!decrypted) return { kind: 'not_found' };
  if (decrypted.record.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  if (!decrypted.record.isEnabled) return { kind: 'disabled' };
  const existing = states.get(destinationId);
  if (existing && (existing.status === 'running' || existing.status === 'starting')) {
    return { kind: 'already_running' };
  }
  return spawnAndAttach(decrypted, /* isRestart */ false);
};

export type StopOutcome =
  | { kind: 'ok' }
  | { kind: 'not_running' }
  | { kind: 'forbidden' };

export const stopFanout = (
  blackoutUserId: string,
  destinationId: string,
): StopOutcome => {
  const state = states.get(destinationId);
  if (!state) return { kind: 'not_running' };
  if (state.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  // Cancel any pending auto-restart and gracefully stop a live process.
  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = undefined;
  }
  if (state.proc) {
    state.proc.expectingExit = true;
    try {
      state.proc.handle.kill('SIGTERM');
    } catch (err) {
      log.warn('rtmp_fanout_kill_threw', { destinationId, error: String(err) });
    }
  }
  state.status = 'stopped';
  state.restartCount = 0;
  return { kind: 'ok' };
};

/**
 * Boot-time hook: start fan-out for every enabled destination owned by
 * the creator. Called by the streaming module when a stream session is
 * created so a creator going live auto-fan-outs everywhere they enabled.
 */
export const startAllForUser = (blackoutUserId: string): {
  attempted: number;
  started: number;
} => {
  let attempted = 0;
  let started = 0;
  for (const dest of db.listSimulcastDestinationsForUser(blackoutUserId)) {
    if (!dest.isEnabled) continue;
    attempted += 1;
    const out = startFanout(blackoutUserId, dest.id);
    if (out.kind === 'ok' || out.kind === 'already_running') started += 1;
  }
  return { attempted, started };
};

export const stopAllForUser = (blackoutUserId: string): { stopped: number } => {
  let stopped = 0;
  for (const state of states.values()) {
    if (state.blackoutUserId !== blackoutUserId) continue;
    if (stopFanout(blackoutUserId, state.destinationId).kind === 'ok') stopped += 1;
  }
  return { stopped };
};

export const getStatus = (destinationId: string): FanoutSnapshot | undefined => {
  const s = states.get(destinationId);
  if (!s) return undefined;
  return projectSnapshot(s);
};

export const listForUser = (blackoutUserId: string): FanoutSnapshot[] =>
  [...states.values()]
    .filter((s) => s.blackoutUserId === blackoutUserId)
    .map(projectSnapshot);

const projectSnapshot = (s: FanoutState): FanoutSnapshot => ({
  destinationId: s.destinationId,
  blackoutUserId: s.blackoutUserId,
  status: s.status,
  restartCount: s.restartCount,
  lastError: s.lastError,
  lastStartedAt: s.lastStartedAt,
  lastExitedAt: s.lastExitedAt,
  lastExitCode: s.lastExitCode,
});

// ----------------------------- spawn + supervisor --------------------------

const buildTarget = (ingestUrl: string, streamKey: string): string => {
  // Most platforms accept `${ingest}/${key}`; some accept `?key=...`.
  // We follow the `${ingest}/${key}` convention because that's what
  // every major platform we care about (Twitch, YouTube, Kick) uses.
  const trimmed = ingestUrl.replace(/\/+$/, '');
  return `${trimmed}/${streamKey}`;
};

const spawnAndAttach = (
  decrypted: NonNullable<ReturnType<typeof decryptDestination>>,
  isRestart: boolean,
): StartOutcome => {
  const target = buildTarget(decrypted.record.ingestUrl, decrypted.streamKey);
  let handle: ChildHandle;
  try {
    handle = factory({ input: inputUrl, target });
  } catch (err) {
    const reason = String(err);
    const state: FanoutState = states.get(decrypted.record.id) ?? {
      destinationId: decrypted.record.id,
      blackoutUserId: decrypted.record.blackoutUserId,
      status: 'failed',
      restartCount: isRestart ? (states.get(decrypted.record.id)?.restartCount ?? 0) + 1 : 0,
    };
    state.status = 'failed';
    state.lastError = reason;
    states.set(state.destinationId, state);
    log.warn('rtmp_fanout_spawn_threw', { destinationId: decrypted.record.id, reason });
    return { kind: 'spawn_failed', reason };
  }
  const prior = states.get(decrypted.record.id);
  const state: FanoutState = prior ?? {
    destinationId: decrypted.record.id,
    blackoutUserId: decrypted.record.blackoutUserId,
    status: 'starting',
    restartCount: 0,
  };
  state.status = 'starting';
  state.lastStartedAt = Date.now();
  state.lastExitedAt = undefined;
  state.lastExitCode = undefined;
  state.proc = { handle, expectingExit: false, stderrBuf: '' };
  if (!isRestart) state.restartCount = 0;
  states.set(state.destinationId, state);

  // Promote 'starting' → 'running' on first stderr line (ffmpeg prints
  // banner immediately; if we see anything we're alive). This keeps the
  // status transition tiny and observable in tests.
  attachStderr(state);
  attachExit(state, decrypted);
  attachError(state);

  return { kind: 'ok', status: state.status };
};

const attachStderr = (state: FanoutState): void => {
  if (!state.proc) return;
  const proc = state.proc;
  proc.handle.stderr?.on('data', (chunk) => {
    if (state.status === 'starting') state.status = 'running';
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    proc.stderrBuf = (proc.stderrBuf + text).slice(-STDERR_TAIL_BYTES);
    state.lastError = proc.stderrBuf.trim().split('\n').slice(-1)[0] || state.lastError;
  });
};

const attachError = (state: FanoutState): void => {
  if (!state.proc) return;
  state.proc.handle.on('error', (err: Error) => {
    state.lastError = String(err);
    log.warn('rtmp_fanout_proc_error', {
      destinationId: state.destinationId,
      error: String(err),
    });
  });
};

const attachExit = (
  state: FanoutState,
  decrypted: NonNullable<ReturnType<typeof decryptDestination>>,
): void => {
  if (!state.proc) return;
  state.proc.handle.on('exit', (code) => {
    state.lastExitedAt = Date.now();
    state.lastExitCode = code ?? null;
    const wasExpected = state.proc?.expectingExit ?? false;
    state.proc = undefined;
    if (wasExpected) {
      state.status = 'stopped';
      return;
    }
    // Unclean exit. Auto-restart with capped exponential backoff.
    if (state.restartCount >= maxRestarts) {
      state.status = 'failed';
      log.warn('rtmp_fanout_exhausted_restarts', {
        destinationId: state.destinationId,
        lastExitCode: code,
      });
      return;
    }
    state.status = 'restarting';
    state.restartCount += 1;
    const backoff = Math.min(restartBaseMs * 2 ** (state.restartCount - 1), 60_000);
    state.restartTimer = setTimeout(() => {
      state.restartTimer = undefined;
      // Re-decrypt: the destination row could have been disabled or
      // deleted in the meantime.
      const fresh = decryptDestination(decrypted.record.id);
      if (!fresh || !fresh.record.isEnabled) {
        state.status = 'stopped';
        return;
      }
      spawnAndAttach(fresh, /* isRestart */ true);
    }, backoff);
    state.restartTimer?.unref?.();
  });
};

export const __test__ = {
  states,
  reset: () => {
    for (const s of states.values()) {
      if (s.restartTimer) clearTimeout(s.restartTimer);
      try {
        s.proc?.handle.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    states.clear();
    factory = defaultFactory;
    inputUrl = `${getOwncastOriginConfig().origin}/hls/stream.m3u8`;
    maxRestarts = DEFAULT_MAX_RESTARTS;
    restartBaseMs = DEFAULT_BACKOFF_BASE_MS;
  },
  setFactoryForTest: (f: ProcessFactory) => {
    factory = f;
  },
  setMaxRestartsForTest: (n: number) => {
    maxRestarts = n;
  },
  setRestartBaseMsForTest: (n: number) => {
    restartBaseMs = n;
  },
  buildTarget,
};
