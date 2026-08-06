// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ColiseumChallenge, RankedChallengeEntry } from '@blackout/core';
import { ChallengesTab } from '../../../../src/app/features/coliseum/tabs/ChallengesTab';

const fetchChallenges = vi.fn();
const fetchChallenge = vi.fn();
const submitEntry = vi.fn();
const voteForEntry = vi.fn();
const linkChallengeEntryDen = vi.fn();

const createRoom = vi.fn();
const sendStateEvent = vi.fn(async () => ({ event_id: '$e' }));
const leave = vi.fn(async () => undefined);

vi.mock('../../../../src/app/features/coliseum/challengesClient', () => ({
    fetchChallenges: (...args: unknown[]) => fetchChallenges(...(args as [])),
    fetchChallenge: (...args: unknown[]) => fetchChallenge(...(args as [])),
    submitEntry: (...args: unknown[]) => submitEntry(...(args as [])),
    voteForEntry: (...args: unknown[]) => voteForEntry(...(args as [])),
    createChallenge: vi.fn(),
    updateChallengeStatus: vi.fn(),
    linkChallengeEntryDen: (...args: unknown[]) => linkChallengeEntryDen(...(args as [])),
}));

vi.mock('../../../../src/app/features/canopy/denKind', () => ({
    createDenInCanopy: vi.fn(),
    findOrCreateCategory: vi.fn(),
    DEN_KIND_STATE_EVENT_TYPE: 'co.bmc.den.kind',
    useDenKind: () => 'forum',
}));

vi.mock('../../../../src/app/features/room/joinDenWithCanopy', () => ({
    joinDenWithCanopy: vi.fn(async () => undefined),
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

const CHALLENGE: ColiseumChallenge = {
    id: 'chal-1',
    title: 'Grow something you can eat',
    category: 'food',
    status: 'open',
    creatorId: '@ari:server',
    createdAt: '2026-05-02T11:00:00Z',
};

const entry = (over: Partial<RankedChallengeEntry> = {}): RankedChallengeEntry => ({
    id: 'cent-1',
    challengeId: 'chal-1',
    entrantId: '@bo:server',
    title: 'Balcony tomatoes',
    createdAt: '2026-05-03T09:00:00Z',
    votes: 3,
    rank: 1,
    ...over,
});

/** React installs its own `value` setter, so go through the prototype's. */
const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
};

const render = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<ChallengesTab />);
    });
    mountedRoots.push(root);
    return container;
};

const click = async (container: HTMLElement, selector: string) => {
    const target = container.querySelector(selector) ?? document.querySelector(selector);
    await act(async () => {
        (target as HTMLButtonElement).click();
    });
    await flush();
};

/** The card collapses entries by default; open it before touching them. */
const openEntries = async (container: HTMLElement) => {
    const toggle = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'View entries'
    );
    await act(async () => {
        toggle?.click();
    });
    await flush();
};

