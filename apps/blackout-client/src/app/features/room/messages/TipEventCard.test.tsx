import { describe, it, expect } from 'vitest';
import { TIP_EVENT_TYPE, buildTipMessageContent } from '@blackout/protocol';
import { normalizeTipEventContent } from './TipEventCard';

const validTip = {
    schemaVersion: 1,
    tipId: 't_1',
    fromMxid: '@alice:bmc',
    toMxid: '@bob:bmc',
    amountCents: 500,
    currency: 'USD',
    note: 'great work',
    occurredAt: '2026-01-01T00:00:00Z',
};

describe('normalizeTipEventContent', () => {
    it('detects a valid co.bmc.tip block', () => {
        const content = buildTipMessageContent(validTip);
        const tip = normalizeTipEventContent(content);
        expect(tip).not.toBeNull();
        expect(tip?.tipId).toBe('t_1');
        expect(tip?.amountCents).toBe(500);
    });

    it('returns null for an ordinary message', () => {
        expect(normalizeTipEventContent({ msgtype: 'm.text', body: 'hi' })).toBeNull();
    });

    it('returns null when the tip block is malformed', () => {
        expect(
            normalizeTipEventContent({ [TIP_EVENT_TYPE]: { tipId: 't', amountCents: -1 } }),
        ).toBeNull();
    });

    it('embeds a plaintext fallback body for non-Blackout clients', () => {
        const content = buildTipMessageContent(validTip);
        expect(content.msgtype).toBe('m.notice');
        expect(String(content.body)).toContain('tipped');
    });
});
