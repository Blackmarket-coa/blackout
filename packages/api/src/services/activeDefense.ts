/**
 * Active-defense service (OSS-manifest group G5) — defensive, local-only
 * primitives: canary tokens and synthetic decoy data. No outbound traffic, no
 * third-party-directed behavior; everything here is generated and stored
 * locally so an operator can seed their own honeypots and detect unauthorized
 * access. In-memory store (parity with the other first-party stub services).
 */

import { randomUUID, randomBytes } from 'node:crypto';

export type CanaryToken = {
  id: string;
  ownerUserId: string;
  label: string;
  /** Opaque token an operator embeds in a honeypot artifact. */
  token: string;
  createdAt: string;
  lastTrippedAt: string | null;
  tripCount: number;
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

const canariesByOwner = new Map<string, CanaryToken[]>();
const canariesByToken = new Map<string, CanaryToken>();

export function listCanaries(ownerUserId: string): CanaryToken[] {
  return canariesByOwner.get(ownerUserId) ?? [];
}

export type MintCanaryResult =
  | { kind: 'ok'; record: CanaryToken }
  | { kind: 'limit_reached'; cap: number };

export function mintCanary(ownerUserId: string, label: string): MintCanaryResult {
  const existing = canariesByOwner.get(ownerUserId) ?? [];
  if (existing.length >= MAX_CANARIES_PER_OWNER) {
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
  };
  canariesByOwner.set(ownerUserId, [...existing, record]);
  canariesByToken.set(record.token, record);
  return { kind: 'ok', record };
}

/**
 * Record that a canary was accessed. Returns the updated record, or null when
 * the token is unknown. (Owner-scoped today; mapping a public tripwire route is
 * a tracked follow-up.)
 */
export function tripCanary(token: string): CanaryToken | null {
  const record = canariesByToken.get(token);
  if (!record) return null;
  const updated: CanaryToken = {
    ...record,
    lastTrippedAt: new Date().toISOString(),
    tripCount: record.tripCount + 1,
  };
  canariesByToken.set(token, updated);
  const owned = canariesByOwner.get(record.ownerUserId) ?? [];
  canariesByOwner.set(
    record.ownerUserId,
    owned.map((c) => (c.id === updated.id ? updated : c)),
  );
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

/** Test-only reset of the in-memory store. */
export function __resetActiveDefenseForTest(): void {
  canariesByOwner.clear();
  canariesByToken.clear();
}
