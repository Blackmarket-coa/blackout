import { describe, expect, it, vi } from 'vitest';
import {
    formatStatusText,
    isStatusActive,
    resolveDisplayStatus,
    syncStatusToPresence,
} from '../../../../src/app/features/profile/customStatus';

const NOW = Date.parse('2026-05-27T12:00:00.000Z');

describe('isStatusActive', () => {
    it('is false for empty/missing status', () => {
        expect(isStatusActive(undefined, NOW)).toBe(false);
        expect(isStatusActive({ text: '   ' }, NOW)).toBe(false);
    });

    it('is true with text and no expiry', () => {
        expect(isStatusActive({ text: 'building' }, NOW)).toBe(true);
    });

    it('respects expiry', () => {
        expect(isStatusActive({ text: 'brb', expiresAt: '2026-05-27T13:00:00.000Z' }, NOW)).toBe(
            true
        );
        expect(isStatusActive({ text: 'brb', expiresAt: '2026-05-27T11:00:00.000Z' }, NOW)).toBe(
            false
        );
    });
});

describe('formatStatusText', () => {
    it('prefixes the emoji when present', () => {
        expect(formatStatusText({ text: 'focusing', emoji: '🎧' })).toBe('🎧 focusing');
        expect(formatStatusText({ text: 'focusing' })).toBe('focusing');
    });
});

describe('resolveDisplayStatus', () => {
    it('prefers an active custom status', () => {
        expect(resolveDisplayStatus({ text: 'gardening', emoji: '🌱' }, 'Active', NOW)).toBe(
            '🌱 gardening'
        );
    });

    it('falls back to the presence message when no active status', () => {
        expect(resolveDisplayStatus(undefined, 'In a meeting', NOW)).toBe('In a meeting');
        expect(
            resolveDisplayStatus({ text: 'old', expiresAt: '2026-05-27T11:00:00.000Z' }, 'Online', NOW)
        ).toBe('Online');
    });

    it('returns undefined when nothing is available', () => {
        expect(resolveDisplayStatus(undefined, '   ', NOW)).toBeUndefined();
    });
});

describe('syncStatusToPresence', () => {
    it('publishes the formatted status message', async () => {
        const setPresence = vi.fn().mockResolvedValue(undefined);
        await syncStatusToPresence({ setPresence } as never, { text: 'live', emoji: '🔴' }, NOW);
        expect(setPresence).toHaveBeenCalledWith({ presence: 'online', status_msg: '🔴 live' });
    });

    it('clears the message when the status is empty/expired', async () => {
        const setPresence = vi.fn().mockResolvedValue(undefined);
        await syncStatusToPresence({ setPresence } as never, undefined, NOW);
        expect(setPresence).toHaveBeenCalledWith({ presence: 'online', status_msg: '' });
    });

    it('is a no-op when the client cannot set presence', async () => {
        await expect(syncStatusToPresence({} as never, { text: 'x' }, NOW)).resolves.toBeUndefined();
    });

    it('swallows presence errors', async () => {
        const setPresence = vi.fn().mockRejectedValue(new Error('network'));
        await expect(
            syncStatusToPresence({ setPresence } as never, { text: 'x' }, NOW)
        ).resolves.toBeUndefined();
    });
});
