/**
 * Durability + store-delegation coverage for the mesh relay store-and-forward
 * queue (M17). It used to live in a module-level array wiped on every restart;
 * now it goes through the runtime store. Part A exercises enqueue/drain/cap via
 * the memory-mode singleton; Part B proves the FileBackedDb persist/hydrate
 * wiring survives a reload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.BLACKOUT_DB_FILE = join(tmpdir(), `mesh-dur-${randomUUID()}.json`);

const { db, FileBackedDb } = await import('../src/db/store');
const mesh = await import('../src/services/meshRelay');

// ---------------------------------------------------------------------------
// Part A — enqueue + drain + gossip through the durable store (memory mode)
// ---------------------------------------------------------------------------

test('enqueue persists into the runtime store and is delivered by recipient', () => {
    mesh.__resetMeshForTest();
    const env = mesh.enqueueEnvelope({
        sender: '@a:server',
        recipient: '@b:server',
        payload: 'ct',
        ttlSeconds: 3600,
    });
    assert.equal(mesh.meshStoreSize(), 1);
    assert.deepEqual(
        db.listMeshEnvelopes().map((e) => e.id),
        [env.id]
    );
    assert.ok(mesh.listForRecipient('@b:server').some((e) => e.id === env.id));
});

test('syncWithPeer drains the merged set back into the store', () => {
    mesh.__resetMeshForTest();
    mesh.enqueueEnvelope({ sender: '@a:server', recipient: '@x:server', payload: 'seed' });
    const peerEnv = {
        id: `peer-${randomUUID()}`,
        sender: '@p:server',
        recipient: '@q:server',
        payload: 'from-peer',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        hopCount: 1,
        maxHops: 8,
        seenBy: ['peerNode'],
    };
    const res = mesh.syncWithPeer('peerNode', [peerEnv]);
    assert.equal(res.accepted, 1);
    assert.ok(db.listMeshEnvelopes().some((e) => e.id === peerEnv.id));
});

test('enqueue cap evicts the oldest beyond MESH_MAX_STORE', () => {
    mesh.__resetMeshForTest();
    let first = '';
    for (let i = 0; i < 10_001; i++) {
        const e = mesh.enqueueEnvelope({ sender: 's', recipient: 'r', payload: String(i) });
        if (i === 0) first = e.id;
    }
    assert.equal(mesh.meshStoreSize(), 10_000);
    assert.ok(!db.listMeshEnvelopes().some((e) => e.id === first));
});

// ---------------------------------------------------------------------------
// Part B — durability across a FileBackedDb reload
// ---------------------------------------------------------------------------

test('mesh envelopes survive a FileBackedDb reload', () => {
    const a = new FileBackedDb();
    const env = {
        id: randomUUID(),
        sender: '@a:server',
        recipient: '@b:server',
        payload: 'durable-ct',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        hopCount: 0,
        maxHops: 8,
        seenBy: ['server'],
    };
    a.enqueueMeshEnvelope(env); // persist() writes to the temp BLACKOUT_DB_FILE
    const b = new FileBackedDb(); // constructor hydrate() reloads the temp file
    assert.ok(b.listMeshEnvelopes().some((e) => e.id === env.id && e.payload === 'durable-ct'));
});

test.after(() => {
    try {
        rmSync(process.env.BLACKOUT_DB_FILE!, { force: true });
    } catch {
        /* best effort */
    }
});
