// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

let capturedHandler: ((event: unknown) => void) | null = null;
const unsubscribe = vi.fn();
const listenForNativeBridgeEvents = vi.fn((cb: (event: unknown) => void) => {
    capturedHandler = cb;
    return unsubscribe;
});
const extractRoomIdFromDeepLinkUrl = vi.fn();
vi.mock('../../../src/platform/native-bridge-contract', () => ({
    listenForNativeBridgeEvents: (...a: unknown[]) =>
        listenForNativeBridgeEvents(...(a as [(event: unknown) => void])),
    extractRoomIdFromDeepLinkUrl: (...a: unknown[]) => extractRoomIdFromDeepLinkUrl(...a),
}));

import { NativeBridgeListener } from '../../../src/platform/NativeBridgeListener';
import { buildCommunitiesPath } from '../../../src/app/pages/paths';

const mount = async () => {
    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(NativeBridgeListener));
    });
};

const emit = async (event: unknown) => {
    await act(async () => {
        capturedHandler?.(event);
    });
};

describe('NativeBridgeListener', () => {
    beforeEach(() => {
        navigate.mockReset();
        extractRoomIdFromDeepLinkUrl.mockReset();
        capturedHandler = null;
    });

    it('routes a notification tap to the room', async () => {
        await mount();
        await emit({ type: 'notification_interacted', roomId: '!room:bmc' });
        expect(navigate).toHaveBeenCalledWith(buildCommunitiesPath(null, '!room:bmc'));
    });

    it('ignores a notification with no roomId', async () => {
        await mount();
        await emit({ type: 'notification_interacted' });
        expect(navigate).not.toHaveBeenCalled();
    });

    it('routes a deep link to the extracted room', async () => {
        extractRoomIdFromDeepLinkUrl.mockReturnValue('!deep:bmc');
        await mount();
        await emit({ type: 'deep_link_opened', url: 'blackout://room/!deep:bmc' });
        expect(extractRoomIdFromDeepLinkUrl).toHaveBeenCalledWith('blackout://room/!deep:bmc');
        expect(navigate).toHaveBeenCalledWith(buildCommunitiesPath(null, '!deep:bmc'));
    });

    it('ignores a deep link with no resolvable room', async () => {
        extractRoomIdFromDeepLinkUrl.mockReturnValue(null);
        await mount();
        await emit({ type: 'deep_link_opened', url: 'blackout://settings' });
        expect(navigate).not.toHaveBeenCalled();
    });
});
