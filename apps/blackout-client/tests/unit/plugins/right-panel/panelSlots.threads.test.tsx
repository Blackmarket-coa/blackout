// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixEvent, Room } from 'matrix-js-sdk';

vi.mock('../../../../src/app/features/room/MessageComposer', () => ({
    MessageComposer: ({
        roomId,
        target,
        placeholder,
    }: {
        roomId: string;
        target?: { mode: string; rootEventId?: string };
        placeholder?: string;
    }) => (
        <div
            data-testid="mock-composer"
            data-room-id={roomId}
            data-target-mode={target?.mode ?? ''}
            data-target-root={target?.rootEventId ?? ''}
        >
            {placeholder}
        </div>
    ),
}));

import { resolveRightPanelSlotRegistry } from '../../../../src/app/plugins/right-panel';
import type { RightPanelSlotProps } from '../../../../src/app/plugins/right-panel/panelSlots';

type MakeEventOpts = {
    id: string;
    body?: string;
    sender?: string;
    rootEventId?: string;
    ts?: number;
};

const makeEvent = ({
    id,
    body,
    sender = '@alice:example.org',
    rootEventId,
    ts = 1_700_000_000_000,
}: MakeEventOpts): MatrixEvent =>
    ({
        getId: () => id,
        getTs: () => ts,
        getSender: () => sender,
        getType: () => 'm.room.message',
        getContent: () => ({
            ...(body !== undefined ? { body } : {}),
            ...(rootEventId
                ? {
                      'm.relates_to': {
                          rel_type: 'm.thread',
                          event_id: rootEventId,
                      },
                  }
                : {}),
        }),
    }) as unknown as MatrixEvent;

const fakeRoom = { roomId: '!room:example.org' } as unknown as Room;

const renderThreads = async (overrides: Partial<RightPanelSlotProps>) => {
    const registry = resolveRightPanelSlotRegistry(false, false);
    const Renderer = registry.threads;
    if (!Renderer) throw new Error('threads slot must be defined');

    const props: RightPanelSlotProps = {
        panel: 'threads',
        room: fakeRoom,
        events: [],
        onJumpToEvent: vi.fn(),
        rolesEnabled: false,
        activeThreadRootId: null,
        ...overrides,
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<Renderer {...props} />);
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('panelSlots threads slot (Workstream C — in-room thread panel wiring)', () => {
    it('renders the flat thread-starters list when no thread root is active', async () => {
        const nonThreadMessage = makeEvent({ id: '$plain', body: 'unrelated message' });
        const { container } = await renderThreads({
            events: [nonThreadMessage],
            activeThreadRootId: null,
        });

        // Root list does not render the ThreadPanel container.
        expect(container.querySelector('[data-testid="thread-panel"]')).toBeNull();
        // Empty-state copy from the thread-root list comes through because the
        // non-thread message contributes no thread root (getThreadRootIds).
        expect(container.textContent).toContain('No active threads yet.');
    });

    it('renders ThreadPanel with root + replies + injected composer when a thread is active', async () => {
        const root = makeEvent({ id: '$root', body: 'root msg', sender: '@alice:example.org' });
        const reply = makeEvent({
            id: '$r1',
            body: 'replying',
            sender: '@bob:example.org',
            rootEventId: '$root',
        });

        const { container } = await renderThreads({
            events: [root, reply],
            activeThreadRootId: '$root',
        });

        const panel = container.querySelector('[data-testid="thread-panel"]');
        expect(panel?.getAttribute('data-root-event-id')).toBe('$root');
        expect(
            container.querySelector('[data-testid="thread-panel-root"]')?.textContent,
        ).toContain('root msg');
        expect(
            container.querySelector('[data-testid="thread-panel-reply-$r1"]')?.textContent,
        ).toContain('replying');

        const composer = container.querySelector('[data-testid="mock-composer"]');
        expect(composer).not.toBeNull();
        expect(composer?.getAttribute('data-room-id')).toBe('!room:example.org');
        expect(composer?.getAttribute('data-target-mode')).toBe('thread');
        expect(composer?.getAttribute('data-target-root')).toBe('$root');
    });

    it('shows the root-missing empty state when the active root is not in the event window', async () => {
        const reply = makeEvent({
            id: '$r1',
            body: 'orphan reply',
            rootEventId: '$root-not-loaded',
        });
        const { container } = await renderThreads({
            events: [reply],
            activeThreadRootId: '$root-not-loaded',
        });

        expect(
            container.querySelector('[data-testid="thread-panel-root-missing"]'),
        ).not.toBeNull();
    });
});
