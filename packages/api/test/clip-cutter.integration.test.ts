import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunProcessArgs } from '../src/services/clipCutterWorker';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.CLIP_WRITE_RATE_LIMIT_MAX = process.env.CLIP_WRITE_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const storageDir = mkdtempSync(join(tmpdir(), 'blackout-clips-'));
process.env.BLACKOUT_VOD_STORAGE_DIR = storageDir;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { attachClipCutter, clipCaptionsFilePath } = await import('../src/services/clipCutterWorker');

const runs: RunProcessArgs[] = [];
type RunBehavior = (args: RunProcessArgs) => { exitCode: number | null };
let behavior: RunBehavior = defaultBehavior;

function outputPathOf(args: RunProcessArgs): string {
    return args.args[args.args.length - 1]!;
}

function defaultBehavior(args: RunProcessArgs): { exitCode: number | null } {
    if (args.command === 'ffmpeg') {
        // Cut and wav-extract both write their last argument.
        writeFileSync(outputPathOf(args), 'fake-media-bytes');
        return { exitCode: 0 };
    }
    // whisper: writes `${--output-file}.vtt`
    const ofIndex = args.args.indexOf('--output-file');
    writeFileSync(`${args.args[ofIndex + 1]}.vtt`, 'WEBVTT\n\n00:00.000 --> 00:01.000\nhi\n');
    return { exitCode: 0 };
}

function resetAll(): void {
    runs.length = 0;
    behavior = defaultBehavior;
    delete process.env.BLACKOUT_CLIP_CAPTIONS;
    delete process.env.WHISPER_CPP_MODEL;
    attachClipCutter({
        runner: async (args) => {
            runs.push(args);
            return behavior(args);
        },
    });
}

async function issueToken(): Promise<{ token: string; userId: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: `cutter-user-${suffix}`,
            email: `cutter-user-${suffix}@example.com`,
            password: 'test-password',
        }),
    });
    assert.equal(response.status, 201);
    return (await response.json()) as { token: string; userId: string };
}

function seedEndedSession(creatorId: string, withRecording = true) {
    const streamId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.upsertStream({
        id: streamId,
        creatorId,
        state: 'offline',
        title: 'Recorded stream',
        tags: [],
        visibility: 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
        createdAt: now,
        updatedAt: now,
    });
    db.createStreamSession({ id: sessionId, streamId, startedAt: now });
    db.endStreamSession(sessionId);
    if (withRecording) {
        mkdirSync(storageDir, { recursive: true });
        writeFileSync(join(storageDir, `${sessionId}.mp4`), 'fake-recording-bytes');
    }
    return { streamId, sessionId };
}

const cutBody = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ title: 'Best moment', startSeconds: 30, durationSeconds: 60, ...overrides });

async function waitForCaptions(clipId: string): Promise<string | undefined> {
    for (let i = 0; i < 50; i++) {
        const pointer = db.getClip(clipId)?.captionsPointer;
        if (pointer) return pointer;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return undefined;
}

void test('cuts a clip from an ended session and serves it with Range support', async () => {
    resetAll();
    const { token, userId } = await issueToken();
    const { streamId, sessionId } = seedEndedSession(userId);

    const response = await app.request(
        `/v1/streaming/streams/${streamId}/sessions/${sessionId}/clips`,
        {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: cutBody(),
        }
    );
    assert.equal(response.status, 201);
    const clip = (await response.json()) as {
        id: string;
        mediaPointer: string;
        durationSeconds: number;
        sourceStreamId: string;
        captionsPointer?: string;
    };
    assert.equal(clip.mediaPointer, `/v1/streaming/clip-files/${clip.id}`);
    assert.equal(clip.durationSeconds, 60);
    assert.equal(clip.sourceStreamId, streamId);
    assert.equal(clip.captionsPointer, undefined);

    const ffmpegRun = runs.find((run) => run.command === 'ffmpeg');
    assert.ok(ffmpegRun);
    assert.deepEqual(ffmpegRun!.args.slice(0, 2), ['-ss', '30']);
    assert.ok(ffmpegRun!.args.includes('-t') && ffmpegRun!.args.includes('60'));
    // Captions are off — only the cut ran.
    assert.equal(runs.length, 1);

    const full = await app.request(`/v1/streaming/clip-files/${clip.id}`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'video/mp4');
    assert.equal(await full.text(), 'fake-media-bytes');

    const partial = await app.request(`/v1/streaming/clip-files/${clip.id}`, {
        headers: { range: 'bytes=0-3' },
    });
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), 'fake');
});

