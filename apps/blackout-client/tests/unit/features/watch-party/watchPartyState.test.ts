import { describe, expect, it } from 'vitest';
import {
    DRIFT_HARD_SEEK_MS,
    DRIFT_PAUSED_SEEK_MS,
    DRIFT_RATE_NUDGE_MS,
    PLAYBACK_RATE_MAX,
    RATE_NUDGE_FACTOR,
    canControlParty,
    createWatchParty,
    expectedPositionMs,
    hostAdvance,
    isNewerState,
    isValidSourceUri,
    parseWatchPartyState,
    reconcilePlayback,
    serializeWatchPartyState,
    type WatchPartyState,
} from '../../../../src/app/features/watch-party/watchPartyState';

const HOST = '@host:example.org';

const state = (overrides: Partial<WatchPartyState> = {}): WatchPartyState => ({
    mode: 'shared_player',
    source: { kind: 'url', uri: 'https://cdn.example.org/movie.mp4', title: 'Movie' },
    hostId: HOST,
    status: 'playing',
    positionMs: 60_000,
    updatedTs: 1_000_000,
    playbackRate: 1,
    revision: 3,
    ...overrides,
});

describe('parseWatchPartyState', () => {
    it('returns null for empty/ended parties and junk content', () => {
        expect(parseWatchPartyState(undefined)).toBeNull();
        expect(parseWatchPartyState(null)).toBeNull();
        expect(parseWatchPartyState({})).toBeNull();
        expect(parseWatchPartyState({ mode: 'karaoke', host_id: HOST })).toBeNull();
        expect(parseWatchPartyState({ mode: 'shared_player', host_id: 'not-a-user' })).toBeNull();
    });

    it('round-trips through serialize', () => {
        const original = state();
        expect(parseWatchPartyState(serializeWatchPartyState(original))).toEqual(original);
    });

    it('requires a source except in screenshare mode', () => {
        const noSource = { ...serializeWatchPartyState(state()), source: null };
        expect(parseWatchPartyState(noSource)).toBeNull();
        expect(parseWatchPartyState({ ...noSource, mode: 'screenshare' })?.mode).toBe(
            'screenshare'
        );
    });

    it('rejects unsafe source URIs', () => {
        const base = serializeWatchPartyState(state());
        const withUri = (kind: string, uri: string) => ({ ...base, source: { kind, uri } });
        expect(parseWatchPartyState(withUri('url', 'javascript:alert(1)'))).toBeNull();
        expect(
            parseWatchPartyState(withUri('url', 'http://insecure.example/movie.mp4'))
        ).toBeNull();
        expect(parseWatchPartyState(withUri('mxc', 'https://not-mxc.example/x'))).toBeNull();
        expect(parseWatchPartyState(withUri('mxc', 'mxc://srv/abc123'))).not.toBeNull();
    });

    it('clamps rate and floors negative positions', () => {
        const parsed = parseWatchPartyState({
            ...serializeWatchPartyState(state()),
            playback_rate: 99,
            position_ms: -5,
        });
        expect(parsed?.playbackRate).toBe(PLAYBACK_RATE_MAX);
        expect(parsed?.positionMs).toBe(0);
    });
});

describe('isValidSourceUri', () => {
    it('accepts https for url/hls and mxc for uploads only', () => {
        expect(isValidSourceUri('url', 'https://a.example/v.mp4')).toBe(true);
        expect(isValidSourceUri('hls', 'https://a.example/live.m3u8')).toBe(true);
        expect(isValidSourceUri('url', 'data:text/html,x')).toBe(false);
        expect(isValidSourceUri('mxc', 'mxc://srv/id-42')).toBe(true);
        expect(isValidSourceUri('mxc', 'mxc://srv/bad path')).toBe(false);
    });
});

