/**
 * An upgrade request that no WebSocket shim takes must not be able to end the
 * process, and must get an answer.
 *
 * Node removes its own `'error'` listener from a socket before it emits
 * `upgrade`. The Twitch-IRC and OBS-WebSocket shims return without touching a
 * socket whose path is not theirs, and engine.io (the StreamElements shim)
 * ends one only from a 1,000 ms timer. Before src/webSocketUpgrades.ts, a
 * client that reset such a connection inside that second raised an unhandled
 * `'error'` event and the API exited 1: one request on `/v1/health`, with no
 * session (docs/security/dependency-advisories-2026-11-14.md).
 *
 * The in-process tests serve the real app with `serve()` and wire it with
 * `attachWebSocketShims`, the function src/index.ts calls. An unhandled
 * `'error'` would reach this process as an `uncaughtException`, which is
 * recorded below and asserted empty. The last test starts the API itself, as
 * deploy/docker/backend/bin/start-app does, and watches the process.
 */
import test, { beforeEach, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { connect, createServer as createNetServer, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { io as ioClient } from 'socket.io-client';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64')}`;

// What would have ended the process. node:test reports an uncaught exception
// too; recording it here lets each test say which request caused it.
const uncaught: unknown[] = [];
process.on('uncaughtException', (err) => {
    uncaught.push(err);
});
/** Asserts nothing was uncaught since the last call, and forgets what was. */
const assertNothingUncaught = (after: string): void => {
    assert.deepEqual(uncaught.splice(0).map(String), [], `uncaught after ${after}`);
};
// One test's failure is not the next one's.
beforeEach(() => {
    uncaught.length = 0;
});

/** The guard's answer, byte for byte. */
const GUARD_404 = 'HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
/** The OBS shim's own answer to an unknown password id (obs-ws-compat/server.ts). */
const OBS_SHIM_404 = 'HTTP/1.1 404 Not Found\r\n\r\n';

/** A client's handshake nonce: 16 random bytes, as RFC 6455 asks for. */
const handshakeNonce = randomBytes(16).toString('base64');

const upgradeRequest = (target: string, extraHeaders: string[] = []): string =>
    [
        `GET ${target} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${handshakeNonce}`,
        'Sec-WebSocket-Version: 13',
        ...extraHeaders,
        '',
        '',
    ].join('\r\n');

interface Exchange {
    /** Everything the server sent before the connection ended. */
    received: string;
    /** True when the server closed the connection before the client reset it. */
    serverClosedFirst: boolean;
}

/**
 * One raw request on its own connection. With `resetAfterMs`, the client
 * resets the connection (an RST, `resetAndDestroy()`) that long after writing
 * the request, unless the server has closed it by then. With
 * `resetAfterHeaders`, it resets as soon as a full response head has arrived,
 * for the answers that keep the connection open (101).
 */
const exchange = (
    port: number,
    request: string,
    options: { resetAfterMs?: number; resetAfterHeaders?: boolean } = {}
): Promise<Exchange> =>
    new Promise((resolve, reject) => {
        let received = '';
        let settled = false;
        let resetTimer: NodeJS.Timeout | undefined;
        const finish = (serverClosedFirst: boolean): void => {
            if (settled) return;
            settled = true;
            clearTimeout(resetTimer);
            clearTimeout(giveUp);
            resolve({ received, serverClosedFirst });
        };
        const socket = connect(port, '127.0.0.1', () => {
            socket.write(request);
            if (options.resetAfterMs === undefined) return;
            resetTimer = setTimeout(() => {
                socket.resetAndDestroy();
                finish(false);
            }, options.resetAfterMs);
        });
        const giveUp = setTimeout(() => {
            socket.destroy();
            reject(
                new Error(`connection still open after 5 s; received ${JSON.stringify(received)}`)
            );
        }, 5_000);
        socket.on('data', (chunk: Buffer) => {
            received += chunk.toString('latin1');
            if (options.resetAfterHeaders && received.includes('\r\n\r\n')) {
                socket.resetAndDestroy();
                finish(false);
            }
        });
        socket.on('error', () => undefined);
        socket.on('close', () => finish(true));
    });

const statusLine = (received: string): string => received.split('\r\n')[0];

/** A plain request through the Hono app, on a connection of its own. */
const healthStatusLine = async (port: number): Promise<string> =>
    statusLine(
        (
            await exchange(
                port,
                'GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
            )
        ).received
    );

const unclaimedTotal = async (): Promise<number> => {
    const { registry } = await import('../src/telemetry/metrics');
    const match = /^http_upgrades_unclaimed_total (\d+)$/m.exec(registry.expose());
    assert.ok(match, 'http_upgrades_unclaimed_total is exposed');
    return Number(match[1]);
};

const waitFor = async (
    what: string,
    condition: () => Promise<boolean> | boolean
): Promise<void> => {
    const deadline = Date.now() + 5_000;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await sleep(10);
    }
};

/** The logger writes info lines through console.info; collect the guard's. */
const captureGuardLines = (
    t: TestContext
): { parsed: Record<string, unknown>[]; raw: string[] } => {
    const captured = { parsed: [] as Record<string, unknown>[], raw: [] as string[] };
    const original = console.info;
    console.info = (...args: unknown[]): void => {
        const line = String(args[0]);
        if (!line.includes('http_upgrade_unclaimed')) {
            original(...args);
            return;
        }
        captured.raw.push(line);
        captured.parsed.push(JSON.parse(line) as Record<string, unknown>);
    };
    t.after(() => {
        console.info = original;
    });
    return captured;
};

/**
 * Destroys every connection the server still holds when the test ends, then
 * closes it. `closeAllConnections()` does not reach an upgraded socket, and a
 * failing test must not leave `close()` waiting on one.
 */
const closeWhenDone = (t: TestContext, server: HttpServer): void => {
    const sockets = new Set<Socket>();
    server.on('connection', (socket: Socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });
    t.after(async () => {
        for (const socket of sockets) socket.destroy();
        if (!server.listening) return;
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
};

/**
 * The real app behind `serve()`, wired the way src/index.ts wires it: the
 * guard and the three shims through `attachWebSocketShims`.
 */
const startWiredApi = async (
    t: TestContext
): Promise<{ server: HttpServer; port: number; listenersWhenCallReturned: unknown[] }> => {
    const { default: app } = await import('../src/index');
    const { serve } = await import('@hono/node-server');
    const { attachWebSocketShims } = await import('../src/webSocketUpgrades');
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as HttpServer;
    let detach: () => void = () => undefined;
    t.after(() => detach());
    closeWhenDone(t, server);
    const attached = attachWebSocketShims(server);
    const listenersWhenCallReturned = server.listeners('upgrade').slice();
    detach = await attached;
    if (!server.listening) await once(server, 'listening');
    return { server, port: (server.address() as AddressInfo).port, listenersWhenCallReturned };
};

const UNCLAIMED_PATHS = [
    '/v1/health',
    '/v1/anything',
    '/obs-ws-nope',
    '/twitch-irc/x',
    '/se-overlay',
    '/',
];

test('wiring: the guard is attached before the call returns and stays first of four upgrade listeners; nothing listens for connect or clientError', async (t) => {
    const { server, listenersWhenCallReturned } = await startWiredApi(t);
    // In place synchronously, ahead of any shim's dynamic import.
    assert.equal(listenersWhenCallReturned.length, 1);
    assert.equal(server.listenerCount('upgrade'), 4);
    assert.equal(server.listeners('upgrade')[0], listenersWhenCallReturned[0]);
    // With no `connect` listener Node closes a CONNECT request itself, and with
    // no `clientError` listener it answers 400 and destroys the socket.
    assert.equal(server.listenerCount('connect'), 0);
    assert.equal(server.listenerCount('clientError'), 0);
});

test('an upgrade no shim takes, reset by the client after 0, 20, 200 and 900 ms: no unhandled error, and the API keeps answering', async (t) => {
    const { port } = await startWiredApi(t);
    const before = await unclaimedTotal();
    let sent = 0;
    for (const path of UNCLAIMED_PATHS) {
        for (const resetAfterMs of path === '/v1/health' ? [0, 20, 200, 900] : [20]) {
            const what = `${path} reset after ${resetAfterMs} ms`;
            await exchange(port, upgradeRequest(path), { resetAfterMs });
            sent += 1;
            assert.equal(await healthStatusLine(port), 'HTTP/1.1 200 OK', what);
            await sleep(20);
            assertNothingUncaught(what);
        }
    }
    // Every one of them reached the guard and no shim took it, the reset at
    // 0 ms included: the loop exercised the path under test, not requests that
    // never arrived.
    await waitFor(
        `${sent} unclaimed upgrades to be counted`,
        async () => (await unclaimedTotal()) === before + sent
    );
    await sleep(50);
    assertNothingUncaught('all of them');
    assert.equal(await unclaimedTotal(), before + sent);
});

test('an upgrade no shim takes is answered 404 and closed by the guard, counted, and logged without its query, headers or the rest of its path', async (t) => {
    const { port } = await startWiredApi(t);
    const lines = captureGuardLines(t);
    const before = await unclaimedTotal();

    const { received, serverClosedFirst } = await exchange(
        port,
        upgradeRequest('/v1/invite-preview/PATHMARKER?token=QUERYMARKER', [
            'Authorization: Bearer HEADERMARKER',
            'Cookie: session=COOKIEMARKER',
        ])
    );
    // The guard got there first: engine.io's timer ends an upgrade it does not
    // know after 1,000 ms without writing a byte.
    assert.equal(received, GUARD_404);
    assert.equal(serverClosedFirst, true);
    assert.equal(await unclaimedTotal(), before + 1);

    assert.equal(lines.parsed.length, 1);
    const { ts, ...line } = lines.parsed[0];
    assert.equal(typeof ts, 'string');
    assert.deepEqual(line, {
        level: 'info',
        msg: 'http_upgrade_unclaimed',
        firstSegment: '/v1',
        answered: true,
        count: 1,
    });
    for (const marker of [
        'PATHMARKER',
        'QUERYMARKER',
        'HEADERMARKER',
        'COOKIEMARKER',
        'invite-preview',
    ]) {
        assert.equal(lines.raw[0].includes(marker), false, marker);
    }

    // A first segment that is long, or not plain lower-case, is not logged.
    const { firstSegment } = await import('../src/webSocketUpgrades').then((m) => m.__test__);
    assert.equal(firstSegment('/v1/health?x=1'), '/v1');
    assert.equal(firstSegment('/socket.io/?EIO=4'), '/socket.io');
    assert.equal(firstSegment('/'), '/');
    assert.equal(firstSegment('/?token=abc'), '/');
    assert.equal(firstSegment('/eyJhbGciOiJIUzI1NiJ9'), '(other)');
    assert.equal(firstSegment(`/${'a'.repeat(25)}`), '(other)');
    assert.equal(firstSegment('*'), '(other)');
    assert.equal(firstSegment(undefined), '(other)');
    assertNothingUncaught('the 404');
});

test('a burst of unclaimed upgrades is counted one by one and logged once per interval, with the number since the last line', async (t) => {
    const { port } = await startWiredApi(t);
    const lines = captureGuardLines(t);
    const before = await unclaimedTotal();
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });

    for (let i = 0; i < 5; i += 1) {
        assert.equal((await exchange(port, upgradeRequest('/v1/health'))).received, GUARD_404);
    }
    assert.equal(await unclaimedTotal(), before + 5);
    assert.deepEqual(
        lines.parsed.map((line) => line.count),
        [1],
        'the first is logged, the next four are not'
    );

    t.mock.timers.tick(9_999);
    assert.equal((await exchange(port, upgradeRequest('/v1/health'))).received, GUARD_404);
    assert.equal(lines.parsed.length, 1, 'still inside the interval');

    t.mock.timers.tick(1);
    assert.equal((await exchange(port, upgradeRequest('/api/x'))).received, GUARD_404);
    assert.equal(await unclaimedTotal(), before + 7);
    assert.deepEqual(
        lines.parsed.map((line) => [line.firstSegment, line.count]),
        [
            ['/v1', 1],
            ['/api', 6],
        ]
    );
});

test('the paths the shims take still upgrade, or fail the way they did, and none is counted as unclaimed', async (t) => {
    const { port } = await startWiredApi(t);
    const before = await unclaimedTotal();

    // Twitch IRC: ws completes the handshake.
    const irc = await exchange(port, upgradeRequest('/twitch-irc'), { resetAfterHeaders: true });
    assert.equal(statusLine(irc.received), 'HTTP/1.1 101 Switching Protocols');
    // ...and refuses a handshake with no key itself, with its own 400.
    const ircBad = await exchange(
        port,
        'GET /twitch-irc HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
    );
    assert.equal(statusLine(ircBad.received), 'HTTP/1.1 400 Bad Request');
    assert.match(ircBad.received, /Missing or invalid Sec-WebSocket-Key header$/);

    // OBS-WebSocket: an active password id upgrades and gets the Hello frame's
    // connection; an unknown id gets the shim's 404; no id is closed unanswered.
    const secretBox = await import('../src/services/secretBox');
    secretBox.clearSecretBoxConfigCache();
    const passwords = await import('../src/services/obsWsPasswords');
    const minted = passwords.mint({ blackoutUserId: randomUUID() });
    assert.equal(minted.kind, 'ok');
    const passwordId = minted.kind === 'ok' ? minted.record.id : '';
    const obs = await exchange(port, upgradeRequest(`/obs-ws/${passwordId}`), {
        resetAfterHeaders: true,
    });
    assert.equal(statusLine(obs.received), 'HTTP/1.1 101 Switching Protocols');
    const obsUnknown = await exchange(port, upgradeRequest('/obs-ws/no-such-id'));
    assert.deepEqual(obsUnknown, { received: OBS_SHIM_404, serverClosedFirst: true });
    const obsNoId = await exchange(port, upgradeRequest('/obs-ws/'));
    assert.deepEqual(obsNoId, { received: '', serverClosedFirst: true });

    // StreamElements: engine.io completes the WebSocket handshake, refuses a
    // transport it does not serve with its own 400, and a socket.io client
    // gets all the way to `connect`.
    const se = await exchange(port, upgradeRequest('/se-overlay/?EIO=4&transport=websocket'), {
        resetAfterHeaders: true,
    });
    assert.equal(statusLine(se.received), 'HTTP/1.1 101 Switching Protocols');
    const seBad = await exchange(port, upgradeRequest('/se-overlay/?EIO=4&transport=polling'));
    assert.equal(statusLine(seBad.received), 'HTTP/1.1 400 Bad Request');
    assert.match(seBad.received, /Transport unknown$/);
    const client = ioClient(`http://127.0.0.1:${port}`, {
        path: '/se-overlay/',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
    });
    try {
        await new Promise<void>((resolve, reject) => {
            client.once('connect', () => resolve());
            client.once('connect_error', (err: Error) => reject(err));
        });
        assert.equal(client.connected, true);
    } finally {
        client.close();
    }

    await sleep(50);
    assert.equal(await unclaimedTotal(), before, 'none of these reached the guard as unclaimed');
    assert.equal(await healthStatusLine(port), 'HTTP/1.1 200 OK');
    assertNothingUncaught('the claimed paths');
});

test('an upgrade that is not for WebSocket (h2c) on an API path gets the same 404', async (t) => {
    const { port } = await startWiredApi(t);
    const { received } = await exchange(
        port,
        'GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade, HTTP2-Settings\r\nUpgrade: h2c\r\nHTTP2-Settings: AAMAAABkAAQCAAAAAAIAAAAA\r\n\r\n'
    );
    assert.equal(received, GUARD_404);
    assertNothingUncaught('the h2c upgrade');
});

test('CONNECT and a malformed request keep Node defaults: closed, or 400, and a reset is harmless', async (t) => {
    const { port } = await startWiredApi(t);
    const connectRequest = 'CONNECT example.org:443 HTTP/1.1\r\nHost: example.org:443\r\n\r\n';
    assert.deepEqual(await exchange(port, connectRequest), {
        received: '',
        serverClosedFirst: true,
    });
    await exchange(port, connectRequest, { resetAfterMs: 0 });

    const malformed = await exchange(port, 'GET / HTTP/1.1\r\nBad Header\r\n\r\n');
    assert.equal(statusLine(malformed.received), 'HTTP/1.1 400 Bad Request');
    assert.equal(malformed.serverClosedFirst, true);
    await exchange(port, 'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n', { resetAfterMs: 20 });

    await sleep(50);
    assert.equal(await healthStatusLine(port), 'HTTP/1.1 200 OK');
    assertNothingUncaught('CONNECT and the malformed requests');
});

/** A plain http.Server with the guard and whatever else a test attaches. */
const startPlainServer = async (
    t: TestContext,
    attach: (server: HttpServer) => Promise<void> | void
): Promise<{ server: HttpServer; port: number }> => {
    const server = createServer((_req, res) => {
        res.end('plain');
    });
    closeWhenDone(t, server);
    await attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { server, port: (server.address() as AddressInfo).port };
};

test('the guard does not depend on which shims are attached, or on being attached before them', async (t) => {
    const { guardUpgradedSockets } = await import('../src/webSocketUpgrades');
    const { attachTwitchIrcShim } = await import('../src/integrations/twitch-compat/ircServer');
    const { attachObsWsShim } = await import('../src/integrations/obs-ws-compat/server');

    // Alone: with no shim at all, every upgrade is unclaimed.
    const alone = await startPlainServer(t, (server) => {
        guardUpgradedSockets(server);
    });
    assert.equal((await exchange(alone.port, upgradeRequest('/twitch-irc'))).received, GUARD_404);
    await exchange(alone.port, upgradeRequest('/v1/health'), { resetAfterMs: 0 });

    // Attached last, after the two ws shims (which never end a socket they do
    // not take) and a listener that only looks: the guard still runs first, so
    // that listener finds the error listener already there, and the socket is
    // closed instead of held open.
    const errorListenersSeenByAnEarlierListener: number[] = [];
    let attachedBeforeGuard: unknown[] = [];
    const late = await startPlainServer(t, (server) => {
        server.on('upgrade', (_req: IncomingMessage, socket: Duplex) => {
            errorListenersSeenByAnEarlierListener.push(socket.listenerCount('error'));
        });
        attachTwitchIrcShim(server);
        attachObsWsShim(server);
        attachedBeforeGuard = server.listeners('upgrade').slice();
        guardUpgradedSockets(server);
    });
    assert.equal(attachedBeforeGuard.length, 3);
    assert.deepEqual(late.server.listeners('upgrade').slice(1), attachedBeforeGuard);
    for (const resetAfterMs of [0, 20, 200, 900]) {
        await exchange(late.port, upgradeRequest('/v1/health'), { resetAfterMs });
    }
    assert.equal((await exchange(late.port, upgradeRequest('/v1/health'))).received, GUARD_404);
    assert.deepEqual(errorListenersSeenByAnEarlierListener, [1, 1, 1, 1, 1]);
    const irc = await exchange(late.port, upgradeRequest('/twitch-irc'), {
        resetAfterHeaders: true,
    });
    assert.equal(statusLine(irc.received), 'HTTP/1.1 101 Switching Protocols');

    await sleep(50);
    assertNothingUncaught('the guard alone and the guard attached last');
});

test('what counts as taking a socket: an error listener of its own, an answer, an end', async (t) => {
    const { guardUpgradedSockets } = await import('../src/webSocketUpgrades');
    const before = await unclaimedTotal();
    const lateAnswer = 'HTTP/1.1 418 Late\r\nContent-Length: 0\r\n\r\n';
    const firstHalf = 'HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nab';
    const { port } = await startPlainServer(t, (server) => {
        guardUpgradedSockets(server);
        server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
            if (req.url === '/slow') {
                // Waits before it answers: its own error listener is the claim.
                socket.on('error', () => undefined);
                setTimeout(() => socket.end(lateAnswer), 100);
            }
            // Answered in part, the rest later.
            if (req.url === '/wrote') {
                socket.write(firstHalf);
                setTimeout(() => socket.end('cd'), 100);
            }
            // Ended with nothing written.
            if (req.url === '/ended') socket.end();
        });
    });
    assert.equal((await exchange(port, upgradeRequest('/slow'))).received, lateAnswer);
    assert.equal((await exchange(port, upgradeRequest('/wrote'))).received, `${firstHalf}cd`);
    assert.deepEqual(await exchange(port, upgradeRequest('/ended')), {
        received: '',
        serverClosedFirst: true,
    });
    await sleep(20);
    assert.equal(await unclaimedTotal(), before, 'the guard left all three alone');
    assert.equal((await exchange(port, upgradeRequest('/other'))).received, GUARD_404);
    assert.equal(await unclaimedTotal(), before + 1);
    assertNothingUncaught('the three ways of taking a socket');
});

