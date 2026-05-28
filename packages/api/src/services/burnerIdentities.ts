import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { BurnerIdentityRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

export const DEFAULT_BURNER_TTL_HOURS = 24 * 7; // 7 days
export const MAX_BURNER_TTL_HOURS = 24 * 90; // 90 days
/** Active-burner cap for the free tier; the advanced entitlement raises it. */
export const FREE_TIER_ACTIVE_BURNER_CAP = 1;
export const ADVANCED_TIER_ACTIVE_BURNER_CAP = 10;

export interface CreateBurnerInput {
  ownerUserId: string;
  label?: string;
  ttlHours?: number;
  /** Raised cap when the owner holds the advanced privacy entitlement. */
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
  const cap = input.advancedEntitled
    ? ADVANCED_TIER_ACTIVE_BURNER_CAP
    : FREE_TIER_ACTIVE_BURNER_CAP;

  // Atomic cap enforcement: increment counter before provisioning.
  // If the counter is at or above the cap, reject immediately.
  const counterResult = db.incrementBurnerCounter(input.ownerUserId, cap);
  if (!counterResult.ok) {
    return { kind: 'cap_reached', cap: counterResult.cap };
  }

  try {
    const label = (input.label ?? 'Burner').replace(/<[^>]*>/g, '').trim().slice(0, 80) || 'Burner';
    const provisioned = await matrixClient.provisionBurner(label);
    if (!provisioned.ok) {
      // Roll back the counter increment on provisioning failure
      db.decrementBurnerCounter(input.ownerUserId);
      return {
        kind: 'matrix_unavailable',
        reason: provisioned.reason,
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
      deactivationPending: false,
    });

    return { kind: 'ok', record, password: provisioned.password, baseUrl: publicBaseUrl() };
  } catch {
    // Roll back on any unexpected error
    db.decrementBurnerCounter(input.ownerUserId);
    return { kind: 'matrix_unavailable', reason: 'network_error' };
  }
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

  // Mark as burned locally immediately (optimistic) to free the cap slot
  const burned = db.markBurnerIdentityBurned(existing.id);
  if (burned) db.decrementBurnerCounter(input.ownerUserId);

  const result = await matrixClient.deactivateUser(existing.burnerUserId, true);
  if (!result.ok) {
    log.warn('burner.deactivate_pending', {
      burnerUserId: existing.burnerUserId,
      reason: result.reason,
    });
    // Mark for reconciliation — the periodic reconciler will retry
    if (burned) {
      db.setBurnerDeactivationPending(burned.id);
    }
    return {
      kind: 'matrix_unavailable',
      reason: result.reason,
    };
  }

  return { kind: 'ok', record: burned ?? existing };
}
