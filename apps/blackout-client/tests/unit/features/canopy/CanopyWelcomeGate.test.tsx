// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({
    seen: false,
    markSeen: vi.fn().mockResolvedValue(undefined),
    navigateRoom: vi.fn(),
}));

vi.mock('../../../../src/app/features/welcome/useWelcome', () => ({
    WELCOME_EVENT_TYPE: 'co.bmc.welcome',
    useCanopyWelcomeSeen: () => ({ seen: mocks.seen, markSeen: mocks.markSeen }),
}));

vi.mock('../../../../src/app/features/welcome/WelcomeScreen', () => ({
    WelcomeScreen: ({
        onPickChannel,
        onJoinOrExplore,
    }: {
        onPickChannel?: (roomId: string) => void;
        onJoinOrExplore?: () => void;
    }) => (
        <div data-testid="welcome-screen">
            <button data-testid="ws-pick" onClick={() => onPickChannel?.('!den:server')} />
            <button data-testid="ws-join" onClick={() => onJoinOrExplore?.()} />
        </div>
    ),
}));

vi.mock('../../../../src/app/hooks/useRoomNavigate', () => ({
    useRoomNavigate: () => ({ navigateRoom: mocks.navigateRoom }),
}));

import { CanopyWelcomeGate } from '../../../../src/app/features/canopy/CanopyWelcomeGate';

const makeCanopy = (configured: boolean): Room =>
    ({
        roomId: '!canopy:server',
        name: 'Canopy',
        currentState: { getStateEvents: () => (configured ? ({} as never) : null) },
    } as unknown as Room);

const mount = async (canopy: Room) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<CanopyWelcomeGate canopy={canopy} />);
        await Promise.resolve();
    });
    return container;
};

const click = (el: Element | null) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
    document.body.innerHTML = '';
    mocks.seen = false;
    mocks.markSeen.mockClear();
    mocks.navigateRoom.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CanopyWelcomeGate', () => {
    it('shows the welcome when configured and unseen', async () => {
        const container = await mount(makeCanopy(true));
        expect(container.querySelector('[data-testid="canopy-welcome-overlay"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="welcome-screen"]')).not.toBeNull();
    });

    it('renders nothing when already seen', async () => {
        mocks.seen = true;
        const container = await mount(makeCanopy(true));
        expect(container.querySelector('[data-testid="canopy-welcome-overlay"]')).toBeNull();
    });

    it('renders nothing when the canopy has no welcome event', async () => {
        const container = await mount(makeCanopy(false));
        expect(container.querySelector('[data-testid="canopy-welcome-overlay"]')).toBeNull();
    });

    it('marks seen and dismisses on close', async () => {
        const container = await mount(makeCanopy(true));
        await act(async () => {
            click(container.querySelector('[data-testid="canopy-welcome-close"]'));
            await Promise.resolve();
        });
        expect(mocks.markSeen).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[data-testid="canopy-welcome-overlay"]')).toBeNull();
    });

    it('navigates and marks seen when a featured den is picked', async () => {
        const container = await mount(makeCanopy(true));
        await act(async () => {
            click(container.querySelector('[data-testid="ws-pick"]'));
            await Promise.resolve();
        });
        expect(mocks.navigateRoom).toHaveBeenCalledWith('!den:server');
        expect(mocks.markSeen).toHaveBeenCalledTimes(1);
    });
});