void test('generates whisper captions in the background when enabled', async () => {
    resetAll();
    process.env.BLACKOUT_CLIP_CAPTIONS = '1';
    process.env.WHISPER_CPP_MODEL = '/models/ggml-base.bin';
    const { token, userId } = await issueToken();
    const { streamId, sessionId } = seedEndedSession(userId);

    const response = await app.request(
        `/v1/streaming/streams/${streamId}/sessions/${sessionId}/clips`,
        {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: cutBody(),
        }
    );
    assert.equal(response.status, 201);
    const clip = (await response.json()) as { id: string };

    const pointer = await waitForCaptions(clip.id);
    assert.equal(pointer, `/v1/streaming/clip-files/${clip.id}/captions`);

    const whisperRun = runs.find((run) => run.command !== 'ffmpeg' || run.args.includes('-ar'));
    assert.ok(whisperRun, 'expected an audio-extract or whisper run');
    assert.ok(runs.some((run) => run.args.includes('--output-vtt')));

    const captions = await app.request(`/v1/streaming/clip-files/${clip.id}/captions`);
    assert.equal(captions.status, 200);
    assert.equal(captions.headers.get('content-type'), 'text/vtt');
    assert.ok((await captions.text()).startsWith('WEBVTT'));
});

void test('rejects cuts from live sessions, foreign streams, and bad bodies', async () => {
    resetAll();
    const { token, userId } = await issueToken();
    const other = await issueToken();

    const live = seedEndedSession(userId);
    const liveSessionId = crypto.randomUUID();
    db.createStreamSession({
        id: liveSessionId,
        streamId: live.streamId,
        startedAt: new Date().toISOString(),
    });
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const stillLive = await app.request(
        `/v1/streaming/streams/${live.streamId}/sessions/${liveSessionId}/clips`,
        { method: 'POST', headers, body: cutBody() }
    );
    assert.equal(stillLive.status, 409);

    const foreign = await app.request(
        `/v1/streaming/streams/${live.streamId}/sessions/${live.sessionId}/clips`,
        {
            method: 'POST',
            headers: {
                authorization: `Bearer ${other.token}`,
                'content-type': 'application/json',
            },
            body: cutBody(),
        }
    );
    assert.equal(foreign.status, 403);

    const tooLong = await app.request(
        `/v1/streaming/streams/${live.streamId}/sessions/${live.sessionId}/clips`,
        { method: 'POST', headers, body: cutBody({ durationSeconds: 600 }) }
    );
    assert.equal(tooLong.status, 400);
    assert.equal(runs.length, 0);
});

void test('404s when the session has no recording; 422 when ffmpeg fails', async () => {
    resetAll();
    const { token, userId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const bare = seedEndedSession(userId, false);
    const missing = await app.request(
        `/v1/streaming/streams/${bare.streamId}/sessions/${bare.sessionId}/clips`,
        { method: 'POST', headers, body: cutBody() }
    );
    assert.equal(missing.status, 404);
    assert.equal(((await missing.json()) as { code: string }).code, 'recording_missing');

    const recorded = seedEndedSession(userId);
    behavior = () => ({ exitCode: 1 });
    const failed = await app.request(
        `/v1/streaming/streams/${recorded.streamId}/sessions/${recorded.sessionId}/clips`,
        { method: 'POST', headers, body: cutBody() }
    );
    assert.equal(failed.status, 422);
    assert.equal(((await failed.json()) as { code: string }).code, 'cut_failed');
});

void test('caption sidecars for unknown or private clips are not served', async () => {
    resetAll();
    const response = await app.request(`/v1/streaming/clip-files/${crypto.randomUUID()}/captions`);
    assert.equal(response.status, 404);

    // A private clip with a real sidecar on disk must still 404.
    const clipId = crypto.randomUUID();
    db.upsertClip({
        id: clipId,
        creatorId: '@creator:test',
        title: 'private clip',
        mediaPointer: `/v1/streaming/clip-files/${clipId}`,
        durationSeconds: 10,
        visibility: 'private',
        tags: [],
    });
    mkdirSync(join(storageDir, 'clips'), { recursive: true });
    writeFileSync(clipCaptionsFilePath(clipId), 'WEBVTT\n');
    const priv = await app.request(`/v1/streaming/clip-files/${clipId}/captions`);
    assert.equal(priv.status, 404);
});
