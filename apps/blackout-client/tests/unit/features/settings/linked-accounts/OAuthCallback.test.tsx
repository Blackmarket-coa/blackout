// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
    OAuthCallback,
    POSTMESSAGE_TYPE,
} from '../../../../../src/app/features/settings/linked-accounts/OAuthCallback';

const originalFetch = global.fetch;

const renderAt = async (url: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[url]}>
                <Routes>
                    <Route path="/oauth/:provider/callback" element={<OAuthCallback />} />
                </Routes>
            </MemoryRouter>
        );
    });
    return { container, root };
};

const flushAsync = async () => {
    // The OAuth callback's useEffect runs an async function that does
    // up to two awaits (validate → completeCallback → setState). Wrap
    // multiple act() ticks so React commits the resulting state writes
    // before assertions.
    for (let i = 0; i < 6; i += 1) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
};

beforeEach(() => {
    document.body.innerHTML = '';
    (global as { fetch: typeof fetch }).fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
    (global as { fetch: typeof fetch }).fetch = originalFetch;
});

describe('OAuthCallback page', () => {
    it('exposes a stable postMessage type so the parent can subscribe to it', () => {
        expect(POSTMESSAGE_TYPE).toBe('blackout-oauth-callback');
    });

    it('renders an "Unknown provider" error when the URL provider is not in the supported set', async () => {
        const { container } = await renderAt('/oauth/myspace/callback?code=c&state=s');
        await flushAsync();
        expect(container.textContent).toMatch(/Unknown provider/);
    });

    it('renders the OAuth error envelope when the URL carries `?error=...`', async () => {
        const { container } = await renderAt(
            '/oauth/twitch/callback?error=access_denied&error_description=user+rejected'
        );
        await flushAsync();
        expect(container.textContent).toMatch(/access_denied/);
        // Did NOT call the completeCallback API: fetch should be untouched.
        expect(global.fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it('renders the missing-params error when both code and state are absent', async () => {
        const { container } = await renderAt('/oauth/twitch/callback');
        await flushAsync();
        expect(container.textContent).toMatch(/missing the .code. and .state. params/);
    });

    it('on success: posts to opener with the right shape and schedules window.close()', async () => {
        const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ok: true,
                    provider: 'twitch',
                    providerUserId: '12345',
                    providerUsername: 'StreamerBob',
                    scopes: [],
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            ) as unknown as Response
        );

        const openerPostMessage = vi.fn();
        const closeSpy = vi.fn();
        Object.defineProperty(window, 'opener', {
            configurable: true,
            value: { postMessage: openerPostMessage } as unknown as Window,
        });
        const originalClose = window.close;
        window.close = closeSpy;

        try {
            await renderAt('/oauth/twitch/callback?code=abc&state=xyz');
            await flushAsync();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('/v1/linked-accounts/twitch/callback');
            expect(init.method).toBe('POST');
            expect(JSON.parse(String(init.body))).toEqual({ code: 'abc', state: 'xyz' });

            expect(openerPostMessage).toHaveBeenCalled();
            const [payload, targetOrigin] = openerPostMessage.mock.calls[0] as [
                Record<string, unknown>,
                string
            ];
            expect(payload).toMatchObject({
                type: POSTMESSAGE_TYPE,
                provider: 'twitch',
                ok: true,
                providerUserId: '12345',
                providerUsername: 'StreamerBob',
            });
            expect(targetOrigin).toBe(window.location.origin);

            // Auto-close is scheduled with a small delay.
            await act(async () => {
                await new Promise((r) => setTimeout(r, 500));
            });
            expect(closeSpy).toHaveBeenCalled();
        } finally {
            window.close = originalClose;
            Object.defineProperty(window, 'opener', { configurable: true, value: null });
        }
    });

    it('on API error: surfaces the error to opener via postMessage(ok:false)', async () => {
        const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
        fetchMock.mockResolvedValueOnce(
            new Response('{"code":"state_invalid","message":"OAuth state is unknown"}', {
                status: 400,
                headers: { 'content-type': 'application/json' },
            }) as unknown as Response
        );

        const openerPostMessage = vi.fn();
        Object.defineProperty(window, 'opener', {
            configurable: true,
            value: { postMessage: openerPostMessage } as unknown as Window,
        });

        try {
            await renderAt('/oauth/twitch/callback?code=bad&state=stale');
            await flushAsync();

            expect(openerPostMessage).toHaveBeenCalled();
            const payload = openerPostMessage.mock.calls[0]?.[0] as Record<string, unknown>;
            expect(payload).toMatchObject({
                type: POSTMESSAGE_TYPE,
                provider: 'twitch',
                ok: false,
            });
            expect(typeof payload.error).toBe('string');
        } finally {
            Object.defineProperty(window, 'opener', { configurable: true, value: null });
        }
    });

    it('does not throw when there is no opener (user landed at the callback URL directly)', async () => {
        const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ok: true,
                    provider: 'twitch',
                    providerUserId: '1',
                    providerUsername: 'x',
                    scopes: [],
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            ) as unknown as Response
        );

        Object.defineProperty(window, 'opener', { configurable: true, value: null });

        const { container } = await renderAt('/oauth/twitch/callback?code=ok&state=s');
        await flushAsync();

        expect(fetchMock).toHaveBeenCalled();
        // Status text should still render — the page is usable as a fallback.
        expect(container.textContent).toMatch(/Linked\./);
    });
});
