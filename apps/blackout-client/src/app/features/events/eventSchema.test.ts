import { describe, expect, it } from 'vitest';
import {
    EVENT_STATE_TYPE,
    REACTION_KEY_TO_RSVP,
    RSVP_REACTION_KEY,
    buildEventStateContent,
    parseEventStateContent,
} from './eventSchema';

describe('parseEventStateContent', () => {
    it('returns null on non-object input', () => {
        expect(parseEventStateContent(null)).toBeNull();
        expect(parseEventStateContent('not-an-event')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
        expect(
            parseEventStateContent({ description: 'no title', startsAt: '2025-01-01T00:00:00Z' })
        ).toBeNull();
        expect(
            parseEventStateContent({ title: 'no description', startsAt: '2025-01-01T00:00:00Z' })
        ).toBeNull();
        expect(parseEventStateContent({ title: 'no time', description: 'd' })).toBeNull();
        expect(
            parseEventStateContent({
                title: 'invalid time',
                description: 'd',
                startsAt: 'not-iso',
            })
        ).toBeNull();
    });

    it('keeps optional fields and falls back visibility to "public"', () => {
        const parsed = parseEventStateContent({
            title: ' Aid drive ',
            description: ' Bring jackets ',
            startsAt: '2025-06-01T00:00:00Z',
            endsAt: '2025-06-01T02:00:00Z',
            location: ' Park bench ',
            tags: ['Mutual-Aid', '  '],
            visibility: 'unknown',
        });
        expect(parsed).toEqual({
            version: 1,
            title: 'Aid drive',
            description: 'Bring jackets',
            startsAt: '2025-06-01T00:00:00Z',
            endsAt: '2025-06-01T02:00:00Z',
            location: 'Park bench',
            tags: ['mutual-aid'],
            visibility: 'public',
        });
    });

    it('respects an explicit visibility value', () => {
        const parsed = parseEventStateContent({
            title: 'A',
            description: 'B',
            startsAt: '2025-06-01T00:00:00Z',
            visibility: 'members_only',
        });
        expect(parsed?.visibility).toBe('members_only');
    });
});

describe('buildEventStateContent', () => {
    it('builds a minimal payload with default visibility', () => {
        const built = buildEventStateContent({
            title: 'Garden gathering',
            description: 'BYO trowel',
            startsAt: new Date('2025-06-15T18:00:00Z'),
        });
        expect(built).toEqual({
            version: 1,
            title: 'Garden gathering',
            description: 'BYO trowel',
            startsAt: '2025-06-15T18:00:00.000Z',
            visibility: 'public',
        });
    });

    it('includes optional fields and lowercases tags', () => {
        const built = buildEventStateContent({
            title: 'X',
            description: 'Y',
            startsAt: '2025-06-15T18:00:00Z',
            endsAt: '2025-06-15T20:00:00Z',
            location: 'Den 4',
            tags: ['Garden', 'mutual-Aid', '  '],
            visibility: 'private',
        });
        expect(built.endsAt).toBe('2025-06-15T20:00:00Z');
        expect(built.location).toBe('Den 4');
        expect(built.tags).toEqual(['garden', 'mutual-aid']);
        expect(built.visibility).toBe('private');
    });
});

describe('RSVP reaction key tables', () => {
    it('exposes the canonical event type marker', () => {
        expect(EVENT_STATE_TYPE).toBe('co.bmc.event');
    });

    it('round-trips between RsvpKind and reaction emoji', () => {
        for (const kind of ['yes', 'no', 'maybe'] as const) {
            const emoji = RSVP_REACTION_KEY[kind];
            expect(REACTION_KEY_TO_RSVP[emoji]).toBe(kind);
        }
    });
});
