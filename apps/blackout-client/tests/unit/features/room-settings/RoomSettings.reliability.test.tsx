// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore } from 'jotai';

vi.mock('../../../../src/app/hooks/useScreenSize', () => ({
    ScreenSize: { Mobile: 0, Tablet: 1, Desktop: 2 },
    useScreenSizeContext: () => 0,
}));
const fakeRoom = {
    roomId: '!room:example.org',
    name: 'Room',
    getMyMembership: () => 'join',
} as unknown;
vi.mock('../../../../src/app/hooks/useRoom', () => ({
    useRoom: () => fakeRoom,
}));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getUserId: () => '@me:example.org' }),
}));
vi.mock('../../../../src/app/hooks/useMediaAuthentication', () => ({
    useMediaAuthentication: () => false,
}));
vi.mock('../../../../src/app/hooks/useRoomMeta', () => ({
    useRoomAvatar: () => undefined,
    useRoomName: () => 'Room',
    useRoomJoinRule: () => undefined,
}));
vi.mock('../../../../src/app/utils/matrix', async () => {
    const actual = await vi.importActual<typeof import('../../../../src/app/utils/matrix')>(
        '../../../../src/app/utils/matrix',
    );
    return { ...actual, mxcUrlToHttp: () => null };
});

import { RoomSettings } from '../../../../src/app/features/room-settings/RoomSettings';
import {
    renderDialog,
    installListenerLedger,
    captureConsoleErrors,
} from '../../helpers/modalReliability';

describe('RoomSettings reliability (content-component contract)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('mobile close affordance fires requestClose', async () => {
        const requestClose = vi.fn();
        const mounted = await renderDialog(<RoomSettings requestClose={requestClose} />, {
            store: createStore(),
        });
        const buttons = mounted.container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);
        buttons[0].click();
        expect(requestClose).toHaveBeenCalled();
        mounted.unmount();
    });

    it('mount/unmount cycles leak no window listeners', async () => {
        const errors = captureConsoleErrors();
        const { ledger, restore } = installListenerLedger();
        try {
            for (let i = 0; i < 5; i += 1) {
                const mounted = await renderDialog(
                    <RoomSettings requestClose={() => undefined} />,
                    { store: createStore() },
                );
                mounted.unmount();
            }
            expect(ledger().keydown).toBe(0);
            expect(ledger().pointerdown).toBe(0);
            const hard = errors.errors.filter(
                (e) => !/focus-trap|tabbable|act\(/i.test(e),
            );
            expect(hard).toEqual([]);
        } finally {
            restore();
            errors.restore();
        }
    });
});
