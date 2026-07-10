import { spawn as nodeSpawn } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/store';
import { log } from '../telemetry/logger';
import { vodFilePathForSession, vodStorageDir } from './vodRecorderWorker';

/**
 * WS3 clip tooling, server side. Two jobs built on the WS2 session
 * recordings:
 *
 *  - cutClipFromRecording: ffmpeg stream-copy (`-ss/-t -c copy`) of a segment
 *    out of an ended session's mp4 into a per-clip file. Keyframe-aligned and
 *    near-instant because nothing is re-encoded.
 *  - generateClipCaptions: whisper.cpp over the cut clip's audio → a WebVTT
 *    sidecar, attached to the clip record as `captionsPointer`. Opt-in
 *    (BLACKOUT_CLIP_CAPTIONS=1 + a model on disk) and fire-and-forget: caption
 *    failure never fails the clip.
 *
 * Both spawn through an injectable runner (same philosophy as
 * rtmpFanoutWorker/vodRecorderWorker) so tests never exec real binaries.
 */

export interface RunProcessArgs {
    command: string;
    args: string[];
}

export type ProcessRunner = (args: RunProcessArgs) => Promise<{ exitCode: number | null }>;

const defaultRunner: ProcessRunner = ({ command, args }) =>
    new Promise((resolve, reject) => {
        const proc = nodeSpawn(command, args, { stdio: ['ignore', 'ignore', 'ignore'] });
        proc.on('error', reject);
        proc.on('exit', (code) => resolve({ exitCode: code }));
    });

let runner: ProcessRunner = defaultRunner;

/** Test hook / production default override. */
export const attachClipCutter = (options: { runner?: ProcessRunner } = {}): void => {
    runner = options.runner ?? defaultRunner;
};

export const clipStorageDir = (): string => join(vodStorageDir(), 'clips');

export const clipFilePath = (clipId: string): string => join(clipStorageDir(), `${clipId}.mp4`);

export const clipCaptionsFilePath = (clipId: string): string =>
    join(clipStorageDir(), `${clipId}.vtt`);

/** Same-origin routes a <video>/<track> src can consume without headers. */
export const clipMediaPointer = (clipId: string): string => `/v1/streaming/clip-files/${clipId}`;
export const clipCaptionsPointer = (clipId: string): string =>
    `/v1/streaming/clip-files/${clipId}/captions`;

export const MAX_CLIP_DURATION_SECONDS = 180;

const hasNonEmptyFile = (path: string): boolean => {
    try {
        return statSync(path).size > 0;
    } catch {
        return false;
    }
};

export type CutResult =
    | { ok: true; filePath: string }
    | { ok: false; reason: 'recording_missing' | 'cut_failed' };

/**
 * Cut `[startSeconds, startSeconds + durationSeconds)` from the session's
 * recording into the clip's own mp4. Resolves once ffmpeg exits — stream-copy
 * cuts of ≤3 minutes complete in well under a second.
 */
export const cutClipFromRecording = async (input: {
    sessionId: string;
    clipId: string;
    startSeconds: number;
    durationSeconds: number;
}): Promise<CutResult> => {
    const recordingPath = vodFilePathForSession(input.sessionId);
    if (!hasNonEmptyFile(recordingPath)) return { ok: false, reason: 'recording_missing' };

    mkdirSync(clipStorageDir(), { recursive: true });
    const outputPath = clipFilePath(input.clipId);
    try {
        // -ss before -i seeks on the demuxer (fast); -c copy keeps the cut
        // keyframe-aligned and transcode-free; +faststart for instant playback.
        const { exitCode } = await runner({
            command: 'ffmpeg',
            args: [
                '-ss',
                String(input.startSeconds),
                '-i',
                recordingPath,
                '-t',
                String(input.durationSeconds),
                '-c',
                'copy',
                '-movflags',
                '+faststart',
                '-y',
                outputPath,
            ],
        });
        if (exitCode !== 0 || !hasNonEmptyFile(outputPath)) {
            log.warn('clip_cut_failed', { clipId: input.clipId, exitCode });
            rmSync(outputPath, { force: true });
            return { ok: false, reason: 'cut_failed' };
        }
    } catch (err) {
        log.warn('clip_cut_spawn_failed', { clipId: input.clipId, error: String(err) });
        return { ok: false, reason: 'cut_failed' };
    }
    return { ok: true, filePath: outputPath };
};

export const areClipCaptionsEnabled = (): boolean =>
    process.env.BLACKOUT_CLIP_CAPTIONS === '1' && Boolean(process.env.WHISPER_CPP_MODEL?.trim());

/**
 * whisper.cpp caption pass for a cut clip: extract 16 kHz mono wav (the input
 * whisper.cpp expects), transcribe with `--output-vtt`, attach the sidecar to
 * the clip record. Any failure logs and leaves the clip caption-less.
 */
export const generateClipCaptions = async (clipId: string): Promise<boolean> => {
    if (!areClipCaptionsEnabled()) return false;
    const model = process.env.WHISPER_CPP_MODEL!.trim();
    const whisperBin = process.env.WHISPER_CPP_BIN?.trim() || 'whisper-cli';
    const mediaPath = clipFilePath(clipId);
    if (!hasNonEmptyFile(mediaPath)) return false;

    const wavPath = join(clipStorageDir(), `${clipId}.wav`);
    const vttBase = join(clipStorageDir(), clipId); // whisper appends .vtt itself
    try {
        const audio = await runner({
            command: 'ffmpeg',
            args: ['-i', mediaPath, '-ar', '16000', '-ac', '1', '-f', 'wav', '-y', wavPath],
        });
        if (audio.exitCode !== 0) {
            log.warn('clip_captions_audio_extract_failed', { clipId, exitCode: audio.exitCode });
            return false;
        }
        const whisper = await runner({
            command: whisperBin,
            args: ['-m', model, '-f', wavPath, '--output-vtt', '--output-file', vttBase],
        });
        if (whisper.exitCode !== 0 || !hasNonEmptyFile(clipCaptionsFilePath(clipId))) {
            log.warn('clip_captions_whisper_failed', { clipId, exitCode: whisper.exitCode });
            return false;
        }
    } catch (err) {
        log.warn('clip_captions_spawn_failed', { clipId, error: String(err) });
        return false;
    } finally {
        rmSync(wavPath, { force: true });
    }

    db.updateClip(clipId, { captionsPointer: clipCaptionsPointer(clipId) });
    log.info('clip_captions_generated', { clipId });
    return true;
};
