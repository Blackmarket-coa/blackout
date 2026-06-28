import { describe, expect, it } from 'vitest';
import {
    deriveFriendState,
    isFriend,
    isOutgoing,
    parseFriends,
    withFriend,
    withOutgoing,
    withoutFriend,
    withoutOutgoing,
    type DmFriendSignal,
} from '../../../../src/app/features/friends/friendsModel';

describe('parseFriends', () => {
    it('returns empty lists for missing/invalid content', () => {
        expect(parseFriends(undefined)).toEqual({ friends: [], outgoing: [] });
        expect(parseFriends({})).toEqual({ friends: [], outgoing: [] });
        expect(parseFriends({ friends: 'nope', outgoing: 5 })).toEqual({
            friends: [],
            outgoing: [],
        });
    });

    it('keeps only valid, de-duplicated matrix user ids', () => {
        const parsed = parseFriends({
            friends: ['@a:server', '@a:server', 'not-an-id', 42, '@b:server'],
            outgoing: ['@c:server'],
        });
        expect(parsed).toEqual({ friends: ['@a:server', '@b:server'], outgoing: ['@c:server'] });
    });
});

describe('membership helpers', () => {
    const content = { friends: ['@a:server'], outgoing: ['@b:server'] };
    it('reports friend / outgoing membership', () => {
        expect(isFriend(content, '@a:server')).toBe(true);
        expect(isFriend(content, '@b:server')).toBe(false);
        expect(isOutgoing(content, '@b:server')).toBe(true);
        expect(isOutgoing(content, '@a:server')).toBe(false);
    });
});

describe('list transforms', () => {
    it('withFriend adds a friend and clears any matching outgoing', () => {
        const next = withFriend({ friends: [], outgoing: ['@a:server'] }, '@a:server');
        expect(next).toEqual({ friends: ['@a:server'], outgoing: [] });
    });

    it('withFriend is idempotent', () => {
        const start = { friends: ['@a:server'], outgoing: [] };
        expect(withFriend(start, '@a:server').friends).toEqual(['@a:server']);
    });

    it('withoutFriend removes from both lists', () => {
        const next = withoutFriend(
            { friends: ['@a:server'], outgoing: ['@a:server'] },
            '@a:server'
        );
        expect(next).toEqual({ friends: [], outgoing: [] });
    });

    it('withOutgoing adds unless already a friend or already pending', () => {
        expect(withOutgoing({ friends: [], outgoing: [] }, '@a:server').outgoing).toEqual([
            '@a:server',
        ]);
        expect(
            withOutgoing({ friends: ['@a:server'], outgoing: [] }, '@a:server').outgoing
        ).toEqual([]);
        expect(
            withOutgoing({ friends: [], outgoing: ['@a:server'] }, '@a:server').outgoing
        ).toEqual(['@a:server']);
    });

    it('withoutOutgoing drops a pending request', () => {
        expect(
            withoutOutgoing({ friends: [], outgoing: ['@a:server'] }, '@a:server').outgoing
        ).toEqual([]);
    });
});

describe('deriveFriendState', () => {
    const signal = (over: Partial<DmFriendSignal>): DmFriendSignal => ({
        otherUserId: '@a:server',
        action: 'request',
        fromOther: true,
        ...over,
    });

    it('ignores signals that originated from me', () => {
        const state = deriveFriendState([signal({ fromOther: false })], []);
        expect(state).toEqual({ incoming: [], accepted: [], declined: [] });
    });

    it('buckets requests as incoming, accepts as accepted, declines as declined', () => {
        const state = deriveFriendState(
            [
                signal({ otherUserId: '@a:server', action: 'request' }),
                signal({ otherUserId: '@b:server', action: 'accept' }),
                signal({ otherUserId: '@c:server', action: 'decline' }),
            ],
            []
        );
        expect(state.incoming).toEqual(['@a:server']);
        expect(state.accepted).toEqual(['@b:server']);
        expect(state.declined).toEqual(['@c:server']);
    });

    it('excludes existing friends from incoming and accepted', () => {
        const state = deriveFriendState(
            [
                signal({ otherUserId: '@a:server', action: 'request' }),
                signal({ otherUserId: '@a:server', action: 'accept' }),
            ],
            ['@a:server']
        );
        expect(state.incoming).toEqual([]);
        expect(state.accepted).toEqual([]);
    });

    it('de-duplicates within a bucket', () => {
        const state = deriveFriendState(
            [
                signal({ otherUserId: '@a:server', action: 'request' }),
                signal({ otherUserId: '@a:server', action: 'request' }),
            ],
            []
        );
        expect(state.incoming).toEqual(['@a:server']);
    });
});
