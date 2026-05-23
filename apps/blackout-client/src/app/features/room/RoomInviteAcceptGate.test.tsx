// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A controllable Matrix client stub. `membership` is what
// `getRoom().getMyMembership()` reports; `joinRoom` is supplied per-test.
let membership: string | null = 'invite';
const joinRoom = vi.fn();
const listeners = new Set<(room: { roomId: string; getMyMembership: () => string }) => void>();
const mx = {
    getRoom: (_roomId: string) => ({ getMyMembership: () => membership }),
    joinRoom: (roomId: string) => joinRoom(roomId),
    on: (_event: unknown, handler: never) => listeners.add(handler as never),
    off: (_event: unknown, handler: never) => listeners.delete(handler as never),
};

vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClient: () => mx,
}));

import { RoomInviteAcceptGate } from './RoomInviteAcceptGate';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <RoomInviteAcceptGate roomId="!den:srv">
                <div data-testid="room-content">timeline</div>
            </RoomInviteAcceptGate>,
        );
        await flush();
    });
    return { container, root };
};

describe('RoomInviteAcceptGate', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        membership = 'invite';
        joinRoom.mockReset();
        listeners.clear();
        vi.useRealTimers();
    });

    it('renders children immediately when membership is already join', async () => {
        membership = 'join';
        joinRoom.mockResolvedValue(undefined);
        const { container } = await mount();
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
        expect(joinRoom).not.toHaveBeenCalled();
    });

    it('auto-joins on mount and renders children once the join succeeds', async () => {
        joinRoom.mockResolvedValue(undefined);
        const { container } = await mount();
        // First it shows the joining state, then flips to content.
        await act(async () => {
            await flush();
        });
        expect(joinRoom).toHaveBeenCalledWith('!den:srv');
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
    });

    it('shows a manual Join button after repeated join failures', async () => {
        vi.useFakeTimers();
        joinRoom.mockRejectedValue(new Error('M_FORBIDDEN'));
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <RoomInviteAcceptGate roomId="!den:srv">
                    <div data-testid="room-content">timeline</div>
                </RoomInviteAcceptGate>,
            );
        });
        // Advance through all five attempts and their backoff sleeps
        // (400+800+1200+1600+2000ms = 6000ms across the five tries).
        await act(async () => {
            await vi.advanceTimersByTimeAsync(7000);
        });
        expect(joinRoom).toHaveBeenCalledTimes(5);
        expect(container.querySelector('[data-testid="room-content"]')).toBeNull();
        const button = Array.from(container.querySelectorAll('button')).find((b) =>
            /join den/i.test(b.textContent ?? ''),
        );
        expect(button).toBeTruthy();
    });
});