test('every upgraded socket has an error listener when the other listeners get it, and one that errors before the guard looks is counted, not answered', async (t) => {
    const { guardUpgradedSockets } = await import('../src/webSocketUpgrades');
    const lines = captureGuardLines(t);
    const before = await unclaimedTotal();
    const errorListenersAtHandOff: number[] = [];
    const { port } = await startPlainServer(t, (server) => {
        guardUpgradedSockets(server);
        server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
            errorListenersAtHandOff.push(socket.listenerCount('error'));
            // What Node does when the client's reset is read: before the guard
            // has looked, and with no shim having taken the socket.
            if (req.url === '/reset-read-first') {
                socket.destroy(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
            }
        });
    });
    assert.deepEqual(await exchange(port, upgradeRequest('/reset-read-first')), {
        received: '',
        serverClosedFirst: true,
    });
    assert.equal((await exchange(port, upgradeRequest('/v1/health'))).received, GUARD_404);
    await sleep(20);
    assert.deepEqual(errorListenersAtHandOff, [1, 1]);
    assertNothingUncaught('a socket destroyed with an error');
    assert.equal(await unclaimedTotal(), before + 2);
    const { ts: _ts, ...first } = lines.parsed[0];
    assert.deepEqual(first, {
        level: 'info',
        msg: 'http_upgrade_unclaimed',
        firstSegment: '/reset-read-first',
        answered: false,
        count: 1,
    });
});

