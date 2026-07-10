import { spawn as nodeSpawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/store';
import { getOwncastOriginConfig } from '../integrations/owncast';
import { log } from '../telemetry/logger';

/**
 * Phase-1 VOD recorder (OSS gap-fill WS2): per live stream session, one
 * ffmpeg child copies the Owncast HLS feed into an mp4 on local disk. On a
 * clean stop (session ended → SIGTERM → ffmpeg finalizes the container) the
 * session's `replayPointer` is set to the serving route automatically, which
 * is what makes the Replays tab real instead of pointer-by-hand.
 *
 * Mirrors rtmpFanoutWorker's dependency-injected ProcessFactory so tests
 * drive the lifecycle without spawning real ffmpegs. Deliberately NO
 * auto-restart in Phase 1: a mid-stream ffmpeg death would truncate and then
 * overwrite the output file — better to keep the partial recording and log.
 *
 * A client-supplied replayPointer (POST/PATCH session) always wins; the
 * recorder only fills the pointer when the session doesn't have one.
 */

export type RecorderStatus = 'recording' | 'stopping' | 'completed' | 'failed' | 'stopped';

export interface RecorderSnapshot {
    sessionId: string;
    streamId: string;
    status: RecorderStatus;
    lastError?: string;
    startedAtMs?: number;
    exitedAtMs?: number;
    exitCode?: number | null;
}

export interface RecorderSpawnArgs {
    /** HLS input, e.g. `http://owncast:8080/hls/stream.m3u8`. */
    input: string;
    /** Absolute mp4 output path. */
    outputPath: string;
}

export interface RecorderChildHandle {
    kill(signal?: NodeJS.Signals): void;
    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    on(event: 'error', listener: (err: Error) => void): void;
    stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null;
}

export type RecorderProcessFactory = (args: RecorderSpawnArgs) => RecorderChildHandle;

const STDERR_TAIL_BYTES = 1024;

interface RecorderState {
    sessionId: string;
    streamId: string;
    status: RecorderStatus;
    handle?: RecorderChildHandle;
    expectingExit: boolean;
    stderrTail: string;
    startedAtMs?: number;
    exitedAtMs?: number;
    exitCode?: number | null;
}

const states = new Map<string, RecorderState>();
let factory: RecorderProcessFactory = defaultFactory;

function defaultFactory(args: RecorderSpawnArgs): RecorderChildHandle {
    // -c copy: no transcode — persist the broadcast as-is. +faststart moves
    // the moov atom to the front on finalize so browsers can seek immediately.
    const proc = nodeSpawn(
        'ffmpeg',
        ['-i', args.input, '-c', 'copy', '-movflags', '+faststart', '-y', args.outputPath],
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    return proc as unknown as RecorderChildHandle;
}

/** Test hook / production default override. */
export const attachVodRecorder = (options: { factory?: RecorderProcessFactory } = {}): void => {
    factory = options.factory ?? defaultFactory;
};

export const isVodRecordingEnabled = (): boolean => process.env.BLACKOUT_VOD_RECORDING === '1';

export const vodStorageDir = (): string =>
    process.env.BLACKOUT_VOD_STORAGE_DIR?.trim() || '/var/lib/blackout/vods';

export const vodFilePathForSession = (sessionId: string): string =>
    join(vodStorageDir(), `${sessionId}.mp4`);

/** Same-origin route the client can hand straight to a <video>/iframe src. */
export const vodReplayPointer = (sessionId: string): string =>
    `/v1/streaming/vod-files/${sessionId}`;

const finalizeRecording = (state: RecorderState): void => {
    const outputPath = vodFilePathForSession(state.sessionId);
    let hasOutput = false;
    try {
        hasOutput = statSync(outputPath).size > 0;
    } catch {
        hasOutput = false;
    }
    if (!hasOutput) {
        state.status = 'failed';
        state.stderrTail ||= 'recording produced no output file';
        log.warn('vod_recorder_no_output', { sessionId: state.sessionId, outputPath });
        return;
    }

    state.status = 'completed';
    const session = db.getStreamSession(state.sessionId);
    // A pointer set by the creator (external VOD host) always wins.
    if (session && !session.replayPointer) {
        const pointer = vodReplayPointer(state.sessionId);
        db.endStreamSession(state.sessionId, pointer);
        const stream = db.getStream(state.streamId);
        if (stream && !stream.replayPointer) {
            db.upsertStream({ ...stream, replayPointer: pointer });
        }
        log.info('vod_recorder_replay_registered', { sessionId: state.sessionId, pointer });
    }
};

export type StartRecordingResult =
    | { started: true }
    | { started: false; reason: 'disabled' | 'already_recording' | 'spawn_failed' };

export const startVodRecording = (sessionId: string, streamId: string): StartRecordingResult => {
    if (!isVodRecordingEnabled()) return { started: false, reason: 'disabled' };
    const existing = states.get(sessionId);
    if (existing && (existing.status === 'recording' || existing.status === 'stopping')) {
        return { started: false, reason: 'already_recording' };
    }

    const state: RecorderState = {
        sessionId,
        streamId,
        status: 'recording',
        expectingExit: false,
        stderrTail: '',
    };

    try {
        mkdirSync(vodStorageDir(), { recursive: true });
        const handle = factory({
            input: `${getOwncastOriginConfig().origin.replace(/\/+$/, '')}/hls/stream.m3u8`,
            outputPath: vodFilePathForSession(sessionId),
        });
        state.handle = handle;
        state.startedAtMs = Date.now();

        handle.stderr?.on('data', (chunk) => {
            state.stderrTail = (state.stderrTail + String(chunk)).slice(-STDERR_TAIL_BYTES);
        });
        handle.on('error', (err) => {
            state.status = 'failed';
            state.stderrTail = String(err);
            log.warn('vod_recorder_process_error', { sessionId, error: String(err) });
        });
        handle.on('exit', (code) => {
            state.exitedAtMs = Date.now();
            state.exitCode = code;
            if (state.expectingExit) {
                // ffmpeg exits non-zero (255) on signal-driven graceful shutdown;
                // the output file is the real success signal, not the exit code.
                finalizeRecording(state);
            } else {
                state.status = 'failed';
                log.warn('vod_recorder_unexpected_exit', {
                    sessionId,
                    code,
                    stderrTail: state.stderrTail,
                });
            }
        });
    } catch (err) {
        log.warn('vod_recorder_spawn_failed', { sessionId, error: String(err) });
        return { started: false, reason: 'spawn_failed' };
    }

    states.set(sessionId, state);
    log.info('vod_recorder_started', { sessionId, streamId });
    return { started: true };
};

export const stopVodRecording = (sessionId: string): { stopped: boolean } => {
    const state = states.get(sessionId);
    if (!state || !state.handle || state.status !== 'recording') return { stopped: false };
    state.expectingExit = true;
    state.status = 'stopping';
    // SIGTERM triggers ffmpeg's graceful shutdown: it finalizes the mp4
    // (writes the moov atom) before exiting, which -movflags +faststart needs.
    state.handle.kill('SIGTERM');
    return { stopped: true };
};

export const getVodRecorderSnapshot = (sessionId: string): RecorderSnapshot | undefined => {
    const state = states.get(sessionId);
    if (!state) return undefined;
    return {
        sessionId: state.sessionId,
        streamId: state.streamId,
        status: state.status,
        lastError: state.stderrTail || undefined,
        startedAtMs: state.startedAtMs,
        exitedAtMs: state.exitedAtMs,
        exitCode: state.exitCode,
    };
};

export const resetVodRecorderForTest = (): void => {
    for (const state of states.values()) {
        state.expectingExit = true;
        state.handle?.kill('SIGTERM');
    }
    states.clear();
    factory = defaultFactory;
};
