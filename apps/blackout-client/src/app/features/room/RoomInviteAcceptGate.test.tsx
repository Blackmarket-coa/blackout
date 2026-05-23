// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A controllable Matrix client stub. `membership` is what
// `getRoom().getMyMembership()` reports; `joinRoom` is supplied per-test.
// `encrypted` toggles the room's encryption state event, and `crypto` stands
// in for the rust-crypto module used by the key-recovery phase.
let membership: string | null = 'invite';
let encrypted = false;
let activeBackupVersion: string | null = null;
const joinRoom = vi.fn();
const restoreKeyBackup = vi.fn();
const getActiveSessionBackupVersion = vi.fn(async () => activeBackupVersion);
const listeners = new Set<(room: { roomId: string; getMyMembership: () => string }) => void>();
const mx = {
    getRoom: (_roomId: string) => ({
        getMyMembership: () => membership,
        hasEncryptionStateEvent: () => encrypted,
    }),
    getCrypto: () => ({ getActiveSessionBackupVersion, restoreKeyBackup }),
    joinRoom: (roomId: string) => joinRoom(roomId),
    on: (_event: unknown, handler: never) => listeners.add(handler as never),
    off: (_event: unknown, handler: never) => listeners.delete(handler as never),
};

vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClient: () => mx,
}));

import {
    RoomInviteAcceptGate,
    describeJoinFailure,
    resetKeyRecoveryGuardForTests,
} from './RoomInviteAcceptGate';

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

const findButton = (container: HTMLElement, re: RegExp) =>
    Array.from(container.querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''));

describe('RoomInviteAcceptGate', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        membership = 'invite';
        encrypted = false;
        activeBackupVersion = null;
        joinRoom.mockReset();
        restoreKeyBackup.mockReset().mockResolvedValue(undefined);
        getActiveSessionBackupVersion.mockClear();
        listeners.clear();
        resetKeyRecoveryGuardForTests();
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

    it('does not auto-join a room the user left, but offers a manual Join button', async () => {
        membership = 'leave';
        joinRoom.mockResolvedValue(undefined);
        const { container } = await mount();
        expect(joinRoom).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="room-content"]')).toBeNull();
        expect(findButton(container, /join den/i)).toBeTruthy();
    });

    it('shows a manual Join button and the reason after repeated join failures', async () => {
        vi.useFakeTimers();
        joinRoom.mockRejectedValue({ errcode: 'M_FORBIDDEN', httpStatus: 403 });
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
        // (400+800+1200+1600 = 4000ms between the five tries).
        await act(async () => {
            await vi.advanceTimersByTimeAsync(7000);
        });
        expect(joinRoom).toHaveBeenCalledTimes(5);
        expect(container.querySelector('[data-testid="room-content"]')).toBeNull();
        expect(findButton(container, /join den/i)).toBeTruthy();
        // The categorized reason is surfaced, not the opaque fallback.
        expect(container.textContent).toMatch(/access to this den/i);
    });

    it('recovers key backup before opening an encrypted den', async () => {
        membership = 'join';
        encrypted = true;
        activeBackupVersion = '7';
        const { container } = await mount();
        await act(async () => {
            await flush();
        });
        expect(getActiveSessionBackupVersion).toHaveBeenCalled();
        expect(restoreKeyBackup).toHaveBeenCalled();
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
    });

    it('skips key recovery for a fresh account with no backup, and still opens the den', async () => {
        membership = 'join';
        encrypted = true;
        activeBackupVersion = null; // brand-new account: nothing to recover
        const { container } = await mount();
        await act(async () => {
            await flush();
        });
        expect(getActiveSessionBackupVersion).toHaveBeenCalled();
        expect(restoreKeyBackup).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
    });

    it('opens the den even when key recovery fails (best-effort)', async () => {
        vi.useFakeTimers();
        membership = 'join';
        encrypted = true;
        activeBackupVersion = '7';
        restoreKeyBackup.mockRejectedValue(new Error('no decryption key'));
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
        // Three recovery attempts with 400ms + 800ms backoff between them.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(restoreKeyBackup).toHaveBeenCalledTimes(3);
        expect(container.querySelector('[data-testid="room-content"]')).not.toBeNull();
    });
});

describe('describeJoinFailure', () => {
    it('maps permission failures to an access message', () => {
        expect(describeJoinFailure({ errcode: 'M_FORBIDDEN' })).toMatch(/access to this den/i);
        expect(describeJoinFailure({ httpStatus: 403 })).toMatch(/access to this den/i);
    });

    it('maps rate limiting to a busy message', () => {
        expect(describeJoinFailure({ errcode: 'M_LIMIT_EXCEEDED' })).toMatch(/busy/i);
        expect(describeJoinFailure({ httpStatus: 429 })).toMatch(/busy/i);
    });

    it('maps connectivity problems to a network message', () => {
        expect(describeJoinFailure(new Error('network request failed'))).toMatch(/connection/i);
    });

    it('falls back to the generic line for unknown errors', () => {
        expect(describeJoinFailure(new Error('boom'))).toMatch(/couldn’t join this den/i);
    });
});