test('the 404 closes the connection even when the client keeps its side open', async (t) => {
    const { server, port } = await startWiredApi(t);
    const connections = (): Promise<number> =>
        new Promise((resolve, reject) =>
            server.getConnections((err, count) => (err ? reject(err) : resolve(count)))
        );
    assert.equal(await connections(), 0);
    // Half-open on purpose: reads the answer and the server's FIN, never ends.
    const client = connect({ port, host: '127.0.0.1', allowHalfOpen: true });
    t.after(() => client.destroy());
    let received = '';
    client.on('data', (chunk: Buffer) => {
        received += chunk.toString('latin1');
    });
    client.on('error', () => undefined);
    await once(client, 'connect');
    client.write(upgradeRequest('/v1/health'));
    await once(client, 'end');
    assert.equal(received, GUARD_404);
    assert.equal(client.destroyed, false, 'the client has not closed its side');
    await waitFor('the server to have no connection left', async () => (await connections()) === 0);
    assertNothingUncaught('the half-open client');
});

/** A port nothing listens on right now (the API's env check refuses PORT=0). */
const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = createNetServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as AddressInfo;
            probe.close(() => resolve(port));
        });
    });

test(
    'the API process, started as start-app starts it, survives unclaimed upgrades reset after 0, 20, 200 and 900 ms',
    { timeout: 120_000 },
    async (t) => {
        const port = await freePort();
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            // Not `test`, or the API does not listen (src/index.ts shouldListen).
            NODE_ENV: 'development',
            BLACKOUT_DB_MODE: 'memory',
            PORT: String(port),
            BLACKOUT_BACKGROUND_WORKERS_DISABLED: '1',
            JWT_SECRET_PRIMARY: generateTestJwtSecret(),
        };
        for (const key of [
            'BLACKOUT_API_SKIP_LISTEN',
            'APP_PORT',
            'DATABASE_URL',
            'DB_HOST',
            'REDIS_URL',
            'CACHE_PASSWORD',
            'CACHE_PASSWORD_FILE',
        ]) {
            delete env[key];
        }

        // start-app's last line, from the directory it changes to.
        const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
            cwd: fileURLToPath(new URL('../', import.meta.url)),
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => {
            child.kill('SIGKILL');
        });

        const output: string[] = [];
        const messages = new Set<string>();
        const wanted = [
            'blackout-server listening',
            'twitch_irc_shim_attached',
            'obs_ws_shim_attached',
            'se_overlay_shim_attached',
        ];
        let onReady: () => void = () => undefined;
        const ready = new Promise<void>((resolve) => {
            onReady = resolve;
        });
        let partial = '';
        const consume = (chunk: Buffer): void => {
            partial += chunk.toString('utf8');
            const lines = partial.split('\n');
            partial = lines.pop() ?? '';
            for (const line of lines) {
                output.push(line);
                if (!line.startsWith('{')) continue;
                try {
                    const { msg } = JSON.parse(line) as { msg?: string };
                    if (msg) messages.add(msg);
                } catch {
                    continue;
                }
                if (wanted.every((msg) => messages.has(msg))) onReady();
            }
        };
        child.stdout.on('data', consume);
        child.stderr.on('data', consume);
        let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
        const exited = new Promise<void>((resolve) =>
            child.once('exit', (code, signal) => {
                exit = { code, signal };
                resolve();
            })
        );

        let startTimer: NodeJS.Timeout | undefined;
        await Promise.race([
            ready,
            exited.then(() => {
                throw new Error(
                    `the API exited (${JSON.stringify(exit)}) before it was ready:\n${output.join(
                        '\n'
                    )}`
                );
            }),
            new Promise<never>((_, reject) => {
                startTimer = setTimeout(
                    () =>
                        reject(
                            new Error(`the API was not ready within 90 s:\n${output.join('\n')}`)
                        ),
                    90_000
                );
            }),
        ]).finally(() => clearTimeout(startTimer));

        for (const resetAfterMs of [0, 20, 200, 900]) {
            await exchange(port, upgradeRequest('/v1/health'), { resetAfterMs });
            // Long enough for the process to die of it, were it going to.
            await Promise.race([exited, sleep(300)]);
            assert.equal(
                exit,
                undefined,
                `the API exited after a reset at ${resetAfterMs} ms:\n${output
                    .slice(-25)
                    .join('\n')}`
            );
            assert.equal(await healthStatusLine(port), 'HTTP/1.1 200 OK');
        }
        assert.equal((await exchange(port, upgradeRequest('/v1/health'))).received, GUARD_404);
        assert.equal(messages.has('http_upgrade_unclaimed'), true);
        assert.equal(
            output.some((line) => line.includes("Unhandled 'error' event")),
            false
        );
    }
);
