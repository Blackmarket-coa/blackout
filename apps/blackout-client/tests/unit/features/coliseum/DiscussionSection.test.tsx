// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ColiseumTopic } from '@blackout/core';
import { DiscussionSection } from '../../../../src/app/features/coliseum/sections/DiscussionSection';

const linkColiseumTopicDen = vi.fn();
const createDenInCanopy = vi.fn();
const findOrCreateCategory = vi.fn();
const createRoom = vi.fn();
const leave = vi.fn(async () => undefined);
const sendStateEvent = vi.fn(async () => ({ event_id: '$e' }));
const joinDenWithCanopy = vi.fn(async () => undefined);

vi.mock('../../../../src/app/features/coliseum/coliseumClient', () => ({
    linkColiseumTopicDen: (...args: unknown[]) => linkColiseumTopicDen(...(args as [])),
}));

vi.mock('../../../../src/app/features/canopy/denKind', () => ({
    createDenInCanopy: (...args: unknown[]) => createDenInCanopy(...(args as [])),
    findOrCreateCategory: (...args: unknown[]) => findOrCreateCategory(...(args as [])),
    DEN_KIND_STATE_EVENT_TYPE: 'co.bmc.den.kind',
    // The den body renders as a forum; stub the hook so no Matrix room is needed.
    useDenKind: () => 'forum',
}));

vi.mock('../../../../src/app/features/room/joinDenWithCanopy', () => ({
    joinDenWithCanopy: (...args: unknown[]) => joinDenWithCanopy(...(args as [])),
}));

vi.mock('../../../../src/app/features/forum/ForumView', () => ({
    ForumView: ({ roomId }: { roomId: string }) => (
        <div data-testid="stub-forum" data-room-id={roomId} />
    ),
}));
vi.mock('../../../../src/app/features/room/RoomTimeline', () => ({
    RoomTimeline: () => <div data-testid="stub-timeline" />,
}));
vi.mock('../../../../src/app/features/room/MessageComposer', () => ({
    MessageComposer: () => <div data-testid="stub-composer" />,
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => ({
        createRoom: (...args: unknown[]) => createRoom(...(args as [])),
        sendStateEvent: (...args: unknown[]) => sendStateEvent(...(args as [])),
        leave: (...args: unknown[]) => leave(...(args as [])),
    }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const TOPIC: ColiseumTopic = {
    id: 'topic-1',
    title: 'Should we ratify?',
    seed: { kind: 'text' },
    createdAt: '2026-05-02T11:00:00Z',
    tags: [],
    status: 'active',
    recencyScore: 0.5,
    velocityScore: 0.5,
    debateHeat: 0.5,
};

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
};

const render = (topic: ColiseumTopic) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<DiscussionSection topic={topic} />);
    });
    mountedRoots.push(root);
    return container;
};

const clickStart = async (container: HTMLElement) => {
    await act(async () => {
        (
            container.querySelector('[data-testid="topic-discussion-start"]') as HTMLButtonElement
        ).click();
    });
    await flush();
};

beforeEach(() => {
    createDenInCanopy.mockResolvedValue('!new-den:server');
    findOrCreateCategory.mockResolvedValue('!topics-category:server');
    createRoom.mockResolvedValue({ room_id: '!standalone-den:server' });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('DiscussionSection — the den is created lazily', () => {
    it('offers to start a discussion rather than minting a room up front', () => {
        const container = render(TOPIC);
        expect(container.querySelector('[data-testid="topic-discussion-start"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stub-forum"]')).toBeNull();
        // A room per throwaway topic would bury the canopy's channel list.
        expect(createDenInCanopy).not.toHaveBeenCalled();
        expect(createRoom).not.toHaveBeenCalled();
    });

    it("creates a forum den in the canopy's Topics category on first use", async () => {
        linkColiseumTopicDen.mockResolvedValue({
            topic: { ...TOPIC, discussionDenId: '!new-den:server' },
            created: true,
        });
        const container = render({ ...TOPIC, canopyId: '!canopy:server' });
        await clickStart(container);

        // Auto-created dens are grouped under a category rather than dropped
        // loose into General, where they'd bury the hand-made channels.
        expect(findOrCreateCategory).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ canopyId: '!canopy:server', purpose: 'topics' })
        );
        expect(createDenInCanopy).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ canopyId: '!topics-category:server', kind: 'forum' })
        );
        expect(linkColiseumTopicDen).toHaveBeenCalledWith('topic-1', '!new-den:server');
        expect(
            container.querySelector('[data-testid="stub-forum"]')?.getAttribute('data-room-id')
        ).toBe('!new-den:server');
    });

    it('creates an unparented den for a standalone topic, still marked forum', async () => {
        linkColiseumTopicDen.mockResolvedValue({
            topic: { ...TOPIC, discussionDenId: '!standalone-den:server' },
            created: true,
        });
        const container = render(TOPIC);
        await clickStart(container);

        // No global "Coliseum canopy" is invented to parent it under — that
        // would be a seeding dependency with no owner.
        expect(createDenInCanopy).not.toHaveBeenCalled();
        expect(createRoom).toHaveBeenCalled();
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!standalone-den:server',
            'co.bmc.den.kind',
            { kind: 'forum' },
            ''
        );
    });

    /**
     * The den is created client-side, so two people commenting at once can each
     * mint a room. The server's first-writer-wins answer has to actually be
     * honoured, or the loser strands an empty room nobody can find.
     */
    it('abandons its own room when another commenter linked one first', async () => {
        linkColiseumTopicDen.mockResolvedValue({
            topic: { ...TOPIC, discussionDenId: '!someone-elses-den:server' },
            created: false,
        });
        const container = render({ ...TOPIC, canopyId: '!canopy:server' });
        await clickStart(container);

        expect(leave).toHaveBeenCalledWith('!new-den:server');
        expect(
            container.querySelector('[data-testid="stub-forum"]')?.getAttribute('data-room-id')
        ).toBe('!someone-elses-den:server');
    });

    it('renders the existing den straight away, joining via its canopy', async () => {
        const container = render({
            ...TOPIC,
            canopyId: '!canopy:server',
            discussionDenId: '!existing:server',
        });
        expect(
            container.querySelector('[data-testid="stub-forum"]')?.getAttribute('data-room-id')
        ).toBe('!existing:server');
        expect(createDenInCanopy).not.toHaveBeenCalled();
    });

    it('keeps the rest of the topic usable when den creation fails', async () => {
        createDenInCanopy.mockRejectedValue(new Error('no permission'));
        const container = render({ ...TOPIC, canopyId: '!canopy:server' });
        await clickStart(container);

        // Discussion is additive, never load-bearing.
        expect(container.querySelector('[data-testid="topic-discussion"]')).toBeTruthy();
        expect(container.textContent).toContain('no permission');
    });
});
