// @vitest-environment jsdom
//
// A media message can carry an expiry policy (`co.blackout.ephemeral`): a time
// and a view limit. Until 2026-11-16 the composer offered it as "Ephemeral
// drop: view-once, 24h". Only this app's timeline acts on the policy, on each
// device, by hiding the file; nothing deletes the file or the message, and
// other apps ignore it. The composer no longer offers it
// (docs/security/trust-claims-2026-11-16.md, T11). Messages already sent with
// a policy are still hidden as their senders asked, and the notice in their
// place says that hiding is all this app does.
import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getUserId: () => '@me:server' }),
    useMatrixClientOrNull: () => ({}),
}));
// Heavy modules RoomTimeline imports at module load, stubbed as in
// PinToggle.test.tsx.
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter', () => ({
    useLegacyRoomTimelineAdapter: () => ({
        data: [],
        loading: false,
        error: null,
        loadMore: vi.fn(),
    }),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTypingAdapter', () => ({
    useLegacyTypingIndicatorAdapter: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../../../../src/app/shell/modalOpenerRegistry', () => ({
    useRegisterModalOpener: () => {},
}));
vi.mock('../../../../src/app/components/messages', () => ({
    AudioMessage: () => null,
    FileMessage: () => null,
    ImageMessage: () => null,
    StickerMessage: () => null,
    VideoMessage: () => null,
}));
vi.mock('../../../../src/app/features/room/Reactions', () => ({ Reactions: () => null }));
vi.mock('../../../../src/app/features/profile/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../../../../src/app/features/rounds/RoundCard', () => ({ RoundCard: () => null }));

import { EphemeralGate } from '../../../../src/app/features/room/RoomTimeline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOUR = 60 * 60 * 1000;

const mediaEvent = (policy?: Record<string, unknown>) =>
    ({
        getId: () => '$drop:server',
        getContent: () => ({
            msgtype: 'm.image',
            body: 'photo.png',
            ...(policy ? { 'co.blackout.ephemeral': { v: 1, ...policy } } : {}),
        }),
    } as never);

const roots: ReactDOM.Root[] = [];

afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = '';
    window.localStorage.clear();
});

const mount = async (node: ReactNode) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    roots.push(root);
    await act(async () => {
        root.render(<Provider store={createStore()}>{node}</Provider>);
    });
    return container;
};

const MEDIA = <div data-testid="media">photo</div>;
const shown = (container: HTMLElement) => !!container.querySelector('[data-testid="media"]');

describe('a file sent with an expiry policy', () => {
    it('limited to one view: hidden, with a notice that hiding is all this app does', async () => {
        const container = await mount(
            <EphemeralGate event={mediaEvent({ maxViews: 1, expiresAtMs: Date.now() + 24 * HOUR })}>
                {MEDIA}
            </EphemeralGate>
        );

        expect(shown(container)).toBe(false);
        expect(container.textContent).toBe(
            '⌛ Hidden by this app: the sender set this file to be shown once. Hiding it here does not delete it.'
        );
    });

    it('limited by time: shown until then', async () => {
        const container = await mount(
            <EphemeralGate event={mediaEvent({ expiresAtMs: Date.now() + 24 * HOUR })}>
                {MEDIA}
            </EphemeralGate>
        );
        expect(shown(container)).toBe(true);
    });

    it('past its time: hidden, with the same notice and its own reason', async () => {
        const container = await mount(
            <EphemeralGate event={mediaEvent({ expiresAtMs: Date.now() - HOUR })}>
                {MEDIA}
            </EphemeralGate>
        );

        expect(shown(container)).toBe(false);
        expect(container.textContent).toBe(
            '⌛ Hidden by this app: the sender set this file to expire. Hiding it here does not delete it.'
        );
    });

    it('without a policy: shown as any file is', async () => {
        const container = await mount(<EphemeralGate event={mediaEvent()}>{MEDIA}</EphemeralGate>);
        expect(shown(container)).toBe(true);
    });
});
