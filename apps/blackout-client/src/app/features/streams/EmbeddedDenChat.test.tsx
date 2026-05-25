// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const mocks = vi.hoisted(() => ({
    mx: { value: {} as unknown },
    room: { value: { roomId: '!den:srv' } as { roomId: string } | null },
}));

vi.mock('../../hooks/useMatrixClient', () => ({
    useMatrixClient: () => mocks.mx.value,
    useMatrixClientOrNull: () => mocks.mx.value,
}));
vi.mock('../../hooks/usePowerLevels', () => ({
    PowerLevelsContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    usePowerLevels: () => ({}),
}));
vi.mock('../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: mocks.room.value, loading: false, error: null }),
}));
vi.mock('../room/RoomInviteAcceptGate', () => ({
    RoomInviteAcceptGate: ({ children, roomId }: { children: React.ReactNode; roomId: string }) => (
        <div data-testid="gate" data-room-id={roomId}>
            {children}
        </div>
    ),
}));
vi.mock('../room/RoomTimeline', () => ({
    RoomTimeline: ({ roomId }: { roomId: string }) => (
        <div data-testid="embedded-timeline" data-room-id={roomId} />
    ),
}));
vi.mock('../room/MessageComposer', () => ({
    MessageComposer: ({ roomId }: { roomId: string }) => (
        <div data-testid="embedded-composer" data-room-id={roomId} />
    ),
}));

// eslint-disable-next-line import/first
import { EmbeddedDenChat } from './EmbeddedDenChat';

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

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    mocks.mx.value = {};
    mocks.room.value = { roomId: '!den:srv' };
    vi.clearAllMocks();
});

describe('EmbeddedDenChat', () => {
    it('mounts the den timeline and composer for the den id once the room resolves', () => {
        const container = render(<EmbeddedDenChat denId="!den:srv" />);

        const gate = container.querySelector('[data-testid="gate"]');
        expect(gate?.getAttribute('data-room-id')).toBe('!den:srv');

        const timeline = container.querySelector('[data-testid="embedded-timeline"]');
        const composer = container.querySelector('[data-testid="embedded-composer"]');
        expect(timeline?.getAttribute('data-room-id')).toBe('!den:srv');
        expect(composer?.getAttribute('data-room-id')).toBe('!den:srv');
    });

    it('renders nothing without an authenticated Matrix client', () => {
        mocks.mx.value = null;
        const container = render(<EmbeddedDenChat denId="!den:srv" />);
        expect(container.querySelector('[data-testid="livestream-den-chat"]')).toBeNull();
    });

    it('shows a loading state until the room object is available', () => {
        mocks.room.value = null;
        const container = render(<EmbeddedDenChat denId="!den:srv" />);
        expect(
            container.querySelector('[data-testid="livestream-den-chat-loading"]')
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="embedded-timeline"]')).toBeNull();
    });
});
