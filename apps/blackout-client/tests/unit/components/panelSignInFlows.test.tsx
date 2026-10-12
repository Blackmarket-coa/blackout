// @vitest-environment jsdom
/**
 * The chat panel's three sign-in paths (password, account number, sign-up),
 * from the real sign-in page through the real client code to the requests it
 * makes, with B3's client switch (VITE_BLACKOUT_PANEL_SESSION_LENGTHS) on and
 * off.
 *
 * Switch on: every path waits for a length and binds exactly the chosen one to
 * the new device (`POST /_synapse/client/blackout/session/length`) before the
 * session is kept. Switch off (the default): the panel asks nothing, looks
 * nothing up and binds nothing, and keeps its session under the full app's
 * names, as before B3.
 *
 * Only the homeserver's discovery, the SDK client's login/register calls and
 * the client start-up are stubbed; every other request goes through `fetch`,
 * which is routed by URL so an unexpected request fails the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({}));

const loginFlowsMock = vi.fn();
const loginMock = vi.fn();
const registerRequestMock = vi.fn();
vi.mock('matrix-js-sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('matrix-js-sdk')>();
    return {
        ...actual,
        createClient: vi.fn(() => ({
            loginFlows: loginFlowsMock,
            login: loginMock,
            registerRequest: registerRequestMock,
        })),
    };
});

const autoDiscoveryMock = vi.fn();
const specVersionsMock = vi.fn();
vi.mock('../../../src/app/cs-api', () => ({
    autoDiscovery: (...args: unknown[]) => autoDiscoveryMock(...args),
    specVersions: (...args: unknown[]) => specVersionsMock(...args),
}));

// Starting the Matrix client needs IndexedDB and the crypto WASM; the panel's
// handling of a started session is covered in initMatrix.panelSession.test.ts.
const initMatrixFromStoredSessionMock = vi.fn();
vi.mock('../../../src/client/initMatrix', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/client/initMatrix')>();
    return {
        ...actual,
        initMatrixFromStoredSession: (...args: unknown[]) =>
            initMatrixFromStoredSessionMock(...args),
    };
});

import { accountNumberToLocalpart } from '@blackout/core';
import { LoginPage } from '../../../src/app/components/bmc/auth/LoginPage';
import { setStorageNamespaceForTests } from '../../../src/client/storageNamespace';

const HS = 'https://hs.example.test';
const LENGTHS_URL = `${HS}/_synapse/client/blackout/session/lengths`;
const BIND_URL = `${HS}/_synapse/client/blackout/session/length`;
// API_BASE_URL is empty (same origin) in tests.
const API_LENGTHS_URL = '/v1/auth/session-lengths';
const API_ACCOUNT_NUMBER_URL = '/v1/auth/account-number';
const ALL_LENGTHS = ['1h', '1d', '7d', '30d', 'until_sign_out'];
const PANEL_KEY = 'blackout.matrix.sessions.embed.v1';
const APP_KEY = 'blackout.matrix.sessions.v1';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A well-formed account number (26 characters of a-z and 2-7). */
const ACCOUNT_NUMBER = 'b7k2mqx4abcdefghijkmnpqrst';

const LOGIN_RESPONSE = {
    access_token: 'new-access-token',
    user_id: '@alice:hs.example.test',
    device_id: 'PANELDEV',
};

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

let requested: string[] = [];
let bindBodies: unknown[] = [];

/** Route `fetch` by URL; anything unexpected fails the test loudly. */
const routeFetch = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        requested.push(url);
        switch (url) {
            case '/config.json':
                return new Response('', { status: 404 });
            case LENGTHS_URL:
                return json(200, { session_lengths: ALL_LENGTHS });
            case API_LENGTHS_URL:
                return json(200, { enforced: true, sessionLengths: ALL_LENGTHS });
            case BIND_URL: {
                const body = JSON.parse(String(init?.body)) as { session_length: string };
                bindBodies.push(body);
                const ms: Record<string, number | null> = {
                    '1h': HOUR,
                    '1d': DAY,
                    '7d': 7 * DAY,
                    '30d': 30 * DAY,
                    until_sign_out: null,
                };
                const length = ms[body.session_length];
                return json(200, {
                    session_length: body.session_length,
                    expires_at_ms: length === null ? null : Date.now() + length,
                });
            }
            case API_ACCOUNT_NUMBER_URL:
                return json(200, { accountNumber: ACCOUNT_NUMBER });
            default:
                throw new Error(`unexpected fetch ${url}`);
        }
    });

