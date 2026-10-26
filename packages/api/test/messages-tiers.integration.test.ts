/**
 * What the message endpoint's tiers do, and what it says about them. Until
 * 2026-10-25 tier 2 XOR-ed the text with a server-minted per-account string
 * and labelled the row `e2e`, `sign: true` stored a URL-encoded copy of the
 * text as a "signature", and `isEncrypted` was true for tiers 2 and 3. None
 * of that was encryption or a signature
 * (docs/security/api-findings-triage-2026-10-25.md, finding 3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
delete process.env.STEGO_KEY;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { decodeStego } = await import('@blackout/core');

const seedUser = () => {
    const id = randomUUID();
    const username = `tier-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'a-server-minted-random-string',
    });
    return db.getUserById(id)!;
};

const auth = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
    'content-type': 'application/json',
});

const post = (channelId: string, body: Record<string, unknown>, headers: Record<string, string>) =>
    app.request(`/v1/messages/${channelId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

const list = async (channelId: string, headers: Record<string, string>) =>
    (await (await app.request(`/v1/messages/${channelId}`, { headers })).json()) as Array<
        Record<string, unknown>
    >;

const storedIn = (channelId: string) =>
    [...db.messages.values()].filter((m) => m.channelId === channelId);

test('tier 2 stores the text as written and claims no encryption', async () => {
    const a = seedUser();
    const channelId = `tier2-${randomUUID().slice(0, 8)}`;
    const res = await post(channelId, { content: 'as written', stegoTier: 2 }, auth(a));
    assert.equal(res.status, 201);
    const { message } = (await res.json()) as { message: Record<string, unknown> };
    assert.equal(message.content, 'as written');
    assert.equal(message.contentStegoTier, 2);
    assert.equal(message.isEncrypted, false);
    assert.equal('encryptionAlgorithm' in message, false);
    assert.equal('signature' in message, false);
    assert.ok(!JSON.stringify(message).includes('e2e'), 'no end-to-end claim anywhere');

    const [row] = storedIn(channelId);
    assert.equal(row.content, 'as written');
    assert.equal(row.isEncrypted, false);
    assert.equal(row.encryptionAlgorithm, undefined);
});

test('tier 3 scrambles the stored text with the server key and claims no encryption', async () => {
    const a = seedUser();
    const channelId = `tier3-${randomUUID().slice(0, 8)}`;
    const res = await post(channelId, { content: 'scramble me', stegoTier: 3 }, auth(a));
    assert.equal(res.status, 201);
    const { message } = (await res.json()) as { message: Record<string, unknown> };
    assert.notEqual(message.content, 'scramble me');
    // The server holds the key, so the server can undo it; nobody else can.
    assert.equal(decodeStego(message.content as string, 'local-stego-key'), 'scramble me');
    assert.equal(message.contentStegoTier, 3);
    assert.equal(message.isEncrypted, false);
    assert.equal('encryptionAlgorithm' in message, false);
});

test('tier 1 is unchanged: stored as written, no claims', async () => {
    const a = seedUser();
    const channelId = `tier1-${randomUUID().slice(0, 8)}`;
    const res = await post(channelId, { content: 'plain' }, auth(a));
    assert.equal(res.status, 201);
    const { message } = (await res.json()) as { message: Record<string, unknown> };
    assert.equal(message.content, 'plain');
    assert.equal(message.contentStegoTier, 1);
    assert.equal(message.isEncrypted, false);
});

test('asking for a signature is refused rather than answered with a fake, and nothing is stored', async () => {
    const a = seedUser();
    const channelId = `sign-${randomUUID().slice(0, 8)}`;
    const res = await post(channelId, { content: 'sign this', sign: true }, auth(a));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, 'signing_unavailable');
    assert.equal(storedIn(channelId).length, 0);

    // `sign: false`, which older clients send, is still fine.
    const ok = await post(channelId, { content: 'unsigned', sign: false }, auth(a));
    assert.equal(ok.status, 201);
});

test('rows written before 2026-10-25 are read back without their encryption labels', async () => {
    const a = seedUser();
    const channelId = `legacy-${randomUUID().slice(0, 8)}`;
    db.createMessage({
        id: randomUUID(),
        channelId,
        userId: a.id,
        content: 'xor-ed%20bytes',
        contentStegoTier: 2,
        signature: `${a.id}%3Aplaintext`,
        isEncrypted: true,
        encryptionAlgorithm: 'e2e',
    });
    db.createMessage({
        id: randomUUID(),
        channelId,
        userId: a.id,
        content: 'other%20bytes',
        contentStegoTier: 3,
        isEncrypted: true,
        encryptionAlgorithm: 'steganography',
    });

    const rows = await list(channelId, auth(a));
    assert.equal(rows.length, 2);
    for (const row of rows) {
        assert.equal(row.isEncrypted, false);
        assert.equal('encryptionAlgorithm' in row, false);
    }
    // The stored text is left as it is: the tier number still says what shape it has.
    assert.deepEqual(rows.map((r) => [r.contentStegoTier, r.content]).sort(), [
        [2, 'xor-ed%20bytes'],
        [3, 'other%20bytes'],
    ]);
    assert.ok(!JSON.stringify(rows).includes('"e2e"'));
});
