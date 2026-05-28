/**
 * Dead drop appservice (Node.js).
 *
 * HTTP API (v1, equal-shape design — see SecureDrop Protocol):
 *
 *   POST /v1/deaddrop/send    { roomId, envelope }
 *     → { ok, dropId, clue }
 *   POST /v1/deaddrop/fetch   { roomId, clue }
 *     → { envelopes: [...real + decoys], decoyCount }
 *   POST /v1/deaddrop/open    { roomId, dropId, clue }
 *     → { ok, deleted }
 *
 * Legacy queue API (still wired for the existing scheduled-flush flow):
 *   GET  /health
 *   POST /configure | /ingest | /flush | /clear
 *
 * Security invariants enforced here:
 *  - Server only ever stores opaque ciphertext envelopes; any submission
 *    containing extra fields is rejected with 400.
 *  - Recipient identity is never written to disk — drops are keyed by
 *    a clue (HKDF-derived 16-byte token).
 *  - Every fetch returns a configurable number of decoy envelopes with
 *    structurally indistinguishable shape; defaults to 0 for backward
 *    compatibility (the SDK chooses based on the requesting tier).
 *  - Expired drops are swept on every fetch and on a periodic timer.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { isOpaqueEnvelope } from './envelope.mjs';
import { DeadDropStore } from './storage.mjs';
import { generateDecoy } from './decoys.mjs';

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_DECOYS = Number(process.env.BLACKOUT_DEADDROP_DECOYS || 0);
const SWEEP_INTERVAL_MS = Number(process.env.BLACKOUT_DEADDROP_SWEEP_MS || 60_000);
const DEADDROP_API_TOKEN = process.env.BLACKOUT_DEADDROP_API_TOKEN || null;
const MAX_BODY_BYTES = 1_048_576; // 1 MB

const store = new DeadDropStore();

/** @type {Map<string, { config: any, queue: Array<any>, lastFlushAt?: number, lastCronMinute?: number }>} */
const roomState = new Map();

const getRoomBucket = (roomId) => {
    const existing = roomState.get(roomId);
    if (existing) return existing;
    const created = {
        config: {
            enabled: false,
            schedule: { type: 'interval', intervalMinutes: 60 },
            anonymize: false,
            maxQueueSize: 100,
            retentionHours: 48,
        },
        queue: [],
    };
    roomState.set(roomId, created);
    return created;
};

const sendJson = (res, code, payload) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
};

const v1ApiTokenAuth = (req) => {
    if (!DEADDROP_API_TOKEN) return true;
    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return false;
    const expected = Buffer.from(DEADDROP_API_TOKEN);
    const provided = Buffer.from(token);
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
};

/* ------------------------ Legacy queue helpers ------------------------ */

const flushRoom = async (roomId) => {
    const bucket = getRoomBucket(roomId);
    if (!bucket.config.enabled || bucket.queue.length === 0) return { delivered: 0 };

    const toDeliver = bucket.queue.splice(0, bucket.queue.length);
    for (const queued of toDeliver) {
        const sender = bucket.config.anonymize
            ? process.env.DEAD_DROP_BOT_USER_ID ?? '@deaddrop-bot:example.org'
            : queued.sender;
        // Replace with Matrix client `sendEvent` in production.
        console.log('[dead-drop] delivering', {
            roomId,
            sender,
            body: queued.content?.body,
            queuedAt: queued.queuedAt,
        });
    }
    return { delivered: toDeliver.length };
};

const runSchedulerTick = async () => {
    const now = Date.now();
    for (const [roomId, bucket] of roomState.entries()) {
        if (!bucket.config.enabled) continue;
        if (bucket.config.schedule.type === 'manual') continue;
        if (bucket.config.schedule.type === 'interval') {
            const intervalMinutes = Math.max(1, Number(bucket.config.schedule.intervalMinutes || 60));
            const intervalMs = intervalMinutes * 60_000;
            const due = bucket.lastFlushAt ? now - bucket.lastFlushAt >= intervalMs : true;
            if (due) {
                await flushRoom(roomId);
                bucket.lastFlushAt = now;
            }
            continue;
        }
        if (bucket.config.schedule.type === 'cron') {
            const currentMinute = new Date(now).getMinutes();
            if (currentMinute === 0 && bucket.lastCronMinute !== 0) {
                await flushRoom(roomId);
            }
            bucket.lastCronMinute = currentMinute;
        }
    }
};

setInterval(() => void runSchedulerTick(), 1_000);
setInterval(() => store.sweepExpired(), SWEEP_INTERVAL_MS);

/* ----------------------------- v1 handlers ---------------------------- */

const ciphertextBytesFromEnvelope = (envelope) => {
    // Decoys must match real envelope ct length exactly. Real ct is
    // base64-encoded; decoys fill `bucketBytes + 16` raw bytes.
    const padding = envelope.ct.endsWith('==') ? 2 : envelope.ct.endsWith('=') ? 1 : 0;
    return (envelope.ct.length / 4) * 3 - padding;
};

const handleSend = async (body) => {
    const { roomId, envelope } = body;
    if (typeof roomId !== 'string' || roomId.length === 0) {
        return { code: 400, body: { error: 'roomId is required' } };
    }
    if (!isOpaqueEnvelope(envelope)) {
        return {
            code: 400,
            body: {
                error: 'invalid envelope',
                detail: 'envelope must contain exactly the published opaque-ciphertext fields',
            },
        };
    }
    if (Date.parse(envelope.expiresAt) <= Date.now()) {
        return { code: 400, body: { error: 'envelope already expired' } };
    }
    try {
        store.insertDrop(envelope);
    } catch (e) {
        return { code: 409, body: { error: e.message } };
    }
    return {
        code: 200,
        body: { ok: true, dropId: envelope.dropId, clue: envelope.clue },
    };
};

