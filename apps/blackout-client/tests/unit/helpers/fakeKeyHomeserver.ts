/**
 * A fake homeserver for the key-backup guard's tests (S9,
 * `docs/security/key-backup-nudge-2026-11-02.md`).
 *
 * It answers the endpoints the guard reads and the ones the from-scratch
 * setup writes, through a real `MatrixClient`'s `fetchFn`, so the SDK's own
 * HTTP layer turns each answer into what the code under test sees: a
 * `MatrixError` for a JSON error, an `HTTPError` for a non-JSON one, a
 * `ConnectionError` when the request never reaches a server. The answers
 * follow the fork's Synapse:
 *
 * - `GET /room_keys/version`: the current version, or 404 `M_NOT_FOUND`
 *   when the account has none (`synapse/rest/client/room_keys.py`,
 *   `RoomKeysNewVersionServlet.on_GET`).
 * - `POST /keys/query`: `master_keys` is always an object, with an entry for
 *   each queried user who has a master key (`synapse/handlers/e2e_keys.py`,
 *   `get_cross_signing_keys_from_cache`).
 * - `POST /keys/device_signing/upload`: user-interactive auth (the password)
 *   only when the account already has a master key. That is the fork's
 *   Synapse under MSC3967 (`synapse/rest/client/keys.py`,
 *   `SigningKeyUploadServlet.on_POST`, the `msc3967_enabled` branch), which
 *   is off by default (`synapse/config/experimental.py`); with the default
 *   config Synapse asks every time, first-time setup included, unless
 *   `ui_auth.session_timeout` is set (`synapse/handlers/auth.py`,
 *   `validate_user_via_ui_auth` with `can_skip_ui_auth`). The guard never
 *   reaches this endpoint unless the verdict is 'none', so the difference
 *   does not touch it; the fake takes the MSC3967 shape so a first-time
 *   setup's writes can be shown in one submit.
 * - Account data is stored; a PUT is echoed as the sync would, after the
 *   answer, because secret storage waits for that echo before it goes on.
 */
import {
    ClientEvent,
    MatrixEvent,
    MemoryStore,
    createClient,
    type MatrixClient,
} from 'matrix-js-sdk';
import type { Logger } from 'matrix-js-sdk/lib/logger';
import { cryptoCallbacks } from '../../../src/client/secretStorageKeys';

export const HS_URL = 'https://hs.example.org';
export const ME = '@alice:example.org';
export const DEVICE_ID = 'NEWDEVICEX';
const V3 = '/_matrix/client/v3';

/** Valid-length (32-byte) unpadded base64 keys, so the crypto layer can parse them. */
export const BACKUP_PUBLIC_KEY = 'hSDwCYkwp1R0i33ctD73Wg2/Og0mOBr066SpjqqbTmo';
export const OLD_MASTER_KEY = 'nqOvzeuGWT/sRx3h7+MHoInYj3Uk2LD/unI9kDYcHwk';

export type FakeAnswer =
    | { kind: 'json'; status: number; body: unknown }
    | { kind: 'text'; status: number; body: string; contentType: string }
    /** The request never reaches a server: `fetch` rejects at once. */
    | { kind: 'reject' }
    /** No answer; rejects with the abort reason when the request is aborted, as `fetch` does. */
    | { kind: 'hang' }
    /** No answer, ever, and the abort signal is ignored. */
    | { kind: 'hang-ignoring-abort' };

export interface FakeKeyHomeserverOptions {
    /** The account's current backup version, or null for none. Default null. */
    backupVersion?: string | null;
    /** Answer `GET /room_keys/version` with this instead. */
    backupAnswer?: FakeAnswer;
    /** Whether the account has a master cross-signing key. Default false. */
    masterKey?: boolean;
    /** Answer `POST /keys/query` with this instead. */
    keysQueryAnswer?: FakeAnswer;
    /** Account data the server already holds. */
    accountData?: Record<string, unknown>;
}

export interface FakeCall {
    method: string;
    path: string;
    body: unknown;
}

const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const masterKeyBody = (key: string) => ({
    user_id: ME,
    usage: ['master'],
    keys: { [`ed25519:${key}`]: key },
});

const parseBody = (init?: RequestInit): unknown => {
    if (typeof init?.body !== 'string') return undefined;
    try {
        return JSON.parse(init.body);
    } catch {
        return init.body;
    }
};

const answerWith = (answer: FakeAnswer, init?: RequestInit): Promise<Response> => {
    switch (answer.kind) {
        case 'json':
            return Promise.resolve(jsonResponse(answer.status, answer.body));
        case 'text':
            return Promise.resolve(
                new Response(answer.body, {
                    status: answer.status,
                    headers: { 'Content-Type': answer.contentType },
                })
            );
        case 'reject':
            return Promise.reject(new TypeError('Failed to fetch'));
        case 'hang':
            return new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                signal?.addEventListener('abort', () => {
                    reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
                });
            });
        case 'hang-ignoring-abort':
        default:
            return new Promise<Response>(() => undefined);
    }
};

export interface FakeKeyHomeserver {
    fetchFn: typeof fetch;
    calls: FakeCall[];
    /** The client whose account-data PUTs are echoed back. */
    attach: (mx: MatrixClient) => void;
    backupVersion: () => string | null;
    masterKey: () => string | null;
    accountData: Map<string, unknown>;
    setBackupAnswer: (answer: FakeAnswer | undefined) => void;
    setBackupVersion: (version: string | null) => void;
    setMasterKey: (present: boolean) => void;
    /** Calls that change what the account has on the server (writes to keys, backup or secret storage). */
    destructiveCalls: () => FakeCall[];
}

