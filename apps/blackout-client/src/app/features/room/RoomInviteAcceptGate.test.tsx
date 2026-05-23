// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A controllable Matrix client stub. `membership` is what
// `getRoom(denId).getMyMembership()` reports for the gated den; any other room
// (e.g. the canopy) reports `null` so the gate joins it. `joinRoom` is supplied
// per-test and records the order of room ids it was called with.
let membership: string | null = 'invite';
const joinRoom = vi.fn();
const listeners = new Set<(room: { roomId: string; getMyMembership: () => string }) => void>();
const mx = {
    getRoom: (roomId: string) => ({
        getMyMembership: () => (roomId === '!den:srv' ? membership : null),
    }),
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

    it('auto-joins when membership is still unknown (not yet synced)', async () => {
        membership = null;
        joinRoom.mockResolvedValue(undefined);
        const { container } = await mount();
        await act(async () => {
            await flush();
        });
        expect(joinRoom).toHaveBeenCalledWith('!den:srv');
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
    });

    it('joins the canopy before the den when a canopyId is provided', async () => {
        membership = null;
        joinRoom.mockResolvedValue(undefined);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <RoomInviteAcceptGate roomId="!den:srv" canopyId="!canopy:srv">
                    <div data-testid="room-content">timeline</div>
                </RoomInviteAcceptGate>,
            );
            await flush();
        });
        await act(async () => {
            await flush();
        });
        expect(joinRoom.mock.calls.map((c: unknown[]) => c[0])).toEqual([
            '!canopy:srv',
            '!den:srv',
        ]);
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
    });

    it('does not auto-join a room the user left, but offers a manual Join button', async () => {
        membership = 'leave';
        joinRoom.mockResolvedValue(undefined);
        const { container } = await mount();
        expect(joinRoom).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="room-content"]')).toBeNull();
        const button = Array.from(container.querySelectorAll('button')).find((b) =>
            /join den/i.test(b.textContent ?? ''),
        );
        expect(button).toBeTruthy();
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
