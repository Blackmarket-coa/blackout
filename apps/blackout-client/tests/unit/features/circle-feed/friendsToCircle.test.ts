import { describe, expect, it, vi } from 'vitest';
import {
    CIRCLE_MIGRATION_ACCOUNT_DATA_KEY,
    hasMigrated,
    migrationMarker,
    parseMigrationMarker,
    pendingCircleFollows,
    reconcileFriendsToCircle,
} from '../../../../src/app/features/circle-feed/friendsToCircle';

describe('pendingCircleFollows', () => {
    it('takes confirmed friends and skips ones already in the Circle', () => {
        const pending = pendingCircleFollows({
            friends: ['@a:s', '@b:s', '@c:s'],
            alreadyFollowing: new Set(['@b:s']),
            viewerId: '@me:s',
        });
        expect(pending).toEqual(['@a:s', '@c:s']);
    });

    it('never follows from an outgoing request the other person never accepted', () => {
        // `outgoing` is not an input at all — turning an unanswered request into
        // a follow would grant a relationship that was never agreed to.
        const pending = pendingCircleFollows({
            friends: [],
            alreadyFollowing: new Set(),
            viewerId: '@me:s',
        });
        expect(pending).toEqual([]);
    });

    it('excludes the viewer and de-duplicates', () => {
        const pending = pendingCircleFollows({
            friends: ['@me:s', '@a:s', '@a:s', ''],
            alreadyFollowing: new Set(),
            viewerId: '@me:s',
        });
        expect(pending).toEqual(['@a:s']);
    });
});

describe('hasMigrated', () => {
    it('is false until a marker is written, true after', () => {
        expect(hasMigrated({})).toBe(false);
        expect(hasMigrated({ circleMigratedAt: '' })).toBe(false);
        expect(hasMigrated({ circleMigratedAt: '2026-09-01T00:00:00.000Z' })).toBe(true);
    });
});

describe('the migration marker', () => {
    it('lives in its own account-data key, not inside the friend list', () => {
        // Storing it alongside {friends, outgoing} meant any friend action
        // overwrote it, so the migration re-ran and re-followed people the user
        // had since removed from their Circle.
        expect(CIRCLE_MIGRATION_ACCOUNT_DATA_KEY).toBe('co.bmc.circle_migration');
        expect(migrationMarker('2026-09-01T00:00:00.000Z')).toEqual({
            circleMigratedAt: '2026-09-01T00:00:00.000Z',
        });
    });

    it('parses defensively and treats junk as not-yet-migrated', () => {
        expect(parseMigrationMarker({ circleMigratedAt: '2026-09-01T00:00:00.000Z' })).toEqual({
            circleMigratedAt: '2026-09-01T00:00:00.000Z',
        });
        for (const junk of [
            undefined,
            null,
            {},
            { circleMigratedAt: '' },
            { circleMigratedAt: 7 },
        ]) {
            expect(hasMigrated(parseMigrationMarker(junk))).toBe(false);
        }
    });
});

describe('reconcileFriendsToCircle', () => {
    it('follows everyone and reports a clean run', async () => {
        const follow = vi.fn().mockResolvedValue(undefined);
        const outcome = await reconcileFriendsToCircle(['@a:s', '@b:s'], follow);

        expect(follow).toHaveBeenCalledTimes(2);
        expect(outcome).toEqual({ attempted: 2, followed: 2, failed: [], complete: true });
    });

    it('tolerates one failure, keeps going, and refuses to call the run complete', async () => {
        const follow = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(undefined);

        const outcome = await reconcileFriendsToCircle(['@a:s', '@b:s', '@c:s'], follow);

        // The third friend is still attempted — one transient error must not
        // strand the rest.
        expect(follow).toHaveBeenCalledTimes(3);
        expect(outcome.followed).toBe(2);
        expect(outcome.failed).toEqual(['@b:s']);
        // Not complete, so the marker is withheld and the next sign-in retries.
        expect(outcome.complete).toBe(false);
    });

    it('is a no-op on an empty list', async () => {
        const follow = vi.fn();
        const outcome = await reconcileFriendsToCircle([], follow);
        expect(follow).not.toHaveBeenCalled();
        expect(outcome.complete).toBe(true);
    });
});
