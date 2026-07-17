import { describe, expect, it } from 'vitest';
import {
    CONTROL_REQUEST_TTL_MS,
    REACTION_BURST_MAX,
    VIEWER_STALE_MS,
    WATCH_PARTY_HEARTBEAT_EVENT_TYPE,
    WATCH_PARTY_REACTION_KEYS,
    WATCH_PARTY_REQUEST_EVENT_TYPE,
    appendBurst,
    collectActiveViewers,
    collectControlRequests,
    parseReactionKey,
    type ReactionBurst,
} from '../../../../src/app/features/watch-party/watchPartyLive';

describe('parseReactionKey', () => {
    it('accepts only palette keys', () => {
        expect(parseReactionKey({ key: '🎉' })).toBe('🎉');
        expect(parseReactionKey({ key: '💣' })).toBeNull();
        expect(parseReactionKey({ key: '<script>' })).toBeNull();
        expect(parseReactionKey({ key: 42 })).toBeNull();
        expect(parseReactionKey(undefined)).toBeNull();
    });

    it('covers every palette key', () => {
        for (const key of WATCH_PARTY_REACTION_KEYS) {
            expect(parseReactionKey({ key })).toBe(key);
        }
    });
});

describe('appendBurst', () => {
    const burst = (id: string): ReactionBurst => ({ id, key: '🎉', senderId: '@a:b' });

    it('appends and caps at REACTION_BURST_MAX, dropping oldest', () => {
        let bursts: ReactionBurst[] = [];
        for (let i = 0; i < REACTION_BURST_MAX + 5; i += 1) {
            bursts = appendBurst(bursts, burst(`b${i}`));
        }
        expect(bursts).toHaveLength(REACTION_BURST_MAX);
        expect(bursts[0].id).toBe('b5');
        expect(bursts.at(-1)?.id).toBe(`b${REACTION_BURST_MAX + 4}`);
    });
});

describe('collectControlRequests', () => {
    const NOW = 1_000_000_000;
    const request = (sender: string, ageMs: number) => ({
        type: WATCH_PARTY_REQUEST_EVENT_TYPE,
        sender,
        originServerTs: NOW - ageMs,
    });

    it('dedupes by sender, drops the host and stale requests, orders oldest-first', () => {
        const requests = collectControlRequests(
            [
                request('@late:x', 1_000),
                request('@early:x', 60_000),
                request('@early:x', 30_000), // duplicate, newer — still one entry
                request('@host:x', 5_000), // the host never queues
                request('@stale:x', CONTROL_REQUEST_TTL_MS + 1), // expired
                { type: 'm.room.message', sender: '@chat:x', originServerTs: NOW }, // unrelated
            ],
            '@host:x',
            NOW
        );
        expect(requests).toEqual(['@early:x', '@late:x']);
    });

    it('returns [] when nothing qualifies', () => {
        expect(collectControlRequests([], '@host:x', NOW)).toEqual([]);
        expect(collectControlRequests([request('@host:x', 0)], '@host:x', NOW)).toEqual([]);
    });
});

describe('collectActiveViewers', () => {
    const NOW = 1_000_000_000;
    const beat = (sender: string, ageMs: number) => ({
        type: WATCH_PARTY_HEARTBEAT_EVENT_TYPE,
        sender,
        originServerTs: NOW - ageMs,
    });

    it('keeps fresh viewers, dedupes by sender, orders most-recent first', () => {
        const viewers = collectActiveViewers(
            [
                beat('@old:x', VIEWER_STALE_MS - 1_000),
                beat('@recent:x', 1_000),
                beat('@recent:x', 5_000), // duplicate, older — latest (1s) wins
                beat('@gone:x', VIEWER_STALE_MS + 1), // stale — dropped
                { type: 'm.room.message', sender: '@chat:x', originServerTs: NOW }, // unrelated
            ],
            NOW
        );
        expect(viewers).toEqual(['@recent:x', '@old:x']);
    });

    it('counts a future-timestamped heartbeat as fresh (clock skew)', () => {
        expect(collectActiveViewers([beat('@ahead:x', -5_000)], NOW)).toEqual(['@ahead:x']);
    });

    it('returns [] with no heartbeats', () => {
        expect(collectActiveViewers([], NOW)).toEqual([]);
    });
});
