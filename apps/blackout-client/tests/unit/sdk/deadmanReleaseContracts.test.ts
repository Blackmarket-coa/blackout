/**
 * The dead-man release's wire contracts (`packages/blackout-protocol/src/deadman/`):
 * the notice says nothing about anyone and points with exactly two fields,
 * and a release switch, which has no room, is still a dead-man envelope.
 * docs/security/release-envelope-2026-10-26.md §11; design §5.
 */
import { describe, expect, it } from 'vitest';
import {
    DEADMAN_EVENT_NAMES,
    DEADMAN_NOTICE_BODY,
    DEADMAN_NOTICE_POINTER_FIELD,
    DEADMAN_NOTICE_ROOM_NAME,
    DEADMAN_NOTICE_SCHEMA_VERSION,
    isDeadmanSwitchCheckedIn,
    parseDeadmanNoticePointer,
} from '@blackout/protocol';

describe('the notice', () => {
    it("is the design's fixed body, and names no one, no time and no dead-man switch", () => {
        expect(DEADMAN_NOTICE_BODY).toBe(
            "There is something new for you in Blackout. Open Blackout to see it. This room is not end-to-end encrypted, so please don't reply here."
        );
        expect(DEADMAN_NOTICE_BODY).not.toMatch(/dead|switch|release|@|\d/i);
        expect(DEADMAN_NOTICE_ROOM_NAME).toBe('Blackout notices');
        expect(DEADMAN_NOTICE_POINTER_FIELD).toBe('co.bmc.deadman.release');
    });

    it('points with a schema version and a release id, and nothing else', () => {
        const pointer = { schemaVersion: DEADMAN_NOTICE_SCHEMA_VERSION, releaseId: 'r-1' };
        expect(parseDeadmanNoticePointer(pointer)).toEqual(pointer);
        for (const bad of [
            { ...pointer, ownerId: 'someone' },
            { schemaVersion: 2, releaseId: 'r-1' },
            { schemaVersion: 1, releaseId: '' },
            { schemaVersion: 1, releaseId: 'x'.repeat(65) },
            { schemaVersion: 1 },
            [pointer],
            null,
            'r-1',
        ]) {
            expect(parseDeadmanNoticePointer(bad)).toBeNull();
        }
    });
});

describe('a release switch, which has no room', () => {
    const payload = {
        switchId: '7e1f0d2c-3b4a-4596-8a7b-6c5d4e3f2a1b',
        ownerId: 'owner',
        roomId: null,
        status: 'armed',
        checkInIntervalSeconds: 60,
        gracePeriodSeconds: 60,
        lastCheckInAt: '2026-10-26T00:00:00.000Z',
        triggerAt: '2026-10-26T00:01:00.000Z',
        releaseAt: '2026-10-26T00:02:00.000Z',
        recipients: ['recipient'],
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
        releaseFormat: 'release-v1',
    };
    const envelope = (roomId: unknown, payloadRoomId: unknown) => ({
        event: DEADMAN_EVENT_NAMES.checkedIn,
        roomId,
        senderId: 'owner',
        occurredAt: '2026-10-26T00:00:00.000Z',
        payload: { ...payload, roomId: payloadRoomId },
    });

    it('is a checked-in envelope with a null room, as a legacy one is with a room', () => {
        expect(isDeadmanSwitchCheckedIn(envelope(null, null))).toBe(true);
        expect(isDeadmanSwitchCheckedIn(envelope('!room:x', '!room:x'))).toBe(true);
    });

    it('is not one with a room that is neither a string nor null', () => {
        expect(isDeadmanSwitchCheckedIn(envelope(undefined, null))).toBe(false);
        expect(isDeadmanSwitchCheckedIn(envelope(null, 42))).toBe(false);
    });
});