const isSessionLengthRequest = (url: string) =>
    url.includes('/_synapse/client/blackout/session/') || url.includes('/v1/auth/session-lengths');

const flushAsync = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Wait for real async work (fetch, SubtleCrypto), up to about half a second. */
const waitFor = async (condition: () => boolean) => {
    for (let i = 0; i < 100 && !condition(); i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
    expect(condition()).toBe(true);
};

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = async (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    await act(async () => {
        (el as HTMLElement).click();
        await flushAsync();
    });
};

const submit = async (form: HTMLFormElement) => {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flushAsync();
    });
};

const buttonByText = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as
        | HTMLButtonElement
        | undefined;

const radio = (container: HTMLElement, length: string) =>
    container.querySelector(
        `input[type="radio"][name="panel-session-length"][value="${length}"]`
    ) as HTMLInputElement;

const accountNumberForm = (container: HTMLElement) =>
    container.querySelector('form[aria-label="Sign in with account number"]') as HTMLFormElement;

const createAccountForm = (container: HTMLElement) =>
    container.querySelector('form[aria-label="Create account"]') as HTMLFormElement;

const storedSession = (key: string) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const map = JSON.parse(raw) as { activeUserId: string; sessions: Record<string, unknown> };
    return map.sessions[map.activeUserId] as Record<string, unknown>;
};

const mounted: ReactDOM.Root[] = [];

/** The panel's sign-in page, loaded the way the browser loads `/embed`. */
const openPanelSignIn = async (switchOn: boolean) => {
    window.history.replaceState(null, '', '/embed');
    if (switchOn) vi.stubEnv('VITE_BLACKOUT_PANEL_SESSION_LENGTHS', '1');
    setStorageNamespaceForTests(null);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(
            <Provider store={createStore()}>
                <LoginPage embedded />
            </Provider>
        );
        await flushAsync();
    });
    // Let the homeserver resolve and (switch on) the length lookups answer.
    await waitFor(
        () => container.querySelector('form[aria-label="Sign in with password"]') !== null
    );
    if (switchOn) await waitFor(() => !radio(container, '1h').disabled);
    return container;
};

const typeAccountNumber = async (container: HTMLElement) => {
    const input = accountNumberForm(container).querySelector(
        'input[name="account-number"]'
    ) as HTMLInputElement;
    await act(async () => {
        setInputValue(input, ACCOUNT_NUMBER);
        await flushAsync();
    });
};

const fillSignUp = async (container: HTMLElement) => {
    const field = (name: string) =>
        createAccountForm(container).querySelector(`input[name="${name}"]`) as HTMLInputElement;
    await act(async () => {
        setInputValue(field('username'), 'alice');
        setInputValue(field('password'), 'correct horse battery');
        setInputValue(field('confirmPassword'), 'correct horse battery');
        await flushAsync();
    });
};

beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    requested = [];
    bindBodies = [];
    routeFetch();
    autoDiscoveryMock.mockResolvedValue([null, { 'm.homeserver': { base_url: HS } }]);
    specVersionsMock.mockResolvedValue({});
    loginFlowsMock.mockResolvedValue({ flows: [{ type: 'm.login.password' }] });
    loginMock.mockResolvedValue(LOGIN_RESPONSE);
    // First call: the sign-up page's probe (a UIA challenge = sign-up open).
    // Later calls: the registration itself.
    registerRequestMock.mockImplementation(async (body: { auth?: unknown }) => {
        if (!body?.auth) {
            throw Object.assign(new Error('uia challenge'), {
                httpStatus: 401,
                data: { flows: [{ stages: ['m.login.dummy'] }] },
            });
        }
        return LOGIN_RESPONSE;
    });
    initMatrixFromStoredSessionMock.mockResolvedValue({ fake: 'client' });
});

afterEach(() => {
    for (const root of mounted.splice(0)) act(() => root.unmount());
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
    setStorageNamespaceForTests(null);
});

