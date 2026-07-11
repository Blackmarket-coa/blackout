// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider, createStore } from 'jotai';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { Reactions, useReactionCustomEmoji } from '../../../../src/app/features/room/Reactions';
import { matrixClientAtom, userIdAtom } from '../../../../src/app/state/auth';
import { createFakeMatrixClient, createFakeRoom } from '../../../helpers/fakeMatrixClient';

const ROOM_ID = '!room:example.org';
const TARGET_EVENT = '$target:example.org';
const ME = '@me:example.org';
const OTHER = '@other:example.org';

type MakeReactionOpts = {
    id: string;
    sender: string;
    key: string;
    targetEventId?: string;
};

const makeReaction = ({
    id,
    sender,
    key,
    targetEventId = TARGET_EVENT,
}: MakeReactionOpts): MatrixEvent =>
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
    } as unknown as MatrixEvent);

const mountReactions = async ({
    timelineEvents,
    userId = ME,
}: {
    timelineEvents: MatrixEvent[];
    userId?: string;
}) => {
    const room = createFakeRoom({ roomId: ROOM_ID, timelineEvents });
    const client = createFakeMatrixClient({ rooms: [room] });

    const store = createStore();
    store.set(matrixClientAtom, client as unknown as MatrixClient);
    store.set(userIdAtom, userId);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <Provider store={store}>
                <Reactions roomId={ROOM_ID} targetEventId={TARGET_EVENT} />
            </Provider>
        );
        await Promise.resolve();
    });
    // Flush the timeline adapter's first refresh.
    await act(async () => {
        await Promise.resolve();
    });

    return { container, root, store, client, room };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('Reactions (Workstream A — Matrix-mock integration)', () => {
    it('aggregates reactions from the timeline and renders chip counts', async () => {
        const { container } = await mountReactions({
            timelineEvents: [
                makeReaction({ id: '$r1', sender: ME, key: '👍' }),
                makeReaction({ id: '$r2', sender: OTHER, key: '👍' }),
                makeReaction({ id: '$r3', sender: OTHER, key: '🎉' }),
            ],
        });

        const buttons = Array.from(container.querySelectorAll('button')).map(
            (b) => b.textContent ?? ''
        );
        // The thumbs-up chip aggregates the two senders.
        expect(buttons.some((t) => t.includes('👍') && t.includes('2'))).toBe(true);
        // The tada chip shows a single reactor.
        expect(buttons.some((t) => t.includes('🎉') && t.includes('1'))).toBe(true);
    });

    it('sends an m.reaction event when the picker selects an emoji', async () => {
        const { container, client } = await mountReactions({ timelineEvents: [] });

        // The empty state renders a single `+` button — click it to open the picker.
        const openButtons = Array.from(container.querySelectorAll('button')).filter(
            (b) => b.textContent?.trim() === '+'
        );
        expect(openButtons.length).toBeGreaterThan(0);
        await act(async () => {
            openButtons[0].click();
            await Promise.resolve();
        });

        const recentChoice = container.querySelector(
            '[data-testid="emoji-picker-recent-👍"]'
        ) as HTMLButtonElement | null;
        expect(recentChoice).not.toBeNull();
        await act(async () => {
            recentChoice!.click();
            await Promise.resolve();
        });

        const sendEvent = (client as unknown as { sendEvent: ReturnType<typeof vi.fn> }).sendEvent;
        expect(sendEvent).toHaveBeenCalledTimes(1);
        expect(sendEvent).toHaveBeenCalledWith(
            ROOM_ID,
            'm.reaction',
            expect.objectContaining({
                'm.relates_to': expect.objectContaining({
                    rel_type: 'm.annotation',
                    event_id: TARGET_EVENT,
                    key: '👍',
                }),
            })
        );
    });

    it("redacts the local user's reaction when its chip is clicked again", async () => {
        const { container, client } = await mountReactions({
            timelineEvents: [makeReaction({ id: '$mine', sender: ME, key: '🔥' })],
        });

        const chip = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes('🔥')
        );
        expect(chip).toBeDefined();

        await act(async () => {
            chip!.click();
            await Promise.resolve();
        });

        const redactEvent = (client as unknown as { redactEvent: ReturnType<typeof vi.fn> })
            .redactEvent;
        expect(redactEvent).toHaveBeenCalledWith(ROOM_ID, '$mine');
    });
});

describe('useReactionCustomEmoji (Workstream E — MSC2545 pack unification)', () => {
    const HS = 'https://matrix.example.org';
    const mediaUrl = (mediaId: string) => `${HS}/_matrix/media/v3/download/example.org/${mediaId}`;

    const Probe = ({ room }: { room: ReturnType<typeof createFakeRoom> }) => {
        const emoji = useReactionCustomEmoji(room as never, HS);
        return <div data-testid="custom-emoji-probe">{JSON.stringify(emoji)}</div>;
    };

    const mountProbe = async (client: unknown, room: ReturnType<typeof createFakeRoom>) => {
        const store = createStore();
        store.set(matrixClientAtom, client as MatrixClient);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <Provider store={store}>
                    <Probe room={room} />
                </Provider>
            );
            await Promise.resolve();
        });
        const probe = container.querySelector('[data-testid="custom-emoji-probe"]');
        return JSON.parse(probe?.textContent ?? '{}') as Record<string, string>;
    };

    it('surfaces user-pack emoji that are not in the room state', async () => {
        const room = createFakeRoom({ roomId: ROOM_ID, timelineEvents: [] });
        const client = createFakeMatrixClient({
            rooms: [room],
            accountData: {
                'im.ponies.user_emotes': {
                    images: { partyblob: { url: 'mxc://example.org/partyblob' } },
                },
            },
        });

        const emoji = await mountProbe(client, room);
        expect(emoji[':partyblob:']).toBe(mediaUrl('partyblob'));
    });

    it('lets the room-state emote win a shortcode conflict with the user pack', async () => {
        const room = createFakeRoom({
            roomId: ROOM_ID,
            timelineEvents: [],
            stateEvents: {
                'im.ponies.room_emotes': {
                    images: { wave: { url: 'mxc://example.org/room-wave' } },
                },
            },
        });
        const client = createFakeMatrixClient({
            rooms: [room],
            accountData: {
                'im.ponies.user_emotes': {
                    images: { wave: { url: 'mxc://example.org/user-wave' } },
                },
            },
        });

        const emoji = await mountProbe(client, room);
        expect(emoji[':wave:']).toBe(mediaUrl('room-wave'));
    });
});
