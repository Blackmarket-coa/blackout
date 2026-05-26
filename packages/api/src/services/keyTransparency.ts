/**
 * Append-only Merkle log of user identity keys.
 *
 * Construction follows RFC 6962 (Certificate Transparency) so the proofs
 * here are interoperable with off-the-shelf CT verifiers and the well-
 * studied auditability properties carry over:
 *
 *   leaf_hash(d)        = SHA-256(0x00 || d)
 *   node_hash(L, R)     = SHA-256(0x01 || L || R)
 *
 * Used to detect a malicious or compromised homeserver substituting
 * cross-signing keys: every client fetches an inclusion proof for its
 * own published key on session start, and a regular auditor fetches
 * consistency proofs between roots to ensure the log is append-only.
 *
 * Storage is pluggable via `KeyTransparencyStorage` (see
 * `./keyTransparencyStorage.ts`); the default in-memory adapter keeps
 * the historical pure-function behaviour for tests.
 *
 * Witnesses are pluggable via `LogWitness`. A witness binds a tree root
 * to a signed-tree-head (STH) so a third-party auditor can detect a
 * homeserver showing different roots to different clients. The default
 * `nullWitness` returns no signature; an Ed25519 witness sourced from a
 * deployment-secret seed is provided as `ed25519Witness`.
 */

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
    InMemoryKtStorage,
    type KeyTransparencyStorage,
} from './keyTransparencyStorage';

const sha256 = (input: Buffer): Buffer => createHash('sha256').update(input).digest();

export const leafHash = (data: Buffer): Buffer =>
    sha256(Buffer.concat([Buffer.from([0x00]), data]));

export const nodeHash = (left: Buffer, right: Buffer): Buffer =>
    sha256(Buffer.concat([Buffer.from([0x01]), left, right]));

export interface KeyEntry {
    /** Stable user identifier (e.g. matrix_id). */
    userId: string;
    /** Cross-signing master public key, base64url. */
    masterKey: string;
    /** Issuance time, ms since epoch. */
    publishedAt: number;
}

export const encodeEntry = (entry: KeyEntry): Buffer =>
    Buffer.from(
        JSON.stringify({
            userId: entry.userId,
            masterKey: entry.masterKey,
            publishedAt: entry.publishedAt,
        }),
        'utf8',
    );

export interface TreeRoot {
    treeSize: number;
    rootHash: string; // base64url
}

export interface InclusionProof {
    leafIndex: number;
    treeSize: number;
    auditPath: string[]; // base64url node hashes from leaf upward
    leafHash: string; // base64url
}

export interface ConsistencyProof {
    fromSize: number;
    toSize: number;
    nodes: string[]; // base64url
}

/**
 * RFC 6962 Merkle Tree Hash over leaves[start..start+n).
 * Pure recursive computation; we don't cache, since this module is
 * primarily for tests and small-to-medium logs. Production deployments
 * should swap in a caching backend.
 */
const mth = (leaves: Buffer[]): Buffer => {
    if (leaves.length === 0) return sha256(Buffer.alloc(0));
    if (leaves.length === 1) return leafHash(leaves[0]);
    const k = largestPowerOfTwoLessThan(leaves.length);
    return nodeHash(mth(leaves.slice(0, k)), mth(leaves.slice(k)));
};

const largestPowerOfTwoLessThan = (n: number): number => {
    if (n < 2) throw new Error(`expected n >= 2, got ${n}`);
    let k = 1;
    while (k * 2 < n) k *= 2;
    return k;
};

/** RFC 6962 §2.1.1 audit path. */
const auditPath = (m: number, leaves: Buffer[]): Buffer[] => {
    if (leaves.length === 0) throw new Error('empty tree');
    if (leaves.length === 1) return [];
    const k = largestPowerOfTwoLessThan(leaves.length);
    if (m < k) {
        return [...auditPath(m, leaves.slice(0, k)), mth(leaves.slice(k))];
    }
    return [...auditPath(m - k, leaves.slice(k)), mth(leaves.slice(0, k))];
};

/** RFC 6962 §2.1.2 consistency proof between trees of size m and n (m <= n). */
const consistencyProof = (m: number, leaves: Buffer[]): Buffer[] => {
    if (m === leaves.length) return [];
    return subProof(m, leaves, true);
};

