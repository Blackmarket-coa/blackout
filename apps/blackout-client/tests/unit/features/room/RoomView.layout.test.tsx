// @vitest-environment jsdom
import React from 'react';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReactDOM from 'react-dom/client';
import { RoomView } from '../../../../src/app/features/room/RoomView';

vi.mock('../../../../src/app/features/room/RoomViewHeader', () => ({
    RoomViewHeader: () => <div />,
}));
vi.mock('../../../../src/app/features/room/RoomTimeline', () => ({
    RoomTimeline: () => <div data-testid="room-timeline">timeline</div>,
}));
vi.mock('../../../../src/app/features/room/RoomInput', () => ({
    RoomInput: () => <div data-testid="room-composer">composer</div>,
}));
vi.mock('../../../../src/app/features/room/RoomViewTyping', () => ({
    RoomViewTyping: () => <div />,
}));
vi.mock('../../../../src/app/features/room/RoomTombstone', () => ({
    RoomTombstone: () => <div />,
}));
vi.mock('../../../../src/app/features/room/RoomInputPlaceholder', () => ({
    RoomInputPlaceholder: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../../src/app/features/room/RoomViewFollowing', () => ({
    RoomViewFollowing: () => <div />,
    RoomViewFollowingPlaceholder: () => <div />,
}));
vi.mock('../../../../src/app/hooks/useStateEvent', () => ({ useStateEvent: () => null }));
vi.mock('../../../../src/app/hooks/usePowerLevels', () => ({ usePowerLevelsContext: () => ({}) }));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getSafeUserId: () => '@me:example.org' }),
}));
vi.mock('../../../../src/app/components/editor', () => ({ useEditor: () => ({}) }));
vi.mock('../../../../src/app/hooks/useKeyDown', () => ({ useKeyDown: () => {} }));
vi.mock('../../../../src/app/state/hooks/settings', () => ({ useSetting: () => [false] }));
vi.mock('../../../../src/app/hooks/useRoomPermissions', () => ({
    useRoomPermissions: () => ({ event: () => true }),
}));
vi.mock('../../../../src/app/hooks/useRoomCreators', () => ({ useRoomCreators: () => [] }));
vi.mock('../../../../src/app/features/quests/QuestSheet', () => ({
    QuestSheet: () => <div data-testid="quest-sheet" />,
}));

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
});

describe('RoomView baseline parity', () => {
    it('keeps timeline above composer in room layout', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        mountedRoots.push(root);
        flushSync(() => {
            root.render(<RoomView room={{ roomId: '!room:example.org' } as never} />);
        });

        const timeline = container.querySelector('[data-testid="room-timeline"]');
        const composer = container.querySelector('[data-testid="room-composer"]');

        expect(timeline).toBeTruthy();
        expect(composer).toBeTruthy();
        expect(
            (timeline?.compareDocumentPosition(composer as Node) ?? 0) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });
});
