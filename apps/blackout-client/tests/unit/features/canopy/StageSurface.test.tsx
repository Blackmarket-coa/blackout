// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({
    call: {
        roomId: null as string | null,
        joined: false,
        joinCall: vi.fn().mockResolvedValue(undefined),
        leaveCall: vi.fn().mockResolvedValue(undefined),
        membership: {} as Record<string, { membership: 'joined' | 'left' }>,
        audioLevels: {} as Record<string, { level: number; speaking: boolean }>,
        focusStatus: 'healthy' as string,
        focusMessage: '',
    },
}));

vi.mock('../../../../src/app/features/call/CallProvider', () => ({
    CallProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useCall: () => mocks.call,
}));

vi.mock('../../../../src/app/features/call/CallControls', () => ({
    CallControls: () => <div data-testid="call-controls" />,
}));

vi.mock('../../../../src/app/features/call/CallWidget', () => ({
    CallWidget: () => <div data-testid="call-widget" />,
}));

vi.mock('../../../../src/app/features/call/SpeakingIndicator', () => ({
    SpeakingIndicator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { StageSurface } from '../../../../src/app/features/canopy/StageSurface';

const member = (userId: string, name: string) => ({ userId, name });

const makeRoom = (members: { userId: string; name: string }[]): Room =>
    ({
        roomId: '!stage:server',
        name: 'Town Hall',
        getJoinedMembers: () => members,
    } as unknown as Room);

const mount = async (room: Room) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<StageSurface room={room} />);
        await Promise.resolve();
    });
    return { container };
};

beforeEach(() => {
    mocks.call.roomId = null;
    mocks.call.joined = false;
    mocks.call.membership = {};
    mocks.call.audioLevels = {};
    mocks.call.focusStatus = 'healthy';
    mocks.call.joinCall.mockClear();
    mocks.call.leaveCall.mockClear();
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('StageSurface', () => {
    it('splits members into speakers (in call) and audience (not in call)', async () => {
        mocks.call.membership = { '@alice:server': { membership: 'joined' } };
        const room = makeRoom([member('@alice:server', 'Alice'), member('@bob:server', 'Bob')]);
        const { container } = await mount(room);

        const speakers = container.querySelectorAll('[data-testid="stage-speaker"]');
        const audience = container.querySelectorAll('[data-testid="stage-audience"]');
        expect(speakers).toHaveLength(1);
        expect(speakers[0].textContent).toContain('Alice');
        expect(audience).toHaveLength(1);
        expect(audience[0].getAttribute('title')).toBe('Bob');
    });

    it('shows an empty-stage hint when no one is in the call', async () => {
        const room = makeRoom([member('@bob:server', 'Bob')]);
        const { container } = await mount(room);

        expect(container.querySelector('[data-testid="stage-speaker"]')).toBeNull();
        expect(container.textContent).toContain('No one is on stage yet');
    });

    it('joins the stage when not connected', async () => {
        const room = makeRoom([member('@bob:server', 'Bob')]);
        const { container } = await mount(room);

        const join = container.querySelector<HTMLButtonElement>('[data-testid="stage-join"]');
        expect(join?.textContent).toBe('Join stage');
        await act(async () => {
            join?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(mocks.call.joinCall).toHaveBeenCalledWith('!stage:server');
    });

    it('leaves the stage when already connected to this room', async () => {
        mocks.call.roomId = '!stage:server';
        mocks.call.joined = true;
        const room = makeRoom([member('@me:server', 'Me')]);
        const { container } = await mount(room);

        const join = container.querySelector<HTMLButtonElement>('[data-testid="stage-join"]');
        expect(join?.textContent).toBe('Leave stage');
        await act(async () => {
            join?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(mocks.call.leaveCall).toHaveBeenCalled();
    });
});
