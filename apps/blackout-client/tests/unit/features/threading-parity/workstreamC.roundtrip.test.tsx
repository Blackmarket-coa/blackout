// @vitest-environment jsdom
//
// Workstream C exit-criterion coverage (deferred-bodies-schedule-2026-05-01.md):
//   "Page-level tests cover: reaction add / remove / aggregate, thread reply
//    post, unread badge update on inbound reply."
//
// The individual pieces (Reactions, ThreadPanel, useThreadUnreadCount,
// ThreadUnreadBadge) are unit-tested in isolation elsewhere. This file is the
// composed/integration pass: it drives the REAL components behind the shared
// fake Matrix-client seam and asserts behavior at the rendered level, exercising
// the live echo path (`Room.timeline` -> useLegacyRoomTimelineAdapter refresh).
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider, createStore } from 'jotai';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { ThreadActivityUpdatedPayload } from '@blackout/protocol';

import { Reactions } from '../../../../src/app/features/room/Reactions';
import { ThreadPanel } from '../../../../src/app/features/right-panel/ThreadPanel';
import { useThreadUnreadCount } from '../../../../src/app/features/auth-threads/useThreadUnreadCount';
import { ThreadUnreadBadge } from '../../../../src/app/features/auth-threads/ThreadUnreadBadge';
import { useLegacySendMessageAdapter } from '../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { matrixClientAtom, userIdAtom } from '../../../../src/app/state/auth';
import { createFakeMatrixClient, createFakeRoom } from '../../../helpers/fakeMatrixClient';

const ROOM_ID = '!room:example.org';
const TARGET_EVENT = '$target:example.org';
const THREAD_ROOT = '$root:example.org';
const ME = '@me:example.org';
const OTHER = '@other:example.org';

// ---------------------------------------------------------------------------
// Event factories (shapes mirror Reactions.test.tsx / panelSlots.threads.test.tsx)
// ---------------------------------------------------------------------------

const makeReaction = ({
    id,
    sender,
    key,
    targetEventId = TARGET_EVENT,
}: {
    id: string;
    sender: string;
    key: string;
    targetEventId?: string;
}): MatrixEvent =>
    ({
        getId: () => id,
        getType: () => 'm.reaction',
        getSender: () => sender,
        isRedacted: () => false,
        getContent: () => ({
            'm.relates_to': {
                rel_type: 'm.annotation',
                event_id: targetEventId,
                key,
            },
        }),
    }) as unknown as MatrixEvent;

const makeMessage = ({
    id,
    body,
    sender = ME,
    rootEventId,
    ts = 1_700_000_000_000,
}: {
    id: string;
    body: string;
    sender?: string;
    rootEventId?: string;
    ts?: number;
}): MatrixEvent =>
    ({
        getId: () => id,
        getTs: () => ts,
        getSender: () => sender,
        getType: () => 'm.room.message',
        getContent: () => ({
            body,
            ...(rootEventId
                ? { 'm.relates_to': { rel_type: 'm.thread', event_id: rootEventId } }
                : {}),
        }),
    }) as unknown as MatrixEvent;

const makeActivity = (
    overrides: Partial<ThreadActivityUpdatedPayload> &
        Pick<ThreadActivityUpdatedPayload, 'activityId' | 'unreadCount' | 'occurredAt'>,
): ThreadActivityUpdatedPayload => ({
    threadRootEventId: THREAD_ROOT,
    roomId: ROOM_ID,
    kind: 'thread_replied',
    ...overrides,
});

// ---------------------------------------------------------------------------
// Mount helpers
// ---------------------------------------------------------------------------

const makeStore = (client: MatrixClient, userId = ME) => {
    const store = createStore();
    store.set(matrixClientAtom, client);
    store.set(userIdAtom, userId);
    return store;
};

const mount = async (store: ReturnType<typeof createStore>, node: React.ReactNode) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<Provider store={store}>{node}</Provider>);
        await Promise.resolve();
    });
    // Flush the timeline adapter's first refresh.
    await act(async () => {
        await Promise.resolve();
    });
    return { container, root };
};

const getSendEvent = (client: MatrixClient) =>
    (client as unknown as { sendEvent: ReturnType<typeof vi.fn> }).sendEvent;
const getRedactEvent = (client: MatrixClient) =>
    (client as unknown as { redactEvent: ReturnType<typeof vi.fn> }).redactEvent;

const chipTexts = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    vi.clearAllMocks();
});

// ===========================================================================
// Section 1 — reaction add / remove / aggregate (real <Reactions/>)
// ===========================================================================

