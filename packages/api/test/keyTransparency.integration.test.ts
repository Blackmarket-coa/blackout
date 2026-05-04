import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
    KeyTransparencyLog,
    ed25519Witness,
    encodeEntry,
    leafHash,
    nodeHash,
    nullWitness,
    verifyInclusion,
    verifySignedTreeHead,
    __test__,
} from '../src/services/keyTransparency';
import {
    InMemoryKtStorage,
    JsonFileKtStorage,
} from '../src/services/keyTransparencyStorage';

const fakeEntry = (i: number) => ({
    userId: `@user${i}:example`,
    masterKey: `mk-${i}`,
    publishedAt: 1_700_000_000_000 + i,
});

test('empty log root has size 0', () => {
    const log = new KeyTransparencyLog();
    const root = log.root();
    assert.equal(root.treeSize, 0);
    assert.equal(typeof root.rootHash, 'string');
});

test('append assigns sequential leaf indexes', () => {
    const log = new KeyTransparencyLog();
    const a = log.append(fakeEntry(0));
    const b = log.append(fakeEntry(1));
    const c = log.append(fakeEntry(2));
    assert.equal(a.leafIndex, 0);
    assert.equal(b.leafIndex, 1);
    assert.equal(c.leafIndex, 2);
});

test('root changes after every append', () => {
    const log = new KeyTransparencyLog();
    const r0 = log.root().rootHash;
    log.append(fakeEntry(0));
    const r1 = log.root().rootHash;
    log.append(fakeEntry(1));
    const r2 = log.root().rootHash;
    assert.notEqual(r0, r1);
    assert.notEqual(r1, r2);
});

test('single-leaf root equals SHA-256(0x00 || leaf)', () => {
    const log = new KeyTransparencyLog();
    log.append(fakeEntry(7));
    const expected = leafHash(encodeEntry(fakeEntry(7))).toString('base64url');
    assert.equal(log.root().rootHash, expected);
});

test('two-leaf root equals SHA-256(0x01 || leaf0 || leaf1)', () => {
    const log = new KeyTransparencyLog();
    log.append(fakeEntry(0));
    log.append(fakeEntry(1));
    const l0 = leafHash(encodeEntry(fakeEntry(0)));
    const l1 = leafHash(encodeEntry(fakeEntry(1)));
    const expected = nodeHash(l0, l1).toString('base64url');
    assert.equal(log.root().rootHash, expected);
});

test('inclusion proof verifies for every leaf in a 7-element log', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 7; i++) log.append(fakeEntry(i));
    const root = log.root();
    for (let i = 0; i < 7; i++) {
        const proof = log.inclusionProof(i);
        assert.equal(verifyInclusion(proof, root), true, `leaf ${i} should verify`);
    }
});

test('inclusion proof verifies for a 100-element log', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 100; i++) log.append(fakeEntry(i));
    const root = log.root();
    for (const idx of [0, 1, 2, 7, 16, 31, 32, 63, 64, 99]) {
        const proof = log.inclusionProof(idx);
        assert.equal(verifyInclusion(proof, root), true, `leaf ${idx} should verify`);
    }
});

test('inclusion proof does NOT verify against a wrong root', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 5; i++) log.append(fakeEntry(i));
    const proof = log.inclusionProof(2);
    const fakeRoot = { treeSize: proof.treeSize, rootHash: 'A'.repeat(43) };
    assert.equal(verifyInclusion(proof, fakeRoot), false);
});

test('inclusion proof does NOT verify if treeSize is tampered', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 5; i++) log.append(fakeEntry(i));
    const root = log.root();
    const proof = log.inclusionProof(2);
    assert.equal(verifyInclusion({ ...proof, treeSize: 999 }, root), false);
});

test('inclusion proof rejects out-of-range leafIndex', () => {
    const log = new KeyTransparencyLog();
    log.append(fakeEntry(0));
    assert.throws(() => log.inclusionProof(1), /out of range/);
    assert.throws(() => log.inclusionProof(-1), /out of range/);
});

test('consistency proof is empty for fromSize == 0', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 5; i++) log.append(fakeEntry(i));
    const proof = log.consistencyProof(0, 5);
    assert.deepEqual(proof.nodes, []);
});

test('consistency proof is empty when fromSize == toSize', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 5; i++) log.append(fakeEntry(i));
    const proof = log.consistencyProof(3, 3);
    assert.deepEqual(proof.nodes, []);
});

test('consistency proof is non-empty for partial growth', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 8; i++) log.append(fakeEntry(i));
    const proof = log.consistencyProof(3, 8);
    assert.ok(proof.nodes.length > 0);
});

test('largestPowerOfTwoLessThan honors RFC 6962 split rule', () => {
    assert.equal(__test__.largestPowerOfTwoLessThan(2), 1);
    assert.equal(__test__.largestPowerOfTwoLessThan(3), 2);
    assert.equal(__test__.largestPowerOfTwoLessThan(4), 2);
    assert.equal(__test__.largestPowerOfTwoLessThan(5), 4);
    assert.equal(__test__.largestPowerOfTwoLessThan(8), 4);
    assert.equal(__test__.largestPowerOfTwoLessThan(9), 8);
});

test('findEntriesByUser returns every leaf for that user', () => {
    const log = new KeyTransparencyLog();
    log.append({ userId: '@a:s', masterKey: 'k1', publishedAt: 1 });
    log.append({ userId: '@b:s', masterKey: 'k2', publishedAt: 2 });
    log.append({ userId: '@a:s', masterKey: 'k3', publishedAt: 3 });
    const entries = log.findEntriesByUser('@a:s');
    assert.equal(entries.length, 2);
    assert.equal(entries[0].leafIndex, 0);
    assert.equal(entries[1].leafIndex, 2);
});

