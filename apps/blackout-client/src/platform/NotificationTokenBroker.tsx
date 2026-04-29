import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import type { IPusherRequest } from 'matrix-js-sdk';
import { matrixClientAtom } from '../app/state/bmc-auth';
import { listenForNativeBridgeEvents } from './native-bridge-contract';
import { getPushGatewayUrl } from './pushGatewayConfig';

export const MOBILE_PUSH_TOKEN_STORAGE_KEY = 'blackout.mobile.pushToken';
export const MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY = 'blackout.mobile.pushToken.registered';

const APP_ID_PREFIX = 'coop.blackout';

function detectMobilePlatform(): 'ios' | 'android' | 'web' {
    if (typeof document === 'undefined') return 'web';
    const cls = document.body.classList;
    if (cls.contains('blackout-platform-ios')) return 'ios';
    if (typeof cls.contains === 'function' && cls.contains('blackout-platform-android')) return 'android';
    return 'web';
}

function persistToken(token: string): void {
    try {
        globalThis.localStorage?.setItem(MOBILE_PUSH_TOKEN_STORAGE_KEY, token);
    } catch {
        // localStorage can throw in private mode or sandboxed contexts; ignore.
    }
}

function markTokenRegistered(token: string): void {
    try {
        globalThis.localStorage?.setItem(MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY, token);
    } catch {
        // ignore
    }
}

function getRegisteredToken(): string | null {
    try {
        return globalThis.localStorage?.getItem(MOBILE_PUSH_TOKEN_REGISTERED_STORAGE_KEY) ?? null;
    } catch {
        return null;
    }
}

function buildPusherRequest(token: string): IPusherRequest | null {
    const url = getPushGatewayUrl();
    if (!url) return null;
    const platform = detectMobilePlatform();
    return {
        kind: 'http',
        app_id: `${APP_ID_PREFIX}.${platform}`,
        pushkey: token,
        app_display_name: 'Blackout',
        device_display_name: `Blackout ${platform}`,
        lang: 'en',
        data: {
            url,
            format: 'event_id_only',
        },
        append: false,
    } as IPusherRequest;
}

/**
 * Listens for native push tokens dispatched by the mobile wrapper and registers
 * them with the homeserver as a Matrix pusher. Tokens are persisted in
 * localStorage with a parity-compatible key as soon as they arrive, so a
 * subsequent matrix-client bootstrap can re-register without a fresh dispatch.
 */
export function NotificationTokenBroker(): null {
    const mx = useAtomValue(matrixClientAtom);

    useEffect(() => {
        const tryRegister = async (token: string) => {
            if (!mx) return;
            const previous = getRegisteredToken();
            if (previous === token) return;

            const request = buildPusherRequest(token);
            if (!request) return;

            try {
                await mx.setPusher(request);
                markTokenRegistered(token);
            } catch {
                // Surface errors via console only; the broker is a side channel.
                // Pusher registration retries are handled by the next dispatch.
            }
        };

        const cachedToken = (() => {
            try {
                return globalThis.localStorage?.getItem(MOBILE_PUSH_TOKEN_STORAGE_KEY);
            } catch {
                return null;
            }
        })();

        if (cachedToken) {
            void tryRegister(cachedToken);
        }

        return listenForNativeBridgeEvents((event) => {
            if (event.type !== 'notification_token') return;
            if (!event.token) return;
            persistToken(event.token);
            void tryRegister(event.token);
        });
    }, [mx]);

    return null;
}
