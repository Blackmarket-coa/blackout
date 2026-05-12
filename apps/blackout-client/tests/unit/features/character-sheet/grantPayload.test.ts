import { describe, expect, it } from 'vitest';
import {
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
