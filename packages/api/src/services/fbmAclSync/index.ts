// Matrix ACL sync worker (AOG §2.5 / §9.2). The FBM entitlements service is the
// source of truth for who holds which governance role; each role carries
// `matrixAcls: { roomId, powerLevel }[]` that Blackout applies *verbatim* to the
// room's `m.room.power_levels`. This worker is the only thing that writes those
// power levels from entitlements — Blackout never re-derives them.
//
// Triggers:
//   (a) on demand — `syncMxidAcls(mxid)`, called when an `entitlements.changed`
//       signal arrives, and
//   (b) a periodic drift-correction reconcile over every MXID we've touched.
//
// Best-effort and idempotent: each (mxid, room) write is skipped when the
// last-applied power level (persisted in `fbm_acl_state`) already matches, and
// any Matrix/entitlements failure is logged + counted, never thrown.

import { db } from '../../db/store';
import type { FbmAclStateRecord } from '../../db/types';
import { matrixClient } from '../../integrations/matrix-client';
import {
    getEntitlementsClient,
} from '../../integrations/fbm/entitlementsClientFactory';
import type { FbmEntitlementsClient } from '../../integrations/fbm/entitlementsContract';
import { incrementCounter, logEvent } from '../marketplaceObservability';

const nowIso = (): string => new Date().toISOString();

export interface AclSyncDeps {
    entitlements?: FbmEntitlementsClient;
    matrix?: Pick<typeof matrixClient, 'getStateEvent' | 'sendStateEvent'>;
}

export interface AclSyncResult {
    mxid: string;
    applied: number;
    skipped: number;
    failed: number;
    /** True when entitlements is unconfigured (worker no-ops). */
    unavailable?: boolean;
}

interface PowerLevelsContent {
    users?: Record<string, number>;
    [k: string]: unknown;
}

/**
 * Apply the entitlements service's `matrixAcls` for one MXID to the relevant
 * rooms' power levels. Returns counts; never throws.
 */
export async function syncMxidAcls(mxid: string, deps: AclSyncDeps = {}): Promise<AclSyncResult> {
    const entitlements = deps.entitlements ?? getEntitlementsClient();
    const matrix = deps.matrix ?? matrixClient;
    const result: AclSyncResult = { mxid, applied: 0, skipped: 0, failed: 0 };

    if (!entitlements) {
        result.unavailable = true;
        return result;
    }

    let roles;
    try {
        roles = await entitlements.getGovernanceRoles(mxid);
    } catch (err) {
        incrementCounter('fbm_acl_sync_failed_total', { stage: 'fetch_roles' });
        logEvent('fbm.acl_sync.fetch_failed', {
            mxid,
            detail: err instanceof Error ? err.message : String(err),
        });
        result.failed += 1;
        return result;
    }

    // Collapse all ACLs to the highest power level requested per room (a user may
    // hold multiple roles granting access to the same room).
    const desired = new Map<string, number>();
    for (const role of roles) {
        for (const acl of role.matrixAcls) {
            const current = desired.get(acl.roomId);
            if (current === undefined || acl.powerLevel > current) {
                desired.set(acl.roomId, acl.powerLevel);
            }
        }
    }

    for (const [roomId, powerLevel] of desired) {
        const last = db.getFbmAclState(mxid, roomId);
        if (last && last.powerLevel === powerLevel) {
            result.skipped += 1;
            continue;
        }
        const ok = await applyPowerLevel(matrix, roomId, mxid, powerLevel);
        if (!ok) {
            result.failed += 1;
            continue;
        }
        const record: FbmAclStateRecord = {
            mxid,
            roomId,
            powerLevel,
            appliedAt: nowIso(),
            createdAt: last?.createdAt ?? nowIso(),
        };
        db.upsertFbmAclState(record);
        result.applied += 1;
    }

    if (result.applied > 0) {
        incrementCounter('fbm_acl_sync_applied_total', {}, result.applied);
    }
    logEvent('fbm.acl_sync.done', { ...result });
    return result;
}

/** Read-modify-write the room's m.room.power_levels, merging users[mxid]=powerLevel. */
async function applyPowerLevel(
    matrix: AclSyncDeps['matrix'] & object,
    roomId: string,
    mxid: string,
    powerLevel: number
): Promise<boolean> {
    const current = await matrix.getStateEvent(roomId, 'm.room.power_levels', '');
    const content: PowerLevelsContent =
        current.ok && current.content ? (current.content as PowerLevelsContent) : {};
    const users = { ...(content.users ?? {}) };
    if (users[mxid] === powerLevel) return true; // already correct on-server
    users[mxid] = powerLevel;
    const written = await matrix.sendStateEvent(
        roomId,
        'm.room.power_levels',
        { ...content, users },
        ''
    );
    if (!written.ok) {
        incrementCounter('fbm_acl_sync_failed_total', { stage: 'write_power_levels' });
        logEvent('fbm.acl_sync.write_failed', {
            mxid,
            roomId,
            detail: 'reason' in written ? written.reason : written.status,
        });
        return false;
    }
    return true;
}

/** Re-assert ACLs for every MXID we have touched (drift correction). */
export async function reconcileAllAcls(deps: AclSyncDeps = {}): Promise<{ mxids: number }> {
    const mxids = db.listFbmAclMxids();
    for (const mxid of mxids) {
        await syncMxidAcls(mxid, deps);
    }
    return { mxids: mxids.length };
}
