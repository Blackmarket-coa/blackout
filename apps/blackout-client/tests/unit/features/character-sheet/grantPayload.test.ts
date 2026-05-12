import { describe, expect, it } from 'vitest';
import {
    grantHasSection,
    isCharacterSheetSharedGrantPayload,
    isCharacterSheetSharedGrantTimelineEvent,
} from '@blackout/protocol';

describe('isCharacterSheetSharedGrantPayload', () => {
    it('accepts a minimal grant with just a sharedAt timestamp', () => {
        expect(
            isCharacterSheetSharedGrantPayload({ sharedAt: '2026-05-11T00:00:00Z' }),
        ).toBe(true);
    });

    it('rejects an empty payload (used to revoke; consumers treat as no-grant)', () => {
        expect(isCharacterSheetSharedGrantPayload({})).toBe(false);
    });

    it('rejects non-string sharedAt values', () => {
        expect(isCharacterSheetSharedGrantPayload({ sharedAt: 123 })).toBe(false);
        expect(isCharacterSheetSharedGrantPayload({ sharedAt: null })).toBe(false);
    });

    it('accepts an empty sections array (whole-sheet remainder only)', () => {
        expect(
            isCharacterSheetSharedGrantPayload({
                sharedAt: '2026-05-11T00:00:00Z',
                sections: [],
            }),
        ).toBe(true);
    });

    it('accepts a sections array with known + unknown ids (forward-compat)', () => {
        expect(
            isCharacterSheetSharedGrantPayload({
                sharedAt: '2026-05-11T00:00:00Z',
                sections: ['stats', 'header', 'future-section-id'],
            }),
        ).toBe(true);
    });

    it('rejects sections that aren’t a string array', () => {
        expect(
            isCharacterSheetSharedGrantPayload({
                sharedAt: '2026-05-11T00:00:00Z',
                sections: 'stats',
            }),
        ).toBe(false);
        expect(
            isCharacterSheetSharedGrantPayload({
                sharedAt: '2026-05-11T00:00:00Z',
                sections: [1, 2],
            }),
        ).toBe(false);
    });
});

describe('grantHasSection', () => {
    it('returns false when sections is omitted', () => {
        expect(grantHasSection({ sharedAt: '2026-05-11T00:00:00Z' }, 'stats')).toBe(false);
    });

    it('returns false when the section is not in the list', () => {
        expect(
            grantHasSection(
                { sharedAt: '2026-05-11T00:00:00Z', sections: ['header'] },
                'stats',
            ),
        ).toBe(false);
    });

    it('returns true when the section is opted in', () => {
        expect(
            grantHasSection(
                { sharedAt: '2026-05-11T00:00:00Z', sections: ['stats', 'header'] },
                'stats',
            ),
        ).toBe(true);
    });
});

describe('isCharacterSheetSharedGrantTimelineEvent', () => {
    it('accepts a well-formed timeline envelope', () => {
        expect(
            isCharacterSheetSharedGrantTimelineEvent({
                event: 'blackout.user.sheet.shared',
                roomId: '!room:x',
                senderId: '@holder:x',
                occurredAt: '2026-05-11T00:00:00Z',
                payload: { sharedAt: '2026-05-11T00:00:00Z' },
            }),
        ).toBe(true);
    });

    it('rejects an envelope with the wrong event name', () => {
        expect(
            isCharacterSheetSharedGrantTimelineEvent({
                event: 'blackout.user.quests',
                roomId: '!room:x',
                senderId: '@holder:x',
                occurredAt: '2026-05-11T00:00:00Z',
                payload: { sharedAt: '2026-05-11T00:00:00Z' },
            }),
        ).toBe(false);
    });

    it('rejects an envelope whose payload fails the guard (revoked grant)', () => {
        expect(
            isCharacterSheetSharedGrantTimelineEvent({
                event: 'blackout.user.sheet.shared',
                roomId: '!room:x',
                senderId: '@holder:x',
                occurredAt: '2026-05-11T00:00:00Z',
                payload: {},
            }),
        ).toBe(false);
    });
});
