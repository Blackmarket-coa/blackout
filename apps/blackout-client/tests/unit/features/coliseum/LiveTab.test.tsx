// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { selectedColiseumTopicIdAtom } from '../../../../src/app/state/coliseum';

// Mutable holders the hoisted mocks read, so each test can vary identity, the
// live session, and the call transport before rendering.
const h = vi.hoisted(() => ({
    currentUserId: '@me:server' as string | null,
    call: null as Record<string, unknown> | null,
    live: null as Record<string, unknown> | null,
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getUserId: () => h.currentUserId }),
    useMatrixClientOrNull: () => ({ getUserId: () => h.currentUserId }),
}));
vi.mock('../../../../src/app/features/call/CallProvider', () => ({
    useOptionalCall: () => h.call,
}));
vi.mock('../../../../src/app/features/coliseum/hooks/useColiseumLive', () => ({
    useColiseumLive: () => h.live,
}));
vi.mock('../../../../src/app/features/coliseum/hooks/useColiseumTopics', () => ({
    useColiseumTopic: () => ({
        data: {
            topic: {
                id: 'topic-1',
                title: 'A debate',
                newsAnchor: {
                    sourceUrl: 'https://x/y',
                    headline: 'h',
                    publishedAt: '2026-05-02T08:00:00Z',
                },
            },
            arguments: [],
        },
        loading: false,
        error: null,
    }),
}));

import { LiveTab } from '../../../../src/app/features/coliseum/tabs/LiveTab';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];
const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

function session(overrides: Record<string, unknown> = {}) {
    return {
        id: 'live-1',
        topicId: 'topic-1',
        roomId: '!debate:server',
        moderatorIds: ['@mod:server'],
        status: 'live',
        speakingQueue: [],
        pinnedEvidence: [],
        createdAt: '2026-05-02T10:00:00Z',
        startedAt: '2026-05-02T10:00:00Z',
        ...overrides,
    };
}

function makeCall(overrides: Record<string, unknown> = {}) {
    return {
        joined: true,
        roomId: '!debate:server',
        muted: false,
        cameraEnabled: false,
        joinCall: vi.fn(),
        leaveCall: vi.fn(),
        setMuted: vi.fn(),
        setCameraEnabled: vi.fn(),
        ...overrides,
    };
}

function makeLive(sess: Record<string, unknown>) {
    return {
        session: sess,
        loading: false,
        error: null,
        refetch: vi.fn(),
        start: vi.fn(),
        requestSpeak: vi.fn(),
        grantSpeak: vi.fn(),
        revokeSpeak: vi.fn(),
        pin: vi.fn(),
        end: vi.fn(),
    };
}

const render = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    store.set(selectedColiseumTopicIdAtom, 'topic-1');
    act(() => {
        root.render(
            <Provider store={store}>
                <LiveTab />
            </Provider>
        );
    });
    mountedRoots.push(root);
    return container;
};

describe('LiveTab publish gating + speaking queue', () => {
    afterEach(() => {
        act(() => {
            mountedRoots.splice(0).forEach((root) => root.unmount());
        });
        document.body.innerHTML = '';
        h.currentUserId = '@me:server';
        h.call = null;
        h.live = null;
    });

    it('moderator sees publish controls and can grant a queued speaker', async () => {
        h.currentUserId = '@mod:server';
        h.call = makeCall();
        const live = makeLive(
            session({
                speakingQueue: [
                    {
                        userId: '@asker:server',
                        state: 'requested',
                        requestedAt: '2026-05-02T10:05:00Z',
                    },
                ],
            })
        );
        h.live = live;
        const container = render();
        await flush();

        expect(
            container.querySelector('[data-testid="coliseum-live-publish-controls"]')
        ).toBeTruthy();
        expect(container.querySelector('[data-testid="coliseum-live-audience-note"]')).toBeNull();

        const grant = container.querySelector(
            '[data-testid="coliseum-live-grant-@asker:server"]'
        ) as HTMLButtonElement;
        expect(grant).toBeTruthy();
        await act(async () => {
            grant.click();
        });
        expect(live.grantSpeak).toHaveBeenCalledWith('@asker:server');
    });

    it('audience joins receive-only: no publish controls, can request to speak, held muted', async () => {
        h.currentUserId = '@lurker:server';
        const call = makeCall({ muted: false });
        h.call = call;
        const live = makeLive(session());
        h.live = live;
        const container = render();
        await flush();

        expect(
            container.querySelector('[data-testid="coliseum-live-publish-controls"]')
        ).toBeNull();
        expect(container.querySelector('[data-testid="coliseum-live-audience-note"]')).toBeTruthy();
        // The receive-only effect forces the audience member muted.
        expect(call.setMuted).toHaveBeenCalledWith(true);

        const request = container.querySelector(
            '[data-testid="coliseum-live-request-speak"]'
        ) as HTMLButtonElement;
        expect(request).toBeTruthy();
        await act(async () => {
            request.click();
        });
        expect(live.requestSpeak).toHaveBeenCalled();
    });

    it('shows the start-session form when no session is active', async () => {
        h.currentUserId = '@me:server';
        h.call = makeCall({ joined: false });
        h.live = makeLive(null as unknown as Record<string, unknown>);
        const container = render();
        await flush();

        expect(container.querySelector('[data-testid="coliseum-live-start"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="coliseum-live-session"]')).toBeNull();
    });
});
