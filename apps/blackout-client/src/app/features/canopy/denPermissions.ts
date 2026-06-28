import type { MatrixClient } from 'matrix-js-sdk';
import type { IPowerLevels } from '../../hooks/usePowerLevels';
import { StateEvent } from '../../../types/matrix/room';

/**
 * Lightweight per-den permission model. A den's permissions are just thresholds
 * in its `m.room.power_levels` state event; this module maps a small, friendly
 * set of "who can …" rows onto the specific power-level fields and produces an
 * updated content object to persist. Pure (read/merge) so the gating logic is
 * unit-testable without a live client.
 */
export type DenPermissionKey = 'post' | 'manage' | 'invite' | 'kick' | 'ban' | 'redact';

export interface DenPermissionRow {
    key: DenPermissionKey;
    label: string;
    description: string;
}

export const DEN_PERMISSION_ROWS: DenPermissionRow[] = [
    { key: 'post', label: 'Send messages', description: 'Post messages in this channel.' },
    {
        key: 'manage',
        label: 'Manage channel',
        description: 'Edit channel settings (name, topic, permissions).',
    },
    { key: 'invite', label: 'Invite members', description: 'Invite people to this channel.' },
    { key: 'kick', label: 'Remove members', description: 'Kick members from this channel.' },
    { key: 'ban', label: 'Ban members', description: 'Ban members from this channel.' },
    { key: 'redact', label: 'Delete messages', description: "Delete other people's messages." },
];

// Each row edits a single top-level `m.room.power_levels` field. `post` maps to
// `events_default` (the general "send any message" threshold) and `manage` to
// `state_default` (the general "send any state event" threshold).
const FIELD_BY_KEY: Record<DenPermissionKey, keyof IPowerLevels> = {
    post: 'events_default',
    manage: 'state_default',
    invite: 'invite',
    kick: 'kick',
    ban: 'ban',
    redact: 'redact',
};

// Spec defaults for the fields above when a room omits them.
const DEFAULT_BY_KEY: Record<DenPermissionKey, number> = {
    post: 0,
    manage: 50,
    invite: 0,
    kick: 50,
    ban: 50,
    redact: 50,
};

/** Current power required for a permission row, falling back to the spec default. */
export const readDenPermission = (powerLevels: IPowerLevels, key: DenPermissionKey): number => {
    const value = powerLevels[FIELD_BY_KEY[key]];
    return typeof value === 'number' ? value : DEFAULT_BY_KEY[key];
};

/**
 * Merge a set of permission edits onto the existing power-levels content,
 * returning a new object (existing keys — `users`, per-event overrides, etc. —
 * are preserved). `edits` maps a permission key to its new required power.
 */
export const buildDenPowerLevels = (
    current: IPowerLevels,
    edits: Partial<Record<DenPermissionKey, number>>
): IPowerLevels => {
    const next: IPowerLevels = { ...current };
    (Object.keys(edits) as DenPermissionKey[]).forEach((key) => {
        const power = edits[key];
        if (typeof power === 'number') {
            (next as Record<string, unknown>)[FIELD_BY_KEY[key]] = power;
        }
    });
    return next;
};

/** Persist a den's full power-levels content. Requires `m.room.power_levels` power. */
export const writeDenPermissions = async (
    mx: MatrixClient,
    roomId: string,
    content: IPowerLevels
): Promise<void> => {
    await mx.sendStateEvent(roomId, StateEvent.RoomPowerLevels as never, content as never, '');
};
