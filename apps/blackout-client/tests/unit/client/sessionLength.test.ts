// @vitest-environment jsdom
/**
 * Chat panel sign-in with a session length (launch-plan B3), on the client:
 * the length is bound to the new device on the homeserver before the panel
 * keeps or uses the device's tokens, a timed length is never used unless both
 * servers enforce it, and the full app's sign-in is untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai/vanilla';

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({}));
const loginMock = vi.fn();
const registerRequestMock = vi.fn();
vi.mock('matrix-js-sdk', () => ({
    createClient: vi.fn(() => ({ login: loginMock, registerRequest: registerRequestMock })),
    HttpApiEvent: { SessionLoggedOut: 'Session.logged_out' },
    IndexedDBCryptoStore: class {},
    IndexedDBStore: class {},
}));

const initMatrixFromStoredSessionMock = vi.fn();
vi.mock('../../../src/client/initMatrix', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/client/initMatrix')>();
    return {
        ...actual,
        initMatrixFromStoredSession: (...args: unknown[]) =>
            initMatrixFromStoredSessionMock(...args),
    };
});

import { loginWithPassword, registerUser } from '../../../src/client/auth';
import { MatrixInitError } from '../../../src/client/initMatrix';
import {
    bindSessionLength,
    fetchEnforcedSessionLengths,
    SESSION_LENGTH_REQUEST_TIMEOUT_MS,
    SessionLengthBindError,
} from '../../../src/client/sessionLength';
import { setStorageNamespaceForTests } from '../../../src/client/storageNamespace';

const HS = 'https://hs.example.test';
const PANEL_KEY = 'blackout.matrix.sessions.embed.v1';
const APP_KEY = 'blackout.matrix.sessions.v1';
const HOUR = 60 * 60 * 1000;

const LOGIN_RESPONSE = {
    access_token: 'new-access-token',
    user_id: '@alice:hs.example.test',
    device_id: 'PANELDEV',
};

type Route = (init: RequestInit | undefined) => Response | Promise<Response>;

/** Route fetch by URL; anything unexpected fails the test loudly. */
const routeFetch = (routes: Record<string, Route>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        const route = routes[url];
        if (!route) throw new Error(`unexpected fetch ${url}`);
        return route(init);
    });

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const storedPanelSession = () => {
    const raw = window.localStorage.getItem(PANEL_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as { activeUserId: string; sessions: Record<string, unknown> };
    return map.sessions[map.activeUserId] as Record<string, unknown>;
};

const signIn = (choice?: Parameters<typeof loginWithPassword>[2]) =>
    loginWithPassword(
        createStore(),
        {
            baseUrl: HS,
            identifier: { type: 'm.id.user', user: 'alice' },
            password: 'correct horse',
        },
        choice
    );

describe('panel sign-in with a session length', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
        vi.restoreAllMocks();
        setStorageNamespaceForTests(true);
        loginMock.mockResolvedValue(LOGIN_RESPONSE);
        initMatrixFromStoredSessionMock.mockResolvedValue({ fake: 'client' });
    });

    afterEach(() => {
        setStorageNamespaceForTests(null);
    });

    it('binds the length to the new device before keeping any token', async () => {
        const started = Date.now();
        let storedAtBind: unknown = 'not called';
        const fetchMock = routeFetch({
            [`${HS}/_synapse/client/blackout/session/length`]: (init) => {
                storedAtBind = storedPanelSession();
                expect(init?.method).toBe('POST');
                expect((init?.headers as Record<string, string>).Authorization).toBe(
                    'Bearer new-access-token'
                );
                expect(JSON.parse(String(init?.body))).toEqual({ session_length: '1h' });
                return json(200, {
                    device_id: 'PANELDEV',
                    session_length: '1h',
                    expires_at_ms: Date.now() + HOUR,
                });
            },
        });

        await signIn({ length: '1h', enforcedByServer: true });
        const finished = Date.now();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(storedAtBind).toBeNull();
        const stored = storedPanelSession();
        expect(stored?.accessToken).toBe('new-access-token');
        expect(stored?.sessionLength).toBe('1h');
        const endsAt = stored?.sessionEndsAt as number;
        expect(endsAt).toBeGreaterThanOrEqual(started + HOUR);
        expect(endsAt).toBeLessThanOrEqual(finished + HOUR);
        // The full app's stored session is never written by the panel.
        expect(window.localStorage.getItem(APP_KEY)).toBeNull();
        expect(initMatrixFromStoredSessionMock).toHaveBeenCalledTimes(1);
    });

    const failures: Array<[string, Route]> = [
        [
            'the homeserver does not have the feature',
            () => json(404, { errcode: 'M_UNRECOGNIZED' }),
        ],
        ['the homeserver refuses', () => json(400, { errcode: 'M_INVALID_PARAM' })],
        [
            'the homeserver confirms a different length',
            () => json(200, { session_length: '30d', expires_at_ms: Date.now() + 30 * 24 * HOUR }),
        ],
        [
            'the homeserver confirms no end for a timed length',
            () => json(200, { session_length: '1h', expires_at_ms: null }),
        ],
        [
            'the homeserver cannot be reached',
            () => {
                throw new TypeError('network down');
            },
        ],
    ];
    for (const [label, bind] of failures) {
        it(`signs the device out and keeps nothing when ${label}`, async () => {
            const logout = vi.fn(() => json(200, {}));
            routeFetch({
                [`${HS}/_synapse/client/blackout/session/length`]: bind,
                [`${HS}/_matrix/client/v3/logout`]: (init) => {
                    expect((init?.headers as Record<string, string>).Authorization).toBe(
                        'Bearer new-access-token'
                    );
                    return logout();
                },
            });

            const error = await signIn({ length: '1h', enforcedByServer: true }).catch(
                (e: unknown) => e
            );
            expect(error).toBeInstanceOf(MatrixInitError);
            expect((error as MatrixInitError).code).toBe('session_length_unavailable');
            expect(logout).toHaveBeenCalledTimes(1);
            expect(window.localStorage.getItem(PANEL_KEY)).toBeNull();
            expect(initMatrixFromStoredSessionMock).not.toHaveBeenCalled();
        });
    }

    it('refuses a timed length the servers do not enforce, before contacting the homeserver', async () => {
        const fetchMock = routeFetch({});
        const error = await signIn({ length: '7d', enforcedByServer: false }).catch(
            (e: unknown) => e
        );
        expect((error as MatrixInitError).code).toBe('session_length_unavailable');
        expect(loginMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(PANEL_KEY)).toBeNull();
    });

    it('signs in "until I sign out" without a bind when the servers do not enforce lengths', async () => {
        const fetchMock = routeFetch({});
        await signIn({ length: 'until_sign_out', enforcedByServer: false });
        expect(fetchMock).not.toHaveBeenCalled();
        const stored = storedPanelSession();
        expect(stored?.sessionLength).toBe('until_sign_out');
        expect(stored?.sessionEndsAt).toBeUndefined();
    });

    it('records "until I sign out" on the homeserver when it enforces lengths', async () => {
        routeFetch({
            [`${HS}/_synapse/client/blackout/session/length`]: (init) => {
                expect(JSON.parse(String(init?.body))).toEqual({
                    session_length: 'until_sign_out',
                });
                return json(200, { session_length: 'until_sign_out', expires_at_ms: null });
            },
        });
        await signIn({ length: 'until_sign_out', enforcedByServer: true });
        const stored = storedPanelSession();
        expect(stored?.sessionLength).toBe('until_sign_out');
        expect(stored?.sessionEndsAt).toBeUndefined();
    });

    it('binds the length after signing up in the panel, too', async () => {
        registerRequestMock.mockResolvedValue(LOGIN_RESPONSE);
        routeFetch({
            [`${HS}/_synapse/client/blackout/session/length`]: () =>
                json(200, { session_length: '1d', expires_at_ms: Date.now() + 24 * HOUR }),
        });
        const outcome = await registerUser(createStore(), {
            baseUrl: HS,
            username: 'alice',
            password: 'correct horse',
            auth: { type: 'm.login.dummy' },
            sessionChoice: { length: '1d', enforcedByServer: true },
        });
        expect(outcome.status).toBe('success');
        expect(storedPanelSession()?.sessionLength).toBe('1d');
    });
});