const subProof = (m: number, leaves: Buffer[], b: boolean): Buffer[] => {
    if (m === leaves.length) {
        return b ? [] : [mth(leaves)];
    }
    if (m < leaves.length) {
        const k = largestPowerOfTwoLessThan(leaves.length);
        if (m <= k) {
            return [...subProof(m, leaves.slice(0, k), b), mth(leaves.slice(k))];
        }
        return [...subProof(m - k, leaves.slice(k), false), mth(leaves.slice(0, k))];
    }
    throw new Error(`m=${m} out of range for leaves.length=${leaves.length}`);
};

export interface SignedTreeHead {
    treeSize: number;
    rootHash: string; // base64url
    /** ISO 8601 issuance time. */
    issuedAt: string;
    /** Witness public key, base64url; '' when unsigned. */
    witnessKey: string;
    /** Detached signature, base64url over `treeSize||rootHash||issuedAt`. */
    signature: string;
    /** Witness scheme identifier — currently `ed25519` or `none`. */
    scheme: 'ed25519' | 'none';
}

export interface LogWitness {
    readonly scheme: 'ed25519' | 'none';
    /** Public key bytes, base64url; empty for `none`. */
    readonly publicKey: string;
    sign(treeSize: number, rootHash: string, issuedAt: string): string;
}

export const nullWitness: LogWitness = {
    scheme: 'none',
    publicKey: '',
    sign: () => '',
};

const sthBytes = (treeSize: number, rootHash: string, issuedAt: string): Buffer =>
    Buffer.from(`${treeSize}|${rootHash}|${issuedAt}`, 'utf8');

/**
 * Ed25519 witness backed by a 32-byte seed. The seed should be sourced
 * from operator-controlled deployment secrets (env var, KMS, etc.). A
 * deployment can publish multiple witness keys for redundancy; clients
 * only need one trusted witness per audit run.
 */
export const ed25519Witness = (seed: Buffer): LogWitness => {
    if (seed.length !== 32) {
        throw new Error(`ed25519 witness seed must be 32 bytes, got ${seed.length}`);
    }
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const privateKeyDer = Buffer.concat([pkcs8Prefix, seed]);
    const privateKey = createPrivateKey({
        key: privateKeyDer,
        format: 'der',
        type: 'pkcs8',
    });
    const publicKey = createPublicKey(privateKey);
    const rawPub = publicKey.export({ format: 'der', type: 'spki' }).slice(-32);
    return {
        scheme: 'ed25519',
        publicKey: Buffer.from(rawPub).toString('base64url'),
        sign: (treeSize, rootHash, issuedAt) =>
            sign(null, sthBytes(treeSize, rootHash, issuedAt), privateKey).toString('base64url'),
    };
};

/**
 * Reference verifier for a signed tree head. Returns true iff the
 * signature was produced by the witness whose public key is embedded in
 * the STH. Pure function so clients run identical code.
 */
export const verifySignedTreeHead = (sth: SignedTreeHead): boolean => {
    if (sth.scheme === 'none') return sth.signature === '' && sth.witnessKey === '';
    if (sth.scheme !== 'ed25519') return false;
    if (sth.witnessKey.length === 0) return false;
    try {
        const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
        const spki = Buffer.concat([spkiPrefix, Buffer.from(sth.witnessKey, 'base64url')]);
        const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
        const data = sthBytes(sth.treeSize, sth.rootHash, sth.issuedAt);
        const sig = Buffer.from(sth.signature, 'base64url');
        return verify(null, data, publicKey, sig);
    } catch {
        return false;
    }
};

export class KeyTransparencyLog {
    private leaves: Buffer[] = [];
    private entries: KeyEntry[] = [];
    private readonly storage: KeyTransparencyStorage;
    private readonly witness: LogWitness;

    constructor(opts?: { storage?: KeyTransparencyStorage; witness?: LogWitness }) {
        this.storage = opts?.storage ?? new InMemoryKtStorage();
        this.witness = opts?.witness ?? nullWitness;
        // Hydrate from durable storage if any leaves were persisted.
        const persisted = this.storage.load();
        for (const entry of persisted) {
            this.entries.push(entry);
            this.leaves.push(encodeEntry(entry));
        }
    }

