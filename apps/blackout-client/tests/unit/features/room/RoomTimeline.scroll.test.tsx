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
    mocks.loadMore.mockClear();
    mocks.events = [];
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

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
});
