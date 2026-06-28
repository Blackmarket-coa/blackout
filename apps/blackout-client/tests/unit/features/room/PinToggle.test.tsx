// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({
    pinned: [] as string[],
    power: 100,
    sendStateEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getUserId: () => '@me:server',
        sendStateEvent: (...args: unknown[]) => mocks.sendStateEvent(...args),
    }),
    useMatrixClientOrNull: () => ({}),
}));
vi.mock('../../../../src/app/hooks/useRoomPinnedEvents', () => ({
    useRoomPinnedEvents: () => mocks.pinned,
}));
vi.mock('../../../../src/app/hooks/usePowerLevels', () => ({
    usePowerLevels: () => ({}),
    readPowerLevel: { user: () => mocks.power, state: () => 50 },
}));

// Heavy modules RoomTimeline imports at module load — stubbed so importing the
// module (to reach the exported PinToggle) stays light, mirroring
// RoomTimeline.scroll.test.tsx.
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

import { PinToggle } from '../../../../src/app/features/room/RoomTimeline';

const room = { roomId: '!den:server' } as unknown as Room;

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<PinToggle room={room} eventId="$x:server" />);
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    mocks.pinned = [];
    mocks.power = 100;
    mocks.sendStateEvent.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('PinToggle', () => {
    it('pins an unpinned message by appending its id', async () => {
        mocks.pinned = [];
        const container = await mount();
        const btn = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-message-pin"]'
        );
        expect(btn?.textContent).toContain('Pin');
        await act(async () => {
            btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(mocks.sendStateEvent).toHaveBeenCalledWith('!den:server', 'm.room.pinned_events', {
            pinned: ['$x:server'],
        });
    });

    it('unpins a pinned message by removing its id', async () => {
        mocks.pinned = ['$x:server'];
        const container = await mount();
        const btn = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-message-pin"]'
        );
        expect(btn?.textContent).toContain('Unpin');
        await act(async () => {
            btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(mocks.sendStateEvent).toHaveBeenCalledWith('!den:server', 'm.room.pinned_events', {
            pinned: [],
        });
    });

    it('renders nothing when the viewer lacks pin power', async () => {
        mocks.power = 0;
        const container = await mount();
        expect(container.querySelector('[data-testid="canopy-message-pin"]')).toBeNull();
    });
});