describe('the full app’s sign-in', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
        vi.restoreAllMocks();
        setStorageNamespaceForTests(false);
        loginMock.mockResolvedValue(LOGIN_RESPONSE);
        initMatrixFromStoredSessionMock.mockResolvedValue({ fake: 'client' });
    });

    afterEach(() => {
        setStorageNamespaceForTests(null);
    });

    it('is unchanged: no bind, no panel fields, the usual storage key', async () => {
        const fetchMock = routeFetch({});
        await signIn();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(PANEL_KEY)).toBeNull();
        const map = JSON.parse(window.localStorage.getItem(APP_KEY) ?? '{}') as {
            sessions: Record<string, Record<string, unknown>>;
        };
        expect(map.sessions['@alice:hs.example.test']).toEqual({
            baseUrl: HS,
            accessToken: 'new-access-token',
            userId: '@alice:hs.example.test',
            deviceId: 'PANELDEV',
        });
    });
});

describe('fetchEnforcedSessionLengths', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const ALL = ['1h', '1d', '7d', '30d', 'until_sign_out'];
    const homeserverUrl = `${HS}/_synapse/client/blackout/session/lengths`;
    // API_BASE_URL is empty (same origin) in tests; the SDK resolves the path
    // against it unchanged.
    const apiUrl = '/v1/auth/session-lengths';

    it('returns the lengths both servers enforce', async () => {
        routeFetch({
            [homeserverUrl]: () => json(200, { session_lengths: ['1h', 'until_sign_out'] }),
            [apiUrl]: () => json(200, { enforced: true, sessionLengths: ALL }),
        });
        expect([...(await fetchEnforcedSessionLengths(HS))].sort()).toEqual(
            ['1h', 'until_sign_out'].sort()
        );
    });

    const nothing: Array<[string, Record<string, Route>]> = [
        [
            'the API does not enforce them (404)',
            {
                [homeserverUrl]: () => json(200, { session_lengths: ALL }),
                [apiUrl]: () => json(404, { code: 'not_found' }),
            },
        ],
        [
            'the homeserver does not run the feature (404)',
            {
                [homeserverUrl]: () =>
                    new Response('<html>No Such Resource</html>', { status: 404 }),
                [apiUrl]: () => json(200, { enforced: true, sessionLengths: ALL }),
            },
        ],
        [
            'the API answers without enforced: true',
            {
                [homeserverUrl]: () => json(200, { session_lengths: ALL }),
                [apiUrl]: () => json(200, { sessionLengths: ALL }),
            },
        ],
        [
            'a server cannot be reached',
            {
                [homeserverUrl]: () => {
                    throw new TypeError('offline');
                },
                [apiUrl]: () => json(200, { enforced: true, sessionLengths: ALL }),
            },
        ],
    ];
    for (const [label, routes] of nothing) {
        it(`returns nothing when ${label}`, async () => {
            routeFetch(routes);
            expect((await fetchEnforcedSessionLengths(HS)).size).toBe(0);
        });
    }

    it('ignores values it does not know', async () => {
        routeFetch({
            [homeserverUrl]: () => json(200, { session_lengths: ['1h', '2h', 'forever', 3600] }),
            [apiUrl]: () => json(200, { enforced: true, sessionLengths: ['1h', '2h', 'forever'] }),
        });
        expect([...(await fetchEnforcedSessionLengths(HS))]).toEqual(['1h']);
    });
});

