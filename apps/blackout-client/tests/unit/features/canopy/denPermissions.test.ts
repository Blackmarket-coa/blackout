import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { IPowerLevels } from '../../../../src/app/hooks/usePowerLevels';
import {
    DEN_PERMISSION_ROWS,
    buildDenPowerLevels,
    readDenPermission,
    writeDenPermissions,
} from '../../../../src/app/features/canopy/denPermissions';

describe('readDenPermission', () => {
    it('falls back to spec defaults when the field is absent', () => {
        const pl: IPowerLevels = {};
        expect(readDenPermission(pl, 'post')).toBe(0);
        expect(readDenPermission(pl, 'manage')).toBe(50);
        expect(readDenPermission(pl, 'invite')).toBe(0);
        expect(readDenPermission(pl, 'kick')).toBe(50);
        expect(readDenPermission(pl, 'ban')).toBe(50);
        expect(readDenPermission(pl, 'redact')).toBe(50);
    });

    it('reads the mapped field when present', () => {
        const pl: IPowerLevels = {
            events_default: 50,
            state_default: 100,
            invite: 25,
            kick: 75,
            ban: 80,
            redact: 60,
        };
        expect(readDenPermission(pl, 'post')).toBe(50);
        expect(readDenPermission(pl, 'manage')).toBe(100);
        expect(readDenPermission(pl, 'invite')).toBe(25);
        expect(readDenPermission(pl, 'kick')).toBe(75);
        expect(readDenPermission(pl, 'ban')).toBe(80);
        expect(readDenPermission(pl, 'redact')).toBe(60);
    });
});

describe('buildDenPowerLevels', () => {
    it('maps permission keys to the right power-level fields', () => {
        const next = buildDenPowerLevels(
            {},
            { post: 50, manage: 100, invite: 0, kick: 50, ban: 50, redact: 50 }
        );
        expect(next).toMatchObject({
            events_default: 50,
            state_default: 100,
            invite: 0,
            kick: 50,
            ban: 50,
            redact: 50,
        });
    });

    it('preserves existing keys it does not edit (users, per-event overrides)', () => {
        const current: IPowerLevels = {
            users: { '@admin:server': 100 },
            events: { 'm.room.name': 50 },
            events_default: 0,
        };
        const next = buildDenPowerLevels(current, { post: 50 });
        expect(next.events_default).toBe(50);
        expect(next.users).toEqual({ '@admin:server': 100 });
        expect(next.events).toEqual({ 'm.room.name': 50 });
    });

    it('does not mutate the input', () => {
        const current: IPowerLevels = { events_default: 0 };
        buildDenPowerLevels(current, { post: 50 });
        expect(current.events_default).toBe(0);
    });

    it('ignores undefined edits', () => {
        const next = buildDenPowerLevels({ events_default: 10 }, { post: undefined });
        expect(next.events_default).toBe(10);
    });
});

describe('DEN_PERMISSION_ROWS', () => {
    it('covers the six editable permissions', () => {
        expect(DEN_PERMISSION_ROWS.map((row) => row.key)).toEqual([
            'post',
            'manage',
            'invite',
            'kick',
            'ban',
            'redact',
        ]);
    });
});

describe('writeDenPermissions', () => {
    it('sends the m.room.power_levels state event', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const mx = { sendStateEvent } as unknown as MatrixClient;
        const content: IPowerLevels = { events_default: 50 };

        await writeDenPermissions(mx, '!den:server', content);

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!den:server',
            'm.room.power_levels',
            content,
            ''
        );
    });
});
