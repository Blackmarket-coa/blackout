import { describe, expect, it } from 'vitest';
import {
    getActionableCallMessage,
    resolveLivekitFocusFromWellKnown,
} from '../../../../src/app/features/call/callHealth';

describe('call focus health helpers', () => {
    it('extracts livekit focus from msc4143 foci payload', () => {
        const focusUrl = resolveLivekitFocusFromWellKnown({
            'org.matrix.msc4143.rtc_foci': [
                { type: 'livekit', livekit_service_url: 'wss://calls.example.org/livekit/sfu' },
            ],
        });
        expect(focusUrl).toBe('wss://calls.example.org/livekit/sfu');
    });

    it('returns actionable degraded messaging', () => {
        expect(getActionableCallMessage('degraded', 'jwt service timeout')).toContain(
            'widget fallback mode',
        );
    });
});