    append(entry: KeyEntry): { leafIndex: number; root: TreeRoot } {
        const encoded = encodeEntry(entry);
        const idx = this.leaves.length;
        this.leaves.push(encoded);
        this.entries.push(entry);
        this.storage.append(entry);
        return { leafIndex: idx, root: this.root() };
    }

    /**
     * Issue a Signed Tree Head over the current root using the configured
     * witness. With the default `nullWitness` the result has empty
     * `signature` / `witnessKey` and `scheme === 'none'` — explicit, not
     * pretending to be authenticated.
     */
    signedTreeHead(now = new Date()): SignedTreeHead {
        const root = this.root();
        const issuedAt = now.toISOString();
        return {
            treeSize: root.treeSize,
            rootHash: root.rootHash,
            issuedAt,
            witnessKey: this.witness.publicKey,
            signature: this.witness.sign(root.treeSize, root.rootHash, issuedAt),
            scheme: this.witness.scheme,
        };
    }

    size(): number {
        return this.leaves.length;
    }

    root(): TreeRoot {
        const hash = this.leaves.length === 0 ? sha256(Buffer.alloc(0)) : mth(this.leaves);
        return { treeSize: this.leaves.length, rootHash: hash.toString('base64url') };
    }

    inclusionProof(leafIndex: number): InclusionProof {
        if (leafIndex < 0 || leafIndex >= this.leaves.length) {
            throw new Error(`leafIndex ${leafIndex} out of range [0, ${this.leaves.length})`);
        }
        const path = auditPath(leafIndex, this.leaves);
        return {
            leafIndex,
            treeSize: this.leaves.length,
            auditPath: path.map((p) => p.toString('base64url')),
            leafHash: leafHash(this.leaves[leafIndex]).toString('base64url'),
        };
    }

    consistencyProof(fromSize: number, toSize: number): ConsistencyProof {
        if (fromSize < 0 || fromSize > toSize || toSize > this.leaves.length) {
            throw new Error(`invalid range fromSize=${fromSize} toSize=${toSize} size=${this.leaves.length}`);
        }
        if (fromSize === 0) return { fromSize, toSize, nodes: [] };
        if (fromSize === toSize) return { fromSize, toSize, nodes: [] };
        const proof = consistencyProof(fromSize, this.leaves.slice(0, toSize));
        return { fromSize, toSize, nodes: proof.map((p) => p.toString('base64url')) };
    }

    /** Lookup by user — used for the "what's currently registered for me?" query. */
    findEntriesByUser(userId: string): { leafIndex: number; entry: KeyEntry }[] {
        const out: { leafIndex: number; entry: KeyEntry }[] = [];
        this.entries.forEach((e, i) => {
            if (e.userId === userId) out.push({ leafIndex: i, entry: e });
        });
        return out;
    }
}

/**
 * Verify an inclusion proof against an expected root. Pure function so it
 * runs identically on the client and on auditors. This is the reference
 * RFC 6962 §2.1.1 verifier: walk the audit path from the leaf upward,
 * combining with each sibling on the appropriate side, then compare the
 * reconstructed root to the head.
 */
export const verifyInclusion = (
    proof: InclusionProof,
    expectedRoot: TreeRoot,
): boolean => {
    if (proof.treeSize !== expectedRoot.treeSize) return false;
    if (proof.leafIndex < 0 || proof.leafIndex >= proof.treeSize) return false;

    let hash: Buffer = Buffer.from(proof.leafHash, 'base64url');
    let fn = proof.leafIndex;
    let sn = proof.treeSize - 1;

    for (const sibling of proof.auditPath) {
        if (sn === 0) return false;
        const sib = Buffer.from(sibling, 'base64url');
        if (fn % 2 === 1 || fn === sn) {
            hash = nodeHash(sib, hash);
            if (fn % 2 === 0) {
                while (fn % 2 === 0) {
                    fn = fn >> 1;
                    sn = sn >> 1;
                }
            }
        } else {
            hash = nodeHash(hash, sib);
        }
        fn = fn >> 1;
        sn = sn >> 1;
    }
    return sn === 0 && hash.toString('base64url') === expectedRoot.rootHash;
};

export const __test__ = { mth, leafHash, nodeHash, largestPowerOfTwoLessThan };
