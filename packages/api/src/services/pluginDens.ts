/**
 * Plugin den factory service (Phase 5).
 *
 * Turns a plugin's `pluginDens` manifest declaration into provisioned Matrix
 * rooms and records the linkage. Provisioning is idempotent per
 * (installation, purpose). The Matrix side is injected (`RoomProvisioner`) so
 * the orchestration is testable without a homeserver; the default provisioner
 * creates the room and stamps its den classification via the bot client.
 */

import crypto from 'node:crypto';
import { planPluginDens, type PlannedPluginDen, type PluginDenSpecInput } from '@blackout/core';
import { db } from '../db/store';
import type { PluginDenRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';

/** Default-off gate. Flip `BLACKOUT_PLUGIN_DENS=true` to enable. */
export function pluginDensEnabled(): boolean {
    return process.env.BLACKOUT_PLUGIN_DENS === 'true';
}

export type RoomProvisionResult = { ok: true; denId: string } | { ok: false; reason: string };

/** Creates the Matrix room for one planned den and returns its room id. */
export type RoomProvisioner = (plan: PlannedPluginDen) => Promise<RoomProvisionResult>;

export interface PluginDen {
    id: string;
    installationId: string;
    pluginId: string;
    denId: string;
    purpose: string;
    denType: string;
    name: string;
    createdAt: string;
}

export interface ProvisionPluginDensResult {
    provisioned: PluginDen[];
    /** Plans that could not be provisioned (Matrix failure), for surfacing. */
    failures: Array<{ purpose: string; reason: string }>;
}

function toModel(record: PluginDenRecord): PluginDen {
    return {
        id: record.id,
        installationId: record.installationId,
        pluginId: record.pluginId,
        denId: record.denId,
        purpose: record.purpose,
        denType: record.denType,
        name: record.name,
        createdAt: record.createdAt,
    };
}

/**
 * Default provisioner: create the room as the bot, then stamp its den
 * classification state event. Returns a structured failure when Matrix is
 * unconfigured or rejects, so the orchestration can record it without throwing.
 */
export const defaultRoomProvisioner: RoomProvisioner = async (plan) => {
    const created = await matrixClient.createRoom({
        name: plan.name,
        visibility: plan.denType === 'private' ? 'private' : 'public',
        preset: plan.denType === 'private' ? 'private_chat' : 'public_chat',
        // Private plugin dens are member-only conversations and get Megolm;
        // public ones stay readable so history survives for later joiners.
        encrypted: plan.denType === 'private',
    });
    if (!created.ok || !created.roomId) {
        return { ok: false, reason: created.reason ?? 'create_failed' };
    }
    await matrixClient.sendStateEvent(
        created.roomId,
        plan.classificationStateEventType,
        { ...plan.classification },
        ''
    );
    return { ok: true, denId: created.roomId };
};

export function listPluginDensForInstallation(installationId: string): PluginDen[] {
    return db.listPluginDensForInstallation(installationId).map(toModel);
}

export function listPluginDensForPlugin(pluginId: string): PluginDen[] {
    return db.listPluginDensForPlugin(pluginId).map(toModel);
}

/**
 * Plan + provision the companion dens for an installation. Existing dens (same
 * installation + purpose) are returned as-is rather than re-created.
 */
export async function provisionPluginDens(
    params: {
        installationId: string;
        pluginId: string;
        pluginName: string;
        specs: readonly PluginDenSpecInput[] | undefined;
    },
    provisioner: RoomProvisioner = defaultRoomProvisioner
): Promise<ProvisionPluginDensResult> {
    const plans = planPluginDens(params.specs, params.pluginName);
    const provisioned: PluginDen[] = [];
    const failures: Array<{ purpose: string; reason: string }> = [];

    for (const plan of plans) {
        const existing = db.findPluginDen(params.installationId, plan.purpose);
        if (existing) {
            provisioned.push(toModel(existing));
            continue;
        }
        const result = await provisioner(plan);
        if (!result.ok) {
            failures.push({ purpose: plan.purpose, reason: result.reason });
            continue;
        }
        const record = db.createPluginDen({
            id: crypto.randomUUID(),
            installationId: params.installationId,
            pluginId: params.pluginId,
            denId: result.denId,
            purpose: plan.purpose,
            denType: plan.denType,
            name: plan.name,
        });
        provisioned.push(toModel(record));
    }

    return { provisioned, failures };
}