const handleFetch = async (body) => {
    const { roomId, clue, decoyCount } = body;
    if (typeof roomId !== 'string' || typeof clue !== 'string') {
        return { code: 400, body: { error: 'roomId and clue are required' } };
    }
    const real = store.fetchByClue(clue);
    const desiredDecoys = Math.max(0, Number.isFinite(decoyCount) ? Number(decoyCount) : DEFAULT_DECOYS);
    const seed = store.getOrCreateDecoySeed(roomId);
    const decoys = [];
    if (desiredDecoys > 0) {
        const refBytes = real[0]
            ? ciphertextBytesFromEnvelope(real[0]) - 16 // subtract AEAD tag
            : 1024;
        const refPad = real[0]?.pad ?? 'minimal';
        const refExp = real[0]?.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString();
        for (let i = 0; i < desiredDecoys; i += 1) {
            decoys.push(
                generateDecoy({
                    seed,
                    counter: Date.now() * 1000 + i, // unique per fetch tick
                    bucketBytes: Math.max(1, refBytes),
                    paddingStrategy: refPad,
                    expiresAt: refExp,
                })
            );
        }
    }
    // Shuffle so position doesn't reveal real-vs-decoy.
    const all = [...real, ...decoys];
    for (let i = all.length - 1; i > 0; i -= 1) {
        const randBytes = crypto.randomBytes(4);
        const j = (randBytes.readUInt32BE(0) >>> 0) % (i + 1);
        [all[i], all[j]] = [all[j], all[i]];
    }
    return { code: 200, body: { envelopes: all, decoyCount: decoys.length } };
};

const handleOpen = async (body) => {
    const { roomId, clue } = body;
    if (typeof roomId !== 'string' || typeof clue !== 'string') {
        return { code: 400, body: { error: 'roomId and clue are required' } };
    }
    const deleted = store.deleteByClue(clue);
    return { code: 200, body: { ok: true, deleted } };
};

/* ----------------------------- HTTP server ---------------------------- */

const readBody = (req) =>
    new Promise((resolve, reject) => {
        let data = Buffer.alloc(0);
        let bytesRead = 0;
        req.on('data', (chunk) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytesRead += buf.length;
            if (bytesRead > MAX_BODY_BYTES) {
                req.destroy();
                reject(new Error('payload too large'));
                return;
            }
            data = Buffer.concat([data, buf]);
        });
        req.on('end', () => resolve(data.toString()));
        req.on('error', reject);
    });

const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
        sendJson(res, 400, { error: 'bad request' });
        return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' });
        return;
    }

    let payload = {};
    try {
        const raw = await readBody(req);
        payload = raw ? JSON.parse(raw) : {};
    } catch {
        sendJson(res, 400, { error: 'invalid JSON' });
        return;
    }

    if (url.pathname.startsWith('/v1/deaddrop/')) {
        if (!v1ApiTokenAuth(req)) {
            sendJson(res, 401, { error: 'unauthorized', detail: 'Bearer token required' });
            return;
        }
    }

    try {
        if (url.pathname === '/v1/deaddrop/send') {
            const r = await handleSend(payload);
            sendJson(res, r.code, r.body);
            return;
        }
        if (url.pathname === '/v1/deaddrop/fetch') {
            const r = await handleFetch(payload);
            sendJson(res, r.code, r.body);
            return;
        }
        if (url.pathname === '/v1/deaddrop/open') {
            const r = await handleOpen(payload);
            sendJson(res, r.code, r.body);
            return;
        }

        // Legacy queue API
        const roomId = payload.roomId;
        if (typeof roomId !== 'string' || roomId.length === 0) {
            sendJson(res, 400, { error: 'roomId is required' });
            return;
        }
        const bucket = getRoomBucket(roomId);

        if (url.pathname === '/configure') {
            bucket.config = { ...bucket.config, ...payload.config };
            sendJson(res, 200, { ok: true, config: bucket.config });
            return;
        }
        if (url.pathname === '/ingest') {
            if (!bucket.config.enabled) {
                sendJson(res, 200, { queued: false, reason: 'dead drop disabled' });
                return;
            }
            if (bucket.queue.length >= bucket.config.maxQueueSize) {
                sendJson(res, 429, { error: 'max queue size reached' });
                return;
            }
            bucket.queue.push({
                sender: payload.sender,
                content: payload.content,
                queuedAt: Date.now(),
                condition: payload.condition || null,
            });
            sendJson(res, 200, { queued: true, queueCount: bucket.queue.length });
            return;
        }
        if (url.pathname === '/flush') {
            const result = await flushRoom(roomId);
            sendJson(res, 200, { ok: true, ...result, queueCount: bucket.queue.length });
            return;
        }
        if (url.pathname === '/clear') {
            bucket.queue.splice(0, bucket.queue.length);
            sendJson(res, 200, { ok: true, queueCount: 0 });
            return;
        }

        sendJson(res, 404, { error: 'not found' });
    } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : 'unknown error' });
    }
});

if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`[dead-drop-appservice] listening on :${PORT}`);
    });
}

export { server, store, generateDecoy, isOpaqueEnvelope };
