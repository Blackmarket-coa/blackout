import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RecorderChildHandle, RecorderSpawnArgs } from '../src/services/vodRecorderWorker';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.OWNCAST_BASE_URL = process.env.OWNCAST_BASE_URL ?? 'http://owncast.test:8080';

const storageDir = mkdtempSync(join(tmpdir(), 'blackout-vods-'));
process.env.BLACKOUT_VOD_STORAGE_DIR = storageDir;
process.env.BLACKOUT_VOD_RECORDING = '1';

const {
    attachVodRecorder,
    startVodRecording,
    stopVodRecording,
    getVodRecorderSnapshot,
    resetVodRecorderForTest,
    vodFilePathForSession,
    vodReplayPointer,
} = await import('../src/services/vodRecorderWorker');
const { db } = await import('../src/db/store');

type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;

class FakeChild implements RecorderChildHandle {
    kills: Array<NodeJS.Signals | undefined> = [];
    private exitListeners: ExitListener[] = [];
    stderr = { on: () => undefined };
    kill(signal?: NodeJS.Signals): void {
        this.kills.push(signal);
    }
    on(event: 'exit' | 'error', listener: ExitListener | ((err: Error) => void)): void {
        if (event === 'exit') this.exitListeners.push(listener as ExitListener);
    }
    emitExit(code: number | null): void {
        for (const listener of this.exitListeners) listener(code, null);
    }
}

const spawns: Array<{ args: RecorderSpawnArgs; child: FakeChild }> = [];

function resetAll(): void {
    resetVodRecorderForTest();
    spawns.length = 0;
    process.env.BLACKOUT_VOD_RECORDING = '1';
    attachVodRecorder({
        factory: (args) => {
            const child = new FakeChild();
            spawns.push({ args, child });
            return child;
        },
    });
}

function seedSession(options: { replayPointer?: string; visibility?: 'public' | 'private' } = {}) {
    const streamId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.upsertStream({
        id: streamId,
        creatorId: '@creator:test',
        state: 'live',
        title: 'Test stream',
        tags: [],
        visibility: options.visibility ?? 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
        createdAt: now,
        updatedAt: now,
    });
    db.createStreamSession({
        id: sessionId,
        streamId,
        startedAt: now,
        replayPointer: options.replayPointer,
    });
    return { streamId, sessionId };
}

void test('recording is a no-op when BLACKOUT_VOD_RECORDING is off', () => {
    resetAll();
    delete process.env.BLACKOUT_VOD_RECORDING;
    const result = startVodRecording(crypto.randomUUID(), crypto.randomUUID());
    assert.deepEqual(result, { started: false, reason: 'disabled' });
    assert.equal(spawns.length, 0);
});

void test('clean stop finalizes the mp4 and registers the replay pointer', () => {
    resetAll();
    const { streamId, sessionId } = seedSession();

    const result = startVodRecording(sessionId, streamId);
    assert.deepEqual(result, { started: true });
    assert.equal(spawns.length, 1);
    assert.ok(spawns[0]!.args.input.endsWith('/hls/stream.m3u8'));
    assert.equal(spawns[0]!.args.outputPath, vodFilePathForSession(sessionId));

    // Simulate ffmpeg writing the recording, then a graceful signal exit
    // (ffmpeg exits 255 on SIGTERM — the file, not the code, is the signal).
    writeFileSync(spawns[0]!.args.outputPath, 'fake-mp4-bytes');
    assert.deepEqual(stopVodRecording(sessionId), { stopped: true });
    assert.deepEqual(spawns[0]!.child.kills, ['SIGTERM']);
    spawns[0]!.child.emitExit(255);

    assert.equal(getVodRecorderSnapshot(sessionId)?.status, 'completed');
    assert.equal(db.getStreamSession(sessionId)?.replayPointer, vodReplayPointer(sessionId));
    assert.equal(db.getStream(streamId)?.replayPointer, vodReplayPointer(sessionId));
});

void test('a creator-supplied replay pointer is never overwritten', () => {
    resetAll();
    const { streamId, sessionId } = seedSession({ replayPointer: 'https://cdn.example/vod.m3u8' });

    startVodRecording(sessionId, streamId);
    writeFileSync(spawns[0]!.args.outputPath, 'fake-mp4-bytes');
    stopVodRecording(sessionId);
    spawns[0]!.child.emitExit(255);

    assert.equal(db.getStreamSession(sessionId)?.replayPointer, 'https://cdn.example/vod.m3u8');
});

void test('an unexpected mid-stream exit marks the recording failed without a pointer', () => {
    resetAll();
    const { streamId, sessionId } = seedSession();

    startVodRecording(sessionId, streamId);
    spawns[0]!.child.emitExit(1);

    assert.equal(getVodRecorderSnapshot(sessionId)?.status, 'failed');
    assert.equal(db.getStreamSession(sessionId)?.replayPointer, undefined);
});

void test('a clean stop with no output file is a failure, not a dead pointer', () => {
    resetAll();
    const { streamId, sessionId } = seedSession();

    startVodRecording(sessionId, streamId);
    rmSync(vodFilePathForSession(sessionId), { force: true });
    stopVodRecording(sessionId);
    spawns[0]!.child.emitExit(255);

    assert.equal(getVodRecorderSnapshot(sessionId)?.status, 'failed');
    assert.equal(db.getStreamSession(sessionId)?.replayPointer, undefined);
});