describe('Workstream C round-trip · reactions (add / remove / aggregate)', () => {
    it('aggregates seeded reactions from the timeline into chip counts', async () => {
        const timeline = [
            makeReaction({ id: '$r1', sender: ME, key: '👍' }),
            makeReaction({ id: '$r2', sender: OTHER, key: '👍' }),
            makeReaction({ id: '$r3', sender: OTHER, key: '🎉' }),
        ];
        const room = createFakeRoom({ roomId: ROOM_ID, timelineEvents: timeline });
        const client = createFakeMatrixClient({ rooms: [room] });
        const { container } = await mount(
            makeStore(client),
            <Reactions roomId={ROOM_ID} targetEventId={TARGET_EVENT} />,
        );

        const chips = chipTexts(container);
        expect(chips.some((t) => t.includes('👍') && t.includes('2'))).toBe(true);
        expect(chips.some((t) => t.includes('🎉') && t.includes('1'))).toBe(true);
    });

    it('adds a reaction and reflects the echo in the aggregated bar', async () => {
        // `timeline` is the array the fake room owns; mutating it + re-emitting
        // `Room.timeline` simulates the homeserver echo (useLegacyTimelineAdapter).
        const timeline: MatrixEvent[] = [];
        const room = createFakeRoom({ roomId: ROOM_ID, timelineEvents: timeline });
        const client = createFakeMatrixClient({ rooms: [room] });
        const { container } = await mount(
            makeStore(client),
            <Reactions roomId={ROOM_ID} targetEventId={TARGET_EVENT} />,
        );

        // Empty state → open the picker and pick the default-recent 👍.
        const openButton = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === '+',
        );
        expect(openButton).toBeDefined();
        await act(async () => {
            openButton!.click();
            await Promise.resolve();
        });
        const pick = container.querySelector(
            '[data-testid="emoji-picker-recent-👍"]',
        ) as HTMLButtonElement | null;
        expect(pick).not.toBeNull();
        await act(async () => {
            pick!.click();
            await Promise.resolve();
        });

        // The send went out with the annotation relation…
        expect(getSendEvent(client)).toHaveBeenCalledWith(
            ROOM_ID,
            'm.reaction',
            expect.objectContaining({
                'm.relates_to': expect.objectContaining({
                    rel_type: 'm.annotation',
                    event_id: TARGET_EVENT,
                    key: '👍',
                }),
            }),
        );

        // …now echo it back into the live timeline and assert the chip appears.
        timeline.push(makeReaction({ id: '$echo', sender: ME, key: '👍' }));
        await act(async () => {
            (client as unknown as { emit: (e: string) => void }).emit('Room.timeline');
            await Promise.resolve();
        });
        expect(chipTexts(container).some((t) => t.includes('👍') && t.includes('1'))).toBe(true);
    });

    it('removes the local reaction (redact) and drops the chip after the echo', async () => {
        const mine = makeReaction({ id: '$mine', sender: ME, key: '🔥' });
        const timeline: MatrixEvent[] = [mine];
        const room = createFakeRoom({ roomId: ROOM_ID, timelineEvents: timeline });
        const client = createFakeMatrixClient({ rooms: [room] });
        const { container } = await mount(
            makeStore(client),
            <Reactions roomId={ROOM_ID} targetEventId={TARGET_EVENT} />,
        );

        const chip = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes('🔥'),
        );
        expect(chip).toBeDefined();
        await act(async () => {
            chip!.click();
            await Promise.resolve();
        });
        expect(getRedactEvent(client)).toHaveBeenCalledWith(ROOM_ID, '$mine');

        // Echo the redaction by removing the reaction from the live timeline.
        timeline.splice(0, timeline.length);
        await act(async () => {
            (client as unknown as { emit: (e: string) => void }).emit('Room.timeline');
            await Promise.resolve();
        });
        expect(chipTexts(container).some((t) => t.includes('🔥'))).toBe(false);
    });
});

// ===========================================================================
// Section 2 — thread reply post (real <ThreadPanel/> + real sendThread seam)
// ===========================================================================

// Minimal real composer driven by the canonical thread-send adapter. We use the
// send-adapter seam rather than the full Slate MessageComposer (same rationale
// as panelSlots.threads.test.tsx mocking it) so the post path is exercised
// deterministically.
function ThreadComposer({ roomId, rootEventId }: { roomId: string; rootEventId: string }) {
    const { sendThread } = useLegacySendMessageAdapter(roomId);
    const [body, setBody] = useState('');
    return (
        <div data-testid="thread-composer">
            <input
                data-testid="thread-composer-input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
            />
            <button
                type="button"
                data-testid="thread-composer-send"
                onClick={() => void sendThread(body, rootEventId)}
            >
                Send
            </button>
        </div>
    );
}

