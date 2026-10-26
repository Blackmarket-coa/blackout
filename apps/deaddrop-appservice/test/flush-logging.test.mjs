/**
 * The legacy queue's flush logged each queued message's body and sender
 * (`src/index.mjs`, `flushRoom`) until 2026-10-25. A log line may say that
 * something was delivered and how big it was; never what it said or who said
 * it (docs/security/api-findings-triage-2026-10-25.md, finding 4).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DEADDROP_DB_MODE = 'memory';

const { server } = await import('../src/index.mjs');

let baseUrl;
before(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise((resolve) => server.close(resolve));
});

const post = async (path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
};

/** Run `fn` with console.log captured; returns everything it logged, flattened. */
const captureLogs = async (fn) => {
    const lines = [];
    const original = console.log;
    console.log = (...args) => {
        lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
        await fn();
    } finally {
        console.log = original;
    }
    return lines;
};

test('flushing a room logs byte lengths, never the message text or the sender', async () => {
    const roomId = '!flush-logging:test.local';
    const sender = '@whistleblower:test.local';
    const body = 'the meeting is at the old mill at midnight';

    const configured = await post('/configure', {
        roomId,
        config: { enabled: true, schedule: { type: 'manual' } },
    });
    assert.equal(configured.status, 200);
    const ingested = await post('/ingest', { roomId, sender, content: { body } });
    assert.equal(ingested.status, 200);
    assert.equal(ingested.body.queued, true);

    let flushed;
    const logs = await captureLogs(async () => {
        flushed = await post('/flush', { roomId });
    });
    assert.equal(flushed.status, 200);
    assert.equal(flushed.body.delivered, 1);

    const delivering = logs.filter((line) => line.includes('[dead-drop] delivering'));
    assert.equal(delivering.length, 1, 'one delivery line');
    const joined = logs.join('\n');
    assert.ok(!joined.includes(body), 'the message text is not logged');
    assert.ok(!joined.includes('old mill'), 'no fragment of it either');
    assert.ok(!joined.includes(sender), 'the sender is not logged');
    assert.ok(!joined.includes('whistleblower'), 'nor the sender localpart');
    assert.ok(
        delivering[0].includes(`"bodyBytes":${Buffer.byteLength(body, 'utf8')}`),
        'the byte length is'
    );
});

test('an anonymized room logs no sender either, and no bot id in its place', async () => {
    const roomId = '!flush-anon:test.local';
    process.env.DEAD_DROP_BOT_USER_ID = '@deaddrop-bot:test.local';
    await post('/configure', {
        roomId,
        config: { enabled: true, anonymize: true, schedule: { type: 'manual' } },
    });
    await post('/ingest', { roomId, sender: '@someone:test.local', content: { body: 'hush' } });

    const logs = await captureLogs(async () => {
        await post('/flush', { roomId });
    });
    const joined = logs.join('\n');
    assert.ok(joined.includes('"anonymized":true'));
    assert.ok(!joined.includes('@someone:test.local'));
    assert.ok(!joined.includes('@deaddrop-bot:test.local'));
    assert.ok(!joined.includes('hush'));
});
