/**
 * Mesh relay node (OSS-manifest group G6). The server acts as one always-on
 * node in the store-and-forward mesh: it holds opaque, end-to-end-encrypted
 * envelopes and exchanges them with peers using the shared gossip merge from
 * `@blackout/protocol`. It never inspects `payload`. In-memory store (parity
 * with the other first-party stub services).
 */

import { randomUUID } from 'node:crypto';
import { mergeMeshEnvelopes, markSeenBy, type MeshEnvelope } from '@blackout/protocol';

export const SERVER_NODE_ID = 'server';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_MAX_HOPS = 8;
const MAX_STORE = 10_000;

let store: MeshEnvelope[] = [];

export type EnqueueInput = {
  sender: string;
  recipient: string;
  payload: string;
  ttlSeconds?: number;
  maxHops?: number;
};

export function enqueueEnvelope(input: EnqueueInput): MeshEnvelope {
  const now = Date.now();
  const ttl = input.ttlSeconds && input.ttlSeconds > 0 ? input.ttlSeconds : DEFAULT_TTL_SECONDS;
  const env: MeshEnvelope = {
    id: randomUUID(),
    sender: input.sender,
    recipient: input.recipient,
    payload: input.payload,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl * 1000).toISOString(),
    hopCount: 0,
    maxHops: input.maxHops && input.maxHops > 0 ? input.maxHops : DEFAULT_MAX_HOPS,
    seenBy: [SERVER_NODE_ID],
  };
  store = [...store, env].slice(-MAX_STORE);
  return env;
}

export type SyncResult = {
  accepted: number;
  toForward: MeshEnvelope[];
};

/**
 * Merge a peer's offered envelopes into the relay store and return the ones the
 * peer is still missing. Forwarded envelopes are marked as seen by the peer so
 * a subsequent sync doesn't re-offer them.
 */
export function syncWithPeer(peerNodeId: string, incoming: readonly MeshEnvelope[]): SyncResult {
  const result = mergeMeshEnvelopes(store, incoming, {
    selfNodeId: SERVER_NODE_ID,
    peerNodeId,
    now: Date.now(),
  });
  const forwardIds = new Set(result.toForward.map((e) => e.id));
  store = result.merged.map((env) => (forwardIds.has(env.id) ? markSeenBy(env, peerNodeId) : env));
  return { accepted: result.accepted.length, toForward: result.toForward };
}

/** Live envelopes addressed to a recipient (delivery side of the relay). */
export function listForRecipient(recipient: string): MeshEnvelope[] {
  const now = Date.now();
  return store.filter((e) => e.recipient === recipient && Date.parse(e.expiresAt) > now);
}

export function meshStoreSize(): number {
  return store.length;
}

/** Test-only reset of the in-memory store. */
export function __resetMeshForTest(): void {
  store = [];
}
