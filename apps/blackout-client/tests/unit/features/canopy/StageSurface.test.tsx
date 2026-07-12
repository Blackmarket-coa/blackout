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
    sendEvent: vi.fn().mockResolvedValue(undefined),
    timelineEvents: [] as unknown[],
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

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getUserId: () => '@self:server',
        sendEvent: mocks.sendEvent,
    }),
}));

vi.mock(
    '../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter',
    () => ({
        useLegacyRoomTimelineAdapter: () => ({
            data: mocks.timelineEvents,
            loading: false,
            error: null,
            loadMore: vi.fn(),
        }),
    })
);

import { StageSurface } from '../../../../src/app/features/canopy/StageSurface';
import { STAGE_HAND_EVENT_TYPE } from '../../../../src/app/features/canopy/stageHands';

const member = (userId: string, name: string, powerLevel = 0) => ({ userId, name, powerLevel });

const handEvent = (sender: string, raised: boolean, ts: number, subject?: string) => ({
    getType: () => STAGE_HAND_EVENT_TYPE,
    getSender: () => sender,
    getContent: () => (subject ? { raised, for: subject } : { raised }),
    getTs: () => ts,
});

const makeRoom = (members: { userId: string; name: string; powerLevel?: number }[]): Room =>
    ({
        roomId: '!stage:server',
        name: 'Town Hall',
        getJoinedMembers: () => members,
        getMember: (userId: string) => members.find((m) => m.userId === userId) ?? null,
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
    mocks.sendEvent.mockClear();
    mocks.timelineEvents = [];
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

    it('raising a hand sends the co.bmc.stage.hand signal', async () => {
        const room = makeRoom([member('@self:server', 'Self')]);
        const { container } = await mount(room);

        const raise = container.querySelector<HTMLButtonElement>(
            '[data-testid="stage-raise-hand"]'
        );
        expect(raise?.textContent).toContain('Raise hand');
        await act(async () => {
            raise?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(mocks.sendEvent).toHaveBeenCalledWith('!stage:server', STAGE_HAND_EVENT_TYPE, {
            raised: true,
        });
    });

    it('renders the raised-hand queue with a moderator Lower control', async () => {
        mocks.timelineEvents = [handEvent('@bob:server', true, 10)];
        const room = makeRoom([
            member('@self:server', 'Self', 50),
            member('@bob:server', 'Bob'),
        ]);
        const { container } = await mount(room);

        const queued = container.querySelectorAll('[data-testid="stage-raised-hand"]');
        expect(queued).toHaveLength(1);
        expect(queued[0].textContent).toContain('Bob');

        const lower = container.querySelector<HTMLButtonElement>(
            '[data-testid="stage-lower-hand"]'
        );
        expect(lower).toBeTruthy();
        await act(async () => {
            lower?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(mocks.sendEvent).toHaveBeenCalledWith('!stage:server', STAGE_HAND_EVENT_TYPE, {
            raised: false,
            for: '@bob:server',
        });
    });

    it('a hand lowered by a moderator leaves the queue; joining the stage clears it too', async () => {
        mocks.timelineEvents = [
            handEvent('@bob:server', true, 10),
            handEvent('@mod:server', false, 20, '@bob:server'),
            handEvent('@carol:server', true, 30),
        ];
        // Carol is now a speaker — her hand must not queue either.
        mocks.call.membership = { '@carol:server': { membership: 'joined' } };
        const room = makeRoom([
            member('@mod:server', 'Mod', 100),
            member('@bob:server', 'Bob'),
            member('@carol:server', 'Carol'),
        ]);
        const { container } = await mount(room);

        expect(container.querySelectorAll('[data-testid="stage-raised-hand"]')).toHaveLength(0);
    });
});