describe('chat panel sign-in, B3 client switch on', () => {
    it('asks both servers which lengths they enforce', async () => {
        await openPanelSignIn(true);
        expect(requested).toContain(LENGTHS_URL);
        expect(requested).toContain(API_LENGTHS_URL);
    });

    it('account-number sign-in waits for a length, then binds exactly the chosen one', async () => {
        const container = await openPanelSignIn(true);
        await typeAccountNumber(container);
        const button = buttonByText(container, 'Sign in with account number');
        expect(button?.disabled).toBe(true);
        await submit(accountNumberForm(container));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(loginMock).not.toHaveBeenCalled();
        expect(bindBodies).toEqual([]);

        await click(radio(container, '1d'));
        expect(button?.disabled).toBe(false);
        await click(button);
        await waitFor(() => initMatrixFromStoredSessionMock.mock.calls.length > 0);

        expect(loginMock).toHaveBeenCalledWith(
            'm.login.password',
            expect.objectContaining({
                identifier: {
                    type: 'm.id.user',
                    user: await accountNumberToLocalpart(ACCOUNT_NUMBER),
                },
                password: ACCOUNT_NUMBER,
            })
        );
        expect(bindBodies).toEqual([{ session_length: '1d' }]);
        const stored = storedSession(PANEL_KEY);
        expect(stored?.sessionLength).toBe('1d');
        expect(typeof stored?.sessionEndsAt).toBe('number');
        expect(window.localStorage.getItem(APP_KEY)).toBeNull();
    });

    it('a new account number signs in only after a length is chosen, and binds it', async () => {
        const container = await openPanelSignIn(true);
        await click(buttonByText(container, 'Create an anonymous account'));
        await waitFor(() => buttonByText(container, "I've saved it") !== undefined);
        const saved = buttonByText(container, "I've saved it") as HTMLButtonElement;
        expect(saved.disabled).toBe(true);
        expect(loginMock).not.toHaveBeenCalled();

        await click(radio(container, '7d'));
        expect(saved.disabled).toBe(false);
        await click(saved);
        await waitFor(() => initMatrixFromStoredSessionMock.mock.calls.length > 0);

        expect(bindBodies).toEqual([{ session_length: '7d' }]);
        expect(storedSession(PANEL_KEY)?.sessionLength).toBe('7d');
    });

    it('sign-up waits for a length, then binds exactly the chosen one', async () => {
        const container = await openPanelSignIn(true);
        await click(buttonByText(container, 'Create account'));
        await waitFor(() => createAccountForm(container) !== null);
        await fillSignUp(container);
        const create = createAccountForm(container).querySelector(
            'button[type="submit"]'
        ) as HTMLButtonElement;
        expect(create.disabled).toBe(true);
        await submit(createAccountForm(container));
        expect(registerRequestMock.mock.calls.filter(([body]) => body?.auth)).toHaveLength(0);

        await click(radio(container, '30d'));
        expect(create.disabled).toBe(false);
        await click(create);
        await waitFor(() => initMatrixFromStoredSessionMock.mock.calls.length > 0);

        expect(bindBodies).toEqual([{ session_length: '30d' }]);
        expect(storedSession(PANEL_KEY)?.sessionLength).toBe('30d');
    });
});

describe('chat panel sign-in, B3 client switch off (the default)', () => {
    it('asks for no length and looks none up', async () => {
        const container = await openPanelSignIn(false);
        expect(container.querySelector('[data-testid="session-length-picker"]')).toBeNull();
        expect(requested.filter(isSessionLengthRequest)).toEqual([]);
    });

    it('account-number sign-in binds nothing and keeps the session under the full app’s key', async () => {
        const container = await openPanelSignIn(false);
        await typeAccountNumber(container);
        const button = buttonByText(container, 'Sign in with account number');
        expect(button?.disabled).toBe(false);
        await click(button);
        await waitFor(() => initMatrixFromStoredSessionMock.mock.calls.length > 0);

        expect(requested.filter(isSessionLengthRequest)).toEqual([]);
        expect(window.localStorage.getItem(PANEL_KEY)).toBeNull();
        expect(storedSession(APP_KEY)).toEqual({
            baseUrl: HS,
            accessToken: 'new-access-token',
            userId: '@alice:hs.example.test',
            deviceId: 'PANELDEV',
        });
    });

    it('sign-up binds nothing and keeps the session under the full app’s key', async () => {
        const container = await openPanelSignIn(false);
        await click(buttonByText(container, 'Create account'));
        await waitFor(() => createAccountForm(container) !== null);
        await fillSignUp(container);
        const create = createAccountForm(container).querySelector(
            'button[type="submit"]'
        ) as HTMLButtonElement;
        expect(create.disabled).toBe(false);
        await click(create);
        await waitFor(() => initMatrixFromStoredSessionMock.mock.calls.length > 0);

        expect(requested.filter(isSessionLengthRequest)).toEqual([]);
        expect(window.localStorage.getItem(PANEL_KEY)).toBeNull();
        expect(storedSession(APP_KEY)?.accessToken).toBe('new-access-token');
        expect(storedSession(APP_KEY)).not.toHaveProperty('sessionLength');
    });
});