describe('bindSessionLength', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves with the server’s end only when it confirms the length asked for', async () => {
        routeFetch({
            [`${HS}/_synapse/client/blackout/session/length`]: () =>
                json(200, { session_length: '7d', expires_at_ms: 1_800_000_000_000 }),
        });
        await expect(bindSessionLength(HS, 'tok', '7d')).resolves.toEqual({
            expiresAtMs: 1_800_000_000_000,
        });
    });

    it('rejects on a conflict: a length already set is never replaced', async () => {
        routeFetch({
            [`${HS}/_synapse/client/blackout/session/length`]: () =>
                json(409, { errcode: 'CO.BMC.SESSION_LENGTH_ALREADY_SET' }),
        });
        await expect(bindSessionLength(HS, 'tok', '1h')).rejects.toBeInstanceOf(
            SessionLengthBindError
        );
    });
});

describe('session-length requests never hang sign-in', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** A server that never answers, but honours the request's abort signal. */
    const hangingFetch = () =>
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            (_input, init) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError'))
                    );
                })
        );

    it('gives up on an unanswered bind, so sign-in fails instead of waiting forever', async () => {
        hangingFetch();
        const pending = bindSessionLength(HS, 'tok', '1h');
        const outcome = pending.catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(SESSION_LENGTH_REQUEST_TIMEOUT_MS + 1);
        expect(await outcome).toBeInstanceOf(SessionLengthBindError);
    });

    /** One server answers at once; the other never does (but honours abort). */
    const oneServerHangs = (hanging: 'homeserver' | 'api') =>
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input instanceof Request ? input.url : input);
            const isHomeserver = url.startsWith(HS);
            if ((hanging === 'homeserver') === isHomeserver) {
                return new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError'))
                    );
                });
            }
            return Promise.resolve(
                json(
                    200,
                    isHomeserver
                        ? { session_lengths: ['1h', 'until_sign_out'] }
                        : { enforced: true, sessionLengths: ['1h', 'until_sign_out'] }
                )
            );
        });

    for (const hanging of ['homeserver', 'api'] as const) {
        it(`treats an unanswered ${hanging} as "no timed lengths"`, async () => {
            oneServerHangs(hanging);
            const pending = fetchEnforcedSessionLengths(HS);
            await vi.advanceTimersByTimeAsync(SESSION_LENGTH_REQUEST_TIMEOUT_MS + 1);
            expect((await pending).size).toBe(0);
        });
    }
});
