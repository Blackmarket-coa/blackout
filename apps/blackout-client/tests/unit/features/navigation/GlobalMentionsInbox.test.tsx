// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import GlobalMentionsInbox from '../../../../src/app/features/navigation/GlobalMentionsInbox';
import { matrixClientAtom } from '../../../../src/app/state/bmc-auth';
import {
    roomJumpTargetEventIdAtom,
    selectedRoomIdAtom,
} from '../../../../src/app/state/bmc-navigation';

const mentionEvent = {
    getId: () => '$mention-1',
} as unknown as MatrixEvent;

const room = {
    roomId: '!room:example.org',
    name: 'Room',
    getMyMembership: () => 'join',
    findEventById: (eventId: string) => (eventId === '$mention-1' ? mentionEvent : null),
    getEventReadUpTo: () => null,
} as unknown as Room;

const mockClient = {
    getUserId: () => '@me:example.org',
    getRooms: () => [room],
    sendReadReceipt: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => mockClient,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('GlobalMentionsInbox integration', () => {
    it('routes mention click through openMentionItem to room switch + jump + receipt', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const store = createStore();
        store.set(matrixClientAtom, mockClient as never);

        act(() => {
            root.render(
                <Provider store={store}>
                    <GlobalMentionsInbox
                        items={[
                            {
                                roomId: '!room:example.org',
                                roomName: 'Room',
                                eventId: '$mention-1',
                                body: 'hello',
                                timestamp: 1_700_000_000,
                                unread: true,
                            },
                        ]}
                        onClose={() => {}}
                        onMarkAllRead={async () => {}}
                        onMarkReadLocal={() => {}}
                    />
                </Provider>,
            );
        });

        const mentionButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('hello'),
        ) as HTMLButtonElement;
        expect(mentionButton).toBeTruthy();

        await act(async () => {
            mentionButton.click();
            await Promise.resolve();
        });

        expect(store.get(selectedRoomIdAtom)).toBe('!room:example.org');
        expect(store.get(roomJumpTargetEventIdAtom)).toBe('$mention-1');
        expect(mockClient.sendReadReceipt).toHaveBeenCalledWith(mentionEvent);

        act(() => {
            root.unmount();
        });
    });
});
