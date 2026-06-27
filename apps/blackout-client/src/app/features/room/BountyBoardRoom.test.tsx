import { describe, it, expect } from 'vitest';
import {
    isBountyBoardRoomType,
    isBountyStateContent,
    isRoomTypeContent,
} from '@blackout/protocol';

describe('bounty-board room markers', () => {
    it('detects a bounty_board room_type', () => {
        expect(isBountyBoardRoomType({ type: 'bounty_board' })).toBe(true);
        expect(isBountyBoardRoomType({ type: 'chat' })).toBe(false);
        expect(isBountyBoardRoomType({})).toBe(false);
    });

    it('validates room_type content', () => {
        expect(isRoomTypeContent({ type: 'broadcast' })).toBe(true);
        expect(isRoomTypeContent({ type: 'nope' })).toBe(false);
    });

    it('validates a bounty state event', () => {
        expect(
            isBountyStateContent({
                bountyId: 'b1',
                title: 'Edit my clip',
                description: 'Cut a 60s highlight',
                rewardSummary: '$50',
                status: 'open',
                creatorId: '@creator:bmc',
                createdAt: '2026-01-01T00:00:00Z',
            }),
        ).toBe(true);
    });

    it('rejects a bounty with an unknown status', () => {
        expect(
            isBountyStateContent({
                bountyId: 'b1',
                title: 'x',
                description: '',
                rewardSummary: '$1',
                status: 'archived',
                creatorId: '@c:bmc',
                createdAt: '2026-01-01T00:00:00Z',
            }),
        ).toBe(false);
    });
});