beforeEach(() => {
    fetchChallenges.mockResolvedValue({ challenges: [CHALLENGE] });
    fetchChallenge.mockResolvedValue({ challenge: CHALLENGE, entries: [entry()] });
    createRoom.mockResolvedValue({ room_id: '!entry-den:server' });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('ChallengesTab — an entry is prose, not just a title', () => {
    it('sends the body the API has always accepted', async () => {
        submitEntry.mockResolvedValue({ entry: entry() });
        const container = render();
        await flush();
        await openEntries(container);

        const title = container.querySelector(
            '[data-testid="coliseum-challenge-entry-input"]'
        ) as HTMLInputElement;
        const body = container.querySelector(
            '[data-testid="coliseum-challenge-entry-body"]'
        ) as HTMLTextAreaElement;
        expect(body).toBeTruthy();

        await act(async () => {
            setNativeValue(title, 'Balcony tomatoes');
            setNativeValue(body, 'Six plants, two buckets.');
        });
        const enter = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent === 'Enter'
        );
        await act(async () => {
            enter?.click();
        });
        await flush();

        // The column and the schema were always there; the composer just never
        // filled them, so every entry was a bare title.
        expect(submitEntry).toHaveBeenCalledWith('chal-1', {
            title: 'Balcony tomatoes',
            body: 'Six plants, two buckets.',
        });
    });

    it('renders a stored body', async () => {
        fetchChallenge.mockResolvedValue({
            challenge: CHALLENGE,
            entries: [entry({ body: 'Six plants, two buckets.' })],
        });
        const container = render();
        await flush();
        await openEntries(container);

        expect(
            container.querySelector('[data-testid="coliseum-challenge-entry-bodytext"]')
                ?.textContent
        ).toBe('Six plants, two buckets.');
    });
});

describe('ChallengesTab — discussion goes through a canopy den', () => {
    it('offers a discussion rather than growing a comment store', async () => {
        const container = render();
        await flush();
        await openEntries(container);
        await click(container, '[data-testid="coliseum-challenge-entry-discuss-cent-1"]');

        // The sheet portals to document.body, so query globally.
        expect(document.querySelector('[data-testid="coliseum-entry-discussion"]')).toBeTruthy();
        expect(document.querySelector('[data-testid="stub-forum"]')).toBeNull();
        // Lazy: no room until someone actually wants to talk.
        expect(createRoom).not.toHaveBeenCalled();
    });

    it('creates an unparented forum den and links it to the entry', async () => {
        linkChallengeEntryDen.mockResolvedValue({
            entry: { ...entry(), discussionDenId: '!entry-den:server' },
            created: true,
        });
        const container = render();
        await flush();
        await openEntries(container);
        await click(container, '[data-testid="coliseum-challenge-entry-discuss-cent-1"]');
        await click(container, '[data-testid="coliseum-entry-discussion-start"]');

        // A challenge has no canopy, so the den is unparented — the same path a
        // standalone topic takes, not a global "Coliseum canopy".
        expect(createRoom).toHaveBeenCalled();
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!entry-den:server',
            'co.bmc.den.kind',
            { kind: 'forum' },
            ''
        );
        expect(linkChallengeEntryDen).toHaveBeenCalledWith('cent-1', '!entry-den:server');
        expect(
            document.querySelector('[data-testid="stub-forum"]')?.getAttribute('data-room-id')
        ).toBe('!entry-den:server');
    });

    it('abandons its own room when another commenter linked one first', async () => {
        linkChallengeEntryDen.mockResolvedValue({
            entry: { ...entry(), discussionDenId: '!someone-elses:server' },
            created: false,
        });
        const container = render();
        await flush();
        await openEntries(container);
        await click(container, '[data-testid="coliseum-challenge-entry-discuss-cent-1"]');
        await click(container, '[data-testid="coliseum-entry-discussion-start"]');

        expect(leave).toHaveBeenCalledWith('!entry-den:server');
        expect(
            document.querySelector('[data-testid="stub-forum"]')?.getAttribute('data-room-id')
        ).toBe('!someone-elses:server');
    });

    it('opens an existing den straight away', async () => {
        fetchChallenge.mockResolvedValue({
            challenge: CHALLENGE,
            entries: [entry({ discussionDenId: '!existing:server' })],
        });
        const container = render();
        await flush();
        await openEntries(container);
        await click(container, '[data-testid="coliseum-challenge-entry-discuss-cent-1"]');

        expect(
            document.querySelector('[data-testid="stub-forum"]')?.getAttribute('data-room-id')
        ).toBe('!existing:server');
        expect(createRoom).not.toHaveBeenCalled();
    });

    /**
     * `useDiscussionDen` remembers the den it just created. One sheet instance
     * kept alive across entries would hand the next entry the previous one's
     * discussion, which is why the sheet is mounted only while open.
     */
    it("does not carry one entry's den over to the next", async () => {
        fetchChallenge.mockResolvedValue({
            challenge: CHALLENGE,
            entries: [entry(), entry({ id: 'cent-2', title: 'Rooftop beans', rank: 2 })],
        });
        linkChallengeEntryDen.mockResolvedValue({
            entry: { ...entry(), discussionDenId: '!entry-den:server' },
            created: true,
        });
        const container = render();
        await flush();
        await openEntries(container);

        await click(container, '[data-testid="coliseum-challenge-entry-discuss-cent-1"]');
        await click(container, '[data-testid="coliseum-entry-discussion-start"]');
        expect(document.querySelector('[data-testid="stub-forum"]')).toBeTruthy();

        // Close, then open a different entry that has no den of its own.
        await act(async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        await flush();
        await click(container, '[data-testid="coliseum-challenge-entry-discuss-cent-2"]');

        expect(document.querySelector('[data-testid="stub-forum"]')).toBeNull();
        expect(
            document.querySelector('[data-testid="coliseum-entry-discussion-start"]')
        ).toBeTruthy();
    });
});
