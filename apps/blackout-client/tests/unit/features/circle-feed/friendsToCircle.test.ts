import { describe, expect, it, vi } from 'vitest';
import {
    hasMigrated,
    pendingCircleFollows,
    reconcileFriendsToCircle,
    withMigrationMarker,
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

describe('withMigrationMarker', () => {
    it('adds the marker and carries the legacy data through untouched', () => {
        const data = { friends: ['@a:s'], outgoing: ['@b:s'] };
        const next = withMigrationMarker(data, '2026-09-01T00:00:00.000Z');
        // The account data is a legacy read source, never deleted.
        expect(next.friends).toEqual(['@a:s']);
        expect(next.outgoing).toEqual(['@b:s']);
        expect(next.circleMigratedAt).toBe('2026-09-01T00:00:00.000Z');
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
