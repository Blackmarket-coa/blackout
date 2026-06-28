// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendStateEvent = vi.fn().mockResolvedValue(undefined);
const room = { roomId: '!den:server' };

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getRoom: () => room,
        getUserId: () => '@me:server',
        sendStateEvent: (...args: unknown[]) => sendStateEvent(...args),
    }),
}));

vi.mock('../../../../src/app/hooks/useRoomPinnedEvents', () => ({
    useRoomPinnedEvents: () => ['$a:server', '$b:server'],
}));

vi.mock('../../../../src/app/hooks/useRoomEvent', () => ({
    useRoomEvent: () => ({ sender: { name: 'Alice' }, getSender: () => '@alice:server' }),
}));

vi.mock('../../../../src/app/hooks/usePowerLevels', () => ({
    usePowerLevels: () => ({}),
    readPowerLevel: { user: () => 100, state: () => 50 },
}));

vi.mock('../../../../src/app/features/right-panel/rightPanelUtils', () => ({
    getTimelineBody: () => 'a pinned message',
}));

vi.mock('../../../../src/app/utils/room', () => ({
    getStateEvent: () => ({ getContent: () => ({ pinned: ['$a:server', '$b:server'] }) }),
}));

import { CanopyPinsPanel } from '../../../../src/app/features/canopy/CanopyPinsPanel';

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<CanopyPinsPanel roomId="!den:server" />);
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
    sendStateEvent.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CanopyPinsPanel', () => {
    it('renders one row per pinned event id', async () => {
        const { container } = await mount();
        expect(container.querySelectorAll('[data-testid="canopy-pin-row"]')).toHaveLength(2);
    });

    it('unpins by rewriting m.room.pinned_events without the removed id', async () => {
        const { container } = await mount();
        const unpin = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-pin-unpin"]'
        );
        await act(async () => {
            unpin?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });

        expect(sendStateEvent).toHaveBeenCalledWith('!den:server', 'm.room.pinned_events', {
            pinned: ['$b:server'],
        });
    });
});