test('inclusion proof tampering: corrupting an audit-path node fails verification', () => {
    const log = new KeyTransparencyLog();
    for (let i = 0; i < 6; i++) log.append(fakeEntry(i));
    const root = log.root();
    const proof = log.inclusionProof(3);
    if (proof.auditPath.length > 0) {
        const corrupted = {
            ...proof,
            auditPath: [...proof.auditPath.slice(0, -1), 'A'.repeat(43)],
        };
        assert.equal(verifyInclusion(corrupted, root), false);
    }
});

test('JsonFileKtStorage round-trips leaves through the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kt-storage-'));
    const path = join(dir, 'kt.json');
    try {
        const storage = new JsonFileKtStorage(path);
        const log = new KeyTransparencyLog({ storage });
        for (let i = 0; i < 4; i++) log.append(fakeEntry(i));
        const rootBefore = log.root();

        // Re-open: the leaves should be hydrated and the root must match.
        const storage2 = new JsonFileKtStorage(path);
        const log2 = new KeyTransparencyLog({ storage: storage2 });
        assert.equal(log2.size(), 4);
        assert.deepEqual(log2.root(), rootBefore);

        // The persisted file is a small JSON document with a stable shape.
        const persisted = JSON.parse(readFileSync(path, 'utf8'));
        assert.equal(persisted.version, 1);
        assert.equal(persisted.entries.length, 4);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('JsonFileKtStorage rejects a corrupted file rather than silently truncating', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kt-storage-'));
    const path = join(dir, 'kt.json');
    try {
        writeFileSync(path, '{"version":42,"entries":[]}', 'utf8');
        assert.throws(() => new JsonFileKtStorage(path), /unrecognised/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('JsonFileKtStorage continues to grow the log across multiple appends', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kt-storage-'));
    const path = join(dir, 'kt.json');
    try {
        const log = new KeyTransparencyLog({ storage: new JsonFileKtStorage(path) });
        log.append(fakeEntry(0));
        log.append(fakeEntry(1));
        // Reopen and append more
        const log2 = new KeyTransparencyLog({ storage: new JsonFileKtStorage(path) });
        log2.append(fakeEntry(2));
        const persisted = JSON.parse(readFileSync(path, 'utf8'));
        assert.equal(persisted.entries.length, 3);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('InMemoryKtStorage isolates state across instances', () => {
    const a = new InMemoryKtStorage();
    const b = new InMemoryKtStorage();
    a.append({ userId: '@a:s', masterKey: 'k', publishedAt: 1 });
    assert.equal(a.load().length, 1);
    assert.equal(b.load().length, 0);
});

test('nullWitness produces an unsigned STH that verifySignedTreeHead accepts as such', () => {
    const log = new KeyTransparencyLog({ witness: nullWitness });
    log.append(fakeEntry(0));
    const sth = log.signedTreeHead();
    assert.equal(sth.scheme, 'none');
    assert.equal(sth.signature, '');
    assert.equal(sth.witnessKey, '');
    assert.equal(verifySignedTreeHead(sth), true);
});

test('ed25519Witness produces an STH that verifySignedTreeHead accepts', () => {
    const seed = randomBytes(32);
    const witness = ed25519Witness(seed);
    const log = new KeyTransparencyLog({ witness });
    log.append(fakeEntry(0));
    log.append(fakeEntry(1));
    const sth = log.signedTreeHead();
    assert.equal(sth.scheme, 'ed25519');
    assert.notEqual(sth.witnessKey, '');
    assert.notEqual(sth.signature, '');
    assert.equal(verifySignedTreeHead(sth), true);
});

test('verifySignedTreeHead rejects a tampered signature', () => {
    const witness = ed25519Witness(randomBytes(32));
    const log = new KeyTransparencyLog({ witness });
    log.append(fakeEntry(0));
    const sth = log.signedTreeHead();
    const tampered = { ...sth, rootHash: 'A'.repeat(43) };
    assert.equal(verifySignedTreeHead(tampered), false);
});

test('verifySignedTreeHead rejects a witness-key swap', () => {
    const witnessA = ed25519Witness(randomBytes(32));
    const witnessB = ed25519Witness(randomBytes(32));
    const log = new KeyTransparencyLog({ witness: witnessA });
    log.append(fakeEntry(0));
    const sth = log.signedTreeHead();
    const swapped = { ...sth, witnessKey: witnessB.publicKey };
    assert.equal(verifySignedTreeHead(swapped), false);
});

test('ed25519Witness rejects a non-32-byte seed', () => {
    assert.throws(() => ed25519Witness(Buffer.alloc(16)), /32 bytes/);
});

test('signedTreeHead binds the issuance time so STHs at different times have different signatures', () => {
    const witness = ed25519Witness(randomBytes(32));
    const log = new KeyTransparencyLog({ witness });
    log.append(fakeEntry(0));
    const a = log.signedTreeHead(new Date('2027-01-01T00:00:00.000Z'));
    const b = log.signedTreeHead(new Date('2027-01-01T00:00:01.000Z'));
    assert.notEqual(a.signature, b.signature);
    assert.equal(verifySignedTreeHead(a), true);
    assert.equal(verifySignedTreeHead(b), true);
});