export function createFakeKeyHomeserver(options: FakeKeyHomeserverOptions = {}): FakeKeyHomeserver {
    const calls: FakeCall[] = [];
    let backupVersion: string | null = options.backupVersion ?? null;
    let nextBackupVersion = Number(backupVersion ?? '0') + 1;
    let backupAnswer = options.backupAnswer;
    const keysQueryAnswer = options.keysQueryAnswer;
    let master: string | null = options.masterKey ? OLD_MASTER_KEY : null;
    const accountData = new Map<string, unknown>(Object.entries(options.accountData ?? {}));
    let client: MatrixClient | null = null;

    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = url.pathname;
        const body = parseBody(init);
        calls.push({ method, path, body });

        if (path === `${V3}/room_keys/version` && method === 'GET') {
            if (backupAnswer) return answerWith(backupAnswer, init);
            if (!backupVersion) {
                return jsonResponse(404, { errcode: 'M_NOT_FOUND', error: 'No backup found' });
            }
            return jsonResponse(200, {
                algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2',
                auth_data: { public_key: BACKUP_PUBLIC_KEY, signatures: {} },
                version: backupVersion,
                count: 12,
                etag: '7',
            });
        }
        if (path === `${V3}/room_keys/version` && method === 'POST') {
            backupVersion = String(nextBackupVersion);
            nextBackupVersion += 1;
            return jsonResponse(200, { version: backupVersion });
        }
        const versionPath = path.match(/^\/_matrix\/client\/v3\/room_keys\/version\/([^/]+)$/);
        if (versionPath && method === 'DELETE') {
            if (decodeURIComponent(versionPath[1]) !== backupVersion) {
                return jsonResponse(404, {
                    errcode: 'M_NOT_FOUND',
                    error: 'Unknown backup version',
                });
            }
            backupVersion = null;
            return jsonResponse(200, {});
        }
        if (path === `${V3}/keys/query` && method === 'POST') {
            if (keysQueryAnswer) return answerWith(keysQueryAnswer, init);
            return jsonResponse(200, {
                device_keys: { [ME]: {} },
                failures: {},
                master_keys: master ? { [ME]: masterKeyBody(master) } : {},
                self_signing_keys: {},
                user_signing_keys: {},
            });
        }
        if (path === `${V3}/keys/device_signing/upload` && method === 'POST') {
            const auth = (body as { auth?: { type?: string } } | undefined)?.auth;
            if (master && auth?.type !== 'm.login.password') {
                return jsonResponse(401, {
                    flows: [{ stages: ['m.login.password'] }],
                    params: {},
                    session: 'uia-session-1',
                });
            }
            const uploaded = (body as { master_key?: { keys?: Record<string, string> } })
                ?.master_key?.keys;
            master = uploaded ? Object.values(uploaded)[0] ?? 'NEW' : 'NEW';
            return jsonResponse(200, {});
        }
        if (path === `${V3}/keys/upload` && method === 'POST') {
            return jsonResponse(200, { one_time_key_counts: { signed_curve25519: 50 } });
        }
        if (path === `${V3}/keys/signatures/upload` && method === 'POST') {
            return jsonResponse(200, { failures: {} });
        }
        const accountDataPath = path.match(
            /^\/_matrix\/client\/v3\/user\/[^/]+\/account_data\/(.+)$/
        );
        if (accountDataPath) {
            const type = decodeURIComponent(accountDataPath[1]);
            if (method === 'PUT') {
                accountData.set(type, body);
                const echoTo = client;
                setTimeout(() => {
                    if (!echoTo) return;
                    const event = new MatrixEvent({ type, content: body as object });
                    echoTo.store.storeAccountDataEvents([event]);
                    echoTo.emit(ClientEvent.AccountData, event);
                }, 0);
                return jsonResponse(200, {});
            }
            if (!accountData.has(type)) {
                return jsonResponse(404, {
                    errcode: 'M_NOT_FOUND',
                    error: 'Account data not found',
                });
            }
            return jsonResponse(200, accountData.get(type));
        }
        return jsonResponse(404, { errcode: 'M_UNRECOGNIZED', error: 'Unrecognized request' });
    };

    return {
        fetchFn: fetchFn as typeof fetch,
        calls,
        attach: (mx) => {
            client = mx;
        },
        backupVersion: () => backupVersion,
        masterKey: () => master,
        accountData,
        setBackupAnswer: (answer) => {
            backupAnswer = answer;
        },
        setBackupVersion: (version) => {
            backupVersion = version;
        },
        setMasterKey: (present) => {
            master = present ? OLD_MASTER_KEY : null;
        },
        destructiveCalls: () =>
            calls.filter(
                (c) =>
                    c.method === 'DELETE' ||
                    (c.method === 'PUT' && c.path.includes('/account_data/m.')) ||
                    (c.method === 'POST' &&
                        (c.path.endsWith('/keys/device_signing/upload') ||
                            c.path.endsWith('/room_keys/version')))
            ),
    };
}

const quietLogger: Logger = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    getChild: () => quietLogger,
};

/** A real `MatrixClient` that talks only to the fake homeserver. Crypto is not started. */
export function createFakeKeyClient(server: FakeKeyHomeserver): MatrixClient {
    const mx = createClient({
        baseUrl: HS_URL,
        accessToken: 'syt_test_token',
        userId: ME,
        deviceId: DEVICE_ID,
        fetchFn: server.fetchFn,
        store: new MemoryStore(),
        cryptoCallbacks,
        logger: quietLogger,
    });
    server.attach(mx);
    return mx;
}
