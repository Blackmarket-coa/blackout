import { describe, expect, it } from 'vitest';
import {
    EPHEMERAL_CONTENT_KEY,
    buildEphemeralContent,
    evaluateEphemeral,
    parseEphemeralPolicy,
} from '../../../../src/app/features/ephemeral/ephemeralPolicy';

describe('buildEphemeralContent', () => {
    it('emits a versioned block with the provided limits', () => {
        const content = buildEphemeralContent({ expiresAtMs: 1000, maxViews: 3 });
        expect(content).toEqual({
            [EPHEMERAL_CONTENT_KEY]: { v: 1, expiresAtMs: 1000, maxViews: 3 },
        });
    });

    it('drops non-positive / missing limits and returns null when empty', () => {
        expect(buildEphemeralContent({ maxViews: 5 })).toEqual({
            [EPHEMERAL_CONTENT_KEY]: { v: 1, maxViews: 5 },
        });
        expect(buildEphemeralContent({ expiresAtMs: 0, maxViews: 0 })).toBeNull();
        expect(buildEphemeralContent({})).toBeNull();
    });
});

describe('parseEphemeralPolicy', () => {
    it('round-trips a built block', () => {
        const content = buildEphemeralContent({ expiresAtMs: 2000, maxViews: 1 })!;
        expect(parseEphemeralPolicy(content)).toEqual({ expiresAtMs: 2000, maxViews: 1 });
    });

    it('returns null for non-ephemeral or malformed content', () => {
        expect(parseEphemeralPolicy({ msgtype: 'm.image' })).toBeNull();
        expect(parseEphemeralPolicy(null)).toBeNull();
        expect(parseEphemeralPolicy({ [EPHEMERAL_CONTENT_KEY]: { v: 1 } })).toBeNull();
        expect(
            parseEphemeralPolicy({ [EPHEMERAL_CONTENT_KEY]: { expiresAtMs: -1, maxViews: 'x' } })
        ).toBeNull();
    });
});

describe('evaluateEphemeral', () => {
    const policy = { expiresAtMs: 1000, maxViews: 2 };

    it('is live before any limit is hit', () => {
        expect(evaluateEphemeral(policy, { now: 500, views: 0 })).toEqual({
            expired: false,
            reason: null,
        });
    });

    it('expires on time, taking precedence over views', () => {
        expect(evaluateEphemeral(policy, { now: 1000, views: 0 })).toEqual({
            expired: true,
            reason: 'time',
        });
    });

    it('expires on views once the max is reached', () => {
        expect(evaluateEphemeral(policy, { now: 0, views: 2 })).toEqual({
            expired: true,
            reason: 'views',
        });
    });

    it('treats omitted limits as unlimited', () => {
        expect(evaluateEphemeral({ maxViews: 1 }, { now: 9e15, views: 0 }).expired).toBe(false);
        expect(evaluateEphemeral({ expiresAtMs: 10 }, { now: 0, views: 9999 }).expired).toBe(false);
    });
});
