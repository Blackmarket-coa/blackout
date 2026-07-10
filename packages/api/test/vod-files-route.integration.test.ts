import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const storageDir = mkdtempSync(join(tmpdir(), 'blackout-vod-route-'));
process.env.BLACKOUT_VOD_STORAGE_DIR = storageDir;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');

const FILE_BYTES = '0123456789';

function seedVod(visibility: 'public' | 'private' = 'public', withFile = true): string {
    const streamId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.upsertStream({
        id: streamId,
        creatorId: '@creator:test',
        state: 'offline',
        title: 'Recorded stream',
        tags: [],
        visibility,
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
        createdAt: now,
        updatedAt: now,
    });
    db.createStreamSession({ id: sessionId, streamId, startedAt: now });
    db.endStreamSession(sessionId, `/v1/streaming/vod-files/${sessionId}`);
    if (withFile) writeFileSync(join(storageDir, `${sessionId}.mp4`), FILE_BYTES);
    return sessionId;
}

void test('serves the full recording with mp4 headers', async () => {
    const sessionId = seedVod();
    const response = await app.request(`/v1/streaming/vod-files/${sessionId}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-length'), String(FILE_BYTES.length));
    assert.equal(await response.text(), FILE_BYTES);
});

void test('honors bounded Range requests with 206 + Content-Range', async () => {
    const sessionId = seedVod();
    const response = await app.request(`/v1/streaming/vod-files/${sessionId}`, {
        headers: { range: 'bytes=2-5' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes 2-5/${FILE_BYTES.length}`);
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(await response.text(), '2345');
});

void test('honors suffix Range requests', async () => {
    const sessionId = seedVod();
    const response = await app.request(`/v1/streaming/vod-files/${sessionId}`, {
        headers: { range: 'bytes=-4' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes 6-9/${FILE_BYTES.length}`);
    assert.equal(await response.text(), '6789');
});

void test('rejects unsatisfiable ranges with 416', async () => {
    const sessionId = seedVod();
    const response = await app.request(`/v1/streaming/vod-files/${sessionId}`, {
        headers: { range: 'bytes=50-60' },
    });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), `bytes */${FILE_BYTES.length}`);
});

void test('404s for non-public streams, unknown sessions, and missing files', async () => {
    const privateSession = seedVod('private');
    const fileless = seedVod('public', false);
    for (const path of [
        `/v1/streaming/vod-files/${privateSession}`,
        `/v1/streaming/vod-files/${fileless}`,
        `/v1/streaming/vod-files/${crypto.randomUUID()}`,
        '/v1/streaming/vod-files/..%2F..%2Fetc%2Fpasswd',
    ]) {
        const response = await app.request(path);
        assert.equal(response.status, 404, `expected 404 for ${path}`);
    }
});