const typeInto = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Workstream C round-trip · thread reply post (ThreadPanel + sendThread)', () => {
    it('renders root + existing reply, posts a thread reply, and shows the echoed reply', async () => {
        const root = makeMessage({ id: THREAD_ROOT, body: 'root msg', sender: OTHER });
        const firstReply = makeMessage({
            id: '$r1',
            body: 'first reply',
            sender: ME,
            rootEventId: THREAD_ROOT,
        });
        let events: MatrixEvent[] = [root, firstReply];

        const room = createFakeRoom({ roomId: ROOM_ID, timelineEvents: events });
        const client = createFakeMatrixClient({ rooms: [room] });
        const store = makeStore(client);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const reactRoot = ReactDOM.createRoot(container);
        const renderPanel = async () => {
            await act(async () => {
                reactRoot.render(
                    <Provider store={store}>
                        <ThreadPanel
                            events={events}
                            rootEventId={THREAD_ROOT}
                            renderComposer={(rid) => (
                                <ThreadComposer roomId={ROOM_ID} rootEventId={rid} />
                            )}
                        />
                    </Provider>,
                );
                await Promise.resolve();
            });
        };
        await renderPanel();

        // Root + existing reply render.
        expect(
            container.querySelector('[data-testid="thread-panel-root"]')?.textContent,
        ).toContain('root msg');
        expect(
            container.querySelector('[data-testid="thread-panel-reply-$r1"]')?.textContent,
        ).toContain('first reply');

        // Type + post a thread reply.
        const input = container.querySelector(
            '[data-testid="thread-composer-input"]',
        ) as HTMLInputElement;
        await act(async () => {
            typeInto(input, 'a new thread reply');
            await Promise.resolve();
        });
        const send = container.querySelector(
            '[data-testid="thread-composer-send"]',
        ) as HTMLButtonElement;
        await act(async () => {
            send.click();
            await Promise.resolve();
        });

        expect(getSendEvent(client)).toHaveBeenCalledWith(
            ROOM_ID,
            'm.room.message',
            expect.objectContaining({
                msgtype: 'm.text',
                body: 'a new thread reply',
                'm.relates_to': expect.objectContaining({
                    rel_type: 'm.thread',
                    event_id: THREAD_ROOT,
                }),
            }),
        );

        // Echo the posted reply into the event window and re-render the panel.
        events = [
            ...events,
            makeMessage({
                id: '$r2',
                body: 'a new thread reply',
                sender: ME,
                rootEventId: THREAD_ROOT,
            }),
        ];
        await renderPanel();
        expect(
            container.querySelector('[data-testid="thread-panel-reply-$r2"]')?.textContent,
        ).toContain('a new thread reply');
    });
});

// ===========================================================================
// Section 3 — unread badge updates on inbound reply (hook + badge)
// ===========================================================================

describe('Workstream C round-trip · unread badge on inbound reply', () => {
    it('flips the badge on within one tick of an inbound reply and clears on read', async () => {
        let push: (p: ThreadActivityUpdatedPayload) => void = () => {};

        function BadgeHost() {
            const { unreadCount, pushActivity } = useThreadUnreadCount();
            push = pushActivity;
            return <ThreadUnreadBadge count={unreadCount} />;
        }

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(<BadgeHost />);
            await Promise.resolve();
        });

        const badge = () => container.querySelector('[data-testid="thread-unread-badge"]');

        // No activity → badge renders null.
        expect(badge()).toBeNull();

        // Inbound reply on the Section-2 thread root → badge shows 1 synchronously.
        act(() => {
            push(
                makeActivity({
                    activityId: 'a1',
                    threadRootEventId: THREAD_ROOT,
                    unreadCount: 1,
                    occurredAt: '2026-06-13T00:00:01.000Z',
                }),
            );
        });
        expect(badge()?.getAttribute('data-count')).toBe('1');

        // A second thread's reply aggregates the count.
        act(() => {
            push(
                makeActivity({
                    activityId: 'a2',
                    threadRootEventId: '$root2:example.org',
                    unreadCount: 1,
                    occurredAt: '2026-06-13T00:00:02.000Z',
                }),
            );
        });
        expect(badge()?.getAttribute('data-count')).toBe('2');

        // Marking the first read (unreadCount 0) drops it back to 1…
        act(() => {
            push(
                makeActivity({
                    activityId: 'a1',
                    threadRootEventId: THREAD_ROOT,
                    unreadCount: 0,
                    occurredAt: '2026-06-13T00:00:03.000Z',
                }),
            );
        });
        expect(badge()?.getAttribute('data-count')).toBe('1');

        // …and clearing the second removes the badge entirely.
        act(() => {
            push(
                makeActivity({
                    activityId: 'a2',
                    threadRootEventId: '$root2:example.org',
                    unreadCount: 0,
                    occurredAt: '2026-06-13T00:00:04.000Z',
                }),
            );
        });
        expect(badge()).toBeNull();
    });
});