describe('createWatchParty / hostAdvance / isNewerState', () => {
    it('creates a paused party at position 0, revision 1', () => {
        const party = createWatchParty({
            mode: 'shared_player',
            source: state().source,
            hostId: HOST,
            nowTs: 42,
        });
        expect(party).toMatchObject({
            status: 'paused',
            positionMs: 0,
            revision: 1,
            updatedTs: 42,
        });
    });

    it('screenshare parties drop any provided source', () => {
        const party = createWatchParty({
            mode: 'screenshare',
            source: state().source,
            hostId: HOST,
            nowTs: 42,
        });
        expect(party.source).toBeNull();
    });

    it('hostAdvance bumps revision, stamps the clock, clamps the patch', () => {
        const next = hostAdvance(state(), { positionMs: -10, playbackRate: 100 }, 2_000_000);
        expect(next.revision).toBe(4);
        expect(next.updatedTs).toBe(2_000_000);
        expect(next.positionMs).toBe(0);
        expect(next.playbackRate).toBe(PLAYBACK_RATE_MAX);
    });

    it('isNewerState orders by revision then timestamp', () => {
        expect(isNewerState(null, state())).toBe(true);
        expect(isNewerState(state({ revision: 3 }), state({ revision: 4 }))).toBe(true);
        expect(isNewerState(state({ revision: 4 }), state({ revision: 3 }))).toBe(false);
        expect(
            isNewerState(state({ revision: 3, updatedTs: 5 }), state({ revision: 3, updatedTs: 6 }))
        ).toBe(true);
    });
});

describe('canControlParty', () => {
    it('grants the host and moderators, denies plain members', () => {
        expect(canControlParty(state(), HOST, 0)).toBe(true);
        expect(canControlParty(state(), '@viewer:example.org', 0)).toBe(false);
        expect(canControlParty(state(), '@mod:example.org', 50)).toBe(true);
        expect(canControlParty(null, '@mod:example.org', 50)).toBe(true);
        expect(canControlParty(null, '@viewer:example.org', 0)).toBe(false);
    });
});

describe('expectedPositionMs', () => {
    it('extrapolates while playing and freezes while paused', () => {
        const playing = state({ positionMs: 1_000, updatedTs: 10_000, playbackRate: 2 });
        expect(expectedPositionMs(playing, 15_000)).toBe(1_000 + 5_000 * 2);
        expect(expectedPositionMs(state({ status: 'paused', positionMs: 1_000 }), 99_999)).toBe(
            1_000
        );
    });

    it('ignores a host clock ahead of ours', () => {
        const ahead = state({ positionMs: 1_000, updatedTs: 50_000 });
        expect(expectedPositionMs(ahead, 40_000)).toBe(1_000);
    });
});

describe('reconcilePlayback', () => {
    const now = 1_000_000;
    const playingAt = (localMs: number, expectedMs: number) =>
        reconcilePlayback(
            { positionMs: localMs, paused: false, playbackRate: 1 },
            state({ positionMs: expectedMs, updatedTs: now }),
            now
        );

    it('hard-seeks when drift exceeds the threshold', () => {
        const target = playingAt(0, DRIFT_HARD_SEEK_MS + 1_000);
        expect(target.play).toBe(true);
        expect(target.seekToMs).toBe(DRIFT_HARD_SEEK_MS + 1_000);
    });

    it('nudges the rate for small drift instead of seeking', () => {
        const behind = playingAt(0, DRIFT_RATE_NUDGE_MS + 100);
        expect(behind.seekToMs).toBeNull();
        expect(behind.playbackRate).toBeCloseTo(1 + RATE_NUDGE_FACTOR);

        const aheadMs = DRIFT_RATE_NUDGE_MS + 100;
        const ahead = playingAt(aheadMs, 0);
        expect(ahead.seekToMs).toBeNull();
        expect(ahead.playbackRate).toBeCloseTo(1 - RATE_NUDGE_FACTOR);
    });

    it('holds the base rate when aligned', () => {
        const aligned = playingAt(100, 150);
        expect(aligned).toEqual({ play: true, seekToMs: null, playbackRate: 1 });
    });

    it('pauses followers and re-aligns a drifted paused playhead', () => {
        const paused = state({ status: 'paused', positionMs: 10_000 });
        const near = reconcilePlayback(
            { positionMs: 10_000 + DRIFT_PAUSED_SEEK_MS - 1, paused: true, playbackRate: 1 },
            paused,
            now
        );
        expect(near).toEqual({ play: false, seekToMs: null, playbackRate: 1 });

        const far = reconcilePlayback(
            { positionMs: 0, paused: false, playbackRate: 1 },
            paused,
            now
        );
        expect(far.play).toBe(false);
        expect(far.seekToMs).toBe(10_000);
    });

    it('never seeks a live event, only mirrors play state', () => {
        const live = state({ mode: 'live_event', positionMs: 0, updatedTs: 0 });
        const target = reconcilePlayback(
            { positionMs: 999_999, paused: true, playbackRate: 1 },
            live,
            now
        );
        expect(target).toEqual({ play: true, seekToMs: null, playbackRate: 1 });
    });
});
