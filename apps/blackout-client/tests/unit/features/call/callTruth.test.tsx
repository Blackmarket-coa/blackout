// @vitest-environment jsdom
//
// The threat model said call media is "Mitigated: per-call media E2EE ... is
// negotiated by default in CallProvider.tsx", and the trust page that it "is
// negotiated by default". The call provider asks the Matrix SDK for
// `matrixRTC.startRoomSession`; the SDK the app ships with (matrix-js-sdk
// 40.2.0) has no such method, so no call ever starts that way and no media
// key is negotiated. The provider then marked the call as joined anyway: the
// voice channel said "Connected" and "LIVE", the banner said "Retry shortly",
// and the page loaded Element Call from call.element.io, with the room's ID,
// without saying whose page it was. The tests that covered calls gave the
// provider a client with a `startRoomSession` the real SDK does not have.
// docs/security/trust-claims-2026-11-16.md, T17.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { createClient } from 'matrix-js-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The client the provider gets has the real SDK's `matrixRTC`.
const realClient = createClient({ baseUrl: 'https://hs.example' });
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => realClient,
}));
vi.mock('../../../../src/app/sdk/client', () => ({
    clientQueries: { getWellKnownMatrixClient: vi.fn(async () => ({})) },
}));

import { CallProvider, useCall } from '../../../../src/app/features/call/CallProvider';
import { VoiceChannel } from '../../../../src/app/features/call/VoiceChannel';
import { CallWidget } from '../../../../src/app/features/call/CallWidget';
import { EncryptionBadge } from '../../../../src/app/features/call/EncryptionBadge';
import { getActionableCallMessage } from '../../../../src/app/features/call/callHealth';

const roots: ReactDOM.Root[] = [];
afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = '';
});

const mount = async (node: React.ReactNode) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    roots.push(root);
    await act(async () => {
        root.render(<CallProvider>{node}</CallProvider>);
    });
    return container;
};

const click = async (el: Element | null | undefined) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
};

describe('calls with the Matrix SDK the app ships with', () => {
    it('the SDK has no matrixRTC.startRoomSession, which the call provider needs', () => {
        const manager = realClient.matrixRTC as unknown as Record<string, unknown>;
        expect(manager).toBeDefined();
        expect(manager.startRoomSession).toBeUndefined();
    });

    it('joining a voice channel does not say Connected or LIVE, and says no media encryption', async () => {
        const container = await mount(
            <>
                <VoiceChannel
                    roomId="!voice:hs.example"
                    title="Voice"
                    members={[]}
                    activeRoomId={null}
                />
                <EncryptionBadge />
            </>
        );
        const join = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Join Voice'
        );
        await click(join);

        expect(container.textContent).not.toContain('Connected');
        expect(container.querySelector('[data-testid="voice-room-live-badge"]')).toBeNull();
        expect(container.textContent).toContain('Not connected');
        expect(container.textContent).toContain('No media E2EE');
    });

    it('the banner says why calls cannot start, and does not say to retry', () => {
        const message = getActionableCallMessage(
            'degraded',
            'matrixRTC startRoomSession unavailable'
        );
        expect(message).not.toMatch(/retry shortly/i);
        expect(message).toBe(
            'Calls cannot start in this version of the app: the Matrix library it is built with does not have the call session it uses, so retrying will not help.'
        );
    });
});

describe('Element Call from call.element.io', () => {
    it('is not loaded until it is asked for, and says whose it is first', async () => {
        const container = await mount(<CallWidget roomId="!voice:hs.example" mode="widget" />);

        expect(container.querySelector('iframe')).toBeNull();
        expect(container.textContent).toContain(
            "Element Call opens here as a page from call.element.io, a service run by Element, not by this server. Opening it sends that service your network address and this room's ID."
        );

        const open = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Open Element Call'
        );
        await click(open);
        const frame = container.querySelector('iframe');
        expect(frame?.getAttribute('src')).toMatch(/^https:\/\/call\.element\.io\//);
    });

    it('in its other mode too', async () => {
        const container = await mount(<CallWidget roomId="!voice:hs.example" mode="sdk" />);
        expect(container.querySelector('iframe')).toBeNull();
    });
});
