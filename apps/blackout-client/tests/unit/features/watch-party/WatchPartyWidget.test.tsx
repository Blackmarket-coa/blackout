// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Room } from 'matrix-js-sdk';
import { WatchPartyWidget } from '../../../../src/app/features/watch-party/WatchPartyWidget';
import {
    WATCH_PARTY_STATE_EVENT_TYPE,
    parseWatchPartyState,
    serializeWatchPartyState,
    type WatchPartyState,
} from '../../../../src/app/features/watch-party/watchPartyState';
import { createFakeMatrixClient, createFakeRoom } from '../../../helpers/fakeMatrixClient';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../../src/app/features/streams/streamsClient', () => ({
    listStreams: vi.fn().mockResolvedValue({
        items: [{ id: 's1', state: 'live', title: 'Championship Final' }],
    }),
    fetchOwncastOrigin: vi.fn().mockResolvedValue({ origin: 'https://owncast.example.org' }),
    buildOwncastPlaylistUrl: (origin: string) => `${origin}/hls/stream.m3u8`,
}));

const HOST = '@host:example.org';
// createFakeMatrixClient hardcodes the local user as @user:example.org.
const ME = '@user:example.org';

const party = (overrides: Partial<WatchPartyState> = {}): WatchPartyState => ({
    mode: 'shared_player',
    source: { kind: 'url', uri: 'https://cdn.example.org/movie.mp4', title: 'Movie night' },
    hostId: HOST,
    status: 'paused',
    positionMs: 0,
    updatedTs: 1,
    playbackRate: 1,
    revision: 1,
    ...overrides,
});

const buildRoom = ({
    myPower,
    partyState,
    sendStateEvent,
    sendEvent,
    powerLevelUsers,
    timelineEvents,
}: {
    myPower: number;
    partyState?: WatchPartyState;
    sendStateEvent?: ReturnType<typeof vi.fn>;
    sendEvent?: ReturnType<typeof vi.fn>;
    powerLevelUsers?: Record<string, number>;
    timelineEvents?: unknown[];
}): Room => {
    const client = createFakeMatrixClient({
        extras: {
            sendStateEvent: (sendStateEvent ??
                vi.fn().mockResolvedValue({ event_id: '$x' })) as never,
            ...(sendEvent ? { sendEvent: sendEvent as never } : {}),
            mxcUrlToHttp: ((mxc: string) =>
                `https://matrix.example.org/media/${mxc.slice('mxc://'.length)}`) as never,
        },
    });
    const room = createFakeRoom({
        powerLevelUsers: powerLevelUsers ?? { [ME]: myPower },
        stateEvents: partyState
            ? { [WATCH_PARTY_STATE_EVENT_TYPE]: serializeWatchPartyState(partyState) }
            : {},
        timelineEvents: timelineEvents as never,
    });
    Object.assign(room, {
        client,
        getMember: (userId: string) => ({ userId, powerLevel: userId === ME ? myPower : 0 }),
    });
    return room;
};

const timelineRequestEvent = (sender: string, ts: number) => ({
    getType: () => 'co.bmc.watch_party.control_request',
    getSender: () => sender,
    getTs: () => ts,
});

const timelineHeartbeatEvent = (sender: string, ts: number) => ({
    getType: () => 'co.bmc.watch_party.heartbeat',
    getSender: () => sender,
    getTs: () => ts,
});

let container: HTMLDivElement | null = null;
let root: ReactDOM.Root | null = null;

const render = (room: Room) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
        root = ReactDOM.createRoot(container as HTMLDivElement);
        root.render(<WatchPartyWidget room={room} />);
    });
};

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
});

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = (el: Element) =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

const buttonByText = (text: string): HTMLButtonElement | undefined =>
    Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent === text);

