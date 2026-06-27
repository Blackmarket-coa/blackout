/**
 * Coalition Kit application service (Phase 4).
 *
 * Applying a kit to a coalition: install its bundled plugins at coalition scope
 * (per-den opt-in, reusing Phase 1), provision its dens (reusing the Phase 5
 * Matrix room + classification pattern via an injectable provisioner), and
 * record an idempotent application-ledger row carrying the theme + feature-flag
 * customization snapshot for the coalition to adopt.
 *
 * The ledger is keyed on (coalition, kit): re-applying updates the row and does
 * not re-install plugins or re-create dens that already exist.
 */

import crypto from 'node:crypto';
import {
    DEN_CLASSIFICATION_STATE_EVENT_TYPE,
    type CoalitionKitDenSpec,
    type CoalitionKitManifest,
} from '@blackout/core';
import { ROOM_TYPE_EVENT_TYPE, type RoomTypeContent } from '@blackout/protocol';
import { db } from '../db/store';
import type { CoalitionKitManifestApplicationRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { installPluginAtScope } from './pluginInstallations';

/**
 * Default-on gate. Coalition kit manifests ship enabled in production; set
 * `BLACKOUT_COALITION_KIT_MANIFESTS=false` to disable (rollback toggle).
 */
export function coalitionKitManifestsEnabled(): boolean {
    return process.env.BLACKOUT_COALITION_KIT_MANIFESTS !== 'false';
}

export type KitDenProvisionResult =
    | { ok: true; denId: string }
    | { ok: false; reason: string };
export type KitDenProvisioner = (spec: CoalitionKitDenSpec) => Promise<KitDenProvisionResult>;

export interface CoalitionKitManifestApplication {
    id: string;
    coalitionId: string;
    kitId: string;
    appliedByUserId: string;
    archetype: string;
    customization: Record<string, unknown>;
    denIds: string[];
    bundledPluginIds: string[];
    status: 'applied' | 'reverted';
    createdAt: string;
    updatedAt: string;
}

export interface ApplyCoalitionKitResult {
    application: CoalitionKitManifestApplication;
    /** True when an existing application was returned rather than newly applied. */
    alreadyApplied: boolean;
    denFailures: Array<{ slug: string; reason: string }>;
}

function toModel(record: CoalitionKitManifestApplicationRecord): CoalitionKitManifestApplication {
    return { ...record };
}

/** Default den provisioner: create the room as the bot and stamp its classification. */
export const defaultKitDenProvisioner: KitDenProvisioner = async (spec) => {
    // Tier-gated dens are invite-only; FBM entitlements (via fbmAclSync) controls
    // who is invited. Open dens follow their classification.
    const gated = !!spec.minTier || spec.denType === 'private';
    const created = await matrixClient.createRoom({
        name: spec.name,
        topic: spec.topic,
        visibility: gated ? 'private' : 'public',
        preset: gated ? 'private_chat' : 'public_chat',
    });
    if (!created.ok || !created.roomId) {
        return { ok: false, reason: created.reason ?? 'create_failed' };
    }
    await matrixClient.sendStateEvent(
        created.roomId,
        DEN_CLASSIFICATION_STATE_EVENT_TYPE,
        { denType: spec.denType },
        '',
    );
    // Record the room's shape + tier gate as a `co.bmc.room_type` marker when it
    // is anything other than a plain open chat. This drives the bounty-board view
    // and lets the FBM portal wire tier→room ACLs. No new ACL engine.
    const kind = spec.kind ?? 'chat';
    if (kind !== 'chat' || spec.minTier) {
        const content: RoomTypeContent = {
            type: kind,
            ...(spec.minTier ? { minTier: spec.minTier } : {}),
        };
        await matrixClient.sendStateEvent(
            created.roomId,
            ROOM_TYPE_EVENT_TYPE,
            content as unknown as Record<string, unknown>,
            '',
        );
    }
    return { ok: true, denId: created.roomId };
};

export function listCoalitionKitManifestApplications(coalitionId: string): CoalitionKitManifestApplication[] {
    return db.listCoalitionKitManifestApplications(coalitionId).map(toModel);
}

export async function applyCoalitionKitManifest(
    params: {
        coalitionId: string;
        manifest: CoalitionKitManifest;
        appliedByUserId: string;
    },
    provisioner: KitDenProvisioner = defaultKitDenProvisioner,
): Promise<ApplyCoalitionKitResult> {
    const { coalitionId, manifest, appliedByUserId } = params;

    const existing = db.findCoalitionKitManifestApplication(coalitionId, manifest.kitId);
    if (existing) {
        // Re-apply adopts the latest manifest snapshot (customization/theme/feature
        // flags + bundled plugin list) and refreshes updatedAt. It deliberately does
        // not re-install plugins or touch dens: the application row only records
        // provisioned room ids, not a slug→room map, so we cannot tell which specs
        // failed earlier — retrying by position would re-create or duplicate the
        // wrong dens. Provisioning gaps are surfaced via denFailures on first apply.
        const updated = db.updateCoalitionKitManifestApplication(existing.id, {
            appliedByUserId,
            archetype: manifest.archetype,
            customization: { ...manifest.customization },
            bundledPluginIds: [...manifest.bundledPluginIds],
            status: 'applied',
        });
        return { application: toModel(updated ?? existing), alreadyApplied: true, denFailures: [] };
    }

    // Install bundled plugins at coalition scope (lands as `available` — per-den
    // opt-in). Idempotent on (pluginId, scope) inside installPluginAtScope.
    for (const pluginId of manifest.bundledPluginIds) {
        installPluginAtScope({
            pluginId,
            scope: { type: 'coalition', id: coalitionId },
            installedByUserId: appliedByUserId,
            artifactKind: 'manifest_plugin',
        });
    }

    // Provision the kit's dens.
    const denIds: string[] = [];
    const denFailures: Array<{ slug: string; reason: string }> = [];
    for (const spec of manifest.dens) {
        const result = await provisioner(spec);
        if (result.ok) denIds.push(result.denId);
        else denFailures.push({ slug: spec.slug, reason: result.reason });
    }

    const record = db.createCoalitionKitManifestApplication({
        id: crypto.randomUUID(),
        coalitionId,
        kitId: manifest.kitId,
        appliedByUserId,
        archetype: manifest.archetype,
        customization: { ...manifest.customization },
        denIds,
        bundledPluginIds: [...manifest.bundledPluginIds],
        status: 'applied',
    });

    return { application: toModel(record), alreadyApplied: false, denFailures };
}
