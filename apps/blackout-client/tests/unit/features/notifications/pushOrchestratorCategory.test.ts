import { describe, expect, it } from 'vitest';
import { resolveCategory } from '../../../../src/app/features/notifications/pushOrchestrator';

describe('resolveCategory', () => {
    it('maps mentions and replies to about-me', () => {
        expect(resolveCategory('mention')).toBe('about_me');
        expect(resolveCategory('reply')).toBe('about_me');
    });

    it('maps subscription firehose events to pulse (digest-only)', () => {
        expect(resolveCategory('subscription')).toBe('pulse');
    });

    it('maps mod_alert to awaits-me (decisions a moderator owes)', () => {
        expect(resolveCategory('mod_alert')).toBe('awaits_me');
    });
});
