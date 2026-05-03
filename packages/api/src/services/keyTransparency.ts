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
 * This module is pure: it does not pin a storage backend. Callers wrap
 * it with persistence.
 */

import { createHash } from 'node:crypto';

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

export class KeyTransparencyLog {
    private leaves: Buffer[] = [];
    private entries: KeyEntry[] = [];

    append(entry: KeyEntry): { leafIndex: number; root: TreeRoot } {
        const encoded = encodeEntry(entry);
        const idx = this.leaves.length;
        this.leaves.push(encoded);
        this.entries.push(entry);
        return { leafIndex: idx, root: this.root() };
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

    let hash = Buffer.from(proof.leafHash, 'base64url');
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
