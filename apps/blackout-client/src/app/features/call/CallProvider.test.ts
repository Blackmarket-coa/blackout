import { describe, expect, it } from 'vitest';
import { buildRtcSessionOptions } from './CallProvider';
import { describeE2eeBadge } from './EncryptionBadge';

describe('buildRtcSessionOptions', () => {
    it('enables manageMediaKeys for symmetric (default) E2EE', () => {
        const opts = buildRtcSessionOptions('symmetric', 'https://livekit.example.com');
        expect(opts.manageMediaKeys).toBe(true);
        expect(opts.encryptionMode).toBe('symmetric');
        expect(opts.focusPreferred).toEqual(['https://livekit.example.com']);
    });

    it('selects broadcast mode for townhall sender-keys', () => {
        const opts = buildRtcSessionOptions('broadcast', 'https://livekit.example.com');
        expect(opts.manageMediaKeys).toBe(true);
        expect(opts.encryptionMode).toBe('broadcast');
    });

    it('disables key management when E2EE is explicitly off', () => {
        const opts = buildRtcSessionOptions('off', null);
        expect(opts.manageMediaKeys).toBe(false);
    });

    it('omits focusPreferred when no focus URL is configured', () => {
        const opts = buildRtcSessionOptions('symmetric', null);
        expect(opts.focusPreferred).toBeUndefined();
    });
});

describe('describeE2eeBadge', () => {
    it('shows good tone when symmetric E2EE is active', () => {
        const v = describeE2eeBadge({ mode: 'symmetric', status: 'active', reason: 'ok' });
        expect(v.tone).toBe('good');
        expect(v.label).toBe('End-to-end encrypted');
    });

    it('labels broadcast mode distinctly', () => {
        const v = describeE2eeBadge({ mode: 'broadcast', status: 'active', reason: 'ok' });
        expect(v.tone).toBe('good');
        expect(v.label).toBe('Broadcast E2EE');
    });

    it('warns when E2EE is explicitly disabled', () => {
        const v = describeE2eeBadge({ mode: 'off', status: 'disabled', reason: 'caller opted out' });
        expect(v.tone).toBe('warn');
        expect(v.label).toBe('Transport-only');
    });

    it('errors when E2EE could not be negotiated', () => {
        const v = describeE2eeBadge({ mode: 'symmetric', status: 'unavailable', reason: 'sdk missing' });
        expect(v.tone).toBe('bad');
        expect(v.label).toBe('No media E2EE');
    });
});
