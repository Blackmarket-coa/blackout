// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import type { IPowerLevels } from '../../../../src/app/hooks/usePowerLevels';

const mocks = vi.hoisted(() => ({
    kind: 'announcement' as string,
    powerLevels: {} as IPowerLevels,
    room: null as unknown as Room,
}));

// Only the announcement branch is under test; stub the other kinds' surfaces and
// the timeline/composer so the render stays about the power gate.
vi.mock('jotai', async (orig) => ({
    ...(await orig<typeof import('jotai')>()),
    useAtomValue: () => null,
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getRoom: () => mocks.room,
        getUserId: () => '@me:server',
    }),
}));

vi.mock('../../../../src/app/features/canopy/denKind', async (orig) => ({
    ...(await orig<typeof import('../../../../src/app/features/canopy/denKind')>()),
    useDenKind: () => mocks.kind,
}));

vi.mock('../../../../src/app/hooks/usePowerLevels', async (orig) => ({
    ...(await orig<typeof import('../../../../src/app/hooks/usePowerLevels')>()),
    usePowerLevels: () => mocks.powerLevels,
}));

vi.mock('../../../../src/app/features/right-panel/rightPanelUtils', () => ({
    getUnreadMarkerEventId: () => null,
}));

vi.mock('../../../../src/app/features/room/RoomTimeline', () => ({
    RoomTimeline: () => <div data-testid="room-timeline" />,
}));

vi.mock('../../../../src/app/features/room/MessageComposer', () => ({
    MessageComposer: () => <div data-testid="composer" />,
}));

vi.mock('../../../../src/app/features/call', () => ({
    CallProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    VoiceChannel: () => <div data-testid="voice" />,
}));

vi.mock('../../../../src/app/features/forum/ForumView', () => ({
    ForumView: () => <div data-testid="forum" />,
}));

vi.mock('../../../../src/app/features/canopy/StageSurface', () => ({
    StageSurface: () => <div data-testid="stage" />,
}));

import { CanopyDenSurface } from '../../../../src/app/features/canopy/CanopyDenSurface';

const room = {
    roomId: '!den:server',
    name: 'Updates',
    currentState: { getStateEvents: () => undefined },
} as unknown as Room;

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <CanopyDenSurface
                denId="!den:server"
                canopy={room}
                rightDock={null}
                compact={false}
                onOpenChannels={() => {}}
                onToggleMembers={() => {}}
                onToggleThreads={() => {}}
                onTogglePins={() => {}}
            />
        );
        await Promise.resolve();
    });
    return { container };
};

beforeEach(() => {
    mocks.room = room;
    mocks.kind = 'announcement';
    mocks.powerLevels = {};
    document.body.innerHTML = '';
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('CanopyDenSurface announcement gate', () => {
    it('shows the composer to a member with send power', async () => {
        // events_default 50, this user is power 50 → can post.
        mocks.powerLevels = {
            events_default: 50,
            users: { '@me:server': 50 },
        } as IPowerLevels;
        const { container } = await mount();

        expect(container.querySelector('[data-den-kind="announcement"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="composer"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="announcement-readonly"]')).toBeNull();
    });

    it('shows a read-only notice to a member without send power', async () => {
        mocks.powerLevels = {
            events_default: 50,
            users: { '@me:server': 0 },
        } as IPowerLevels;
        const { container } = await mount();

        expect(container.querySelector('[data-testid="composer"]')).toBeNull();
        const notice = container.querySelector('[data-testid="announcement-readonly"]');
        expect(notice).not.toBeNull();
        expect(notice?.textContent).toContain('Only moderators can post');
    });
});
