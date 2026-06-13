/**
 * Active-defense service (OSS-manifest group G5) — defensive, local-only
 * primitives: canary tokens and synthetic decoy data. No outbound traffic, no
 * third-party-directed behavior; everything here is generated and stored
 * locally so an operator can seed their own honeypots and detect unauthorized
 * access. Canaries persist via the write-through store (durable across
 * restarts); decoy data is generated on demand and never stored.
 */

import { randomUUID, randomBytes } from 'node:crypto';
import { db } from '../db/store';
import type { CanaryTokenRecord } from '../db/types';

export type CanaryToken = CanaryTokenRecord;

export type TripContext = {
  userAgent?: string | null;
};

export type DecoyKind = 'contact' | 'message' | 'credential';

export type DecoyRecord = {
  kind: DecoyKind;
  /** Clearly-synthetic marker so decoys are never mistaken for real data. */
  synthetic: true;
  value: Record<string, string>;
};

const MAX_CANARIES_PER_OWNER = 100;
const MAX_DECOY_COUNT = 100;

export function listCanaries(ownerUserId: string): CanaryToken[] {
  return db.listCanaryTokensForOwner(ownerUserId);
}

export type MintCanaryResult =
  | { kind: 'ok'; record: CanaryToken }
  | { kind: 'limit_reached'; cap: number };

export function mintCanary(ownerUserId: string, label: string): MintCanaryResult {
  if (db.listCanaryTokensForOwner(ownerUserId).length >= MAX_CANARIES_PER_OWNER) {
    return { kind: 'limit_reached', cap: MAX_CANARIES_PER_OWNER };
  }
  const record: CanaryToken = {
    id: randomUUID(),
    ownerUserId,
    label: label.slice(0, 200),
    token: `bo-canary-${randomBytes(16).toString('hex')}`,
    createdAt: new Date().toISOString(),
    lastTrippedAt: null,
    tripCount: 0,
    lastTripUserAgent: null,
  };
  db.upsertCanaryToken(record);
  return { kind: 'ok', record };
}

/**
 * Record that a canary was accessed. Returns the updated record, or null when
 * the token is unknown. Called both by the owner-scoped authed route and by the
 * public tripwire (`GET /ct/:token`), where an unauthorized access is exactly
 * the signal we want to capture.
 */
export function tripCanary(token: string, context: TripContext = {}): CanaryToken | null {
  const record = db.findCanaryTokenByToken(token);
  if (!record) return null;
  const userAgent = context.userAgent ? context.userAgent.slice(0, 400) : record.lastTripUserAgent;
  const updated: CanaryToken = {
    ...record,
    lastTrippedAt: new Date().toISOString(),
    tripCount: record.tripCount + 1,
    lastTripUserAgent: userAgent ?? null,
  };
  db.upsertCanaryToken(updated);
  return updated;
}

const DECOY_KINDS: readonly DecoyKind[] = ['contact', 'message', 'credential'];

export function isDecoyKind(value: unknown): value is DecoyKind {
  return typeof value === 'string' && (DECOY_KINDS as readonly string[]).includes(value);
}

export function clampDecoyCount(requested: number): number {
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.floor(requested), MAX_DECOY_COUNT);
}

/** Generate clearly-synthetic decoy records locally. No real PII is involved. */
export function generateDecoyData(kind: DecoyKind, count: number): DecoyRecord[] {
  const out: DecoyRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const tag = randomBytes(4).toString('hex');
    let value: Record<string, string>;
    switch (kind) {
      case 'contact':
        value = { name: `Decoy User ${tag}`, email: `decoy-${tag}@invalid.example` };
        break;
      case 'message':
        value = { from: `decoy-${tag}`, body: `Synthetic decoy message ${tag}` };
        break;
      case 'credential':
        value = { username: `decoy_${tag}`, secret: `honeytoken-${randomBytes(8).toString('hex')}` };
        break;
    }
    out.push({ kind, synthetic: true, value });
  }
  return out;
}

/** Test-only reset of the canary store. */
export function __resetActiveDefenseForTest(): void {
  db.canaryTokens.clear();
}