describe('WatchPartyWidget', () => {
    it('offers the start form to moderators when no party is running', () => {
        render(buildRoom({ myPower: 50 }));
        expect(buttonByText('Start watch party')).toBeDefined();
    });

    it('tells plain members to wait for a moderator', () => {
        render(buildRoom({ myPower: 0 }));
        expect(buttonByText('Start watch party')).toBeUndefined();
        expect(container?.textContent).toContain('A moderator can start one');
    });

    it('starts a shared-player party via a state event write', () => {
        const sendStateEvent = vi.fn().mockResolvedValue({ event_id: '$x' });
        render(buildRoom({ myPower: 100, sendStateEvent }));

        const uriInput = container?.querySelector(
            'input[aria-label="Video source URL"]'
        ) as HTMLInputElement;
        act(() => setInputValue(uriInput, 'https://cdn.example.org/movie.mp4'));
        act(() => {
            click(buttonByText('Start watch party') as HTMLButtonElement);
        });

        expect(sendStateEvent).toHaveBeenCalledTimes(1);
        const [roomId, eventType, content] = sendStateEvent.mock.calls[0];
        expect(roomId).toBe('!room:example.org');
        expect(eventType).toBe(WATCH_PARTY_STATE_EVENT_TYPE);
        const parsed = parseWatchPartyState(content as Record<string, unknown>);
        expect(parsed).toMatchObject({
            mode: 'shared_player',
            hostId: ME,
            status: 'paused',
            revision: 1,
        });
        expect(parsed?.source?.uri).toBe('https://cdn.example.org/movie.mp4');
    });

    it('rejects a non-https source instead of writing state', () => {
        const sendStateEvent = vi.fn().mockResolvedValue({ event_id: '$x' });
        render(buildRoom({ myPower: 100, sendStateEvent }));

        const uriInput = container?.querySelector(
            'input[aria-label="Video source URL"]'
        ) as HTMLInputElement;
        act(() => setInputValue(uriInput, 'javascript:alert(1)'));
        act(() => {
            click(buttonByText('Start watch party') as HTMLButtonElement);
        });

        expect(sendStateEvent).not.toHaveBeenCalled();
        expect(container?.textContent).toContain('Source must be an https://');
    });

    it('fills the source from the live-stream picker in live-event mode', async () => {
        render(buildRoom({ myPower: 100 }));

        const liveRadio = Array.from(
            container?.querySelectorAll('input[type="radio"]') ?? []
        )[1] as HTMLInputElement;
        act(() => {
            click(liveRadio);
        });
        // Let the mocked listStreams/fetchOwncastOrigin promises resolve.
        await act(async () => {
            await Promise.resolve();
        });

        const pick = buttonByText('🔴 Championship Final');
        expect(pick).toBeDefined();
        act(() => {
            click(pick as HTMLButtonElement);
        });

        const uriInput = container?.querySelector(
            'input[aria-label="Video source URL"]'
        ) as HTMLInputElement;
        expect(uriInput.value).toBe('https://owncast.example.org/hls/stream.m3u8');
    });

    it('renders the shared player and host controls for an active party', () => {
        render(buildRoom({ myPower: 100, partyState: party() }));

        expect(container?.querySelector('[data-testid="watch-party-player"]')).not.toBeNull();
        expect(container?.textContent).toContain('Movie night');
        expect(container?.textContent).toContain(`Host: ${HOST}`);
        expect(buttonByText('Take over as host')).toBeDefined();
        expect(buttonByText('End party')).toBeDefined();
    });

    it('hides moderator controls from plain viewers', () => {
        render(buildRoom({ myPower: 0, partyState: party() }));

        expect(container?.querySelector('[data-testid="watch-party-player"]')).not.toBeNull();
        expect(buttonByText('Take over as host')).toBeUndefined();
        expect(buttonByText('End party')).toBeUndefined();
    });

    it('renders screenshare guidance without a player', () => {
        render(
            buildRoom({
                myPower: 0,
                partyState: party({ mode: 'screenshare', source: null }),
            })
        );

        expect(container?.querySelector('[data-testid="watch-party-player"]')).toBeNull();
        expect(container?.textContent).toContain(`${HOST} is presenting`);
    });

    it('lets any viewer send a palette reaction as a timeline event', () => {
        const sendEvent = vi.fn().mockResolvedValue({ event_id: '$r' });
        render(buildRoom({ myPower: 0, partyState: party(), sendEvent }));

        act(() => {
            click(buttonByText('🎉') as HTMLButtonElement);
        });

        expect(sendEvent).toHaveBeenCalledWith('!room:example.org', 'co.bmc.watch_party.reaction', {
            key: '🎉',
        });
    });

    it('lets a plain viewer request control via a timeline event', () => {
        const sendEvent = vi.fn().mockResolvedValue({ event_id: '$q' });
        render(buildRoom({ myPower: 0, partyState: party(), sendEvent }));

        act(() => {
            click(buttonByText('Request control') as HTMLButtonElement);
        });

        // The mounted party also emits presence heartbeats; assert on the
        // control-request send specifically rather than a total call count.
        const requestCall = sendEvent.mock.calls.find(
            ([, eventType]) => eventType === 'co.bmc.watch_party.control_request'
        );
        expect(requestCall).toBeDefined();
        expect(requestCall?.[0]).toBe('!room:example.org');
        expect(container?.textContent).toContain('Control requested');
        expect(buttonByText('Request control')).toBeUndefined();
    });

    it('shows the host a request queue and hands over to an empowered requester', () => {
        const sendStateEvent = vi.fn().mockResolvedValue({ event_id: '$x' });
        render(
            buildRoom({
                myPower: 100,
                partyState: party({ hostId: ME }),
                sendStateEvent,
                powerLevelUsers: { [ME]: 100, '@viewer:example.org': 50 },
                timelineEvents: [timelineRequestEvent('@viewer:example.org', Date.now())],
            })
        );

        expect(container?.textContent).toContain('Control requests');
        expect(container?.textContent).toContain('@viewer:example.org');

        act(() => {
            click(buttonByText('Make host') as HTMLButtonElement);
        });

        const [, eventType, content] = sendStateEvent.mock.calls[0];
        expect(eventType).toBe(WATCH_PARTY_STATE_EVENT_TYPE);
        const parsed = parseWatchPartyState(content as Record<string, unknown>);
        expect(parsed?.hostId).toBe('@viewer:example.org');
        expect(parsed?.revision).toBe(2);
    });

    it('withholds host handover from under-powered requesters', () => {
        render(
            buildRoom({
                myPower: 100,
                partyState: party({ hostId: ME }),
                powerLevelUsers: { [ME]: 100 },
                timelineEvents: [timelineRequestEvent('@viewer:example.org', Date.now())],
            })
        );

        expect(container?.textContent).toContain('@viewer:example.org');
        expect(buttonByText('Make host')).toBeUndefined();
        expect(container?.textContent).toContain('needs moderator power');
    });

    it('shows a "watching now" count from fresh presence heartbeats', () => {
        render(
            buildRoom({
                myPower: 0,
                partyState: party(),
                timelineEvents: [
                    timelineHeartbeatEvent('@a:example.org', Date.now()),
                    timelineHeartbeatEvent('@b:example.org', Date.now()),
                ],
            })
        );

        expect(container?.textContent).toContain('Watching now: 2');
    });

    it('ends the party by clearing the state event', () => {
        const sendStateEvent = vi.fn().mockResolvedValue({ event_id: '$x' });
        render(buildRoom({ myPower: 100, partyState: party(), sendStateEvent }));

        act(() => {
            click(buttonByText('End party') as HTMLButtonElement);
        });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!room:example.org',
            WATCH_PARTY_STATE_EVENT_TYPE,
            {},
            ''
        );
    });
});
