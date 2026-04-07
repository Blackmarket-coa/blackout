// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';

vi.mock('../../../../src/app/features/call/CallProvider', () => ({
    useCall: () => ({
        roomId: '!room:example.org',
        joined: true,
        muted: false,
        deafened: false,
        cameraEnabled: false,
        screenSharing: false,
        focusUrl: null,
        focusStatus: 'degraded',
        focusReason: 'jwt timeout',
        focusMessage:
            'Call provider is degraded (jwt timeout). Retry shortly or continue in widget fallback mode.',
        membership: { '@alice:example.org': { userId: '@alice:example.org', membership: 'joined' } },
        audioLevels: {},
        joinCall: vi.fn(),
        leaveCall: vi.fn(),
        setMuted: vi.fn(),
        setDeafened: vi.fn(),
        setCameraEnabled: vi.fn(),
        setScreenSharing: vi.fn(),
        updateAudioLevels: vi.fn(),
        preferredAudioDeviceId: null,
        preferredVideoDeviceId: null,
        setPreferredAudioDeviceId: vi.fn(),
        setPreferredVideoDeviceId: vi.fn(),
    }),
}));

vi.mock('../../../../src/app/features/call/CallWidget', () => ({
    CallWidget: ({ mode }: { mode: string }) => <div data-testid="call-widget-mode">{mode}</div>,
}));

vi.mock('../../../../src/app/features/call/CallControls', () => ({
    CallControls: () => <div>controls</div>,
}));

vi.mock('../../../../src/app/features/call/SpeakingIndicator', () => ({
    SpeakingIndicator: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { VoiceChannel } from '../../../../src/app/features/call/VoiceChannel';

describe('VoiceChannel degraded fallback', () => {
    it('shows actionable degraded messaging and uses widget mode', async () => {
        const container = document.createElement('div');
        const root = ReactDOM.createRoot(container);
        document.body.appendChild(container);

        await act(async () => {
            root.render(
                <VoiceChannel
                    roomId="!room:example.org"
                    title="Ops Voice"
                    members={[{ userId: '@alice:example.org', name: 'Alice' } as never]}
                    activeRoomId="!room:example.org"
                />,
            );
            await Promise.resolve();
        });

        const degraded = container.querySelector('[data-testid="call-provider-degraded"]');
        const mode = container.querySelector('[data-testid="call-widget-mode"]');
        expect(degraded).toBeTruthy();
        expect(degraded?.textContent).toContain('widget fallback mode');
        expect(mode?.textContent).toBe('widget');

        root.unmount();
    });
});
