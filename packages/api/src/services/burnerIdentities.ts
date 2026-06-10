import { randomUUID } from 'node:crypto';
import { PERSONA_QUOTAS, type EntitlementTier } from '@blackout/protocol';
import { db } from '../db/store';
import type { BurnerIdentityRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

export const DEFAULT_BURNER_TTL_HOURS = 24 * 7; // 7 days
export const MAX_BURNER_TTL_HOURS = 24 * 90; // 90 days
/** Legacy fallback cap when no tier is supplied (back-compat only). */
export const FREE_TIER_ACTIVE_BURNER_CAP = 1;
export const ADVANCED_TIER_ACTIVE_BURNER_CAP = 10;

/**
 * Active-persona cap for a tier, sourced from the canonical
 * `PERSONA_QUOTAS.maxPersonas` (`-1` ⇒ unlimited).
 */
export function activePersonaCapForTier(tier: EntitlementTier): number {
  const max = PERSONA_QUOTAS[tier].maxPersonas;
  return max === -1 ? Number.POSITIVE_INFINITY : max;
}

export interface CreateBurnerInput {
  ownerUserId: string;
  label?: string;
  ttlHours?: number;
  /**
   * Entitlement tier whose `PERSONA_QUOTAS.maxPersonas` sets the active cap.
   * When omitted, falls back to the legacy `advancedEntitled` boolean.
   */
  tier?: EntitlementTier;
  /** @deprecated back-compat: raises the cap when `tier` is not supplied. */
  advancedEntitled?: boolean;
}

export type CreateBurnerOutcome =
  | {
      kind: 'ok';
      record: BurnerIdentityRecord;
      /** Burner login password — returned ONCE so the client can log in, then discarded. */
      password: string;
      baseUrl: string;
    }
  | { kind: 'cap_reached'; cap: number }
  | { kind: 'matrix_unavailable'; reason: string; detail?: string };

const publicBaseUrl = (): string =>
  (process.env.MATRIX_PUBLIC_BASE_URL ??
    process.env.MATRIX_HOMESERVER ??
    process.env.MATRIX_HOMESERVER_URL ??
    '').replace(/\/+$/, '');

export async function createBurnerForOwner(input: CreateBurnerInput): Promise<CreateBurnerOutcome> {
  const cap = input.tier
    ? activePersonaCapForTier(input.tier)
    : input.advancedEntitled
      ? ADVANCED_TIER_ACTIVE_BURNER_CAP
      : FREE_TIER_ACTIVE_BURNER_CAP;
  const active = db.listBurnerIdentitiesForOwner(input.ownerUserId);
  if (active.length >= cap) {
    return { kind: 'cap_reached', cap };
  }

  const label = (input.label ?? 'Burner').trim().slice(0, 80) || 'Burner';
  const provisioned = await matrixClient.provisionBurner(label);
  if (!provisioned.ok) {
    return {
      kind: 'matrix_unavailable',
      reason: provisioned.reason,
      detail: 'detail' in provisioned ? provisioned.detail : undefined,
    };
  }

  const ttlHours = Math.min(
    Math.max(input.ttlHours ?? DEFAULT_BURNER_TTL_HOURS, 1),
    MAX_BURNER_TTL_HOURS,
  );
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const record = db.createBurnerIdentity({
    id: randomUUID(),
    ownerUserId: input.ownerUserId,
    burnerUserId: provisioned.userId,
    label,
    expiresAt,
  });

  return { kind: 'ok', record, password: provisioned.password, baseUrl: publicBaseUrl() };
}

export function listBurnersForOwner(ownerUserId: string): BurnerIdentityRecord[] {
  return db.listBurnerIdentitiesForOwner(ownerUserId, { includeBurned: true });
}

export type BurnOutcome =
  | { kind: 'ok'; record: BurnerIdentityRecord }
  | { kind: 'not_found' }
  | { kind: 'matrix_unavailable'; reason: string; detail?: string };

export async function burnBurner(input: {
  ownerUserId: string;
  burnerUserId: string;
}): Promise<BurnOutcome> {
  const existing = db.findBurnerIdentity(input.ownerUserId, input.burnerUserId);
  if (!existing) return { kind: 'not_found' };
  if (existing.burnedAt) return { kind: 'ok', record: existing };

  const result = await matrixClient.deactivateUser(existing.burnerUserId, true);
  if (!result.ok) {
    log.warn('burner.deactivate_failed', {
      burnerUserId: existing.burnerUserId,
      reason: result.reason,
    });
    return {
      kind: 'matrix_unavailable',
      reason: result.reason,
      detail: 'detail' in result ? result.detail : undefined,
    };
  }

  const burned = db.markBurnerIdentityBurned(existing.id);
  return { kind: 'ok', record: burned ?? existing };
}
