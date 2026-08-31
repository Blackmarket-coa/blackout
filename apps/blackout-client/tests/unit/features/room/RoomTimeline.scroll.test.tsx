// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const mocks = vi.hoisted(() => ({
    loadMore: vi.fn(() => Promise.resolve()),
    events: [] as unknown[],
    room: { value: { getMember: () => null, getReceiptsForEvent: () => [] } as unknown },
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ sendReadReceipt: vi.fn(() => Promise.resolve()) }),
    useMatrixClientOrNull: () => ({}),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: mocks.room.value, loading: false, error: null }),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter', () => ({
    useLegacyRoomTimelineAdapter: () => ({
        data: mocks.events,
        loading: false,
        error: null,
        loadMore: mocks.loadMore,
    }),
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTypingAdapter', () => ({
    useLegacyTypingIndicatorAdapter: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../../../../src/app/shell/modalOpenerRegistry', () => ({
    useRegisterModalOpener: () => {},
}));
vi.mock('../../../../src/app/components/messages', () => ({
    AudioMessage: () => null,
    FileMessage: () => null,
    ImageMessage: () => null,
    StickerMessage: () => null,
    VideoMessage: () => null,
}));
vi.mock('../../../../src/app/features/room/Reactions', () => ({ Reactions: () => null }));
vi.mock('../../../../src/app/features/profile/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('../../../../src/app/features/rounds/RoundCard', () => ({ RoundCard: () => null }));

// eslint-disable-next-line import/first
import { RoomTimeline } from '../../../../src/app/features/room/RoomTimeline';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];
const render = (element: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(element);
    });
    mountedRoots.push(root);
    return container;
};

beforeEach(() => {
    mocks.loadMore.mockReset();
    mocks.loadMore.mockImplementation(() => Promise.resolve());
    mocks.events = [];
});

afterEach(async () => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    // Outwait pending macrotasks before leaving the test, while jsdom still
    // exists. @tanstack/virtual-core's scroll handler arms a `scrollingDelay`
    // (150ms) setTimeout that neither the next-scroll clear nor unmounting
    // cancels; if it fires after this file's environment is torn down,
    // react-dom's `getCurrentEventPriority` touches `window` and the whole run
    // dies with an unhandled `ReferenceError: window is not defined` — every
    // test passing, and vitest still exiting non-zero. A 0ms flush is not
    // enough to cover that 150ms timer (it bit again under `--coverage`, where
    // slower teardown widens the race), so wait past the full delay; with the
    // roots already unmounted the timer then fires into a live window as a
    // no-op state update.
    await new Promise((resolve) => {
        setTimeout(resolve, 200);
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

// jsdom has no real layout: scrollTop/scrollHeight/clientHeight default to 0 and
// writes don't reflow, so the measured-restore paths (open-at-bottom, prepend
// delta, stick-to-bottom) can't be observed here — rendering message rows would
// also require fully-fledged MatrixEvents. These tests cover the parts that are
// deterministic in jsdom: that back-pagination fires once per burst and that the
// in-flight guard is held until restoration rather than released the instant
// loadMore resolves (the bug that made scrolling "stick" and reload repeatedly).
const stubScroller = (
    el: HTMLElement,
    geometry: { scrollTop?: number; scrollHeight: number; clientHeight: number }
) => {
    let scrollTop = geometry.scrollTop ?? 0;
    Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
            scrollTop = value;
        },
    });
    Object.defineProperty(el, 'scrollHeight', {
        configurable: true,
        get: () => geometry.scrollHeight,
    });
    Object.defineProperty(el, 'clientHeight', {
        configurable: true,
        get: () => geometry.clientHeight,
    });
};

describe('RoomTimeline back-pagination', () => {
    it('triggers loadMore only once for a burst of scroll events near the top', () => {
        const container = render(<RoomTimeline roomId="!den:srv" hasMoreBackPagination />);
        const scroller = container.querySelector('section > div') as HTMLDivElement;
        expect(scroller).not.toBeNull();

        act(() => {
            // A burst of scroll ticks while pinned at the top (scrollTop defaults to 0).
            for (let i = 0; i < 10; i += 1) {
                scroller.dispatchEvent(new Event('scroll'));
            }
        });

        expect(mocks.loadMore).toHaveBeenCalledTimes(1);
    });

    it('holds the guard until restoration: resolving loadMore alone does not re-arm', async () => {
        // Defer loadMore so we control exactly when it resolves.
        let resolveLoad: () => void = () => {};
        mocks.loadMore.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveLoad = resolve;
                })
        );

        const container = render(<RoomTimeline roomId="!den:srv" hasMoreBackPagination />);
        const scroller = container.querySelector('section > div') as HTMLDivElement;
        stubScroller(scroller, { scrollTop: 0, scrollHeight: 1000, clientHeight: 500 });

        act(() => {
            scroller.dispatchEvent(new Event('scroll'));
        });
        expect(mocks.loadMore).toHaveBeenCalledTimes(1);

        // Resolve the in-flight load and flush microtasks. With no re-render the
        // restore effect never runs, so the guard must stay held (a re-fire here
        // is exactly the "sticking"/repeated-reload regression).
        await act(async () => {
            resolveLoad();
            await Promise.resolve();
        });

        act(() => {
            for (let i = 0; i < 5; i += 1) {
                scroller.dispatchEvent(new Event('scroll'));
            }
        });

        expect(mocks.loadMore).toHaveBeenCalledTimes(1);
    });

    it('does not paginate when the scroller is not near the top', () => {
        const container = render(<RoomTimeline roomId="!den:srv" hasMoreBackPagination />);
        const scroller = container.querySelector('section > div') as HTMLDivElement;
        stubScroller(scroller, { scrollTop: 500, scrollHeight: 2000, clientHeight: 500 });

        act(() => {
            scroller.dispatchEvent(new Event('scroll'));
        });

        expect(mocks.loadMore).not.toHaveBeenCalled();
    });
});
