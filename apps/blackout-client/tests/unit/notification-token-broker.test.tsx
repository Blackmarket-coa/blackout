// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, createStore } from 'jotai';

const pushGatewayHolder = vi.hoisted(() => ({ url: undefined as string | undefined }));
vi.mock('../../src/platform/pushGatewayConfig', () => ({
    getPushGatewayUrl: () => pushGatewayHolder.url,
}));

import { matrixClientAtom } from '../../src/app/state/bmc-auth';
import { dispatchNativeBridgeEvent } from '../../src/platform/native-bridge-contract';
import {
    MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY,
    MOBILE_PUSH_TOKEN_STORAGE_KEY,
    NotificationTokenBroker,
} from '../../src/platform/NotificationTokenBroker';

const PUSH_GATEWAY_URL = 'https://push.theblackout.app/_matrix/push/v1/notify';

const setEnv = (value: string | undefined) => {
    pushGatewayHolder.url = value;
};

describe('NotificationTokenBroker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.classList.add('blackout-platform-android');
        try {
            window.localStorage.clear();
        } catch {
            // ignore
        }
        setEnv(undefined);
    });

    afterEach(() => {
        setEnv(undefined);
    });

    it('persists new tokens in localStorage when dispatched', async () => {
        const store = createStore();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <NotificationTokenBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_token',
                source: 'mobile',
                token: 'fcm-token-abc',
            });
            await Promise.resolve();
        });

        expect(window.localStorage.getItem(MOBILE_PUSH_TOKEN_STORAGE_KEY)).toBe('fcm-token-abc');
    });

    it('does not call setPusher while no matrix client is bound', async () => {
        setEnv(PUSH_GATEWAY_URL);
        const setPusher = vi.fn(async () => undefined);
        const store = createStore();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <NotificationTokenBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_token',
                source: 'mobile',
                token: 'fcm-token-no-mx',
            });
            await Promise.resolve();
        });

        expect(setPusher).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(MOBILE_PUSH_TOKEN_STORAGE_KEY)).toBe('fcm-token-no-mx');
    });

    it('registers a Matrix HTTP pusher when both gateway URL and client are present', async () => {
        setEnv(PUSH_GATEWAY_URL);
        const setPusher = vi.fn(async () => undefined);
        const store = createStore();
        store.set(matrixClientAtom, { setPusher } as unknown as Parameters<typeof store.set>[1]);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <NotificationTokenBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_token',
                source: 'mobile',
                token: 'fcm-token-xyz',
            });
            await Promise.resolve();
            // Allow setPusher promise to settle.
            await Promise.resolve();
        });

        expect(setPusher).toHaveBeenCalledTimes(1);
        const [request] = setPusher.mock.calls[0] ?? [];
        expect(request).toMatchObject({
            kind: 'http',
            app_id: 'coop.blackout.android',
            pushkey: 'fcm-token-xyz',
            data: { url: PUSH_GATEWAY_URL, format: 'event_id_only' },
            append: false,
        });

        expect(window.localStorage.getItem(MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY)).toBe(
            'fcm-token-xyz'
        );
    });

    it('does not re-register the same token on subsequent dispatches', async () => {
        setEnv(PUSH_GATEWAY_URL);
        const setPusher = vi.fn(async () => undefined);
        const store = createStore();
        store.set(matrixClientAtom, { setPusher } as unknown as Parameters<typeof store.set>[1]);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <NotificationTokenBroker />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_token',
                source: 'mobile',
                token: 'fcm-token-same',
            });
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(setPusher).toHaveBeenCalledTimes(1);

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_token',
                source: 'mobile',
                token: 'fcm-token-same',
            });
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(setPusher).toHaveBeenCalledTimes(1);
    });
});
